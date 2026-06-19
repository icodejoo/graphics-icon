/**
 * sprite 生成后的产物后处理（幂等）：
 *   1. 归一化 / 缩放（normalize 选项，可选）：每个 symbol 几何缩放到统一 viewBox 宽度，
 *      复用 colorfont 的 normalizeSvg（同一套缩放 + 整数化策略）。默认关闭。
 *   2. id 作用域化（修 issue #38，见 scope-ids.ts）
 *   3. 颜色改写（color 选项）
 *   4. 自产 script 入口文件（功能对齐 bitmap）：
 *        · ?url 导入输出 svg 并导出 iconsHref
 *        · 导出 iconsName 枚举对象（枚举每个图标名）
 *        · .ts 再导出 IconName 字符串字面量联合类型
 *
 * Post-processing of the emitted sprite (idempotent):
 *   1. normalize/scale (optional): scale each symbol geometry to a uniform viewBox width,
 *      reusing colorfont's normalizeSvg (same scale+integerize strategy). Off by default.
 *   2. id scoping (fixes issue #38)
 *   3. color rewrite
 *   4. auto-generated script entry (iconsHref + iconsName + IconName)
 *
 * 仅做文件改写；缓存闸门与钩子编排在 create.ts。
 */

import { readFile, writeFile } from "node:fs/promises"

import { relTo } from "@codejoo/utils/path-rel"
import { writeTextIfChanged } from "@codejoo/utils/fs-write"
import { normalizeSvg } from "@codejoo/utils/scale-svg"

import { scopeIconIds } from "./scope-ids.ts"

import type { ColorOption, NormalizeOption } from "./types.ts"

// 仅匹配「真正的颜色属性」；url(#..) 引用、none、currentColor 在替换时跳过
const COLOR_ATTR = /\b(fill|stroke|stop-color)="([^"]+)"/g

/** 默认归一化目标宽度（与 colorfont 的 normalizeSvg 默认一致）。 / Default normalize width (== colorfont). */
const DEFAULT_NORMALIZE_WIDTH = 1024

function resolveColor(opt: ColorOption, name: string, symbolId: string, current: string): string | null {
  if (opt === true) return "currentColor"
  if (typeof opt === "string") return opt
  if (typeof opt === "function") {
    const r = opt(name, symbolId, current)
    return r ? r : null
  }
  return null
}

/** 按 color 策略改写每个 <symbol> 内 fill/stroke/stop-color 的颜色值（纯函数）。 */
export function applyColor(sprite: string, opt: ColorOption): string {
  if (!opt) return sprite
  return sprite.replace(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g, (_full: string, attrs: string, inner: string) => {
    const idm = /\bid="([^"]+)"/.exec(attrs)
    const symbolId = idm ? idm[1] : ""
    // iconNameTransformer 默认为 identity，故文件名 ≈ symbolId；此处以 symbolId 充当 name
    const rewrite = (s: string): string =>
      s.replace(COLOR_ATTR, (m: string, prop: string, val: string) => {
        if (val === "none" || val === "currentColor" || val.startsWith("url(")) return m
        const next = resolveColor(opt, symbolId, symbolId, val)
        return next ? `${prop}="${next}"` : m
      })
    return `<symbol${rewrite(attrs)}>${rewrite(inner)}</symbol>`
  })
}

/** 把 normalize 选项解析为目标宽度；返回 0 表示关闭。 / Resolve normalize option to a width; 0 = off. */
function resolveNormalizeWidth(opt: NormalizeOption): number {
  if (!opt) return 0
  if (opt === true) return DEFAULT_NORMALIZE_WIDTH
  return opt.width && opt.width > 0 ? opt.width : DEFAULT_NORMALIZE_WIDTH
}

/**
 * 归一化 / 缩放每个 <symbol> 的几何（异步、可选）。
 * 对每个带 viewBox 的 symbol：用其 viewBox + inner 重建独立 <svg>，跑 normalizeSvg(scaleTo=width)，
 * 再把归一化后的 viewBox + inner 写回 <symbol>（保留 id 及其它属性，仅替换 viewBox 与内部内容）。
 * 无 viewBox 的 symbol 跳过。与 colorfont 引擎的 normalizeSvg 同策略，故各产物几何对齐、可被字体/雪碧图复用。
 * 幂等：再次以相同 width 归一化结果不变（整数化已稳定）。须在 id 作用域化 + 颜色改写「之前」执行，
 * 使后续步骤仍作用于归一化后的内容。
 *
 * Normalize/scale each <symbol>'s geometry (async, optional). For every symbol that has a viewBox,
 * reconstruct a standalone <svg viewBox="…">inner</svg>, run normalizeSvg({ scaleTo: width }), then
 * write the normalized viewBox + inner back into the <symbol> (preserving id and other attrs; only the
 * viewBox and inner content are replaced). Symbols without a viewBox are skipped. Same strategy as
 * colorfont's normalizeSvg, so outputs stay in sync. Idempotent. Runs BEFORE id-scoping + color so
 * downstream steps still apply.
 */
async function normalizeSymbols(sprite: string, width: number): Promise<string> {
  // 收集每个 symbol，逐个异步归一化后再拼回（regex replace 不支持 async，故手动遍历）。
  const re = /<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g
  let out = ""
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(sprite)) !== null) {
    const [full, attrs, inner] = m
    out += sprite.slice(last, m.index)
    last = m.index + full.length

    const vbMatch = /\bviewBox="([^"]+)"/.exec(attrs)
    if (!vbMatch) {
      out += full // 无 viewBox → 跳过（保持原样）
      continue
    }
    const viewBox = vbMatch[1]
    // 用 symbol 的 viewBox + inner 重建独立 svg → 归一化
    const standalone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`
    let normalized: string
    try {
      normalized = await normalizeSvg(standalone, { scaleTo: width })
    } catch {
      out += full // 归一化失败 → 保留原样，确保产物有效
      continue
    }
    // 从归一化结果里取回新的 viewBox 与新的 inner
    const newVbMatch = /\bviewBox="([^"]+)"/.exec(normalized)
    const newViewBox = newVbMatch ? newVbMatch[1] : viewBox
    const innerMatch = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(normalized)
    const newInner = innerMatch ? innerMatch[1] : inner
    // 把原 attrs 里的 viewBox 替换为新值（保留 id 及其它属性）
    const newAttrs = attrs.replace(/\bviewBox="[^"]+"/, `viewBox="${newViewBox}"`)
    out += `<symbol${newAttrs}>${newInner}</symbol>`
  }
  out += sprite.slice(last)
  return out
}

/** 从 sprite 提取所有 <symbol id="..."> 的 id（= 图标名），去重排序。 */
export function extractIconNames(sprite: string): string[] {
  const ids = new Set<string>()
  for (const m of sprite.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)) ids.add(m[1])
  return [...ids].sort()
}

/**
 * script 内容（纯函数）：
 *   import iconsHref from "<相对路径>?url"
 *   <空行>
 *   export { iconsHref }
 *   export const iconsName = { "a": "a", ... }   // 名称枚举对象
 *   export type IconName = "a" | ...             // 仅 .ts
 */
export function buildScriptFile(scriptFile: string, spriteFile: string, names: string[]): string {
  // 相对路径助手与 bitmap 共用（@codejoo/utils/path-rel）：正斜杠、确保 ./ 或 ../ 开头。
  const rel = relTo(scriptFile, spriteFile)
  const isTs = /\.ts$/i.test(scriptFile)
  const obj = names.map((n) => `"${n}": "${n}"`).join(", ")
  let content = `import iconsHref from "${rel}?url"\n\nexport { iconsHref }\nexport const iconsName = { ${obj} }\n`
  if (isTs) {
    content += `export type IconName = ${names.length > 0 ? names.map((n) => `"${n}"`).join(" | ") : "never"}\n`
  }
  return content
}

export interface PostTarget {
  /** 输出 svg 路径 */
  sprite: string
  /** 入口脚本 .ts/.js 路径；falsy 表示不生成 */
  script?: string
  color?: ColorOption
  /** 归一化 / 缩放策略（默认关闭） */
  normalize?: NormalizeOption
}

/** 对一组产物做后处理（sprite 改写 + 自产 script）。生成器写出 sprite 后调用。 */
export async function runPostProcess(t: PostTarget): Promise<void> {
  let sprite: string
  try {
    sprite = await readFile(t.sprite, "utf8")
  } catch {
    return // sprite 还没生成 → 跳过
  }

  // sprite：归一化（可选）→ id 作用域化 → 颜色改写
  let next = sprite
  const width = resolveNormalizeWidth(t.normalize)
  if (width > 0) next = await normalizeSymbols(next, width)
  next = scopeIconIds(next)
  next = applyColor(next, t.color)
  if (next !== sprite) {
    await writeFile(t.sprite, next, "utf8")
    sprite = next
  }

  // script：用 sprite 里的 symbol id 自产（幂等：内容未变不写盘，writeTextIfChanged 复用自 @codejoo/utils）
  if (t.script) {
    writeTextIfChanged(t.script, buildScriptFile(t.script, t.sprite, extractIconNames(sprite)))
  }
}
