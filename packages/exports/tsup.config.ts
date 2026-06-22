import { defineConfig } from 'tsup'

export default defineConfig({
  // 6 个子路径出口 + 5 个 CLI bin。
  // /vite = 伞插件(@graphics-icon/vite-umbrella);/bitmap·/svg·/imagemin·/colorfont·/unused = 各引擎(引擎函数 + runCli + 类型)。
  entry: [
    'src/vite.ts',
    'src/bitmap.ts',
    'src/svg.ts',
    'src/imagemin.ts',
    'src/colorfont.ts',
    'src/unused.ts',
    'src/bin.ts',
    'src/bin-bitmap.ts',
    'src/bin-svg.ts',
    'src/bin-colorfont.ts',
    'src/bin-unused.ts',
  ],
  format: ['esm'],
  // 把私有 workspace 包(伞插件 + 引擎 + utils)的类型内联进本包 .d.ts,使发布后类型自包含。
  // resolve: true —— 让 dts 解析 node_modules 里的外部类型并内联。
  // 但 @graphics-icon/vite-umbrella 的 types 入口是裸 src/index.ts(非 .d.ts),rollup-dts 默认会把它
  // 当外部包、原样保留 `from '@graphics-icon/vite-umbrella'`(该包 private → 发布后 TS 用户报 Cannot find module)。
  // 故用 dts.compilerOptions.paths 把该包名映射到其源码,强制把伞插件全部选项类型内联进 dist/vite.d.ts。
  // (@codejoo/utils/glob 的同类问题无法走 paths —— rollup-dts 解析 utils/src/glob.ts 报错 —— 改在 src/imagemin.ts 内
  //  用本地显式签名实体化 matchesAnyGlob/toGlobList,见该文件。)
  dts: {
    resolve: true,
    compilerOptions: {
      baseUrl: __dirname,
      paths: {
        '@graphics-icon/vite-umbrella': ['../vite-plugin/src/index.ts'],
      },
    },
  },
  clean: true,
  treeshake: true,
  // 把伞插件 + 引擎 + utils 的源/产物内联进本包(自包含);vite 作为 peer 保持 external。
  noExternal: ['@graphics-icon/vite-umbrella', 'color-fonts', 'bitmap-icons', 'svg-icons', '@codejoo/imagemin', 'unused', '@codejoo/utils'],
  external: ['vite'],
})
