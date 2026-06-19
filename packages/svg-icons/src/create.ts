/**
 * svg-icons 工厂：把「配置」装配成可直接用于 vite.config 的插件数组。
 *
 * 职责：
 *   · output.svg/script → 第三方 vite-plugin-icons-spritesheet 原始选项的映射；
 *   · 缓存闸门（cache.ts）：源+配置未变且产物在 → 跳过调用底层生成器，避免每次启动重建；
 *   · 后处理（post-process.ts）：归一化(可选) + id 作用域化 + 颜色改写 + 自产 script。
 *
 * svg-icons factory: assembles configs into a Plugin[] for vite.config.
 *   · maps output.svg/script → underlying vite-plugin-icons-spritesheet options
 *   · cache gate (cache.ts): skip the underlying generator when sources/config unchanged and outputs exist
 *   · post-processing (post-process.ts): optional normalize + id scoping + color rewrite + self-emitted script
 *
 * 按需加载 / on-demand: 重依赖 vite-plugin-icons-spritesheet 通过动态 import() 延迟到 buildStart，
 * 故仅 import { svgIcons } 不会即时拉起底层插件；colorfont 风格的 normalize 路径也已在 @codejoo/utils
 * 内部惰性加载（svgo/svgpath 仅在调用时加载）。
 */

import { basename, dirname } from "node:path"

import { resolveCacheFile, pruneCache } from "@codejoo/utils/cache"

import { computeStamp, isCached, writeStamp } from "./cache.ts"
import { runPostProcess } from "./post-process.ts"

import type { PostTarget } from "./post-process.ts"
import type { SvgIconsConfig, SvgIconsOptions } from "./types.ts"
import type { Plugin } from "vite"

/** 配置 → 第三方插件的原始选项。 / Map a config to the underlying plugin's options. */
function toUnderlying(c: SvgIconsConfig) {
  // withTypes:false —— script 完全由后处理自产（iconsHref + iconsName + IconName），不用插件的运行时代码。
  return {
    inputDir: c.input,
    outputDir: dirname(c.output.svg),
    fileName: basename(c.output.svg),
    withTypes: false as const,
    iconNameTransformer: c.iconNameTransformer ?? ((name: string) => name),
    formatter: c.formatter ?? "oxfmt",
  }
}

/** 由配置生成插件实例数组（供 vite.config 使用）。 / Build the Plugin[] from options. */
export function svgIcons(options: SvgIconsOptions): Plugin[] {
  const configs = options.sprites
  // 插件级缓存(整插件一份)：省略则落共享缓存目录 .cache.graphics/svg-icons.json。
  const cacheFile = resolveCacheFile("svg-icons", options.cacheFile)

  // 底层第三方插件按需加载：每个实例对应一个底层插件，惰性创建（在首个 buildStart 时一次性 import + 构造）。
  // Underlying plugins are created lazily: a single dynamic import in the first buildStart builds them all.
  let underlyingPlugins: Plugin[] | null = null
  let buildingPromise: Promise<Plugin[]> | null = null
  let pruned = false

  async function ensureUnderlying(): Promise<Plugin[]> {
    if (underlyingPlugins) return underlyingPlugins
    if (!buildingPromise) {
      buildingPromise = (async () => {
        // 动态 import：仅在 buildStart 真正触发时才拉起 vite-plugin-icons-spritesheet。
        const { iconsSpritesheet } = await import("vite-plugin-icons-spritesheet")
        const underlying = configs.map(toUnderlying)
        // 原始用法：iconsSpritesheet(配置数组) 一次返回一个插件数组，逐个包装其钩子。
        underlyingPlugins = iconsSpritesheet(underlying as Parameters<typeof iconsSpritesheet>[0]) as Plugin[]
        return underlyingPlugins
      })()
    }
    return buildingPromise
  }

  // 缓存闸门：命中→跳过底层生成器与后处理；未命中→生成、后处理、写戳。
  // orig 为某底层插件钩子的「取值器」（惰性拿到对应钩子）。
  const gate =
    (getOrig: (p: Plugin) => unknown, index: number) =>
    async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const c = configs[index]
      const target: PostTarget = {
        sprite: c.output.svg,
        script: c.output.script,
        color: c.color,
        normalize: c.normalize,
      }
      const stamp = computeStamp(c)
      if (isCached(c, stamp, cacheFile)) {
        console.log(`[svg-icons] 命中缓存，跳过：${c.output.svg}`)
        return undefined
      }
      const plugins = await ensureUnderlying()
      const orig = getOrig(plugins[index])
      const r = typeof orig === "function" ? await (orig as (...a: unknown[]) => unknown).apply(this, args) : undefined
      await runPostProcess(target)
      writeStamp(c, stamp, cacheFile)
      return r
    }

  // 为每个配置实例输出一个包装插件。底层插件惰性创建，故此处无需提前持有它们的钩子引用。
  return configs.map((_c, i) => {
    const buildStartGated = gate((p) => p.buildStart, i)
    const buildStart = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      // buildStart 额外在最前做一次剪枝（多实例共享缓存时只剪一次）
      if (!pruned) {
        pruned = true
        pruneCache(
          cacheFile,
          configs.map((c) => c.output.svg),
          "[svg-icons]",
        )
      }
      return buildStartGated.apply(this, args)
    }

    return {
      name: "vite-plugin-svg-icons",
      buildStart,
      watchChange: gate((p) => p.watchChange, i),
      handleHotUpdate: gate((p) => p.handleHotUpdate, i),
    } as Plugin
  })
}

/**
 * 引擎入口（Vite 之外可单独调用）：一次性生成所有 SVG 雪碧图 + 类型化脚本，并维护共享缓存。
 * 复用与插件相同的缓存闸门与后处理；底层 vite-plugin-icons-spritesheet 在 rollup 上下文桩上跑 buildStart。
 *
 * Standalone engine (usable outside Vite): generate every SVG sprite + typed script in one shot,
 * reusing the same cache gate + post-processing as the plugin; the underlying generator's buildStart
 * runs against a stubbed rollup context.
 */
export async function generateSvgSprites(options: SvgIconsOptions): Promise<void> {
  const configs = options.sprites
  const cacheFile = resolveCacheFile("svg-icons", options.cacheFile)
  pruneCache(
    cacheFile,
    configs.map((c) => c.output.svg),
    "[svg-icons]",
  )
  const { iconsSpritesheet } = await import("vite-plugin-icons-spritesheet")
  const underlying = iconsSpritesheet(configs.map(toUnderlying) as Parameters<typeof iconsSpritesheet>[0]) as Plugin[]
  // rollup 插件上下文桩：底层 buildStart 内若访问 this.xxx() 一律 no-op（Vite 之外）。
  const ctx = new Proxy({}, { get: () => () => {} })
  for (let i = 0; i < configs.length; i++) {
    const c = configs[i]
    const stamp = computeStamp(c)
    if (isCached(c, stamp, cacheFile)) {
      console.log(`[svg-icons] 命中缓存，跳过：${c.output.svg}`)
      continue
    }
    const bs = underlying[i]?.buildStart
    if (typeof bs === "function") await (bs as (...a: unknown[]) => unknown).call(ctx)
    await runPostProcess({ sprite: c.output.svg, script: c.output.script, color: c.color, normalize: c.normalize })
    writeStamp(c, stamp, cacheFile)
  }
}
