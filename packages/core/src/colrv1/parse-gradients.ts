import type { Extend } from './paint.ts'

export type GradientUnits = 'objectBoundingBox' | 'userSpaceOnUse'

export interface GradientStop {
  offset: number
  color: string
  opacity: number
}

interface Common {
  units: GradientUnits
  spread: Extend
  stops: GradientStop[]
  hasTransform: boolean
}

export interface LinearGradient extends Common {
  type: 'linear'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RadialGradient extends Common {
  type: 'radial'
  cx: number
  cy: number
  r: number
  fx: number
  fy: number
}

export type Gradient = LinearGradient | RadialGradient

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
  return m ? m[1] : undefined
}

/** 解析坐标:'50%' → 0.5;'0.5'/'12' → 原值。 */
function coord(v: string | undefined, dflt: number): number {
  if (v === undefined) return dflt
  if (v.trim().endsWith('%')) return parseFloat(v) / 100
  return parseFloat(v)
}

function parseStops(body: string): GradientStop[] {
  const stops: GradientStop[] = []
  const re = /<stop\b([^>]*)\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const tag = m[1]
    const offRaw = attr(tag, 'offset') ?? '0'
    const offset = offRaw.trim().endsWith('%') ? parseFloat(offRaw) / 100 : parseFloat(offRaw)
    let color = attr(tag, 'stop-color')
    let opacity = attr(tag, 'stop-opacity')
    // 也支持 style="stop-color:..;stop-opacity:.."
    const style = attr(tag, 'style')
    if (style) {
      color = color ?? style.match(/stop-color\s*:\s*([^;]+)/)?.[1]?.trim()
      opacity = opacity ?? style.match(/stop-opacity\s*:\s*([^;]+)/)?.[1]?.trim()
    }
    stops.push({
      offset: Number.isFinite(offset) ? offset : 0,
      color: color ?? '#000000',
      opacity: opacity !== undefined ? parseFloat(opacity) : 1,
    })
  }
  return stops.sort((a, b) => a.offset - b.offset)
}

function common(openTag: string, body: string): Common {
  const units = (attr(openTag, 'gradientUnits') as GradientUnits) ?? 'objectBoundingBox'
  const spreadRaw = attr(openTag, 'spreadMethod')
  const spread: Extend = spreadRaw === 'reflect' ? 'reflect' : spreadRaw === 'repeat' ? 'repeat' : 'pad'
  return {
    units,
    spread,
    stops: parseStops(body),
    hasTransform: /\bgradientTransform\s*=/.test(openTag),
  }
}

/** 从(规范化)SVG 字符串解析所有 linear/radial 渐变,key = id。 */
export function parseGradients(svg: string): Map<string, Gradient> {
  const map = new Map<string, Gradient>()

  const linRe = /<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient>/g
  let m: RegExpExecArray | null
  while ((m = linRe.exec(svg))) {
    const open = m[1]
    const id = attr(open, 'id')
    if (!id) continue
    const c = common(open, m[2])
    map.set(id, {
      type: 'linear',
      x1: coord(attr(open, 'x1'), 0),
      y1: coord(attr(open, 'y1'), 0),
      x2: coord(attr(open, 'x2'), c.units === 'objectBoundingBox' ? 1 : 0),
      y2: coord(attr(open, 'y2'), 0),
      ...c,
    })
  }

  const radRe = /<radialGradient\b([^>]*)>([\s\S]*?)<\/radialGradient>/g
  while ((m = radRe.exec(svg))) {
    const open = m[1]
    const id = attr(open, 'id')
    if (!id) continue
    const c = common(open, m[2])
    const cx = coord(attr(open, 'cx'), 0.5)
    const cy = coord(attr(open, 'cy'), 0.5)
    map.set(id, {
      type: 'radial',
      cx,
      cy,
      r: coord(attr(open, 'r'), 0.5),
      fx: coord(attr(open, 'fx'), cx),
      fy: coord(attr(open, 'fy'), cy),
      ...c,
    })
  }

  return map
}

/** 从 fill 值里取 url(#id) 的 id。 */
export function gradientIdFromFill(fill: string): string | null {
  const m = fill.match(/url\(\s*#([^)\s'"]+)\s*\)/)
  return m ? m[1] : null
}
