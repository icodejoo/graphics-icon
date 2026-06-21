// graphics-icon/bitmap —— 位图雪碧图引擎 + CLI + 类型(Vite 能力请走 graphics-icon/vite)。
import { generateBitmapSheets, runCli } from 'bitmap-icons'

// 主函数 generateBitmapSheets 另以项目名 bitmapIcons 导出，并作为默认导出（三者同价）。
export { generateBitmapSheets, generateBitmapSheets as bitmapIcons, runCli }
export default generateBitmapSheets
export type { BitmapIconsOptions, BitmapIconsCommon, BitmapIconsItem, BitmapIconsConfig, BitmapIconsOutput, IconFrame, IconManifest, IconSheetMeta } from 'bitmap-icons'
