#!/usr/bin/env node
/**
 * g-min —— imagemin CLI（完全平替任意本地 imagemin 脚本）。
 * g-min — the imagemin CLI exposed by graphics-icon (a verbatim drop-in for a local imagemin script).
 *
 * 复用 @codejoo/imagemin 的 runCli（已随本包打包），能力与引擎完全对齐：
 * Reuses @codejoo/imagemin's runCli (bundled into this package); capabilities are fully aligned:
 *   g-min <图片...>                            # 指定文件(如 pre-commit 暂存的图片)
 *   g-min --all [目录...]                      # 全量扫描(缺省扫整个仓库根)
 *   g-min --all --config ./imagemin.config.ts  # 用项目配置覆盖默认值
 *
 * 只「压缩 + 更新缓存」，不碰 git。/ Only compresses + updates cache; never touches git.
 * 编程调用见库导出 `gMin(argv?)`。/ For programmatic use, import `gMin(argv?)` from the package root.
 */

import { runCli } from '@codejoo/imagemin'

runCli().catch((err: unknown) => {
  console.error('[g-min] 执行失败：', err)
  process.exit(1)
})
