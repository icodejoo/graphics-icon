---
name: graphics-icon
description: >-
  vite-plugin-graphics-icon(伞插件:colorfont + bitmap-icons + svg-icons + imagemin)的目的、
  结构、单插件合并、各引擎双形态(引擎+CLI)、共享缓存与易踩的点。在 D:\workspaces\colorfont 上维护
  packages/vite-plugin(伞聚合层 / 唯一发布产物)时参考本 skill。
---

# graphics-icon —— 四引擎合一的发布伞插件

## 目的
仓库里**唯一对外发布**的包(`vite-plugin-graphics-icon`)。用一套统一选项把四个引擎组合成**一个** Vite
插件,并**按需启用**:只有被传入且非 `false` 的子能力才会实例化。其余包(`@codejoo/colorfont`、
`bitmap-icons`、`svg-icons`、`@codejoo/imagemin`、`@codejoo/utils`)都是**私有内部实现**,tsup 构建时
通过 `noExternal` 内联进本包 `dist`。

## 功能(四子能力,均为「双形态」)
每个引擎都既能经本伞插件集成进 Vite,又能在 Vite 之外作为**引擎函数 + CLI** 单独用(与 imagemin 对齐)。
- **colorfont**:SVG 图标 → 彩色 webfont(mono/COLRv0/OT-SVG/COLRv1)。引擎 `@codejoo/colorfont`;插件壳
  `src/colorfont-plugin.ts` + `src/gallery.ts`(从 colorfont 拆出搬到本包)。
- **bitmap-icons**:位图 → 单张雪碧图集 + 样式 + 入口脚本。引擎 `generateBitmapSheets`;插件工厂 `bitmapIcons(opts): Plugin`。
- **svg-icons**:SVG 雪碧图(`<symbol>`+`<use href>`)。引擎 `generateSvgSprites`;插件工厂 `svgIcons(opts): Plugin[]`。
- **imagemin**:图片压缩(sharp + svgo,哈希缓存)。引擎 `optimizeImages`;Vite 插件形态 `imageminPlugin`。

## 单插件合并(核心:`graphicsIcon` 返回**单个** Plugin)
`graphicsIcon(options): Plugin`(**不再是 Plugin[]**)。内部按子键实例化各子插件(svg 工厂返回数组,会被展开),
再用 `mergePlugins(name, subs)` 把同名钩子**多路复用**到一个 Plugin 上:
- `FANOUT_HOOKS`(config/configResolved/configureServer/buildStart/buildEnd/generateBundle/closeBundle/
  watchChange/handleHotUpdate)→ 依次调用每个实现了该钩子的子插件。
- `FIRST_DEFINED_HOOKS`(resolveId/load)→ 返回首个非空结果(仅 colorfont 用虚拟模块)。
- 顺序:svg → bitmap → colorfont(buildStart 产源)→ imagemin(closeBundle 压缩最终产物)。
- 消费方:`plugins: [graphicsIcon({...})]`(**不要展开**)。

## 对外导出面(收口:只 graphicsIcon + 各引擎)
`src/index.ts`:
- 默认导出 `graphicsIcon`。
- **引擎对象**(Vite 之外单独用):`colorfont`({build, buildAndWrite, runCli})、`bitmapIcons`({generate, runCli})、
  `svgIcons`({generate, runCli})、`imagemin`(=@codejoo/imagemin 命名空间:optimizeImages/defaultOptions/runCli/…)。
- 选项类型再导出:`ColorfontOptions`、`BitmapIconsOptions`、`SvgIconsOptions`(+`GraphicsIconOptions`/`ImageminPluginOptions`)。
- **不再导出**单独的 Vite 子插件工厂(`bitmapIcons`/`svgIcons`/`colorfont` 作为插件)——它们已收为内部,统一经 `graphicsIcon`。

## CLI bin(4 个,薄包装各引擎 runCli)
package.json `bin`:`graphics-icon-{imagemin,bitmap,svg,colorfont}` → `src/bin{,-bitmap,-svg,-colorfont}.ts`。
- bitmap/svg:`--config <file>`(default-export 含 `sprites[]` 的选项)。
- imagemin:`<files...>` 或 `--all [目录...]` + `--config`。
- colorfont:`build`/`check` 子命令 + `--input/--out-dir/--font-name`。
tsup `entry` 含全部 5 个入口;bin 源带 `#!/usr/bin/env node`。

## 统一选项 `GraphicsIconOptions`
- `cacheDir?` —— 共享缓存目录。
- `colorfont?: ColorfontOptions | false`(`ColorfontOptions` 在 `colorfont-plugin.ts` 定义,extends 引擎选项
  `ColorfontEngineOptions`,命名与 BitmapIconsOptions/SvgIconsOptions 一致)。
- `bitmapIcons?: BitmapIconsOptions | false`
- `svgIcons?: SvgIconsOptions | false`
- `imagemin?: ImageminPluginOptions | false`(`= Partial<ImageminOptions> & { enabled? }`)

## 共享缓存
- bitmap-icons/svg-icons/imagemin 接受全路径 `cacheFile` → `withCacheFile(opts, name, cacheDir)`:仅当 `cacheDir`
  给定且未显式 `cacheFile` 时填 `<cacheDir>/<name>.json`。
- colorfont 用目录级 `cache?: boolean | { dir }` → `withCacheDir`。

## 类型自包含(dts.resolve)
`tsup.config.ts` 的 `dts: { resolve: [/^bitmap-icons/, /^svg-icons/, /^@codejoo\//] }` 把私有子包的选项类型**内联**进
本包 `.d.ts`,否则发布后消费方无法解析这些类型导入。`imagemin` 引擎里 `@codejoo/utils/glob` 的两个 glob 函数仍会
以 re-export 形式残留(rollup-plugin-dts 把纯 re-export 收敛到源头),但无消费方对其做类型使用,无害。

## 易踩的点
- `graphicsIcon` 现返回**单个** Plugin:`plugins: [graphicsIcon({...})]`,别再 `...` 展开(展开非可迭代对象会炸)。
- `svgIcons(opts)` 工厂仍返回 **Plugin[]**,但这是**内部**用法;对外只经 `graphicsIcon({ svgIcons })`。
- colorfont 插件选项类型叫 `ColorfontOptions`(在 `colorfont-plugin.ts`),引擎同名类型在 import 处别名为
  `ColorfontEngineOptions`;别再用旧名 `VitePluginColorfontOptions`。
- 第三方运行时依赖(svgo/svgpath/sharp/maxrects-packer/vite-plugin-icons-spritesheet/scale-that-svg/cubic2quad/
  opentype.js/svg2ttf/ttf2woff)在本包 `dependencies`(tsup 内联 workspace 源后它们仍 external,故需自带)。
  **`fflate` 已移除**(引擎未用)。`vite` 为 peer。
- wasm 的 woff2/colrv1 由 `scripts/copy-wasm.mjs` 从 colorfont 的 crate `pkg` 拷入 `dist/{woff2,colrv1}`。
- colorfont 引擎自身有既有(opentype.js/cubic2quad/ttf2woff 无类型等)报错,非本伞层引入;本伞层 `src/*` 必须零报错。
