import { isAbsolute, resolve } from 'node:path'

import type { ColorfontItem, ResolvedOptions } from './types.ts'

const DEFAULT_PA_START = 0xe000

/** 填充默认值,规范化路径(单字体实例)。 */
export function resolveOptions(o: ColorfontItem): ResolvedOptions {
  if (!o.input) throw new Error('colorfont: 缺少 input')
  if (!o.outDir) throw new Error('colorfont: 缺少 outDir')
  if (!o.fontName) throw new Error('colorfont: 缺少 fontName')

  const unitsPerEm = o.unitsPerEm ?? 1000
  const ascender = o.ascender ?? Math.round(unitsPerEm * 0.8)
  const descender = o.descender ?? ascender - unitsPerEm
  const outDir = resolve(o.outDir)
  const input = (Array.isArray(o.input) ? o.input : [o.input]).map((p) =>
    isAbsolute(p) ? p : resolve(p),
  )

  return {
    input,
    outDir,
    fontName: o.fontName,
    fontFamily: o.fontFamily ?? o.fontName,
    unitsPerEm,
    ascender,
    descender,
    baseSelector: o.baseSelector ?? '.icon',
    classPrefix: o.classPrefix ?? 'icon-',
    colorFormat: o.colorFormat ?? 'auto',
    // formats 唯一来源:默认仅 woff2(所有现代浏览器);要 .woff 写 ['woff2','woff']
    formats: o.formats ?? ['woff2'],
    colrv0: o.colrv0 ?? true,
    woff2Quality: o.woff2Quality ?? 11,
    threads: o.threads ?? 'auto',
    // 缓存默认开启(布尔);具体缓存文件 + 命中/复用由 buildAndWrite 的 groupCache 持有。false 关闭。
    cache: o.cache !== false,
    // 码位锁默认按 fontName 派生(多字体共用 outDir 时不冲突)。建议 commit。
    codepointsFile: o.codepointsFile ? resolve(o.codepointsFile) : resolve(outDir, `${o.fontName}.codepoints.json`),
    paStart: o.paStart ?? DEFAULT_PA_START,
  }
}
