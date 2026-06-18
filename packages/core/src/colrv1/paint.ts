// COLRv1 paint 树 —— JS 前端产出、Rust/wasm 后端消费的数据契约。

export type Pt = [number, number]
export type Extend = 'pad' | 'repeat' | 'reflect'

/** COLR 前景色调色板索引(currentColor)。 */
export const FOREGROUND = 0xffff

export interface ColorStop {
  /** 0..1 */
  offset: number
  /** CPAL 槽位索引,或 FOREGROUND。 */
  paletteIndex: number
  /** 0..1 */
  alpha: number
}

export type Paint =
  | { kind: 'solid'; paletteIndex: number; alpha: number }
  | { kind: 'linear'; p0: Pt; p1: Pt; p2: Pt; stops: ColorStop[]; extend: Extend }
  | { kind: 'radial'; c0: Pt; r0: number; c1: Pt; r1: number; stops: ColorStop[]; extend: Extend }

/** 一层:用 paint 填充某个 glyf 轮廓字形(PaintGlyph + paint)。 */
export interface ColrLayer {
  glyphId: number
  paint: Paint
}

/** 一个彩色字形:base 字形 → 若干层(PaintColrLayers)。 */
export interface ColorGlyph {
  baseGlyphId: number
  layers: ColrLayer[]
}

/** 传给 Rust/wasm 写表后端的完整文档。 */
export interface Colrv1Doc {
  unitsPerEm: number
  /** CPAL 调色板颜色(#rrggbb),paletteIndex 索引到此数组。 */
  palette: string[]
  colorGlyphs: ColorGlyph[]
}
