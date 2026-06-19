/**
 * svg-icons 配置与颜色策略类型。
 * svg-icons config and color-strategy types.
 */

/**
 * 颜色改写策略：
 *   · true            → fill/stroke 改为 currentColor（跟随 CSS color）
 *   · string          → 改为该颜色
 *   · falsy/undefined → 什么都不做
 *   · 函数            → 对每处颜色调用 (name=文件名/symbolId, symbolId, 原颜色)；
 *                       返回真值字符串则替换为该值，返回 falsy 则保留原样
 * Color rewrite strategy:
 *   · true      → fill/stroke become currentColor (follows CSS color)
 *   · string    → replace with that color
 *   · falsy     → no-op
 *   · function  → called per color as (name, symbolId, currentColor); truthy string replaces, falsy keeps
 */
export type ColorFn = (name: string, symbolId: string, color: string) => string | false | null | undefined
export type ColorOption = boolean | string | ColorFn | null | undefined

/**
 * 归一化 / 缩放策略（默认关闭 → 行为不变，安全）：
 *   · falsy/undefined → 不做归一化（默认）
 *   · true            → 以默认宽度 1024 归一化每个 symbol 几何
 *   · { width }       → 以指定宽度归一化
 * 启用后，每个图标 symbol 的几何会被归一化/缩放到统一的 viewBox 宽度，
 * 复用 colorfont 引擎的同一套「缩放 + 整数化」策略（@codejoo/utils/scale-svg 的 normalizeSvg）。
 *
 * Normalize / scale strategy (default OFF → unchanged, safe behavior):
 *   · falsy      → no normalization (default)
 *   · true       → normalize each symbol geometry to the default width 1024
 *   · { width }  → normalize to the given width
 * When enabled, each icon symbol's geometry is normalized/scaled to a uniform viewBox width,
 * reusing colorfont's same scale+integerize strategy (normalizeSvg from @codejoo/utils/scale-svg).
 */
export type NormalizeOption = boolean | { width?: number } | undefined

/**
 * 产物路径（对齐 bitmap 的 output）：
 *   · svg     —— 输出雪碧图 svg
 *   · script  —— 可选入口脚本 .ts/.js
 * Output paths:
 *   · svg     — emitted sprite svg
 *   · script  — optional entry script .ts/.js
 */
export interface SvgIconsOutput {
  /** 输出雪碧图 svg，如 'src/sprites/svg/common/common.sprites.svg' */
  svg: string
  /**
   * 可选入口脚本 .ts/.js。生成内容：?url 导入 svg + 导出 iconsName 枚举对象；
   * .ts 再导出 IconName 字符串字面量联合类型。falsy/省略 → 不生成。
   * Optional entry script. Emits a ?url import of the svg + iconsName enum object;
   * .ts also emits the IconName string-literal union. falsy/omitted → not generated.
   */
  script?: string
}

export interface SvgIconsConfig {
  /** 图标源目录 / icon source directory */
  input: string
  /** 产物路径集合（svg 必填，script 可选） / output paths (svg required, script optional) */
  output: SvgIconsOutput
  /** 颜色改写策略（见 ColorOption） / color rewrite strategy */
  color?: ColorOption
  /**
   * 归一化 / 缩放（默认关闭）。开启后每个 symbol 几何被缩放到统一 viewBox 宽度（默认 1024），
   * 与 colorfont 的 normalizeSvg 同步。见 NormalizeOption。
   * Normalize / scale (default off). When on, each symbol geometry is scaled to a uniform viewBox
   * width (default 1024), in sync with colorfont's normalizeSvg. See NormalizeOption.
   */
  normalize?: NormalizeOption
  /** symbol id 转换；默认保留原文件名（维持现有 <use href="#xxx">） */
  iconNameTransformer?: (name: string) => string
  /** 生成后的格式化器（svg 不支持时插件会优雅回退） */
  formatter?: "svgo" | "prettier" | "oxfmt"
}

/**
 * 插件入参(对象式)：
 *   · sprites    —— 各实例配置（一个或多个雪碧图）
 *   · cacheFile  —— 插件级缓存文件路径（整个插件只设一次，非实例级）。
 *                   省略则落共享缓存目录 .cache.graphics/svg-icons.json（随仓库提交→团队共享）。
 * Plugin options (object form):
 *   · sprites    — per-instance configs (one or more sprites)
 *   · cacheFile  — plugin-level cache file path (set once, not per instance).
 *                  Omitted → shared cache folder .cache.graphics/svg-icons.json (commit it → team-shared).
 */
export interface SvgIconsOptions {
  sprites: SvgIconsConfig[]
  cacheFile?: string
}
