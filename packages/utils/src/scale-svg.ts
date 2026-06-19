/// <reference path="./scale-that-svg.d.ts" />
// ↑ 显式引入本目录的环境声明:三斜线引用会随本 .ts 进入任何消费方 program,
//   故以源码方式引用 @codejoo/utils/scale-svg 的子包也能拿到 scale-that-svg 的类型。
// ↑ Pull in the sibling ambient .d.ts: a triple-slash reference travels with this .ts into any
//   consumer's program, so packages importing @codejoo/utils/scale-svg as source also get the types.

/**
 * SVG 缩放 / 归一化 —— 两套能力,统一来源:
 *   1. scaleSvgToWidth   委托成熟库 scale-that-svg 把坐标「烘焙」放大(imagemin 用)。
 *   2. normalizeSvg      与本仓库 colorfont 引擎对齐的归一化:svgo 清理 → svgpath 放大 viewBox
 *                        到目标宽 → svgo 整数化(floatPrecision:0)。svg-sprite 的 scale 能力即源于此,
 *                        与 colorfont 同步(同一套缩放/整数化策略)。
 *
 * SVG scaling / normalization — two capabilities, one source of truth:
 *   1. scaleSvgToWidth   delegates to scale-that-svg to "bake" coordinates larger (used by imagemin).
 *   2. normalizeSvg      normalization aligned with this repo's colorfont engine: svgo cleanup →
 *                        svgpath scales the viewBox to a target width → svgo integerizes
 *                        (floatPrecision:0). svg-sprite's scale ability derives from this and stays
 *                        in sync with colorfont (the same scale/integerize strategy).
 *
 * 重依赖(svgo / svgpath / scale-that-svg)全部「动态导入」:仅当真正调用缩放时才加载,
 * 未用到的代码路径不占内存 —— 满足按需导入。
 * Heavy deps (svgo / svgpath / scale-that-svg) are all dynamically imported: loaded only when a
 * scaling function actually runs, so unused code paths allocate nothing — on-demand by design.
 */

import type { PresetDefaultOverrides } from "svgo" // 仅类型 / type-only

// ──────────────────────────────────────────────────────────────────────────
// 1) scale-that-svg 委托式放大(imagemin) / scale-that-svg delegation (imagemin)
// ──────────────────────────────────────────────────────────────────────────

/** 文档是否用到描边。 / Whether the document uses stroke. */
function usesStroke(svg: string): boolean {
  return /\bstroke\s*[=:]\s*"?(?!none|url\(|transparent|inherit)/i.test(svg)
}

/** 若用到描边且根 <svg> 无显式 stroke-width,则注入 stroke-width=factor(放大后的默认线宽)。 */
/** Inject stroke-width=factor on the root <svg> when stroke is used but no explicit width is set. */
function ensureDefaultStrokeWidth(svg: string, factor: number): string {
  if (!usesStroke(svg)) return svg
  return svg.replace(/<svg\b([^>]*)>/i, (m, attrs: string) => (/\bstroke-width\b/.test(attrs) ? m : `<svg${attrs} stroke-width="${+factor.toFixed(4)}">`))
}

/**
 * 等比放大 SVG 到 targetWidth(viewBox 宽度)。无 viewBox / 已是该宽度则原样返回。
 * 坐标已烘焙,但可能带库产生的长小数/冗余属性,通常交给随后的 svgo 清理。
 * Uniformly scale an SVG to targetWidth (viewBox width). Returns input unchanged when there is no
 * viewBox or it already matches. Coordinates are baked in; clean up afterwards with svgo if desired.
 */
export async function scaleSvgToWidth(svg: string, targetWidth: number): Promise<string> {
  const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(svg)
  if (!vb) return svg
  const n = vb[1].split(/[\s,]+/).map(Number)
  if (n.length !== 4 || !(n[2] > 0)) return svg
  const factor = targetWidth / n[2]
  if (!(factor > 0) || factor === 1) return svg
  const { scale } = await import("scale-that-svg")
  const scaled = await scale(svg, { scale: factor })
  return ensureDefaultStrokeWidth(scaled, factor)
}

// ──────────────────────────────────────────────────────────────────────────
// 2) colorfont 对齐的归一化 / colorfont-aligned normalization
// ──────────────────────────────────────────────────────────────────────────

const VIEWBOX_RE = /viewBox\s*=\s*"([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)"/

/** 字体场景安全的 svgo 覆盖:保留 fill、不合并路径、不改色,basic shape → path。 */
/** Font-safe svgo overrides: keep fill, don't merge paths, don't recolor, basic shape → path. */
// 显式标注返回类型:让 `false` 保持字面量(不被拓宽为 boolean),从而匹配 svgo v4 的 preset-default overrides。
// Annotate the return type so `false` stays a literal (not widened to boolean) and matches svgo v4's preset-default overrides.
function overrides(floatPrecision: number): PresetDefaultOverrides {
  return {
    mergePaths: false,
    convertColors: false,
    removeUselessStrokeAndFill: false,
    convertShapeToPath: { convertArcs: true },
    cleanupNumericValues: { floatPrecision },
    convertPathData: { floatPrecision },
  }
}

/** 几何放大:viewBox 宽 → scaleTo,高按比例;path 与 userSpaceOnUse 渐变坐标同比缩放。 */
/** Geometry scale: viewBox width → scaleTo, height proportionally; path + userSpaceOnUse gradients scaled. */
async function scaleGeometry(svg: string, scaleTo: number): Promise<string> {
  const m = svg.match(VIEWBOX_RE)
  if (!m) return svg
  const W = +m[3]
  const H = +m[4]
  if (!W || !H) return svg
  const k = scaleTo / W
  if (Math.abs(k - 1) < 1e-9) return svg

  const svgpath = (await import("svgpath")).default

  // 缩放 <path d> / scale <path d>
  let out = svg.replace(/(<path\b[^>]*\bd\s*=\s*")([^"]*)(")/g, (_all, pre: string, d: string, post: string) => {
    try {
      return pre + svgpath(d).scale(k).toString() + post
    } catch {
      return pre + d + post
    }
  })

  // 仅缩放 userSpaceOnUse 渐变坐标 / scale only userSpaceOnUse gradient coords
  out = out.replace(/<(?:linear|radial)Gradient\b[^>]*>/g, (tag) => {
    if (!/gradientUnits\s*=\s*"userSpaceOnUse"/.test(tag)) return tag
    return tag.replace(/\b(x1|y1|x2|y2|cx|cy|r|fx|fy)\s*=\s*"([-\d.eE]+)"/g, (_a, attr: string, v: string) => `${attr}="${+v * k}"`)
  })

  // 重写 viewBox(宽 = scaleTo, 高按比例) / rewrite viewBox (width = scaleTo, height proportional)
  return out.replace(VIEWBOX_RE, `viewBox="0 0 ${scaleTo} ${Math.round(H * k)}"`)
}

export interface NormalizeOptions {
  /** 放大到的目标 viewBox 宽度(高分辨率,使整数化无损/不变形)。默认 1024(同 colorfont)。 */
  /** Target viewBox width to scale up to (so integerization is lossless). Default 1024 (same as colorfont). */
  scaleTo?: number
  /** 收尾整数精度。默认 0(整数化)。 / Final integer precision. Default 0 (integerize). */
  precision?: number
}

/**
 * 规范化 + 压缩(与 colorfont 引擎同策略):
 *   1. svgo 高精度清理几何(shape→path、绝对化、内联样式),保留颜色信息;
 *   2. 几何放大到目标宽(高分辨率,使整数化无损/不变形)——用渐变安全的 scaleGeometry;
 *   3. svgo 整数化(floatPrecision:0)+ removeMetadata/comments/desc/title 收尾。
 * Normalize + compress (same strategy as the colorfont engine):
 *   1. svgo high-precision geometry cleanup (shape→path, absolutize, inline styles), keeping colors;
 *   2. scale geometry up to the target width via gradient-safe scaleGeometry;
 *   3. svgo integerize (floatPrecision:0) and strip metadata/comments/desc/title.
 */
export async function normalizeSvg(svg: string, opts: NormalizeOptions = {}): Promise<string> {
  const scaleTo = opts.scaleTo ?? 1024
  const precision = opts.precision ?? 0
  const { optimize } = await import("svgo")
  // pass1:保留小数清理,使后续放大精确 / pass1: high-precision cleanup so scaling stays exact
  const cleaned = optimize(svg, {
    plugins: [{ name: "preset-default", params: { overrides: overrides(4) } }],
  }).data
  // pass2:放大 → 整数化 / pass2: scale up → integerize
  const scaled = await scaleGeometry(cleaned, scaleTo)
  return optimize(scaled, {
    multipass: true,
    plugins: [{ name: "preset-default", params: { overrides: overrides(precision) } }],
  }).data
}
