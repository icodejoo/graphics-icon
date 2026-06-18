import type { PathEntry } from '../util/svg.ts'

/** 一个 COLR 层:一条 path 的几何 + 颜色信息。 */
export interface ColorLayer {
  d: string
  /** 原始 fill 值(如 '#e53935' / 'url(#a)' / 'currentColor'),COLRv1 解析渐变用。 */
  fill: string
  /** COLRv0 用的解析后颜色('#rrggbb' concrete / 'currentColor' / 渐变兜底灰)。 */
  color: string
}

export interface ColorPlan {
  /** 是否多色(≥2 种 concrete 颜色)。 */
  multicolor: boolean
  /** 是否含渐变/pattern(COLRv0 无法表达,需 otsvg/colrv1)。 */
  hasGradient: boolean
  /** 所有可绘制 path 的层(按文档顺序;fill=none 已剔除)。 */
  layers: ColorLayer[]
  /** 所有可绘制 path 的 d(供 mono 基础轮廓合并)。 */
  allDs: string[]
}

/** 规范化颜色:统一小写、扩展 #rgb→#rrggbb;识别 none / currentColor / 渐变。 */
export function normalizeColor(raw: string): string {
  const c = raw.trim().toLowerCase()
  if (c === '' || c === 'currentcolor' || c === 'inherit') return 'currentColor'
  if (c === 'none' || c === 'transparent') return 'none'
  if (c.startsWith('url(')) return 'url'
  const short = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return c
}

export function detectColor(paths: PathEntry[]): ColorPlan {
  const layers: ColorLayer[] = []
  const concrete = new Set<string>()
  let hasGradient = false

  for (const p of paths) {
    const c = normalizeColor(p.fill)
    if (c === 'none') continue
    if (c === 'url') {
      hasGradient = true
      layers.push({ d: p.d, fill: p.fill, color: '#808080' }) // COLRv0 兜底灰;真实渐变留给 otsvg/colrv1
      continue
    }
    if (c === 'currentColor') {
      layers.push({ d: p.d, fill: p.fill, color: 'currentColor' })
      continue
    }
    concrete.add(c)
    layers.push({ d: p.d, fill: p.fill, color: c })
  }

  return {
    multicolor: concrete.size >= 2,
    hasGradient,
    layers,
    allDs: layers.map((l) => l.d),
  }
}
