// @ts-expect-error svg2ttf 是 CJS 默认导出,无类型
import svg2ttf from 'svg2ttf'

import type { ResolvedOptions } from '../types.ts'

export interface GlyfGlyph {
  /** glyph-name(COLR 按名解析索引,务必唯一)。 */
  name: string
  /** SVG-font 路径 d(em y-up)。 */
  d: string
  advanceWidth: number
  /** 有 unicode 的进 cmap(base 字形);层字形不传。 */
  unicode?: number
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 用 svg2ttf 把字形列表组装成 **glyf**(TrueType)字体,返回 SFNT 字节。
 * 完整的 cmap/hmtx/head/hhea/maxp/name/OS2/post 由 svg2ttf 生成;ts 固定以保证可复现。
 */
export function buildGlyfTtf(glyphs: GlyfGlyph[], o: ResolvedOptions): Uint8Array {
  const adv = o.unitsPerEm
  const items = glyphs
    .map((g) => {
      const u = g.unicode !== undefined ? ` unicode="&#x${g.unicode.toString(16)};"` : ''
      return `<glyph glyph-name="${xmlEscape(g.name)}"${u} horiz-adv-x="${g.advanceWidth}" d="${g.d}"/>`
    })
    .join('\n')

  const xml =
    `<?xml version="1.0" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<font id="${xmlEscape(o.fontName)}" horiz-adv-x="${adv}">` +
    `<font-face font-family="${xmlEscape(o.fontName)}" units-per-em="${o.unitsPerEm}" ascent="${o.ascender}" descent="${o.descender}"/>` +
    `<missing-glyph horiz-adv-x="${adv}"/>` +
    items +
    `</font></defs></svg>`

  // ts 固定(epoch)→ head 表时间戳确定 → 产物可复现(内容哈希稳定)。
  const r = svg2ttf(xml, { ts: 0 })
  return new Uint8Array(r.buffer.buffer, r.buffer.byteOffset, r.buffer.byteLength)
}
