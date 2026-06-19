// napi(原生 ttf2woff2)vs 当前 wasm(woff2-encoder / Google woff2)对比 + 彩色表透传验证。
// 前置:已构建 packages/woff2-bench/target/release/woff2-bench.exe(需 mingw)。
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compress, decompress } from 'woff2-encoder'

const here = dirname(fileURLToPath(import.meta.url))
const icons = resolve(here, '../.bench-icons')
const out = resolve(here, '../.napi-out')
const bin = resolve(here, '../../woff2-bench/target/release/woff2-bench.exe')
process.env.COLORFONT_COLRV1_WASM = resolve(here, '../../colrv1-writer/pkg/colrv1_writer.js')

if (!existsSync(bin)) {
  console.error('❌ 未找到原生二进制:', bin, '\n   先在 packages/woff2-bench 跑 cargo build --release(需 mingw)')
  process.exit(2)
}

const { buildAndWrite } = await import('../src/index.ts')

// 1. 构建 4 档 TTF(原始 SFNT,供两种编码器各自压)
await buildAndWrite({ input: icons, outDir: out, fontName: 'N', colorFormat: 'colrv1', formats: ['ttf'], threads: false })
const ttfs = readdirSync(out)
  .filter((f) => f.endsWith('.ttf'))
  .map((f) => ({ flavor: f.match(/\.([a-z0-9]+)\.[a-f0-9]+\.ttf$/)?.[1] ?? f, path: resolve(out, f) }))

function tableDir(buf: Uint8Array): Set<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = dv.getUint16(4)
  const set = new Set<string>()
  for (let i = 0, p = 12; i < n; i++, p += 16)
    set.add(String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]).trim())
  return set
}

function native(ttf: string, mode: string): { ms: number; bytes: number } {
  const r = execFileSync(bin, [ttf, '8', mode, '11'], { encoding: 'utf8' })
  const j = JSON.parse(r.trim().split('\n').pop()!)
  return { ms: j.ms_per, bytes: j.bytes }
}

async function wasmMs(ttf: Uint8Array): Promise<{ ms: number; bytes: number }> {
  await compress(ttf) // warmup
  const t = performance.now()
  let b!: Uint8Array
  for (let i = 0; i < 8; i++) b = await compress(ttf)
  return { ms: (performance.now() - t) / 8, bytes: b.length }
}

// 注:opentype.js 产出 CFF-flavored 字体(无 glyf),故用 encode_no_transform
//(glyf transform 不适用;woff2-encoder/Google 对 CFF 同样只 brotli 透传,不变换 glyf,对比公平)。
console.log('=== 编码耗时对比(8 次均值, q11, no-transform)===')
console.log('flavor      | wasm(Google) ms |  native(ttf2woff2) ms | 加速 | wasm B | native B')
let sumWasm = 0
let sumNative = 0
for (const { flavor, path } of ttfs) {
  const ttf = new Uint8Array(readFileSync(path))
  const w = await wasmMs(ttf)
  const n = native(path, 'notransform')
  sumWasm += w.ms
  sumNative += n.ms
  console.log(
    `${flavor.padEnd(11)} | ${w.ms.toFixed(1).padStart(15)} | ${n.ms.toFixed(1).padStart(21)} | ${(w.ms / n.ms).toFixed(2)}× | ${w.bytes} | ${n.bytes}`,
  )
}
console.log(`合计:wasm ${sumWasm.toFixed(0)}ms vs native ${sumNative.toFixed(0)}ms → ${(sumWasm / sumNative).toFixed(2)}×`)

console.log('\n=== 彩色表透传验证(native ttf2woff2 → 解压回 SFNT → 查表)===')
for (const { flavor, path } of ttfs.filter((t) => t.flavor === 'colrv1' || t.flavor === 'otsvg')) {
  native(path, 'notransform') // 产出 <path>.nativewoff2
  const woff2 = new Uint8Array(readFileSync(path + '.nativewoff2'))
  const sfnt = await decompress(woff2)
  const tables = tableDir(sfnt)
  const want = flavor === 'colrv1' ? ['COLR', 'CPAL'] : ['SVG']
  const ok = want.every((t) => tables.has(t))
  console.log(`${flavor} → 表: ${[...tables].join(' ')}  | ${want.join('+')} ${ok ? '✅ 保留' : '❌ 丢失'}`)
}
console.log('\n✅ NAPI COMPARE DONE')
