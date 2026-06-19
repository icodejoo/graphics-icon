import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import opentype from 'opentype.js'

import { buildColrv1 } from '../src/colrv1/build-colrv1.ts'
import { resolveOptions } from '../src/options.ts'
import { loadIcons } from '../src/pipeline/load-icons.ts'
import { prepareOne } from '../src/pipeline/prepare-core.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = resolve(here, '../fixtures')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
}

const o = resolveOptions({ input: fixtures, outDir: resolve(here, '../.c1-out'), fontName: 'C1', colorFormat: 'colrv1', formats: ['woff2'] })
const icons = await loadIcons(o.input)

const inputs = icons.map((ic, i) => prepareOne({ name: ic.name, svg: ic.svg, codepoint: 0xe000 + i }, o))

const { baseSfnt, doc } = buildColrv1(inputs, o)

// 解析 base 字体;名称 → baseGlyphId 经 cmap(码位 0xE000+i)取真实 gid。
// 注意:glyf 引擎「层字形优先 + svg2ttf 去重」使 gid 不再是输入顺序的 1..5,必须经 cmap 解析。
const font = opentype.parse(baseSfnt.buffer.slice(baseSfnt.byteOffset, baseSfnt.byteOffset + baseSfnt.byteLength))
const baseIdByName = new Map<string, number>()
inputs.forEach((ic, i) => baseIdByName.set(ic.name, font.charToGlyphIndex(String.fromCodePoint(0xe000 + i))))

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

// base SFNT 布局(glyf 引擎:层字形优先 + svg2ttf 去重 → 比 CFF 更紧凑):
//  - 5 个码位都必须映射到有效 gid(cmap 完整);
//  - doc 里所有层 glyphId 必须有效且共 3 个(logo2 + badge1);
//  - 因去重(层轮廓 == base silhouette 时合并为同一 gid),字形总数可能 < 9,
//    且某个 .l 层字形可能借合并带上 base 的 unicode —— 均为正确行为(渲染无碍)。
console.log('base SFNT glyphs:', font.glyphs.length)
for (let i = 0; i < inputs.length; i++) {
  const gid = font.charToGlyphIndex(String.fromCodePoint(0xe000 + i))
  assert(gid > 0, `${inputs[i].name}(U+${(0xe000 + i).toString(16)})应映射到有效 gid`)
}
let layerRefs = 0
for (const cg of doc.colorGlyphs) {
  for (const ly of cg.layers) {
    assert(ly.glyphId > 0 && ly.glyphId < font.glyphs.length, `层 glyphId ${ly.glyphId} 应有效`)
    layerRefs++
  }
}
assert(layerRefs === 3, `colorGlyphs 应共引用 3 个层(logo2 + badge1),实为 ${layerRefs}`)

console.log('\n✅ COLRv1 FRONTEND OK (paint 树 + 渐变 p2 垂直 + 调色板 + base SFNT 布局)')
