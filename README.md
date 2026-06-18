# colorfont

把一组 SVG 图标编译成图标 webfont(woff2/woff),纯 JS、零后端、零 node-gyp,自带 `tech()` 回退链 CSS、类型安全 TS 入口、稳定码位。

## 能力档位

| flavor | 说明 | 写出 |
|---|---|---|
| `mono` | 单色 glyf 轮廓(终极回退,永远生成) | opentype.js(纯 JS) |
| `colrv0` | COLRv0 + CPAL 平涂彩色(全浏览器) | opentype.js(纯 JS) |
| `otsvg` | OT-SVG 内嵌(Safari/Firefox) | opentype.js `makeSvgTable`(纯 JS) |
| `colrv1` | COLRv1 渐变(Chrome/Edge/FF)**opt-in** | JS 前端产 paint 树 → Rust `write-fonts` 编 wasm 写表 |

COLRv1 与 OT-SVG **共存**(Safari 不渲染 COLRv1,Chromium 不渲染 OT-SVG),`tech()` 回退链让浏览器各取所需。

## 包结构

- `@colorfont/core` — 框架无关生成引擎(纯计算,不落盘)
- `vite-plugin-colorfont` — Vite 插件薄封装(虚拟模块 + HMR)
- `@colorfont/cli` — 命令行
- `colrv1-writer`(crate)— Rust→wasm 薄写表后端(paint 树 JSON → COLR/CPAL 字节),仅 colrv1 opt-in 时加载

## 开发状态

按增量构建中。增量 1:`mono` flavor 端到端跑通(SVG → glyf → woff2/woff + CSS + TS 入口 + codepoints)。
