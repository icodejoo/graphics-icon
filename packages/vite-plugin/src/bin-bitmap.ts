#!/usr/bin/env node
/**
 * graphics-icon-bitmap —— 位图雪碧图 CLI（Vite 之外一次性生成）。
 * 复用 bitmap-icons 的 runCli（已随本包打包）。用法：graphics-icon-bitmap --config ./bitmap.config.ts
 */
import { runCli } from 'bitmap-icons'

runCli().catch((err: unknown) => {
  console.error('[graphics-icon-bitmap] 执行失败：', err)
  process.exit(1)
})
