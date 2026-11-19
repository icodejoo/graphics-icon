/**
 * used-icons —— 代码里写 `<i class="lucide-sun">`,就自动把 Lucide 的 sun 打进一个 webfont(Vite 插件)。
 *
 * 用法:
 *   usedIcons([{ collect: 'lucide', iconPrefix: 'lucide-' }])
 *   import 'virtual:used-icons.css'          // 入口里 import 一次
 *   <i class="lucide-sun"></i>               // 之后只管写类名:<iconPrefix><图标名>
 *
 * 开发:转换每个源文件时扫描类名,新图标登记后重新出字体并热更新样式;
 *       启动时按图标集生成编辑器类名提示(VS Code 里敲 `lucide-` 列出全部图标)。
 * 构建:扫描最终产物(JS / HTML)里的类名,只收真正出现的图标;字体小则内联进 CSS(data URI),大则单独输出带哈希的文件并 preload。
 * 样式是虚拟模块,不写盘。描边图标(Lucide 等)由引擎自动展开成填充轮廓。
 *
 * Write `<i class="lucide-sun">` and the sun icon is packed into one webfont.
 */
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'

import { buildFromIcons } from 'color-fonts'

import { detectCollections, listDirIcons, listIconNames, loadCollection, loadDirIcon, tryLoadIconSvg } from './collection.ts'

import type { Plugin, ViteDevServer } from 'vite'
import type { ColorFormat } from 'color-fonts'

/** 样式虚拟模块 id。 */
export const CSS_ID = 'virtual:used-icons.css'
/** 解析后的 id(Rollup 约定的 `\0` 前缀)。 */
const RESOLVED_CSS_ID = `\0${CSS_ID}`
/** 构建期占位规则的类名与标记;generateBundle 时整条替换为真正的字体样式。 */
const SLOT_CLASS = '__used-icons-slot__'
const SLOT_TOKEN = '__USED_ICONS_RULES__'
/** 匹配压缩后仍存活的占位规则。 */
const SLOT_RE = new RegExp(`\\.${SLOT_CLASS}\\s*\\{[^}]*${SLOT_TOKEN}[^}]*\\}`, 'g')
/** 开发期样式热更新的合并等待(毫秒)。 */
const RELOAD_DEBOUNCE_MS = 30
/** 开发期参与类名扫描的源文件(去掉查询串后的路径)。 */
const SCAN_FILE_RE = /\.(vue|svelte|astro|html|[cm]?[jt]sx?|mdx?|pug)$/
/** 没检测到任何已安装图标集时的兜底。 */
const FALLBACK_COLLECTIONS = ['lucide']
/** 字体小于此字节数时内联进 CSS(data URI);达到则单独输出文件。 */
const DEFAULT_INLINE_LIMIT = 16 * 1024
/** 图标类的默认附加样式:与行内文字对齐、不继承斜体 / 粗细。 */
const DEFAULT_EXTRA_PROPERTIES: Record<string, string> = {
  display: 'inline-block',
  'font-style': 'normal',
  'font-weight': 'normal',
  'line-height': '1',
  'vertical-align': '-0.125em',
}

/** 一个图标集及其类名前缀。 */
export interface IconSet {
  /** 图标集名,对应 `@iconify-json/<collect>` 包,如 `lucide`;写了 `dir` 时只是这个本地集合的名字。 */
  collect: string
  /** 类名前缀,类名 = 前缀 + 图标名;默认 `<collect>-`。如 `iconPrefix: 'i-'` 则写 `i-sun`。各图标集的前缀不能相同。 */
  iconPrefix?: string
  /**
   * 本地 SVG 目录(相对项目根):目录里的每个 `.svg` 是一个图标,图标名取文件名(转小写、非字母数字变连字符)。
   * 写了它就不再读 `@iconify-json`。开发期改动 / 新增 / 删除 SVG 会热更新。
   */
  dir?: string
}

/** 插件选项(各图标集共用)。 */
export interface UsedIconsOptions {
  /**
   * 静态扫描不到的图标(运行时拼接的类名,如 `'lucide-' + name`),写完整类名。
   * 支持 `*` 通配:`'lucide-arrow-*'` 会展开成该图标集里所有以 `arrow-` 开头的图标。
   */
  safelist?: string[]
  /**
   * 额外扫描的文件(相对项目根的 glob):不经过 Vite 模块图的内容,如 CMS 导出的 JSON、后端模板。
   * 开发期这些文件改动会重新扫描。
   */
  include?: string[]
  /** 类名看起来是图标(前缀对、图标集里却没有这个图标)时,在开发期给出警告,默认 `false`(`lucide-react` 这类包名会误报)。 */
  warn?: boolean
  /**
   * 图标类的附加 CSS 属性,与默认值合并(默认:`display: inline-block`、`line-height: 1`、`vertical-align: -0.125em`、
   * 字体样式 / 粗细复位)。值为 `''` 则去掉该属性。
   */
  extraProperties?: Record<string, string>
  /** 图标大小相对当前字号的倍数,默认 `1`(1em)。 */
  scale?: number
  /**
   * 构建时字体小于这个字节数就内联进 CSS(省一次请求;需要 CSP 允许 `font-src data:`),
   * 否则单独输出带哈希的 woff2 并加 preload。默认 16384;`Infinity` 永远内联,`0` 永远单独输出。开发期总是内联。
   */
  inlineLimit?: number
  /**
   * 开发服务器启动时生成的 VS Code HTML 自定义数据路径(相对项目根),让 `class="` 里敲 `lucide-` 就列出全部图标。
   * 需要在 `.vscode/settings.json` 里加 `"html.customData": ["./.vscode/used-icons.html-data.json"]`。
   * 默认 `.vscode/used-icons.html-data.json`;`false` 关闭。
   */
  customData?: string | false
  /** CSS 字体名,默认 `UsedIcons`。 */
  fontName?: string
  /** 颜色策略,默认 `mono`(单色图标集最快最小);彩色图标集用 `auto`。 */
  colorFormat?: ColorFormat
  /** woff2 压缩质量 1..11;默认构建 11、开发 9(快约 30 倍,体积约 +6%)。 */
  woff2Quality?: number
}

/** 一个解析成功的图标。 */
interface Entry {
  /** 完整类名,如 `lucide-sun`;同时是字体里的字形名。 */
  body: string
  svg: string
}

/** 一次出字体的结果。 */
interface Generated {
  /** 图标集合指纹,相同则复用。 */
  key: string
  /** woff2 字节;没有图标时为空。 */
  font: Uint8Array
  /** 用给定的字体地址渲染出整段样式。 */
  render(fontUrl: string): string
}

/** 生效的图标集(前缀已小写,`dir` 已转绝对路径)。 */
interface ActiveSet {
  collect: string
  iconPrefix: string
  dir?: string
}

/** 转义正则特殊字符。 */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 内容变了才写文件(避免无谓的文件时间戳变化触发编辑器 / 监听器)。
 * @param file 绝对路径
 * @param content 内容
 */
function writeIfChanged(file: string, content: string): void {
  try {
    if (readFileSync(file, 'utf8') === content) return
  } catch {
    /* 不存在 → 写 */
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/**
 * 创建插件。
 * @param sets 要用的图标集(数组,可写多个库)。省略则读项目 package.json 里装的 `@iconify-json/*`(前缀 `<集合>-`),一个都没装则用 lucide
 * @param options 共用选项
 */
export default function usedIcons(sets: IconSet | IconSet[] = [], options: UsedIconsOptions = {}): Plugin {
  const fontName = options.fontName ?? 'UsedIcons'
  const inlineLimit = options.inlineLimit ?? DEFAULT_INLINE_LIMIT
  const extra = { ...DEFAULT_EXTRA_PROPERTIES, ...options.extraProperties }

  let root = process.cwd()
  let base = '/'
  let isBuild = false
  let isSsrBuild = false
  let server: ViteDevServer | undefined
  let active: ActiveSet[] = []
  /** 类名扫描用的正则:各图标集的前缀 + 图标名。 */
  let tokenRe = /$^/g
  /** 开发期已登记图标。 */
  const registry = new Map<string, Entry>()
  /** 类名 → 解析结果(含「不是图标」的负结果),避免重复查图标集。 */
  const resolved = new Map<string, Entry | null>()
  /** 已警告过的类名。 */
  const warned = new Set<string>()
  /** `include` 里的文件在构建期扫出的图标。 */
  const fileEntries = new Map<string, Entry>()
  let last: Promise<Generated> | undefined
  let reloadTimer: ReturnType<typeof setTimeout> | undefined

  /** 完整类名(`lucide-sun`)→ 图标;前缀不认识或图标不存在时为 null。 */
  function resolveBody(body: string): Entry | null {
    if (resolved.has(body)) return resolved.get(body)!
    const set = active.find((x) => body.startsWith(x.iconPrefix))
    const name = set ? body.slice(set.iconPrefix.length) : ''
    const svg = set ? (set.dir ? loadDirIcon(set.dir, name) : tryLoadIconSvg(root, set.collect, name)) : null
    const entry = svg ? { body, svg } : null
    resolved.set(body, entry)
    return entry
  }

  /**
   * 扫出一段文本里所有能解析成图标的类名。
   * @param text 源码或 HTML
   * @param file 传入时(开发期的用户源码)对「前缀对、图标不存在」的类名给出警告
   */
  function findIcons(text: string, file?: string): Entry[] {
    const out: Entry[] = []
    for (const m of text.matchAll(tokenRe)) {
      const body = m[0].toLowerCase()
      const entry = resolveBody(body)
      if (entry) out.push(entry)
      else if (options.warn && file && !warned.has(body)) {
        warned.add(body)
        server?.config.logger.warn(`[used-icons] ${file}: "${body}" 不是已配置图标集里的图标`)
      }
    }
    return out
  }

  /** 所有图标集的全部类名(用于 safelist 通配与编辑器提示)。 */
  function allClassNames(): string[] {
    return active.flatMap((x) => {
      try {
        return (x.dir ? listDirIcons(x.dir) : listIconNames(root, x.collect)).map((n) => `${x.iconPrefix}${n}`)
      } catch {
        return []
      }
    })
  }

  /** safelist 条目(含 `*` 通配)→ 图标。 */
  function safelisted(): Entry[] {
    const names = (options.safelist ?? []).flatMap((item) => {
      const lower = item.toLowerCase()
      if (!lower.includes('*')) return [lower]
      const re = new RegExp(`^${lower.split('*').map(escapeRe).join('.*')}$`)
      return allClassNames().filter((n) => re.test(n))
    })
    return names.flatMap((n) => {
      const entry = resolveBody(n)
      return entry ? [entry] : []
    })
  }

  /** `include` 匹配到的文件(绝对路径)。 */
  function includedFiles(): string[] {
    if (!options.include?.length) return []
    return globSync(options.include, { cwd: root }).map((f) => resolve(root, f))
  }

  /** 开发期:登记新图标;有新增则合并等待后让样式热更新。 */
  function register(entries: Entry[]): void {
    let added = false
    for (const e of entries) {
      if (!registry.has(e.body)) {
        registry.set(e.body, e)
        added = true
      }
    }
    if (added && server) scheduleCssReload()
  }

  /** 用给定图标出字体;集合没变时复用上一次结果。 */
  async function generate(entries: Entry[]): Promise<Generated> {
    const sorted = [...new Map(entries.map((e) => [e.body, e])).values()].sort((a, b) => (a.body < b.body ? -1 : 1))
    const key = sorted.map((e) => e.body).join('\n')
    const prev = last && (await last)
    if (prev && prev.key === key) return prev
    const run = (async (): Promise<Generated> => {
      if (sorted.length === 0) return { key, font: new Uint8Array(), render: () => '' }
      const result = await buildFromIcons(
        {
          output: { dir: '.', fontName, name: fontName },
          formats: ['woff2'],
          colorFormat: options.colorFormat ?? 'mono',
          woff2Quality: options.woff2Quality ?? (isBuild ? 11 : 9),
        },
        sorted.map((e) => ({ name: e.body, svg: e.svg })),
      )
      const font = result.assets.find((a) => a.format === 'woff2' && a.color === 'mono')!.source
      return {
        key,
        font,
        render(fontUrl) {
          // 只取引擎生成的 @font-face,类规则按我们的类名自己写:
          // 每个图标类自己带字体设置,模板里只写 `lucide-sun` 就够,不用再加基类
          const fontFace = result.emitCss(() => fontUrl)
          const head = fontFace.slice(0, fontFace.indexOf('\n.icon {'))
          const props: Record<string, string> = { font: 'inherit', 'font-family': `"${fontName}" !important`, '-webkit-font-smoothing': 'antialiased', ...extra }
          if (options.scale && options.scale !== 1) props['font-size'] = `${options.scale}em`
          const body = Object.entries(props)
            .filter(([, v]) => v !== '')
            .map(([k, v]) => `  ${k}: ${v};`)
            .join('\n')
          const cls = (name: string): string => `.${name}`
          const rule = `${sorted.map((e) => cls(e.body)).join(',\n')} {\n${body}\n}\n`
          // content 的第二条带 `/ ""`:给生成内容一个空的替代文本,让读屏软件跳过装饰性图标(不支持的浏览器会忽略这一条、用上一条)
          const glyphs = result.metadata.glyphs
            .map((g) => `${cls(g.name)}::before { content: "\\${g.codepoint.toString(16)}"; content: "\\${g.codepoint.toString(16)}" / ""; }`)
            .join('\n')
          return `${head}\n${rule}${glyphs}\n`
        },
      }
    })()
    last = run
    return run
  }

  /** 开发期:合并等待后让样式模块热更新。 */
  function scheduleCssReload(): void {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      const mod = server?.moduleGraph.getModuleById(RESOLVED_CSS_ID)
      if (!mod) return
      server!.moduleGraph.invalidateModule(mod)
      void server!.reloadModule(mod)
    }, RELOAD_DEBOUNCE_MS)
  }

  /** 开发服务器启动 / 本地 SVG 目录变化时:按图标集写编辑器类名提示(VS Code HTML 自定义数据)。 */
  function writeHints(): void {
    if (options.customData === false) return
    const data = { version: 1.1, globalAttributes: [{ name: 'class', values: allClassNames().map((name) => ({ name })) }] }
    writeIfChanged(resolve(root, options.customData ?? '.vscode/used-icons.html-data.json'), `${JSON.stringify(data)}\n`)
  }

  /** 本地 SVG 目录变了:重新读取已登记的图标,丢掉被删的,样式热更新。 */
  function refreshDirIcons(): void {
    resolved.clear()
    for (const key of [...registry.keys()]) {
      const entry = resolveBody(key)
      if (entry) registry.set(key, entry)
      else registry.delete(key)
    }
    scheduleCssReload()
    try {
      writeHints()
    } catch {
      /* 提示文件写失败不影响样式 */
    }
  }

  /** 字体 URL 相对某个输出文件的写法:绝对 base 直接拼,相对 base(`./`、空)按文件所在目录算。 */
  function urlFrom(fileName: string, fontFile: string): string {
    return base === '' || base.startsWith('.') ? posix.relative(posix.dirname(fileName), fontFile) : `${base}${fontFile}`
  }

  return {
    name: 'graphics-icon:used-icons',
    configResolved(config) {
      root = config.root
      base = config.base
      isBuild = config.command === 'build'
      isSsrBuild = !!config.build.ssr
      const given = Array.isArray(sets) ? sets : [sets]
      const detected = detectCollections(root)
      const baseSets: IconSet[] = given.length ? given : (detected.length ? detected : FALLBACK_COLLECTIONS).map((collect) => ({ collect }))
      active = baseSets
        .map((x) => ({ collect: x.collect, iconPrefix: (x.iconPrefix ?? `${x.collect}-`).toLowerCase(), dir: x.dir ? resolve(root, x.dir) : undefined }))
        // 前缀长的在前,保证 `lucide-lab-` 先于 `lucide-` 匹配
        .sort((a, b) => b.iconPrefix.length - a.iconPrefix.length)
      // 配置写错要在启动时就报:前缀重复,或图标集没装
      const seen = new Set<string>()
      for (const x of active) {
        if (seen.has(x.iconPrefix)) throw new Error(`[used-icons] 图标集的 iconPrefix 重复: "${x.iconPrefix}"`)
        seen.add(x.iconPrefix)
        if (!x.dir) loadCollection(root, x.collect)
      }
      tokenRe = new RegExp(`(?<![\\w-])(?:${active.map((x) => escapeRe(x.iconPrefix)).join('|')})[a-z0-9][a-z0-9_-]*(?![\\w-])`, 'gi')
    },
    configureServer(s) {
      server = s
      try {
        writeHints()
      } catch (e) {
        s.config.logger.warn(`[used-icons] 生成类名提示失败:${(e as Error).message}`)
      }
      // 本地 SVG 目录与 include 文件:开发期监听
      const dirs = active.flatMap((x) => (x.dir ? [x.dir] : []))
      if (dirs.length) s.watcher.add(dirs)
      const scanFile = (file: string): void => {
        if (includedFiles().includes(file)) register(findIcons(readFileSync(file, 'utf8')))
      }
      const onFile = (file: string): void => {
        const f = file.replace(/\\/g, '/')
        if (f.toLowerCase().endsWith('.svg') && dirs.some((d) => f.startsWith(d.replace(/\\/g, '/') + '/'))) refreshDirIcons()
        else scanFile(resolve(file))
      }
      s.watcher.on('add', onFile).on('change', onFile).on('unlink', onFile)
    },
    buildStart() {
      register(safelisted())
      for (const file of includedFiles()) {
        for (const e of findIcons(readFileSync(file, 'utf8'))) {
          register([e])
          fileEntries.set(e.body, e)
        }
      }
    },
    resolveId(id) {
      return id === CSS_ID ? RESOLVED_CSS_ID : null
    },
    async load(id) {
      if (id !== RESOLVED_CSS_ID) return null
      // 构建期此刻还不知道最终图标集合:先放占位规则,generateBundle 再整条替换
      if (isBuild) return `.${SLOT_CLASS}{--used-icons:${SLOT_TOKEN}}`
      const g = await generate([...registry.values()])
      return g.render(`data:font/woff2;base64,${Buffer.from(g.font).toString('base64')}`)
    },
    transform: {
      order: 'pre',
      handler(code, id) {
        // 开发期靠这里发现类名;构建期改扫最终产物,更准
        if (isBuild || id.startsWith('\0') || id.includes('/node_modules/')) return null
        if (!SCAN_FILE_RE.test(id.split('?')[0]!)) return null
        register(findIcons(code, id.replace(root, '')))
        return null
      },
    },
    transformIndexHtml(html) {
      if (!isBuild) register(findIcons(html))
    },
    generateBundle: {
      // post:要等 Vite 自己把 HTML 入口发射进 bundle 之后,才能扫到 HTML 里的类名
      order: 'post',
      async handler(_opts, bundle) {
        // SSR 构建不产出样式,没有需要替换的东西
        if (isSsrBuild) return
        // 只收「真正出现在产物里」的类名:JS chunk 与 HTML 资产,加上 safelist 与 include 文件
        const found = new Map<string, Entry>([...safelisted(), ...fileEntries.values()].map((e) => [e.body, e]))
        for (const item of Object.values(bundle)) {
          const text = item.type === 'chunk' ? item.code : typeof item.source === 'string' && item.fileName.endsWith('.html') ? item.source : ''
          for (const e of findIcons(text)) found.set(e.body, e)
        }
        const g = await generate([...found.values()])
        if (g.font.length === 0) {
          for (const item of Object.values(bundle)) {
            if (item.type === 'asset' && item.fileName.endsWith('.css') && typeof item.source === 'string') item.source = item.source.replace(SLOT_RE, '')
          }
          return
        }
        // 字体小就内联进 CSS;大则单独输出(带哈希,可长期缓存)并 preload
        let fontFile: string | undefined
        if (g.font.length >= inlineLimit) {
          fontFile = this.getFileName(this.emitFile({ type: 'asset', name: `${fontName}.woff2`, source: g.font }))
        }
        const inline = `data:font/woff2;base64,${Buffer.from(g.font).toString('base64')}`
        for (const item of Object.values(bundle)) {
          const url = fontFile ? urlFrom(item.fileName, fontFile) : inline
          if (item.type === 'asset' && item.fileName.endsWith('.css') && typeof item.source === 'string') {
            item.source = item.source.replace(SLOT_RE, () => g.render(url))
          } else if (item.type === 'chunk' && item.code.includes(SLOT_TOKEN)) {
            // CSS 被内联进 JS 字符串(如库模式)时,按字符串转义
            item.code = item.code.replace(SLOT_RE, () => JSON.stringify(g.render(url)).slice(1, -1))
          } else if (fontFile && item.type === 'asset' && item.fileName.endsWith('.html') && typeof item.source === 'string') {
            const link = `<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`
            item.source = item.source.includes('</head>') ? item.source.replace('</head>', `${link}</head>`) : link + item.source
          }
        }
      },
    },
  }
}
