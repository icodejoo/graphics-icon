/**
 * 位图雪碧图 Vite 插件:每组配置生成一张图集 + 边车文件。
 * 钩子与 svg-sprite 一致(buildStart 覆盖 build/dev 启动;watchChange/handleHotUpdate 监听源目录),
 * 且每组生成幂等(内容未变不写盘 → 不触发 HMR 循环)。
 *
 * Bitmap sprite-sheet Vite plugin: each config emits one sheet + sidecars.
 * Hooks mirror svg-sprite; every emit is idempotent (no write when unchanged → no HMR loop).
 *
 * 错误处理:build 下硬失败(中断构建);dev 下单组失败仅告警、不拖垮已启动的开发服务器。
 * Error handling: hard-fail on build; warn-only per config on dev.
 */

import { isAbsolute, relative, resolve } from "node:path"

import { resolveCacheFile, pruneCache } from "@codejoo/utils/cache"

import { generateSheet } from "./generate-sheet.ts"

import type { BitmapIconsConfig, BitmapIconsOptions } from "./types.ts"
import type { Plugin } from "vite"

export function bitmapIcons(options: BitmapIconsOptions): Plugin {
  const configs: BitmapIconsConfig[] = options.sprites
  // 插件级缓存(整插件一份):省略 → 共享缓存目录 .cache.graphics/bitmap-icons.json
  const cacheFile = resolveCacheFile("bitmap-icons", options.cacheFile)
  const roots = configs.map((c) => resolve(c.inputDir))
  // 各组自身产物的绝对路径:写它们不应触发重生成(产物可与源同目录,否则会自激发循环)
  const ownOutputs = new Set(configs.flatMap((c) => [c.output.image, c.output.style, c.output.script, c.output.json].filter((p): p is string => Boolean(p)).map((p) => resolve(p))))
  let isBuild = false

  // 顺序生成各组(共享同一缓存文件时避免并发读改写竞争;组数少、成本可忽略);
  // dev 下单组失败仅告警(不中断),build 下硬失败。
  const runAll = async (): Promise<void> => {
    for (const c of configs) {
      try {
        await generateSheet(c, cacheFile)
      } catch (e) {
        if (isBuild) throw e
        console.error(`[bitmap-icons] ${c.inputDir} 生成失败:\n${String(e)}`)
      }
    }
  }

  // 仅当变更文件确实落在某个 inputDir 内才重生成。
  // 用 relative 判断(而非 startsWith),避免 "src/sprites" 误命中 "src/sprites-extra" 这类兄弟目录。
  const affects = (file: string): boolean => {
    const f = resolve(file)
    if (ownOutputs.has(f)) return false // 自身产物变更不触发(防止与源同目录时自激发)
    return roots.some((root) => {
      const rel = relative(root, f)
      return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)
    })
  }

  return {
    name: "vite-plugin-bitmap-icons",
    configResolved(config) {
      isBuild = config.command === "build"
    },
    async buildStart() {
      // 启动时剪枝:删除不再属于任何实例的缓存条目,防膨胀(key = output.image)
      pruneCache(cacheFile, configs.map((c) => c.output.image), "[bitmap-icons]")
      await runAll()
    },
    async watchChange(id) {
      if (affects(id)) await runAll()
    },
    async handleHotUpdate({ file }) {
      if (affects(file)) await runAll()
    },
  }
}
