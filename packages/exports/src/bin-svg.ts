#!/usr/bin/env node
/**
 * g-svg —— SVG 雪碧图 CLI（Vite 之外一次性生成）。
 * g-svg — the SVG sprite CLI (one-off generation outside Vite).
 *
 * 复用 svg-icons 的 runCli（已随本包打包）。用法：g-svg --config ./svg.config.ts
 * Reuses svg-icons' runCli (bundled). Usage: g-svg --config ./svg.config.ts
 * 编程调用见库导出 `gSvg(argv?)`。/ For programmatic use, import `gSvg(argv?)` from the package root.
 */
import { runCli } from 'svg-icons'

runCli().catch((err: unknown) => {
  console.error('[g-svg] 执行失败：', err)
  process.exit(1)
})
