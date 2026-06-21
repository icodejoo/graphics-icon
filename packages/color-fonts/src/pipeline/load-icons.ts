import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { normalizeName } from '../util/svg.ts'

export interface RawIcon {
  name: string
  svg: string
}

/** 扫描一个或多个目录下的 .svg,返回规范化命名的原始图标。 */
export async function loadIcons(dirs: string[]): Promise<RawIcon[]> {
  const out: RawIcon[] = []
  const seen = new Set<string>()
  for (const dir of dirs) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.svg')) continue
      const name = normalizeName(e.name)
      if (seen.has(name)) throw new Error(`图标名冲突: "${name}"(来自 ${e.name})`)
      seen.add(name)
      const svg = await readFile(join(dir, e.name), 'utf8')
      out.push({ name, svg })
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
