# @codejoo/colorfont

> 把一组 **SVG 图标编译成彩色图标 webfont**（mono / COLRv0 / OT-SVG / COLRv1）的引擎。纯 JS + 预编译 wasm，安装无需 `node-gyp` / 原生编译。
> Engine that compiles a folder of **SVG icons → a color icon webfont**. Pure JS + prebuilt wasm.

本包是 [`vite-plugin-graphics-icon`](../vite-plugin) 的 **colorfont 引擎**。它有两种用法：

- **集成进 Vite**：经 `graphicsIcon({ colorfont: {...} })`（完整插件选项见[伞插件 README](../vite-plugin/README.md#colorfont-选项)）。
- **单独使用**：import 引擎函数，或用 CLI（`graphics-icon-colorfont`）——见下文。

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

```ts
import { build, buildAndWrite } from '@codejoo/colorfont'
// 经伞包: import { colorfont } from 'vite-plugin-graphics-icon' → colorfont.build / colorfont.buildAndWrite

// 纯函数：产出 Buffer + 元数据 + CSS/TS 生成器，不落盘
const result = await build({ input: 'icons', outDir: 'fonts', fontName: 'AppIcons' })

// 便捷版：build 后把 字体 / CSS / TS 入口 / 码位锁 写到 outDir
await buildAndWrite({ input: 'icons', outDir: 'fonts', fontName: 'AppIcons' })
```

### CLI

```bash
graphics-icon-colorfont build --input icons --out-dir fonts --font-name AppIcons
graphics-icon-colorfont check   # 校验码位锁稳定（CI / pre-commit）
```

## 导出 API / Exports

| API | 类型 | 作用 |
| --- | --- | --- |
| `build(options)` | `(o: ColorfontOptions) => Promise<BuildResult>` | 纯函数构建，返回字体资产 + 元数据 + `emitCss`/`dts`，不落盘。 |
| `buildAndWrite(options)` | `(o: ColorfontOptions) => Promise<BuildResult>` | 构建并把产物写入 `outDir`，更新码位锁。 |
| `runCli(argv)` | `(argv: string[]) => Promise<number>` | CLI 入口（被 `graphics-icon-colorfont` 复用），返回退出码。 |
| `readLockfile(file, paStart)` | `(file, paStart) => Promise<...>` | 读取码位锁文件。 |
| `serializeLockfile(lock)` | `(lock) => string` | 序列化码位锁。 |
| 类型 | `ColorfontOptions` / `BuildResult` / `FontAsset` / `FontFlavor` / `FontFormat` / `FontMetadata` / `GlyphMeta` / `ColorFormat` | 选项与结果类型。 |

`ColorfontOptions` 的字段、类型与默认值见[伞插件 README · colorfont 选项](../vite-plugin/README.md#colorfont-选项)（必填：`input` / `outDir` / `fontName`）。

## License

MIT
