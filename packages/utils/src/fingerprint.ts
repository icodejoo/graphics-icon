/**
 * 缓存指纹约定 —— svg-icons 与 bitmap-icons 共用同一套 stamp 生成规则,确保两者格式同源、不漂移。
 * Cache-stamp convention — shared by svg-icons and bitmap-icons so both stay byte-identical.
 *
 *   stamp = sha256( JSON.stringify(config) + "\n" + 每个文件一行 "rel:sha256(内容)" )
 *   stamp = sha256( JSON.stringify(config) + "\n" + one "rel:sha256(content)" line per file )
 *
 * 调用方在各自的读取循环里收集 [相对路径, 内容] 对(顺序即决定指纹,需保持稳定/已排序),
 * 由本函数统一做「逐文件 hash + 拼接 + 总 hash」。轻量、无重依赖。
 * Callers collect [rel, content] pairs in their own read loop (order is significant — keep it stable/sorted);
 * this function does the per-file hashing + join + final hash. Tiny, no heavy deps.
 */

import { sha256 } from "./hash"

export function buildStamp(
  config: unknown,
  files: Iterable<readonly [rel: string, content: Buffer | string]>,
): string {
  const lines: string[] = []
  for (const [rel, content] of files) lines.push(`${rel}:${sha256(content)}`)
  return sha256(`${JSON.stringify(config)}\n${lines.join("\n")}`)
}
