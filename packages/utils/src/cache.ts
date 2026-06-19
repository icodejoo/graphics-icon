/**
 * 共享磁盘缓存 —— 三个插件共用的「键 → 字符串」JSON 缓存原语 + 共享缓存目录解析。
 * Shared on-disk cache — the "key → string" JSON primitives used by all three plugins,
 * plus resolution of the shared cache folder.
 *
 * 设计:
 *   · 所有缓存默认落在仓库根的同一个文件夹 `.cache.graphics/`(随仓库提交 → 团队共享)。
 *   · 每个子项目的缓存文件默认名 = 子项目名,即 `<name>.json`;可自定义(裸名或完整路径)。
 *   · 键按字母序写出,保证提交进 git 时 diff 稳定、不抖动。
 * Design:
 *   · Every cache defaults into one folder at the repo root, `.cache.graphics/` (commit it → team-shared).
 *   · Each sub-project's cache file defaults to `<name>.json`; customizable (bare name or full path).
 *   · Keys are written sorted so git diffs stay stable.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

/** 共享缓存文件夹(相对仓库根)。 / Shared cache folder (relative to repo root). */
export const CACHE_DIR = ".cache.graphics"

/**
 * 解析缓存文件绝对路径。
 *   · custom 省略           → `.cache.graphics/<defaultName>.json`(默认 = 子项目名)
 *   · custom 为裸文件名      → `.cache.graphics/<custom>.json`(支持自定义名字,仍落共享文件夹)
 *   · custom 含路径分隔符    → 按完整路径解析(完全自定义位置)
 * Resolve the absolute cache-file path.
 *   · no custom            → `.cache.graphics/<defaultName>.json` (default = sub-project name)
 *   · bare filename        → `.cache.graphics/<custom>.json` (custom name, still in the shared folder)
 *   · path with separators → resolved as an explicit path (fully custom location)
 */
export function resolveCacheFile(defaultName: string, custom?: string): string {
  if (!custom) return resolve(CACHE_DIR, `${defaultName}.json`)
  if (!/[\\/]/.test(custom)) {
    const fn = custom.endsWith(".json") ? custom : `${custom}.json`
    return resolve(CACHE_DIR, fn)
  }
  return resolve(custom)
}

/** 键 → 字符串 的缓存存储。 / A "key → string" cache store. */
export type CacheStore = Record<string, string>

/** 读取缓存(损坏/缺失 → 空)。 / Load cache (corrupt/missing → empty). */
export function loadCache(file: string): CacheStore {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CacheStore
  } catch {
    return {}
  }
}

/** 写回缓存(键排序 + 结尾换行 + 自动建目录)。 / Persist cache (sorted keys + trailing newline + mkdir). */
export function saveCache(file: string, store: CacheStore): void {
  mkdirSync(dirname(file), { recursive: true })
  const sorted: CacheStore = {}
  for (const k of Object.keys(store).sort()) sorted[k] = store[k]
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
}

/**
 * 启动时剪枝:删除「键不再属于任何当前实例」的条目,防止删除/重命名实例后缓存长期膨胀。
 * Startup pruning: drop entries whose key no longer belongs to any current instance,
 * so the cache file doesn't grow forever after instances are removed/renamed.
 * 返回被移除的条目数。 / Returns the number of removed entries.
 */
export function pruneCache(file: string, validKeys: Iterable<string>, label?: string): number {
  let cache: CacheStore
  try {
    cache = JSON.parse(readFileSync(file, "utf8")) as CacheStore
  } catch {
    return 0 // 无缓存文件 → 无需剪枝 / no cache file → nothing to prune
  }
  const valid = new Set(validKeys)
  const stale = Object.keys(cache).filter((k) => !valid.has(k))
  if (stale.length === 0) return 0
  for (const k of stale) delete cache[k]
  saveCache(file, cache)
  if (label) console.log(`${label} 缓存剪枝:移除 ${stale.length} 个失效条目 → ${file}`)
  return stale.length
}
