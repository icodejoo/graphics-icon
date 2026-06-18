import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { assignCodepoints, readLockfile, writeLockfile } from './codepoints/lockfile.ts'
import { emitCss as emitCssImpl } from './emit/emit-css.ts'
import { emitDts } from './emit/emit-dts.ts'
import { toWoff } from './encode/to-woff.ts'
import { toWoff2 } from './encode/to-woff2.ts'
import { buildColrv0Font } from './flavors/build-colrv0.ts'
import { buildGlyfFont } from './flavors/build-glyf.ts'
import { buildOtsvgFont } from './flavors/build-otsvg.ts'
import { resolveOptions } from './options.ts'
import { detectColor } from './pipeline/detect-color.ts'
import { loadIcons } from './pipeline/load-icons.ts'
import { normalizeSvg } from './pipeline/normalize-svg.ts'
import { toOutline } from './outline/to-outline.ts'
import { contentHash } from './util/hash.ts'
import { getSvgInner, parseSvg } from './util/svg.ts'

import type { ColorPlan } from './pipeline/detect-color.ts'
import type {
  BuildResult,
  BuildWarning,
  ColorFormat,
  ColorfontOptions,
  FontAsset,
  FontFlavor,
  FontFormat,
  GlyphDef,
  GlyphMeta,
  ResolvedOptions,
} from './types.ts'
import type { ViewBox } from './util/svg.ts'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface ParsedIcon {
  name: string
  codepoint: number
  viewBox: ViewBox
  plan: ColorPlan
  /** 规范化 SVG 内层内容,供 OT-SVG 包装。 */
  inner: string
}

/** 由 colorFormat + 是否存在彩色图标,推导要产出的 flavor 集合(mono 永远产出)。 */
function resolveFlavors(cf: ColorFormat, anyColor: boolean): { flavors: FontFlavor[]; warnings: BuildWarning[] } {
  const warnings: BuildWarning[] = []
  const flavors: FontFlavor[] = ['mono']
  const add = (f: FontFlavor) => {
    if (!flavors.includes(f)) flavors.push(f)
  }
  switch (cf) {
    case 'mono':
      break
    case 'colrv0':
      add('colrv0')
      break
    case 'otsvg':
      add('otsvg')
      break
    case 'auto':
      if (anyColor) {
        add('colrv0')
        add('otsvg')
      }
      break
    case 'colrv1':
      // colrv1 作为额外档由 wasm 写表后端产出(见 build());同时产 colrv0+otsvg 作共存/回退
      add('colrv0')
      add('otsvg')
      break
  }
  return { flavors, warnings }
}

async function encodeFont(
  ttf: Uint8Array,
  format: FontFormat,
  color: FontFlavor,
  o: ResolvedOptions,
): Promise<FontAsset> {
  let source: Uint8Array
  if (format === 'ttf') source = ttf
  else if (format === 'woff2') source = await toWoff2(ttf)
  else source = toWoff(ttf)
  const hash = contentHash(source)
  return { fileName: `${o.fontName}.${color}.${hash}.${format}`, source, color, format, hash }
}

/** 纯函数:输入图标 + 选项 → 产物 Buffer + 元数据 + CSS/TS 生成器。不落盘。 */
export async function build(options: ColorfontOptions): Promise<BuildResult> {
  const o = resolveOptions(options)
  const icons = await loadIcons(o.input)

  const lock = await readLockfile(o.codepointsFile, o.paStart)
  const cpMap = assignCodepoints(
    icons.map((i) => i.name),
    lock,
    today(),
  )

  const parsed: ParsedIcon[] = icons.map((icon) => {
    const norm = normalizeSvg(icon.svg)
    const { viewBox, paths } = parseSvg(norm)
    return {
      name: icon.name,
      codepoint: cpMap[icon.name],
      viewBox,
      plan: detectColor(paths),
      inner: getSvgInner(norm),
    }
  })

  const isColor = (p: ParsedIcon) => p.plan.multicolor || p.plan.hasGradient
  const anyColor = parsed.some(isColor)
  const { flavors, warnings } = resolveFlavors(o.colorFormat, anyColor)

  const assets: FontAsset[] = []

  // mono(永远产出)
  const monoGlyphs: GlyphDef[] = parsed.map((p) => {
    const { path, advanceWidth } = toOutline(p.plan.allDs, p.viewBox, o)
    return { name: p.name, codepoint: p.codepoint, advanceWidth, path }
  })
  const monoTtf = buildGlyfFont(monoGlyphs, o)
  for (const format of o.formats) assets.push(await encodeFont(monoTtf, format, 'mono', o))

  // colrv0(存在彩色需求时)
  if (flavors.includes('colrv0')) {
    const { ttf } = buildColrv0Font(
      parsed.map((p) => ({
        name: p.name,
        codepoint: p.codepoint,
        viewBox: p.viewBox,
        allDs: p.plan.allDs,
        layers: p.plan.layers,
        multicolor: p.plan.multicolor,
      })),
      o,
    )
    for (const format of o.formats) assets.push(await encodeFont(ttf, format, 'colrv0', o))
  }

  // otsvg(存在彩色需求时;多色或渐变图标嵌入 OT-SVG 文档)
  if (flavors.includes('otsvg')) {
    const ttf = buildOtsvgFont(
      parsed.map((p) => ({
        name: p.name,
        codepoint: p.codepoint,
        viewBox: p.viewBox,
        allDs: p.plan.allDs,
        innerSvg: p.inner,
        needsColor: isColor(p),
      })),
      o,
    )
    for (const format of o.formats) assets.push(await encodeFont(ttf, format, 'otsvg', o))
  }

  // colrv1(opt-in:仅 colorFormat==='colrv1';经 Rust/wasm 写表后端,未构建则警告并跳过)
  if (o.colorFormat === 'colrv1' && anyColor) {
    const { addColrv1, isColrv1Available } = await import('./colrv1/wasm-writer.ts')
    if (await isColrv1Available()) {
      const { buildColrv1 } = await import('./colrv1/build-colrv1.ts')
      const { baseSfnt, doc } = buildColrv1(
        parsed.map((p) => ({
          name: p.name,
          codepoint: p.codepoint,
          viewBox: p.viewBox,
          allDs: p.plan.allDs,
          layers: p.plan.layers,
          inner: p.inner,
          needsColor: isColor(p),
        })),
        o,
      )
      const ttf = await addColrv1(baseSfnt, doc)
      for (const format of o.formats) assets.push(await encodeFont(ttf, format, 'colrv1', o))
      if (!flavors.includes('colrv1')) flavors.unshift('colrv1')
    } else {
      warnings.push({
        code: 'COLRV1_WASM_MISSING',
        level: 'warn',
        message:
          'colrv1-writer wasm 未构建,colrv1 档已跳过(仍产出 colrv0+otsvg)。装 Rust 后在 packages/colrv1-writer 跑 `wasm-pack build --target nodejs` 即启用。',
      })
    }
  }

  const glyphsMeta: GlyphMeta[] = parsed.map((p) => ({
    name: p.name,
    codepoint: p.codepoint,
    unicode: String.fromCodePoint(p.codepoint),
    color: isColor(p),
    flavors: [...flavors],
  }))

  const metadata = {
    fontName: o.fontName,
    fontFamily: o.fontFamily,
    unitsPerEm: o.unitsPerEm,
    glyphs: glyphsMeta,
  }

  return {
    assets,
    metadata,
    dts: emitDts(metadata, o),
    codepoints: lock,
    warnings,
    emitCss: (resolveUrl) => emitCssImpl(assets, metadata, o, resolveUrl),
  }
}

/** 便捷版:build 后把字体 / CSS / TS 入口 / 码位锁写到 outDir。 */
export async function buildAndWrite(options: ColorfontOptions): Promise<BuildResult> {
  const o = resolveOptions(options)
  const result = await build(options)

  await mkdir(o.outDir, { recursive: true })
  for (const asset of result.assets) {
    await writeFile(join(o.outDir, asset.fileName), asset.source)
  }
  await writeFile(join(o.outDir, `${o.fontName}.css`), result.emitCss((a) => `./${a.fileName}`), 'utf8')
  await writeFile(join(o.outDir, `${o.fontName}.ts`), result.dts, 'utf8')
  await writeLockfile(o.codepointsFile, result.codepoints)

  return result
}

export { serializeLockfile, readLockfile } from './codepoints/lockfile.ts'

export type {
  BuildResult,
  ColorfontOptions,
  ColorFormat,
  FontAsset,
  FontFlavor,
  FontFormat,
  FontMetadata,
  GlyphMeta,
  VitePluginColorfontOptions,
} from './types.ts'
