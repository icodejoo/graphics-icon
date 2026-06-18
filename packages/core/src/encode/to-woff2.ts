import { compress } from 'woff2-encoder'

/** TTF → WOFF2(woff2-encoder,纯 wasm,无损透传所有表含彩色表)。 */
export async function toWoff2(ttf: Uint8Array): Promise<Uint8Array> {
  const out = await compress(ttf)
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBufferLike)
}
