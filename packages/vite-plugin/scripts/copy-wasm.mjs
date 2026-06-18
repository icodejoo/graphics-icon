// 把预编译的 colrv1 wasm 产物拷进 dist/colrv1,随插件一起发布(COLRv1 opt-in 时按需加载)。
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '../../colrv1-writer/pkg')
const outDir = resolve(here, '../dist/colrv1')

const files = ['colrv1_writer.js', 'colrv1_writer_bg.wasm', 'package.json', 'colrv1_writer.d.ts']

if (!existsSync(resolve(pkgDir, 'colrv1_writer.js'))) {
  console.warn('[copy-wasm] 未找到 colrv1-writer/pkg,跳过(COLRv1 wasm 未构建)。先在 packages/colrv1-writer 跑 wasm-pack/wasm-bindgen。')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
let n = 0
for (const f of files) {
  const src = resolve(pkgDir, f)
  if (existsSync(src)) {
    copyFileSync(src, resolve(outDir, f))
    n++
  }
}
console.log(`[copy-wasm] 已拷贝 ${n} 个文件到 dist/colrv1`)
