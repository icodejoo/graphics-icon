import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // 把 @colorfont/core 的源码内联进发布产物(这样无需把 core 作为已发布依赖);
  // core 的第三方库(opentype.js/svgo/...)与 vite 仍保持 external(分别是 deps / peer)。
  noExternal: ['@colorfont/core'],
  external: ['vite'],
})
