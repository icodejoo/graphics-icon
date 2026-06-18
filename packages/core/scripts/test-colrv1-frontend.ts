import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import opentype from 'opentype.js'

import { buildColrv1 } from '../src/colrv1/build-colrv1.ts'
import { resolveOptions } from '../src/options.ts'
import { detectColor } from '../src/pipeline/detect-color.ts'
import { loadIcons } from '../src/pipeline/load-icons.ts'
import { normalizeSvg } from '../src/pipeline/normalize-svg.ts'
import { getSvgInner, parseSvg } from '../src/util/svg.ts'

import type { Colrv1IconInput } from '../src/colrv1/build-colrv1.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = resolve(here, '../fixtures')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
}

const o = resolveOptions({ input: fixtures, outDir: resolve(here, '../.c1-out'), fontName: 'C1', colorFormat: 'colrv1', formats: ['woff2'] })
const icons = await loadIcons(o.input)

const inputs: Colrv1IconInput[] = icons.map((ic, i) => {
  const norm = normalizeSvg(ic.svg)
  const { viewBox, paths } = parseSvg(norm)
  const plan = detectColor(paths)
  return {
    name: ic.name,
    codepoint: 0xe000 + i,
    viewBox,
    allDs: plan.allDs,
    layers: plan.layers,
    inner: getSvgInner(norm),
    needsColor: plan.multicolor || plan.hasGradient,
  }
})

const { baseSfnt, doc } = buildColrv1(inputs, o)

// 名称 → baseGlyphId(用于在 doc 里定位)
const baseIdByName = new Map<string, number>()
{
  let gid = 1
  for (const ic of inputs) baseIdByName.set(ic.name, gid++)
}

console.log('=== COLRv1 frontend ===')
console.log('palette:', doc.palette.join(', '))
console.log('colorGlyphs:', doc.colorGlyphs.length)

// 应有 2 个彩色字形:logo-color(多色) + badge-grad(渐变)
assert(doc.colorGlyphs.length === 2, `colorGlyphs 应 2,实为 ${doc.colorGlyphs.length}`)

const byBase = (name: string) => doc.colorGlyphs.find((c) => c.baseGlyphId === baseIdByName.get(name))

// logo-color:2 个纯色层
const logo = byBase('logo-color')
assert(logo, 'logo-color 在 colorGlyphs 中')
assert(logo!.layers.length === 2, 'logo-color 2 层')
for (const ly of logo!.layers) {
  assert(ly.paint.kind === 'solid', 'logo-color 层应为 solid')
  if (ly.paint.kind === 'solid') assert(ly.paint.paletteIndex >= 0 && ly.paint.paletteIndex < doc.palette.length, 'solid paletteIndex 有效')
}
console.log('logo-color layers:', logo!.layers.map((l) => (l.paint.kind === 'solid' ? `solid#${doc.palette[l.paint.paletteIndex]}` : l.paint.kind)).join(', '))

// badge-grad:1 个线性渐变层,2 个 stop,p2 ⟂ (p1-p0) 且等长
const badge = byBase('badge-grad')
assert(badge, 'badge-grad 在 colorGlyphs 中')
assert(badge!.layers.length === 1, 'badge-grad 1 层')
const paint = badge!.layers[0].paint
assert(paint.kind === 'linear', `badge-grad 应为 linear,实为 ${paint.kind}`)
if (paint.kind === 'linear') {
  assert(paint.stops.length === 2, `应 2 个 stop,实为 ${paint.stops.length}`)
  const v1 = [paint.p1[0] - paint.p0[0], paint.p1[1] - paint.p0[1]]
  const v2 = [paint.p2[0] - paint.p0[0], paint.p2[1] - paint.p0[1]]
  const dot = v1[0] * v2[0] + v1[1] * v2[1]
  const len1 = Math.hypot(v1[0], v1[1])
  const len2 = Math.hypot(v2[0], v2[1])
  assert(Math.abs(dot) < 1e-6, `p2 应垂直于 p1-p0(dot=${dot})`)
  assert(Math.abs(len1 - len2) < 1e-6, `|p2-p0| 应等于 |p1-p0|(${len1} vs ${len2})`)
  console.log('badge-grad linear: p0=' + JSON.stringify(paint.p0) + ' p1=' + JSON.stringify(paint.p1) + ' p2=' + JSON.stringify(paint.p2))
  console.log('  stops:', paint.stops.map((s) => `${s.offset}→#${doc.palette[s.paletteIndex]}@${s.alpha.toFixed(2)}`).join(', '))
}

// palette 应含 logo 两色 + badge 两个渐变 stop 色 = 4
assert(doc.palette.includes('#e53935') && doc.palette.includes('#1e88e5'), 'palette 含 logo 红/蓝')
assert(doc.palette.includes('#ffb300') && doc.palette.includes('#f4511e'), 'palette 含 badge 渐变两色')

// base SFNT:可解析,字形数 = 1 notdef + 5 base + 3 层(logo2 + badge1)= 9,base 有 unicode、层无
const font = opentype.parse(baseSfnt.buffer.slice(baseSfnt.byteOffset, baseSfnt.byteOffset + baseSfnt.byteLength))
console.log('base SFNT glyphs:', font.glyphs.length)
assert(font.glyphs.length === 9, `base 字形数应 9,实为 ${font.glyphs.length}`)
let withUnicode = 0
let layerGlyphs = 0
for (let i = 0; i < font.glyphs.length; i++) {
  const g = font.glyphs.get(i)
  if (g.unicode) withUnicode++
  if (/\.l\d+$/.test(g.name)) {
    layerGlyphs++
    assert(!g.unicode, `层字形 ${g.name} 不应有 unicode`)
  }
}
assert(withUnicode === 5, `应 5 个带 unicode 的 base 字形,实为 ${withUnicode}`)
assert(layerGlyphs === 3, `应 3 个层字形,实为 ${layerGlyphs}`)

console.log('\n✅ COLRv1 FRONTEND OK (paint 树 + 渐变 p2 垂直 + 调色板 + base SFNT 布局)')
