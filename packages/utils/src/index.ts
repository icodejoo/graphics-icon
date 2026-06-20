/**
 * @codejoo/utils —— 套件公共子模块统一出口。
 * Barrel entry for the toolkit's shared submodule.
 *
 * 提示:追求极致按需加载时,建议直接从子路径引入(如 `@codejoo/utils/cache`),
 * 只拉取所需模块。重依赖(svgo/svgpath/scale-that-svg)在 scale-svg 内部动态导入,
 * 故即便从 barrel 引入也不会在未调用缩放时加载它们。
 * Tip: for maximal tree-shaking, import from subpaths (e.g. `@codejoo/utils/cache`).
 * Heavy deps (svgo/svgpath/scale-that-svg) are dynamically imported inside scale-svg, so the barrel
 * never loads them until a scaling function is actually called.
 */

export { sha256 } from "./hash.ts"
export { toGlobList, matchesAnyGlob } from "./glob.ts"
export { relTo } from "./path-rel.ts"
export { writeTextIfChanged, writeBufferIfChanged } from "./fs-write.ts"
export { CACHE_DIR, resolveCacheFile, loadCache, saveCache, pruneCache, groupCache, openPerFileCache } from "./cache.ts"
export type { CacheStore, GroupInput, GroupProduct, GroupCacheFile, GroupCacheArgs, GroupCacheResult, PerFileCache, PerFileAction } from "./cache.ts"
export { scaleSvgToWidth, normalizeSvg } from "./scale-svg.ts"
export type { NormalizeOptions } from "./scale-svg.ts"
