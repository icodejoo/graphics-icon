/**
 * 位图雪碧图核心:枚举源图 → 量测 → 缓存判定 → maxrects 打包 → sharp 合成 → 编码 → 产边车。
 * 无 Vite 类型依赖,便于直接测试。
 *
 * Bitmap sprite-sheet core: enumerate → measure → cache check → maxrects pack → sharp compose → encode → sidecars.
 * No Vite type dependency, so it's directly testable.
 *
 * 关键决策 / Key decisions:
 *   · 单张图集:打包必须落一个 bin;溢出/单图过大 → 明确报错,绝不静默拆图。
 *   · allowRotation:false —— CSS background 切片不能旋转。
 *   · 源按文件名排序后再打包 → 跨机器布局可复现。
 *   · 缓存:对「源文件名 + 内容 hash + 关键配置」取指纹,未变且产物在 → 跳过(共享 @codejoo/utils/cache)。
 *   · 无 publicPath:CSS 用相对 url()、script 用相对 import,均交 Vite 解析。
 *   · 产物 *.sprite.{webp,png} 及本组产物路径,自动排除出源扫描(故产物可与源图同目录)。
 *   · sharp / maxrects-packer 在此函数内按需动态 import —— 仅导入插件工厂时绝不加载这些重依赖。
 */

import { existsSync, globSync, readFileSync } from "node:fs"
import { basename, extname, resolve } from "node:path"

import { buildStamp } from "@codejoo/utils/fingerprint"
import { toGlobList, matchesAnyGlob } from "@codejoo/utils/glob"
import { writeBufferIfChanged } from "@codejoo/utils/fs-write"
import { loadCache, saveCache, resolveCacheFile, pruneCache } from "@codejoo/utils/cache"

import { emitJson, emitScript, emitStyle } from "./emit.ts"

import type { Metadata } from "./sharp-types.ts"
import type { BitmapIconsConfig, BitmapIconsOptions, IconManifest, IconSheetMeta } from "./types.ts"

const SUPPORTED = /\.(png|jpe?g|webp|avif)$/i
const OUTPUT_NAMING = /\.sprite\.(png|jpe?g|webp|avif)$/i // 产物命名约定 → 永不当作源
// 产物格式版本:改变生成内容(如样式/脚本结构)时 +1,使旧缓存失效、强制重生成
const GENERATOR_VERSION = "3"

/** maxrects 矩形:addArray 后由 place() 就地写入 x/y,故自带 buf/name 直接可读。 */
interface Entry {
  width: number
  height: number
  x: number
  y: number
  name: string
  buf: Buffer
  oversized?: boolean
  rot?: boolean
}

export async function generateSheet(config: BitmapIconsConfig, cacheFile: string): Promise<void> {
  const { inputDir, output, padding = 2, maxWidth = 4096, maxHeight = 4096, pot = false, square = false, pixelRatio = 1, prefix = "sprite" } = config
  const includeGlobs = toGlobList(config.include)
  const include = includeGlobs.length > 0 ? includeGlobs : ["**/*.{png,jpg,jpeg,webp,avif}"]
  const exclude = toGlobList(config.exclude)
  const nameOf = config.nameTransformer ?? ((base: string) => base)

  // 图集格式由 output.image 扩展名决定
  const imgExt = extname(output.image).slice(1).toLowerCase()
  const format = imgExt === "png" ? "png" : imgExt === "webp" ? "webp" : null
  if (!format) throw new Error(`[bitmap-icons] output.image 扩展名须为 .png 或 .webp,得到 ".${imgExt}"`)

  const inputAbs = resolve(inputDir)
  // 本组产物的绝对路径 → 排除出源扫描(产物可与源同目录)
  const ownOut = new Set([output.image, output.style, output.script, output.json].filter((p): p is string => Boolean(p)).map((p) => resolve(p)))

  // 1) 枚举源图(命中 include & 支持扩展名 & 非产物命名 & 未被 exclude & 非本组产物),按名排序保证可复现
  let rels: string[]
  try {
    rels = globSync(include, { cwd: inputAbs })
  } catch {
    rels = []
  }
  const selected = rels
    .filter((rel) => SUPPORTED.test(rel) && !OUTPUT_NAMING.test(rel) && !matchesAnyGlob(rel, exclude) && !ownOut.has(resolve(inputAbs, rel)))
    .sort()
  if (selected.length === 0) {
    console.warn(`[bitmap-icons] ${inputDir} 无可打包图片,跳过`)
    return
  }

  // sharp 在此按需动态导入:仅导入插件工厂时不会加载/分配这个重依赖
  const sharp = (await import("sharp")).default

  // 2) 读入(一次读取,复用于 hash 与 sharp)+ 量测 + 命名校验/查重 + 累计指纹
  const entries: Entry[] = []
  const seen = new Map<string, string>()
  const hashPairs: Array<[string, Buffer]> = []
  for (const rel of selected) {
    const buf = readFileSync(resolve(inputAbs, rel))
    hashPairs.push([rel, buf])
    const name = nameOf(basename(rel, extname(rel)))
    if (!/^[a-zA-Z_][\w-]*$/.test(name)) throw new Error(`[bitmap-icons] 非法精灵名 "${name}"(来自 ${rel});需匹配 /^[a-zA-Z_][\\w-]*$/`)
    const prev = seen.get(name)
    if (prev) throw new Error(`[bitmap-icons] 精灵名冲突 "${name}":${prev} 与 ${rel}`)
    seen.set(name, rel)
    let meta: Metadata
    try {
      meta = await sharp(buf).metadata()
    } catch {
      throw new Error(`[bitmap-icons] 无法读取为图片:${rel}`)
    }
    if (!meta.width || !meta.height) throw new Error(`[bitmap-icons] 读不到尺寸:${rel}`)
    entries.push({ width: meta.width, height: meta.height, x: 0, y: 0, name, buf })
  }

  // 3) 缓存判定:源指纹 + 关键配置(含各产物路径,影响相对 url/import)未变 且 产物齐全 → 跳过
  //    指纹约定与 svg-icons 同源(@codejoo/utils/fingerprint),保证两插件 stamp 格式不漂移。
  const stamp = buildStamp(
    { v: GENERATOR_VERSION, padding, maxWidth, maxHeight, pot, square, pixelRatio, prefix, format, image: output.image, style: output.style, script: output.script ?? null, json: output.json ?? null },
    hashPairs,
  )
  const outFiles = [...ownOut]
  const cache = loadCache(cacheFile)
  if (cache[output.image] === stamp && outFiles.every((f) => existsSync(f))) {
    console.log(`[bitmap-icons] 命中缓存,跳过:${output.image}`)
    return
  }

  // maxrects-packer 同样按需动态导入
  const { MaxRectsPacker } = await import("maxrects-packer")

  // 4) 打包(⚠ allowRotation:false)
  const packer = new MaxRectsPacker<Entry>(maxWidth, maxHeight, padding, { smart: true, pot, square, allowRotation: false, border: 0 })
  packer.addArray(entries)

  // 5) 单 bin 约束
  const placed = packer.bins.flatMap((b) => b.rects)
  const oversized = placed.filter((r) => r.oversized)
  if (oversized.length > 0) {
    throw new Error(`[bitmap-icons] 以下精灵单张就超过 ${maxWidth}×${maxHeight},无法放入单张图集:\n${oversized.map((r) => `  · ${r.name} (${r.width}×${r.height})`).join("\n")}`)
  }
  if (packer.bins.length > 1) {
    throw new Error(`[bitmap-icons] ${placed.length} 张精灵在 ${maxWidth}×${maxHeight} 内放不下(需 ${packer.bins.length} 张图集)。请提高 maxWidth/maxHeight、减少精灵数,或拆成多组配置。`)
  }
  const bin = packer.bins[0]

  // 6) 合成到透明 RGBA 画布(buffer 复用,画布 = bin 边界故必然不越界)
  const canvas = sharp({ create: { width: bin.width, height: bin.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(bin.rects.map((r) => ({ input: r.buf, left: r.x, top: r.y })))

  // 7) 编码(默认 PNG 无损保 alpha;webp 走有损甜点,可透传覆盖)
  const encoded = format === "webp" ? canvas.webp(config.webp ?? { quality: 80, effort: 6 }) : canvas.png(config.png ?? { compressionLevel: 9, adaptiveFiltering: true })
  // 写出图集:仅当字节变化才落盘(与 css/script/json 的幂等写入一致,避免无谓 mtime/git 抖动)
  writeBufferIfChanged(resolve(output.image), await encoded.toBuffer())

  // 8) 清单(按名排序)+ 边车
  const manifest: IconManifest = {}
  for (const r of [...bin.rects].sort((a, b) => a.name.localeCompare(b.name))) {
    manifest[r.name] = { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  const sheet: IconSheetMeta = { width: bin.width, height: bin.height, pixelRatio }
  emitStyle(output.style, manifest, { prefix, imagePath: output.image, sheetW: bin.width, sheetH: bin.height, pixelRatio })
  if (output.script) emitScript(output.script, manifest, { imagePath: output.image, stylePath: output.style, sheet })
  if (output.json) emitJson(output.json, manifest, { imagePath: output.image, stylePath: output.style, sheet })

  // 9) 写回缓存
  cache[output.image] = stamp
  saveCache(cacheFile, cache)

  console.log(`[bitmap-icons] ${Object.keys(manifest).length} 张 → ${output.image} (${bin.width}×${bin.height})`)
}

/**
 * 引擎入口（Vite 之外可单独调用）：按 options 顺序生成所有图集 + 边车，并维护共享缓存。
 * 任一组出错即抛出（一次性生成语义）。命中缓存的组会被跳过。
 *
 * Standalone engine (usable outside Vite): generate every sheet + sidecars in order, maintaining the
 * shared cache. Throws on the first failing config (one-shot semantics); cache-hit configs are skipped.
 */
export async function generateBitmapSheets(options: BitmapIconsOptions): Promise<void> {
  const cacheFile = resolveCacheFile("bitmap-icons", options.cacheFile)
  pruneCache(
    cacheFile,
    options.sprites.map((c) => c.output.image),
    "[bitmap-icons]",
  )
  for (const c of options.sprites) await generateSheet(c, cacheFile)
}
