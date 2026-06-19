/**
 * 图片压缩核心 —— sharp（位图） + svgo（矢量）
 * Image compression engine — sharp (bitmaps) + svgo (vectors).
 *
 * 哈希缓存机制（避免对同一张图重复压缩，且可随源码提交、团队共享）：
 *   缓存结构为 `{ 相对路径: 压缩后(最终落盘)内容的 hash }`，提交进 git。
 *   1. 运行时读取 JSON 到 `old`；同时把所有 value 收进 `reverse` 反查表（指纹 → 路径），
 *      并把"磁盘上仍存在的条目"搬进临时对象 `temp`
 *      —— 不存在的文件条目（已删除/被移走的旧路径）就此被剪枝（防 JSON 膨胀）。
 *   2. 处理每张图前先算它当前内容的 hash，命中以下任一即跳过：
 *        · `old[path] === hash` → 同路径内容未变（最常见）
 *        · `reverse.has(hash)` → 内容指纹此前已压缩过 ⇒ 文件被
 *          移动/重命名/复制：路径变了但内容是旧的"最终成品"，无需再压。
 *      否则压缩；仅当结果更小才写回磁盘；再把"磁盘最终内容"的 hash 写入 `temp[path]`。
 *   3. 结束后把 `temp` 写回 JSON（重命名后的新路径随之"接管"该条目）。
 *
 *   团队协作：拉取仓库后图片与缓存同源 → hash 命中 → 不再重复压缩。
 *   重命名/移动友好：缓存以"内容指纹"为准而非路径，挪动文件不会触发重复压缩。
 *   安全性：只有"压缩后更小"才写回，否则保留原图，绝不劣化或反向增大。
 *
 * sharp / svgo 为重依赖，全部在 compress() 内「动态导入」：仅当真正压缩时才加载，
 * 故仅导入本引擎 API 不会拉起 sharp/svgo。
 * sharp / svgo are heavy deps, dynamically imported inside compress(): importing the engine
 * API never loads them until compression actually runs.
 */

import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { extname, relative } from "node:path"

import { resolveCacheFile, loadCache, saveCache } from "@codejoo/utils/cache"
import { matchesAnyGlob, toGlobList } from "@codejoo/utils/glob"
import { sha256 } from "@codejoo/utils/hash"
import { scaleSvgToWidth } from "@codejoo/utils/scale-svg"

// sharp 0.35+ 以命名空间默认导出暴露选项类型(无具名导出),故按 sharp.X 引用(仅类型,运行时擦除)。
// sharp 0.35+ exposes option types via its default-export namespace (no named exports) -> reference as sharp.X (type-only).
import type { SharpOptions, ResizeOptions, PngOptions, JpegOptions, WebpOptions, AvifOptions, TiffOptions, GifOptions, Sharp } from "./sharp-types.ts"
import type { Config as SvgoConfig } from "svgo"

// 转发 glob 助手，便于 CLI / 调用方从本引擎一处导入（语义与 @codejoo/utils/glob 完全一致）。
// Re-export the glob helpers so the CLI / callers can import them from one place.
export { matchesAnyGlob, toGlobList } from "@codejoo/utils/glob"

export interface ImageminOptions {
  /** 仅处理匹配这些 glob 的文件（include）；可传单个或数组，如 "**\/*.{png,svg}" */
  include: string | string[]
  /** 命中这些 glob 的文件跳过（exclude，优先级高于 include）；可传单个或数组 */
  exclude?: string | string[]
  /**
   * 哈希缓存 JSON 路径（可选）。
   *   · 省略       → 落共享缓存目录 `.cache.graphics/imagemin.json`（随源码提交以便团队共享）。
   *   · 裸文件名   → `.cache.graphics/<name>.json`。
   *   · 含路径分隔 → 按完整路径解析（完全自定义位置）。
   * Hash-cache JSON path (optional). Omit → shared `.cache.graphics/imagemin.json`.
   */
  cacheFile?: string
  /** 打印每张图的压缩统计 */
  logStats?: boolean
  /** 同时处理的图片数（并发）。默认 8 以平衡速度与内存 */
  concurrency?: number

  // ── 位图：以下均为对应底层依赖的「完整」选项对象，直接透传 ──
  /** sharp 构造参数（animated / failOn / limitInputPixels / density / pages …） */
  sharpOptions?: SharpOptions
  /** 统一缩放（在编码前应用） */
  resize?: ResizeOptions
  /** 保留元数据（默认 sharp 会剥离以减小体积） */
  keepMetadata?: boolean
  /** 按 EXIF 方向自动旋转 */
  rotate?: boolean
  /** sharp.png() 全部选项 */
  png?: PngOptions
  /** sharp.jpeg() 全部选项 */
  jpeg?: JpegOptions
  /** sharp.jpeg() 全部选项（.jpg 扩展名专用，缺省回退 jpeg） */
  jpg?: JpegOptions
  /** sharp.webp() 全部选项 */
  webp?: WebpOptions
  /** sharp.avif() 全部选项 */
  avif?: AvifOptions
  /** sharp.tiff() 全部选项 */
  tiff?: TiffOptions
  /** sharp.gif() 全部选项 */
  gif?: GifOptions

  // ── 矢量：svgo 的「完整」Config，直接透传 ──
  /** svgo optimize() 的完整配置（plugins / multipass / js2svg / floatPrecision …） */
  svg?: SvgoConfig
  /**
   * SVG 目标 viewBox 宽度（防小 viewBox 整数化变形）。默认 1024。
   *   · number → 把无 <filter> 的 SVG 等比放大到该宽度，再用 floatPrecision:0 整数取整
   *     （大坐标系整数化误差 <0.05%：干掉小数又不变形）。归一化结果即使字节略增也会强制写回。
   *   · false / 0 → 不归一化。
   *   · (filename, size) => number | falsy → 按文件定制：size 为该 SVG 当前 viewBox 宽度，
   *     返回目标宽度；返回 falsy 则该图不归一化（走安全精度 svg.floatPrecision ?? 2）。
   *   · 含 <filter> 的复杂 SVG（stdDeviation 等难缩放）一律不归一化、用安全精度。
   */
  svgSize?: number | false | ((filename: string, size: number) => number | false | null | undefined)
}

export interface FileResult {
  file: string
  /** 命中缓存被跳过 */
  skipped: boolean
  /** 因重命名/移动/复制（内容指纹命中）而跳过：仅迁移了缓存 key */
  moved?: boolean
  /** 磁盘内容是否被改写（用于判断是否需要重新 stage） */
  changed: boolean
  before: number
  after: number
  error?: string
}

export interface OptimizeResult {
  results: FileResult[]
  /** 实际被改写的文件（相对路径，供 git 重新 stage） */
  changed: string[]
  /** 实际使用的缓存文件绝对路径 */
  cacheFile: string
}

/** 相对路径 -> 压缩后内容的 hash */
type HashStore = Record<string, string>

const kib = (n: number): string => `${(n / 1024).toFixed(2)} KiB`

const toRel = (file: string): string => relative(process.cwd(), file).replace(/\\/g, "/")

/** compress 结果：data=压缩后字节；force=即使不更小也写回（用于 SVG 归一化这类"有意变换"）。 */
interface CompressResult {
  data: Buffer
  force: boolean
}

/**
 * 调 sharp / svgo 压缩；不支持的格式返回 null。file 为相对路径，供 svgSize 函数定制。
 * sharp 与 svgo 在此「动态导入」—— 仅当真正压缩时才加载这两个重依赖。
 */
async function compress(buf: Buffer, ext: string, o: ImageminOptions, file: string): Promise<CompressResult | null> {
  if (ext === "svg") {
    const { optimize } = await import("svgo")
    const text = buf.toString("utf8")
    const base = o.svg ?? {}
    const hasFilter = /<filter[\s>]/i.test(text)
    // 当前 viewBox 宽度（取第 3 个数）；解析目标宽度
    const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(text)
    const curW = vb ? Number(vb[1].split(/[\s,]+/)[2]) : 0
    const sizeOpt = o.svgSize ?? 1024
    const target = typeof sizeOpt === "function" ? sizeOpt(file, curW) : sizeOpt

    // 简单 SVG（无 filter）且目标有效：等比放大到 target 烘焙坐标 → floatPrecision:0 整数取整（无损）。
    // 归一化是"有意变换"，force=true → 即使字节略增也写回，保证 viewBox 统一。
    if (!hasFilter && target && target > 0 && curW > 0) {
      const scaled = await scaleSvgToWidth(text, target)
      const { data } = optimize(scaled, { ...base, floatPrecision: 0 })
      return { data: Buffer.from(data, "utf8"), force: true }
    }
    // 含 filter / 关闭归一化：不放大，安全精度，仅"更小"才写回。
    const { data } = optimize(text, { ...base, floatPrecision: base.floatPrecision ?? 2 })
    return { data: Buffer.from(data, "utf8"), force: false }
  }

  const sharp = (await import("sharp")).default
  let img = sharp(buf, { animated: true, failOn: "none", ...o.sharpOptions })
  if (o.rotate) img = img.rotate()
  if (o.resize) img = img.resize(o.resize)
  if (o.keepMetadata) img = img.keepMetadata()

  let encoded: Sharp
  switch (ext) {
    case "png":
      encoded = img.png(o.png)
      break
    case "jpg":
    case "jpeg":
      encoded = img.jpeg(o.jpg ?? o.jpeg)
      break
    case "webp":
      encoded = img.webp(o.webp)
      break
    case "avif":
      encoded = img.avif(o.avif)
      break
    case "tif":
    case "tiff":
      encoded = img.tiff(o.tiff)
      break
    case "gif":
      encoded = img.gif(o.gif)
      break
    default:
      return null
  }
  return { data: await encoded.toBuffer(), force: false }
}

/** 有上限的并发执行（无第三方依赖） */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

export async function optimizeImages(files: string[], options: ImageminOptions): Promise<OptimizeResult> {
  // 缓存文件：可选；省略时落共享目录 .cache.graphics/imagemin.json
  const cacheFile = resolveCacheFile("imagemin", options.cacheFile)

  const old = loadCache(cacheFile) as HashStore // 正向表：相对路径 → 最终成品 hash
  const temp: HashStore = {}

  // 反查表：最终成品 hash → 相对路径。用于识别被移动/重命名/复制的文件——
  // 新路径不在正向表里，但其内容 hash 命中反查表，说明内容是旧成品，无需重压。
  const reverse = new Map<string, string>()
  for (const [path, hash] of Object.entries(old)) reverse.set(hash, path)

  // 删除：剪枝磁盘上已不存在的条目（含删除的图、重命名前的旧路径）→ 其 key 就此移除
  for (const [path, hash] of Object.entries(old)) {
    if (existsSync(path)) temp[path] = hash
  }

  // 只处理"存在 & 命中 include glob & 未命中 exclude glob"的文件；删除项（清单里但磁盘已无）
  // 在此被滤掉，其缓存 key 已由上面的剪枝移除，故无需进入压缩循环。
  const include = toGlobList(options.include)
  const exclude = toGlobList(options.exclude)
  const targets = files.filter((f) => {
    if (!existsSync(f)) return false
    const rel = toRel(f)
    return matchesAnyGlob(rel, include) && !matchesAnyGlob(rel, exclude)
  })
  const limit = options.concurrency ?? 8

  const results = await mapPool(targets, limit, async (file): Promise<FileResult> => {
    const rel = toRel(file)
    try {
      const buf = await readFile(file)
      const hash = sha256(buf)

      // ── 逐文件判定（优先看路径，再看内容 hash）──
      if (rel in old) {
        // 路径在缓存：① hash 一致 → 未变，跳过；② 不一致 → 内容已改(modified)，下方压缩
        if (old[rel] === hash) {
          temp[rel] = hash
          return { file: rel, skipped: true, changed: false, before: buf.length, after: buf.length }
        }
      } else if (reverse.has(hash)) {
        // 路径不在缓存，但内容指纹命中 → 重命名/移动/复制：仅把 key 迁到新路径，不重压
        temp[rel] = hash
        return { file: rel, skipped: true, moved: true, changed: false, before: buf.length, after: buf.length }
      }
      // 其余：路径不在缓存且指纹未命中 = 新增；或路径在缓存但内容已改 = 修改 → 压缩

      const ext = extname(file).slice(1).toLowerCase()
      const out = await compress(buf, ext, options, rel)

      // 写回条件：内容确有变化 且（force=有意变换 / 或结果更小）。
      //   · 普通压缩：仅"更小"才写回，绝不放大；
      //   · SVG 归一化(force)：即使略大也写回，以落实"viewBox 统一"。
      let finalBuf: Buffer = buf
      if (out && out.data.length > 0 && !out.data.equals(buf) && (out.force || out.data.length < buf.length)) {
        finalBuf = out.data
        // 以 Uint8Array 视图写出:规避 @types/node 24 中 Buffer<ArrayBufferLike> 与 NonSharedBuffer 的类型摩擦。
        // Write as a Uint8Array view to sidestep @types/node 24's Buffer<ArrayBufferLike> vs NonSharedBuffer friction.
        await writeFile(file, new Uint8Array(finalBuf.buffer, finalBuf.byteOffset, finalBuf.byteLength))
      }

      temp[rel] = sha256(finalBuf) // 存"磁盘最终内容"的 hash
      return { file: rel, skipped: false, changed: finalBuf !== buf, before: buf.length, after: finalBuf.length }
    } catch (err) {
      // 单张图失败不阻断提交：不写缓存 → 下次自动重试
      return { file: rel, skipped: false, changed: false, before: 0, after: 0, error: String((err as Error)?.message ?? err) }
    }
  })

  saveCache(cacheFile, temp)

  if (options.logStats) printStats(results)

  return {
    results,
    changed: results.filter((r) => r.changed).map((r) => r.file),
    cacheFile,
  }
}

function printStats(results: FileResult[]): void {
  const processed = results.filter((r) => !r.skipped && !r.error)
  const skipped = results.filter((r) => r.skipped)
  const failed = results.filter((r) => r.error)

  for (const r of processed) {
    if (r.changed) {
      const pct = (((r.before - r.after) / r.before) * 100).toFixed(1)
      console.log(`  ✓ ${r.file}  ${kib(r.before)} → ${kib(r.after)}  (-${pct}%)`)
    } else {
      console.log(`  · ${r.file}  已最优，保留原图`)
    }
  }
  for (const r of skipped) console.log(`  ⟳ ${r.file}  ${r.moved ? "重命名/移动，仅迁移缓存 key" : "命中缓存，跳过"}`)
  for (const r of failed) console.warn(`  ✗ ${r.file}  压缩失败：${r.error}`)
  const before = processed.reduce((s, r) => s + r.before, 0)
  const after = processed.reduce((s, r) => s + r.after, 0)
  const tail = before > 0 ? `，共省 ${kib(before - after)} (${(((before - after) / before) * 100).toFixed(1)}%)` : ""
  console.log(`[imagemin] 处理 ${processed.length}，跳过 ${skipped.length}，失败 ${failed.length}${tail}`)
}
