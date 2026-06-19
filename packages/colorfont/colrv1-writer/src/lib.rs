//! 薄写表后端:输入「JS 产出的 base SFNT(glyf)」+「paint 树 JSON」,
//! 输出「追加了 COLRv1 + CPAL 表的 SFNT」。几何/拆层/渐变换算都在 JS 前端做完,
//! 这里只做「paint 树 → write-fonts 结构 → 字节」的反序列化与组装。

use serde::Deserialize;
use wasm_bindgen::prelude::*;

use read_fonts::FontRef;
use write_fonts::tables::{colr, cpal};
use write_fonts::types::{F2Dot14, FWord, GlyphId16, UfWord};
use write_fonts::FontBuilder;

// ============================ paint 树契约(对应 JS 的 Colrv1Doc) ============================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Doc {
    #[allow(dead_code)]
    units_per_em: u16,
    palette: Vec<String>,
    color_glyphs: Vec<ColorGlyph>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ColorGlyph {
    base_glyph_id: u16,
    layers: Vec<Layer>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Layer {
    glyph_id: u16,
    paint: Paint,
}

#[derive(Deserialize)]
#[serde(tag = "kind")]
enum Paint {
    // 注:enum 级 rename_all 只改变体名,不改变体内字段名,故每个变体单独标注。
    #[serde(rename = "solid", rename_all = "camelCase")]
    Solid { palette_index: u16, alpha: f32 },
    #[serde(rename = "linear", rename_all = "camelCase")]
    Linear {
        p0: [f32; 2],
        p1: [f32; 2],
        p2: [f32; 2],
        stops: Vec<Stop>,
        extend: String,
    },
    #[serde(rename = "radial", rename_all = "camelCase")]
    Radial {
        c0: [f32; 2],
        r0: f32,
        c1: [f32; 2],
        r1: f32,
        stops: Vec<Stop>,
        extend: String,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stop {
    offset: f32,
    palette_index: u16,
    alpha: f32,
}

// ============================ 小工具 ============================

fn fw(v: f32) -> FWord {
    FWord::new(v.round() as i16)
}
fn ufw(v: f32) -> UfWord {
    UfWord::new(v.round().max(0.0) as u16)
}
fn f2(v: f32) -> F2Dot14 {
    F2Dot14::from_f32(v.clamp(0.0, 1.0))
}

fn parse_hex(s: &str) -> (u8, u8, u8) {
    let h = s.trim_start_matches('#');
    let p = |a: usize, b: usize| u8::from_str_radix(h.get(a..b).unwrap_or("0"), 16).unwrap_or(0);
    (p(0, 2), p(2, 4), p(4, 6))
}

fn extend_of(s: &str) -> colr::Extend {
    match s {
        "repeat" => colr::Extend::Repeat,
        "reflect" => colr::Extend::Reflect,
        _ => colr::Extend::Pad,
    }
}

fn color_line(stops: &[Stop], extend: &str) -> colr::ColorLine {
    let cs: Vec<colr::ColorStop> = stops
        .iter()
        .map(|s| colr::ColorStop::new(f2(s.offset), s.palette_index, f2(s.alpha)))
        .collect();
    colr::ColorLine::new(extend_of(extend), cs.len() as u16, cs)
}

// paint 树节点 → write-fonts colr::Paint(填充 paint,不含外层 PaintGlyph)
fn fill_paint(p: &Paint) -> colr::Paint {
    match p {
        Paint::Solid { palette_index, alpha } => {
            colr::Paint::Solid(colr::PaintSolid::new(*palette_index, f2(*alpha)))
        }
        Paint::Linear { p0, p1, p2, stops, extend } => {
            colr::Paint::LinearGradient(colr::PaintLinearGradient::new(
                color_line(stops, extend),
                fw(p0[0]),
                fw(p0[1]),
                fw(p1[0]),
                fw(p1[1]),
                fw(p2[0]),
                fw(p2[1]),
            ))
        }
        Paint::Radial { c0, r0, c1, r1, stops, extend } => {
            colr::Paint::RadialGradient(colr::PaintRadialGradient::new(
                color_line(stops, extend),
                fw(c0[0]),
                fw(c0[1]),
                ufw(*r0),
                fw(c1[0]),
                fw(c1[1]),
                ufw(*r1),
            ))
        }
    }
}

fn build_cpal(palette: &[String]) -> cpal::Cpal {
    let records: Vec<cpal::ColorRecord> = palette
        .iter()
        .map(|hex| {
            let (r, g, b) = parse_hex(hex);
            cpal::ColorRecord::new(b, g, r, 255) // CPAL 存储为 BGRA
        })
        .collect();
    let n = records.len() as u16;
    // 单一调色板(palette 0),起始索引 0
    cpal::Cpal::new(n, 1, n, Some(records), vec![0])
}

fn build_colr(doc: &Doc) -> colr::Colr {
    let mut layer_paints: Vec<colr::Paint> = Vec::new();
    let mut base_list: Vec<colr::BaseGlyphPaint> = Vec::new();

    for cg in &doc.color_glyphs {
        let first = layer_paints.len() as u32;
        for layer in &cg.layers {
            let fill = fill_paint(&layer.paint);
            layer_paints.push(colr::Paint::Glyph(colr::PaintGlyph::new(
                fill,
                GlyphId16::new(layer.glyph_id),
            )));
        }
        let pcl = colr::PaintColrLayers::new(cg.layers.len() as u8, first);
        base_list.push(colr::BaseGlyphPaint::new(
            GlyphId16::new(cg.base_glyph_id),
            colr::Paint::ColrLayers(pcl),
        ));
    }

    let num_layers = layer_paints.len() as u32;
    let num_base = base_list.len() as u32;

    // COLR v0 记录留空;挂上 base_glyph_list / layer_list → 序列化时 version 自动判为 1。
    let mut table = colr::Colr::new(0, None, None, 0);
    table.base_glyph_list = Some(colr::BaseGlyphList::new(num_base, base_list)).into();
    table.layer_list = Some(colr::LayerList::new(num_layers, layer_paints)).into();
    table
}

fn add_colrv1_impl(base_sfnt: &[u8], doc_json: &str) -> Result<Vec<u8>, String> {
    let doc: Doc = serde_json::from_str(doc_json).map_err(|e| format!("doc JSON 解析失败: {e}"))?;
    let font = FontRef::new(base_sfnt).map_err(|e| format!("base SFNT 解析失败: {e:?}"))?;

    let cpal = build_cpal(&doc.palette);
    let colr = build_colr(&doc);

    let mut builder = FontBuilder::new();
    builder.copy_missing_tables(font);
    builder
        .add_table(&cpal)
        .map_err(|e| format!("写 CPAL 失败: {e:?}"))?;
    builder
        .add_table(&colr)
        .map_err(|e| format!("写 COLR 失败: {e:?}"))?;
    Ok(builder.build())
}

// ============================ wasm 入口 ============================

/// 给 base SFNT 追加 COLRv1 + CPAL,返回新的 SFNT 字节。
#[wasm_bindgen]
pub fn add_colrv1(base_sfnt: &[u8], doc_json: &str) -> Result<Vec<u8>, JsError> {
    add_colrv1_impl(base_sfnt, doc_json).map_err(|e| JsError::new(&e))
}
