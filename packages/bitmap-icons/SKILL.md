---
name: bitmap-icons
description: 在 D:\workspaces\colorfont 上维护 bitmap-icons 时参考。位图雪碧图引擎:用 sharp + maxrects-packer 把 png/jpg/webp/avif 打成单张图集,产出自适应样式、入口脚本(含 IconName 类型)与可选坐标 JSON。双形态(引擎 bitmapIcons + CLI runCli + 内部 Vite 插件工厂,经发布包 graphics-icon 的子路径 graphics-icon/bitmap 与 bitmap-icons CLI 对外)。多实例 items[],按实例 cache/throwable。涉及共享 @codejoo/utils、buildStamp 指纹、共享缓存目录 .cache.graphics(统一 groupCache)、sharp 按需动态导入、单 bin 与不旋转约束、幂等写入等关键考量时阅读本文。
---

# bitmap-icons

## 目的

`bitmap-icons`(私有内部包)把一个目录下的位图(png/jpg/jpeg/webp/avif)打包成「一张」雪碧图集,并自动生成调用方直接可用的边车文件。它是 graphics-icon monorepo 中四个引擎之一,与 colorfont、svg-icons、imagemin 共享 `@codejoo/utils`,经发布包 `graphics-icon`(packages/exports)的子路径 `graphics-icon/bitmap` 与 CLI `bitmap-icons` 对外。

**双形态**(与 imagemin 对齐):
- 引擎 `bitmapIcons(options)`(Vite 之外一次性生成所有图集;经子路径 `graphics-icon/bitmap` 导入)。
- CLI `runCli`(经发布包 bin `bitmap-icons --config <file>`)。
- 内部 Vite 插件工厂 `bitmapIconsVite(opts): Plugin`(经 `graphicsIcon({ bitmapIcons })` 集成,不单独对外导出)。

## 功能

- 枚举源图 → sharp 量测尺寸 → 内容指纹缓存判定 → maxrects-packer 打包 → sharp 合成到透明 RGBA 画布 → 编码(webp/png)。
- **四产物恒产**(路径全由 `output.{dir,name}` 派生):
  - 图集:`{dir}/{name}.{format}`(`format ∈ 'webp'|'png'`,默认 `'webp'`,**由 `output.format` 决定,不再看扩展名**)。
  - 样式:`{dir}/{name}.css`(**只产 css,scss 已砍**):基类 `.${classPrefix}` + 每图类 `.${classPrefix}${classSeparator}${name}`(默认 `.icon` / `.icon-home`),带 px 默认尺寸 + `aspect-ratio` + 百分比 `background-size`/`background-position`,改 width 即按容器自适应。类名派生统一走 `@codejoo/utils/class-names` 的 `deriveClassNames`。
  - 入口脚本:`{dir}/{name}.{ts?ts:js}`(`ts` 默认 true)。相对 `import` 样式(副作用注入)与图(Vite 解析为带 hash 的 URL),导出 `iconsImage`、`iconsName`;`.ts` 额外产 `IconName` 字面量联合类型,`.js` 仅运行时对象无类型。
  - 坐标 JSON:`{dir}/{name}.json` = `{ image, width, height, pixelRatio, frames }`,供 canvas/运行时。
- 所有文本产物(css/ts/js)头部加 `@codejoo/utils/banner` 的双语「自动生成、请勿修改」banner;JSON 纯数据无 banner。
- 多实例 `{ ...公共, items: [...] }` 可生成多张独立图集(公共参数合并进每项,每实例独立缓存/产物);每项 `sources: string | string[]`(支持多源目录,合并打进同一张图)。
- Vite 钩子:`buildStart`(build/dev 启动都跑)、`watchChange` / `handleHotUpdate`(仅当变更落在某 `sources` 内才重生成)。失败行为由每实例 `throwable` 决定(默认 true 抛错中止,false 告警续跑)。

## 用法(示例)

```ts
// vite.config.ts —— 经伞包统一出口(单个插件)
import graphicsIcon from "graphics-icon/vite"

export default {
  plugins: [
    graphicsIcon({
      // 省略 cacheName → .cache.graphics/<派生名>.json;cache:false 删缓存重建;throwable:false 告警续跑
      bitmapIcons: { items: [
        {
          sources: "src/sprites/common",      // string | string[](支持多源目录)
          classPrefix: "icon",                // 裸词,默认 'icon'(基类 .icon)
          classSeparator: "-",                // 默认 '-'(每图 .icon-home)
          padding: 2,
          pixelRatio: 1,                       // 源图为 @2x/@3x 时改 2/3
          output: {
            dir: "src/sprites",                // 输出目录
            name: "common",                    // 产物基名,派生 common.webp/.css/.ts/.json
            format: "webp",                    // 'webp' | 'png',默认 webp
            ts: true,                          // 默认 true;false → 产 .js 无类型
          },
        },
      ] },
    }),
  ],
}
```

单独使用(Vite 之外):`import { bitmapIcons } from "graphics-icon/bitmap"`（私有包名 `bitmap-icons` 仅 monorepo 内部用）。

调用方:

```ts
import { iconsImage, type IconName } from "@/sprites/common"
// 样式已被脚本副作用注入;按 IconName 用类名 <i class="icon icon-foo" />
```

## 关键考量

- **共享 utils**:`buildStamp`(`@codejoo/utils/fingerprint`,缓存指纹约定,与 svg-icons 同源)、`toGlobList`/`matchesAnyGlob`、`writeTextIfChanged`/`writeBufferIfChanged`、`deriveClassNames`(`@codejoo/utils/class-names`,与 color-fonts 共用的类名派生)、`autoGenBanner`(`@codejoo/utils/banner`,文本产物头注释),以及统一的 **`groupCache`**(`@codejoo/utils`,管多实例缓存)全部来自 `@codejoo/utils`(`workspace:*`)。不要在本包重新实现这些原语。跨包导入「不带」文件扩展名;包内相对导入「必须」带 `.ts`。
- **按实例缓存 + 共享缓存目录 `.cache.graphics`**:每个 `items[]` 项一套独立缓存,经统一 `groupCache` 管理(原子写:temp+rename;JSON 损坏告警而非静默)。缓存文件名 Vite 用 `cacheName`(仅文件名,落 `.cache.graphics/`)、独立用 `cacheFilename`(全路径);省略则按 `output.name` 派生。`configHash` 纳入 `classPrefix`/`classSeparator`/`name`/`ts`/`format` 等影响产物的选项,变更即失效。`cache:false` 删该实例缓存 + 旧产物并重建。(旧的插件级 `cacheDir`、全路径 `cacheFile`、`resolveCacheFile`/`pruneCache` 三件套已被 `groupCache` 取代。)
- **sharp 按需动态导入**:`sharp` 与 `maxrects-packer` 用 `await import()` 在 `generateSheet` 内部加载,绝不在模块顶层。仅 `import { bitmapIconsVite }` 不会拉起/分配这些重依赖。
- **`allowRotation: false`**:CSS background 切片不能旋转,打包器强制不旋转。
- **单 bin 约束**:必须落「一个」bin;单图超 `maxWidth×maxHeight` 或总量放不下 → 明确报错,绝不静默拆成多张。
- **幂等写入**:图与文本边车都「内容/字节未变则跳过」,避免无谓 mtime/git 抖动与 dev HMR 循环。

## 易踩的点

- 产物命名约定 `*.sprite.{webp,png}` 会被自动排除出源扫描,所以产物可与源图放同目录;别给源图取这个名字。
- 源图按文件名排序后再打包,保证跨机器布局可复现;改名会改布局/缓存。
- 精灵名须匹配 `/^[a-zA-Z_][\w-]*$/`,且不能重名(重名校验跨所有 `sources` 目录),否则抛错。
- 图集格式由 `output.format`(`'webp'|'png'`,默认 `'webp'`)决定,**不再由扩展名推断**。
- 空输入默认抛错(走 `throwable`,`false` 告警续跑);输入读失败会传播;worker 回退前告警。
- `GENERATOR_VERSION`/`CACHE_VERSION` 控制产物结构版本:改了样式/脚本/JSON/格式生成逻辑要 +1 让旧缓存失效。
- TS 产物导出名固定为 `iconsImage`/`iconsName`/`IconName`,不随 `classPrefix` 变。
- `pixelRatio` 只影响固定 px 类(逻辑尺寸 = 源尺寸 / pixelRatio);自适应类天然与密度无关。
- 改动需经 monorepo 中心校验(`pnpm install`/build/tsc 由父级统一跑),本包不单独装/构建。
