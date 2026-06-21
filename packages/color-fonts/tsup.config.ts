import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/cli.ts', 'src/cli/bin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // 第三方字体/svg 库保持 external(随包 deps 安装)。fflate 未使用,已移除。
  // scale-that-svg:本引擎不直接用,但内联的 @codejoo/utils/scale-svg 里有它的字面量 import()
  //(esbuild 会把字面量动态 import 也打成 chunk,无视可达性),故一并 external,避免 ~88KB 死代码进产物。
  external: ['svgo', 'svgpath', 'scale-that-svg', 'svg2ttf', 'opentype.js', 'cubic2quad', 'ttf2woff'],
  // @codejoo/utils 私有、以 .ts 源码形式被消费,内联进本包 dist(其惰性 import 的 svgo/svgpath 仍按上面 external)。
  noExternal: ['@codejoo/utils'],
})
