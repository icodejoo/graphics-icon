import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // color-fonts 是私有 workspace 包,由发布包 graphics-icon 内联;vite 与 @iconify/utils 保持 external。
  external: ['vite', '@iconify/utils'],
})
