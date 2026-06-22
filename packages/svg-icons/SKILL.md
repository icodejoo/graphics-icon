---
name: svg-icons
description: 在 D:\workspaces\colorfont 上维护 svg-icons 时参考。涵盖该包的目的、功能、双形态（引擎 svgIcons + CLI runCli + 内部 Vite 插件工厂，经发布包 graphics-icon 的子路径 graphics-icon/svg 与 svg-icons CLI 对外）、多实例 items[] 与按实例 cache/throwable、用法（含 vite.config 示例与消费 import { iconsHref, iconsName, type IconName }）、关键考量（共享 utils、buildStamp 指纹、统一 groupCache 共享缓存目录、id 作用域化、颜色改写、normalize 与 colorfont 同步、按需加载）与易踩的点。
---

# svg-icons 维护指南

## 目的

把一个目录下的零散 SVG 图标编译成单个雪碧图（`<svg><symbol id="...">…</symbol>…</svg>`），页面用 `<use :href="...">` 引用。
本包（私有内部包）建立在第三方 `vite-plugin-icons-spritesheet` 之上，补齐它缺失/有坑的能力，是 graphics-icon monorepo 四引擎之一，与 colorfont 套件共享基础设施，经发布包 `graphics-icon`（packages/exports）的子路径 `graphics-icon/svg` 与 CLI `svg-icons` 对外。

**双形态**（与 imagemin 对齐）：引擎 `svgIcons(options)`（Vite 之外一次性生成；经子路径 `graphics-icon/svg` 导入）+ CLI `runCli`（经发布包 bin `svg-icons --config <file>`）+ 内部 Vite 插件工厂 `svgIconsVite(opts): Plugin[]`（经 `graphicsIcon({ svgIcons })` 集成，不单独对外导出）。

## 功能

1. id 作用域化（修 `vite-plugin-icons-spritesheet` issue #38）：每个 `<symbol>` 内部定义的 id（clipPath / linearGradient / mask / filter）按所属 symbol id 加前缀并同步改写 `url(#id)` / `(xlink:)href="#id"`，避免跨图标同名 id 相撞。绝不改 `<symbol id="...">` 本身（= 图标名 = 类型来源）。幂等。
2. 颜色策略（`color?: 'keep' | 'mono' | ColorFn`，默认 `'keep'`；旧 `true`/字符串固定色形态已删）：
   - `'keep'`（默认）→ 保留源 svg 多色，只做 id 作用域化。
   - `'mono'` → 健壮单色：剥离描述元素的具体色/渐变（保留 `none`），在每个 `<symbol>` 根设 `fill+stroke=currentColor`，经 `<use>` 实例化由 CSS `color` 统一控制。**无独立 `mono` 选项,单色就走 `color:'mono'`。**
   - 函数 `ColorFn(name, symbolId, color)` → 逐色重映射（保留多色）：返回真值字符串替换、falsy 保留原样。`none` / `currentColor` / `url(...)` 始终跳过。
3. 三产物恒产（路径由 `output.{dir,name}` 派生）：雪碧图 `{dir}/{name}.svg`、脚本 `{dir}/{name}.{ts?ts:js}`（`ts` 默认 true，产 `iconsHref`（`?url` 导入 svg）+ `iconsName` 枚举对象 +（`.ts` 时）`IconName` 字面量联合）、清单 `{dir}/{name}.json`（机器可读 `{ sprite, icons[] }`，symbol id 列表）。文本产物（svg/ts/js）头部加 `@codejoo/utils/banner` 双语 banner；JSON 无 banner。**svg 用 `<use href>` 引用，无 CSS 类名,故无 `classPrefix`/`classSeparator`。**
4. normalize / 缩放（`normalize` 选项，默认关闭）：每个 symbol 几何缩放到统一 viewBox 宽度（默认 1024），复用 colorfont 的 `normalizeSvg`。
5. 共享磁盘缓存：源 svg 内容 + 关键配置指纹未变且产物在 → 跳过底层生成与后处理。

## 用法

```ts
// vite.config.ts —— 经伞包统一出口(单个插件)
import graphicsIcon from "graphics-icon/vite"

export default defineConfig({
  plugins: [
    graphicsIcon({
      // 省略 cacheName → 落共享缓存目录 .cache.graphics/<派生名>.json;cache:false 删缓存重建;throwable:false 告警续跑
      svgIcons: { items: [
        {
          sources: "src/assets/icons",        // string | string[](多目录用临时 staging 汇集)
          output: {
            dir: "src/sprites",                // 输出目录
            name: "common",                    // 派生 common.svg / common.ts / common.json
            ts: true,                          // 默认 true;false → .js 无类型
          },
          color: "keep",                       // 'keep'(默认) | 'mono' | ColorFn
          normalize: { width: 1024 },          // 或 true;默认关闭
        },
      ] },
    }),
  ],
})
```

单独使用(Vite 之外)：`import { svgIcons } from "graphics-icon/svg"`（私有包名 `svg-icons` 仅 monorepo 内部用）。

消费：

```ts
import { iconsHref, iconsName, type IconName } from "@/sprites/common" // = {dir}/{name}
// <use :href="`${iconsHref}#${iconsName.foo}`" />
```

## 关键考量

- 共享 utils：`buildStamp`（`@codejoo/utils/fingerprint`，缓存指纹约定，与 bitmap-icons 同源）/ `relTo` / `writeTextIfChanged` / `normalizeSvg` / `autoGenBanner`（`@codejoo/utils/banner`，文本产物头注释），以及统一的 **`groupCache`**（`@codejoo/utils`，管多实例缓存）全部来自 `@codejoo/utils`（子路径引入，无扩展名），与 bitmap / imagemin 同源，勿在本包重复实现。`computeStamp` 已改用 `buildStamp`（不再直接拼 `sha256`）。
- 多源目录：底层第三方 `vite-plugin-icons-spritesheet` 只吃单目录，`sources` 为数组时本包先把各目录 svg 汇集到一个临时 staging 目录再交给它。
- 按实例缓存 + 共享缓存目录：每个 `items[]` 项一套独立缓存，经统一 `groupCache` 管理（原子写 temp+rename；JSON 损坏告警而非静默）。缓存文件名 Vite 用 `cacheName`（仅文件名，落 `.cache.graphics/`）、独立用 `cacheFilename`（全路径）；省略则按 `output.name` 派生。`cache:false` 删该实例缓存 + 旧产物并重建。（旧的 `resolveCacheFile`/`pruneCache`/全路径 `cacheFile` 已被 `groupCache` 取代。）
- id 作用域化修 issue #38：见 `scope-ids.ts`，是本包存在的核心理由之一，改动需保持幂等且不触碰 `<symbol id>`。
- 颜色策略：`'keep'` 仅作用域化；`'mono'` 在 symbol 根注 `currentColor`（继承 + `<use>` 处 `color` 控制）；函数逐色重映射。`iconNameTransformer` 默认 identity，故 symbolId ≈ 文件名。空输入默认抛错（走 `throwable`）。
- normalize 与 colorfont 同步：`normalizeSvg` 即 colorfont 引擎所用的「svgo 清理 → svgpath 缩放 viewBox → svgo 整数化(floatPrecision:0)」同一算法。后处理顺序固定为 normalize → 作用域化 → 颜色改写，使后续步骤作用于归一化后的内容。无 viewBox 的 symbol 跳过；归一化失败回退原样以保证产物有效。
- 按需加载：`vite-plugin-icons-spritesheet` 通过动态 `import()` 延迟到 `buildStart`，仅 `import { svgIconsVite }` 不会即时拉起底层插件；normalize 的重依赖（svgo/svgpath）也在 `@codejoo/utils/scale-svg` 内部惰性加载。
- 缓存指纹：`computeStamp` 把生成器版本、`sources`、`output`、`color`（`'keep'|'mono'|fn`）、`normalize`、`iconNameTransformer.toString()`、`formatter`、`ts` 都纳入 `configHash`。切换 `normalize`（或改 width）/ `color` 会让指纹变化、缓存失效、自动重建。改后处理逻辑须 +1 `GENERATOR_VERSION`/`CACHE_VERSION`。

## 易踩的点

- 内部相对 import 必须带 `.ts` 扩展名；跨包 import 用包名 + 子路径、不带扩展名。
- 这是 TS 源码包（无 build 步骤）：不要加 dist/编译产物，`exports` 直指 `src/*.ts`。
- 改了任何后处理行为（作用域化 / 颜色 / normalize / script 结构）记得 +1 `cache.ts` 的 `GENERATOR_VERSION`，否则旧缓存仍命中、用户看不到变化。
- `normalize` 默认必须关闭（行为不变才安全）；开启会重写所有 symbol 的几何坐标。
- regex 替换无法 async，`normalizeSymbols` 用手动遍历逐个 `await`，勿改回 `String.replace` 回调内 await。
- `vite` 与 `vite-plugin-icons-spritesheet` 版本统一用 `catalog:`，不要写死版本号。
