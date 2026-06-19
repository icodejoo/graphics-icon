/**
 * 幂等写入 —— 仅当内容/字节变化才落盘,避免无谓改 mtime / git / 构建抖动 / HMR 循环。
 * Idempotent writes — only touch disk when content/bytes change, avoiding pointless
 * mtime churn, git noise, build flapping and HMR loops.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

/** 写文本(未变则跳过)。返回是否实际写入。 / Write text (skip if unchanged). Returns whether it wrote. */
export function writeTextIfChanged(out: string, content: string): boolean {
  const abs = resolve(out)
  try {
    if (readFileSync(abs, "utf8") === content) return false
  } catch {
    // 文件不存在 → 直接写 / file missing → write
  }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, "utf8")
  return true
}

/** 写二进制(字节未变则跳过)。返回是否实际写入。 / Write bytes (skip if equal). Returns whether it wrote. */
// 接受 Buffer 或 Uint8Array:colorfont 的字体产物是 Uint8Array,sharp/bitmap 产物是 Buffer;两者运行时皆可。
export function writeBufferIfChanged(out: string, buf: Buffer | Uint8Array): boolean {
  const abs = resolve(out)
  try {
    if (readFileSync(abs).equals(buf)) return false
  } catch {
    // 文件不存在 → 直接写 / file missing → write
  }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, buf)
  return true
}
