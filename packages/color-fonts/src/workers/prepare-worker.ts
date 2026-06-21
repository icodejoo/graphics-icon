import { parentPort, workerData } from 'node:worker_threads'

import { prepareOne } from '../pipeline/prepare-core.ts'

import type { PreparedIcon, RawIcon } from '../pipeline/prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'

const { chunk, options } = workerData as { chunk: RawIcon[]; options: ResolvedOptions }
// prepareOne 现为 async(归一化复用 @codejoo/utils);await 全部后再回传,保持原顺序。
Promise.all(chunk.map((r) => prepareOne(r, options))).then((out: PreparedIcon[]) => {
  parentPort!.postMessage(out)
})
