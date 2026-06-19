// 公共与内部类型契约。

/** 输出容器格式。 */
export type FontFormat = 'woff2' | 'woff' | 'ttf'

/**
 * 颜色编码策略(高层意图,逐图标判定 → 决定产出哪些 flavor)。
 * - 'auto'   : 单色仅 mono;多色产 colrv0 + otsvg(+ colrv1 若开启) + mono
 * - 'mono'   : 仅单色 glyf 轮廓
 * - 'colrv0' : COLRv0 平涂 + mono 回退
 * - 'otsvg'  : OT-SVG 内嵌 + mono 回退
 * - 'colrv1' : COLRv1 渐变(opt-in,wasm 后端) + 共存档
 */
export type ColorFormat = 'auto' | 'mono' | 'colrv0' | 'otsvg' | 'colrv1'

/** 底层 flavor(产物维度)。 */
export type FontFlavor = 'mono' | 'colrv0' | 'otsvg' | 'colrv1'

/** opentype.js Path 实例(避免到处依赖其类型,这里宽松别名)。 */
export type OutlinePath = import('opentype.js').Path

export interface CodepointEntry {
  /** 分配的 PUA 码位(十进制 int)。一经分配,删除图标也不回收(墓碑)。 */
  codepoint: number
  /** 首次分配日期。 */
  since?: string
  /** 该图标当前是否仍存在于 input。 */
  present?: boolean
}

export interface CodepointMap {
  version: 1
  /** PUA 起始码位,默认 0xE000。 */
  paFirst: number
  /** name → entry。按 codepoint 升序序列化。 */
  glyphs: Record<string, CodepointEntry>
}

export interface ColorfontOptions {
  /** 图标源目录(.svg)。 */
  input: string | string[]
  /** 产物输出目录。 */
  outDir: string
  /** OpenType family / @font-face font-family。 */
  fontName: string
  /** CSS font-family(默认同 fontName)。 */
  fontFamily?: string
  /** em 方格,默认 1000。 */
  unitsPerEm?: number
  /** 默认按 unitsPerEm 推导:asc = 0.8em, desc = -0.2em。 */
  ascender?: number
  descender?: number
  /** 基础选择器(挂 font-family 的根 class),默认 '.icon'。 */
  baseSelector?: string
  /** 每图标 class 前缀,默认 'icon-'。 */
  classPrefix?: string
  /** 颜色策略,默认 'auto'。 */
  colorFormat?: ColorFormat
  /** 输出容器,默认 ['woff2']。显式给出则覆盖 woff 开关。 */
  formats?: FontFormat[]
  /** 是否额外产出 .woff(woff2 兼容性已很好,默认 false 只产 woff2)。开启后 CSS 的 src 会带上 woff。 */
  woff?: boolean
  /**
   * 是否生成 COLRv0 档(平涂彩色,面向不支持 COLRv1 的老环境)。默认 true。
   * 若只面向现代浏览器(COLRv1 覆盖 Chrome/Edge/FF、OT-SVG 覆盖 Safari),可设 false 省一档。
   */
  colrv0?: boolean
  /** 多线程:每档字体一个 worker 并行构建(主攻 woff2 编码,占总耗时约 67%)。默认 'auto'(图标 ≥200 时启用)。 */
  threads?: boolean | 'auto'
  /** 码位锁文件路径,默认 `<outDir>/codepoints.json`。建议 commit。 */
  codepointsFile?: string
  /** PUA 起始码位,默认 0xE000。 */
  paStart?: number
}

export interface ResolvedOptions {
  input: string[]
  outDir: string
  fontName: string
  fontFamily: string
  unitsPerEm: number
  ascender: number
  descender: number
  baseSelector: string
  classPrefix: string
  colorFormat: ColorFormat
  formats: FontFormat[]
  /** 是否生成 COLRv0 档。 */
  colrv0: boolean
  threads: boolean | 'auto'
  codepointsFile: string
  paStart: number
}

/** 一个图标在管线中的中间表示。 */
export interface GlyphDef {
  name: string
  codepoint: number
  advanceWidth: number
  path: OutlinePath
}

export interface FontAsset {
  fileName: string
  source: Uint8Array
  color: FontFlavor
  format: FontFormat
  hash: string
}

export interface GlyphMeta {
  name: string
  codepoint: number
  unicode: string
  color: boolean
  flavors: FontFlavor[]
}

export interface FontMetadata {
  fontName: string
  fontFamily: string
  unitsPerEm: number
  glyphs: GlyphMeta[]
}

export interface BuildWarning {
  code: string
  level: 'info' | 'warn' | 'error'
  icon?: string
  message: string
}

export interface BuildResult {
  assets: FontAsset[]
  metadata: FontMetadata
  /** 自产 TS 入口源码。 */
  dts: string
  /** 更新后的码位锁表(buildAndWrite 会写回)。 */
  codepoints: CodepointMap
  warnings: BuildWarning[]
  /** url 回调式 CSS 生成 —— core 不决定字体最终 URL。 */
  emitCss(resolveUrl: (asset: FontAsset) => string): string
}
