// 对比:单线程 vs 多线程(每档一 worker)在 1000 图标四档构建上的耗时。
import { performance } from 'node:perf_hooks'
import { availableParallelism } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const icons = resolve(here, '../.bench-icons')
const out = resolve(here, '../.bench-threads-out')
process.env.COLORFONT_COLRV1_WASM = resolve(here, '../../colrv1-writer/pkg/colrv1_writer.js')

const { build } = await import('../src/index.ts')

async function run(label: string, threads: boolean): Promise<{ ms: number; flavors: string[]; bytes: number }> {
  const s = performance.now()
  const r = await build({ input: icons, outDir: out, fontName: 'T', colorFormat: 'colrv1', formats: ['woff2'], threads })
  const ms = performance.now() - s
  const flavors = [...new Set(r.assets.map((a) => a.color))]
  const bytes = r.assets.reduce((n, a) => n + a.source.length, 0)
  console.log(`  ${label.padEnd(20)} ${ms.toFixed(0)}ms  档=${flavors.join('+')}  产物=${(bytes / 1024).toFixed(0)}KB`)
  return { ms, flavors, bytes }
}

console.log(`CPU 可并行度: ${availableParallelism()}`)
await run('warmup', false)
console.log('--- 对比(1000 图标, colrv1 四档, woff2) ---')
const single = await run('单线程', false)
const multi = await run('多线程(每档1worker)', true)

// 正确性:两者产出相同档位与相近字节
const ok =
  single.flavors.sort().join() === multi.flavors.sort().join() &&
  Math.abs(single.bytes - multi.bytes) < single.bytes * 0.02
console.log(`\n加速比: ${(single.ms / multi.ms).toFixed(2)}×  (单 ${single.ms.toFixed(0)}ms → 多 ${multi.ms.toFixed(0)}ms)`)
console.log(`节省: ${(single.ms - multi.ms).toFixed(0)}ms (${(((single.ms - multi.ms) / single.ms) * 100).toFixed(0)}%)`)
console.log(ok ? '✅ 多线程产物与单线程一致(档位相同、字节相近)' : '❌ 多线程产物与单线程不一致')
if (!ok) process.exit(1)
