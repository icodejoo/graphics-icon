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

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

import { writeBufferIfChanged, writeTextIfChanged } from "./fs-write.ts"

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

// ───────────────────────────────────────────────────────────────────────────
// 统一构建缓存策略 —— 四引擎共用,避免各写一份漂移。
// Unified build-cache strategies — shared by all four engines so the logic never drifts.
//
//   · groupCache    : grouped 引擎(svg / bitmap / colorfont)——「一组输入 → 一组产物」。
//       缓存 { configHash, files{相对路径:hash}, outputs[相对路径...], hash }。
//       outputs 只存「产物路径清单」(便宜:命中时 existsSync 校验、cache:false 删旧产物、清理残留);
//       hash 只是「一个必产代表产物(如 .css)的内容 hash」做内容级命中校验(不逐个 hash 全部产物)。
//   · openPerFileCache: imagemin —— 「逐文件就地处理」。缓存 { configHash, files{相对路径:hash} } + 反查表。
//
// 路径一律存「仓库根相对路径」(可团队共享 / 换机)。regenerate 抛错则不写缓存,错误向上抛。
// ───────────────────────────────────────────────────────────────────────────

const hashContent = (c: Buffer | Uint8Array | string): string => createHash("sha256").update(c).digest("hex")
/** 任意路径 → 仓库根相对(正斜杠)。 / Any path → repo-root-relative (forward slashes). */
const toRepoRel = (p: string): string => relative(process.cwd(), resolve(p)).replace(/\\/g, "/")
/** 仓库相对 → 绝对。 / Repo-relative → absolute. */
const fromRepoRel = (rel: string): string => resolve(process.cwd(), rel)
/** 安全读取并 hash 文件内容(读失败 → null)。 / Hash a file's content (null on read failure). */
const safeHashFile = (abs: string): string | null => {
  try {
    return hashContent(readFileSync(abs))
  } catch {
    return null
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T
  } catch {
    return null
  }
}

function rmIfExists(abs: string): void {
  try {
    rmSync(abs, { force: true })
  } catch {
    /* ignore */
  }
}

function sortRecord(o: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(o).sort()) out[k] = o[k]
  return out
}

/** 一个输入文件(路径 + 内容)。 / One input file (path + content). */
export interface GroupInput {
  path: string
  content: Buffer | string
}
/**
 * 一个产物。content 给出则由本层幂等写入(string→文本,二进制→字节);
 * content 省略则表示「regenerate 已自行写盘」(如 svg-icons 经第三方工具、bitmap 经 emit*),本层读回以计算 hash。
 * One product. If `content` is given, this layer writes it idempotently; if omitted, regenerate already
 * wrote it to disk (e.g. svg-icons via a 3rd-party tool, bitmap via emit*) and this layer reads it back to hash.
 */
export interface GroupProduct {
  path: string
  content?: Buffer | Uint8Array | string
}
/** grouped 缓存文件结构。 / grouped cache file shape. */
export interface GroupCacheFile {
  configHash: string
  /** 输入指纹:仓库相对路径 → 内容 hash。 / Input fingerprints. */
  files: Record<string, string>
  /** 全部产物的仓库相对路径(仅路径,不存 hash)。 / All product paths (paths only, no hashes). */
  outputs: string[]
  /** 代表产物(必产,如 .css)的内容 hash:命中时做内容校验。 / Representative product's content hash. */
  hash: string
}
export interface GroupCacheArgs {
  /** 已解析的实例缓存 json 绝对路径。 / Resolved absolute cache-json path for this instance. */
  cacheFile: string
  /** false → 删除该实例旧产物 + 缓存 json,强制重建。 / false → wipe old products + json, force rebuild. */
  cache: boolean
  /** sha(选项 + 引擎版本 + 其它非文件因素)。 / sha(options + engine version + non-file factors). */
  configHash: string
  /** 当前输入文件(路径 + 内容)。 / Current input files. */
  inputs: GroupInput[]
  /** 「必然产生」的代表产物路径,用于内容 hash 命中校验(如 colorfont/bitmap 的 .css、svg 的 sprite .svg)。 */
  representative: string
}
export interface GroupCacheResult {
  /** true = 命中(产物已在盘上且校验通过,跳过重建)。 / true = hit (outputs valid on disk, skipped). */
  hit: boolean
  /** 本次实际写盘的产物(仓库相对路径)。 / Products actually written this run. */
  written: string[]
  /** 本次清理掉的「上次有、这次没有」的旧产物。 / Stale products removed this run. */
  removed: string[]
}

function sameMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false // 数量不同(增/删) → 不一致
  for (const k of Object.keys(b)) if (a[k] !== b[k]) return false // 新路径不在 / hash 不同
  return true
}

/** 全部产物仍在盘上(便宜:仅 existsSync,抓任意产物被删)。 / All products still on disk (cheap). */
function allOutputsExist(outputs: string[]): boolean {
  return outputs.every((rel) => existsSync(fromRepoRel(rel)))
}

function writeProduct(path: string, content: Buffer | Uint8Array | string): boolean {
  return typeof content === "string" ? writeTextIfChanged(path, content) : writeBufferIfChanged(path, content)
}

/**
 * grouped 引擎统一缓存。`regenerate()` 仅在未命中时调用,返回本实例全部产物;本函数负责幂等落盘 + 写缓存 + 清理旧产物。
 * 命中判定(任一不满足即重建):缓存存在 · configHash 一致 · files 非空且完全一致(数量+路径+hash) ·
 *   全部产物 existsSync · 代表产物内容 hash 一致。
 * `regenerate()` 抛错 → 向上抛(不写缓存,下次重试)。`cache:false` → 先删旧产物 + 缓存 json 再重建。
 */
export async function groupCache(args: GroupCacheArgs, regenerate: () => Promise<GroupProduct[]>): Promise<GroupCacheResult> {
  const { cacheFile, cache, configHash, inputs, representative } = args
  let prev = readJson<GroupCacheFile>(cacheFile)

  if (cache === false) {
    // cache:false → 删除该实例旧产物(从缓存读路径)+ 缓存 json,再强制重建。
    if (prev?.outputs) for (const rel of prev.outputs) rmIfExists(fromRepoRel(rel))
    rmIfExists(cacheFile)
    prev = null
  }

  // 当前输入指纹(相对路径 → 内容 hash)
  const files: Record<string, string> = {}
  for (const it of inputs) files[toRepoRel(it.path)] = hashContent(it.content)

  // 命中:跳过重建(输入未变 + 全部产物在盘 + 代表产物内容一致)
  const repRel = toRepoRel(representative)
  if (
    prev &&
    prev.configHash === configHash &&
    Object.keys(prev.files).length > 0 &&
    sameMap(prev.files, files) &&
    allOutputsExist(prev.outputs) &&
    safeHashFile(fromRepoRel(repRel)) === prev.hash
  ) {
    return { hit: true, written: [], removed: [] }
  }

  // 未命中 → 重建(抛错则向上传播,不写缓存)
  const products = await regenerate()
  const written: string[] = []
  const outputs: string[] = []
  let repHash = "" // 代表产物的内容 hash
  for (const p of products) {
    const rel = toRepoRel(p.path)
    let content = p.content
    if (content !== undefined) {
      if (writeProduct(p.path, content)) written.push(rel) // 本层幂等写入
    } else {
      content = readFileSync(fromRepoRel(rel)) // regenerate 已写盘 → 读回算 hash
    }
    outputs.push(rel)
    if (rel === repRel) repHash = hashContent(content)
  }
  if (!repHash) throw new Error(`groupCache: 代表产物未在产物列表中: ${representative}`)

  // 清理「上次有、这次没有」的旧产物(如 colorfont 内容哈希文件名变化后的残留)
  const removed: string[] = []
  if (prev?.outputs) {
    const now = new Set(outputs)
    for (const rel of prev.outputs) if (!now.has(rel)) { rmIfExists(fromRepoRel(rel)); removed.push(rel) }
  }

  mkdirSync(dirname(cacheFile), { recursive: true })
  const data: GroupCacheFile = { configHash, files: sortRecord(files), outputs: [...outputs].sort(), hash: repHash }
  writeFileSync(cacheFile, `${JSON.stringify(data, null, 2)}\n`)
  return { hit: false, written, removed }
}

/** imagemin 逐文件缓存的判定结果。 / Per-file cache decision. */
export type PerFileAction = "process" | "skip" | "moved"
/** imagemin 逐文件缓存(含反查表)。 / Per-file cache (with reverse map). */
export interface PerFileCache {
  /** 基于 路径 + 内容hash 判定:命中路径→skip;命中反查表(改名/移动)→moved(迁移 key);否则 process。 */
  decide(relPath: string, contentHash: string): PerFileAction
  /** process 后记录该文件「最终内容」的 hash。 / After processing, record the final content hash. */
  record(relPath: string, finalHash: string): void
  /** 写回缓存(configHash + files,键排序)。 / Persist (configHash + files, sorted). */
  save(): void
}
interface PerFileCacheFile {
  configHash: string
  files: Record<string, string>
}

/**
 * 打开 imagemin 逐文件缓存。configHash 不一致(压缩参数/版本变更)→ 旧表整体作废,全部重处理。
 * 启动时携带「仍存在于磁盘」的旧条目(剪枝已删除的);本次处理的由 decide/record 覆盖。
 * 反查表:内容 hash → 旧路径,识别改名/移动的文件(内容未变)→ 仅迁移 key、不重处理。
 */
export function openPerFileCache(cacheFile: string, configHash: string): PerFileCache {
  const prev = readJson<PerFileCacheFile>(cacheFile)
  const old: Record<string, string> = prev && prev.configHash === configHash ? (prev.files ?? {}) : {}
  const reverse = new Map<string, string>() // finalHash → 旧相对路径
  for (const [rel, h] of Object.entries(old)) reverse.set(h, rel)

  const temp: Record<string, string> = {}
  // 携带仍在磁盘的旧条目(删除的就此剪枝);本次处理的会被 decide/record 覆盖
  for (const [rel, h] of Object.entries(old)) if (existsSync(fromRepoRel(rel))) temp[rel] = h

  return {
    decide(relPath, contentHash) {
      if (old[relPath] === contentHash) { temp[relPath] = contentHash; return "skip" } // 同路径内容未变
      if (reverse.has(contentHash)) { temp[relPath] = contentHash; return "moved" } // 改名/移动:迁移 key 到新路径
      return "process"
    },
    record(relPath, finalHash) {
      temp[relPath] = finalHash
    },
    save() {
      mkdirSync(dirname(cacheFile), { recursive: true })
      writeFileSync(cacheFile, `${JSON.stringify({ configHash, files: sortRecord(temp) }, null, 2)}\n`)
    },
  }
}
