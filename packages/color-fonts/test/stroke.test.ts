// 描边展开 + 内存版构建自测:Lucide 风格的线性图标能变成正确的字形。Node 24 直接跑 .ts。
import opentype from 'opentype.js'

import { buildFromIcons } from '../src/index.ts'
import { fixWinding, outlineStrokes, usesStroke } from '../src/outline/stroke.ts'

let pass = 0
let fail = 0
const check = (c: boolean, m: string): void => {
  if (c) pass++
  else {
    fail++
    console.error('  ✗', m)
  }
}

/** Lucide `sun`:根上声明 stroke,子元素是 circle + 8 条 path。 */
const SUN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
/** 纯填充图标:不应被改动。 */
const FILLED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>'

check(usesStroke(SUN), 'usesStroke: Lucide 图标判为描边')
check(!usesStroke(FILLED), 'usesStroke: 纯填充图标不算描边')
check(!usesStroke('<svg fill="none" stroke="none"><path d="M0 0"/></svg>'), 'usesStroke: stroke=none 不算')

check((await outlineStrokes(FILLED)) === FILLED, 'outlineStrokes: 无描边的文档原样返回')

const outlined = await outlineStrokes(SUN)
check(!/stroke/.test(outlined), 'outlineStrokes: 结果不再含 stroke')
check(/viewBox="0 0 24 24"/.test(outlined), 'outlineStrokes: 保留 viewBox')
check((outlined.match(/<path /g) ?? []).length === 9, 'outlineStrokes: 圆 + 8 条射线共 9 条路径')
check(/fill="currentColor"/.test(outlined), 'outlineStrokes: 轮廓取描边色')

// 闭合描边(heart 这类)的外轮廓与孔方向必须相反,否则非零环绕下孔会被填满
const HEART =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>'
const heartD = /d="([^"]*)"/.exec(await outlineStrokes(HEART))![1]!
const areas = heartD.split(/(?=M)/).map((sub) => {
  const pts = [...sub.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1]!, +m[2]!] as const)
  return pts.reduce((a, [x1, y1], i) => a + x1 * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * y1, 0)
})
check(areas.length === 2 && areas[0]! * areas[1]! < 0, `outlineStrokes: 闭合描边的外轮廓与孔方向相反(${areas.map((a) => Math.round(a / 2)).join(' / ')})`)
check(fixWinding('M0 0L10 0L10 10L0 10ZM3 3L7 3L7 7L3 7Z').split('M').length === 3, 'fixWinding: 保留轮廓个数')

// 内存版构建:不读源目录、不写码位锁
const result = await buildFromIcons(
  { output: { dir: 'unused', fontName: 'Mem', name: 'Mem' }, formats: ['ttf', 'woff2'], colorFormat: 'mono' },
  [
    { name: 'sun', svg: SUN },
    { name: 'box', svg: FILLED },
  ],
)
check(result.metadata.glyphs.length === 2, 'buildFromIcons: 两个图标都进了字体')
check(result.metadata.glyphs[0]!.name === 'box' && result.metadata.glyphs[0]!.codepoint === 0xe000, 'buildFromIcons: 按名字序从 PUA 起点分配码位')
check(result.assets.some((a) => a.format === 'woff2'), 'buildFromIcons: 产出 woff2')

const ttf = result.assets.find((a) => a.format === 'ttf')!
const font = opentype.parse(ttf.source.buffer.slice(ttf.source.byteOffset, ttf.source.byteOffset + ttf.source.byteLength) as ArrayBuffer)
const sun = font.charToGlyph(String.fromCodePoint(result.metadata.glyphs.find((g) => g.name === 'sun')!.codepoint))
const contours = sun.path.commands.filter((c: { type: string }) => c.type === 'M').length
check(contours >= 9, `buildFromIcons: sun 字形含圆环(2 个轮廓)+ 8 条射线,实际 ${contours} 个轮廓`)
const bb = sun.getBoundingBox()
check(bb.x1 >= 0 && bb.x2 <= 1000 && bb.x2 - bb.x1 > 800, `buildFromIcons: sun 字形宽度合理(${Math.round(bb.x1)}..${Math.round(bb.x2)})`)

console.log(`\n${fail === 0 ? '✅' : '❌'} stroke test: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
