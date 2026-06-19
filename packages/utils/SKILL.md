---
name: graphics-utils
description: >-
  @codejoo/utils(graphics-to-font 套件的公共子模块(packages/utils))的目的、功能与用法。
  在 D:\workspaces\colorfont 上为 bitmap-sprite / imagemin / svg-sprite 抽取或修改公共函数、
  缓存原语、共享缓存目录或 SVG 缩放/归一化逻辑时参考本 skill。
---

# @codejoo/utils —— 公共子模块(utils 工程)

## 目的
四个引擎(colorfont / bitmap-icons / svg-icons / imagemin)有大量相似逻辑(哈希、指纹、glob、幂等写入、
缓存读写/剪枝、相对路径、SVG 缩放)。本包把它们抽成「一处实现、多处复用」的内部子模块,
消除重复、统一行为。`private`,不发布,仅供 monorepo 内 `workspace:*` 引用(其类型在伞包打包时内联)。

## 功能(子路径导出)
- `./hash` — `sha256(buf|string)`:缓存指纹同源。
- `./fingerprint` — `buildStamp(config, files)`:缓存 stamp 约定 `sha256(JSON.stringify(config) + 每文件 "rel:sha256(内容)" 行)`,svg-icons / bitmap-icons 同源(字节一致)。
- `./glob` — `toGlobList`、`matchesAnyGlob`:include/exclude 归一+匹配(正斜杠,兼容 Windows)。
- `./path-rel` — `relTo(from,to)`:`url()`/`import` 相对路径。
- `./fs-write` — `writeTextIfChanged`、`writeBufferIfChanged`:内容未变不落盘。
- `./cache` — `resolveCacheFile`、`loadCache`、`saveCache`、`pruneCache`、`CACHE_DIR`。
- `./scale-svg` — `scaleSvgToWidth`(scale-that-svg 委托放大)、`normalizeSvg`(与 colorfont 对齐)。

## 用法
```ts
import { resolveCacheFile, loadCache, saveCache, pruneCache } from "@codejoo/utils/cache"
import { normalizeSvg, scaleSvgToWidth } from "@codejoo/utils/scale-svg"
```

## 关键考量
- **共享缓存目录**:`CACHE_DIR = ".cache.graphics"`。`resolveCacheFile(defaultName, custom?)`:
  省略→`.cache.graphics/<defaultName>.json`;裸名→仍落共享目录;含分隔符→完整路径。
  各插件默认名 = 子项目名(`bitmap-sprite`/`imagemin`/`svg-sprite`)。
- **按需加载/不占内存**:`svgo`/`svgpath`/`scale-that-svg` 一律在 `scale-svg` 内部 `await import()`,
  仅调用缩放时才加载;配合子路径导出,未用模块不进内存。改这里时务必保持动态导入,勿提到顶层。
- **缓存键排序**:`saveCache` 按字母序写出 + 结尾换行 → git diff 稳定。
- **normalizeSvg 是单一事实来源**:`normalizeSvg`(svgpath 放大 viewBox 到 1024 → svgo floatPrecision:0 整数化)
  现为**唯一实现**,colorfont 引擎(`prepare-core.ts`)与 svg-icons 的 scale 能力都**复用本函数**(原 colorfont 自带的
  同名实现已删除)。因其惰性 import svgo/svgpath,故为 async,colorfont 的 `prepareOne` 也随之 async。改归一化策略只改这里。
- **幂等写入**:所有产物写入走 `writeXxxIfChanged`,避免 dev 下自触发 HMR 循环。

## 易踩的点
- 改导出的子路径必须同步更新 `package.json` 的 `exports` 映射,否则消费方解析失败。
- 动态导入的库仍需列入本包 `dependencies`(走 catalog),否则运行时找不到。
