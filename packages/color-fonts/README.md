# color-fonts

> 把一组 **SVG 图标编译成彩色图标 webfont**（mono / COLRv0 / OT-SVG / COLRv1）的引擎。纯 JS + 预编译 wasm，安装无需 `node-gyp` / 原生编译。
> Engine that compiles a folder of **SVG icons → a color icon webfont**. Pure JS + prebuilt wasm.

本包是发布包 [`graphics-icon`](../exports)（在 `packages/exports`）的 **colorfont 引擎**。它有两种用法：

- **集成进 Vite**：经 `graphicsIcon({ colorfonts: {...} })`（完整插件选项见[发布包 README](../exports/README.md#colorfonts-options)）。
- **单独使用**：从 `graphics-icon/colorfont` import 引擎函数，或用 CLI（`color-fonts`）——见下文。

`colorFormat: 'auto'` 会把一个 SVG 目录变成可共存于一条 `@font-face` 回退链的多档字形，现代浏览器各取所能支持的最佳：

| 档位 | 内容 | 浏览器 | 产出方式 |
| --- | --- | --- | --- |
| `mono` | 单色 `glyf` 轮廓（始终产出，终极回退） | 全部 | `svg2ttf`（纯 JS） |
| `colrv0` | 平涂多色 `COLR`/`CPAL` | 全部（含旧 Safari） | 手写 COLRv0+CPAL 注入 glyf |
| `otsvg` | 内嵌 `SVG ` 表（渐变/完整 SVG） | Safari / iOS | 手写 `SVG ` 表注入 glyf |
| `colrv1` | 渐变/变换 `COLR` v1（**显式开启**） | Chrome/Edge 98+、Firefox 107+ | Rust `write-fonts` → wasm（预编译内置） |

WOFF2 容器由 `ttf2woff2`（Rust）→ wasm 编码（预编译内置）。

## 单独使用 / Standalone

### 引擎函数

从发布包子路径 `graphics-icon/colorfont` 导入引擎函数（私有包名 `color-fonts` 仅 monorepo 内部用）：

```ts
import { build, buildAndWrite, colorfonts } from 'graphics-icon/colorfont'

// 纯函数：产出 Buffer + 元数据 + CSS/TS 生成器，不落盘
const result = await build({ input: 'icons', outDir: 'fonts', fontName: 'AppIcons' })

// 便捷版：build 后把 字体 / <fontName>.css / <fontName>.ts 入口 / <fontName>.codepoints.json 写到 outDir
await buildAndWrite({ input: 'icons', outDir: 'fonts', fontName: 'AppIcons' })

// 批量（多实例 items[]）
await colorfonts({ colorFormat: 'auto', items: [{ input: 'icons', outDir: 'fonts', fontName: 'AppIcons' }] })
```

**实物落盘 / 无虚拟模块**：产物是真实文件，消费方用普通 import：`import './fonts/AppIcons.css'` + `import { icons, type IconName } from './fonts/AppIcons'`。

### CLI

```bash
color-fonts build --input icons --out fonts --name AppIcons   # 另有 watch / check
color-fonts check   # 校验码位锁稳定（CI / pre-commit）
```

## 注意 / Caveats

- **码位锁内容不参与构建缓存键**：`<fontName>.codepoints.json` 是「状态」而非缓存产物，其内容**不计入**构建缓存指纹。请**勿手改**——手改后缓存可能仍命中，从而继续供给旧字体。若需强制重建，请用 `cache:false`。
  The codepoint lock's content is **not part of the build cache key**: `<fontName>.codepoints.json` is state, not a cache product, so editing it by hand won't invalidate the cache — a stale hit may keep serving the old font. Use `cache:false` to force a rebuild.
- **缓存路径相对 `process.cwd()` 锚定**：构建缓存（`.cache.graphics/`）的相对路径以 `process.cwd()` 为根。请**从仓库根运行构建**;跨目录运行会让缓存口径漂移(同一份输入在不同 cwd 下算出不同相对路径 → 误判 miss/hit)。
  Cache paths are anchored to `process.cwd()`: run the build **from the repo root**. Running from a different directory drifts the cache key (the same inputs resolve to different relative paths).

## 导出 API / Exports

| API | 类型 | 作用 |
| --- | --- | --- |
| `build(item)` | `(o: ColorfontOptions) => Promise<BuildResult>` | 纯函数构建，返回字体资产 + 元数据 + `emitCss`/`dts`，不落盘。 |
| `buildAndWrite(item)` | `(o: ColorfontOptions) => Promise<BuildResult \| null>` | 构建并把产物写入 `outDir`（`null` = 缓存命中），更新码位锁。 |
| `colorfonts(options)` | `(o: { ...common, items: [...] }) => Promise<...>` | 多实例批量构建并落盘。 |
| `runCli(argv)` | `(argv: string[]) => Promise<number>` | CLI 入口（被 `color-fonts` 复用），返回退出码。 |
| `readLockfile(file, paStart)` | `(file, paStart) => Promise<...>` | 读取码位锁文件。 |
| `serializeLockfile(lock)` | `(lock) => string` | 序列化码位锁。 |
| 类型 | `ColorfontOptions` / `BuildResult` / `FontAsset` / `FontFlavor` / `FontFormat` / `FontMetadata` / `GlyphMeta` / `ColorFormat` | 选项与结果类型。 |

`ColorfontOptions` 的字段、类型与默认值见[发布包 README · colorfont options](../exports/README.md#colorfont-options)（item 必填：`input` / `outDir` / `fontName`）。

## License

MIT
