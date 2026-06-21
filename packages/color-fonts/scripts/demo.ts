// 生成 1000 个(含真多色+渐变)测试图标并【保留】,构建全四档字体,产出浏览器验收页。
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = resolve(here, '../.bench-icons') // 保留
const demoDir = resolve(here, '../.demo')
const wasmPkg = resolve(here, '../colrv1-writer/pkg/colrv1_writer.js')
const N = 1000

let seed = 1234567
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00897b', '#d81b60']

function pathD(V: number, segs: number): string {
  let d = `M${ri(0, V)} ${ri(0, V)}`
  for (let s = 0; s < segs; s++) {
    d +=
      s % 2 === 0
        ? ` C${ri(0, V)} ${ri(0, V)} ${ri(0, V)} ${ri(0, V)} ${ri(0, V)} ${ri(0, V)}`
        : ` L${ri(0, V)} ${ri(0, V)}`
  }
  return d + ' Z'
}

function genSvg(i: number): { svg: string; kind: string } {
  const V = [16, 24, 48, 64][i % 4]
  const tier = i % 3
  const segs = [3, 8, 18][tier]
  const r = i % 20
  const kind = r < 2 ? 'gradient' : r < 7 ? 'multicolor' : 'mono'
  let body = ''
  if (kind === 'gradient') {
    body =
      `<defs><linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${COLORS[i % COLORS.length]}"/>` +
      `<stop offset="1" stop-color="${COLORS[(i + 3) % COLORS.length]}"/></linearGradient></defs>` +
      `<path d="${pathD(V, segs)}" fill="url(#g${i})"/>`
  } else if (kind === 'multicolor') {
    const nPaths = 2 + (i % 3) // 2..4 个不同颜色
    for (let p = 0; p < nPaths; p++) body += `<path d="${pathD(V, segs)}" fill="${COLORS[(i + p) % COLORS.length]}"/>`
  } else {
    const nPaths = [1, 1, 2][tier]
    for (let p = 0; p < nPaths; p++) body += `<path d="${pathD(V, segs)}" fill="${COLORS[i % COLORS.length]}"/>`
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V} ${V}">${body}</svg>`, kind }
}

await rm(iconsDir, { recursive: true, force: true })
await mkdir(iconsDir, { recursive: true })
const comp = { mono: 0, multicolor: 0, gradient: 0 }
for (let i = 0; i < N; i++) {
  const g = genSvg(i)
  comp[g.kind as keyof typeof comp]++
  await writeFile(resolve(iconsDir, `i${String(i).padStart(4, '0')}.svg`), g.svg)
}
console.log(`生成并保留 ${N} 个图标 @ ${iconsDir}`)
console.log(`  组成: 单色 ${comp.mono} / 多色 ${comp.multicolor} / 渐变 ${comp.gradient}`)

process.env.COLORFONT_COLRV1_WASM = wasmPkg
const { buildAndWrite } = await import('../src/index.ts')

await rm(demoDir, { recursive: true, force: true })
const t = performance.now()
const r = await buildAndWrite({
  input: iconsDir,
  outDir: demoDir,
  fontName: 'DemoIcons',
  colorFormat: 'colrv1',
  formats: ['woff2', 'woff'],
})
if (!r) throw new Error('demo: buildAndWrite 命中缓存(无产物结果)。先删 demoDir 或缓存后重跑。')
const ms = performance.now() - t
const flavors = [...new Set(r.assets.map((a) => a.color))]
const totalKB = (r.assets.reduce((s, a) => s + a.source.length, 0) / 1024).toFixed(0)
console.log(`\n构建 1000 图标 → 四档: ${ms.toFixed(0)}ms (${(ms / N).toFixed(2)} ms/图标)`)
console.log(`  档位: ${flavors.join(', ')}; 产物合计 ${totalKB}KB`)
for (const a of r.assets) console.log(`    ${a.color}.${a.format}: ${(a.source.length / 1024).toFixed(0)}KB`)

// 验收页:渲染全部图标(class),彩色图标置顶
const glyphs = r.metadata.glyphs
const colorNames = new Set(glyphs.filter((g) => g.color).map((g) => g.name))
const cell = (g: { name: string }) =>
  `<div class="cell${colorNames.has(g.name) ? ' c' : ''}" title="${g.name}"><span class="icon icon-${g.name}"></span></div>`
const colorCells = glyphs.filter((g) => g.color).map(cell).join('')
const allCells = glyphs.map(cell).join('')

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>colorfont 浏览器验收</title>
<link rel="stylesheet" href="./DemoIcons.css">
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#fafafa;color:#222}
  h1{font-size:18px} h2{font-size:15px;margin-top:28px}
  .legend{background:#fff;border:1px solid #e3e3e3;border-radius:8px;padding:12px 16px;max-width:820px}
  .legend b{color:#1e88e5}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;margin-top:12px}
  .cell{display:flex;align-items:center;justify-content:center;height:40px;background:#fff;border:1px solid #eee;border-radius:6px}
  .cell.c{outline:2px solid #ffd54f}
  .icon{font-size:24px;color:#555}            /* 单色图标随这个 color 走;彩色图标用自带调色板 */
  .big .cell{height:64px} .big .icon{font-size:44px}
  .controls{margin:10px 0}
  .swatch{display:inline-block;margin-right:8px}
</style></head><body>
<h1>colorfont 浏览器验收 — 1000 个测试图标</h1>
<div class="legend">
  <p>每个浏览器会从 <code>@font-face</code> 的 <b>tech()</b> 回退链里挑它支持的那档:
  <b>Chrome/Edge</b> → COLRv1(渐变);<b>Firefox</b> → COLRv1/OT-SVG;<b>Safari</b> → OT-SVG;
  老环境 → COLRv0 / 单色。</p>
  <p>下面<b>黄框</b>标出的是<b>彩色图标</b>(多色 / 渐变):在支持的浏览器里应显示<b>多种颜色 / 渐变</b>;
  单色图标随 CSS <code>color</code>(此处灰色)。把页面分别在 Chrome 和 Safari 打开对比即可验收。</p>
  <p>当前 <code>color</code>: <button onclick="document.documentElement.style.setProperty('--c','#555')">灰</button>
  <button onclick="document.documentElement.style.setProperty('--c','#e53935')">红</button>
  <button onclick="document.documentElement.style.setProperty('--c','#1e88e5')">蓝</button>
  (改色只影响单色图标,彩色图标不受影响 → 这本身就是彩色字体生效的证据)</p>
</div>
<style>.icon{color:var(--c,#555)}</style>
<h2>彩色图标(${colorNames.size} 个,放大)</h2>
<div class="grid big">${colorCells}</div>
<h2>全部 ${glyphs.length} 个图标</h2>
<div class="grid">${allCells}</div>
</body></html>`
await writeFile(resolve(demoDir, 'index.html'), html)
console.log(`\n验收页: ${resolve(demoDir, 'index.html')}`)
console.log('✅ DEMO READY')
