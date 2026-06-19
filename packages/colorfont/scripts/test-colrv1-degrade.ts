import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error('ASSERT FAILED: ' + m)
}

const result = await build({
  input: resolve(here, '../fixtures'),
  outDir: resolve(here, '../.c1-degrade-out'),
  fontName: 'Deg',
  colorFormat: 'colrv1',
  formats: ['woff2'],
})

const flavors = new Set(result.assets.map((a) => a.color))
assert(flavors.has('mono'), '仍有 mono')
assert(flavors.has('colrv0'), '仍有 colrv0(共存/回退)')
assert(flavors.has('otsvg'), '仍有 otsvg(Safari)')
assert(!flavors.has('colrv1'), 'wasm 未构建 → 无 colrv1 档')
assert(
  result.warnings.some((w) => w.code === 'COLRV1_WASM_MISSING'),
  '给出 COLRV1_WASM_MISSING 警告',
)

console.log('flavors:', [...flavors].join(', '))
console.log('warning:', result.warnings.find((w) => w.code === 'COLRV1_WASM_MISSING')?.message)
console.log('\n✅ COLRv1 DEGRADE OK (无 wasm 时优雅降级到 colrv0+otsvg + 警告)')
