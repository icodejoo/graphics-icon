import { parentPort, workerData } from 'node:worker_threads'

import { prepareOne } from '../pipeline/prepare-core.ts'

import type { PreparedIcon, RawIcon } from '../pipeline/prepare-core.ts'
import type { ResolvedOptions } from '../types.ts'

const { chunk, options } = workerData as { chunk: RawIcon[]; options: ResolvedOptions }
const out: PreparedIcon[] = chunk.map((r) => prepareOne(r, options))
parentPort!.postMessage(out)
