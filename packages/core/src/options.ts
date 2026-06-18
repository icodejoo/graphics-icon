import { isAbsolute, resolve } from 'node:path'

import type { ColorfontOptions, ResolvedOptions } from './types.ts'

const DEFAULT_PA_START = 0xe000

/** 填充默认值,规范化路径。 */
export function resolveOptions(o: ColorfontOptions): ResolvedOptions {
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
    formats: o.formats ?? ['woff2'],
    codepointsFile: o.codepointsFile
      ? resolve(o.codepointsFile)
      : resolve(outDir, 'codepoints.json'),
    paStart: o.paStart ?? DEFAULT_PA_START,
  }
}
