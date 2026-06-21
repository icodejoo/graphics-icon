import { pathToFileURL } from 'node:url'

import type { Colrv1Doc } from './paint.ts'

interface WasmModule {
  add_colrv1(baseSfnt: Uint8Array, docJson: string): Uint8Array
}

let cached: WasmModule | null | undefined

function pick(m: Record<string, unknown>): WasmModule | null {
  // 兼容 CJS 默认导出互操作
  const mod = (typeof m.add_colrv1 === 'function' ? m : (m.default as Record<string, unknown> | undefined)) as
    | WasmModule
    | undefined
  return mod && typeof mod.add_colrv1 === 'function' ? mod : null
}

async function tryImport(spec: string): Promise<WasmModule | null> {
  try {
    return pick((await import(spec)) as Record<string, unknown>)
  } catch {
    return null
  }
}

/**
 * 惰性加载 colrv1-writer 的 wasm 产物(wasm-pack --target nodejs)。未构建则返回 null。
 * 候选顺序:① 环境变量 COLORFONT_COLRV1_WASM(包名或文件路径);
 *           ② 相对发布产物 ./colrv1/colrv1_writer.js(随插件发布);
 *           ③ 包名 'colrv1-writer'(变量 specifier,避免打包器静态解析)。
 */
async function loadWasm(): Promise<WasmModule | null> {
  if (cached !== undefined) return cached
  const candidates: string[] = []
  const env = process.env.COLORFONT_COLRV1_WASM
  if (env) candidates.push(/[\\/]/.test(env) ? pathToFileURL(env).href : env)
  try {
    candidates.push(new URL('./colrv1/colrv1_writer.js', import.meta.url).href)
  } catch {
    /* import.meta.url 不可用 */
  }
  candidates.push('colrv1-writer')

  for (const c of candidates) {
    const mod = await tryImport(c)
    if (mod) {
      cached = mod
      return cached
    }
  }
  cached = null
  return cached
}

export async function isColrv1Available(): Promise<boolean> {
  return (await loadWasm()) != null
}

/** base SFNT + paint 树 → 含 COLRv1+CPAL 的 SFNT。需先构建 wasm。 */
export async function addColrv1(baseSfnt: Uint8Array, doc: Colrv1Doc): Promise<Uint8Array> {
  const mod = await loadWasm()
  if (!mod) {
    throw new Error(
      'colrv1-writer wasm 未构建。请在 packages/colrv1-writer 运行 `wasm-pack build --target nodejs`(需安装 Rust),' +
        '或设环境变量 COLORFONT_COLRV1_WASM 指向已构建产物。',
    )
  }
  return mod.add_colrv1(baseSfnt, JSON.stringify(doc))
}
