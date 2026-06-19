import { buildGlyfTtf } from '../glyf/svg-font.ts'
import { parseGlyphMap } from '../glyf/glyph-map.ts'
import { injectTables } from '../glyf/sfnt-inject.ts'

import type { PreparedIcon } from '../pipeline/prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString()
}

/**
 * 把原始图标坐标映射到 OT-SVG 坐标系(y 轴向下、单位 = 设计单位、原点在基线),
 * 使内嵌 SVG 与 glyf 轮廓重合:
 *   Xo = s*(x - minX);  Yo = s*(y - minY) - ascender
 * 等价仿射 matrix(s 0 0 s tx ty),tx=-s*minX, ty=-s*minY-ascender。
 * 复用既有(已验证正确)的变换数学,只把字体组装改为 glyf 引擎。
 */
function buildSvgDoc(gid: number, inner: string, viewBox: ViewBox, o: ResolvedOptions): string {
  const s = o.unitsPerEm / (viewBox.height || o.unitsPerEm)
  const tx = -s * viewBox.minX
  const ty = -s * viewBox.minY - o.ascender
  const m = `matrix(${fmt(s)} 0 0 ${fmt(s)} ${fmt(tx)} ${fmt(ty)})`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<g id="glyph${gid}" transform="${m}">${inner}</g></svg>`
  )
}

/**
 * 构造 OpenType 'SVG ' 表(version 0,big-endian)。
 *   header(10 B):uint16 version=0, uint32 svgDocumentListOffset(=10), uint32 reserved=0。
 *   SVGDocumentList:uint16 numEntries, 然后 numEntries 条 12 B 记录:
 *     uint16 startGlyphID, uint16 endGlyphID,
 *     uint32 svgDocOffset(相对 SVGDocumentList 起始,即相对 numEntries 字段),
 *     uint32 svgDocLength。
 *   记录之后是各 SVG 文档字节(UTF-8,不压缩)。
 * 入参 docs 必须已按 gid 升序;每条记录覆盖单个 gid(start=end)。
 */
function buildSvgTable(docs: { gid: number; bytes: Uint8Array }[]): Uint8Array {
  const numEntries = docs.length
  const HEADER = 10
  const LIST_NUM = 2 // SVGDocumentList 里的 numEntries 字段
  const RECORD = 12

  // 文档区(相对 SVGDocumentList 起始)的起点 = numEntries(2) + 记录数组
  const docsStartInList = LIST_NUM + numEntries * RECORD
  const totalDocBytes = docs.reduce((acc, d) => acc + d.bytes.length, 0)
  const total = HEADER + docsStartInList + totalDocBytes

  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)

  // header
  dv.setUint16(0, 0) // version
  dv.setUint32(2, HEADER) // svgDocumentListOffset(相对表起始)
  dv.setUint32(6, 0) // reserved

  // SVGDocumentList
  const listBase = HEADER
  dv.setUint16(listBase, numEntries)

  let docOffsetInList = docsStartInList // 当前文档相对 SVGDocumentList 起始的偏移
  let recCursor = listBase + LIST_NUM
  let docCursor = listBase + docsStartInList
  for (const d of docs) {
    dv.setUint16(recCursor, d.gid) // startGlyphID
    dv.setUint16(recCursor + 2, d.gid) // endGlyphID
    dv.setUint32(recCursor + 4, docOffsetInList) // svgDocOffset(相对 SVGDocumentList)
    dv.setUint32(recCursor + 8, d.bytes.length) // svgDocLength
    out.set(d.bytes, docCursor)
    recCursor += RECORD
    docCursor += d.bytes.length
    docOffsetInList += d.bytes.length
  }

  return out
}

/**
 * OT-SVG 字体 = 所有图标的 glyf 基础轮廓(单色回退)+ 彩色图标的内嵌 SVG 文档('SVG ' 表)。
 * 无 SVG 文档的字形由 OT-SVG 渲染器回退到 glyf(文本色)。
 *
 * 引擎:glyf(svg2ttf 组装,opentype.js 仅只读解析取 gid),不再用 opentype.js 写字体。
 */
export function buildOtsvgTtf(icons: PreparedIcon[], o: ResolvedOptions): Uint8Array {
  // 1. base 字形:用预计算的 silhouette 轮廓,带 unicode 进 cmap。
  const baseGlyphs = icons.map((ic) => ({
    name: ic.name,
    d: ic.base.d,
    advanceWidth: ic.base.advanceWidth,
    unicode: ic.codepoint,
  }))
  const ttf = buildGlyfTtf(baseGlyphs, o)

  // 2. 解析回 gid 映射(codepoint → gid),为彩色图标准备 SVG 文档。
  const map = parseGlyphMap(ttf)

  // 3. 仅彩色图标嵌入 OT-SVG 文档(沿用旧策略:needsColor && innerSvg)。
  const docs: { gid: number; bytes: Uint8Array }[] = []
  for (const ic of icons) {
    if (!ic.needsColor || !ic.inner) continue
    const gid = map.byCodepoint.get(ic.codepoint)
    if (gid === undefined) continue
    const doc = buildSvgDoc(gid, ic.inner, ic.viewBox, o)
    docs.push({ gid, bytes: new TextEncoder().encode(doc) })
  }

  // 无彩色图标 → 直接返回纯 glyf(无 'SVG ' 表)。
  if (!docs.length) return ttf

  // 4. 记录按 startGlyphID(gid)升序,构造 'SVG ' 表并注入。
  docs.sort((a, b) => a.gid - b.gid)
  const svgTable = buildSvgTable(docs)
  return injectTables(ttf, [{ tag: 'SVG ', data: svgTable }])
}
