# @codejoo/graphics-to-font

> 高性能、全功能的前端图形构建套件（pnpm monorepo）
> High-performance, full-featured graphics build toolkit (pnpm monorepo)

中文 ｜ [English](#english)

把「图形资源 → 可上线产物」的常见构建需求收进一个 monorepo：SVG 图标编译为彩色 webfont、位图打包雪碧图、SVG 符号雪碧图、图片批量压缩。**本工程只对外发布一个 Vite 插件 [`vite-plugin-graphics-icon`](./packages/vite-plugin/README.md)**——它是一把「伞」，按需组合下面几个**私有内部包**的能力;其余包均为内部实现,不单独发布。

## 唯一发布物:`vite-plugin-graphics-icon`

一个统一的 Vite 插件,用一份配置驱动全部能力,并共享同一个缓存目录:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import graphicsIcon from 'vite-plugin-graphics-icon'

export default defineConfig({
  plugins: [
    graphicsIcon({
      cacheDir: '.cache.graphics',     // 公共缓存目录(各能力默认落 <名>.json)
      colorfont: { /* SVG → 彩色 webfont */ },
      bitmapIcons: { /* 位图 → 雪碧图 */ },
      svgIcons: { /* SVG → <symbol> 雪碧图 */ },
      imagemin: { /* 构建产物图片压缩;enabled:false 可关 */ },
    }),
  ],
})
```

省略某个键即不启用该能力(对应重依赖也不会加载)。`imagemin` 还提供**两种形态**:上面的 Vite 插件形态(带 `enabled` 开关,`closeBundle` 压缩构建输出),以及直接导出的引擎对象 `import { imagemin } from 'vite-plugin-graphics-icon'` 供脚本/CLI 单独调用。

## 内部结构(均为 private)

| 包 | 名称 | 作用 |
|---|---|---|
| **发布** 伞插件 | `vite-plugin-graphics-icon` | 唯一对外发布物;聚合下列能力 + 公共 `cacheDir` + 每能力配置项。 |
| 彩色字体引擎 | `@codejoo/colorfont`(private) | SVG 图标 → 彩色 webfont(mono/COLRv0/OT-SVG/COLRv1)引擎 + CLI。Vite 插件层已上移到伞包。 |
| 位图雪碧图 | `bitmap-icons`(private) | sharp + maxrects-packer 把位图打成图集 + 自适应样式/入口脚本。 |
| SVG 雪碧图 | `svg-icons`(private) | `<symbol>` 雪碧图,id 作用域化、颜色主题化,可选与 colorfont 同步的 normalize。 |
| 图片压缩 | `@codejoo/imagemin`(private) | sharp + svgo 就地压缩引擎/CLI,内容哈希缓存 + 重命名识别。 |
| 公共子模块 | `@codejoo/utils`(private) | 哈希/glob/幂等写入/共享缓存原语/SVG 缩放归一化。 |

## 设计原则

每个内部包都是独立项目、可单独维护;公共逻辑统一抽进 `@codejoo/utils`,相似功能不再各写一份。所有能力共用一个缓存目录(默认 `.cache.graphics/`,经伞插件 `cacheDir` 配置),每项默认缓存文件名即其子项目名。重依赖(sharp / svgo / svgpath / vite-plugin-icons-spritesheet 等)只在真正执行时动态加载。公用依赖版本由根 `pnpm-workspace.yaml` 的 `catalog:` 统一管理。发布时伞包用 tsup 内联各内部包源码、打包两个 wasm,第三方运行时依赖保持 external。

## 仓库结构

```
packages/
  vite-plugin/     vite-plugin-graphics-icon  ← 唯一发布物(public)
  colorfont/       @codejoo/colorfont(private,引擎+cli;含两个 wasm crate)
  bitmap-icons/    bitmap-icons(private)
  svg-icons/       svg-icons(private)
  imagemin/        @codejoo/imagemin(private)
  utils/           @codejoo/utils(private)
.cache.graphics/   共享缓存目录
```

根目录只保留工作区配置(`pnpm-workspace.yaml`、`tsconfig.base.json`、lockfile),不含项目逻辑。

```bash
pnpm install
pnpm -C packages/vite-plugin build   # 构建/发布唯一对外插件
```

---

<a name="english"></a>
## English

A single monorepo for common "graphics assets → shippable artifacts" build needs: SVG icons → color webfont, bitmap sprite sheets, SVG symbol sprites, and image compression. **This project publishes exactly one Vite plugin, [`vite-plugin-graphics-icon`](./packages/vite-plugin/README.md)** — an umbrella that composes the capabilities of several **private internal packages** on demand; everything else is internal and not published separately.

### The only published artifact: `vite-plugin-graphics-icon`

One unified Vite plugin, one config, one shared cache dir:

```ts
import graphicsIcon from 'vite-plugin-graphics-icon'

export default defineConfig({
  plugins: [
    graphicsIcon({
      cacheDir: '.cache.graphics',
      colorfont: { /* SVG → color webfont */ },
      bitmapIcons: { /* bitmaps → sprite sheet */ },
      svgIcons: { /* SVG → <symbol> sprite */ },
      imagemin: { /* compress build output; enabled:false to skip */ },
    }),
  ],
})
```

Omit a key to disable that capability (its heavy deps won't load). `imagemin` ships in **two forms**: the Vite-plugin form above (an `enabled` switch, compresses build output in `closeBundle`) and a directly-exported engine object — `import { imagemin } from 'vite-plugin-graphics-icon'` — for standalone script/CLI use.

### Internal structure (all private)

| Package | Name | Role |
|---|---|---|
| **Published** umbrella | `vite-plugin-graphics-icon` | The only published artifact; aggregates the below + a shared `cacheDir` + per-capability config. |
| Color-font engine | `@codejoo/colorfont` (private) | SVG icons → color webfont (mono/COLRv0/OT-SVG/COLRv1) engine + CLI. The Vite-plugin layer moved up into the umbrella. |
| Bitmap sprite | `bitmap-icons` (private) | sharp + maxrects-packer atlas packing + adaptive styles/entry script. |
| SVG sprite | `svg-icons` (private) | `<symbol>` sprite with id scoping, color theming, optional colorfont-synced normalize. |
| Image compression | `@codejoo/imagemin` (private) | In-place sharp + svgo compression engine/CLI with content-hash caching + rename detection. |
| Shared submodule | `@codejoo/utils` (private) | Hashing / glob / idempotent writes / shared cache primitives / SVG scaling-normalization. |

### Design principles

Each internal package is its own maintainable project; shared logic is consolidated into `@codejoo/utils` (no duplication). All capabilities share one cache folder (default `.cache.graphics/`, set via the umbrella's `cacheDir`), each defaulting to its own `<name>.json`. Heavy deps (sharp / svgo / svgpath / vite-plugin-icons-spritesheet, …) load only when work runs. Shared dependency versions are pinned centrally via the `catalog:` block in the root `pnpm-workspace.yaml`. At publish time the umbrella inlines the internal packages' source via tsup and bundles the two wasm modules, keeping third-party runtime deps external.

### Repo layout

```
packages/
  vite-plugin/     vite-plugin-graphics-icon  ← the only published package (public)
  colorfont/       @codejoo/colorfont (private; engine + cli; holds the two wasm crates)
  bitmap-icons/    bitmap-icons (private)
  svg-icons/       svg-icons (private)
  imagemin/        @codejoo/imagemin (private)
  utils/           @codejoo/utils (private)
.cache.graphics/   shared cache folder
```

The repo root holds only workspace configuration and contains no project logic.

```bash
pnpm install
pnpm -C packages/vite-plugin build   # build/publish the single public plugin
```
