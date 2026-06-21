// graphics-icon/imagemin —— 图片压缩引擎 + CLI + 类型 + 默认配置(单例,无 items)。
import { optimizeImages, defaultOptions, matchesAnyGlob, toGlobList, runCli } from '@codejoo/imagemin'

// 主函数 optimizeImages 另以项目名 imagemin 导出，并作为默认导出（三者同价）。
export { optimizeImages, optimizeImages as imagemin, defaultOptions, matchesAnyGlob, toGlobList, runCli }
export default optimizeImages
export type { ImageminOptions, FileResult, OptimizeResult } from '@codejoo/imagemin'
