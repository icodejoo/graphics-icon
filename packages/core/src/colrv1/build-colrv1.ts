import { assembleFont, buildBaseGlyphs, layerGlyph } from '../flavors/font-assembly.ts'
import { toOutline } from '../outline/to-outline.ts'
import { toRgba } from '../util/color.ts'

import { gradientIdFromFill, parseGradients } from './parse-gradients.ts'
import { FOREGROUND } from './paint.ts'

import type { ColorLayer } from '../pipeline/detect-color.ts'
import type { ResolvedOptions } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'
import type { Gradient } from './parse-gradients.ts'
import type { ColorGlyph, ColorStop, Colrv1Doc, ColrLayer, Paint, Pt } from './paint.ts'

export interface Colrv1IconInput {
  name: string
  codepoint: number
  viewBox: ViewBox
  allDs: string[]
  layers: ColorLayer[]
  /** 规范化 SVG 内层(含渐变 defs)。 */
  inner: string
  needsColor: boolean
}

export interface Colrv1Build {
  /** 仅含 glyf 的 base 字体(notdef + base 字形 + 层字形),供 wasm 注入 COLR/CPAL。 */
  baseSfnt: Uint8Array
  doc: Colrv1Doc
}

interface BBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 调色板累加器:concrete #rrggbb → 索引(currentColor 走 FOREGROUND,不入表)。 */
class Palette {
  readonly colors: string[] = []
  private index = new Map<string, number>()
  intern(hex: string): number {
    let i = this.index.get(hex)
    if (i === undefined) {
      i = this.colors.length
      this.colors.push(hex)
      this.index.set(hex, i)
    }
    return i
  }
}

function gradStops(g: Gradient, pal: Palette): ColorStop[] {
  return g.stops.map((s) => {
    const { hex, alpha } = toRgba(s.color)
    return { offset: s.offset, paletteIndex: pal.intern(hex), alpha: alpha * s.opacity }
  })
}

/**
 * 渐变坐标 → glyph 空间映射器。
 * userSpaceOnUse:沿用 toOutline 的同一仿射(scale s、Y 翻转、放到 ascender)。
 * objectBoundingBox:相对该层字形在 glyph 空间的 bbox(y 已是向上)。
 */
function makeMapper(g: Gradient, viewBox: ViewBox, bbox: BBox, o: ResolvedOptions): (x: number, y: number) => Pt {
  const s = o.unitsPerEm / (viewBox.height || o.unitsPerEm)
  if (g.units === 'userSpaceOnUse') {
    return (x, y) => [s * (x - viewBox.minX), o.ascender - s * (y - viewBox.minY)]
  }
  // objectBoundingBox:fx,fy ∈ [0,1],y 向下(0=顶)→ glyph 空间 y 向上
  const w = bbox.x2 - bbox.x1
  const h = bbox.y2 - bbox.y1
  return (fx, fy) => [bbox.x1 + fx * w, bbox.y2 - fy * h]
}

function gradientPaint(g: Gradient, viewBox: ViewBox, bbox: BBox, pal: Palette, o: ResolvedOptions): Paint {
  const map = makeMapper(g, viewBox, bbox, o)
  const stops = gradStops(g, pal)
  if (g.type === 'linear') {
    const p0 = map(g.x1, g.y1)
    const p1 = map(g.x2, g.y2)
    const dx = p1[0] - p0[0]
    const dy = p1[1] - p0[1]
    // 第三点:p0 + (p1-p0) 顺时针旋转 90°,等长 —— 表达非均匀缩放/skew 下的渐变法线
    const p2: Pt = [p0[0] - dy, p0[1] + dx]
    return { kind: 'linear', p0, p1, p2, stops, extend: g.spread }
  }
  // radial(best-effort):c1=中心、c0=焦点、r0=0
  const c1 = map(g.cx, g.cy)
  const c0 = map(g.fx, g.fy)
  const s = o.unitsPerEm / (viewBox.height || o.unitsPerEm)
  const r1 =
    g.units === 'userSpaceOnUse'
      ? g.r * s
      : g.r * ((bbox.x2 - bbox.x1) + (bbox.y2 - bbox.y1)) * 0.5
  return { kind: 'radial', c0, r0: 0, c1, r1, stops, extend: g.spread }
}

function layerPaint(layer: ColorLayer, gradients: Map<string, Gradient>, viewBox: ViewBox, bbox: BBox, pal: Palette, o: ResolvedOptions): Paint {
  const gid = gradientIdFromFill(layer.fill)
  if (gid && gradients.has(gid)) {
    return gradientPaint(gradients.get(gid)!, viewBox, bbox, pal, o)
  }
  if (layer.color === 'currentColor') {
    return { kind: 'solid', paletteIndex: FOREGROUND, alpha: 1 }
  }
  const { hex, alpha } = toRgba(layer.fill)
  return { kind: 'solid', paletteIndex: pal.intern(hex), alpha }
}

/**
 * 构建 COLRv1 的 base 字体(glyf)+ paint 树文档。
 * 字形顺序:notdef → 各图标 base(带 unicode)→ 各 color 图标的层字形(无 unicode)。
 */
export function buildColrv1(icons: Colrv1IconInput[], o: ResolvedOptions): Colrv1Build {
  const pal = new Palette()
  const { glyphs, baseIndexByName } = buildBaseGlyphs(icons, o)

  const colorGlyphs: ColorGlyph[] = []
  for (const ic of icons) {
    if (!ic.needsColor) continue
    const gradients = parseGradients(ic.inner)
    const layers: ColrLayer[] = []
    ic.layers.forEach((layer, i) => {
      const out = toOutline([layer.d], ic.viewBox, o)
      const bb = out.path.getBoundingBox() as BBox
      const gid = glyphs.length
      glyphs.push(layerGlyph(`${ic.name}.l${i}`, out.advanceWidth, out.path))
      layers.push({ glyphId: gid, paint: layerPaint(layer, gradients, ic.viewBox, bb, pal, o) })
    })
    colorGlyphs.push({ baseGlyphId: baseIndexByName.get(ic.name)!, layers })
  }

  return {
    baseSfnt: new Uint8Array(assembleFont(glyphs, o).toArrayBuffer()),
    doc: { unitsPerEm: o.unitsPerEm, palette: pal.colors, colorGlyphs },
  }
}
