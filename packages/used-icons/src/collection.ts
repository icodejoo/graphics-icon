import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { getIconData, iconToSVG } from '@iconify/utils'

import type { IconifyJSON } from '@iconify/types'

/** 已加载的图标集 JSON,按「项目根 + 集合名」缓存。 */
const cache = new Map<string, IconifyJSON>()

/**
 * 从项目依赖里找到某个 Iconify 图标集的 JSON:优先 `@iconify-json/<name>`(单集合包),
 * 其次 `@iconify/json`(全量包)。找不到时抛出带安装提示的错误。
 * @param root 项目根目录(从这里解析依赖)
 * @param name 集合名,如 `lucide`
 */
export function loadCollection(root: string, name: string): IconifyJSON {
  const key = `${root}\0${name}`
  const hit = cache.get(key)
  if (hit) return hit
  const require = createRequire(join(root, 'package.json'))
  const candidates = [`@iconify-json/${name}/icons.json`, `@iconify/json/json/${name}.json`]
  for (const spec of candidates) {
    try {
      const json = JSON.parse(readFileSync(require.resolve(spec), 'utf8')) as IconifyJSON
      cache.set(key, json)
      return json
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error(`used-icons: 找不到图标集 "${name}",请安装 @iconify-json/${name}(或 @iconify/json)`)
}

/**
 * 图标集是否可用(已安装)。
 * @param root 项目根目录
 * @param name 集合名
 */
export function hasCollection(root: string, name: string): boolean {
  try {
    loadCollection(root, name)
    return true
  } catch {
    return false
  }
}

/**
 * 取一个图标并拼成完整的 `<svg>` 文本;图标集或图标不存在时返回 null(类名扫描时大量候选词不是图标,不该报错)。
 * @param root 项目根目录
 * @param collection 集合名
 * @param icon 图标名
 */
export function tryLoadIconSvg(root: string, collection: string, icon: string): string | null {
  if (!hasCollection(root, collection)) return null
  const data = getIconData(loadCollection(root, collection), icon)
  if (!data) return null
  const { attributes, body } = iconToSVG(data)
  const attrs = Object.entries(attributes)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`
}

/**
 * 列出图标集里的全部图标名(含别名),按字母序。用于生成类型与编辑器提示。
 * @param root 项目根目录
 * @param collection 集合名
 */
export function listIconNames(root: string, collection: string): string[] {
  const set = loadCollection(root, collection)
  return [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})].sort()
}

/**
 * 从项目根的 package.json 找出装了哪些 `@iconify-json/*` 图标集。
 * @param root 项目根目录
 * @returns 集合名数组;没有 package.json 或没装时为空
 */
export function detectCollections(root: string): string[] {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return []
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>
    const names = new Set<string>()
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const dep of Object.keys(pkg[field] ?? {})) if (dep.startsWith('@iconify-json/')) names.add(dep.slice('@iconify-json/'.length))
    }
    return [...names].sort()
  } catch {
    return []
  }
}

/** 文件名 → 图标名:去掉 `.svg`、转小写、非字母数字归一成连字符(与类名里能写的字符一致)。 */
export function dirIconName(file: string): string {
  return file
    .replace(/\.svg$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * 列出本地 SVG 目录里的图标名(目录里的 `.svg` 文件,不递归)。目录不存在时为空。
 * @param dir 绝对路径
 */
export function listDirIcons(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.svg'))
      .map(dirIconName)
      .sort()
  } catch {
    return []
  }
}

/**
 * 读取本地 SVG 目录里的一个图标;不存在时为 null。
 * @param dir 绝对路径
 * @param name 图标名(`dirIconName` 归一后的形式)
 */
export function loadDirIcon(dir: string, name: string): string | null {
  try {
    const file = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.svg') && dirIconName(f) === name)
    return file ? readFileSync(join(dir, file), 'utf8') : null
  } catch {
    return null
  }
}
