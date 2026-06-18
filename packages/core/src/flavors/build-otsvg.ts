import { assembleFont, buildBaseGlyphs } from './font-assembly.ts'

import type { ResolvedOptions } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'

export interface OtsvgIconInput {
  name: string
  codepoint: number
  viewBox: ViewBox
  /** 基础 glyf 轮廓(单色回退)。 */
  allDs: string[]
  /** 规范化 SVG 的内层内容(defs/gradients/paths),仅 color 图标用。 */
  innerSvg: string
  /** 是否需要彩色(多色或含渐变)→ 才嵌入 OT-SVG 文档。 */
  needsColor: boolean
}

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString()
}

/**
 * 把原始图标坐标映射到 OT-SVG 坐标系(y 轴向下、单位 = 设计单位、原点在基线),
 * 使内嵌 SVG 与 glyf 轮廓重合:
 *   Xo = s*(x - minX);  Yo = s*(y - minY) - ascender
 * 等价仿射 matrix(s 0 0 s tx ty),tx=-s*minX, ty=-s*minY-ascender。
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
 * OT-SVG 字体 = 所有图标的 glyf 基础轮廓(回退)+ 彩色图标的内嵌 SVG 文档('SVG ' 表)。
 * 无 SVG 文档的字形由 OT-SVG 渲染器回退到 glyf(文本色)。
 */
export function buildOtsvgFont(icons: OtsvgIconInput[], o: ResolvedOptions): Uint8Array {
  const { glyphs, baseIndexByName } = buildBaseGlyphs(icons, o)
  const font = assembleFont(glyphs, o)

  const svgMap = new Map<number, Uint8Array>()
  for (const ic of icons) {
    if (!ic.needsColor || !ic.innerSvg) continue
    const gid = baseIndexByName.get(ic.name)!
    svgMap.set(gid, new TextEncoder().encode(buildSvgDoc(gid, ic.innerSvg, ic.viewBox, o)))
  }
  if (svgMap.size) font.tables.svg = svgMap

  return new Uint8Array(font.toArrayBuffer())
}
