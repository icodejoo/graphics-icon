---
name: bitmap-icons
description: 在 D:\workspaces\colorfont 上维护 bitmap-icons 时参考。位图雪碧图引擎:用 sharp + maxrects-packer 把 png/jpg/webp/avif 打成单张图集,产出自适应样式、入口脚本(含 IconName 类型)与可选坐标 JSON。双形态(引擎 generateBitmapSheets + CLI runCli + 内部 Vite 插件工厂,统一经伞包 vite-plugin-graphics-icon 出口)。涉及共享 @codejoo/utils、buildStamp 指纹、共享缓存目录 .cache.graphics、sharp 按需动态导入、单 bin 与不旋转约束、幂等写入等关键考量时阅读本文。
---

# bitmap-icons

## 目的

`bitmap-icons`(私有内部包)把一个目录下的位图(png/jpg/jpeg/webp/avif)打包成「一张」雪碧图集,并自动生成调用方直接可用的边车文件。它是 graphics-icon monorepo 中四个引擎之一,与 colorfont、svg-icons、imagemin 共享 `@codejoo/utils`,统一经伞包 `vite-plugin-graphics-icon` 对外。

**双形态**(与 imagemin 对齐):
- 引擎 `generateBitmapSheets(options)`(Vite 之外一次性生成所有图集)。
- CLI `runCli`(经伞包 bin `graphics-icon-bitmap --config <file>`)。
- 内部 Vite 插件工厂 `bitmapIcons(opts): Plugin`(经 `graphicsIcon({ bitmapIcons })` 集成,不单独对外导出)。

## 功能

- 枚举源图 → sharp 量测尺寸 → 内容指纹缓存判定 → maxrects-packer 打包 → sharp 合成到透明 RGBA 画布 → 编码(webp/png)。
- 产边车:
  - 样式(.css/.scss):基类 `.${prefix}` + 每图类 `.${prefix}-${name}`,带 px 默认尺寸 + `aspect-ratio` + 百分比 `background-size`/`background-position`,改 width 即按容器自适应。
  - 入口脚本(.ts/.js):相对 `import` 样式(副作用注入)与图(Vite 解析为带 hash 的 URL),导出 `iconsImage`、`iconsName`;`.ts` 额外产 `IconName` 字面量联合类型。
  - 可选坐标 JSON:`{ image, width, height, pixelRatio, frames }`,供 canvas/运行时。
- 数组形式 `sprites: [...]` 可生成多张独立图集。
- Vite 钩子:`buildStart`(build/dev 启动都跑)、`watchChange` / `handleHotUpdate`(仅当变更落在某 `inputDir` 内才重生成)。build 下硬失败、dev 下单组失败仅告警。

## 用法(示例)

```ts
// vite.config.ts —— 经伞包统一出口(单个插件)
import graphicsIcon from "vite-plugin-graphics-icon"

export default {
  plugins: [
    graphicsIcon({
      // 省略 cacheFile → .cache.graphics/bitmap-icons.json
      bitmapIcons: { sprites: [
        {
          inputDir: "src/sprites/common",
          prefix: "icon",
          padding: 2,
          pixelRatio: 1, // 源图为 @2x/@3x 时改 2/3
          output: {
            image: "src/sprites/common.sprite.webp",
            style: "src/sprites/common.sprite.css",
            script: "src/sprites/common.sprite.ts",
            json: "src/sprites/common.sprite.json",
          },
        },
      ] },
    }),
  ],
}
```

单独使用(Vite 之外):`import { generateBitmapSheets } from "bitmap-icons"`（或经伞包 `import { bitmapIcons } from "vite-plugin-graphics-icon"` → `bitmapIcons.generate(opts)`）。

调用方:

```ts
import { iconsImage, type IconName } from "@/sprites/common.sprite.ts"
// 样式已被脚本副作用注入;按 IconName 用类名 <i class="icon icon-foo" />
```

## 关键考量

- **共享 utils**:`buildStamp`(`@codejoo/utils/fingerprint`,缓存指纹约定,与 svg-icons 同源)、`toGlobList`/`matchesAnyGlob`、`writeTextIfChanged`/`writeBufferIfChanged`、`loadCache`/`saveCache`/`pruneCache`/`resolveCacheFile` 全部来自 `@codejoo/utils`(`workspace:*`)。不要在本包重新实现这些原语。跨包导入「不带」文件扩展名;包内相对导入「必须」带 `.ts`。
- **共享缓存目录 `.cache.graphics`**:缓存文件经 `resolveCacheFile("bitmap-icons", options.cacheFile)` 解析,默认落 `.cache.graphics/bitmap-icons.json`(随仓库提交 → 团队共享)。缓存键 = `output.image`。`pruneCache(cacheFile, configs.map(c => c.output.image), "[bitmap-icons]")` 在启动时剪枝失效条目。
- **sharp 按需动态导入**:`sharp` 与 `maxrects-packer` 用 `await import()` 在 `generateSheet` 内部加载,绝不在模块顶层。仅 `import { bitmapIcons }` 不会拉起/分配这些重依赖。
- **`allowRotation: false`**:CSS background 切片不能旋转,打包器强制不旋转。
- **单 bin 约束**:必须落「一个」bin;单图超 `maxWidth×maxHeight` 或总量放不下 → 明确报错,绝不静默拆成多张。
- **幂等写入**:图与文本边车都「内容/字节未变则跳过」,避免无谓 mtime/git 抖动与 dev HMR 循环。

## 易踩的点

- 产物命名约定 `*.sprite.{webp,png}` 会被自动排除出源扫描,所以产物可与源图放同目录;别给源图取这个名字。
- 源图按文件名排序后再打包,保证跨机器布局可复现;改名会改布局/缓存。
- 精灵名须匹配 `/^[a-zA-Z_][\w-]*$/`,且不能重名,否则抛错。
- `output.image` 扩展名只接受 `.webp` 或 `.png`,其余报错。
- `GENERATOR_VERSION` 控制产物结构版本:改了样式/脚本生成逻辑要 +1 让旧缓存失效。
- TS 产物导出名固定为 `iconsImage`/`iconsName`/`IconName`,不随 `prefix` 变。
- `pixelRatio` 只影响固定 px 类(逻辑尺寸 = 源尺寸 / pixelRatio);自适应类天然与密度无关。
- 改动需经 monorepo 中心校验(`pnpm install`/build/tsc 由父级统一跑),本包不单独装/构建。
