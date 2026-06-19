// 解析 svg2ttf 产出的 glyf 字体,建立 name→gid / codepoint→gid 映射(供 color 写表挂 COLR)。
// 仅做只读解析(opentype.js 解析 glyf 无碍,不引入 CFF)。
import opentype from 'opentype.js'

export interface GlyphMap {
  /** glyph-name → gid(layer 字形按名解析)。 */
  byName: Map<string, number>
  /** Unicode 码位 → gid(base 字形)。 */
  byCodepoint: Map<number, number>
  numGlyphs: number
}

export function parseGlyphMap(ttf: Uint8Array): GlyphMap {
  const ab = ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer
  const font = opentype.parse(ab)
  const byName = new Map<string, number>()
  const byCodepoint = new Map<number, number>()
  for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i)
    if (g.name) byName.set(g.name, i)
    if (typeof g.unicode === 'number') byCodepoint.set(g.unicode, i)
    if (Array.isArray(g.unicodes)) for (const u of g.unicodes) byCodepoint.set(u, i)
  }
  return { byName, byCodepoint, numGlyphs: font.glyphs.length }
}
