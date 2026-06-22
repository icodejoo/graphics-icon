/**
 * 位图雪碧图 Vite 插件:返回单个 Plugin。buildStart 生成全部实例;源目录变更(watch/HMR)则重生成。
 * 错误行为由各实例 `throwable`(默认 true)控制:true → 抛错中止(vite 报错);false → 告警继续。
 * 每实例生成幂等 + 独立 groupCache(内容未变不写盘 → 不触发 HMR 循环)。
 *
 * Bitmap sprite-sheet Vite plugin: a single Plugin. Generates all instances in buildStart; regenerates
 * on source changes. Error behavior is per-instance `throwable` (default true).
 */

import { isAbsolute, relative, resolve } from "node:path"

import { bitmapIcons } from "./generate-sheet.ts"

import type { BitmapIconsItem, BitmapIconsOptions } from "./types.ts"
import type { Plugin } from "vite"

/** 合并公共参数到每个 item（item 覆盖公共）。 / Merge common into each item (item wins). */
function resolveItems(o: BitmapIconsOptions): BitmapIconsItem[] {
  const { items, ...common } = o
  return items.map((it) => ({ ...common, ...it }))
}

export function bitmapIconsVite(options: BitmapIconsOptions): Plugin {
  const items = resolveItems(options)
  const roots = items.map((c) => resolve(c.inputDir))
  // 各组自身产物的绝对路径:写它们不应触发重生成(产物可与源同目录,否则自激发循环)。
  const ownOutputs = new Set(items.flatMap((c) => [c.output.image, c.output.style, c.output.script, c.output.json].filter((p): p is string => Boolean(p)).map((p) => resolve(p))))

  // 仅当变更文件落在某 inputDir 内(且非自身产物)才重生成。
  const affects = (file: string): boolean => {
    const f = resolve(file)
    if (ownOutputs.has(f)) return false
    return roots.some((root) => {
      const rel = relative(root, f)
      return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)
    })
  }

  // in-flight 合并:watchChange 与 handleHotUpdate 可能为同一次保存并发触发 →
  // 同一时刻只跑一次,进行中再来的触发尾随一次,避免并发写同一产物 + 缓存。
  // In-flight coalescing: dedupe concurrent watchChange/handleHotUpdate; run once, tail one rerun.
  let running: Promise<void> | null = null
  let pending = false
  const regenerate = (): Promise<void> => {
    if (running) {
      pending = true
      return running
    }
    running = (async () => {
      try {
        await bitmapIcons(options)
        while (pending) {
          pending = false
          await bitmapIcons(options)
        }
      } finally {
        running = null
        pending = false
      }
    })()
    return running
  }

  return {
    name: "vite-plugin-bitmap-icons",
    async buildStart() {
      await bitmapIcons(options)
    },
    async watchChange(id) {
      if (affects(id)) await regenerate()
    },
    async handleHotUpdate({ file }) {
      if (affects(file)) await regenerate()
    },
  }
}
