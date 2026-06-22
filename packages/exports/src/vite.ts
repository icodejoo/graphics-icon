// graphics-icon/vite —— 伞 Vite 插件(默认导出 graphicsIcon)+ 选项类型。
// 实现位于私有包 @graphics-icon/vite-umbrella(private,仅 workspace 可见)。
// 类型自包含说明:该包的 types 入口是裸 src/index.ts(非 .d.ts),tsup(rollup-dts)默认会把它当
// 外部包、原样保留 `from '@graphics-icon/vite-umbrella'`,导致发布后 TS 用户报 Cannot find module。
// 故在 tsconfig.json 里用 paths 把该包名映射到其源码,使 dts 把全部类型内联进 dist/vite.d.ts。
export { default, imageminVite } from '@graphics-icon/vite-umbrella'
export type {
  GraphicsIconOptions,
  ColorfontPluginOptions,
  SvgIconsPluginOptions,
  BitmapIconsPluginOptions,
  ImageminPluginOptions,
  ColorfontItem,
  ColorfontCommon,
  SvgIconsItem,
  SvgIconsCommon,
  BitmapIconsItem,
  BitmapIconsCommon,
  UnusedDetectOptions,
} from '@graphics-icon/vite-umbrella'
