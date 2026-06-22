// svg-icons 多实例 + groupCache 集成自测。Node 24 直接跑 .ts。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { autoGenBanner } from "@codejoo/utils/banner"

import { svgIcons } from "./src/create.ts"

const root = resolve(process.cwd(), ".svg-test-tmp")
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
process.chdir(root)

let pass = 0
let fail = 0
const check = (c: boolean, m: string): void => {
  if (c) pass++
  else {
    fail++
    console.error("  ✗", m)
  }
}

// 捕获日志以判定命中
let logs: string[] = []
const origLog = console.log
const capture = async (fn: () => Promise<void>): Promise<void> => {
  logs = []
  console.log = (...a: unknown[]) => {
    logs.push(a.join(" "))
  }
  try {
    await fn()
  } finally {
    console.log = origLog
  }
}
const hadHit = (): boolean => logs.some((l) => l.includes("命中缓存"))

mkdirSync("icons", { recursive: true })
writeFileSync("icons/home.svg", `<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="#333"/></svg>`)
writeFileSync("icons/star.svg", `<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5 5 2 7-7-4-7 4 2-7-5-5h7z" fill="#333"/></svg>`)

// output 新 shape：{ dir, name, ts? }。三产物路径派生：out/icons.{svg,ts,json}
const opts = (cache = true) => ({
  color: "mono" as const, // 公共参数:合并进 item
  cache,
  items: [{ sources: "icons", output: { dir: "out", name: "icons" } }],
})

await capture(() => svgIcons(opts()))
check(existsSync("out/icons.svg"), "sprite svg generated")
check(existsSync("out/icons.ts"), "script generated (.ts by default)")
check(existsSync("out/icons.json"), "json manifest generated")
// banner 校验:sprite svg 含 xml banner;ts 入口首部含 line banner。
const svgText = readFileSync("out/icons.svg", "utf8")
const tsText = readFileSync("out/icons.ts", "utf8")
check(svgText.includes(autoGenBanner("xml").trim()), "banner: sprite svg 含 xml 注释 banner")
check(tsText.startsWith(autoGenBanner("line")), "banner: 入口 ts 首部含 line 注释 banner")
check(tsText.includes("export type IconName ="), "ts:default 产 IconName 联合类型")
// color:'mono' → 健壮单色:每个 symbol 根设 fill+stroke=currentColor;内部具体色(#333)被移除(继承根)。
check(/<symbol\b[^>]*\bfill="currentColor"/.test(svgText), "color:'mono' → symbol 根含 fill=currentColor")
check(/<symbol\b[^>]*\bstroke="currentColor"/.test(svgText), "color:'mono' → symbol 根含 stroke=currentColor")
check(!svgText.includes("#333"), "color:'mono' → 内部具体色 #333 被移除(继承根 currentColor)")
// json 清单:纯数据,无 banner;含 sprite 文件名 + icons symbol id 列表。
const jsonText = readFileSync("out/icons.json", "utf8")
const manifest = JSON.parse(jsonText) as { sprite: string; icons: string[] }
check(jsonText.trimStart().startsWith("{"), "json manifest 无 banner(纯数据,以 { 开头)")
check(manifest.sprite === "icons.svg", "json.sprite = 'icons.svg'")
check(manifest.icons.includes("home") && manifest.icons.includes("star"), "json.icons 含 home + star")
const cacheFile = resolve(root, ".cache.graphics/svg-icons-icons.json")
check(existsSync(cacheFile), "per-instance cache file written (svg-icons-icons.json)")
check(!hadHit(), "1st run = miss")

await capture(() => svgIcons(opts()))
check(hadHit(), "2nd run unchanged = HIT")

// 改输入 → miss
writeFileSync("icons/extra.svg", `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#333"/></svg>`)
await capture(() => svgIcons(opts()))
check(!hadHit(), "added input = miss")

// 删产物 → miss(existsSync 校验);恒产三产物都应被恢复
rmSync("out/icons.ts")
rmSync("out/icons.json")
await capture(() => svgIcons(opts()))
check(!hadHit(), "deleted product = miss")
check(existsSync("out/icons.ts") && existsSync("out/icons.json"), "deleted products restored (script + json)")

// cache:false → 删旧产物+json,强制重建
await capture(() => svgIcons(opts(false)))
check(!hadHit(), "cache:false = miss")
check(existsSync("out/icons.svg") && existsSync(cacheFile), "cache:false rebuilt products + cache")

// ── ts:false → 产 .js 且无类型 ──
const jsOpts = () => ({
  items: [{ sources: "icons", output: { dir: "outjs", name: "icons", ts: false } }],
})
await capture(() => svgIcons(jsOpts()))
check(existsSync("outjs/icons.js"), "ts:false 产 .js")
check(!existsSync("outjs/icons.ts"), "ts:false 不产 .ts")
check(existsSync("outjs/icons.svg") && existsSync("outjs/icons.json"), "ts:false 仍恒产 sprite + json")
const jsText = readFileSync("outjs/icons.js", "utf8")
check(!jsText.includes("export type"), "ts:false 的 .js 无 export type")
check(jsText.includes("iconsName") && jsText.includes("iconsHref"), "ts:false 的 .js 仍含运行时对象")

// ── 多源目录:两目录的 svg 合进同一 sprite ──
mkdirSync("a", { recursive: true })
mkdirSync("b", { recursive: true })
writeFileSync("a/alpha.svg", `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#111"/></svg>`)
writeFileSync("b/beta.svg", `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#222"/></svg>`)
const multiOpts = () => ({
  items: [{ sources: ["a", "b"], output: { dir: "outmulti", name: "merged" } }],
})
await capture(() => svgIcons(multiOpts()))
const mergedSvg = readFileSync("outmulti/merged.svg", "utf8")
check(/<symbol\b[^>]*\bid="alpha"/.test(mergedSvg), "多源:sprite 含 a 目录的 symbol(alpha)")
check(/<symbol\b[^>]*\bid="beta"/.test(mergedSvg), "多源:sprite 含 b 目录的 symbol(beta)")
const mergedManifest = JSON.parse(readFileSync("outmulti/merged.json", "utf8")) as { icons: string[] }
check(mergedManifest.icons.includes("alpha") && mergedManifest.icons.includes("beta"), "多源:json.icons 含全部(alpha + beta)")

// ── 多源目录:同名 svg 跨目录冲突 → 抛错 ──
let warns: string[] = []
const origWarn = console.warn
const captureWarn = async (fn: () => Promise<void>): Promise<{ threw: boolean }> => {
  warns = []
  console.warn = (...a: unknown[]) => {
    warns.push(a.join(" "))
  }
  let threw = false
  try {
    await fn()
  } catch {
    threw = true
  } finally {
    console.warn = origWarn
  }
  return { threw }
}

writeFileSync("a/dup.svg", `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>`)
writeFileSync("b/dup.svg", `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>`)
const clashOpts = () => ({
  items: [{ sources: ["a", "b"], output: { dir: "outclash", name: "clash" } }],
})
const clash = await captureWarn(() => svgIcons(clashOpts()))
check(clash.threw, "多源:同名 svg 跨目录冲突默认抛错")
rmSync("a/dup.svg")
rmSync("b/dup.svg")

// ── 空输入 ──
mkdirSync("empty", { recursive: true })
const emptyOpts = (throwable?: boolean) => ({
  color: "mono" as const,
  items: [{ sources: "empty", output: { dir: "out", name: "empty" }, ...(throwable === undefined ? {} : { throwable }) }],
})
const e1 = await captureWarn(() => svgIcons(emptyOpts()))
check(e1.threw, "empty input default throws")

// throwable:false → 不抛(告警续跑)
const e2 = await captureWarn(() => svgIcons(emptyOpts(false)))
check(!e2.threw, "empty input throwable:false does not throw")

// ── color:'mono' 边界:保留 none、移除 url(渐变)、根 fill+stroke=currentColor ──
mkdirSync("mono", { recursive: true })
// 一个图标:具体 fill(#abc)、stroke(#def)、fill="none"(镂空,须保留)、fill="url(#g)"(渐变,须移除)。
writeFileSync(
  "mono/m.svg",
  `<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>` +
    `<path d="M0 0h24v24H0z" fill="#abc" stroke="#def"/><path d="M4 4h4v4H4z" fill="none"/><circle cx="12" cy="12" r="6" fill="url(#g)"/></svg>`,
)
await capture(() => svgIcons({ color: "mono" as const, items: [{ sources: "mono", output: { dir: "outmono", name: "m" } }] }))
const monoSvg = readFileSync("outmono/m.svg", "utf8")
check(/<symbol\b[^>]*\bfill="currentColor"[^>]*\bstroke="currentColor"|<symbol\b[^>]*\bstroke="currentColor"[^>]*\bfill="currentColor"/.test(monoSvg), "mono: 根 symbol 同时含 fill+stroke=currentColor")
check(!monoSvg.includes('"#abc"') && !monoSvg.includes('"#def"'), "mono: 描述元素具体色被移除")
check(monoSvg.includes('fill="none"'), "mono: fill=none 被保留(镂空不被填实)")
check(!/\bfill="url\(/.test(monoSvg), "mono: url(渐变) fill 被移除(继承根 currentColor)")

// ── color 为函数:逐色重映射,保留多色结构(不注入根 currentColor、不 strip) ──
mkdirSync("fn", { recursive: true })
writeFileSync("fn/f.svg", `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#111"/></svg>`)
const remap: ColorFn = (_n, _id, c) => (c === "#111" ? "#999" : c)
await capture(() => svgIcons({ color: remap, items: [{ sources: "fn", output: { dir: "outfn", name: "f" } }] }))
const fnSvg = readFileSync("outfn/f.svg", "utf8")
check(fnSvg.includes('fill="#999"'), "fn: #111 被重映射为 #999")
check(!fnSvg.includes('"#111"'), "fn: 原色 #111 已替换")
check(!/<symbol\b[^>]*\bfill="currentColor"/.test(fnSvg), "fn: 不注入根 currentColor(保留多色语义,区别于 mono)")

// ── color 省略(默认 'keep'):保留源多色,不注入 currentColor ──
mkdirSync("keep", { recursive: true })
writeFileSync("keep/k.svg", `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#abc"/></svg>`)
await capture(() => svgIcons({ items: [{ sources: "keep", output: { dir: "outkeep", name: "k" } }] })) // 不设 color → 默认 keep
const keepSvg = readFileSync("outkeep/k.svg", "utf8")
check(keepSvg.includes('fill="#abc"'), "keep(默认): 源具体色 #abc 原样保留")
check(!/<symbol\b[^>]*\bfill="currentColor"/.test(keepSvg), "keep(默认): 不注入根 currentColor")

// ── id 作用域化(修 issue #38):两图标各含同名内部 id + url(#)/href 引用 → 作用域化后不撞、引用仍正确 ──
// id scoping: two icons each with the same internal id + url(#)/href refs → scoped without collision, refs intact.
mkdirSync("scope", { recursive: true })
// 两个文件都内部定义 id="c"(clipPath)与 id="g"(渐变),并以 url(#c)/url(#g)/href="#g" 引用——跨图标同名。
writeFileSync(
  "scope/one.svg",
  `<svg viewBox="0 0 24 24"><defs><clipPath id="c"><rect width="24" height="24"/></clipPath>` +
    `<linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>` +
    `<g clip-path="url(#c)"><rect width="24" height="24" fill="url(#g)"/></g><use href="#g"/></svg>`,
)
writeFileSync(
  "scope/two.svg",
  `<svg viewBox="0 0 24 24"><defs><clipPath id="c"><circle cx="12" cy="12" r="12"/></clipPath>` +
    `<linearGradient id="g"><stop offset="0" stop-color="#00f"/></linearGradient></defs>` +
    `<g clip-path="url(#c)"><circle cx="12" cy="12" r="12" fill="url(#g)"/></g><use href="#g"/></svg>`,
)
// color 省略(keep)→ 不动颜色,只看 id 作用域化效果。
await capture(() => svgIcons({ items: [{ sources: "scope", output: { dir: "outscope", name: "s" } }] }))
const scopeSvg = readFileSync("outscope/s.svg", "utf8")
// 1) 内部 id 按各自 symbol id 加前缀(one__c / one__g / two__c / two__g)→ 不再有裸 id="c"/id="g"。
check(scopeSvg.includes('id="one__c"') && scopeSvg.includes('id="one__g"'), "scope: one 内部 id 加前缀(one__c/one__g)")
check(scopeSvg.includes('id="two__c"') && scopeSvg.includes('id="two__g"'), "scope: two 内部 id 加前缀(two__c/two__g)")
check(!/\bid="c"/.test(scopeSvg) && !/\bid="g"/.test(scopeSvg), "scope: 无裸内部 id(c/g 全部被作用域化)")
// 2) url(#)/href 引用同步改写到带前缀 id,且各自指向本 symbol(不跨图标撞)。
check(scopeSvg.includes("url(#one__c)") && scopeSvg.includes("url(#one__g)") && scopeSvg.includes('href="#one__g"'), "scope: one 内引用改写为 one__* 前缀")
check(scopeSvg.includes("url(#two__c)") && scopeSvg.includes("url(#two__g)") && scopeSvg.includes('href="#two__g"'), "scope: two 内引用改写为 two__* 前缀")
check(!/url\(#c\)/.test(scopeSvg) && !/url\(#g\)/.test(scopeSvg) && !/href="#g"/.test(scopeSvg), "scope: 无裸引用(url(#c)/url(#g)/href=#g 全部被作用域化)")
// 3) <symbol id="..."> 本身(图标名)绝不被加前缀。
check(/<symbol\b[^>]*\bid="one"/.test(scopeSvg) && /<symbol\b[^>]*\bid="two"/.test(scopeSvg), "scope: symbol 根 id(图标名 one/two)不被改动")

process.chdir(resolve(root, ".."))
rmSync(root, { recursive: true, force: true })
console.log(`\n${fail === 0 ? "✅" : "❌"} svg-icons test: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
