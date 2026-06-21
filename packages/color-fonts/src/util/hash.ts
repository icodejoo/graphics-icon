import { createHash } from 'node:crypto'

/** 内容哈希(文件名 [hash] 与增量缓存用)。取 sha1 前 8 位 hex。 */
export function contentHash(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex').slice(0, 8)
}
