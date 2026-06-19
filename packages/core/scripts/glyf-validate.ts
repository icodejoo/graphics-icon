// 路线甲验证:同批图标,glyf(svgicons2svgfont→svg2ttf)vs 当前 CFF(opentype.js)的 woff2 体积;
// 并验证 glyf 能让原生 ttf2woff2 跑通(我们的 CFF 跑不通)。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { compress } from 'woff2-encoder'
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont'
// @ts-expect-error CJS 默认导出
import svg2ttf from 'svg2ttf'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = resolve(here, '../.bench-icons')
const out = resolve(here, '../.glyf-out')
const bin = resolve(here, '../../woff2-bench/target/release/woff2-bench.exe')
process.env.COLORFONT_COLRV1_WASM = resolve(here, '../../colrv1-writer/pkg/colrv1_writer.js')

const { loadIcons } = await import('../src/pipeline/load-icons.ts')
const { normalizeSvg } = await import('../src/pipeline/normalize-svg.ts')
const { parseSvg } = await import('../src/util/svg.ts')
const { build } = await import('../src/index.ts')

const raw = await loadIcons([iconsDir])
// 构造仅含 path 的 mono SVG(去掉 fill/defs,svgicons2svgfont 取几何)
const icons = raw.map((ic, i) => {
  const { viewBox, paths } = parseSvg(normalizeSvg(ic.svg))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}">${paths.map((p) => `<path d="${p.d}"/>`).join('')}</svg>`
  return { name: ic.name, cp: 0xe000 + i, svg }
})

function buildSvgFont(): Promise<string> {
  return new Promise((res, rej) => {
    const stream = new SVGIcons2SVGFontStream({ fontName: 'g', fontHeight: 1000, normalize: true, log: () => {} })
    let s = ''
    stream.on('data', (d: Buffer) => (s += d)).on('finish', () => res(s)).on('error', rej)
    for (const ic of icons) {
      const g = Readable.from([ic.svg]) as Readable & { metadata?: unknown }
      g.metadata = { unicode: [String.fromCodePoint(ic.cp)], name: ic.name }
      stream.write(g)
    }
    stream.end()
  })
}

// ---- glyf 路线 ----
const t0 = performance.now()
const svgFont = await buildSvgFont()
const glyfTtf = Buffer.from(svg2ttf(svgFont, {}).buffer)
const glyfBuildMs = performance.now() - t0
writeFileSync(resolve(out + '.glyf.ttf'), glyfTtf)
const glyfWoff2 = await compress(new Uint8Array(glyfTtf))
console.log(`glyf 路线: TTF ${(glyfTtf.length / 1024).toFixed(0)}KB → woff2 ${(glyfWoff2.length / 1024).toFixed(0)}KB  (magic ${JSON.stringify(String.fromCharCode(...glyfTtf.slice(0, 4)))}, 构建 ${glyfBuildMs.toFixed(0)}ms)`)

// ---- 当前 CFF 路线(core mono)----
const r = await build({ input: iconsDir, outDir: out, fontName: 'C', colorFormat: 'mono', formats: ['woff2', 'ttf'], threads: false })
const cffWoff2 = r.assets.find((a) => a.format === 'woff2')!
const cffTtf = r.assets.find((a) => a.format === 'ttf')!
console.log(`CFF 路线 : TTF ${(cffTtf.source.length / 1024).toFixed(0)}KB → woff2 ${(cffWoff2.source.length / 1024).toFixed(0)}KB  (magic ${JSON.stringify(String.fromCharCode(...cffTtf.source.slice(0, 4)))})`)

console.log(`\n体积对比(mono woff2): CFF ${(cffWoff2.source.length / 1024).toFixed(0)}KB  vs  glyf ${(glyfWoff2.length / 1024).toFixed(0)}KB  → glyf 为 CFF 的 ${((glyfWoff2.length / cffWoff2.source.length) * 100).toFixed(0)}%`)

// ---- glyf 解锁原生 ttf2woff2? ----
if (existsSync(bin)) {
  try {
    const j = JSON.parse(execFileSync(bin, [resolve(out + '.glyf.ttf'), '20', 'encode', '11'], { encoding: 'utf8' }).trim().split('\n').pop()!)
    console.log(`\n原生 ttf2woff2(glyf): ✅ 跑通  ${j.ms_per.toFixed(1)}ms  ${(j.bytes / 1024).toFixed(0)}KB`)
  } catch (e) {
    console.log('\n原生 ttf2woff2(glyf): ❌', String(e).split('\n')[0])
  }
}
console.log('\n✅ GLYF VALIDATE DONE')
