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

// PUA(Private Use Area)三段连续区间,新码位按序填充,跨段时跳过非 PUA 间隙。
// Private Use Areas: BMP PUA, then Plane-15 PUA-A, then Plane-16 PUA-B.
const PUA_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0xe000, 0xf8ff], // BMP PUA(6400)
  [0xf0000, 0xffffd], // Supplementary PUA-A(65534)
  [0x100000, 0x10fffd], // Supplementary PUA-B(65534)
]
const PUA_CAPACITY = PUA_RANGES.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0)

/**
 * 给定当前已用最大码位,返回下一个可用 PUA 码位;跨段时跳过间隙。
 * 三段 PUA 全部耗尽则抛错(中英双语),绝不静默越界到非 PUA/代理区。
 * Given the current max codepoint, return the next free PUA codepoint,
 * skipping gaps between planes; throw if all three PUA ranges are exhausted.
 */
function nextPuaCodepoint(cp: number): number {
  const next = cp + 1
  for (const [lo, hi] of PUA_RANGES) {
    if (next < lo) return lo // 落在段前间隙 → 跳到该段起点 / jump to range start
    if (next <= hi) return next // 落在段内 / within range
  }
  throw new Error(
    `PUA 码位已耗尽:专用区(PUA)三段共 ${PUA_CAPACITY} 个码位已全部分配,无法为新图标分配码位。` +
      `请减少图标数量或拆分为多个字体。\n` +
      `Private Use Area exhausted: all ${PUA_CAPACITY} PUA codepoints (BMP + PUA-A + PUA-B) are assigned; ` +
      `cannot allocate a codepoint for a new glyph. Reduce the icon count or split into multiple fonts.`,
  )
}

/**
 * 墓碑式增量分配:复用已有码位;新增分配「下一个可用 PUA 码位」(跨段跳间隙,耗尽即报错);
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
    else {
      maxCp = nextPuaCodepoint(maxCp)
      lock.glyphs[name] = { codepoint: maxCp, since: today, present: true }
    }
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
