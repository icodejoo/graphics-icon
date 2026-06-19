#!/usr/bin/env node
/**
 * graphics-icon-colorfont —— 彩色图标 webfont CLI（Vite 之外构建/校验码位）。
 * 复用 @codejoo/colorfont 的 runCli（已随本包打包）。用法见 colorfont CLI（build / check 等子命令）。
 */
import { runCli } from '@codejoo/colorfont'

runCli(process.argv.slice(2)).then(
  (code: number) => process.exit(code),
  (err: unknown) => {
    console.error('[graphics-icon-colorfont] 失败:', err)
    process.exit(1)
  },
)
