// color 写表核心:把每个图标的 base 轮廓 + 各层轮廓(均为预计算 d)组装成一个 glyf 字体,
// 并解析出 base gid(经 cmap)/ 每层 gid(经 glyph-name)。COLRv0 与 COLRv1 共用。
//
// gid 解析健壮性:层字形优先 emit,base 随后(带 unicode)。svg2ttf 按 (advanceWidth,d) 去重时:
//   - 层与 base 轮廓相同 → canonical 取先出现的「层」,base 的 unicode 被并入该 gid 的 cmap
//     → base 经 byCodepoint、层经 byName 都解析正确;
//   - 两层相同 → 本模块先行去重并记录 canonical 名,保证 byName 可解析;
//   - 两 base 相同 → 交给 svg2ttf 合并(两 unicode 都并入同一 gid 的 cmap)。
import { parseGlyphMap } from './glyph-map.ts'
import { buildGlyfTtf } from './svg-font.ts'

import type { GlyphMap } from './glyph-map.ts'
import type { GlyfGlyph } from './svg-font.ts'
import type { BBox } from '../outline/to-outline.ts'
import type { PreparedIcon } from '../pipeline/prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'

export interface ResolvedColorIcon {
  name: string
  codepoint: number
  /** cmap 寻址的 base 字形 gid(COLR base record 用)。 */
  baseGid: number
  /** 各层(顺序同 detectColor):gid + 颜色 + bbox(渐变映射用,均来自预计算)。 */
  layers: { gid: number; fill: string; color: string; bbox: BBox }[]
}

export interface ColorGlyfResult {
  /** 含 base+layer 字形的 glyf 字体(待注入 COLR/CPAL 或交 wasm)。 */
  ttf: Uint8Array
  map: GlyphMap
  icons: ResolvedColorIcon[]
}

export function buildColorGlyf(input: PreparedIcon[], o: ResolvedOptions): ColorGlyfResult {
  const seen = new Map<string, string>() // (advanceWidth|d) → canonical 层名
  const canonical = new Map<string, string>() // 原层名 → canonical 层名
  const glyphs: GlyfGlyph[] = []

  // 1) 层字形优先(无 unicode,用预计算 d),本地去重保证层名可解析
  for (const ic of input) {
    for (let i = 0; i < ic.layers.length; i++) {
      const ly = ic.layers[i]
      const name = `${ic.name}.l${i}`
      const key = ly.advanceWidth + '|' + ly.d
      const c = seen.get(key)
      if (c !== undefined) {
        canonical.set(name, c)
        continue
      }
      seen.set(key, name)
      canonical.set(name, name)
      glyphs.push({ name, d: ly.d, advanceWidth: ly.advanceWidth })
    }
  }

  // 2) base 字形(带 unicode,用预计算 d);相同轮廓交 svg2ttf 合并(自动并 cmap)
  for (const ic of input) {
    glyphs.push({ name: ic.name, d: ic.base.d, advanceWidth: ic.base.advanceWidth, unicode: ic.codepoint })
  }

  const ttf = buildGlyfTtf(glyphs, o)
  const map = parseGlyphMap(ttf)

  const icons: ResolvedColorIcon[] = input.map((ic) => ({
    name: ic.name,
    codepoint: ic.codepoint,
    baseGid: map.byCodepoint.get(ic.codepoint) ?? 0,
    layers: ic.layers.map((ly, i) => ({
      gid: map.byName.get(canonical.get(`${ic.name}.l${i}`) ?? '') ?? 0,
      fill: ly.fill,
      color: ly.color,
      bbox: ly.bbox,
    })),
  }))

  return { ttf, map, icons }
}
