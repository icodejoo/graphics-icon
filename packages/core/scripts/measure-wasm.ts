// 测量 wasm 部分(woff2 编码 / colrv1 写表)在 1000 图标构建里占的耗时,用于估算 napi 收益上界。
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const icons = resolve(here, '../.bench-icons')
const out = resolve(here, '../.measure-out')
process.env.COLORFONT_COLRV1_WASM = resolve(here, '../../colrv1-writer/pkg/colrv1_writer.js')

const { build } = await import('../src/index.ts')

async function t(label: string, opts: Record<string, unknown>): Promise<number> {
  const s = performance.now()
  await build({ input: icons, outDir: out, fontName: 'M', ...(opts as never) })
  const ms = performance.now() - s
  console.log(`  ${label.padEnd(38)} ${ms.toFixed(0)}ms`)
  return ms
}

await t('warmup', { colorFormat: 'mono', formats: ['ttf'] })
console.log('--- 测量 ---')
const monoTtf = await t('mono ttf (无任何 wasm)', { colorFormat: 'mono', formats: ['ttf'] })
const monoW2 = await t('mono woff2 (woff2 wasm 编码)', { colorFormat: 'mono', formats: ['woff2'] })
const c1Ttf = await t('colrv1 ttf (COLR 用 wasm 写, 无 woff2 编码)', { colorFormat: 'colrv1', formats: ['ttf'] })
const c1W2 = await t('colrv1 woff2 (4 档, 含 woff2 编码)', { colorFormat: 'colrv1', formats: ['woff2'] })

const woff2One = monoW2 - monoTtf
const woff2Four = c1W2 - c1Ttf
console.log('\n=== 结论 ===')
console.log(`woff2 编码(单 mono 字体): ${woff2One.toFixed(0)}ms`)
console.log(`woff2 编码(4 档字体合计): ${woff2Four.toFixed(0)}ms`)
console.log(`woff2 编码占 colrv1 总耗时: ${((woff2Four / c1W2) * 100).toFixed(0)}%`)
console.log(`colrv1 总耗时里"非 woff2 编码"(svgo/opentype.js/COLR写等 JS+wasm混合): ${c1Ttf.toFixed(0)}ms (${((c1Ttf / c1W2) * 100).toFixed(0)}%)`)
