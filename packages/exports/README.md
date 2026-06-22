# graphics-icon

> One toolkit for your whole icon/image pipeline: color icon webfont + SVG sprites + bitmap sprites + image optimization — a Vite plugin plus standalone engines/CLIs.
> 一站式图标 / 图片工具链：彩色图标 webfont、SVG 雪碧图、位图雪碧图、图片压缩 —— Vite 插件 + 独立引擎/CLI。

**English** ｜ [中文](#中文)

## Entry points

The package has **subpath exports only** (no bare `.`):

| Import | What you get | Needs Vite? |
| --- | --- | --- |
| `graphics-icon/vite` | The umbrella **Vite plugin** `graphicsIcon` (default) composing all four capabilities | yes (peer) |
| `graphics-icon/colorfont` | colorfont engine: `build` · `buildAndWrite` · `colorfonts` · `runCli` + types | no |
| `graphics-icon/svg` | svg engine: `svgIcons` · `runCli` + types | no |
| `graphics-icon/bitmap` | bitmap engine: `bitmapIcons` · `runCli` + types | no |
| `graphics-icon/imagemin` | imagemin engine: `imagemin` · `defaultOptions` · `runCli` + types | no |
| `graphics-icon/unused` | unused-file engine: `removeUnused` · `findUnused` · `runCli` + types | no |

Plus 5 CLI bins: **`color-fonts`** · **`svg-icons`** · **`bitmap-icons`** · **`image-min`** · **`remove-unused`**.

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
      colorfonts: {
        colorFormat: 'auto',                  // common (merged into each item)
        items: [{ sources: 'src/icons/color', output: { dir: 'src/fonts', fontName: 'AppIcons', name: 'AppIcons' } }],
      },
      svgIcons:   { items: [{ sources: 'src/icons/svg', output: { dir: 'src/sprites', name: 'icons' }, color: 'mono' }] },
      bitmapIcons:{ items: [{ sources: 'src/icons/png', output: { dir: 'src/sprites', name: 'sheet' } }] },
      imagemin:   { enabled: true },
    }),
  ],
})
```

**colorfont is real-disk**: it writes the fonts plus `<name>.css`, `<name>.ts`, and `<name>.codepoints.json` into `output.dir` (commit them, like the sprites). Consume them with normal imports — there are **no `virtual:colorfont*` modules**:

```ts
import './fonts/AppIcons.css'                       // @font-face + .icon classes
import { icons, type IconName } from './fonts/AppIcons'  // typed API
```

### Consuming colorfont products

The generated `<fontName>.ts` exports a typed API (all keyed by `IconName`):

| Export | Type | Use |
| --- | --- | --- |
| `icons` | `Record<IconName, string>` | **icon name → CSS class name** (the per-icon class, e.g. `'home' → 'icon-home'`). Put it on an element together with `baseName`. |
| `baseName` | `string` | The base class name = `classPrefix` (default `'icon'`). Mounts the font; pair it with one `icons[name]`. |
| `codepoints` | `Record<IconName, number>` | icon name → assigned PUA codepoint (stable, locked in `codepoints.json`). |
| `colorIcons` | `Partial<Record<IconName, true>>` | the **colored** icons only — `colorIcons[name]` is an O(1) "is this icon multi-color?" check. |
| `iconContent(name)` | `(name: IconName) => string` | the glyph character (`String.fromCodePoint(codepoint)`) — for `::before { content }` in your own CSS, or canvas/`<text>`. |
| `IconName` | `type` | union of all icon names — use it to type your own props. |

Render an icon by combining `baseName` + `icons[name]` (the `.css` defines `.icon` and `.icon-<name>`):

```tsx
// React / JSX
import { icons, baseName, type IconName } from './fonts/AppIcons'

const Icon = ({ name }: { name: IconName }) =>
  <i className={`${baseName} ${icons[name]}`} aria-hidden />   // e.g. class="icon icon-home"

<Icon name="home" />
```

```html
<!-- Plain HTML — baseName is "icon", icons['home'] is "icon-home" -->
<i class="icon icon-home" aria-hidden="true"></i>
```

## Common behavior (all capabilities)

- **Multi-instance**: `{ ...common, items: [item, …] }`. Each instance = `{ ...common, ...item }` (item wins). One independent cache + output set per item.
- **Cache** (`cache?: boolean`, default `true`): a hit (inputs + options + outputs all unchanged) skips the whole pipeline. `false` deletes that instance's cache + old products and rebuilds. Cache file location is per-instance:
  - **Vite**: `cacheName?: string` — just a filename, stored under `.cache.graphics/`.
  - **Standalone**: `cacheFilename?: string` — a full path (or bare name → `.cache.graphics/`).
- **Error handling** (`throwable?: boolean`, default `true`): on failure, `true` throws & aborts (Vite shows the error; CLI exits non-zero); `false` logs a warning and continues.

### Committing `.cache.graphics/`

All per-instance group-cache files (and `imagemin.json`, `unused.json`) live under `.cache.graphics/`. **Recommended: commit the whole directory.** The cache is content-keyed and machine-independent, so committing it gives teammates and CI instant cache hits — a clean checkout rebuilds nothing. There is no per-machine state in it.

If you would rather not commit the build caches but still need the **locks** that must be shared (codepoint lock + imagemin rename cache), ignore the directory but un-ignore those two:

```gitignore
# Option A — share everything (recommended): commit the whole dir, ignore nothing.

# Option B — ignore the rebuildable caches, but keep the must-commit locks:
.cache.graphics/*
!.cache.graphics/imagemin.json        # content-hash + rename cache — commit it
# colorfont codepoint locks live next to the fonts as <name>.codepoints.json
# (in output.dir, not in .cache.graphics/) — always committed regardless.
```

> Note: the colorfont **codepoint lock** (`<name>.codepoints.json`) is written into `output.dir` beside the fonts, **not** into `.cache.graphics/`, and must always be committed (it keeps PUA codepoints stable). It is not a cache product.

---

## Option type naming: `*PluginOptions` (vite) vs `*Options`/`*Item` (engines)

The two entry surfaces export **differently-named** option types — import from the matching subpath:

| Capability | `graphics-icon/vite` (umbrella) | Engine subpath |
| --- | --- | --- |
| colorfont | `ColorfontPluginOptions`, `ColorfontItem`, `ColorfontCommon` | `graphics-icon/colorfont`: `ColorfontOptions`, `ColorfontItem`, `ColorfontCommon` |
| svg | `SvgIconsPluginOptions`, `SvgIconsItem`, `SvgIconsCommon` | `graphics-icon/svg`: `SvgIconsOptions`, `SvgIconsItem`, `SvgIconsCommon` |
| bitmap | `BitmapIconsPluginOptions`, `BitmapIconsItem`, `BitmapIconsCommon` | `graphics-icon/bitmap`: `BitmapIconsOptions`, `BitmapIconsItem`, `BitmapIconsCommon` |
| imagemin | `ImageminPluginOptions` (= `Partial<ImageminOptions> & { enabled }`) | `graphics-icon/imagemin`: `ImageminOptions` |

Rule of thumb: in **`vite.config.ts`** use the `*PluginOptions` names from `graphics-icon/vite`; in **standalone/CLI** code use the `*Options` names from the engine subpath. The `*Item` types are shared in spelling but re-exported from each surface, so import them from whichever subpath you're already using. The umbrella also re-exports `GraphicsIconOptions` (the whole `graphicsIcon({...})` argument) and `UnusedDetectOptions`.

---

## colorfonts options

`items[]` of font builds; `colorFormat: 'auto'` emits a coexisting `@font-face` fallback chain (mono + COLRv0 + OT-SVG) so each browser picks the best it supports.

**Common (shared, item-overridable)**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `colorFormat` | `'mono'\|'colrv0'\|'otsvg'\|'colrv1'\|'auto'` | `'auto'` | Which flavors to emit. `auto`: mono+COLRv0+OT-SVG if any colored icon. |
| `formats` | `('woff2'\|'woff'\|'ttf')[]` | `['woff2']` | Container formats. |
| `woff2Quality` | `number` | `11` | WOFF2 quality 0–11 (dev auto-uses 9 with `devFast`). |
| `colrv0` | `boolean` | `true` | Also emit a COLRv0 flat-color flavor. |
| `unitsPerEm` | `number` | `1000` | Em units. |
| `ascender` / `descender` | `number` | `round(em*0.8)` / `asc-em` | Vertical metrics. |
| `classPrefix` | `string` | `'icon'` | Bare class word (no dot, no trailing hyphen). Base selector = `.${classPrefix}` (`.icon`); HTML base class name = `classPrefix` (`icon`). |
| `classSeparator` | `string` | `'-'` | Joins prefix and icon name. Per-icon selector = `.${classPrefix}${classSeparator}${name}` (`.icon-home`); per-icon HTML class = `classPrefix+classSeparator+name` (`icon-home`). e.g. `classSeparator: '__'` → `.icon__home`. |
| `threads` | `boolean\|'auto'` | `'auto'` | Multi-threaded preprocessing (`auto`: icons ≥ 200). |
| `paStart` | `number` | `0xE000` | PUA codepoint start. |
| `cache` | `boolean` | `true` | Enable cache. |
| `throwable` | `boolean` | `true` | Throw vs warn on error. |

**Item (per font)**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sources` | `string \| string[]` | — **required** | SVG icon source dir(s). |
| `output.dir` | `string` | — **required** | Output dir (fonts + `.css` + `.ts` + codepoints lock all land here). |
| `output.fontName` | `string` | — **required** | Font name (`@font-face` font-family + OpenType name table). |
| `output.name` | `string` | — **required** | Product base name. Drives `{dir}/{name}.{flavor}.{format}`, `{dir}/{name}.css`, `{dir}/{name}.ts`, `{dir}/{name}.codepoints.json`. |
| `output.ts` | `boolean` | `true` | Emit a `.ts` entry; `false` → an equivalent `.js` (same runtime exports, no types). |
| `cacheName` (vite) / `cacheFilename` (standalone) | `string` | derived from `output.name` | Per-instance cache file. |

**Vite plugin extras** (on the `colorfont` key): `watch?: boolean` (default true, regenerate on `.svg` change), `devFast?: boolean` (default true, WOFF2 q9 in dev).

### The generated `@font-face` fallback chain (`colorFormat: 'auto'`)

With `auto`, the emitted `.css` contains **two `@font-face` rules with the same `font-family`**, so every browser picks the best flavor it can render:

```css
/* 1. Fallback rule — mono only, no tech(). Browsers that don't understand
      tech() simply use this (single-color outline). */
@font-face {
  font-family: "AppIcons";
  font-display: block;
  src: url("./AppIcons.mono.woff2") format("woff2") /* WOFF2: all modern browsers */;
}

/* 2. Modern browsers: a later same-family rule overrides the one above.
      Each browser takes the first src entry whose tech() it supports. */
@font-face {
  font-family: "AppIcons";
  font-display: block;
  src:
    url("./AppIcons.otsvg.woff2") format("woff2") tech(color-SVG)    /* Safari / iOS — Chromium never supports OT-SVG */,
    url("./AppIcons.colrv0.woff2") format("woff2") tech(color-COLRv0) /* older Chrome/Edge/Firefox — flat multi-color */,
    url("./AppIcons.mono.woff2") format("woff2")                     /* last resort inside this rule: mono */;
}
```

How the fallback resolves, strongest → weakest:

- `tech(color-COLRv1)` → Chrome/Edge 98+ and Firefox (smallest, gradient vectors; only emitted with `colorFormat:'colrv1'`/`'auto'` when COLRv1 is produced).
- `tech(color-SVG)` → **Safari / iOS** (OT-SVG; Chromium never supports OT-SVG, so this entry is effectively Safari-only).
- `tech(color-COLRv0)` → older Chrome/Edge/Firefox (flat COLRv0 multi-color, no gradients).
- **no `tech()` (mono)** → any browser. Browsers too old to understand `tech()` ignore the whole second rule and fall back to rule #1's mono outline automatically.

So old browsers degrade to mono with no extra work. To also support **very old** browsers (IE11 / legacy Safari) that need a `.woff` container, set `formats: ['woff2','woff']` — each flavor then emits both containers, ordered `woff2` before `woff` in `src`.

---

## svgIcons options

A folder of SVGs → one sprite (`<symbol>` + `<use href>`), with id scoping, optional color rewrite, and a typed entry script.

**Common**: `color`, `normalize`, `iconNameTransformer`, `formatter`, `cache`, `throwable`.

**All three products are always emitted**, paths derived from `dir`+`name`: sprite `{dir}/{name}.svg`, script `{dir}/{name}.{ts?ts:js}`, manifest `{dir}/{name}.json`.

| Item option | Type | Default | Description |
| --- | --- | --- | --- |
| `sources` | `string \| string[]` | — **required** | SVG source dir(s) (all merged into one sprite). |
| `output.dir` | `string` | — **required** | Output dir (sprite + script + manifest all land here). |
| `output.name` | `string` | — **required** | Product base name (shared by sprite/script/manifest). |
| `output.ts` | `boolean` | `true` | Emit a `.ts` script with the `IconName` union; `false` → `.js` (runtime objects only). |
| `color` | `'keep'\|'mono'\|ColorFn` | `'keep'` | svg-only. `'keep'` (default) keeps the source's multi-color; `'mono'` makes a robust single-color sprite (root `currentColor`, driven by CSS `color`); a function remaps each color individually. (Not to be confused with color-fonts' `colorFormat`.) |
| `normalize` | `boolean\|{width?}` | `undefined` | colorfont-style normalize (default width 1024). |
| `iconNameTransformer` | `(name)=>string` | identity | `<symbol>` id from filename. |
| `formatter` | `'svgo'\|'prettier'\|'oxfmt'` | `'oxfmt'` | Output formatter (graceful fallback). |
| `cacheName`/`cacheFilename` | `string` | derived from `output.name` | Per-instance cache file. |

### Consuming svg products

The generated `{name}` script default-imports the sprite as a URL and exports `iconsHref` (the sprite URL), `iconsName` (name → id object) and the `IconName` type. Reference a symbol with `<use href="<sprite-url>#<id>">`:

```tsx
// React / JSX
import { iconsHref, iconsName, type IconName } from './sprites/icons'

const SvgIcon = ({ name }: { name: IconName }) =>
  <svg aria-hidden><use href={`${iconsHref}#${iconsName[name]}`} /></svg>
```

```html
<!-- Plain HTML — iconsHref is the bundled sprite URL, iconsName.home is the symbol id -->
<svg aria-hidden="true"><use href="/assets/icons-abc123.svg#home"></use></svg>
```

---

## bitmapIcons options

A folder of bitmaps → one sprite-sheet atlas (sharp + maxrects-packer) + stylesheet + entry script + optional coords JSON.

**Common**: `padding`(2), `maxWidth`/`maxHeight`(4096), `pot`(false), `square`(false), `pixelRatio`(1), `png`, `webp`, `classPrefix`('icon'), `classSeparator`('-'), `nameTransformer`, `include`, `exclude`, `cache`, `throwable`.

**All four products are always emitted**, paths derived from `dir`+`name`: atlas `{dir}/{name}.{format}` (format default `webp`), stylesheet `{dir}/{name}.css`, script `{dir}/{name}.{ts?ts:js}`, coords `{dir}/{name}.json`.

| Item option | Type | Default | Description |
| --- | --- | --- | --- |
| `sources` | `string \| string[]` | — **required** | Source image dir(s) (`*.sprite.{webp,png}` auto-excluded; all merged into one sheet). |
| `output.dir` | `string` | — **required** | Output dir (atlas + `.css` + script + coords JSON all land here). |
| `output.name` | `string` | — **required** | Product base name (shared by atlas/style/script/JSON). |
| `output.ts` | `boolean` | `true` | Emit a `.ts` entry; `false` → `.js`. |
| `output.format` | `'webp'\|'png'` | `'webp'` | Atlas image format. |
| `cacheName`/`cacheFilename` | `string` | derived from `output.name` | Per-instance cache file. |

### Consuming bitmap products

The stylesheet emits one base class `.icon` (the base selector `.${classPrefix}`) plus a per-icon class `.icon-<name>` (`.${classPrefix}${classSeparator}${name}`) — so `<i class="icon icon-home">`. **Just import the generated script**: it side-effect-imports the stylesheet (injects the CSS) and the atlas image (resolved/hashed by Vite), then exports `iconsImage` (atlas URL), `iconsName` and the `IconName` type. You do not import the `.css`/image yourself.

```ts
import './sprites/sheet'   // the {name} script — injects the CSS + resolves the atlas image
```

```html
<!-- base class + per-icon class; each class carries default px size + aspect-ratio,
     change the element's width to scale to any container -->
<i class="icon icon-home"></i>
```

If you don't want the script, import the generated stylesheet directly instead (`import './sprites/sheet.css'`) — but then the atlas image URL is resolved relative to the CSS by Vite, which is what the script entry handles for you.

```tsx
// React — same classes, typed by IconName
import './sprites/sheet'
import { type IconName } from './sprites/sheet'

const Sprite = ({ name }: { name: IconName }) => <i className={`icon icon-${name}`} />
```

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

## unused options

Finds **files nothing references** and writes a manifest table; deletion is a **separate** step (`removeUnused` / `remove-unused`) so a stray detection never deletes by surprise. **Not asset-only** — `ext`/`include` accept any extension/glob (`.js`/`.ts`/`.json`/…); the image/font list is just the default. Two detection backends, same table:

- **Module-graph** (precise): the umbrella option key `unused?: UnusedDetectOptions | false` (build-only plugin, `apply:'build'`, never deletes). Best for code, since reachability = the Rollup graph. Used through the umbrella, the three engines' sources and output dirs (colorfonts/svgIcons/bitmapIcons items' `sources` + `output.dir`) are **auto-excluded** so icon sources and products are never flagged or deleted.
- **Static scan** (no Vite): `findUnused()` / `remove-unused --scan` — greps source files for references; for CLI/non-bundler flows. Conservative (over-keeps); entry code files (`main.ts`, HTML/config-referenced) may be false-flagged, so prefer the module-graph backend for code or `exclude` the entries.

`UnusedDetectOptions` (module-graph) / `FindUnusedOptions` (static, adds `sources`/`sourceRoot`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `root` | `string` | `'src'` | Scan root. |
| `include` | `string[]` | derived from `ext` | Candidate globs (relative to `root`). Any extension. |
| `ext` | `string[]` | image/font/media exts | Builds the default `include` when `include` is omitted. |
| `exclude` | `string[]` | `[]` | Repo-root-relative globs; **additive** on top of the auto excludes. |
| `output` | `string` | `.cache.graphics/unused.json` | Manifest table path. |
| `enabled` | `boolean` | `true` | Skip detection when false. |

Deletion (`removeUnused` / `remove-unused`) takes its own `include`/`exclude` glob filter — a final safety gate independent of how the table was produced (`exclude` always wins; matches reported as `skipped`).

---

## Standalone (no Vite)

Import each engine from its subpath:

```ts
import { build, buildAndWrite, colorfonts } from 'graphics-icon/colorfont'
import { svgIcons } from 'graphics-icon/svg'
import { bitmapIcons } from 'graphics-icon/bitmap'
import { imagemin, defaultOptions } from 'graphics-icon/imagemin'

await colorfonts({ colorFormat: 'auto', items: [{ sources: 'icons', output: { dir: 'fonts', fontName: 'AppIcons', name: 'AppIcons' }, cacheFilename: 'cf.json' }] })
await svgIcons({ items: [{ sources: 'svg', output: { dir: 'out', name: 'icons' } }] })
await bitmapIcons({ items: [{ sources: 'png', output: { dir: 'out', name: 'sheet' } }] })
await imagemin(files, { ...defaultOptions })
```

- colorfont: `build(item)` → `BuildResult` (pure, no disk); `buildAndWrite(item)` → writes to `output.dir`, returns `BuildResult | null` (`null` = cache hit); `colorfonts({items})` → batch.
- svg/bitmap: `svgIcons`/`bitmapIcons({items})`.
- imagemin: `imagemin(files, opts)` + `defaultOptions`.
- unused: `findUnused({ root, include?, ext?, exclude?, sources? })` → static detect (no Vite), writes the table; `removeUnused({ include?, exclude?, dryRun? })` → delete from the table.

## CLI

```bash
color-fonts build --sources icons --dir fonts --font-name AppIcons --name AppIcons   # also: watch / check
svg-icons    --config ./svg.config.ts      # default-exports { items: [...] }
bitmap-icons --config ./bitmap.config.ts   # default-exports { items: [...] }
image-min    --all --config ./imagemin.config.ts   # or pass a file list (pre-commit)
remove-unused --scan --root src --exclude "src/icons/**"  # static detect (no vite) -> write table; --ext .js,.ts for any type
remove-unused --dry-run                            # preview deletion from the table
remove-unused --exclude "src/keep/**"              # delete, honoring the include/exclude safety gate (--manifest <path> for a custom table)
```

### Config file shape (`--config`)

`svg-icons` / `bitmap-icons` / `image-min` load a config that **default-exports the engine options object** — the same shape you'd pass to the engine function. Minimal examples:

```ts
// svg.config.ts
import type { SvgIconsOptions } from 'graphics-icon/svg'
export default {
  color: 'mono',                                // common — merged into each item
  items: [
    { sources: 'src/icons/svg', output: { dir: 'src/sprites', name: 'icons' } },
  ],
} satisfies SvgIconsOptions
```

```ts
// bitmap.config.ts
import type { BitmapIconsOptions } from 'graphics-icon/bitmap'
export default {
  classPrefix: 'icon',                          // common (classSeparator defaults to '-')
  items: [
    { sources: 'src/icons/png', output: { dir: 'src/sprites', name: 'sheet' } },
  ],
} satisfies BitmapIconsOptions
```

```ts
// imagemin.config.ts — singleton (no items)
import type { ImageminOptions } from 'graphics-icon/imagemin'
export default {
  exclude: ['src/assets/masters/**'],           // masters are rewritten in place — exclude them
  webp: { quality: 80 },
} satisfies ImageminOptions
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
| `graphics-icon/colorfont` | colorfont 引擎：`build`/`buildAndWrite`/`colorfonts`/`runCli` + 类型 | 否 |
| `graphics-icon/svg` | svg 引擎：`svgIcons`/`runCli` + 类型 | 否 |
| `graphics-icon/bitmap` | bitmap 引擎：`bitmapIcons`/`runCli` + 类型 | 否 |
| `graphics-icon/imagemin` | imagemin 引擎：`imagemin`/`defaultOptions`/`runCli` + 类型 | 否 |
| `graphics-icon/unused` | 无用文件引擎：`removeUnused`/`findUnused`/`runCli` + 类型 | 否 |

另含 5 个 CLI：**`color-fonts`** · **`svg-icons`** · **`bitmap-icons`** · **`image-min`** · **`remove-unused`**。

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
      colorfonts: {
        colorFormat: 'auto',                  // 公共参数（合并进每个 item）
        items: [{ sources: 'src/icons/color', output: { dir: 'src/fonts', fontName: 'AppIcons', name: 'AppIcons' } }],
      },
      svgIcons:   { items: [{ sources: 'src/icons/svg', output: { dir: 'src/sprites', name: 'icons' }, color: 'mono' }] },
      bitmapIcons:{ items: [{ sources: 'src/icons/png', output: { dir: 'src/sprites', name: 'sheet' } }] },
      imagemin:   { enabled: true },
    }),
  ],
})
```

**colorfont 实物落盘**：把字体以及 `<name>.css`、`<name>.ts`、`<name>.codepoints.json` 写进 `output.dir`（随仓库提交，和雪碧图一样）。用普通 import 消费，**没有 `virtual:colorfont*` 虚拟模块**：

```ts
import './fonts/AppIcons.css'                       // @font-face + .icon 类
import { icons, type IconName } from './fonts/AppIcons'  // 类型化 API
```

### 消费 colorfont 产物

生成的 `<fontName>.ts` 导出一套类型化 API（均以 `IconName` 为键）：

| 导出 | 类型 | 用途 |
| --- | --- | --- |
| `icons` | `Record<IconName, string>` | **图标名 → CSS 类名**（每图标类，如 `'home' → 'icon-home'`）；与 `baseName` 一起挂到元素上。 |
| `baseName` | `string` | 基础类名 = `classPrefix`（默认 `'icon'`）；挂载字体，与某个 `icons[name]` 配对使用。 |
| `codepoints` | `Record<IconName, number>` | 图标名 → 分配的 PUA 码位（稳定，锁在 `codepoints.json`）。 |
| `colorIcons` | `Partial<Record<IconName, true>>` | 仅**彩色**图标 —— `colorIcons[name]` 是 O(1) 的「是否多色」判定。 |
| `iconContent(name)` | `(name: IconName) => string` | 字形字符（`String.fromCodePoint(码位)`）—— 用于自写 CSS 的 `::before { content }`，或 canvas/`<text>`。 |
| `IconName` | `type` | 所有图标名的联合 —— 用来给自己的 props 标类型。 |

把 `baseName` + `icons[name]` 拼到元素 class 上即可（`.css` 已定义 `.icon` 与 `.icon-<name>`）：

```tsx
// React / JSX
import { icons, baseName, type IconName } from './fonts/AppIcons'

const Icon = ({ name }: { name: IconName }) =>
  <i className={`${baseName} ${icons[name]}`} aria-hidden />   // 如 class="icon icon-home"

<Icon name="home" />
```

```html
<!-- 原生 HTML —— baseName 是 "icon"，icons['home'] 是 "icon-home" -->
<i class="icon icon-home" aria-hidden="true"></i>
```

## 通用机制（所有能力）

- **多实例**：`{ ...公共, items: [项, …] }`。每实例 = `{ ...公共, ...项 }`（项覆盖公共）。每实例独立缓存 + 独立产物。
- **缓存**（`cache?: boolean`，默认 `true`）：命中（输入+选项+产物均未变）跳过整条管线；`false` 删该实例缓存 + 旧产物并重建。缓存位置按实例：
  - **Vite**：`cacheName?: string` —— 仅文件名，落 `.cache.graphics/`。
  - **独立**：`cacheFilename?: string` —— 完整路径（或裸名 → `.cache.graphics/`）。
- **错误处理**（`throwable?: boolean`，默认 `true`）：失败时 `true` 抛错中止（Vite 报错；CLI 非零退出）；`false` 告警并继续。

### 提交 `.cache.graphics/`

各实例的 groupCache 文件（以及 `imagemin.json`、`unused.json`）都放在 `.cache.graphics/` 下。**推荐：整个目录一起提交。** 缓存按内容哈希、与机器无关，提交后队友与 CI 可直接命中缓存 —— 全新检出无需重建，目录里没有任何机器相关状态。

若不想提交可重建的构建缓存，但仍需共享**必须提交的锁**（imagemin 改名缓存），可忽略目录但反向保留它：

```gitignore
# 方案 A —— 全部共享（推荐）：整目录提交，什么都不忽略。

# 方案 B —— 忽略可重建缓存，但保留必须提交的锁：
.cache.graphics/*
!.cache.graphics/imagemin.json        # 内容哈希 + 改名缓存 —— 要提交
# colorfont 码位锁是 <name>.codepoints.json，落在 output.dir 字体旁
#（不在 .cache.graphics/ 里）—— 无论如何都要提交。
```

> 注：colorfont 的**码位锁** `<name>.codepoints.json` 写在 `output.dir` 字体旁，**不在** `.cache.graphics/` 里，必须始终提交（保持 PUA 码位稳定），它不是缓存产物。

### 选项类型命名：`*PluginOptions`（vite） vs `*Options`/`*Item`（引擎）

两套入口导出的选项类型**命名不同** —— 按对应子路径 import：

| 能力 | `graphics-icon/vite`（伞） | 引擎子路径 |
| --- | --- | --- |
| colorfont | `ColorfontPluginOptions`、`ColorfontItem`、`ColorfontCommon` | `graphics-icon/colorfont`：`ColorfontOptions`、`ColorfontItem`、`ColorfontCommon` |
| svg | `SvgIconsPluginOptions`、`SvgIconsItem`、`SvgIconsCommon` | `graphics-icon/svg`：`SvgIconsOptions`、`SvgIconsItem`、`SvgIconsCommon` |
| bitmap | `BitmapIconsPluginOptions`、`BitmapIconsItem`、`BitmapIconsCommon` | `graphics-icon/bitmap`：`BitmapIconsOptions`、`BitmapIconsItem`、`BitmapIconsCommon` |
| imagemin | `ImageminPluginOptions`（= `Partial<ImageminOptions> & { enabled }`） | `graphics-icon/imagemin`：`ImageminOptions` |

经验法则：**`vite.config.ts`** 里用 `graphics-icon/vite` 的 `*PluginOptions` 名；**独立/CLI** 代码里用引擎子路径的 `*Options` 名。`*Item` 拼写一致但各入口都有再导出，从你正在用的那个子路径 import 即可。伞还再导出 `GraphicsIconOptions`（整个 `graphicsIcon({...})` 参数）与 `UnusedDetectOptions`。

## 选项参考

各能力的 `common` / `item` 字段、类型、默认值见上方英文表（字段名与默认值一致）。要点：
- **colorfont**：`item` 必填 `sources` + `output.{dir,fontName,name}`（`output.ts?` 默认 true）；产物全落 `output.dir`，按 `output.name` 派生字体/`.css`/`.ts`/`.codepoints.json`（码位锁需提交，非缓存产物）。类名 = `classPrefix`（默认 `'icon'`）+ `classSeparator`（默认 `'-'`）：基类 `.icon`、每图类 `.icon-home`。Vite 插件层额外 `watch`/`devFast`（dev woff2 q9）。
- **svgIcons**：`item` 必填 `sources` + `output.{dir,name}`（`output.ts?` 默认 true）；雪碧图/脚本/清单三产物恒产，落 `output.dir` 按 `name` 派生。`color`（svg 专属，`'keep'` 默认保留源多色 / `'mono'` 健壮单色，根 currentColor 由 CSS color 控制 / 函数逐色重映射；勿与 color-fonts 的 `colorFormat` 混淆）/`normalize`/`formatter` 等可公共。
- **bitmapIcons**：`item` 必填 `sources` + `output.{dir,name}`（`output.ts?` 默认 true、`output.format?` 默认 webp）；图集/样式/脚本/JSON 四产物恒产，落 `output.dir` 按 `name` 派生。`classPrefix`（默认 `'icon'`）/`classSeparator`（默认 `'-'`）/`padding`/`png`/`webp` 等可公共（基类 `.icon`、每图类 `.icon-home`）。
- **imagemin**：单例，`enabled` + 各格式 sharp 参数 + `svg`(svgo) + `svgSize`；⚠ 就地改写源文件（仅更小才写），母版放 `exclude`。
- **unused**：找出**无人引用的文件**并写清单表,删除是独立步骤(`removeUnused`/`remove-unused`)。**不限资产** —— `ext`/`include` 接受任意后缀/glob(`.js`/`.ts`/`.json`…),图片/字体清单只是默认值。两种检测后端、同一份表:
  - **模块图(精确)**:伞选项键 `unused?: UnusedDetectOptions | false`(`apply:'build'` 仅构建期,**只写表不删**);对代码尤其可靠(可达性=模块图)。经伞插件使用时,三引擎的源目录与产物目录(colorfonts/svgIcons/bitmapIcons 的 `sources` + `output.dir`)**自动排除**,图标源与产物均不会被误判或误删。
  - **静态扫描(不依赖 vite)**:`findUnused()` / `remove-unused --scan` —— grep 源码引用,供 CLI/非 bundler 流水线;保守(宁留不误删),入口代码文件可能误报,代码场景优先用模块图后端或 `exclude` 排除入口。
  - 字段:`root`(默认 `'src'`)、`include`(候选 glob,省略则由 `ext` 生成)、`ext`(默认图片/字体/媒体后缀)、`exclude`(仓库根相对 glob,叠加在自动排除之上)、`output`(默认 `.cache.graphics/unused.json`)、`enabled`(默认 true);`findUnused` 另有 `sources`/`sourceRoot`。
  - 删除端 `removeUnused`/`remove-unused` 另有独立的 `include`/`exclude` 安全闸(与产表方式无关,`exclude` 优先级最高,命中者记入 `skipped`)。

### colorfont 的 `@font-face` 兼容链（`colorFormat: 'auto'`）

`auto` 生成的 `.css` 含**两条同 `font-family` 的 `@font-face`**，让每个浏览器各取所能渲染的最佳格式：

```css
/* 1. 保底块 —— 仅 mono、无 tech()。不认 tech() 的浏览器只会用到这条（单色轮廓）。 */
@font-face {
  font-family: "AppIcons";
  font-display: block;
  src: url("./AppIcons.mono.woff2") format("woff2") /* WOFF2：所有现代浏览器 */;
}

/* 2. 现代浏览器：后写的同 family 块覆盖上面的保底；各取第一条它支持 tech() 的 src。 */
@font-face {
  font-family: "AppIcons";
  font-display: block;
  src:
    url("./AppIcons.otsvg.woff2") format("woff2") tech(color-SVG)    /* Safari / iOS —— Chromium 永不支持 OT-SVG */,
    url("./AppIcons.colrv0.woff2") format("woff2") tech(color-COLRv0) /* 较旧 Chrome/Edge/Firefox —— 平涂多色 */,
    url("./AppIcons.mono.woff2") format("woff2")                     /* 本块内最后兜底：mono */;
}
```

回退顺序，强 → 弱：

- `tech(color-COLRv1)` → Chrome/Edge 98+ 与 Firefox（体积最小、渐变矢量；仅在产出 COLRv1 时出现，即 `colorFormat:'colrv1'`/`'auto'`）。
- `tech(color-SVG)` → **Safari / iOS**（OT-SVG；Chromium 永不支持 OT-SVG，故此条实为 Safari 专供）。
- `tech(color-COLRv0)` → 较旧 Chrome/Edge/Firefox（COLRv0 平涂多色，无渐变）。
- **无 `tech()`（mono）** → 任意浏览器。太老而不认 `tech()` 的浏览器会忽略整条第二块，自动回退到第 1 条的 mono 轮廓。

所以老浏览器无需额外配置即降级到 mono。要兼容**更老**的浏览器（IE11 / 旧 Safari）需要 `.woff` 容器，设 `formats: ['woff2','woff']` —— 每个 flavor 即各产两种容器，`src` 中 `woff2` 排在 `woff` 前。

### 消费 svg 产物

生成的 `{name}` 脚本把 sprite 以 URL 默认导入，并导出 `iconsHref`（sprite URL）、`iconsName`（名→id 对象）与 `IconName` 类型。用 `<use href="<sprite-url>#<id>">` 引用某个 symbol：

```tsx
// React / JSX
import { iconsHref, iconsName, type IconName } from './sprites/icons'
const SvgIcon = ({ name }: { name: IconName }) =>
  <svg aria-hidden><use href={`${iconsHref}#${iconsName[name]}`} /></svg>
```

```html
<!-- 原生 HTML —— iconsHref 是打包后的 sprite URL，iconsName.home 是 symbol id -->
<svg aria-hidden="true"><use href="/assets/icons-abc123.svg#home"></use></svg>
```

### 消费 bitmap 产物

样式产一个基类 `.icon`（基类选择器 `.${classPrefix}`）+ 每图类 `.icon-<name>`（`.${classPrefix}${classSeparator}${name}`）—— 即 `<i class="icon icon-home">`。**只 import 生成的脚本**：它会副作用引入样式（注入 CSS）与图集图（由 Vite 解析/带 hash），并导出 `iconsImage`（图集 URL）、`iconsName` 与 `IconName` 类型，你无需自己 import `.css`/图。

```ts
import './sprites/sheet'   // {name} 脚本 —— 注入 CSS + 解析图集图
```

```html
<!-- 基类 + 每图类；每图类带默认 px 尺寸 + aspect-ratio，改元素 width 即按容器自适应 -->
<i class="icon icon-home"></i>
```

不想用脚本时则直接 import 生成的样式（`import './sprites/sheet.css'`）—— 但此时图集图 URL 由 Vite 相对该 CSS 解析，这正是 script 入口替你处理的。

## 独立使用（Vite 之外）

```ts
import { build, buildAndWrite, colorfonts } from 'graphics-icon/colorfont'
import { svgIcons } from 'graphics-icon/svg'
import { bitmapIcons } from 'graphics-icon/bitmap'
import { imagemin, defaultOptions } from 'graphics-icon/imagemin'

await colorfonts({ colorFormat: 'auto', items: [{ sources: 'icons', output: { dir: 'fonts', fontName: 'AppIcons', name: 'AppIcons' }, cacheFilename: 'cf.json' }] })
await svgIcons({ items: [{ sources: 'svg', output: { dir: 'out', name: 'icons' } }] })
await bitmapIcons({ items: [{ sources: 'png', output: { dir: 'out', name: 'sheet' } }] })
await imagemin(files, { ...defaultOptions })
```

colorfont：`build(item)` 纯函数（不落盘）；`buildAndWrite(item)` 落盘到 `output.dir`，返回 `BuildResult | null`（`null`=命中）；`colorfonts({items})` 批量。
unused：`findUnused({ root, include?, ext?, exclude?, sources? })` 静态检测(不依赖 vite)写表；`removeUnused({ include?, exclude?, dryRun? })` 按表删除。

## CLI

```bash
color-fonts build --sources icons --dir fonts --font-name AppIcons --name AppIcons   # 另有 watch / check
svg-icons    --config ./svg.config.ts      # 配置 default-export { items: [...] }
bitmap-icons --config ./bitmap.config.ts   # 配置 default-export { items: [...] }
image-min    --all --config ./imagemin.config.ts   # 或传文件列表(pre-commit)
remove-unused --scan --root src --exclude "src/icons/**"  # 静态检测(不依赖 vite)→ 写表;--ext .js,.ts 任意后缀
remove-unused --dry-run                            # 预览按清单的删除
remove-unused --exclude "src/keep/**"              # 删除,遵守 include/exclude 安全闸(--manifest <path> 指定清单)
```

### 配置文件结构（`--config`）

`svg-icons` / `bitmap-icons` / `image-min` 加载的配置**默认导出引擎选项对象** —— 与直接传给引擎函数的形状一致。最小示例：

```ts
// svg.config.ts
import type { SvgIconsOptions } from 'graphics-icon/svg'
export default {
  color: 'mono',                                // 公共 —— 合并进每个 item
  items: [
    { sources: 'src/icons/svg', output: { dir: 'src/sprites', name: 'icons' } },
  ],
} satisfies SvgIconsOptions
```

```ts
// bitmap.config.ts
import type { BitmapIconsOptions } from 'graphics-icon/bitmap'
export default {
  classPrefix: 'icon',                          // 公共（classSeparator 默认 '-'）
  items: [
    { sources: 'src/icons/png', output: { dir: 'src/sprites', name: 'sheet' } },
  ],
} satisfies BitmapIconsOptions
```

```ts
// imagemin.config.ts —— 单例（无 items）
import type { ImageminOptions } from 'graphics-icon/imagemin'
export default {
  exclude: ['src/assets/masters/**'],           // 母版会被就地改写 —— 排除掉
  webp: { quality: 80 },
} satisfies ImageminOptions
```

## License

MIT
