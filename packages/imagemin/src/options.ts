/**
 * 默认压缩配置 —— 面向 Web 交付的「有损但视觉近无损」最佳实践。
 * Default compression options — sensible "lossy yet visually near-lossless" web-delivery defaults.
 *
 * 这是库级默认值（不绑定任何具体项目）：CLI 直接用它，编程式调用可整体或部分覆盖。
 * `cacheFile` 故意省略 → 由引擎解析到共享缓存目录 `.cache.graphics/imagemin.json`。
 * Library-level defaults (not tied to any project): used by the CLI; programmatic callers may
 * override wholly or partly. `cacheFile` is intentionally omitted → resolves to the shared
 * `.cache.graphics/imagemin.json`.
 */

import type { ImageminOptions } from "./imagemin.ts"

export const defaultOptions: ImageminOptions = {
  // 处理的图片类型（include glob，可数组）
  include: ["**/*.{jpg,jpeg,png,gif,tif,tiff,webp,avif,svg}"],
  // 排除（exclude glob，可数组；优先级高于 include）：
  //   · 第三方产物 / 构建产物目录
  //   · 已压缩的 .min.* 产物
  //   · ⚠ SVG 雪碧图（<symbol> 集合）：preset-default 的 removeHiddenElems/removeUselessDefs
  //     会把"未被同文档引用"的 symbol 全删掉、将 sprite 压成空 <svg/>。命名约定 icons.svg / *.sprite.svg
  exclude: ["**/node_modules/**", "**/dist/**", "**/.output/**", "**/libs/**", "**/vendor/**", "**/third-party/**", "**/*.min.*", "**/icons.svg", "**/*.sprite.svg", "**/*.sprites.svg", "**/*.sprite.png", "**/*.sprite.webp"],
  // cacheFile 省略 → 默认落共享目录 .cache.graphics/imagemin.json
  logStats: true,
  concurrency: 8,

  // ── 位图通用管线（按需开启；全部透传 sharp）──
  // sharpOptions: { limitInputPixels: 0 }, // 解除超大图像素上限
  // resize: { width: 2560, withoutEnlargement: true }, // 统一限制最大宽度
  keepMetadata: false, // 剥离 EXIF/ICC 等元数据以进一步减小体积
  rotate: false,

  // ── sharp 各格式压缩参数 ──
  // ⚠ 本管线就地改写源文件（仅当更小才写回，哈希缓存对每张图只压一次）；有损即一次性永久。
  //   若仓库里存有「需保真的母版图」，把它放进 exclude，或改回无损参数。
  png: { palette: true, quality: 80, effort: 10, compressionLevel: 9 }, // 调色板量化(类 pngquant)：UI/图标/截图收益大；摄影类 PNG 可能产生色带
  jpeg: { quality: 80, mozjpeg: true }, // mozjpeg + q80：网页照片体积/质量甜点
  jpg: { quality: 80, mozjpeg: true },
  webp: { quality: 80, effort: 6 }, // 有损 webp，effort 拉满
  avif: { quality: 60, effort: 4 }, // avif q60 ≈ jpeg q80 观感、体积更小；effort 4 平衡耗时
  tiff: { compression: "lzw" }, // TIFF 罕见于 Web，保守用无损 LZW
  gif: { effort: 10 }, // 最大化 GIF 压缩（动图由 sharp 的 animated 选项处理）

  // SVG 目标 viewBox 宽度：放大到此宽度后整数取整 → 干掉小数又不变形。
  svgSize: 1024,

  // ── svgo 矢量参数 ──
  svg: {
    multipass: true,
    // floatPrecision 仅作为「含 filter 的复杂 SVG」的安全精度回退（简单 SVG 经放大后强制用 0）。
    // ⚠ 复杂 SVG 不可用 0：小 viewBox 整数化会把坐标吸附到 1 单位网格致变形；2 在该尺度下视觉无损。
    floatPrecision: 2,
    plugins: [
      "preset-default",
      "removeDimensions", // 去掉 width/height，保留 viewBox（更利于响应式）
      "sortAttrs",
    ],
  },
}
