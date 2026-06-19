# @codejoo/imagemin

> 按需加载的**图片压缩引擎 + CLI**：位图走 [sharp](https://github.com/lovell/sharp)，矢量走 [svgo](https://github.com/svg/svgo)；内容哈希缓存避免重复压缩。
> On-demand image-optimization **engine + CLI**: bitmaps via sharp, vectors via svgo, with a content-hash cache.

本包是 [`vite-plugin-graphics-icon`](../vite-plugin) 的 **imagemin 引擎**。三种用法：

- **集成进 Vite**：经 `graphicsIcon({ imagemin: { enabled: true } })` —— 在 `closeBundle` 压缩**构建产物**（完整选项见[伞插件 README](../vite-plugin/README.md#imagemin-选项)）。
- **引擎函数**：import `optimizeImages` 在脚本里压缩任意文件列表。
- **CLI**：`graphics-icon-imagemin`，常用于 **pre-commit 就地压缩源图**或全量扫描。

> ⚠ 本管线**就地改写源文件**（仅当更小才写回；哈希缓存对每张图只压一次）。有损压缩是一次性永久操作——需保真的母版图请放进 `exclude`。

## 单独使用 / Standalone

### 引擎函数

```ts
import { optimizeImages, defaultOptions } from '@codejoo/imagemin'
// 经伞包: import { imagemin } from 'vite-plugin-graphics-icon' → imagemin.optimizeImages / imagemin.defaultOptions

const { changed } = await optimizeImages(files, { ...defaultOptions, webp: { quality: 82 } })
```

### CLI

```bash
graphics-icon-imagemin <files...>                       # 指定文件（如 pre-commit 暂存的图片）
graphics-icon-imagemin --all [目录...]                   # 全量扫描（缺省扫整个仓库根）
graphics-icon-imagemin --all --config ./imagemin.config.ts   # 用项目配置覆盖默认值（default-export）
```

## 导出 API / Exports

| API | 类型 | 作用 |
| --- | --- | --- |
| `optimizeImages(files, options)` | `(files: string[], o: ImageminOptions) => Promise<OptimizeResult>` | 压缩给定文件列表（sharp/svgo），就地写回更小者，更新哈希缓存。 |
| `defaultOptions` | `ImageminOptions` | 库级默认配置（可整体或部分覆盖）。 |
| `toGlobList(g)` | `(g?: string \| string[]) => string[]` | 归一化 include/exclude 为数组。 |
| `matchesAnyGlob(p, globs)` | `(p: string, globs: string[]) => boolean` | 路径是否命中任一 glob。 |
| `runCli(argv)` | `(argv?: string[]) => Promise<void>` | CLI 入口（被 `graphics-icon-imagemin` 复用）。 |
| 类型 | `ImageminOptions` / `FileResult` / `OptimizeResult` | 选项与结果类型。 |

`ImageminOptions` 的字段、类型与默认值见[伞插件 README · imagemin 选项](../vite-plugin/README.md#imagemin-选项)。

## License

MIT
