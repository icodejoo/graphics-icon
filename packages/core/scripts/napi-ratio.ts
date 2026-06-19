// 真实"原生 vs wasm" woff2 编码比值(用 glyf 字体 verdana,因 ttf2woff2 只支持 glyf)。
// 三者(均 q11):native ttf2woff2(原生 exe)/ @0x6b/ttf2woff2-wasm(同款 Rust 的 wasm)/ woff2-encoder(Google woff2 wasm,我们当前用的)。
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compress } from 'woff2-encoder'
// @ts-expect-error CJS 默认导出
import ttf2woff2Wasm from '@0x6b/ttf2woff2-wasm'

const here = dirname(fileURLToPath(import.meta.url))
const bin = resolve(here, '../../woff2-bench/target/release/woff2-bench.exe')
const sample = resolve(here, '../.tmp-sample.ttf')
copyFileSync('C:/Windows/Fonts/verdana.ttf', sample) // 复制到可写目录(原生 exe 会在旁边写输出)
const ttf = new Uint8Array(readFileSync(sample))
const ITER = 10

function timeSync(label: string, fn: () => Uint8Array): { ms: number; bytes: number } {
  fn() // warmup
  const t = performance.now()
  let b!: Uint8Array
  for (let i = 0; i < ITER; i++) b = fn()
  const ms = (performance.now() - t) / ITER
  const bytes = b.length
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(1).padStart(8)} ms   ${(bytes / 1024).toFixed(0)} KB`)
  return { ms, bytes }
}

async function timeWasmGoogle(): Promise<{ ms: number; bytes: number }> {
  await compress(ttf)
  const t = performance.now()
  let b!: Uint8Array
  for (let i = 0; i < ITER; i++) b = await compress(ttf)
  const ms = (performance.now() - t) / ITER
  console.log(`  ${'woff2-encoder (Google woff2 wasm)'.padEnd(34)} ${ms.toFixed(1).padStart(8)} ms   ${(b.length / 1024).toFixed(0)} KB`)
  return { ms, bytes: b.length }
}

console.log(`样本: verdana.ttf (glyf, ${(ttf.length / 1024).toFixed(0)}KB), q11, ${ITER} 次均值\n`)

const wGoogle = await timeWasmGoogle()
const wRust = timeSync('@0x6b/ttf2woff2-wasm (Rust wasm)', () => ttf2woff2Wasm(Buffer.from(ttf)))
// native:用二进制内部测得的 ms_per(20 次均值,纯编码,不含进程启动开销)
let nRust: { ms: number; bytes: number } | null = null
if (existsSync(bin)) {
  const r = execFileSync(bin, [sample, '20', 'encode', '11'], { encoding: 'utf8' })
  const j = JSON.parse(r.trim().split('\n').pop()!)
  nRust = { ms: j.ms_per, bytes: j.bytes }
  console.log(`  ${'native ttf2woff2 (原生 exe)'.padEnd(34)} ${j.ms_per.toFixed(1).padStart(8)} ms   ${(j.bytes / 1024).toFixed(0)} KB`)
}

console.log('\n=== 比值 ===')
if (nRust) {
  console.log(`原生 vs 同款 wasm(ttf2woff2):${(wRust.ms / nRust.ms).toFixed(2)}×  (纯 wasm→原生 提速)`)
  console.log(`原生 ttf2woff2 vs 当前 Google-woff2(wasm):${(wGoogle.ms / nRust.ms).toFixed(2)}×`)
}
console.log(`ttf2woff2-wasm vs Google-woff2-wasm:${(wGoogle.ms / wRust.ms).toFixed(2)}× (同为 wasm,算法差异)`)
console.log('\n✅ RATIO DONE')
