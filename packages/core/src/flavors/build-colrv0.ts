// COLRv0 档(glyf 引擎版):
//   1. 用已验证的 buildColorGlyf 把每个图标的 base 轮廓(单色回退)+ 各层轮廓组装成 glyf 字体,
//      并解析好 baseGid(经 cmap)/ 每层 gid(经 glyph-name)。
//   2. 在此手工构造 COLR v0 + CPAL v0 两张二进制表(big-endian)。
//   3. 用 injectTables 把两张表注入 glyf SFNT(自动重排表目录 + 重算校验和)。
//
// opentype.js 仅作只读解析(在 buildColorGlyf / glyph-map 内部),本文件不再用它写表。
//
// 语义沿袭旧实现(build-flavor.ts 的 isColor = plan.multicolor || plan.hasGradient):
//   - 只有「需要彩色」的图标(≥2 种 concrete 颜色,或含渐变兜底)才产生 COLR 记录。
//   - 单色图标(如 home)不进 COLR → COLR-aware 渲染器回退到 base glyf,按文本前景色渲染。
//   - currentColor 层不进调色板,用特殊 paletteIndex 0xFFFF(前景色)。
//   - 渐变层在 COLRv0 无法表达,detectColor 已给兜底灰 #808080(真实渐变留给 otsvg/colrv1)。
import { buildColorGlyf } from '../glyf/color-glyphs.ts'
import { injectTables } from '../glyf/sfnt-inject.ts'

import type { ResolvedColorIcon } from '../glyf/color-glyphs.ts'
import type { PreparedIcon } from '../pipeline/prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'

/** COLR 特殊调色板索引:0xFFFF = 使用文本前景色(currentColor)。 */
const FOREGROUND = 0xffff

/**
 * 判断某图标是否需要 COLR 记录(沿袭旧 isColor 语义):
 *   - hasGradient:任一层的原始 fill 为 url(...)(渐变/pattern,detectColor 给了兜底灰)。
 *   - multicolor :concrete 颜色(以 # 开头、且非渐变兜底)去重后 ≥2 种。
 * 注意:渐变兜底层的 color 也是 '#808080'(以 # 开头),必须用原始 fill 区分,
 * 否则会把渐变误判成 concrete 色。
 */
function needsColr(ic: ResolvedColorIcon): boolean {
  // 沿袭旧引擎语义:仅「多色」图标(≥2 种 concrete 颜色)进 COLRv0。
  // 渐变-only 图标 COLRv0 无法表达渐变,不进 COLR → COLR-aware 渲染器回退到 base glyf(文本前景色),
  // 真实渐变交给 CSS tech 链上游的 colrv1/otsvg。
  const concrete = new Set<string>()
  for (const ly of ic.layers) {
    const isGradient = ly.fill.trim().toLowerCase().startsWith('url(')
    if (isGradient) continue
    if (ly.color.startsWith('#')) concrete.add(ly.color)
  }
  return concrete.size >= 2
}

/** 把 '#rrggbb' 解析成 [r, g, b](各 0..255)。 */
function parseHex(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

/** 一条待写入的 COLR base 记录(指向一段连续的层)。 */
interface BaseRecord {
  glyphID: number
  firstLayerIndex: number
  numLayers: number
}

/** 一条待写入的 COLR 层记录。 */
interface LayerRecord {
  glyphID: number
  paletteIndex: number
}

/**
 * 构造 COLR v0 表(big-endian)。
 * header(14B):version(u16=0) | numBaseGlyphRecords(u16) | baseGlyphRecordsOffset(u32)
 *             | layerRecordsOffset(u32) | numLayerRecords(u16)
 * BaseGlyph record(6B):glyphID(u16) | firstLayerIndex(u16) | numLayers(u16)
 * Layer record(4B)   :glyphID(u16) | paletteIndex(u16)
 * baseGlyphRecords 必须按 glyphID 升序(COLR 规范要求二分查找)。
 */
function buildColrTable(bases: BaseRecord[], layers: LayerRecord[]): Uint8Array {
  const HEADER = 14
  const baseOffset = HEADER
  const baseBytes = bases.length * 6
  const layerOffset = baseOffset + baseBytes
  const total = layerOffset + layers.length * 4

  const buf = new Uint8Array(total)
  const dv = new DataView(buf.buffer)

  dv.setUint16(0, 0) // version
  dv.setUint16(2, bases.length) // numBaseGlyphRecords
  dv.setUint32(4, baseOffset) // baseGlyphRecordsOffset
  dv.setUint32(8, layerOffset) // layerRecordsOffset
  dv.setUint16(12, layers.length) // numLayerRecords

  let p = baseOffset
  for (const b of bases) {
    dv.setUint16(p, b.glyphID)
    dv.setUint16(p + 2, b.firstLayerIndex)
    dv.setUint16(p + 4, b.numLayers)
    p += 6
  }

  p = layerOffset
  for (const l of layers) {
    dv.setUint16(p, l.glyphID)
    dv.setUint16(p + 2, l.paletteIndex)
    p += 4
  }

  return buf
}

/**
 * 构造 CPAL v0 表(big-endian,单一调色板)。
 * header:version(u16=0) | numPaletteEntries(u16) | numPalettes(u16=1)
 *        | numColorRecords(u16) | colorRecordsArrayOffset(u32)
 * 随后:uint16[numPalettes] colorRecordIndices(单调色板填 0)
 * 随后:ColorRecord[numColorRecords],每条 4B,BGRA 顺序:blue|green|red|alpha。
 */
function buildCpalTable(palette: string[]): Uint8Array {
  const n = palette.length
  const HEADER = 12 // version..colorRecordsArrayOffset
  const indicesBytes = 1 * 2 // numPalettes(=1) 个 uint16
  const colorRecordsOffset = HEADER + indicesBytes
  const total = colorRecordsOffset + n * 4

  const buf = new Uint8Array(total)
  const dv = new DataView(buf.buffer)

  dv.setUint16(0, 0) // version
  dv.setUint16(2, n) // numPaletteEntries
  dv.setUint16(4, 1) // numPalettes
  dv.setUint16(6, n) // numColorRecords
  dv.setUint32(8, colorRecordsOffset) // colorRecordsArrayOffset
  dv.setUint16(HEADER, 0) // colorRecordIndices[0] = 0(唯一调色板从第 0 条起)

  let p = colorRecordsOffset
  for (const hex of palette) {
    const [r, g, b] = parseHex(hex)
    buf[p] = b // blue
    buf[p + 1] = g // green
    buf[p + 2] = r // red
    buf[p + 3] = 0xff // alpha = 不透明
    p += 4
  }

  return buf
}

/**
 * 构建 COLRv0 字体:glyf 基础轮廓 + 手工注入的 COLR v0 + CPAL v0。
 * @returns 注入后的 glyf SFNT 字节(sfntVersion = 0x00010000)。
 */
export function buildColrv0Ttf(icons: PreparedIcon[], o: ResolvedOptions): Uint8Array {
  // 1) 组装 glyf 字体并解析 gid(底座已验证,gid 可直接用)
  const { ttf, icons: resolved } = buildColorGlyf(icons, o)

  // 2) 收集 concrete 颜色 → 调色板槽位(currentColor 不进调色板;渐变兜底色用 fill 区分,
  //    其兜底灰仍写入调色板供层引用)
  const palette: string[] = []
  const colorIndex = new Map<string, number>()
  const intern = (hex: string): number => {
    let idx = colorIndex.get(hex)
    if (idx === undefined) {
      idx = palette.length
      colorIndex.set(hex, idx)
      palette.push(hex)
    }
    return idx
  }

  // 3) 构造 base / layer 记录;只为「需要彩色」的图标产生记录
  const bases: BaseRecord[] = []
  const layerRecords: LayerRecord[] = []
  for (const ic of resolved) {
    if (!needsColr(ic)) continue
    const firstLayerIndex = layerRecords.length
    for (const { gid, color } of ic.layers) {
      const paletteIndex = color === 'currentColor' ? FOREGROUND : intern(color)
      layerRecords.push({ glyphID: gid, paletteIndex })
    }
    bases.push({ glyphID: ic.baseGid, firstLayerIndex, numLayers: ic.layers.length })
  }

  // BaseGlyph records 必须按 glyphID 升序(规范要求二分查找)
  bases.sort((a, b) => a.glyphID - b.glyphID)

  // 4) CPAL 不允许 numPaletteEntries=0:若全是 currentColor / 无 concrete 色,放一个黑色占位
  //    (无层引用它,无害)。
  const cpalPalette = palette.length ? palette : ['#000000']

  const colrBytes = buildColrTable(bases, layerRecords)
  const cpalBytes = buildCpalTable(cpalPalette)

  // 5) 注入两张表(injectTables 自动重排表目录 + 重算校验和)
  return injectTables(ttf, [
    { tag: 'COLR', data: colrBytes },
    { tag: 'CPAL', data: cpalBytes },
  ])
}
