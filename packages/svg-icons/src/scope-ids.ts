/**
 * 修复 vite-plugin-icons-spritesheet 的 issue #38：sprite 里各 <symbol> 内部定义的 id
 * （clipPath / linearGradient / mask / filter …）不隔离，跨图标同名会撞、先到的赢。
 *
 * 做法：把每个 <symbol> 内部「定义的 id」按该 symbol 的 id 加前缀，并同步改写本 symbol 内的
 * url(#id) / (xlink:)href="#id" 引用。
 *
 * 关键保证：
 *   · 只改 symbol「内部」的 id；绝不动 <symbol id="…"> 本身（= 图标名 = TS 类型来源）→ 类型不受影响。
 *   · 幂等：已带前缀的 id 跳过，可在每次 dev 重生成后反复调用而不会重复加前缀。
 *
 * Fixes vite-plugin-icons-spritesheet issue #38: ids defined inside each <symbol>
 * (clipPath / linearGradient / mask / filter …) aren't isolated, so same-named ids across
 * icons collide and the first one wins. We prefix every internally-defined id with the symbol's
 * own id and rewrite url(#id) / (xlink:)href="#id" references within that same symbol. The
 * <symbol id="…"> itself is never touched (it is the icon name / TS type source). Idempotent.
 *
 * 仅导出纯函数 scopeIconIds；落盘 / 插件钩子包装统一在 post-process.ts。
 */

import { mapSymbols } from "./post-process.ts"

const SEP = "__"

/** 对 sprite 字符串做 id 作用域化（纯函数，便于测试）。 / Scope ids in a sprite string (pure). */
export function scopeIconIds(sprite: string): string {
  // 用共用的 per-symbol 切分（mapSymbols），仅替换「切分方式」；per-symbol 内部加前缀/改引用逻辑一字不动。
  // 早退场景返回原 symbol 字符串 `<symbol${attrs}>${inner}</symbol>`——与原正则匹配的 full 逐字节相同。
  // Reuse the shared per-symbol split (mapSymbols); only the split changes. Early-exit cases return the
  // original symbol string `<symbol${attrs}>${inner}</symbol>`, byte-identical to the regex's `full`.
  return mapSymbols(sprite, (attrs: string, inner: string) => {
    const m = /\bid="([^"]+)"/.exec(attrs)
    if (!m) return `<symbol${attrs}>${inner}</symbol>`
    const prefix = m[1] + SEP

    const ids = new Set<string>()
    for (const idm of inner.matchAll(/\bid="([^"]+)"/g)) {
      if (!idm[1].startsWith(prefix)) ids.add(idm[1]) // 跳过已加前缀的 → 幂等
    }
    if (ids.size === 0) return `<symbol${attrs}>${inner}</symbol>`

    let scoped = inner
    // 长 id 先替换，避免短 id 恰为长 id 子串时误伤
    for (const id of [...ids].sort((a, b) => b.length - a.length)) {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const nid = prefix + id
      scoped = scoped
        .replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${nid}"`)
        .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${nid})`)
        .replace(new RegExp(`((?:xlink:)?href)="#${esc}"`, "g"), `$1="#${nid}"`)
    }
    return `<symbol${attrs}>${scoped}</symbol>`
  })
}
