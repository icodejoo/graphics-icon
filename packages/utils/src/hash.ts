/**
 * 内容哈希 —— 三个插件(bitmap-sprite / imagemin / svg-sprite)的缓存指纹同源。
 * Content hashing — the single source of cache fingerprints for all three plugins.
 *
 * 轻量、无第三方依赖,可被任意子路径安全引入而不触发重依赖加载。
 * Tiny and dependency-free, so importing it never pulls heavy modules.
 */

import { createHash } from "node:crypto"

/** sha256(十六进制)。接受 Buffer 或字符串。 / sha256 hex digest of a Buffer or string. */
export const sha256 = (input: Buffer | string): string => createHash("sha256").update(input).digest("hex")
