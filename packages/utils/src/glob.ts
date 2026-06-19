/**
 * glob 归一与匹配 —— include/exclude 语义在三个插件间保持一致。
 * Glob normalization & matching — keeps include/exclude semantics identical across plugins.
 *
 * 统一用正斜杠匹配,兼容 Windows 反斜杠路径。
 * Always matches with forward slashes so Windows backslash paths work too.
 */

import { matchesGlob } from "node:path"

/** 归一为数组(undefined → []，单值 → [值])。 / Normalize to an array (undefined → [], scalar → [v]). */
export const toGlobList = (g?: string | string[]): string[] => (g === undefined ? [] : Array.isArray(g) ? g : [g])

/** 路径是否命中 glob 列表中任意一个。 / True if path matches any glob in the list. */
export const matchesAnyGlob = (path: string, globs: string[]): boolean => {
  const p = path.replace(/\\/g, "/")
  return globs.some((g) => matchesGlob(p, g))
}
