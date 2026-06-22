// imagemin 新缓存集成自测:process → 命中skip → 配置变重压 → 强制报错(选项a)。
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { imagemin } from "./src/imagemin.ts"

const root = resolve(process.cwd(), ".imagemin-test-tmp")
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

const cacheFile = resolve(root, ".cache/imagemin.json")
const base = { include: "**/*.{svg,png}", cacheFile, logStats: false, svgSize: 1024, svg: { multipass: true } }

writeFileSync("a.svg", `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="22" height="22" fill="#ff0000"/></svg>`)

let r = await imagemin([resolve("a.svg")], { ...base })
check(r.results[0].skipped === false, "svg 1st run = processed")

r = await imagemin([resolve("a.svg")], { ...base })
check(r.results[0].skipped === true, "svg 2nd run = cache HIT (skip)")

r = await imagemin([resolve("a.svg")], { ...base, svgSize: 512 })
check(r.results[0].skipped === false, "config change (svgSize) → configHash mismatch → reprocess all")

// throwable 默认 true:损坏图 → sharp 抛错 → imagemin 抛出中止
writeFileSync("bad.png", "not-a-real-png")
let threw = false
try {
  await imagemin([resolve("bad.png")], { ...base })
} catch {
  threw = true
}
check(threw, "throwable default(true): corrupt image throws")

// throwable:false → 不抛,告警并继续,结果含 error
let threw2 = false
let res2: Awaited<ReturnType<typeof imagemin>> | undefined
try {
  res2 = await imagemin([resolve("bad.png")], { ...base, throwable: false })
} catch {
  threw2 = true
}
check(!threw2, "throwable:false: corrupt image does NOT throw")
check(!!res2 && res2.results.some((x) => x.error), "throwable:false: error reported in results")

// ───────── 压缩比:核心算法「重压更小 + 绝不放大」(此前只验 skipped 标志,未验真压缩) ─────────
// 造一张 q100 渐变 JPEG(可压缩),用 q50 重压 → 必更小且写回;再用 q95 重压已是 q50 的图 → 更大则保留原图。
const { default: sharp } = await import("sharp")
const W = 96, H = 96
const raw = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    raw[i] = Math.floor((x * 255) / W)
    raw[i + 1] = Math.floor((y * 255) / H)
    raw[i + 2] = Math.floor(((x + y) * 255) / (W + H))
  }
}
const q100 = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
writeFileSync("photo.jpg", q100)

const rc = await imagemin([resolve("photo.jpg")], { ...base, include: "**/*.{svg,png,jpg,jpeg}", jpeg: { quality: 50 } })
check(rc.results[0]?.skipped === false && rc.results[0]?.changed === true, "compress: jpeg q50 重压发生改写")
check(rc.results[0]?.after < rc.results[0]?.before, `compress: 重压后更小(${rc.results[0]?.before}→${rc.results[0]?.after})`)

// photo.jpg 现已是 q50;用 q95 重压会更大 → 不写回(保留原图)→ after<=before,验「绝不放大」保证。
const r3 = await imagemin([resolve("photo.jpg")], { ...base, include: "**/*.{svg,png,jpg,jpeg}", jpeg: { quality: 95 }, cacheFile: resolve(root, ".cache/imagemin3.json") })
check(r3.results[0]?.after <= r3.results[0]?.before, "compress: 绝不放大(更大则保留原图,after<=before)")

process.chdir(resolve(root, ".."))
rmSync(root, { recursive: true, force: true })
console.log(`\n${fail === 0 ? "✅" : "❌"} imagemin cache test: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
