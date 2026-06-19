# vite-plugin-graphics-icon

> 一个 Vite 插件，统一你的「图标 / 图片」工具链：彩色图标 webfont、SVG 雪碧图、位图雪碧图、图片压缩。
> One Vite plugin for your whole icon/image toolchain: color icon webfont + SVG sprites + bitmap sprites + image optimization.

这是本仓库**唯一对外发布**的包，是四个引擎的统一出口。它把下面四个能力组合进**同一个** Vite 插件，按你传入的选项**自动启停**对应能力：

| 子能力 | 作用 | 产物 |
| --- | --- | --- |
| **colorfont** | 一组 SVG 图标 → 彩色图标 webfont（mono / COLRv0 / OT-SVG / COLRv1） | `.woff2/.woff` + `@font-face` CSS + 类型化 API |
| **svgIcons** | 一个目录的零散 SVG → 单个 SVG 雪碧图（`<symbol>` + `<use href>`） | sprite `.svg` + 类型化入口脚本 |
| **bitmapIcons** | 一个目录的位图（png/jpg/webp/avif）→ 单张雪碧图集 | `.webp/.png` 图集 + 样式 + 入口脚本 + 坐标 JSON |
| **imagemin** | 图片压缩（sharp + svgo，哈希缓存） | 就地压缩（构建产物或源图） |

每个子能力都是**双形态**：既可经本插件集成进 Vite，也可作为「引擎函数 + CLI」在 Vite 之外单独使用（见下文）。

---

## 安装 / Install

```bash
pnpm add -D vite-plugin-graphics-icon
# peer: vite ^5 || ^6 || ^7 || ^8
```

## 快速开始 / Quick start

`graphicsIcon({...})` 返回**单个** Vite 插件，直接放进 `plugins`。**只传你需要的子键**，没传（或传 `false`）的能力会被跳过：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import graphicsIcon from 'vite-plugin-graphics-icon'

export default defineConfig({
  plugins: [
    graphicsIcon({
      // 共享缓存目录（可选）：为各子能力未显式指定的缓存路径统一填充到此目录下
      cacheDir: 'node_modules/.cache/graphics',

      colorfont: { input: 'src/icons/color', outDir: 'src/fonts', fontName: 'AppIcons' },
      svgIcons:  { sprites: [{ input: 'src/icons/svg', output: { svg: 'src/sprites/icons.svg', script: 'src/sprites/index.ts' } }] },
      bitmapIcons: { sprites: [{ inputDir: 'src/icons/png', output: { image: 'src/sprites/sheet.webp', style: 'src/sprites/sheet.css' } }] },
      imagemin: { enabled: true },
    }),
  ],
})
```

> 只想用其中一个能力？只传那一个键即可，例如 `graphicsIcon({ colorfont: {...} })`。

---

## 顶层选项 / Top-level options

`graphicsIcon(options: GraphicsIconOptions): Plugin`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cacheDir` | `string` | 各子插件自身默认（`.cache.graphics`） | 共享缓存目录。设置后，为未显式指定缓存路径的子能力统一填充到此目录下（便于随仓库提交、团队共享）。 |
| `colorfont` | `ColorfontOptions \| false` | `undefined`（跳过） | 启用彩色 webfont。见 [colorfont 选项](#colorfont-选项)。 |
| `svgIcons` | `SvgIconsOptions \| false` | `undefined`（跳过） | 启用 SVG 雪碧图。见 [svgIcons 选项](#svgicons-选项)。 |
| `bitmapIcons` | `BitmapIconsOptions \| false` | `undefined`（跳过） | 启用位图雪碧图。见 [bitmapIcons 选项](#bitmapicons-选项)。 |
| `imagemin` | `ImageminPluginOptions \| false` | `undefined`（跳过） | 启用构建期图片压缩。见 [imagemin 选项](#imagemin-选项)。 |

**工作机制**：内部为每个被传入（且非 `false`）的子键实例化对应子插件，再把它们的钩子（`buildStart` / `configResolved` / `resolveId` / `load` / `configureServer` / `generateBundle` / `closeBundle` / `watchChange` / `handleHotUpdate`）多路复用到返回的这**一个**插件上。生成型能力在 `buildStart` 产出源；imagemin 在 `closeBundle` 压缩最终产物。

---

## colorfont 选项

把一组 SVG 图标编译成彩色图标 webfont。`colorFormat: 'auto'` 时一次产出 mono + COLRv0 + OT-SVG 共存的 `@font-face` 回退链，现代浏览器各取所能支持的最佳格式。

```ts
graphicsIcon({
  colorfont: { input: 'src/icons/color', outDir: 'src/fonts', fontName: 'AppIcons', colorFormat: 'auto' },
})
```

构建时字体会 emit 到产物目录的 `colorfont/` 下；样式与类型经虚拟模块提供：

```ts
import 'virtual:colorfont.css'                            // 注入 @font-face + .icon 基类
import { icons, type IconName } from 'virtual:colorfont'  // 图标名 → 类名映射 + 类型
```

**引擎选项（ColorfontOptions）**

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `input` | `string \| string[]` | — **必填** | SVG 图标源目录。 |
| `outDir` | `string` | — **必填** | 产物目录（也是码位锁文件的默认位置）。 |
| `fontName` | `string` | — **必填** | 字体名（同时用于产物文件名与 `font-family`）。 |
| `fontFamily` | `string` | = `fontName` | CSS `font-family`。 |
| `colorFormat` | `'mono' \| 'colrv0' \| 'otsvg' \| 'colrv1' \| 'auto'` | `'auto'` | 产出哪些字形档。`auto`：有彩色图标则产 mono+COLRv0+OT-SVG。 |
| `formats` | `('woff2' \| 'woff' \| 'ttf')[]` | `['woff2']` | 编码出的字体容器格式。 |
| `colrv0` | `boolean` | `true` | 是否额外产 COLRv0 平涂多色档。 |
| `unitsPerEm` | `number` | `1000` | 字体 em 单位。 |
| `ascender` | `number` | `round(unitsPerEm * 0.8)` | 上行高。 |
| `descender` | `number` | `ascender - unitsPerEm` | 下行高（通常为负）。 |
| `baseSelector` | `string` | `'.icon'` | CSS 基类选择器。 |
| `classPrefix` | `string` | `'icon-'` | 每图标类名前缀（`icon-foo`）。 |
| `woff2Quality` | `number` | `11` | WOFF2 压缩质量（0–11）。 |
| `threads` | `boolean \| 'auto'` | `'auto'` | 多线程预处理。`auto`：图标 ≥200 时启用。 |
| `codepointsFile` | `string` | `<outDir>/codepoints.json` | 码位锁文件（稳定 PUA 码位，建议提交）。 |
| `paStart` | `number` | `0xE000` | PUA 码位起始。 |
| `cache` | `boolean \| { dir: string }` | `undefined` | 构建级缓存（命中则跳过整条管线）。 |

**插件层附加选项**

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cssModuleId` | `string` | `'virtual:colorfont.css'` | 虚拟 CSS 模块 id。 |
| `apiModuleId` | `string` | `'virtual:colorfont'` | 虚拟 API 模块 id。 |
| `watch` | `boolean` | `true` | dev 期监听 `.svg` 源变更并热重载。 |
| `devFast` | `boolean` | `true` | dev 期 WOFF2 用 q9（更快，体积略大）。 |
| `emitDemo` | `boolean` | `false` | 构建时额外产出独立 CSS + 类型 API + 自包含画廊 HTML。 |

---

## svgIcons 选项

把一个目录的零散 SVG 编译成单个雪碧图（`<symbol>` + `<use href>`），并自动 id 作用域化、可选颜色改写、自产带类型的入口脚本。

```ts
graphicsIcon({
  svgIcons: {
    sprites: [
      { input: 'src/icons/svg', output: { svg: 'src/sprites/icons.svg', script: 'src/sprites/index.ts' }, color: true },
    ],
  },
})
```

```ts
import { iconsHref, iconsName, type IconName } from '@/sprites'
// <use :href="`${iconsHref}#${iconsName.foo}`" />
```

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cacheFile` | `string` | `.cache.graphics/svg-icons.json` | 插件级缓存文件（整插件一份）。 |
| `sprites` | `SvgIconsConfig[]` | — **必填** | 一组雪碧图配置；数组即生成多张。 |

**每组 `sprites[]`（SvgIconsConfig）**

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `input` | `string` | — **必填** | SVG 图标源目录。 |
| `output.svg` | `string` | — **必填** | 输出 sprite `.svg` 路径。 |
| `output.script` | `string` | `undefined` | 可选：自产入口脚本（`iconsHref` + `iconsName` + `IconName`）。 |
| `color` | `boolean \| string \| ((name, symbolId, color) => string\|false) \| null` | `undefined` | 颜色改写：`true` → fill/stroke 改 `currentColor`（可主题化）；字符串 → 指定颜色；函数 → 自定义。 |
| `normalize` | `boolean \| { width?: number }` | `undefined` | 可选 colorfont 风格归一化/缩放（`{ width }` 指定目标 viewBox 宽，默认 1024）。 |
| `iconNameTransformer` | `(name: string) => string` | 原样保留文件名 | 由源文件名生成 `<symbol>` id。 |
| `formatter` | `'svgo' \| 'prettier' \| 'oxfmt'` | `'oxfmt'` | 产物格式化器（不支持时优雅回退）。 |

---

## bitmapIcons 选项

用 sharp + maxrects-packer 把一个目录的位图打成单张雪碧图集，并生成样式（基类 + 每图自适应类）、入口脚本与可选坐标 JSON。

```ts
graphicsIcon({
  bitmapIcons: {
    sprites: [
      { inputDir: 'src/icons/png', prefix: 'icon', output: { image: 'src/sprites/sheet.webp', style: 'src/sprites/sheet.css', script: 'src/sprites/sheet.ts' } },
    ],
  },
})
```

```ts
import { iconsImage, type IconName } from '@/sprites/sheet' // 注入样式 + 给出图 URL 与类型
```

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cacheFile` | `string` | `.cache.graphics/bitmap-icons.json` | 插件级缓存文件（整插件一份）。 |
| `sprites` | `BitmapIconsConfig[]` | — **必填** | 一组图集配置；数组即生成多张。 |

**每组 `sprites[]`（BitmapIconsConfig）**

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `inputDir` | `string` | — **必填** | 源图目录（`*.sprite.{webp,png}` 产物自动排除出扫描，故可与源同目录）。 |
| `output.image` | `string` | — **必填** | 图集图片路径（扩展名 `.webp` 或 `.png`）。 |
| `output.style` | `string` | — **必填** | 样式文件路径（`url()` 用 image 相对路径）。 |
| `output.script` | `string` | `undefined` | 可选：入口脚本（相对 import 图与样式 + 导出坐标/`IconName`）。 |
| `output.json` | `string` | `undefined` | 可选：坐标 JSON（供 canvas/运行时）。 |
| `prefix` | `string` | `'sprite'` | CSS 类名前缀（基类 `.${prefix}` + 每图 `.${prefix}-${name}`）。 |
| `padding` | `number` | `2` | 精灵间隙（px），防相邻切片采样溢色。 |
| `pixelRatio` | `number` | `1` | 源图相对逻辑像素的倍率（@2x→2、@3x→3）。 |
| `maxWidth` / `maxHeight` | `number` | `4096` | 单张 sheet 最大宽/高（px）。 |
| `pot` | `boolean` | `false` | sheet 尺寸取 2 的幂。 |
| `square` | `boolean` | `false` | sheet 强制正方形。 |
| `png` | `sharp.PngOptions` | `{ compressionLevel: 9, adaptiveFiltering: true }` | image 为 `.png` 时透传 sharp。 |
| `webp` | `sharp.WebpOptions` | `{ quality: 80, effort: 6 }` | image 为 `.webp` 时透传 sharp。 |
| `include` | `string \| string[]` | `["**/*.{png,jpg,jpeg,webp,avif}"]` | 纳入的 glob（相对 inputDir）。 |
| `exclude` | `string \| string[]` | `[]` | 排除的 glob（优先级高于 include）。 |
| `nameTransformer` | `(basename: string) => string` | 原样 | 由源文件基础名生成精灵名（须匹配 `/^[a-zA-Z_][\w-]*$/`）。 |

---

## imagemin 选项

构建期图片压缩子插件：在 `closeBundle` 阶段枚举产物目录中的图片并就地压缩（sharp 处理位图、svgo 处理矢量，哈希缓存避免重复压缩）。

```ts
graphicsIcon({ imagemin: { enabled: true, webp: { quality: 82 } } })
```

`ImageminPluginOptions` = `Partial<ImageminOptions>` + `enabled`：

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 关闭则 `closeBundle` 不压缩（用于临时停用）。 |
| `include` | `string \| string[]` | `["**/*.{jpg,jpeg,png,gif,tif,tiff,webp,avif,svg}"]` | 纳入的图片 glob。 |
| `exclude` | `string \| string[]` | 见下※ | 排除的 glob（优先级高于 include）。 |
| `cacheFile` | `string` | `.cache.graphics/imagemin.json` | 内容哈希缓存（建议提交，团队共享）。 |
| `logStats` | `boolean` | `true` | 打印每张图压缩统计。 |
| `concurrency` | `number` | `8` | 并发数。 |
| `keepMetadata` | `boolean` | `false` | 保留 EXIF/ICC 等元数据。 |
| `rotate` | `boolean` | `false` | 按 EXIF 方位自动旋转。 |
| `sharpOptions` | `sharp.SharpOptions` | `undefined` | 透传 sharp 构造选项（如解除像素上限）。 |
| `resize` | `sharp.ResizeOptions` | `undefined` | 统一缩放（如限制最大宽度）。 |
| `png` | `sharp.PngOptions` | `{ palette: true, quality: 80, effort: 10, compressionLevel: 9 }` | PNG 压缩参数。 |
| `jpeg` / `jpg` | `sharp.JpegOptions` | `{ quality: 80, mozjpeg: true }` | JPEG 压缩参数。 |
| `webp` | `sharp.WebpOptions` | `{ quality: 80, effort: 6 }` | WEBP 压缩参数。 |
| `avif` | `sharp.AvifOptions` | `{ quality: 60, effort: 4 }` | AVIF 压缩参数。 |
| `tiff` | `sharp.TiffOptions` | `{ compression: 'lzw' }` | TIFF 压缩参数。 |
| `gif` | `sharp.GifOptions` | `{ effort: 10 }` | GIF 压缩参数。 |
| `svgSize` | `number \| false \| ((file, size) => number\|false)` | `1024` | SVG 归一化目标 viewBox 宽（放大后整数化，去小数不变形）。 |
| `svg` | `SvgoConfig` | `{ multipass: true, floatPrecision: 2, plugins: ['preset-default','removeDimensions','sortAttrs'] }` | svgo 矢量压缩配置。 |

> ※ `exclude` 默认排除 `node_modules`/`dist`/`.output`/`libs`/`vendor`/`third-party`、`*.min.*`，以及 SVG 雪碧图（`icons.svg` / `*.sprite.svg` / `*.sprites.svg`）和位图雪碧图产物（`*.sprite.png` / `*.sprite.webp`）。

---

## 单独使用：引擎函数 / Standalone engines

每个能力都可在 **Vite 之外**作为引擎函数直接 import 调用（用于脚本 / pre-commit / 自定义构建）：

```ts
import { colorfont, bitmapIcons, svgIcons, imagemin } from 'vite-plugin-graphics-icon'

await colorfont.buildAndWrite({ input: 'icons', outDir: 'fonts', fontName: 'AppIcons' })
await bitmapIcons.generate({ sprites: [{ inputDir: 'png', output: { image: 'sheet.webp', style: 'sheet.css' } }] })
await svgIcons.generate({ sprites: [{ input: 'svg', output: { svg: 'icons.svg' } }] })
await imagemin.optimizeImages(files, { ...imagemin.defaultOptions })
```

| 引擎 | 主要方法 | 说明 |
| --- | --- | --- |
| `colorfont` | `build(opts)` → `BuildResult`；`buildAndWrite(opts)`（落盘）；`runCli(argv)` | 构建彩色 webfont。 |
| `bitmapIcons` | `generate(opts)`（按 `sprites[]` 生成所有图集）；`runCli(argv)` | 生成位图雪碧图。 |
| `svgIcons` | `generate(opts)`（生成所有 SVG 雪碧图 + 脚本）；`runCli(argv)` | 生成 SVG 雪碧图。 |
| `imagemin` | `optimizeImages(files, opts)`；`defaultOptions`；`matchesAnyGlob` / `toGlobList`；`runCli(argv)` | 压缩图片。 |

## 单独使用：CLI / Standalone CLIs

安装后提供 4 个命令行（也可在 `package.json` scripts / lefthook 等钩子中调用）：

```bash
graphics-icon-colorfont build --input icons --out-dir fonts --font-name AppIcons
graphics-icon-bitmap   --config ./bitmap.config.ts   # 配置文件 default-export 一个含 sprites[] 的 BitmapIconsOptions
graphics-icon-svg      --config ./svg.config.ts       # 配置文件 default-export 一个含 sprites[] 的 SvgIconsOptions
graphics-icon-imagemin --all --config ./imagemin.config.ts   # 全量扫描；或传文件列表（pre-commit 暂存的图片）
```

| 命令 | 作用 | 主要参数 |
| --- | --- | --- |
| `graphics-icon-colorfont` | 构建/校验彩色 webfont | `build` / `check` 子命令、`--input` / `--out-dir` / `--font-name`、`--config <file>` |
| `graphics-icon-bitmap` | 生成位图雪碧图 | `--config <file>`（必填） |
| `graphics-icon-svg` | 生成 SVG 雪碧图 | `--config <file>`（必填） |
| `graphics-icon-imagemin` | 压缩图片（位图 sharp / 矢量 svgo） | `<files...>`（指定文件）或 `--all [目录...]`（全量扫描）、`--config <file>` |

---

## License

MIT
