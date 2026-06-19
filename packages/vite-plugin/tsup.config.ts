import { defineConfig } from 'tsup'

export default defineConfig({
  // 入口:库出口 + 4 个 CLI bin(imagemin/bitmap/svg/colorfont),各引擎在 Vite 之外可命令行运行。
  entry: ['src/index.ts', 'src/bin.ts', 'src/bin-bitmap.ts', 'src/bin-svg.ts', 'src/bin-colorfont.ts'],
  format: ['esm'],
  // dts.resolve:把这些私有 workspace 包的类型「内联」进本包 .d.ts(否则消费方无法解析 bitmap-icons /
  // svg-icons / @codejoo/* 的类型导入)。使本包发布后类型自包含、可被任意工程直接 type-check。
  dts: { resolve: [/^bitmap-icons/, /^svg-icons/, /^@codejoo\//] },
  clean: true,
  treeshake: true,
  // 把 workspace 源(各引擎)内联进产物;vite 作为 peer 保持 external。
  // Bundle the workspace source (engines) into the artifact; keep vite external (peer).
  noExternal: ['@codejoo/colorfont', 'bitmap-icons', 'svg-icons', '@codejoo/imagemin', '@codejoo/utils'],
  external: ['vite'],
})
