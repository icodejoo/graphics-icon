# colrv1-writer

薄 Rust→wasm 写表后端:输入 colorfont JS 前端产出的「base SFNT(glyf)+ paint 树 JSON」,输出「追加了 **COLRv1 + CPAL** 表的 SFNT」。基于 fontations [`write-fonts`](https://docs.rs/write-fonts)。

几何、按色拆层、渐变坐标换算全部在 JS 前端(`@colorfont/core` 的 `src/colrv1/`)完成,这里只做 `paint 树 → write-fonts 结构 → 字节`。

## 为什么是 Rust

`opentype.js` 只能写 COLR**v0**(源码 `check.argument(version === 0)`),且 JS 生态无任何 COLRv1 writer。fontations 的 `write-fonts` 是纯 Rust、COLRv1 全覆盖、可干净编 wasm(免 node-gyp)。

## 构建(需 Rust)

```bash
# 1. 安装 Rust + wasm 工具链
#    https://rustup.rs   然后:
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# 2. 在本目录构建(Node 用 nodejs target)
wasm-pack build --release --target nodejs --out-name colrv1_writer

# 产物在 ./pkg ,其 package.json name = "colrv1-writer"
```

构建后 `@colorfont/core` 会自动惰性加载它(`src/colrv1/wasm-writer.ts`);未构建时 colrv1 档优雅跳过(回退 colrv0+otsvg)并给警告。

## wasm 边界

```
add_colrv1(base_sfnt: &[u8], doc_json: &str) -> Vec<u8>
```

`doc_json` 形如:

```json
{
  "unitsPerEm": 1000,
  "palette": ["#ffb300", "#f4511e", "#e53935", "#1e88e5"],
  "colorGlyphs": [
    { "baseGlyphId": 4, "layers": [
      { "glyphId": 6, "paint": { "kind": "solid", "paletteIndex": 2, "alpha": 1 } },
      { "glyphId": 7, "paint": { "kind": "solid", "paletteIndex": 3, "alpha": 1 } }
    ]},
    { "baseGlyphId": 2, "layers": [
      { "glyphId": 8, "paint": { "kind": "linear",
        "p0": [125, 717], "p1": [125, -117], "p2": [958, 717],
        "stops": [
          { "offset": 0, "paletteIndex": 0, "alpha": 1 },
          { "offset": 1, "paletteIndex": 1, "alpha": 1 }
        ], "extend": "pad" } }
    ]}
  ]
}
```
