/**
 * vite-plugin-graphics-icon —— 唯一对外发布的「伞」插件。
 * The only published package: an umbrella Vite plugin composing four engines under one option set.
 *
 * 组合 / Composes:
 *   · colorfont      —— 一组 SVG 图标 → 彩色图标 webfont(mono/COLRv0/OT-SVG/COLRv1)。
 *                       A folder of SVG icons → a color icon webfont.
 *   · bitmap-icons   —— 位图(png/jpg/webp/avif)→ 单张雪碧图集 + 样式 + 入口脚本。
 *                       Bitmaps → a single sprite-sheet atlas + stylesheet + entry script.
 *   · svg-icons      —— SVG 雪碧图(<symbol> + <use href>)+ id 作用域化 + 颜色改写 + 类型化入口。
 *                       SVG sprite sheets (<symbol> + <use href>) with id scoping & typed entry.
 *   · imagemin       —— 构建产物图片压缩(sharp + svgo,哈希缓存)。
 *                       Build-output image optimization (sharp + svgo, hash cache).
 *
 * 一套统一选项 + 一个共享缓存目录 + 按需加载:仅为被传入(且非 false)的子能力实例化插件。
 * One unified option set, one shared cache dir, on-demand: a sub-plugin is created only when its
 * key is present and not `false`.
 *
 * 用法 / Usage (vite.config.ts):
 *   import graphicsIcon from 'vite-plugin-graphics-icon'
 *   export default defineConfig({
 *     plugins: [
 *       graphicsIcon({
 *         cacheDir: 'node_modules/.cache.graphics',
 *         colorfont:   { input: 'src/icons/color', outDir: 'src/fonts', fontName: 'AppIcons' },
 *         bitmapIcons: { ... },
 *         svgIcons:    { sprites: [ ... ] },
 *         imagemin:    { enabled: true },
 *       }),
 *     ],
 *   })
 */

import path from 'node:path'
import { promises as fs } from 'node:fs'

import colorfontPlugin from './colorfont-plugin.ts'
import { bitmapIcons as bitmapIconsPlugin, generateBitmapSheets, runCli as bitmapRunCli } from 'bitmap-icons'
import { svgIcons as svgIconsPlugin, generateSvgSprites, runCli as svgRunCli } from 'svg-icons'
import { build as colorfontBuild, buildAndWrite as colorfontBuildAndWrite, runCli as colorfontRunCli } from '@codejoo/colorfont'
import * as imageminEngine from '@codejoo/imagemin'

import type { Plugin } from 'vite'
import type { ColorfontOptions } from './colorfont-plugin.ts'
import type { BitmapIconsOptions } from 'bitmap-icons'
import type { SvgIconsOptions } from 'svg-icons'

/**
 * imagemin 的 Vite-插件形态选项 = 引擎选项的部分覆盖 + 一个开关。
 * imagemin Vite-plugin form options = a partial of the engine options + an enable switch.
 */
export type ImageminPluginOptions = Partial<imageminEngine.ImageminOptions> & {
  /** 关闭则 closeBundle 不执行压缩(默认开启)。 / Disable to skip optimization in closeBundle. */
  enabled?: boolean
}

/**
 * 伞插件统一选项。每个子键:传对象 → 启用该子能力;传 `false`/省略 → 不启用。
 * Umbrella options. Each sub-key: pass an object → enable; pass `false`/omit → skip.
 */
export interface GraphicsIconOptions {
  /**
   * 共享缓存目录(默认沿用各插件自身的 `.cache.graphics`)。设置后会为各子插件填充未显式指定的
   * 缓存文件 / 目录,使四者共用同一目录(便于随仓库提交、团队共享)。
   * Shared cache dir. When set, fills each sub-plugin's unspecified cache path so all four share it.
   */
  cacheDir?: string
  /** colorfont 子插件选项;`false`/省略 → 不启用。 / colorfont sub-plugin options. */
  colorfont?: ColorfontOptions | false
  /** bitmap-icons 子插件选项;`false`/省略 → 不启用。 / bitmap-icons sub-plugin options. */
  bitmapIcons?: BitmapIconsOptions | false
  /** svg-icons 子插件选项;`false`/省略 → 不启用。 / svg-icons sub-plugin options. */
  svgIcons?: SvgIconsOptions | false
  /** imagemin 子插件选项;`false`/省略 → 不启用。 / imagemin sub-plugin options. */
  imagemin?: ImageminPluginOptions | false
}

/** 默认走的图片扩展名(用于 closeBundle 时枚举产物目录)。 / Default image extensions to enumerate. */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff', '.webp', '.avif', '.svg'])

/**
 * 给「接受 `cacheFile` 全路径」的子插件(bitmap-icons / svg-icons)注入共享缓存文件。
 * 若用户已显式给了 `cacheFile`,保持不动。
 * Inject a shared cache file into sub-plugins that accept a full `cacheFile` path.
 */
function withCacheFile<T extends { cacheFile?: string }>(opts: T, name: string, cacheDir?: string): T {
  if (!cacheDir || opts.cacheFile != null) return opts
  return { ...opts, cacheFile: path.join(cacheDir, `${name}.json`) }
}

/**
 * 给 colorfont 注入共享缓存目录。colorfont 引擎用 `cache?: boolean | { dir }`(目录级)。
 * 若用户已显式给了 `cache`,保持不动;否则把 `cache.dir` 指向共享目录下的 colorfont 子目录。
 * Inject a shared cache dir into colorfont (engine uses `cache?: boolean | { dir }`).
 */
function withCacheDir(opts: ColorfontOptions, name: string, cacheDir?: string): ColorfontOptions {
  if (!cacheDir || opts.cache != null) return opts
  return { ...opts, cache: { dir: path.join(cacheDir, name) } }
}

/** 递归列出目录下所有图片文件(绝对路径)。 / Recursively list image files under a dir. */
async function listImages(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await listImages(full)))
    else if (IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) out.push(full)
  }
  return out
}

/**
 * imagemin 的「Vite 插件」形态(带 enabled 开关)。
 * configResolved 期捕获 build.outDir;closeBundle 期(若 enabled !== false)枚举产物图片并压缩。
 * imagemin Vite-plugin form (with an `enabled` switch). Captures outDir, optimizes in closeBundle.
 */
export function imageminPlugin(opts?: ImageminPluginOptions, cacheDir?: string): Plugin {
  let outDir = 'dist'
  return {
    name: 'vite-plugin-graphics-icon:imagemin',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      if (opts?.enabled === false) return
      const root = path.isAbsolute(outDir) ? outDir : path.resolve(process.cwd(), outDir)
      const files = await listImages(root)
      if (files.length === 0) return
      const merged: imageminEngine.ImageminOptions = {
        ...imageminEngine.defaultOptions,
        ...opts,
        cacheFile: opts?.cacheFile ?? (cacheDir ? path.join(cacheDir, 'imagemin.json') : undefined),
      }
      await imageminEngine.optimizeImages(files, merged)
    },
  }
}

// ── 单插件合并:把各启用子插件的钩子多路复用到「一个」Vite Plugin 上 ──
// Hook multiplexing: fold the enabled sub-plugins' hooks onto a SINGLE Vite Plugin.

type AnyHook = (this: unknown, ...args: unknown[]) => unknown

// 对所有实现了该钩子的子插件「依次全部调用」(忽略返回值)。
// configResolved/buildStart 等副作用型钩子,以及 watchChange/handleHotUpdate(返回 undefined → 默认 HMR)。
const FANOUT_HOOKS = ['config', 'configResolved', 'configureServer', 'buildStart', 'buildEnd', 'generateBundle', 'closeBundle', 'watchChange', 'handleHotUpdate'] as const
// 「首个返回非空者胜出」型钩子:虚拟模块解析/加载(仅 colorfont 用)。
const FIRST_DEFINED_HOOKS = ['resolveId', 'load'] as const

/** 把若干子插件合并为单个 Plugin:同名钩子按上面的策略多路复用。 */
function mergePlugins(name: string, subs: Plugin[]): Plugin {
  const merged: Record<string, unknown> = { name }
  const asRec = (p: Plugin): Record<string, AnyHook> => p as unknown as Record<string, AnyHook>
  for (const hook of FANOUT_HOOKS) {
    const impls = subs.filter((p) => typeof asRec(p)[hook] === 'function')
    if (impls.length === 0) continue
    merged[hook] = async function (this: unknown, ...args: unknown[]): Promise<void> {
      for (const p of impls) await asRec(p)[hook].apply(this, args)
    }
  }
  for (const hook of FIRST_DEFINED_HOOKS) {
    const impls = subs.filter((p) => typeof asRec(p)[hook] === 'function')
    if (impls.length === 0) continue
    merged[hook] = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      for (const p of impls) {
        const r = await asRec(p)[hook].apply(this, args)
        if (r != null) return r
      }
      return undefined
    }
  }
  return merged as unknown as Plugin
}

/**
 * 伞插件主入口:`graphicsIcon({...})` 直接作为「一个」Vite 插件用(plugins: [graphicsIcon({...})])。
 * 内部按是否传入对应子键(且非 false)实例化子插件,未传则跳过其执行;最终合并成单个插件返回。
 * Umbrella entry: `graphicsIcon({...})` IS one Vite plugin. Each sub-feature is instantiated only when
 * its key is present (and not `false`); skipped otherwise. The enabled ones are merged into one plugin.
 */
export default function graphicsIcon(options: GraphicsIconOptions = {}): Plugin {
  const cacheDir = options.cacheDir
  const subs: Plugin[] = []

  // 生成型子插件在 buildStart 产出源(顺序无强依赖);imagemin 在 closeBundle 压缩最终产物,排最后。
  if (options.svgIcons) subs.push(...svgIconsPlugin(withCacheFile(options.svgIcons, 'svg-icons', cacheDir)))
  if (options.bitmapIcons) subs.push(bitmapIconsPlugin(withCacheFile(options.bitmapIcons, 'bitmap-icons', cacheDir)))
  if (options.colorfont) subs.push(colorfontPlugin(withCacheDir(options.colorfont, 'colorfont', cacheDir)) as unknown as Plugin)
  if (options.imagemin) subs.push(imageminPlugin(options.imagemin, cacheDir))

  return mergePlugins('vite-plugin-graphics-icon', subs)
}

// ── 各引擎对象(第二种形态:Vite 之外单独导入使用) / Engine objects (standalone, outside Vite) ──
// 与 imagemin 对齐:每个都暴露「可编程引擎 + runCli」,经各自的 bin 也可命令行运行。
//   import { colorfont, bitmapIcons, svgIcons, imagemin } from 'vite-plugin-graphics-icon'
//   await colorfont.buildAndWrite({ input, outDir, fontName })
//   await bitmapIcons.generate({ sprites: [...] })
//   await svgIcons.generate({ sprites: [...] })
//   await imagemin.optimizeImages(files, { ...imagemin.defaultOptions })
export const imagemin = imageminEngine
export const colorfont = { build: colorfontBuild, buildAndWrite: colorfontBuildAndWrite, runCli: colorfontRunCli }
export const bitmapIcons = { generate: generateBitmapSheets, runCli: bitmapRunCli }
export const svgIcons = { generate: generateSvgSprites, runCli: svgRunCli }

// ── 选项类型再导出(便于在 vite.config 里标注) / Re-export option types ──
export type { ColorfontOptions } from './colorfont-plugin.ts'
export type { BitmapIconsOptions } from 'bitmap-icons'
export type { SvgIconsOptions } from 'svg-icons'
