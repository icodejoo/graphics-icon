// 对「发布产物」本身的真实验收:加载已构建的 dist/index.js(core 已内联),
// 跑真实 vite build,colorFormat:'colrv1' —— 验证随包的相对 wasm 能产出 colrv1 字体。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build as viteBuild } from 'vite'

import graphicsIcon from '../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, 'app')
const coreFixtures = resolve(here, '../../colorfont/fixtures')
const distDir = resolve(here, '.acc-dist-pub')
const tmpOut = resolve(here, '.acc-tmp-pub')

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error('ASSERT FAILED: ' + m)
}
function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, base))
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'))
  }
  return out
}

assert(existsSync(resolve(here, '../dist/index.js')), '先 build:dist/index.js 应存在')
assert(existsSync(resolve(here, '../dist/colrv1/colrv1_writer.js')), 'dist/colrv1 wasm 已随包')

await rm(distDir, { recursive: true, force: true })

await viteBuild({
  root: appRoot,
  configFile: false,
  logLevel: 'error',
  build: { outDir: distDir, emptyOutDir: true },
  // 用已构建的发布插件(default 导出),开 colrv1(应触发相对 wasm 加载)
  plugins: [
    // graphicsIcon 现返回单个 Vite 插件(不再是数组),直接作为一个 plugin 用。
    graphicsIcon({
      colorfont: {
        input: coreFixtures,
        outDir: tmpOut,
        fontName: 'PubIcons',
        colorFormat: 'colrv1',
        formats: ['woff2'],
      },
    }),
  ],
})

const files = walk(distDir)
const fonts = files.filter((f) => f.startsWith('colorfont/') && f.endsWith('.woff2'))
console.log('[dist] fonts:', fonts.join(', '))
const flavors = new Set(fonts.map((f) => f.match(/PubIcons\.([a-z0-9]+)\./)?.[1]))
assert(flavors.has('mono'), 'mono 字体')
assert(flavors.has('colrv0'), 'colrv0 字体')
assert(flavors.has('otsvg'), 'otsvg 字体')
assert(flavors.has('colrv1'), '★ colrv1 字体(发布产物内联 core + 相对 wasm 全通)')

console.log('\n✅ DIST ACCEPTANCE OK (发布形态 dist/index.js 经真实 vite build 产出四档含 colrv1)')
