import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { CodepointEntry, CodepointMap } from '../types.ts'

export async function readLockfile(file: string, paFirst: number): Promise<CodepointMap> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (parsed && parsed.version === 1 && parsed.glyphs) return parsed as CodepointMap
  } catch {
    /* 不存在或损坏 → 新建 */
  }
  return { version: 1, paFirst, glyphs: {} }
}

/**
 * 墓碑式增量分配:复用已有码位;新增分配「当前最大码位 + 1」;
 * 删除的图标标 present=false 但保留码位(绝不回收,防语义漂移)。
 * 直接修改传入的 lock,并返回 name → codepoint。
 */
export function assignCodepoints(
  names: string[],
  lock: CodepointMap,
  today: string,
): Record<string, number> {
  for (const e of Object.values(lock.glyphs)) e.present = false

  let maxCp = lock.paFirst - 1
  for (const e of Object.values(lock.glyphs)) if (e.codepoint > maxCp) maxCp = e.codepoint

  for (const name of names) {
    const existing = lock.glyphs[name]
    if (existing) existing.present = true
    else lock.glyphs[name] = { codepoint: ++maxCp, since: today, present: true }
  }

  const map: Record<string, number> = {}
  for (const name of names) map[name] = lock.glyphs[name].codepoint
  return map
}

export function serializeLockfile(lock: CodepointMap): string {
  const entries = Object.entries(lock.glyphs).sort((a, b) => a[1].codepoint - b[1].codepoint)
  const glyphs: Record<string, CodepointEntry> = {}
  for (const [k, v] of entries) glyphs[k] = v
  return JSON.stringify({ version: 1, paFirst: lock.paFirst, glyphs }, null, 2) + '\n'
}

export async function writeLockfile(file: string, lock: CodepointMap): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, serializeLockfile(lock), 'utf8')
}
