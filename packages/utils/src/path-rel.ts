/**
 * 相对路径助手 —— 生成 url() / import 用的相对引用(正斜杠,确保以 ./ 或 ../ 开头)。
 * Relative-path helper — produces a relative reference for url()/import (forward slashes, always ./ or ../).
 *
 * bitmap-sprite 的样式/脚本与 svg-sprite 的脚本共用同一规则。
 * Shared by bitmap-sprite's style/script emitters and svg-sprite's script emitter.
 */

import { dirname, relative, resolve } from "node:path"

/** 从 fromFile 所在目录到 toFile 的相对路径。 / Relative path from fromFile's directory to toFile. */
export function relTo(fromFile: string, toFile: string): string {
  let rel = relative(dirname(resolve(fromFile)), resolve(toFile)).replace(/\\/g, "/")
  if (!rel.startsWith(".")) rel = `./${rel}`
  return rel
}
