// COLRv1 前端:把图标拆层 → 造 base 字体(glyf 底座)→ 解析可靠 gid → 构造 paint 树 doc,
// 交给 Rust/wasm 写表后端(wasm-writer.addColrv1)追加 COLR/CPAL。
//
// 本次重写只换两件事(其余 paint/渐变/颜色逻辑与 doc 结构保持不变,以匹配未重编的 wasm):
//   ① base SFNT 来源:opentype.js + font-assembly(CFF) → 已验证的 buildColorGlyf(...).ttf(glyf 字节)。
//   ② glyph 引用 gid:opentype 的 glyphs.length/baseIndexByName → buildColorGlyf 解析出的 baseGid/layers[i].gid。
// bbox(渐变坐标映射用)从 toOutline 的新返回值 { bbox } 获取(旧 path.getBoundingBox() 已失效)。

import { buildColorGlyf } from '../glyf/color-glyphs.ts'
import { toRgba } from '../util/color.ts'

import { gradientIdFromFill, parseGradients } from './parse-gradients.ts'
import { FOREGROUND } from './paint.ts'

import type { PreparedIcon } from '../pipeline/prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'
import type { Gradient } from './parse-gradients.ts'
import type { ColorGlyph, ColorStop, Colrv1Doc, ColrLayer, Paint, Pt } from './paint.ts'

export interface Colrv1Build {
  /** 仅含 glyf 的 base 字体(notdef + 层字形 + base 字形),供 wasm 注入 COLR/CPAL。 */
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

function layerPaint(layer: { fill: string; color: string }, gradients: Map<string, Gradient>, viewBox: ViewBox, bbox: BBox, pal: Palette, o: ResolvedOptions): Paint {
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
 *
 * base/gid 来源:buildColorGlyf 已把每个图标的 base 轮廓 + 各层轮廓组装进一个 glyf 字体,
 * 并解析好 baseGid(经 cmap)与每层 gid(经 glyph-name,含去重 canonical)。其 ttf 即交给
 * wasm 的 base SFNT(glyf 字节,头 4 字节 0,1,0,0);doc 里的 glyph 引用直接用它解析出的 gid。
 */
export function buildColrv1(icons: PreparedIcon[], o: ResolvedOptions): Colrv1Build {
  const pal = new Palette()

  // ① base 字体 + gid:用已验证的 glyf 底座一次性组装并解析(直接吃预计算的 PreparedIcon)。
  const { ttf, icons: resolved } = buildColorGlyf(icons, o)
  const resolvedByName = new Map(resolved.map((r) => [r.name, r]))

  // ② paint 树:逐彩色图标构造 ColorGlyph。gid / 层 bbox 全来自预计算解析结果,不再 toOutline。
  const colorGlyphs: ColorGlyph[] = []
  for (const ic of icons) {
    if (!ic.needsColor) continue
    const res = resolvedByName.get(ic.name)
    if (!res) continue

    const gradients = parseGradients(ic.inner)
    const layers: ColrLayer[] = res.layers.map((rl) => ({
      glyphId: rl.gid,
      paint: layerPaint(rl, gradients, ic.viewBox, rl.bbox, pal, o),
    }))
    colorGlyphs.push({ baseGlyphId: res.baseGid, layers })
  }

  return {
    baseSfnt: ttf,
    doc: { unitsPerEm: o.unitsPerEm, palette: pal.colors, colorGlyphs },
  }
}
