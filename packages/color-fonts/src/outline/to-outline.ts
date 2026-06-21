import cubic2quad from 'cubic2quad'
import svgpath from 'svgpath'

import type { ViewBox } from '../util/svg.ts'

export interface BBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface OutlineResult {
  /** SVG-font 字形路径 `d`(em 坐标系,y 轴向上,整数)。供 svg2ttf 组装 glyf。 */
  d: string
  advanceWidth: number
  /** glyph 空间(em y-up)包围盒;空轮廓为全 0。 */
  bbox: BBox
}

export interface OutlineOptions {
  unitsPerEm: number
  ascender: number
}

const CUBIC_PRECISION = 0.3

/**
 * 一组 SVG path d(同一图标)→ 字体字形轮廓的 SVG-font `d` 串:
 *   viewBox 归一化 → 缩放到 em → Y 轴翻转 → 放到 ascender 基线之上。
 * 三次贝塞尔经 cubic2quad 降阶为二次(glyf 只支持二次)。同时计算 bbox(供 COLRv1 渐变映射)。
 */
export function toOutline(pathDs: string[], viewBox: ViewBox, opts: OutlineOptions): OutlineResult {
  const { unitsPerEm, ascender } = opts
  const h = viewBox.height || unitsPerEm
  const s = unitsPerEm / h

  const out: string[] = []
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  const see = (x: number, y: number) => {
    if (x < x1) x1 = x
    if (y < y1) y1 = y
    if (x > x2) x2 = x
    if (y > y2) y2 = y
  }
  const r = (n: number) => Math.round(n)

  for (const d of pathDs) {
    const p = svgpath(d)
      .abs()
      .unarc()
      .unshort()
      .translate(-viewBox.minX, -viewBox.minY)
      .scale(s, -s)
      .translate(0, ascender)

    p.iterate((seg: (string | number)[], _i: number, lastX: number, lastY: number) => {
      const cmd = seg[0] as string
      switch (cmd) {
        case 'M':
          out.push(`M${r(seg[1] as number)} ${r(seg[2] as number)}`)
          see(seg[1] as number, seg[2] as number)
          break
        case 'L':
          out.push(`L${r(seg[1] as number)} ${r(seg[2] as number)}`)
          see(seg[1] as number, seg[2] as number)
          break
        case 'H':
          out.push(`L${r(seg[1] as number)} ${r(lastY)}`)
          see(seg[1] as number, lastY)
          break
        case 'V':
          out.push(`L${r(lastX)} ${r(seg[1] as number)}`)
          see(lastX, seg[1] as number)
          break
        case 'Q':
          out.push(`Q${r(seg[1] as number)} ${r(seg[2] as number)} ${r(seg[3] as number)} ${r(seg[4] as number)}`)
          see(seg[3] as number, seg[4] as number)
          break
        case 'C': {
          const q = cubic2quad(
            lastX,
            lastY,
            seg[1] as number,
            seg[2] as number,
            seg[3] as number,
            seg[4] as number,
            seg[5] as number,
            seg[6] as number,
            CUBIC_PRECISION,
          ) as number[]
          for (let i = 2; i + 3 < q.length; i += 4) {
            out.push(`Q${r(q[i])} ${r(q[i + 1])} ${r(q[i + 2])} ${r(q[i + 3])}`)
            see(q[i + 2], q[i + 3])
          }
          break
        }
        case 'Z':
        case 'z':
          out.push('Z')
          break
      }
    })
  }

  if (x1 === Infinity) {
    x1 = y1 = x2 = y2 = 0
  }
  return {
    d: out.join(''),
    advanceWidth: Math.round(viewBox.width * s),
    bbox: { x1, y1, x2, y2 },
  }
}
