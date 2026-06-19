# bitmap-icons

> 用 **sharp + maxrects-packer** 把一个目录的位图（png/jpg/jpeg/webp/avif）打成**单张**雪碧图集，并生成样式、入口脚本与可选坐标 JSON。
> Pack a directory of bitmaps into a single sprite-sheet atlas, emitting a stylesheet, an entry script and optional coordinate JSON.

本包是 [`vite-plugin-graphics-icon`](../vite-plugin) 的 **bitmapIcons 引擎**。两种用法：

- **集成进 Vite**：经 `graphicsIcon({ bitmapIcons: {...} })`（完整插件选项见[伞插件 README](../vite-plugin/README.md#bitmapicons-选项)）。
- **单独使用**：import 引擎函数，或用 CLI（`graphics-icon-bitmap`）——见下文。

特点：无 `publicPath`（CSS 用「style→image 相对 url()」、script 用相对 import，均交 Vite 解析/带 hash）；产物 `*.sprite.{webp,png}` 命名会被自动排除出源扫描，故可与源图同目录；每组生成幂等（内容未变不写盘 → 不触发 HMR 循环）。

## 单独使用 / Standalone

### 引擎函数

```ts
import { generateBitmapSheets } from 'bitmap-icons'
// 经伞包: import { bitmapIcons } from 'vite-plugin-graphics-icon' → bitmapIcons.generate

await generateBitmapSheets({
  sprites: [
    { inputDir: 'src/icons/png', prefix: 'icon',
      output: { image: 'src/sprites/sheet.webp', style: 'src/sprites/sheet.css', script: 'src/sprites/sheet.ts' } },
  ],
})
```

调用方只需：`import { iconsImage, type IconName } from '<output.script>'` —— 该脚本注入样式、给出图 URL 与类型。

### CLI

```bash
graphics-icon-bitmap --config ./bitmap.config.ts   # 配置文件 default-export 一个含 sprites[] 的 BitmapIconsOptions
```

## 导出 API / Exports

| API | 类型 | 作用 |
| --- | --- | --- |
| `generateBitmapSheets(options)` | `(o: BitmapIconsOptions) => Promise<void>` | 按 `sprites[]` 顺序生成所有图集 + 边车，维护共享缓存（任一组出错即抛出）。 |
| `bitmapIcons(options)` | `(o: BitmapIconsOptions) => Plugin` | Vite 插件工厂（供伞插件内部使用；推荐经 `graphicsIcon` 使用）。 |
| `runCli(argv)` | `(argv: string[]) => Promise<void>` | CLI 入口（被 `graphics-icon-bitmap` 复用）。 |
| 类型 | `BitmapIconsOptions` / `BitmapIconsConfig` / `BitmapIconsOutput` / `IconFrame` / `IconManifest` / `IconSheetMeta` | 选项与产物清单类型。 |

`BitmapIconsOptions` / 每组 `sprites[]` 的字段、类型与默认值见[伞插件 README · bitmapIcons 选项](../vite-plugin/README.md#bitmapicons-选项)。

## License

MIT
