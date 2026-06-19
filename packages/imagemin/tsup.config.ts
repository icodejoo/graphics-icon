import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  // 内联 @codejoo/utils 的类型(matchesAnyGlob/toGlobList),使本包 .d.ts 自包含、可被消费方解析。
  dts: { resolve: [/^@codejoo\//] },
  clean: true,
  treeshake: true,
  // 把公共子模块 @codejoo/utils 打进本包 dist;第三方保持 external。
  // @codejoo/utils 惰性 import 了 svgpath/scale-that-svg,内联 utils 时会被跟进打包。
  // svgo/sharp 已在 deps(tsup 自动 external),此处补 svgpath/scale-that-svg 并在 package.json 声明为 deps。
  noExternal: ['@codejoo/utils'],
  external: ['sharp', 'svgo', 'svgpath', 'scale-that-svg'],
})
