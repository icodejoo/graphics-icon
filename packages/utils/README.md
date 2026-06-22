# @codejoo/utils

> 套件内部公共子模块 / Internal shared submodule for **@codejoo/graphics-to-font**

中文 ｜ [English](#english)

`colorfont`、`bitmap-icons`、`svg-icons`、`imagemin` 各引擎共用的公共函数都集中在这里，做到「一处实现、多处复用」：相似逻辑不再各写一份。本包不对外发布（`private`），仅供 monorepo 内部以 `workspace:*` 引用（其类型会在发布包 `graphics-icon`（packages/exports）打包时内联，对最终消费方透明）。

## 提供的能力

| 子路径 | 导出 | 说明 |
|---|---|---|
| `./hash` | `sha256` | 内容哈希，缓存指纹同源。 |
| `./fingerprint` | `buildStamp` | 缓存指纹约定：`sha256(JSON.stringify(config) + 每文件 "rel:sha256(内容)" 行)`，svg/bitmap 同源。 |
| `./glob` | `toGlobList` `matchesAnyGlob` | include/exclude 归一与匹配（正斜杠，兼容 Windows）。 |
| `./path-rel` | `relTo` | 生成 `url()`/`import` 用相对路径。 |
| `./fs-write` | `writeTextIfChanged` `writeBufferIfChanged` | 幂等写入，内容未变不落盘（防 HMR/git 抖动）。 |
| `./cache` | `groupCache` `resolveCacheFile` `loadCache` `saveCache` `pruneCache` `CACHE_DIR` | 共享缓存目录 + 统一 `groupCache`（管 svg/bitmap/colorfont 的多实例按项缓存）+「键→字符串」JSON 原语 + 剪枝。 |
| `./scale-svg` | `scaleSvgToWidth` `normalizeSvg` | SVG 放大（scale-that-svg）与 colorfont 对齐的归一化。 |

## 两个关键设计

**共享缓存目录**：所有缓存默认落在仓库根 `.cache.graphics/`。多实例引擎（svg/bitmap/colorfont）经统一 `groupCache` 按 `items[]` 项各存一份（文件名 Vite 用 `cacheName`、独立用 `cacheFilename`，省略则从该项产物派生）；单例 `imagemin` 默认 `imagemin.json`。底层 `resolveCacheFile(name, custom?)` 支持：省略→默认名；裸文件名→仍落共享目录；含路径分隔符→完全自定义位置。注意 `groupCache` 内的输入/产物路径以 `process.cwd()` 为根锚定，请从**仓库根**运行构建,跨目录运行会让缓存口径漂移。

**按需加载**：重依赖（`svgo` / `svgpath` / `scale-that-svg`）全部在 `scale-svg` 内部 `await import()` 动态加载——只有真正调用缩放函数时才加载，未用到的代码路径不占内存。配合子路径导出，可只拉取所需模块。

```ts
import { resolveCacheFile, loadCache, saveCache } from "@codejoo/utils/cache"
import { normalizeSvg } from "@codejoo/utils/scale-svg"
```

---

<a name="english"></a>
## English

All functions shared by the engines (`colorfont`, `bitmap-icons`, `svg-icons`, `imagemin`) live here — implemented once, reused everywhere, so similar logic is never duplicated. This package is **private** and consumed only inside the monorepo via `workspace:*` (its types are inlined when the published `graphics-icon` package at `packages/exports` bundles, transparent to end consumers).

### What it exports

| Subpath | Exports | Purpose |
|---|---|---|
| `./hash` | `sha256` | Content hashing — one source of cache fingerprints. |
| `./fingerprint` | `buildStamp` | Cache-stamp convention: `sha256(JSON.stringify(config) + per-file "rel:sha256(content)" lines)`, shared by svg/bitmap. |
| `./glob` | `toGlobList`, `matchesAnyGlob` | include/exclude normalization & matching (forward slashes, Windows-safe). |
| `./path-rel` | `relTo` | Relative path for `url()`/`import`. |
| `./fs-write` | `writeTextIfChanged`, `writeBufferIfChanged` | Idempotent writes — no disk touch when unchanged. |
| `./cache` | `groupCache`, `resolveCacheFile`, `loadCache`, `saveCache`, `pruneCache`, `CACHE_DIR` | Shared cache folder + unified `groupCache` (manages the per-item multi-instance caches of svg/bitmap/colorfont) + "key→string" JSON primitives + pruning. |
| `./scale-svg` | `scaleSvgToWidth`, `normalizeSvg` | SVG scaling (scale-that-svg) and colorfont-aligned normalization. |

### Two key design points

**Shared cache folder** — every cache defaults into `.cache.graphics/` at the repo root. Multi-instance engines (svg/bitmap/colorfont) store one cache per `items[]` entry via the unified `groupCache` (filename from `cacheName` in Vite / `cacheFilename` standalone, else derived from that entry's products); the `imagemin` singleton defaults to `imagemin.json`. The underlying `resolveCacheFile(name, custom?)` supports: omitted → default name; bare filename → still in the shared folder; path with separators → fully custom location. Note: `groupCache` anchors input/product paths to `process.cwd()`, so run builds **from the repo root** — running elsewhere drifts the cache key.

**On-demand loading** — heavy deps (`svgo` / `svgpath` / `scale-that-svg`) are `await import()`-ed inside `scale-svg`: loaded only when a scaling function actually runs, so unused paths allocate nothing. Combined with subpath exports, you pull only what you use.
