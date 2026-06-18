export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export interface PathEntry {
  d: string
  /** 原始 fill 值(原样,未规范化)。 */
  fill: string
}

export interface ParsedSvg {
  viewBox: ViewBox
  /** 所有 <path> 的 (d, fill),保持文档顺序。 */
  paths: PathEntry[]
}

const NUM = '[-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?'

function extractFill(attrs: string, rootFill: string): string {
  const f = attrs.match(/\bfill\s*=\s*"([^"]*)"/)
  if (f) return f[1]
  const style = attrs.match(/\bstyle\s*=\s*"([^"]*)"/)
  if (style) {
    const sf = style[1].match(/fill\s*:\s*([^;]+)/)
    if (sf) return sf[1].trim()
  }
  return rootFill
}

/** 从(规范化后的)SVG 字符串提取 viewBox 与所有 path 的 (d, fill)。 */
export function parseSvg(svg: string): ParsedSvg {
  const vb = svg.match(
    new RegExp(`viewBox\\s*=\\s*["']\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*["']`),
  )
  let viewBox: ViewBox
  if (vb) {
    viewBox = { minX: +vb[1], minY: +vb[2], width: +vb[3], height: +vb[4] }
  } else {
    const w = svg.match(new RegExp(`\\bwidth\\s*=\\s*["']?\\s*(${NUM})`))
    const h = svg.match(new RegExp(`\\bheight\\s*=\\s*["']?\\s*(${NUM})`))
    viewBox = { minX: 0, minY: 0, width: w ? +w[1] : 1000, height: h ? +h[1] : 1000 }
  }

  const rootFillM = svg.match(/<svg\b[^>]*\bfill\s*=\s*"([^"]*)"/)
  const rootFill = rootFillM ? rootFillM[1] : '#000000'

  const paths: PathEntry[] = []
  const tagRe = /<path\b([^>]*?)\/?>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(svg))) {
    const attrs = m[1]
    const dM = attrs.match(/\bd\s*=\s*"([^"]*)"/)
    if (!dM) continue
    paths.push({ d: dM[1], fill: extractFill(attrs, rootFill) })
  }
  return { viewBox, paths }
}

/** 取 <svg>…</svg> 的内层内容(去掉最外层 svg 标签),供 OT-SVG 包装。 */
export function getSvgInner(svg: string): string {
  const openEnd = svg.indexOf('>', svg.indexOf('<svg'))
  const closeStart = svg.lastIndexOf('</svg>')
  if (openEnd === -1 || closeStart === -1) return svg
  return svg.slice(openEnd + 1, closeStart).trim()
}

/** 文件名 → 规范化图标名(kebab-case)。 */
export function normalizeName(raw: string): string {
  return raw
    .replace(/\.svg$/i, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}
