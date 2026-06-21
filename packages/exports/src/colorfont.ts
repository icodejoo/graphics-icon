// graphics-icon/colorfont —— 彩色 webfont 引擎 + CLI + 类型(Vite 能力请走 graphics-icon/vite)。
//   build(单实例纯函数) / buildAndWrite(单实例落盘) / generateColorfonts(多实例批量) / runCli
import { build, buildAndWrite, generateColorfonts, runCli, serializeLockfile, readLockfile } from '@codejoo/colorfont'

// 主函数(多实例批量)generateColorfonts 另以项目名 colorfont 导出，并作为默认导出（三者同价）。
export { build, buildAndWrite, generateColorfonts, generateColorfonts as colorfont, runCli, serializeLockfile, readLockfile }
export default generateColorfonts
export type { ColorfontOptions, ColorfontCommon, ColorfontItem, BuildResult, FontFormat, ColorFormat, FontAsset, FontFlavor, FontMetadata, GlyphMeta } from '@codejoo/colorfont'
