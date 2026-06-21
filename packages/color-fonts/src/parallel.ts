import { Worker } from 'node:worker_threads'

import { buildFlavorAssets } from './build-flavor.ts'

import type { PreparedIcon } from './build-flavor.ts'
import type { FontAsset, FontFlavor, ResolvedOptions } from './types.ts'

interface WorkerPayloadItem {
  fileName: string
  color: FontFlavor
  format: FontAsset['format']
  hash: string
  source: ArrayBuffer
}

function runInWorker(flavor: FontFlavor, icons: PreparedIcon[], options: ResolvedOptions): Promise<FontAsset[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/flavor-worker.ts', import.meta.url), {
      workerData: { flavor, icons, options },
    })
    worker.once('message', (payload: WorkerPayloadItem[]) => {
      worker.terminate()
      resolve(payload.map((p) => ({ ...p, source: new Uint8Array(p.source) })))
    })
    worker.once('error', (e) => {
      worker.terminate()
      reject(e)
    })
  })
}

/**
 * 构建多档字体。useThreads=true 时每档一个 worker 并行(主攻 woff2 编码,占比约 67%);
 * worker 失败时该档回退同步,保证正确性。否则顺序构建。
 */
export async function buildFlavors(
  flavors: FontFlavor[],
  icons: PreparedIcon[],
  o: ResolvedOptions,
  useThreads: boolean,
): Promise<FontAsset[]> {
  if (!useThreads) {
    const out: FontAsset[] = []
    for (const f of flavors) out.push(...(await buildFlavorAssets(f, icons, o)))
    return out
  }
  const per = await Promise.all(
    flavors.map((f) => runInWorker(f, icons, o).catch(() => buildFlavorAssets(f, icons, o))),
  )
  return per.flat()
}
