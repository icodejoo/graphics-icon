# AGENTS.md — graphics-icon 速查(给智能体)

pnpm monorepo,对外只发布一个包 `graphics-icon`(`packages/exports`),其余包都是 private,经 tsup `noExternal` 内联进它的 dist。Node ≥ 24,pnpm 10,TypeScript 6(**别升 7**:TS 7 没有 JS API,tsup / rollup-plugin-dts 的类型构建会失败)。

## 命令(都在仓库根)

```bash
pnpm install            # 允许非 frozen;CI 用 --frozen-lockfile
pnpm build              # 先建各引擎包,再建发布包 graphics-icon(顺序不能反:发布包的 DTS 要引擎包的 dist)
pnpm typecheck          # 每个包 tsc --noEmit(src + scripts + test)
pnpm test               # = build + 各包测试 + 发布包验收
```

单包测试:`cd packages/<pkg> && pnpm test`(`node --experimental-strip-types xxx.test.ts`,Node 24 直接跑 .ts,无测试框架,自带 `check()` 计数)。

## 包与职责

| 包 | 职责 |
|---|---|
| `packages/exports` | **唯一发布物** `graphics-icon`:子路径 `/vite`(伞插件)、`/colorfont`、`/svg`、`/bitmap`、`/imagemin`、`/unused`、`/used-icons`、`/used-icons/client`(类型),外加 5 个 CLI |
| `packages/vite-plugin` | 伞插件 `graphicsIcon`(把 colorfont / svg / bitmap / imagemin / unused 合成一个 Vite 插件)。钩子多路复用只转发 `load` 等,**丢弃返回值**,所以虚拟模块插件不能放进来 |
| `packages/color-fonts` | SVG → 字体引擎(mono / COLRv0 / OT-SVG / COLRv1),`build` / `buildAndWrite` / `buildFromIcons`(内存版),`outline/stroke.ts` 把描边图标展开成填充轮廓 |
| `packages/used-icons` | **独立** Vite 插件:扫描类名,只把用到的图标打进字体(见下) |
| `packages/svg-icons` `bitmap-icons` `imagemin` `unused` `utils` | SVG 雪碧图 / 位图图集 / 图片压缩 / 无用文件检测 / 公共模块 |

每个包的更细说明看它自己的 `SKILL.md` / `README.md`;架构与选型抉择看 `.claude/skills/colorfont-plugin/SKILL.md`。

## used-icons 用法(最常被问到)

```ts
// vite.config.ts —— 第一个参数是图标集数组,第二个是共用选项
import usedIcons from 'graphics-icon/used-icons'
plugins: [usedIcons([{ collect: 'lucide', iconPrefix: 'lucide-' }], { /* 共用选项 */ })]

// 入口 import 一次(类型:/// <reference types="graphics-icon/used-icons/client" />)
import 'virtual:used-icons.css'
```

```html
<i class="lucide-sun"></i>     <!-- 类名 = iconPrefix + 图标名;不用再加基类 -->
```

- **图标集** `{ collect, iconPrefix?, dir? }`:`collect` 对应 `@iconify-json/<collect>`(需在项目里装);`iconPrefix` 默认 `<collect>-`,与集合名独立(`{ collect:'lucide', iconPrefix:'i-' }` → `i-sun`),各前缀不能相同;`dir` 指本地 SVG 目录(文件名即图标名,不再读 `@iconify-json`)。数组省略 → 取 package.json 里的全部 `@iconify-json/*`,没装则 lucide。
- **共用选项**:`safelist`(运行时拼接的完整类名,支持 `*` 通配)、`include`(额外扫描的 glob:CMS JSON / 后端模板)、`warn`、`extraProperties`、`scale`、`inlineLimit`(默认 16 KB,小于它内联为 data URI,否则单独输出 woff2 + preload)、`customData`(VS Code 类名提示路径,`false` 关闭)、`fontName`、`colorFormat`、`woff2Quality`。
- **机制**:开发期在 `transform`(pre)/`transformIndexHtml` 扫源码 → 登记 → 防抖 `reloadModule`;构建期放占位规则,`generateBundle`(order `'post'`,等 Vite 发射 HTML 之后)扫最终 JS chunk 与 HTML 的类名,再整条替换占位。SSR 构建跳过。字体走 `color-fonts` 的 `buildFromIcons`;类规则由插件自己按类名写,只取引擎的 `@font-face`。
- **限制**:运行时拼的类名必须进 `safelist`;描边路径上的 `stroke-dasharray` / `transform` 不支持;开发期不再使用的图标要重启才清掉。
- 改这个插件时跑 `cd packages/used-icons && pnpm test`(真实 vite build + dev server);发布形态由 `packages/exports/test/acceptance-dist.ts` 覆盖。

## 其他能力的最小用法

```ts
import graphicsIcon from 'graphics-icon/vite'
graphicsIcon({
  colorfonts: { items: [{ sources: 'src/icons/color', output: { dir: 'src/fonts', fontName: 'AppIcons', name: 'AppIcons' } }] }, // 实物落盘,用普通 import 消费
  svgIcons:   { items: [{ sources: 'src/icons/svg', output: { dir: 'src/sprites', name: 'icons' } }] },
  bitmapIcons:{ items: [{ sources: 'src/icons/png', output: { dir: 'src/sprites', name: 'sheet' } }] },
  imagemin:   { enabled: true },
})
```

三个引擎都是 `{ ...公共, items: [...] }` 多实例;`cache` / `throwable` 按实例;缓存落 `.cache.graphics/`。完整选项见 `packages/exports/README.md`。

## 约定与坑

- **文档与注释用中文**;新增函数 / 类型带一句中文 JSDoc;同一字面量出现 2 次以上提成常量;新功能配测试(沿用各包自带的 `check()` 风格)。
- **新增依赖前先确认**;版本放 `pnpm-workspace.yaml` 的 `catalog:` 的统一引用,私有包之间用 `workspace:*`。
- **测试生成物不入库**(`.cache.graphics/`、`packages/exports/test/app/.gen/`、`.used-icons-test-tmp/` 等已在 `.gitignore`)。
- 发布包新增子路径:同时改 `packages/exports/package.json` 的 `exports`、`tsup.config.ts` 的 `entry` 与 `noExternal`、`src/<name>.ts`;外部依赖要写进它的 `dependencies`(如 `pathkit-wasm`、`@iconify/utils`)。
- Windows:路径用正斜杠;正则写进 TS 模板字符串时反斜杠要双写(`\\w` 才是正则里的 `\w`),改完用 `used-icons` 的测试验证。
- `pathkit-wasm` 是旧 Emscripten 产物,在 Node 24 下必须显式传 `wasmBinary`,否则会误走 `fetch`(已在 `color-fonts/src/outline/stroke.ts` 处理)。
