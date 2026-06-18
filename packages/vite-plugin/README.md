# vite-plugin-colorfont

> Compile a folder of **SVG icons → a color icon webfont** at build time, with a `tech()` fallback `@font-face`, a typed virtual module, and stable codepoints. **Pure JS, no `node-gyp`.**

One `colorFormat: 'auto'` turns a directory of SVGs into up to four font “flavors” that coexist in one `@font-face` fallback chain — modern browsers pick the best they support:

| flavor | what | browsers | written by |
|---|---|---|---|
| `mono` | single‑color `glyf` outlines (always emitted, ultimate fallback) | all | opentype.js (pure JS) |
| `colrv0` | flat‑color `COLR`/`CPAL` layers | all (incl. Safari) | opentype.js (pure JS) |
| `otsvg` | embedded `SVG ` table (gradients, full SVG) | Safari / Firefox | opentype.js (pure JS) |
| `colrv1` | gradient/transform/composite `COLR` v1 — **opt‑in** | Chrome/Edge 98+, Firefox 107+ | Rust `write-fonts` → wasm (bundled) |

> COLRv1 and OT‑SVG are **complementary**: Safari doesn’t render COLRv1, Chromium never renders OT‑SVG. The generated `@font-face` lists `tech(color-colrv1) → tech(color-svg) → tech(color-colrv0) → mono` so each engine takes what it supports; non‑`tech()` browsers fall back to a plain mono `@font-face`.

## Install

```bash
npm i -D vite-plugin-colorfont
# vite is a peer dependency (^5 || ^6 || ^7 || ^8)
```

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import colorfont from 'vite-plugin-colorfont'

export default defineConfig({
  plugins: [
    colorfont({
      input: 'src/icons',        // folder of *.svg
      outDir: 'src/.colorfont',  // where codepoints.json is kept (commit it!)
      fontName: 'MyIcons',
      colorFormat: 'auto',       // mono + (colrv0 + otsvg) when any icon is multicolor
    }),
  ],
})
```

```ts
// in your app entry
import 'virtual:colorfont.css'                 // injects @font-face + .icon-* rules
import { iconClass, type IconName } from 'virtual:colorfont'

const name: IconName = 'home'                  // type-safe; typo = compile error
el.className = `icon ${iconClass[name]}`       // <i class="icon icon-home"></i>
```

```html
<i class="icon icon-home"></i>
<i class="icon icon-logo-color"></i>   <!-- renders in color where supported -->
```

## Options

| option | type | default | notes |
|---|---|---|---|
| `input` | `string \| string[]` | — | icon source dir(s) (`*.svg`) |
| `outDir` | `string` | — | where `codepoints.json` is written |
| `fontName` | `string` | — | OpenType family / `@font-face` family |
| `colorFormat` | `'auto'\|'mono'\|'colrv0'\|'otsvg'\|'colrv1'` | `'auto'` | per‑icon detection; see flavors above |
| `formats` | `('woff2'\|'woff'\|'ttf')[]` | `['woff2']` | output containers |
| `baseSelector` | `string` | `'.icon'` | base class carrying `font-family` |
| `classPrefix` | `string` | `'icon-'` | per‑icon class prefix → `.icon-home` |
| `unitsPerEm` | `number` | `1000` | em grid |
| `palette` | `{ mode?, named?, defaultIndex? }` | — | CPAL palettes / `@font-palette-values` themes |
| `codepointsFile` | `string` | `<outDir>/codepoints.json` | **commit this** for stable codepoints |
| `cssModuleId` | `string` | `'virtual:colorfont.css'` | virtual CSS id |
| `apiModuleId` | `string` | `'virtual:colorfont'` | virtual typed‑API id |
| `watch` | `boolean` | `true` | dev: rebuild + HMR on icon change |

## Typing the virtual modules

Add to a `*.d.ts` in your project:

```ts
declare module 'virtual:colorfont.css'
declare module 'virtual:colorfont' {
  export const codepoints: Record<string, number>
  export const iconClass: Record<string, string>
  export const baseClass: string
  export const colorIcons: string[]
  export function iconContent(name: string): string
}
```

## Stable codepoints

Icons are assigned Unicode PUA codepoints (from `0xE000`) recorded in `codepoints.json`. **Commit this file** — added icons get the next free codepoint and removed icons keep theirs (tombstoned, never recycled), so a glyph’s codepoint never changes meaning across releases. Use `@colorfont/cli check` in CI to fail on uncommitted drift.

## COLRv1 (opt‑in, gradients)

`colorFormat: 'colrv1'` additionally emits a COLRv1 flavor (gradients/transforms) written by a bundled Rust→wasm module (`write-fonts`, no `node-gyp`). It’s **off by default**; when off, nothing wasm is loaded. When on but the wasm can’t load, the plugin warns and falls back to `colrv0 + otsvg`. `font-palette` / `@font-palette-values` theme switching works on COLR (not OT‑SVG).

## Notes

- Fonts are emitted to `dist/colorfont/*` and the extracted CSS references them by absolute URL; Vite logs a benign “didn’t resolve at build time … resolved at runtime” for these — that’s expected (they’re served from the emitted assets, not rewritten).
- Icons must be single fills for `mono`/`colrv0`; **stroke icons should be outlined to fills first**, and gradients are preserved only in `otsvg`/`colrv1`.
- Multicolor icons are inherently lost in `mono` (rendered in text color) — that’s the universal fallback.

## License

MIT
