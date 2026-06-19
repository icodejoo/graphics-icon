/**
 * 位图雪碧图配置与产物类型。
 * 设计参考 spritesmith,但适配 Vite 插件 + sharp + maxrects-packer。
 *
 * Bitmap sprite-sheet config & output types.
 * Inspired by spritesmith, adapted for a Vite plugin built on sharp + maxrects-packer.
 */

// sharp 0.35+ 以命名空间默认导出暴露选项类型(无具名导出),故按命名空间引用(仅类型,运行时被擦除)。
// sharp 0.35+ exposes option types via its default-export namespace (no named exports), so reference them as sharp.X (type-only, erased at runtime).
import type { PngOptions, WebpOptions } from "./sharp-types.ts"

/**
 * 产物路径(均相对仓库根,可置于 src/ 下由 Vite 打包)。扩展名决定格式:
 *   image .webp/.png(默认 webp);style .css/.scss(内容相同);script .ts/.js。
 * 不再有 publicPath:CSS 用「style→image 的相对 url()」,script 用相对 import,均交 Vite 解析。
 *
 * Output paths (all relative to the repo root, may live under src/ for Vite to bundle).
 * The extension decides the format: image .webp/.png (webp default); style .css/.scss; script .ts/.js.
 * No publicPath — CSS uses a relative url() (style → image), script uses relative imports; Vite resolves both.
 */
export interface BitmapIconsOutput {
  /** 图集图片路径,如 "src/sprites/common.sprite.webp"。扩展名须为 .webp 或 .png。 */
  image: string
  /** 样式文件路径,如 "src/sprites/common.sprite.css"。其 url() 用到 image 的相对路径。 */
  style: string
  /** 可选:入口脚本,如 "src/sprites/common.sprite.ts"(或 .js)。相对 import style 与 image,
   *  并导出 iconsImage(图 URL)/iconsName;.ts 额外产 IconName 类型。
   *  调用方只需 import 这个脚本,无需关心 image/style 在哪。 */
  script?: string
  /** 可选:坐标 JSON(供 canvas/运行时),如 "src/sprites/common.sprite.json"。 */
  json?: string
}

/** 单组位图雪碧图配置。数组形式 => 生成多个独立的 sheet。 / One sprite-sheet config; an array yields multiple independent sheets. */
export interface BitmapIconsConfig {
  /** 源图目录(相对仓库根)。该目录下匹配 include/exclude 的位图会被打进一张 sheet。
   *  约定:产物命名 *.sprite.{webp,png} 会被自动排除出源扫描,故产物可与源图同目录。 */
  inputDir: string
  /** 产物路径集合(image/style 必填,script/json 可选)。 */
  output: BitmapIconsOutput

  /** 精灵之间的间隙(px)。默认 2,防止相邻切片采样溢色。 */
  padding?: number
  /** 单张 sheet 的最大宽/高(px)。默认 4096(安全 GPU 纹理上限)。 */
  maxWidth?: number
  maxHeight?: number
  /** sheet 尺寸取 2 的幂。默认 false。 */
  pot?: boolean
  /** sheet 强制为正方形。默认 false。 */
  square?: boolean

  /** 源图相对「逻辑像素」的倍率(@2x→2、@3x→3)。默认 1。
   *  仅影响固定 px 类(逻辑尺寸 = 源尺寸 / pixelRatio,并整体 background-size 缩放);
   *  自适应(fluid)类按比例计算,天然与密度无关。 */
  pixelRatio?: number

  /** 透传 sharp.png()(image 为 .png 时)。默认 { compressionLevel: 9, adaptiveFiltering: true }(无损保 alpha)。 */
  png?: PngOptions
  /** 透传 sharp.webp()(image 为 .webp 时)。默认 { quality: 80, effort: 6 }。 */
  webp?: WebpOptions

  /** CSS 类名前缀:基类 .${prefix} + 每图类 .${prefix}-${name}(单横线)。默认 "sprite"(可设 "icon" 等)。
   *  注:TS 产物导出名固定 iconsImage/iconsName/IconName,不随 prefix 变。 */
  prefix?: string
  /** 由源文件「基础名(无扩展名)」生成精灵名。默认原样。名字须匹配 /^[a-zA-Z_][\w-]*$/。 */
  nameTransformer?: (basename: string) => string

  /** 纳入的图片 glob(相对 inputDir)。默认 ["**\/*.{png,jpg,jpeg,webp,avif}"]。 */
  include?: string | string[]
  /** 排除的 glob(优先级高于 include)。默认 []。 */
  exclude?: string | string[]
}

/**
 * 插件入参(对象式):
 *   · sprites    —— 各实例配置(一个或多个 sheet)
 *   · cacheFile  —— 插件级缓存文件路径(整个插件只设一次,非实例级)。
 *                   省略 → 共享缓存目录下的 `.cache.graphics/bitmap-icons.json`(随仓库提交→团队共享)。
 *
 * Plugin options (object form):
 *   · sprites    —— per-instance configs (one or more sheets)
 *   · cacheFile  —— plugin-level cache-file path (set once for the whole plugin, not per instance).
 *                   Omit → `.cache.graphics/bitmap-icons.json` in the shared cache folder (commit it → team-shared).
 */
export interface BitmapIconsOptions {
  sprites: BitmapIconsConfig[]
  cacheFile?: string
}

/** 一个精灵在 sheet 中的位置与尺寸(均为图集实际像素)。 / A sprite's position & size in the sheet (actual sheet pixels). */
export interface IconFrame {
  x: number
  y: number
  width: number
  height: number
}

/** 名称 -> frame 映射。 / Name → frame map. */
export type IconManifest = Record<string, IconFrame>

/** sheet 元信息(写入 script / JSON)。 / Sheet metadata (written to script / JSON). */
export interface IconSheetMeta {
  width: number
  height: number
  pixelRatio: number
}
