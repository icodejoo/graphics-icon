# svg-icons

> 把一个目录的零散 **SVG 编译成单个雪碧图**（`<symbol>` + `<use href>`）：id 作用域化、可选颜色改写、自产带类型的入口脚本、共享磁盘缓存。
> Compile a directory of SVGs into a single sprite sheet (`<symbol>` + `<use href>`) with id scoping, color rewriting, a typed entry script and a shared cache.

本包是 [`vite-plugin-graphics-icon`](../vite-plugin) 的 **svgIcons 引擎**。两种用法：

- **集成进 Vite**：经 `graphicsIcon({ svgIcons: {...} })`（完整插件选项见[伞插件 README](../vite-plugin/README.md#svgicons-选项)）。
- **单独使用**：import 引擎函数，或用 CLI（`graphics-icon-svg`）——见下文。

在 SVG 雪碧图基础上补齐：id 作用域化（修第三方 issue #38）、`fill/stroke → currentColor` 颜色改写（可主题化）、自产 `iconsHref + iconsName + IconName` 入口脚本，以及与 colorfont 同步的可选 normalize/缩放。

## 单独使用 / Standalone

### 引擎函数

```ts
import { generateSvgSprites } from 'svg-icons'
// 经伞包: import { svgIcons } from 'vite-plugin-graphics-icon' → svgIcons.generate

await generateSvgSprites({
  sprites: [
    { input: 'src/icons/svg', output: { svg: 'src/sprites/icons.svg', script: 'src/sprites/index.ts' }, color: true },
  ],
})
```

消费：

```ts
import { iconsHref, iconsName, type IconName } from '@/sprites'
// <use :href="`${iconsHref}#${iconsName.foo}`" />
```

### CLI

```bash
graphics-icon-svg --config ./svg.config.ts   # 配置文件 default-export 一个含 sprites[] 的 SvgIconsOptions
```

## 导出 API / Exports

| API | 类型 | 作用 |
| --- | --- | --- |
| `generateSvgSprites(options)` | `(o: SvgIconsOptions) => Promise<void>` | 一次性生成所有 SVG 雪碧图 + 类型化脚本，维护共享缓存。 |
| `svgIcons(options)` | `(o: SvgIconsOptions) => Plugin[]` | Vite 插件工厂（供伞插件内部使用；推荐经 `graphicsIcon` 使用）。 |
| `runCli(argv)` | `(argv: string[]) => Promise<void>` | CLI 入口（被 `graphics-icon-svg` 复用）。 |
| 类型 | `SvgIconsOptions` / `SvgIconsConfig` / `SvgIconsOutput` / `ColorOption` / `ColorFn` / `NormalizeOption` | 选项类型。 |

`SvgIconsOptions` / 每组 `sprites[]` 的字段、类型与默认值见[伞插件 README · svgIcons 选项](../vite-plugin/README.md#svgicons-选项)。

## License

MIT
