import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // 把公共子模块 @codejoo/utils 打进本包 dist;第三方保持 external。
  // 注意:@codejoo/utils 内部惰性 import 了 svgo/svgpath/scale-that-svg,内联 utils 时
  // 这些重依赖会被 esbuild 跟进打包(svgo ~1MB)。必须显式 external 并在 package.json 声明为 deps,
  // 否则产物会膨胀,且会顺着 svg-icons 的 dist 污染上游的 vite-plugin。
  noExternal: ['@codejoo/utils'],
  external: ['svgo', 'svgpath', 'scale-that-svg', 'vite-plugin-icons-spritesheet', 'vite'],
})
