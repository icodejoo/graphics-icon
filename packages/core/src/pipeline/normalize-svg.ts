import svgpath from 'svgpath'
import { optimize } from 'svgo'

// 内置常量(不暴露给调用方):真实环境 SVG 来源/尺寸不可预估,放大+整数化由插件内部统一处理。
// 几何先放大到 1024 宽(高分辨率),再整数化(floatPrecision:0)→ 去小数不变形 + OT-SVG 文本紧凑。
const SCALE_TO = 1024
const PRECISION = 0

const VIEWBOX_RE = /viewBox\s*=\s*"([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)"/

/** 字体场景安全的 svgo 覆盖:保留 fill、不合并路径、不改色(供按色拆层),basic shape → path。 */
function overrides(floatPrecision: number) {
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
function scaleGeometry(svg: string, scaleTo: number): string {
  const m = svg.match(VIEWBOX_RE)
  if (!m) return svg
  const W = +m[3]
  const H = +m[4]
  if (!W || !H) return svg
  const k = scaleTo / W
  if (Math.abs(k - 1) < 1e-9) return svg

  // 缩放 <path d>
  let out = svg.replace(/(<path\b[^>]*\bd\s*=\s*")([^"]*)(")/g, (_all, pre: string, d: string, post: string) => {
    try {
      return pre + svgpath(d).scale(k).toString() + post
    } catch {
      return pre + d + post
    }
  })

  // 仅缩放 userSpaceOnUse 渐变坐标(objectBoundingBox 是相对 bbox,缩放无关)
  out = out.replace(/<(?:linear|radial)Gradient\b[^>]*>/g, (tag) => {
    if (!/gradientUnits\s*=\s*"userSpaceOnUse"/.test(tag)) return tag
    return tag.replace(/\b(x1|y1|x2|y2|cx|cy|r|fx|fy)\s*=\s*"([-\d.eE]+)"/g, (_a, attr: string, v: string) => `${attr}="${+v * k}"`)
  })

  // 重写 viewBox(宽 = scaleTo, 高按比例)
  return out.replace(VIEWBOX_RE, `viewBox="0 0 ${scaleTo} ${Math.round(H * k)}"`)
}

/**
 * 规范化 + 压缩:
 *   1. svgo 清理几何(shape→path、绝对化、内联样式),保留颜色信息;
 *   2. 几何放大到 scaleTo 宽(高分辨率,使 floatPrecision:0 无损);
 *   3. svgo 激进收尾(floatPrecision:0 整数化、cleanupNumericValues、removeMetadata/comments/desc/title)。
 */
/**
 * 规范化 + 压缩(全内置,无参数):
 *   1. svgo 高精度清理几何(shape→path、绝对化、内联样式),保留颜色信息;
 *   2. 几何放大到 1024 宽(高分辨率,使整数化无损/不变形)——用渐变安全的 scaleGeometry;
 *   3. svgo 整数化(floatPrecision:0)+ removeMetadata/comments/desc/title 收尾。
 */
export function normalizeSvg(svg: string): string {
  // pass1:保留小数清理,使后续放大精确
  const cleaned = optimize(svg, {
    plugins: [{ name: 'preset-default', params: { overrides: overrides(4) } }],
  }).data
  // pass2:放大到 1024 宽 → 整数化
  const scaled = scaleGeometry(cleaned, SCALE_TO)
  return optimize(scaled, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: overrides(PRECISION) } }],
  }).data
}
