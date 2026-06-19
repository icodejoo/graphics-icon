#!/usr/bin/env node
/**
 * graphics-icon-svg —— SVG 雪碧图 CLI（Vite 之外一次性生成）。
 * 复用 svg-icons 的 runCli（已随本包打包）。用法：graphics-icon-svg --config ./svg.config.ts
 */
import { runCli } from 'svg-icons'

runCli().catch((err: unknown) => {
  console.error('[graphics-icon-svg] 执行失败：', err)
  process.exit(1)
})
