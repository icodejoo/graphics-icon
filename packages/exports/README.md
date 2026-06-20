# graphics-icon

> One toolkit for your whole icon/image pipeline: color icon webfont + SVG sprites + bitmap sprites + image optimization — a Vite plugin plus standalone engines/CLIs.
> 一站式图标 / 图片工具链：彩色图标 webfont、SVG 雪碧图、位图雪碧图、图片压缩 —— Vite 插件 + 独立引擎/CLI。

**English** ｜ [中文](#中文)

## Entry points

The package has **subpath exports only** (no bare `.`):

| Import | What you get | Needs Vite? |
| --- | --- | --- |
| `graphics-icon/vite` | The umbrella **Vite plugin** `graphicsIcon` (default) composing all four capabilities | yes (peer) |
| `graphics-icon/colorfont` | colorfont engine: `build` · `buildAndWrite` · `generateColorfonts` · `runCli` + types | no |
| `graphics-icon/svg` | svg engine: `generateSvgSprites` · `runCli` + types | no |
| `graphics-icon/bitmap` | bitmap engine: `generateBitmapSheets` · `runCli` + types | no |
| `graphics-icon/imagemin` | imagemin engine: `optimizeImages` · `defaultOptions` · `runCli` + types | no |

Plus 4 CLI bins: **`g-colorfont`** · **`g-svg`** · **`g-bitmap`** · **`g-min`**.

```bash
pnpm add -D graphics-icon
# vite ^5 || ^6 || ^7 || ^8 — peer, only required when you import graphics-icon/vite
```

## Vite plugin — quick start

`graphicsIcon({...})` returns a **single** Vite plugin. Pass only the sub-keys you need; each is **multi-instance** via `items[]` (`colorfont`/`svgIcons`/`bitmapIcons`), with shared "common" params merged into every item. `imagemin` is a singleton.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import graphicsIcon from 'graphics-icon/vite'

export default defineConfig({
  plugins: [
    graphicsIcon({
      colorfont: {
        colorFormat: 'auto',                  // common (merged into each item)
        items: [{ input: 'src/icons/color', outDir: 'src/fonts', fontName: 'AppIcons' }],
      },
      svgIcons:   { items: [{ input: 'src/icons/svg', output: { svg: 'src/sprites/icons.svg', script: 'src/sprites/icons.ts' }, color: true }] },
      bitmapIcons:{ items: [{ inputDir: 'src/icons/png', output: { image: 'src/sprites/sheet.webp', style: 'src/sprites/sheet.css' } }] },
      imagemin:   { enabled: true },
    }),
  ],
})
```

**colorfont is real-disk**: it writes real `<fontName>.css`, `<fontName>.ts`, the font files, and `<fontName>.codepoints.json` into `outDir` (commit them, like the sprites). Consume them with normal imports — there are **no `virtual:colorfont*` modules**:

```ts
import './fonts/AppIcons.css'                       // @font-face + .icon classes
import { icons, type IconName } from './fonts/AppIcons'  // typed API
```

## Common behavior (all capabilities)

- **Multi-instance**: `{ ...common, items: [item, …] }`. Each instance = `{ ...common, ...item }` (item wins). One independent cache + output set per item.
- **Cache** (`cache?: boolean`, default `true`): a hit (inputs + options + outputs all unchanged) skips the whole pipeline. `false` deletes that instance's cache + old products and rebuilds. Cache file location is per-instance:
  - **Vite**: `cacheName?: string` — just a filename, stored under `.cache.graphics/`.
  - **Standalone**: `cacheFilename?: string` — a full path (or bare name → `.cache.graphics/`).
- **Error handling** (`throwable?: boolean`, default `true`): on failure, `true` throws & aborts (Vite shows the error; CLI exits non-zero); `false` logs a warning and continues.

---

## colorfont options

`items[]` of font builds; `colorFormat: 'auto'` emits a coexisting `@font-face` fallback chain (mono + COLRv0 + OT-SVG) so each browser picks the best it supports.

**Common (shared, item-overridable)**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `fontFamily` | `string` | = `fontName` | CSS `font-family`. |
| `colorFormat` | `'mono'\|'colrv0'\|'otsvg'\|'colrv1'\|'auto'` | `'auto'` | Which flavors to emit. `auto`: mono+COLRv0+OT-SVG if any colored icon. |
| `formats` | `('woff2'\|'woff'\|'ttf')[]` | `['woff2']` | Container formats. |
| `woff2Quality` | `number` | `11` | WOFF2 quality 0–11 (dev auto-uses 9 with `devFast`). |
| `colrv0` | `boolean` | `true` | Also emit a COLRv0 flat-color flavor. |
| `unitsPerEm` | `number` | `1000` | Em units. |
| `ascender` / `descender` | `number` | `round(em*0.8)` / `asc-em` | Vertical metrics. |
| `baseSelector` | `string` | `'.icon'` | Base-class selector. |
| `classPrefix` | `string` | `'icon-'` | Per-icon class prefix. |
| `threads` | `boolean\|'auto'` | `'auto'` | Multi-threaded preprocessing (`auto`: icons ≥ 200). |
| `paStart` | `number` | `0xE000` | PUA codepoint start. |
| `cache` | `boolean` | `true` | Enable cache. |
| `throwable` | `boolean` | `true` | Throw vs warn on error. |

**Item (per font)**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `input` | `string \| string[]` | — **required** | SVG icon source dir(s). |
| `outDir` | `string` | — **required** | Output dir (real fonts + `.css` + `.ts` + codepoints lock land here). |
| `fontName` | `string` | — **required** | Font name (filename + `font-family`). |
| `codepointsFile` | `string` | `<outDir>/<fontName>.codepoints.json` | Codepoint lock (commit it; stable PUA). Not a cache product. |
| `cacheName` (vite) / `cacheFilename` (standalone) | `string` | derived from `fontName` | Per-instance cache file. |

**Vite plugin extras** (on the `colorfont` key): `watch?: boolean` (default true, regenerate on `.svg` change), `devFast?: boolean` (default true, WOFF2 q9 in dev).

---

## svgIcons options

A folder of SVGs → one sprite (`<symbol>` + `<use href>`), with id scoping, optional color rewrite, and a typed entry script.

**Common**: `color`, `normalize`, `iconNameTransformer`, `formatter`, `cache`, `throwable`.

| Item option | Type | Default | Description |
| --- | --- | --- | --- |
| `input` | `string` | — **required** | SVG source dir. |
| `output.svg` | `string` | — **required** | Emitted sprite `.svg`. |
| `output.script` | `string` | `undefined` | Typed entry (`iconsHref` + `iconsName` + `IconName`). |
| `color` | `boolean\|string\|fn\|null` | `undefined` | `true` → `currentColor`; string → that color; fn → custom. |
| `normalize` | `boolean\|{width?}` | `undefined` | colorfont-style normalize (default width 1024). |
| `iconNameTransformer` | `(name)=>string` | identity | `<symbol>` id from filename. |
| `formatter` | `'svgo'\|'prettier'\|'oxfmt'` | `'oxfmt'` | Output formatter (graceful fallback). |
| `cacheName`/`cacheFilename` | `string` | derived from output | Per-instance cache file. |

---

## bitmapIcons options

A folder of bitmaps → one sprite-sheet atlas (sharp + maxrects-packer) + stylesheet + entry script + optional coords JSON.

**Common**: `padding`(2), `maxWidth`/`maxHeight`(4096), `pot`(false), `square`(false), `pixelRatio`(1), `png`, `webp`, `prefix`('sprite'), `nameTransformer`, `include`, `exclude`, `cache`, `throwable`.

| Item option | Type | Default | Description |
| --- | --- | --- | --- |
| `inputDir` | `string` | — **required** | Source image dir (`*.sprite.{webp,png}` auto-excluded). |
| `output.image` | `string` | — **required** | Atlas (`.webp`/`.png`). |
| `output.style` | `string` | — **required** | Stylesheet (`.css`/`.scss`). |
| `output.script` | `string` | `undefined` | Entry script (`iconsImage` + `IconName`). |
| `output.json` | `string` | `undefined` | Coords JSON. |
| `cacheName`/`cacheFilename` | `string` | derived from image | Per-instance cache file. |

---

## imagemin options (singleton)

Build-time image optimization (sharp + svgo, hash cache + rename detection). `ImageminPluginOptions = Partial<ImageminOptions> + { enabled }`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Vite: skip compression in `closeBundle` when false. |
| `include` / `exclude` | `string\|string[]` | sensible defaults | Image globs. |
| `cacheFile` | `string` | `.cache.graphics/imagemin.json` | Content-hash cache (commit it). |
| `concurrency` | `number` | `8` | Parallelism. |
| `png`/`jpeg`/`jpg`/`webp`/`avif`/`tiff`/`gif` | sharp options | web-delivery defaults | Per-format params. |
| `svg` | `SvgoConfig` | `{multipass, plugins:[…]}` | svgo config. |
| `svgSize` | `number\|false\|fn` | `1024` | SVG normalize target viewBox width. |
| `resize`/`sharpOptions`/`keepMetadata`/`rotate` | — | — | sharp passthroughs. |
| `throwable` | `boolean` | `true` | Throw vs warn on a failed image. |

> ⚠ imagemin **rewrites source files in place** (only when smaller; SVG normalize is forced). Put masters into `exclude`.

---

## Standalone (no Vite)

Import each engine from its subpath:

```ts
import { build, buildAndWrite, generateColorfonts } from 'graphics-icon/colorfont'
import { generateSvgSprites } from 'graphics-icon/svg'
import { generateBitmapSheets } from 'graphics-icon/bitmap'
import { optimizeImages, defaultOptions } from 'graphics-icon/imagemin'

await generateColorfonts({ colorFormat: 'auto', items: [{ input: 'icons', outDir: 'fonts', fontName: 'AppIcons', cacheFilename: 'cf.json' }] })
await generateSvgSprites({ items: [{ input: 'svg', output: { svg: 'out/icons.svg' } }] })
await generateBitmapSheets({ items: [{ inputDir: 'png', output: { image: 'out/sheet.webp', style: 'out/sheet.css' } }] })
await optimizeImages(files, { ...defaultOptions })
```

- colorfont: `build(item)` → `BuildResult` (pure, no disk); `buildAndWrite(item)` → writes to `outDir`, returns `BuildResult | null` (`null` = cache hit); `generateColorfonts({items})` → batch.
- svg/bitmap: `generateSvgSprites`/`generateBitmapSheets({items})`.
- imagemin: `optimizeImages(files, opts)` + `defaultOptions`.

## CLI

```bash
g-colorfont build --input icons --out fonts --name AppIcons   # also: watch / check
g-svg      --config ./svg.config.ts      # default-exports { items: [...] }
g-bitmap   --config ./bitmap.config.ts   # default-exports { items: [...] }
g-min      --all --config ./imagemin.config.ts   # or pass a file list (pre-commit)
```

## License

MIT

---

<a name="中文"></a>

# 中文

[English](#graphics-icon) ｜ **中文**

## 入口

本包**仅有子路径导出**（无裸 `.`）：

| 导入 | 得到 | 需要 Vite？ |
| --- | --- | --- |
| `graphics-icon/vite` | 伞 **Vite 插件** `graphicsIcon`（默认导出），合一四能力 | 是（peer） |
| `graphics-icon/colorfont` | colorfont 引擎：`build`/`buildAndWrite`/`generateColorfonts`/`runCli` + 类型 | 否 |
| `graphics-icon/svg` | svg 引擎：`generateSvgSprites`/`runCli` + 类型 | 否 |
| `graphics-icon/bitmap` | bitmap 引擎：`generateBitmapSheets`/`runCli` + 类型 | 否 |
| `graphics-icon/imagemin` | imagemin 引擎：`optimizeImages`/`defaultOptions`/`runCli` + 类型 | 否 |

另含 4 个 CLI：**`g-colorfont`** · **`g-svg`** · **`g-bitmap`** · **`g-min`**。

```bash
pnpm add -D graphics-icon
# vite ^5 || ^6 || ^7 || ^8 —— peer，仅 import graphics-icon/vite 时需要
```

## Vite 插件 — 快速开始

`graphicsIcon({...})` 返回**单个** Vite 插件。只传需要的子键；`colorfont`/`svgIcons`/`bitmapIcons` 均为 **多实例 `items[]`**（公共参数合并进每项）；`imagemin` 为单例。

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import graphicsIcon from 'graphics-icon/vite'

export default defineConfig({
  plugins: [
    graphicsIcon({
      colorfont: {
        colorFormat: 'auto',                  // 公共参数（合并进每个 item）
        items: [{ input: 'src/icons/color', outDir: 'src/fonts', fontName: 'AppIcons' }],
      },
      svgIcons:   { items: [{ input: 'src/icons/svg', output: { svg: 'src/sprites/icons.svg', script: 'src/sprites/icons.ts' }, color: true }] },
      bitmapIcons:{ items: [{ inputDir: 'src/icons/png', output: { image: 'src/sprites/sheet.webp', style: 'src/sprites/sheet.css' } }] },
      imagemin:   { enabled: true },
    }),
  ],
})
```

**colorfont 实物落盘**：把真实的 `<fontName>.css`、`<fontName>.ts`、字体文件、`<fontName>.codepoints.json` 写进 `outDir`（随仓库提交，和雪碧图一样）。用普通 import 消费，**没有 `virtual:colorfont*` 虚拟模块**：

```ts
import './fonts/AppIcons.css'                       // @font-face + .icon 类
import { icons, type IconName } from './fonts/AppIcons'  // 类型化 API
```

## 通用机制（所有能力）

- **多实例**：`{ ...公共, items: [项, …] }`。每实例 = `{ ...公共, ...项 }`（项覆盖公共）。每实例独立缓存 + 独立产物。
- **缓存**（`cache?: boolean`，默认 `true`）：命中（输入+选项+产物均未变）跳过整条管线；`false` 删该实例缓存 + 旧产物并重建。缓存位置按实例：
  - **Vite**：`cacheName?: string` —— 仅文件名，落 `.cache.graphics/`。
  - **独立**：`cacheFilename?: string` —— 完整路径（或裸名 → `.cache.graphics/`）。
- **错误处理**（`throwable?: boolean`，默认 `true`）：失败时 `true` 抛错中止（Vite 报错；CLI 非零退出）；`false` 告警并继续。

## 选项参考

各能力的 `common` / `item` 字段、类型、默认值见上方英文表（字段名与默认值一致）。要点：
- **colorfont**：`item` 必填 `input`/`outDir`/`fontName`；`codepointsFile` 默认 `<outDir>/<fontName>.codepoints.json`（码位锁，需提交，非缓存产物）。Vite 插件层额外 `watch`/`devFast`（dev woff2 q9）。
- **svgIcons**：`item` 必填 `input`/`output.svg`；`color`/`normalize`/`formatter` 等可公共。
- **bitmapIcons**：`item` 必填 `inputDir`/`output.image`/`output.style`；`padding`/`prefix`/`png`/`webp` 等可公共。
- **imagemin**：单例，`enabled` + 各格式 sharp 参数 + `svg`(svgo) + `svgSize`；⚠ 就地改写源文件（仅更小才写），母版放 `exclude`。

## 独立使用（Vite 之外）

```ts
import { build, buildAndWrite, generateColorfonts } from 'graphics-icon/colorfont'
import { generateSvgSprites } from 'graphics-icon/svg'
import { generateBitmapSheets } from 'graphics-icon/bitmap'
import { optimizeImages, defaultOptions } from 'graphics-icon/imagemin'

await generateColorfonts({ colorFormat: 'auto', items: [{ input: 'icons', outDir: 'fonts', fontName: 'AppIcons', cacheFilename: 'cf.json' }] })
await optimizeImages(files, { ...defaultOptions })
```

colorfont：`build(item)` 纯函数（不落盘）；`buildAndWrite(item)` 落盘，返回 `BuildResult | null`（`null`=命中）；`generateColorfonts({items})` 批量。

## CLI

```bash
g-colorfont build --input icons --out fonts --name AppIcons   # 另有 watch / check
g-svg      --config ./svg.config.ts      # 配置 default-export { items: [...] }
g-bitmap   --config ./bitmap.config.ts   # 配置 default-export { items: [...] }
g-min      --all --config ./imagemin.config.ts   # 或传文件列表(pre-commit)
```

## License

MIT
