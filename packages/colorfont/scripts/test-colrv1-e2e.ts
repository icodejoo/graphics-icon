import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// 指向已构建的 wasm 产物(wasm-pack --target nodejs --out-name colrv1_writer)
const pkgJs = resolve(here, '../colrv1-writer/pkg/colrv1_writer.js')
if (!existsSync(pkgJs)) {
  console.error('❌ 未找到 wasm 产物:', pkgJs)
  console.error('   先在 packages/colrv1-writer 跑: wasm-pack build --release --target nodejs --out-name colrv1_writer')
  process.exit(2)
}
process.env.COLORFONT_COLRV1_WASM = pkgJs

const { build } = await import('../src/index.ts')

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error('ASSERT FAILED: ' + m)
}

/** 读 SFNT 表目录 → { tag: {offset, length} }。 */
function tableDir(buf: Uint8Array): Map<string, { offset: number; length: number }> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const numTables = dv.getUint16(4)
  const dir = new Map<string, { offset: number; length: number }>()
  let p = 12
  for (let i = 0; i < numTables; i++) {
    const tag = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3])
    dir.set(tag, { offset: dv.getUint32(p + 8), length: dv.getUint32(p + 12) })
    p += 16
  }
  return dir
}

const result = await build({
  input: resolve(here, '../fixtures'),
  outDir: resolve(here, '../.c1-e2e-out'),
  fontName: 'C1e2e',
  colorFormat: 'colrv1',
  formats: ['ttf', 'woff2'],
})

console.log('flavors:', [...new Set(result.assets.map((a) => a.color))].join(', '))
if (result.warnings.length) console.log('warnings:', result.warnings.map((w) => w.code).join(', '))

const ttf = result.assets.find((a) => a.color === 'colrv1' && a.format === 'ttf')
assert(ttf, 'colrv1 ttf 资产存在(wasm 写表成功)')
const woff2 = result.assets.find((a) => a.color === 'colrv1' && a.format === 'woff2')
assert(woff2 && String.fromCharCode(...woff2.source.slice(0, 4)) === 'wOF2', 'colrv1 woff2 有效')

const dir = tableDir(ttf.source)
console.log('tables:', [...dir.keys()].join(' '))
const colr = dir.get('COLR')
const cpal = dir.get('CPAL')
assert(colr, '含 COLR 表')
assert(cpal, '含 CPAL 表')

const dv = new DataView(ttf.source.buffer, ttf.source.byteOffset, ttf.source.byteLength)
const colrVersion = dv.getUint16(colr.offset)
console.log('COLR version:', colrVersion, '| CPAL length:', cpal.length)
assert(colrVersion === 1, `COLR 应为 v1,实为 v${colrVersion}`)

console.log('\n✅ COLRv1 E2E OK (Rust/wasm 写出有效 COLR v1 + CPAL,可压成 woff2)')
