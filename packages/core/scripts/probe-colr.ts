// 探针:确认 opentype.js 2.0 能产出可回读的 COLRv0(COLR + CPAL)字体。
import opentype from 'opentype.js'

function square(x: number, y: number, w: number, h: number): InstanceType<typeof opentype.Path> {
  const p = new opentype.Path()
  p.moveTo(x, y)
  p.lineTo(x + w, y)
  p.lineTo(x + w, y + h)
  p.lineTo(x, y + h)
  p.close()
  return p
}

const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 1000, path: new opentype.Path() })
const base = new opentype.Glyph({ name: 'A', unicode: 0x41, advanceWidth: 1000, path: square(100, 0, 600, 600) })
const l0 = new opentype.Glyph({ name: 'A.l0', advanceWidth: 1000, path: square(100, 0, 600, 600) })
const l1 = new opentype.Glyph({ name: 'A.l1', advanceWidth: 1000, path: square(250, 150, 300, 300) })

const glyphs = [notdef, base, l0, l1] // indices 0,1,2,3
const font = new opentype.Font({
  familyName: 'ProbeColr',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs,
})

// CPAL: 一个调色板,两种颜色
font.palettes.ensureCPAL(['#e53935', '#1e88e5'])
// COLR: base(index 1) → [layer glyph 2 用色 0, layer glyph 3 用色 1]
// 注意:必须传整数 glyph 索引;构造后 Glyph 对象的 .index 未赋值,传对象会得到 0。
font.layers.add(1, [
  { glyph: glyphs.indexOf(l0), paletteIndex: 0 },
  { glyph: glyphs.indexOf(l1), paletteIndex: 1 },
])

const ab = font.toArrayBuffer()
console.log('serialized bytes:', ab.byteLength)

// 回读校验
const re = opentype.parse(ab)
const colr = re.tables.colr
const cpal = re.tables.cpal
console.log('has COLR:', !!colr, 'has CPAL:', !!cpal)
console.log('CPAL numPaletteEntries:', cpal && cpal.numPaletteEntries)
console.log('CPAL colorRecords:', cpal && JSON.stringify(cpal.colorRecords))
console.log('COLR baseGlyphRecords:', colr && JSON.stringify(colr.baseGlyphRecords))
console.log('COLR layerRecords:', colr && JSON.stringify(colr.layerRecords))

const layers = re.layers.get(re.charToGlyph('A').index)
console.log(
  'layers via API:',
  layers.map((l: { glyph: { name: string }; paletteIndex: number }) => `${l.glyph.name}@pal${l.paletteIndex}`).join(', '),
)

const ok =
  !!colr &&
  !!cpal &&
  cpal.numPaletteEntries === 2 &&
  colr.baseGlyphRecords.length === 1 &&
  colr.layerRecords.length === 2
console.log(ok ? '\n✅ PROBE-COLR OK' : '\n❌ PROBE-COLR FAILED')
if (!ok) process.exit(1)
