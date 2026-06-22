#!/usr/bin/env node
/**
 * color-fonts —— 彩色图标 webfont CLI（Vite 之外构建/校验码位）。
 * color-fonts — the color-icon webfont CLI (build / verify codepoints outside Vite).
 *
 * 复用 color-fonts 的 runCli（已随本包打包）。用法见 colorfont CLI（build / watch / check 子命令）。
 * Reuses color-fonts's runCli (bundled). See the colorfont CLI (build / watch / check subcommands).
 * 编程调用见子路径 `graphics-icon/colorfont` 的 `runCli`。/ For programmatic use, import `runCli` from `graphics-icon/colorfont`.
 */
import { runCli } from 'color-fonts'

runCli(process.argv.slice(2)).then(
  (code: number) => process.exit(code),
  (err: unknown) => {
    console.error('[color-fonts] 失败:', err)
    process.exit(1)
  },
)
