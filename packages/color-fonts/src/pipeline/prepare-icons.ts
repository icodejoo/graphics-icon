// per-icon 预处理的并行调度:把图标切块分发到 worker 池(线程数 = CPU 线程数的一半),
// 每块在 worker 里跑 prepareOne(svgo + 解析 + 检测 + base/层轮廓)。图标少或禁用多线程时串行。
import { cpus } from 'node:os'
import { Worker } from 'node:worker_threads'

import { prepareOne } from './prepare-core.ts'

import type { PreparedIcon, RawIcon } from './prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'

const THREAD_THRESHOLD = 48 // 图标数低于此则串行(worker 启动开销不划算)
const MIN_CHUNK = 24 // 每个 worker 至少分这么多图标

function runChunk(chunk: RawIcon[], options: ResolvedOptions): Promise<PreparedIcon[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/prepare-worker.ts', import.meta.url), {
      workerData: { chunk, options },
    })
    worker.once('message', (icons: PreparedIcon[]) => {
      worker.terminate()
      resolve(icons)
    })
    worker.once('error', (e) => {
      worker.terminate()
      reject(e)
    })
  })
}

/** 并行预处理图标。useThreads=false 或图标过少时串行;否则用 CPU 线程一半的 worker 池。 */
export async function prepareIcons(
  raws: RawIcon[],
  o: ResolvedOptions,
  useThreads: boolean,
): Promise<PreparedIcon[]> {
  if (!useThreads || raws.length < THREAD_THRESHOLD) {
    return Promise.all(raws.map((r) => prepareOne(r, o)))
  }
  // 点1:线程数取 CPU 线程数的一半;但 worker 启动有固定开销(各自加载 svgo),实测 >8 个后
  // 启动争用反而变慢,故封顶 8(≤16 线程机器即用 cpus/2)。可经 env COLORFONT_PREPARE_WORKERS 覆盖。
  const envN = Number(process.env.COLORFONT_PREPARE_WORKERS)
  const half = Math.max(1, Math.floor((cpus().length || 2) / 2))
  const maxWorkers = Number.isFinite(envN) && envN > 0 ? Math.floor(envN) : Math.min(half, 8)
  const nWorkers = Math.max(1, Math.min(maxWorkers, Math.floor(raws.length / MIN_CHUNK)))
  const size = Math.ceil(raws.length / nWorkers)

  const chunks: RawIcon[][] = []
  for (let i = 0; i < raws.length; i += size) chunks.push(raws.slice(i, i + size))

  // 各块并行;某 worker 失败时该块回退主线程同步处理,保证不丢图标
  const results = await Promise.all(
    chunks.map((c) =>
      runChunk(c, o).catch((e) => {
        // worker 失败 → 告警被吞的 error 后回退主线程同步处理该块(保证不丢图标,便于排查)。
        // Worker failed → warn the swallowed error, then process this chunk synchronously on the main thread.
        console.warn(`[colorfont] 预处理 worker 失败,已回退主线程同步处理(${c.length} 个图标):\n${String(e)}`)
        return Promise.all(c.map((r) => prepareOne(r, o)))
      }),
    ),
  )
  return results.flat() // 连续切块 → flat 即原始顺序
}
