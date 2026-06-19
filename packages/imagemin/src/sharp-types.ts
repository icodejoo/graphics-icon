// sharp 0.35 用 `export = sharp`(函数+命名空间合并),选项类型在 namespace 内、无具名导出。
// `import type sharp from "sharp"` + `sharp.XxxOptions` 会让 rollup-plugin-dts(tsup dts)丢失命名空间绑定,
// 报 "Cannot find namespace 'sharp'"。改用内联 import() 类型,直接引用命名空间成员,可被 dts 打包器正确解析。
export type SharpOptions = import("sharp").SharpOptions
export type ResizeOptions = import("sharp").ResizeOptions
export type PngOptions = import("sharp").PngOptions
export type JpegOptions = import("sharp").JpegOptions
export type WebpOptions = import("sharp").WebpOptions
export type AvifOptions = import("sharp").AvifOptions
export type TiffOptions = import("sharp").TiffOptions
export type GifOptions = import("sharp").GifOptions
export type Sharp = import("sharp").Sharp
