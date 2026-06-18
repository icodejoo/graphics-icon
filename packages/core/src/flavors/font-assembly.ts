import opentype from 'opentype.js'

import { toOutline } from '../outline/to-outline.ts'

import type { OutlinePath, ResolvedOptions } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'

export type OTGlyph = InstanceType<typeof opentype.Glyph>
export type OTFont = InstanceType<typeof opentype.Font>

/** .notdef 字形(所有 flavor 的 0 号字形)。 */
export function notdefGlyph(o: ResolvedOptions): OTGlyph {
  return new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: o.unitsPerEm, path: new opentype.Path() })
}

/** 带 unicode 的图标基础字形。 */
export function iconGlyph(name: string, codepoint: number, advanceWidth: number, path: OutlinePath): OTGlyph {
  return new opentype.Glyph({ name, unicode: codepoint, advanceWidth, path })
}

/** 无 unicode 的层字形(供 COLR 引用)。 */
export function layerGlyph(name: string, advanceWidth: number, path: OutlinePath): OTGlyph {
  return new opentype.Glyph({ name, advanceWidth, path })
}

/** 用统一的字体度量组装 opentype.Font。 */
export function assembleFont(glyphs: OTGlyph[], o: ResolvedOptions): OTFont {
  return new opentype.Font({
    familyName: o.fontName,
    styleName: 'Regular',
    unitsPerEm: o.unitsPerEm,
    ascender: o.ascender,
    descender: o.descender,
    glyphs,
  })
}

export interface BaseIcon {
  name: string
  codepoint: number
  viewBox: ViewBox
  /** 所有可绘制 path 的 d(合并为基础轮廓 = 单色回退)。 */
  allDs: string[]
}

/**
 * 组装 notdef + 每个图标的基础轮廓字形。
 * 返回字形数组(调用方可继续往后追加层字形)与 name→glyphId 映射。
 */
export function buildBaseGlyphs(
  icons: BaseIcon[],
  o: ResolvedOptions,
): { glyphs: OTGlyph[]; baseIndexByName: Map<string, number> } {
  const glyphs: OTGlyph[] = [notdefGlyph(o)]
  const baseIndexByName = new Map<string, number>()
  for (const ic of icons) {
    const { path, advanceWidth } = toOutline(ic.allDs, ic.viewBox, o)
    baseIndexByName.set(ic.name, glyphs.length)
    glyphs.push(iconGlyph(ic.name, ic.codepoint, advanceWidth, path))
  }
  return { glyphs, baseIndexByName }
}
