// 共享缓存自测:groupCache(grouped) + openPerFileCache(imagemin)。Node 24 直接跑 .ts。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { groupCache, loadCache, openPerFileCache, saveCache } from "./src/cache.ts"

const root = resolve(process.cwd(), ".cache-test-tmp")
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
process.chdir(root) // 让缓存内相对路径以此为根

let pass = 0
let fail = 0
const check = (cond: boolean, msg: string): void => {
  if (cond) pass++
  else {
    fail++
    console.error("  ✗", msg)
  }
}

// ───────── groupCache ─────────
mkdirSync("in", { recursive: true })
writeFileSync("in/a.svg", "<svg>a</svg>")
writeFileSync("in/b.svg", "<svg>b</svg>")

const cacheFile = resolve(root, ".cache/g.json")
const inputs = () => [
  { path: "in/a.svg", content: readFileSync("in/a.svg") },
  { path: "in/b.svg", content: readFileSync("in/b.svg") },
]
// 产物随输入变化(css 内容含输入),代表产物 = out/sheet.css
// out/extra.txt 由 regenerate 自行写盘(无 content)→ 验证 optional-content 读回路径
const regen = () => {
  mkdirSync("out", { recursive: true })
  writeFileSync("out/extra.txt", "extra:" + readFileSync("in/a.svg", "utf8"))
  return Promise.resolve([
    { path: "out/sheet.css", content: "css:" + readFileSync("in/a.svg", "utf8") + readFileSync("in/b.svg", "utf8") },
    { path: "out/sheet.svg", content: Buffer.from("svg:" + readFileSync("in/a.svg", "utf8")) },
    { path: "out/extra.txt" }, // 无 content:regenerate 已写盘,groupCache 读回算 hash
  ])
}
const args = (cache = true, configHash = "cfg1") => ({ cacheFile, cache, configHash, inputs: inputs(), representative: "out/sheet.css" })

let r = await groupCache(args(), regen)
check(!r.hit, "1st run = miss")
check(existsSync("out/sheet.css") && existsSync("out/sheet.svg"), "products written")
check(existsSync("out/extra.txt"), "side-effect product (no content) written by regenerate")
check(existsSync(cacheFile), "cache json written")

r = await groupCache(args(), regen)
check(r.hit, "2nd run unchanged = HIT")

writeFileSync("in/a.svg", "<svg>a2</svg>")
r = await groupCache(args(), regen)
check(!r.hit, "changed input = miss")
r = await groupCache(args(), regen)
check(r.hit, "hit after rebuild")

rmSync("out/sheet.svg")
r = await groupCache(args(), regen)
check(!r.hit, "deleted product = miss (existsSync)")
check(existsSync("out/sheet.svg"), "deleted product restored")

writeFileSync("out/sheet.css", "tampered")
r = await groupCache(args(), regen)
check(!r.hit, "tampered representative = miss")

r = await groupCache(args(true, "cfg2"), regen)
check(!r.hit, "configHash change = miss")
r = await groupCache(args(true, "cfg2"), regen)
check(r.hit, "hit with new configHash")

// cache:false → 删旧产物 + json,强制重建
const before = readFileSync(cacheFile, "utf8")
r = await groupCache(args(false, "cfg2"), regen)
check(!r.hit, "cache:false = miss (forced)")
check(existsSync(cacheFile), "cache json rewritten after cache:false")
void before

// 旧产物清理:regen 这次只产 css,sheet.svg 应被删
writeFileSync("in/a.svg", "<svg>a3</svg>") // 强制 miss
const regenOnlyCss = () => Promise.resolve([{ path: "out/sheet.css", content: "only-css:" + readFileSync("in/a.svg", "utf8") }])
r = await groupCache(args(true, "cfg2"), regenOnlyCss)
check(!r.hit, "prune test = miss")
check(!existsSync("out/sheet.svg"), "stale product (sheet.svg) pruned")
check(!existsSync("out/extra.txt"), "stale side-effect product (extra.txt) pruned")
check(r.removed.includes("out/sheet.svg") && r.removed.includes("out/extra.txt"), "removed[] reports pruned products")

// regenerate 抛错 → 向上抛 + 不写缓存
writeFileSync("in/a.svg", "<svg>a4</svg>") // 强制 miss
const cacheBeforeErr = readFileSync(cacheFile, "utf8")
let threw = false
try {
  await groupCache(args(true, "cfg2"), () => Promise.reject(new Error("boom")))
} catch {
  threw = true
}
check(threw, "regenerate throw propagates")
check(readFileSync(cacheFile, "utf8") === cacheBeforeErr, "cache NOT updated on regenerate error")

// ───────── openPerFileCache ─────────
const pf = resolve(root, ".cache/imagemin.json")
mkdirSync("img", { recursive: true })
writeFileSync("img/x.png", "xdata")

let c = openPerFileCache(pf, "icfg1")
check(c.decide("img/x.png", "hX") === "process", "perfile: new file = process")
c.record("img/x.png", "hX")
c.save()

c = openPerFileCache(pf, "icfg1")
check(c.decide("img/x.png", "hX") === "skip", "perfile: unchanged = skip")
c.save()

c = openPerFileCache(pf, "icfg1")
check(c.decide("img/y.png", "hX") === "moved", "perfile: same content new path = moved (reverse-map)")
c.record("img/y.png", "hX")
c.save()
// 迁移后:下次 y 按路径直接命中
c = openPerFileCache(pf, "icfg1")
check(c.decide("img/y.png", "hX") === "skip", "perfile: moved key migrated → next run skip by path")

c = openPerFileCache(pf, "icfg2")
check(c.decide("img/x.png", "hX") === "process", "perfile: configHash change = process all")

// ───────── loadCache / saveCache:原子写并发不撕裂 + 损坏 JSON 告警可恢复 ─────────
const lc = resolve(root, ".cache/store.json")

// 并发多次 saveCache 同一文件(temp+rename 原子写)→ 文件内容始终是合法 JSON,不出现撕裂半截。
const stores = Array.from({ length: 40 }, (_, i) => {
  const s: Record<string, string> = {}
  for (let k = 0; k <= i; k++) s[`k${k}`] = `v${k}-${"x".repeat(i)}` // 每次大小不同 → 放大撕裂风险
  return s
})
await Promise.all(stores.map((s) => Promise.resolve().then(() => saveCache(lc, s))))
let parsedOk = false
try {
  JSON.parse(readFileSync(lc, "utf8"))
  parsedOk = true
} catch {
  parsedOk = false
}
check(parsedOk, "atomicWrite: 并发 saveCache 后文件为合法 JSON(temp+rename 不撕裂)")
// 末状态应等于某一次完整写入(本测全 await,最后一次胜出);至少应能 loadCache 回读为对象。
check(typeof loadCache(lc) === "object" && loadCache(lc) !== null, "atomicWrite: loadCache 回读为对象")

// 损坏 JSON → loadCache 返回 {} 且触发 warn(可恢复,不抛)。
writeFileSync(lc, "{ this is not valid json", "utf8")
const origWarn = console.warn
const warnLogs: string[] = []
console.warn = (...a: unknown[]) => {
  warnLogs.push(a.join(" "))
}
let corruptResult: Record<string, string> = { sentinel: "1" }
let corruptThrew = false
try {
  corruptResult = loadCache(lc)
} catch {
  corruptThrew = true
} finally {
  console.warn = origWarn
}
check(!corruptThrew && Object.keys(corruptResult).length === 0, "corrupt: loadCache 返回 {} 不抛")
check(warnLogs.some((l) => l.includes("损坏") || l.toLowerCase().includes("corrupt")), "corrupt: 触发告警(中英双语)")

// 缺失文件(ENOENT)→ 静默返回 {},不告警。
const missing = resolve(root, ".cache/does-not-exist.json")
const warn2: string[] = []
console.warn = (...a: unknown[]) => {
  warn2.push(a.join(" "))
}
const missingResult = loadCache(missing)
console.warn = origWarn
check(Object.keys(missingResult).length === 0 && warn2.length === 0, "missing: ENOENT 静默返回 {}(不告警)")

process.chdir(resolve(root, ".."))
rmSync(root, { recursive: true, force: true })

console.log(`\n${fail === 0 ? "✅" : "❌"} cache test: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
