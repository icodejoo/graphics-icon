/**
 * `scale-that-svg` 自带无类型声明 —— 这里提供最小环境模块声明(本 .d.ts 为脚本上下文,
 * 故 `declare module` 是「声明」而非「增强」,可为无类型包补类型)。
 * 通过 scale-svg.ts 顶部的三斜线 `/// <reference>` 引入,确保随该 .ts 进入消费方编译。
 *
 * `scale-that-svg` ships no type declarations — provide a minimal ambient module declaration. This
 * .d.ts is script context, so `declare module` *declares* (not augments) the untyped package. It is
 * pulled in via the triple-slash `/// <reference>` at the top of scale-svg.ts so it travels into
 * consumers that compile that .ts.
 */
declare module "scale-that-svg" {
  export interface ScaleOptions {
    /** 等比缩放因子。 / Uniform scale factor. */
    scale?: number
    /** 目标宽 / 高。 / Target width / height. */
    width?: number
    height?: number
  }
  /** 把 SVG 坐标按比例「烘焙」放大,返回新的 SVG 字符串。 / Bake-scale an SVG's coordinates; returns a new SVG string. */
  export function scale(svg: string, options?: ScaleOptions): Promise<string>
}
