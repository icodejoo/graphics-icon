import cubic2quad from 'cubic2quad'
import opentype from 'opentype.js'
import svgpath from 'svgpath'

import type { OutlinePath } from '../types.ts'
import type { ViewBox } from '../util/svg.ts'

export interface OutlineResult {
  path: OutlinePath
  advanceWidth: number
}

export interface OutlineOptions {
  unitsPerEm: number
  ascender: number
}

/** cubic2quad 精度(em 单位)。 */
const CUBIC_PRECISION = 0.3

/**
 * 把一组 SVG path d(同一图标)转换成字体字形轮廓:
 *   viewBox 归一化 → 缩放到 em → Y 轴翻转 → 放到 ascender 基线之上。
 * 三次贝塞尔经 cubic2quad 降阶为二次(glyf 只支持二次)。
 */
export function toOutline(pathDs: string[], viewBox: ViewBox, opts: OutlineOptions): OutlineResult {
  const { unitsPerEm, ascender } = opts
  const h = viewBox.height || unitsPerEm
  const s = unitsPerEm / h
  const path = new opentype.Path()

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
          path.moveTo(seg[1] as number, seg[2] as number)
          break
        case 'L':
          path.lineTo(seg[1] as number, seg[2] as number)
          break
        case 'H':
          path.lineTo(seg[1] as number, lastY)
          break
        case 'V':
          path.lineTo(lastX, seg[1] as number)
          break
        case 'Q':
          path.quadraticCurveTo(seg[1] as number, seg[2] as number, seg[3] as number, seg[4] as number)
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
            path.quadraticCurveTo(q[i], q[i + 1], q[i + 2], q[i + 3])
          }
          break
        }
        case 'Z':
        case 'z':
          path.close()
          break
      }
    })
  }

  const advanceWidth = Math.round(viewBox.width * s)
  return { path, advanceWidth }
}
