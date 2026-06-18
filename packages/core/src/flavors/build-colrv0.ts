import { toOutline } from '../outline/to-outline.ts'

import { assembleFont, buildBaseGlyphs, layerGlyph } from './font-assembly.ts'

import type { ColorLayer } from '../pipeline/detect-color.ts'
import type { ResolvedOptions } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'

/** COLR 特殊调色板索引:0xFFFF = 使用文本前景色(currentColor)。 */
const FOREGROUND = 0xffff

export interface ColorIconInput {
  name: string
  codepoint: number
  viewBox: ViewBox
  /** 所有可绘制 path 的 d(基础 mono 轮廓 = 终极回退,COLR-aware 渲染器会用层覆盖)。 */
  allDs: string[]
  /** 每条 path 一层(仅 multicolor 时用于建 COLR)。 */
  layers: ColorLayer[]
  multicolor: boolean
}

export interface Colrv0Result {
  ttf: Uint8Array
  /** 调色板里的 concrete 颜色(按 CPAL 槽位顺序)。 */
  palette: string[]
}

/**
 * COLRv0 字体 = 所有图标的基础 glyf 轮廓(单色回退)+ 多色图标的 COLR 分层 + CPAL 调色板。
 * 单色图标无 COLR 记录 → 在 COLR-aware 渲染器里仍按 glyf 以文本色渲染。
 */
export function buildColrv0Font(icons: ColorIconInput[], o: ResolvedOptions): Colrv0Result {
  // 1. 收集 concrete 颜色 → CPAL 槽位
  const palette: string[] = []
  const colorIndex = new Map<string, number>()
  for (const ic of icons) {
    if (!ic.multicolor) continue
    for (const ly of ic.layers) {
      if (ly.color === 'currentColor') continue
      if (!colorIndex.has(ly.color)) {
        colorIndex.set(ly.color, palette.length)
        palette.push(ly.color)
      }
    }
  }

  // 2. base 字形(共享 helper)+ 多色图标的层字形
  const { glyphs, baseIndexByName } = buildBaseGlyphs(icons, o)
  const layerSpecs: { base: number; layers: { glyph: number; paletteIndex: number }[] }[] = []
  for (const ic of icons) {
    if (!ic.multicolor) continue
    const specs: { glyph: number; paletteIndex: number }[] = []
    ic.layers.forEach((ly, i) => {
      const out = toOutline([ly.d], ic.viewBox, o)
      const gi = glyphs.length
      glyphs.push(layerGlyph(`${ic.name}.l${i}`, out.advanceWidth, out.path))
      const paletteIndex = ly.color === 'currentColor' ? FOREGROUND : colorIndex.get(ly.color)!
      specs.push({ glyph: gi, paletteIndex })
    })
    layerSpecs.push({ base: baseIndexByName.get(ic.name)!, layers: specs })
  }

  // 3. 组装字体 + CPAL/COLR(COLR 需 CPAL 存在;无 concrete 色时放占位项)
  const font = assembleFont(glyphs, o)
  font.palettes.ensureCPAL(palette.length ? palette : ['#000000'])
  for (const spec of layerSpecs) font.layers.add(spec.base, spec.layers)

  return { ttf: new Uint8Array(font.toArrayBuffer()), palette }
}
