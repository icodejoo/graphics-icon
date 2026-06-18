// 探针:经验性坐实 PoC-0 —— opentype.js 2.0 能否真的写出 'SVG '(OT-SVG)表。
import opentype from 'opentype.js'

function square(x: number, y: number, w: number, h: number) {
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
const glyphs = [notdef, base] // A 的 GID = 1
const font = new opentype.Font({
  familyName: 'ProbeSvg',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs,
})

const gid = glyphs.indexOf(base) // 1
// OT-SVG 文档:根元素 id="glyph<GID>",含线性渐变(COLRv0 表达不了的能力)
const doc =
  `<svg xmlns="http://www.w3.org/2000/svg">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#e53935"/><stop offset="1" stop-color="#1e88e5"/></linearGradient></defs>` +
  `<path id="glyph${gid}" d="M100 200 H700 V800 H100 Z" fill="url(#g)"/></svg>`

font.tables.svg = new Map([[gid, new TextEncoder().encode(doc)]])

const ab = font.toArrayBuffer()
console.log('serialized bytes:', ab.byteLength)

const re = opentype.parse(ab)
const svgTable = re.tables.svg
console.log('has SVG table:', !!svgTable)
console.log('SVG table type:', svgTable && svgTable.constructor && svgTable.constructor.name)

let recovered = ''
if (svgTable instanceof Map) {
  const v = svgTable.get(gid)
  recovered = typeof v === 'string' ? v : new TextDecoder().decode(v as Uint8Array)
} else if (svgTable && typeof svgTable === 'object') {
  // 可能是 {docRecords:[...]} 或数组形态,打印结构帮助判断
  console.log('SVG table keys:', Object.keys(svgTable))
  console.log('SVG table dump:', JSON.stringify(svgTable).slice(0, 400))
}
if (recovered) console.log('recovered doc (head):', recovered.slice(0, 120))

const ok = !!svgTable && recovered.includes(`glyph${gid}`) && recovered.includes('linearGradient')
console.log(ok ? '\n✅ PROBE-SVG OK (SVG table written & round-trips with gradient)' : '\n⚠️ PROBE-SVG: SVG 表存在性/结构见上,需据此调整读取方式')
