import { parentPort, workerData } from 'node:worker_threads'

import { buildFlavorAssets } from '../build-flavor.ts'

import type { PreparedIcon } from '../build-flavor.ts'
import type { FontFlavor, ResolvedOptions } from '../types.ts'

interface WorkerInput {
  flavor: FontFlavor
  icons: PreparedIcon[]
  options: ResolvedOptions
}

const { flavor, icons, options } = workerData as WorkerInput
const assets = await buildFlavorAssets(flavor, icons, options)

// 用 transfer 把字体字节零拷贝传回主线程
const transfer: ArrayBuffer[] = []
const payload = assets.map((a) => {
  const buf = a.source.buffer.slice(
    a.source.byteOffset,
    a.source.byteOffset + a.source.byteLength,
  ) as ArrayBuffer
  transfer.push(buf)
  return { fileName: a.fileName, color: a.color, format: a.format, hash: a.hash, source: buf }
})
parentPort!.postMessage(payload, transfer)
