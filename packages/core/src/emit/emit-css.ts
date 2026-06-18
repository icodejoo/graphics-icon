import type { FontAsset, FontFlavor, FontFormat, FontMetadata, ResolvedOptions } from '../types.ts'

const FORMAT_ORDER: FontFormat[] = ['woff2', 'woff', 'ttf']

/** tech() 链顺序:强 → 弱。 */
const CHAIN_ORDER: FontFlavor[] = ['colrv1', 'otsvg', 'colrv0', 'mono']

/** flavor → CSS tech() 关键字(mono 无 tech)。 */
const TECH: Record<FontFlavor, string | null> = {
  colrv1: 'color-colrv1',
  otsvg: 'color-svg',
  colrv0: 'color-colrv0',
  mono: null,
}

const q = (s: string) => JSON.stringify(s)
const cssFormat = (f: FontFormat) => (f === 'ttf' ? 'truetype' : f)

function groupByColor(assets: FontAsset[]): Map<FontFlavor, FontAsset[]> {
  const m = new Map<FontFlavor, FontAsset[]>()
  for (const a of assets) {
    const list = m.get(a.color) ?? []
    list.push(a)
    m.set(a.color, list)
  }
  for (const list of m.values()) {
    list.sort((a, b) => FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format))
  }
  return m
}

/**
 * 生成 CSS:
 *  - 保底 @font-face:仅 mono(所有格式)—— 不认 tech() 的浏览器只会用到这条。
 *  - 若有彩色档,再加一条 tech() 回退链 @font-face(同 family,后写优先)——
 *    现代浏览器按 COLRv1 → OT-SVG → COLRv0 → mono 各取所需。
 *  - 基础 class + 每图标 ::before content。
 */
export function emitCss(
  assets: FontAsset[],
  metadata: FontMetadata,
  o: ResolvedOptions,
  resolveUrl: (asset: FontAsset) => string,
): string {
  const byColor = groupByColor(assets)
  const ff = q(o.fontFamily)
  const entry = (a: FontAsset, tech: string | null) =>
    `url(${q(resolveUrl(a))}) format(${q(cssFormat(a.format))})${tech ? ` tech(${tech})` : ''}`

  const monoAssets = byColor.get('mono') ?? []
  const fallbackSrc = monoAssets.map((a) => entry(a, null)).join(',\n       ')

  let css = `@font-face {
  font-family: ${ff};
  font-display: block;
  src: ${fallbackSrc};
}
`

  const hasColor = (['colrv1', 'otsvg', 'colrv0'] as FontFlavor[]).some((c) => byColor.has(c))
  if (hasColor) {
    const chain: string[] = []
    for (const flavor of CHAIN_ORDER) {
      const list = byColor.get(flavor)
      if (!list || !list.length) continue
      chain.push(entry(list[0], TECH[flavor]))
    }
    css += `
/* 现代浏览器:tech() 各取所需(后写的 @font-face 同 family 覆盖上面的保底) */
@font-face {
  font-family: ${ff};
  font-display: block;
  src:
    ${chain.join(',\n    ')};
}
`
  }

  css += `
${o.baseSelector} {
  font-family: ${ff};
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  line-height: 1;
  display: inline-block;
  -webkit-font-smoothing: antialiased;
}
`

  css += metadata.glyphs
    .map(
      (g) =>
        `.${o.classPrefix}${g.name}::before { content: "\\${g.codepoint.toString(16)}"; }`,
    )
    .join('\n')

  return css + '\n'
}
