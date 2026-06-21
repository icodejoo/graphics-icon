import ttf2woff from 'ttf2woff'

/** TTF → WOFF(ttf2woff,纯 JS)。兼容 v2({buffer})与 v3(Uint8Array)返回形态。 */
export function toWoff(ttf: Uint8Array): Uint8Array {
  const out = ttf2woff(ttf) as unknown
  if (out instanceof Uint8Array) return out
  if (out && typeof out === 'object' && 'buffer' in out) {
    const buf = (out as { buffer: ArrayBufferLike | Uint8Array }).buffer
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  }
  throw new Error('ttf2woff 返回了未知形态')
}
