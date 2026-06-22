import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { normalizeName } from '../util/svg.ts'

export interface RawIcon {
  name: string
  svg: string
}

/**
 * 扫描一个或多个目录下的 .svg,返回规范化命名的原始图标。
 * `preloaded`(可选):绝对路径 → 文件内容(string)。命中则复用,避免二次磁盘读
 * (buildAndWrite 的 readSvgInputs 已读过一遍)。命名归一化/重名冲突语义不变。
 * Optional `preloaded` (abs path → content) reuses buffers already read upstream, skipping a second disk read.
 */
export async function loadIcons(dirs: string[], preloaded?: Map<string, string>): Promise<RawIcon[]> {
  const out: RawIcon[] = []
  const seen = new Set<string>()
  for (const dir of dirs) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.svg')) continue
      const name = normalizeName(e.name)
      if (seen.has(name)) throw new Error(`图标名冲突: "${name}"(来自 ${e.name})`)
      seen.add(name)
      const abs = resolve(dir, e.name)
      const svg = preloaded?.get(abs) ?? (await readFile(abs, 'utf8'))
      out.push({ name, svg })
    }
  }
  // locale 无关的码点序排序,保证跨机器/locale 字形顺序可复现(避免 git diff 抖动)。
  // Locale-independent codepoint-order sort for reproducible output across machines/locales.
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
}
