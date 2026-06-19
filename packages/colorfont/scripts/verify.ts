import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import opentype from 'opentype.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../.smoke-out')
const files = readdirSync(outDir)

function loadTtf(token: string): InstanceType<typeof opentype.Font> {
  const name = files.find((f) => f.includes(`.${token}.`) && f.endsWith('.ttf'))
  if (!name) throw new Error(`找不到 ${token} 的 ttf — 先跑 smoke`)
  const buf = readFileSync(resolve(outDir, name))
  console.log(`[${token}] file:`, name)
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

function decode(v: unknown): string {
  return typeof v === 'string' ? v : new TextDecoder().decode(v as Uint8Array)
}

let ok = true
const fail = (m: string) => {
  ok = false
  console.log('  ❌', m)
}

// --- mono:所有带 unicode 的字形轮廓非空 ---
const mono = loadTtf('mono')
console.log('[mono] unitsPerEm:', mono.unitsPerEm, 'asc:', mono.ascender, 'desc:', mono.descender)
let monoGlyphCount = 0
for (let i = 0; i < mono.glyphs.length; i++) {
  const g = mono.glyphs.get(i)
  if (!g.unicode) continue
  monoGlyphCount++
  const cmds = g.path.commands.length
  const bb = g.getBoundingBox()
  console.log(`  U+${g.unicode.toString(16)} ${g.name} cmds=${cmds} bbox=[${bb.x1.toFixed(0)},${bb.y1.toFixed(0)},${bb.x2.toFixed(0)},${bb.y2.toFixed(0)}]`)
  if (cmds < 2) fail(`${g.name} 轮廓为空`)
}
if (monoGlyphCount !== 5) fail(`mono 应有 5 个带 unicode 字形,实为 ${monoGlyphCount}`)

// --- colrv0:COLR + CPAL ---
const colr = loadTtf('colrv0')
const colrTable = colr.tables.colr
const cpalTable = colr.tables.cpal
if (!colrTable || !cpalTable) fail('colrv0 缺 COLR/CPAL')
else {
  console.log('[colrv0] baseGlyphRecords:', JSON.stringify(colrTable.baseGlyphRecords), 'CPAL entries:', cpalTable.numPaletteEntries)
  if (colrTable.baseGlyphRecords.length !== 1) fail(`应只有 logo-color 一个 COLR base,实为 ${colrTable.baseGlyphRecords.length}`)
  else {
    const base = colrTable.baseGlyphRecords[0]
    if (base.numLayers !== 2) fail(`logo-color 应 2 层,实为 ${base.numLayers}`)
    const layers = colr.layers.get(base.glyphID)
    console.log('[colrv0] layers:', layers.map((l: { glyph: { name: string }; paletteIndex: number }) => `${l.glyph.name}@pal${l.paletteIndex}`).join(', '))
  }
  if (cpalTable.numPaletteEntries !== 2) fail(`CPAL 应 2 色,实为 ${cpalTable.numPaletteEntries}`)
}

// --- otsvg:'SVG ' 表,2 条文档(logo-color + badge-grad),含 glyph id,且至少一条带渐变 ---
const otsvg = loadTtf('otsvg')
const svgT = otsvg.tables.svg
const isMap = svgT instanceof Map
console.log('[otsvg] has SVG table:', isMap, 'entries:', isMap ? svgT.size : 0)
if (!isMap || svgT.size !== 2) fail(`otsvg SVG 表应 2 条,实为 ${isMap ? svgT.size : 'none'}`)
else {
  let foundGradient = false
  for (const [gid, v] of svgT) {
    const doc = decode(v)
    if (!doc.includes(`glyph${gid}`)) fail(`SVG 文档缺 id="glyph${gid}"`)
    if (/[Gg]radient/.test(doc)) foundGradient = true
    console.log(`  gid ${gid}: ${doc.includes('Gradient') ? 'gradient' : 'solid'} (${doc.length} B)`)
  }
  if (!foundGradient) fail('badge-grad 的渐变未保留在 OT-SVG 文档中')
}

console.log(ok ? '\n✅ VERIFY OK (mono + colrv0 COLR/CPAL + otsvg SVG table)' : '\n❌ VERIFY FAILED')
if (!ok) process.exit(1)
