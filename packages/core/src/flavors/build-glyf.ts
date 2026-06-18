import { assembleFont, iconGlyph, notdefGlyph } from './font-assembly.ts'

import type { GlyphDef, ResolvedOptions } from '../types.ts'

/** 组装单色 glyf 字体,返回 TTF 字节。 */
export function buildGlyfFont(glyphDefs: GlyphDef[], o: ResolvedOptions): Uint8Array {
  const glyphs = [
    notdefGlyph(o),
    ...glyphDefs.map((g) => iconGlyph(g.name, g.codepoint, g.advanceWidth, g.path)),
  ]
  return new Uint8Array(assembleFont(glyphs, o).toArrayBuffer())
}
