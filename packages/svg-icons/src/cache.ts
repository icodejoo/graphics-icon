/**
 * svg-icons 缓存（原理同套件内 bitmap / imagemin）：
 *   对「源 svg 文件名+内容 hash + 关键配置 + 生成器版本」取指纹 stamp，
 *   存入插件级 JSON（键=输出 svg 路径）。启动时算 stamp，命中且产物齐全 → 跳过重新生成。
 *
 * svg-icons cache (same idea as the toolkit's bitmap / imagemin): fingerprint the source svg
 * names+content hashes + key config + generator version into a stamp, stored in a plugin-level JSON
 * (key = output svg path). On startup compute the stamp; on hit with all outputs present → skip.
 *
 * hash / loadCache / saveCache / pruneCache 与共享缓存目录均复用 @codejoo/utils（与 bitmap/imagemin 同源）。
 * hashing / loadCache / saveCache / pruneCache and the shared cache folder all reuse @codejoo/utils.
 */

import { existsSync, globSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildStamp } from "@codejoo/utils/fingerprint"
import { loadCache, saveCache } from "@codejoo/utils/cache"

import type { ColorOption, NormalizeOption, SvgIconsConfig } from "./types.ts"

// 生成器版本：改变后处理逻辑（作用域化/颜色/归一化/script 结构/output 形态）时 +1，使旧缓存失效
// Generator version: bump when post-processing changes (scoping/color/normalize/script/output) to bust cache.
const GENERATOR_VERSION = "4"

// 函数无法稳定序列化 → 用 toString() 参与指纹（改了转换/颜色函数即视为配置变化）
function serializeColor(c: ColorOption): string {
  return typeof c === "function" ? `fn:${c.toString()}` : JSON.stringify(c ?? null)
}

// normalize 与 color 同样序列化进指纹：切换开关/宽度即视为配置变化 → 失效缓存。
// Serialize normalize into the fingerprint like color: toggling it / changing width busts the cache.
function serializeNormalize(n: NormalizeOption): string {
  return JSON.stringify(n ?? null)
}

/** 枚举源目录下所有 svg（按名排序），与关键配置一起算出指纹。 */
export function computeStamp(c: SvgIconsConfig): string {
  const dir = resolve(c.input)
  let rels: string[] = []
  try {
    rels = globSync("**/*.svg", { cwd: dir })
  } catch {
    rels = []
  }
  rels.sort()

  const pairs: Array<[string, Buffer]> = []
  for (const rel of rels) {
    try {
      pairs.push([rel, readFileSync(resolve(dir, rel))])
    } catch {
      // 读不到就略过（下次仍会因缺失而 miss）
    }
  }

  // 指纹约定与 bitmap-icons 同源(@codejoo/utils/fingerprint),保证两插件 stamp 格式不漂移。
  return buildStamp(
    {
      v: GENERATOR_VERSION,
      input: c.input,
      svg: c.output.svg,
      script: c.output.script ?? null,
      color: serializeColor(c.color),
      normalize: serializeNormalize(c.normalize),
      nameTransformer: c.iconNameTransformer?.toString() ?? null,
      formatter: c.formatter ?? null,
    },
    pairs,
  )
}

/** 命中判定：缓存里该输出的 stamp 一致 且 产物（svg + 可选 script）都在。 */
export function isCached(c: SvgIconsConfig, stamp: string, cacheFile: string): boolean {
  const cache = loadCache(cacheFile)
  if (cache[c.output.svg] !== stamp) return false
  const outputs = [c.output.svg, ...(c.output.script ? [c.output.script] : [])]
  return outputs.every((f) => existsSync(resolve(f)))
}

/** 写回某输出的 stamp。 */
export function writeStamp(c: SvgIconsConfig, stamp: string, cacheFile: string): void {
  const cache = loadCache(cacheFile)
  cache[c.output.svg] = stamp
  saveCache(cacheFile, cache)
}
