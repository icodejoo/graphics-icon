// graphics-icon/imagemin —— 图片压缩引擎 + CLI + 类型 + 默认配置(单例,无 items)。
import { imagemin, defaultOptions, matchesAnyGlob as _matchesAnyGlob, toGlobList as _toGlobList, runCli } from '@codejoo/imagemin'

// matchesAnyGlob/toGlobList 的类型实际来自 @codejoo/utils/glob(types 入口为裸 .ts,非 .d.ts):
// tsup(rollup-dts)既无法内联其类型(会原样保留 `from '@codejoo/utils/glob'`,该包 private → TS 用户断裂),
// 又无法用 tsconfig paths 把它当源码内联(rollup-dts 解析 glob.ts 报错)。
// 故在此用本地显式签名「实体化」这两个 glob 辅助函数的类型,彻底切断对 @codejoo/utils/glob 的类型转发。
const matchesAnyGlob: (path: string, globs: string[]) => boolean = _matchesAnyGlob
const toGlobList: (g?: string | string[]) => string[] = _toGlobList

// 主函数(引擎)imagemin —— 即项目名;亦作默认导出（两者同价）。
export { imagemin, defaultOptions, matchesAnyGlob, toGlobList, runCli }
export default imagemin
export type { ImageminOptions, FileResult, OptimizeResult } from '@codejoo/imagemin'
