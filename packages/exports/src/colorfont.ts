// graphics-icon/colorfont —— 彩色 webfont 引擎 + CLI + 类型(Vite 能力请走 graphics-icon/vite)。
//   build(单实例纯函数) / buildAndWrite(单实例落盘) / generateColorfonts(多实例批量) / runCli
export { build, buildAndWrite, generateColorfonts, runCli, serializeLockfile, readLockfile } from '@codejoo/colorfont'
export type { ColorfontOptions, ColorfontCommon, ColorfontItem, BuildResult, FontFormat, ColorFormat, FontAsset, FontFlavor, FontMetadata, GlyphMeta } from '@codejoo/colorfont'
