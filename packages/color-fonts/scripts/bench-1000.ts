// 基准:1000 个不同大小/复杂度的 SVG 打包成字体的耗时。
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = resolve(here, '../.bench-icons')
const outDir = resolve(here, '../.bench-out')
const wasmPkg = resolve(here, '../colrv1-writer/pkg/colrv1_writer.js')
const N = 1000

// 确定性 PRNG(可复现)
let seed = 1234567
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00897b']

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

// 返回 svg 字符串 + 复杂度统计
function genSvg(i: number): { svg: string; paths: number; segs: number; kind: string } {
  const V = [16, 24, 48, 64][i % 4]
  const tier = i % 3 // 0 简单 / 1 中等 / 2 复杂
  const segsPerPath = [3, 8, 18][tier]
  const nPaths = [1, 2, 4][tier]
  let kind: string
  let body = ''
  if (i % 10 === 0) {
    // 渐变(单 path)
    kind = 'gradient'
    body =
      `<defs><linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${COLORS[i % COLORS.length]}"/>` +
      `<stop offset="1" stop-color="${COLORS[(i + 3) % COLORS.length]}"/></linearGradient></defs>` +
      `<path d="${pathD(V, segsPerPath)}" fill="url(#g${i})"/>`
  } else if (i % 3 === 0 && nPaths >= 2) {
    // 多色(每 path 一色)
    kind = 'multicolor'
    for (let p = 0; p < nPaths; p++) {
      body += `<path d="${pathD(V, segsPerPath)}" fill="${COLORS[(i + p) % COLORS.length]}"/>`
    }
  } else {
    // 单色
    kind = 'mono'
    for (let p = 0; p < nPaths; p++) body += `<path d="${pathD(V, segsPerPath)}" fill="${COLORS[i % COLORS.length]}"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V} ${V}">${body}</svg>`
  return { svg, paths: nPaths, segs: segsPerPath * nPaths, kind }
}

// 1) 生成 1000 个 svg
await rm(iconsDir, { recursive: true, force: true })
await mkdir(iconsDir, { recursive: true })
const stats = { mono: 0, multicolor: 0, gradient: 0, totalSegs: 0, maxSegs: 0 }
const t0 = performance.now()
for (let i = 0; i < N; i++) {
  const g = genSvg(i)
  stats[g.kind as 'mono' | 'multicolor' | 'gradient']++
  stats.totalSegs += g.segs
  stats.maxSegs = Math.max(stats.maxSegs, g.segs)
  await writeFile(resolve(iconsDir, `icon-${String(i).padStart(4, '0')}.svg`), g.svg)
}
const genMs = performance.now() - t0
console.log(`生成 ${N} 个 SVG: ${genMs.toFixed(0)}ms`)
console.log(`  组成: 单色 ${stats.mono} / 多色 ${stats.multicolor} / 渐变 ${stats.gradient}`)
console.log(`  复杂度: 平均 ${(stats.totalSegs / N).toFixed(1)} 段/图标, 最高 ${stats.maxSegs} 段`)

const { build } = await import('../src/index.ts')

async function bench(label: string, colorFormat: string, env?: string) {
  await rm(outDir, { recursive: true, force: true })
  if (env) process.env.COLORFONT_COLRV1_WASM = env
  else delete process.env.COLORFONT_COLRV1_WASM
  const t = performance.now()
  const r = await build({ input: iconsDir, outDir, fontName: 'Bench', colorFormat: colorFormat as never, formats: ['woff2'] })
  const ms = performance.now() - t
  const flavors = [...new Set(r.assets.map((a) => a.color))]
  const totalKB = (r.assets.reduce((s, a) => s + a.source.length, 0) / 1024).toFixed(0)
  const sizes = r.assets.map((a) => `${a.color} ${(a.source.length / 1024).toFixed(0)}KB`).join(', ')
  console.log(
    `\n[${label}] colorFormat=${colorFormat}\n` +
      `  耗时: ${ms.toFixed(0)}ms  (${(ms / N).toFixed(2)} ms/图标)\n` +
      `  档位: ${flavors.join(', ')}\n` +
      `  产物: ${totalKB}KB total — ${sizes}`,
  )
  return ms
}

await bench('单色基线', 'mono')
await bench('auto(mono+colrv0+otsvg)', 'auto')
await bench('colrv1(+ wasm 写表)', 'colrv1', wasmPkg)

await rm(iconsDir, { recursive: true, force: true })
await rm(outDir, { recursive: true, force: true })
console.log('\n✅ BENCH DONE')
