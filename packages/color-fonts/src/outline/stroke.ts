// 描边 → 轮廓:把用 stroke 画的图标(Lucide / Feather / Tabler 这类线性图标集)转成纯填充路径,
// 供后续 normalize → toOutline → glyf 管线使用(字体只能表达填充)。
// 几何由 Skia PathOps(pathkit-wasm)完成:stroke 展开 + simplify 合并重叠,输出为不自交的二次曲线轮廓。
// Stroke → outline: turn stroked icons (Lucide / Feather / Tabler) into fill-only paths for the glyph
// pipeline. Geometry by Skia PathOps (pathkit-wasm): stroke expansion + simplify, output is non-overlapping quads.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/** pathkit-wasm 里本模块用到的最小形状(它自带的 d.ts 不完整)。 */
interface PkPath {
  stroke(opts: { width: number; join: unknown; cap: unknown; miter_limit: number }): PkPath | null
  op(other: PkPath, op: unknown): boolean
  simplify(): boolean
  toSVGString(): string
  copy(): PkPath
  delete(): void
}
interface PathKit {
  FromSVGString(d: string): PkPath | null
  PathOp: { UNION: unknown }
  StrokeJoin: { MITER: unknown; ROUND: unknown; BEVEL: unknown }
  StrokeCap: { BUTT: unknown; ROUND: unknown; SQUARE: unknown }
}

let pathKit: Promise<PathKit> | undefined

/** 惰性加载 pathkit-wasm(Emscripten 旧产物在 Node 24 下会误走 fetch,必须显式传 wasmBinary)。 */
function loadPathKit(): Promise<PathKit> {
  pathKit ??= (async () => {
    const require = createRequire(import.meta.url)
    const init = require('pathkit-wasm/bin/pathkit.js') as (opts: { wasmBinary: Uint8Array }) => Promise<PathKit>
    return init({ wasmBinary: readFileSync(require.resolve('pathkit-wasm/bin/pathkit.wasm')) })
  })()
  return pathKit
}

/** 参与继承的呈现属性。 */
const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit'] as const
type Presentation = Partial<Record<(typeof INHERITED)[number], string>>

/** 文档是否用到描边(排除 none / 渐变引用 / 透明)。 */
export function usesStroke(svg: string): boolean {
  return /\bstroke\s*[=:]\s*["']?\s*(?!none|url\(|transparent|inherit)[a-z#]/i.test(svg)
}

/** 解析标签属性串(含 style 内联声明);style 优先于属性。 */
function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of attrs.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]
  const style = out.style
  if (style) for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim()
  }
  return out
}

/** 以父级继承值为底,叠加本元素的呈现属性。 */
function inherit(parent: Presentation, attrs: Record<string, string>): Presentation {
  const next = { ...parent }
  for (const k of INHERITED) if (attrs[k] !== undefined) next[k] = attrs[k]
  return next
}

const NONE = new Set(['none', 'transparent'])

/** 一段曲线:终点前的全部坐标(L: 1 点,Q: 2 点,C: 3 点),点以 [x, y] 表示。 */
interface Seg {
  cmd: 'L' | 'Q' | 'C'
  pts: [number, number][]
}
/** 一个闭合轮廓。 */
interface Contour {
  start: [number, number]
  segs: Seg[]
}

/** 解析 PathKit 输出的绝对坐标路径串(只含 M L Q C Z)。 */
function parseContours(d: string): Contour[] {
  const out: Contour[] = []
  for (const m of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const nums = (m[2] ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
    const pair = (i: number): [number, number] => [nums[i]!, nums[i + 1]!]
    if (m[1] === 'M') out.push({ start: pair(0), segs: [] })
    else if (m[1] === 'L') out.at(-1)?.segs.push({ cmd: 'L', pts: [pair(0)] })
    else if (m[1] === 'Q') out.at(-1)?.segs.push({ cmd: 'Q', pts: [pair(0), pair(2)] })
    else if (m[1] === 'C') out.at(-1)?.segs.push({ cmd: 'C', pts: [pair(0), pair(2), pair(4)] })
  }
  return out
}

/** 轮廓折线化(曲线每段取 6 个采样点),用于求面积与包含关系。 */
function flatten(c: Contour): [number, number][] {
  const poly: [number, number][] = [c.start]
  let cur = c.start
  for (const seg of c.segs) {
    const end = seg.pts.at(-1)!
    if (seg.cmd === 'L') poly.push(end)
    else {
      for (let i = 1; i <= 6; i++) {
        const t = i / 6
        const u = 1 - t
        const [p1, p2, p3] = [cur, ...seg.pts]
        poly.push(
          seg.cmd === 'Q'
            ? [u * u * p1[0] + 2 * u * t * p2![0] + t * t * p3![0], u * u * p1[1] + 2 * u * t * p2![1] + t * t * p3![1]]
            : (() => {
                const p4 = seg.pts[2]!
                const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
                const q = [cur, seg.pts[0]!, seg.pts[1]!, p4]
                return [q.reduce((a, p, k) => a + b[k]! * p[0], 0), q.reduce((a, p, k) => a + b[k]! * p[1], 0)] as [number, number]
              })(),
        )
      }
    }
    cur = end
  }
  return poly
}

/** 多边形有向面积(shoelace;y 向下坐标系里为正表示顺时针)。 */
function signedArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!
    const [x2, y2] = poly[(i + 1) % poly.length]!
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** 射线法:点是否在多边形内。 */
function inside(pt: [number, number], poly: [number, number][]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** 把轮廓整体反向(顶点序反过来,曲线控制点相应翻转)。 */
function reverse(c: Contour): Contour {
  const nodes: [number, number][] = [c.start]
  for (const seg of c.segs) nodes.push(seg.pts.at(-1)!)
  const segs: Seg[] = []
  for (let i = c.segs.length - 1; i >= 0; i--) {
    const seg = c.segs[i]!
    const controls = seg.pts.slice(0, -1).reverse()
    segs.push({ cmd: seg.cmd, pts: [...controls, nodes[i]!] })
  }
  return { start: nodes.at(-1)!, segs }
}

/** 数字保留 4 位小数并去掉多余的 0。 */
const num = (n: number): string => String(Math.round(n * 1e4) / 1e4)

/**
 * 统一轮廓方向:外轮廓顺时针、孔逆时针。
 * Skia 的 simplify 结果是「奇偶填充」语义(各轮廓方向可能相同),而字体 glyf 用非零环绕,
 * 方向相同时孔会被填满(Lucide 的 heart / star / settings 这类闭合描边图标会变成实心)。
 */
export function fixWinding(d: string): string {
  const contours = parseContours(d)
  const polys = contours.map(flatten)
  return contours
    .map((c, i) => {
      const depth = polys.reduce((n, poly, j) => (j !== i && inside(polys[i]![0]!, poly) ? n + 1 : n), 0)
      const wantPositive = depth % 2 === 0
      const fixed = signedArea(polys[i]!) > 0 === wantPositive ? c : reverse(c)
      const body = fixed.segs.map((s) => s.cmd + s.pts.map(([x, y]) => `${num(x)} ${num(y)}`).join(' ')).join('')
      return `M${num(fixed.start[0])} ${num(fixed.start[1])}${body}Z`
    })
    .join('')
}

/**
 * 把 SVG 中的描边展开为填充轮廓,返回只含 `<path fill>` 的 SVG(保留 viewBox)。
 * 无描边的文档原样返回(零开销)。几何元素(circle/line/rect…)需先转成 path(`normalizeSvg` 的 svgo 会做;
 * 这里自带一遍 `convertShapeToPath`,以便描边在原始坐标系下展开)。
 * 不支持:stroke-dasharray、transform、渐变描边(渐变描边按其兜底色处理由后续 detectColor 决定)。
 */
export async function outlineStrokes(svg: string): Promise<string> {
  if (!usesStroke(svg)) return svg

  const { optimize } = await import('svgo')
  const flat = optimize(svg, {
    plugins: ['inlineStyles', { name: 'convertShapeToPath', params: { convertArcs: true } }],
  }).data
  const PK = await loadPathKit()

  const rootTag = /<svg\b([^>]*)>/i.exec(flat)
  const rootAttrs = parseAttrs(rootTag?.[1] ?? '')
  const viewBox = rootAttrs.viewBox
  const stack: Presentation[] = [inherit({ fill: '#000' }, rootAttrs)]
  const out: string[] = []

  for (const tag of flat.matchAll(/<(\/?)(g|path)\b([^>]*?)(\/?)>/g)) {
    const [, closing, name, rawAttrs, selfClose] = tag
    if (name === 'g') {
      if (closing) stack.pop()
      else if (!selfClose) stack.push(inherit(stack[stack.length - 1]!, parseAttrs(rawAttrs)))
      continue
    }
    const attrs = parseAttrs(rawAttrs)
    const d = attrs.d
    if (!d) continue
    const style = inherit(stack[stack.length - 1]!, attrs)
    const fill = style.fill ?? '#000'
    const stroke = style.stroke ?? 'none'
    const hasFill = !NONE.has(fill)
    const hasStroke = !NONE.has(stroke)

    if (!hasStroke) {
      if (hasFill) out.push(`<path d="${d}" fill="${fill}"${attrs['fill-rule'] ? ` fill-rule="${attrs['fill-rule']}"` : ''}/>`)
      continue
    }

    const stroked = PK.FromSVGString(d)
    if (!stroked) continue
    const width = Number.parseFloat(style['stroke-width'] ?? '1') || 1
    const cap = (style['stroke-linecap'] ?? 'butt').toUpperCase() as 'BUTT' | 'ROUND' | 'SQUARE'
    const join = (style['stroke-linejoin'] ?? 'miter').toUpperCase() as 'MITER' | 'ROUND' | 'BEVEL'
    stroked.stroke({
      width,
      cap: PK.StrokeCap[cap] ?? PK.StrokeCap.BUTT,
      join: PK.StrokeJoin[join] ?? PK.StrokeJoin.MITER,
      miter_limit: Number.parseFloat(style['stroke-miterlimit'] ?? '4') || 4,
    })
    stroked.simplify()

    if (hasFill && fill === stroke) {
      // 填充与描边同色:并成一条轮廓
      const filled = PK.FromSVGString(d)
      if (filled) {
        stroked.op(filled, PK.PathOp.UNION)
        filled.delete()
      }
      out.push(`<path d="${fixWinding(stroked.toSVGString())}" fill="${stroke}"/>`)
    } else {
      // 先画填充、后画描边,保持绘制顺序(描边在上)
      if (hasFill) out.push(`<path d="${d}" fill="${fill}"/>`)
      out.push(`<path d="${fixWinding(stroked.toSVGString())}" fill="${stroke}"/>`)
    }
    stroked.delete()
  }

  return `<svg xmlns="http://www.w3.org/2000/svg"${viewBox ? ` viewBox="${viewBox}"` : ''}>${out.join('')}</svg>`
}
