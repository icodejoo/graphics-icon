import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build, buildAndWrite, readLockfile, serializeLockfile } from '../index.ts'

import type { ColorfontOptions, ColorFormat, FontFormat } from '../index.ts'

const USAGE = `colorfont — SVG 图标 → 彩色 webfont

用法:
  colorfont build  --input <dir,...> --out <dir> --name <fontName> [选项]
  colorfont watch  ...同 build,监听图标目录变更增量重建
  colorfont check  ...同 build,校验码位锁文件是否漂移(CI 用,漂移则退出码 1)

选项:
  --input <dir,...>     图标源目录(逗号分隔多个)         必填
  --out <dir>           产物输出目录                      必填
  --name <fontName>     字体名 / @font-face family         必填
  --format <a,b>        容器格式: woff2,woff,ttf(默认 woff2)
  --color <mode>        auto|mono|colrv0|otsvg|colrv1(默认 auto)
  --codepoints <file>   码位锁文件(默认 <out>/codepoints.json)
  --config <file>       从 JS/TS 配置文件加载选项(default 导出)
  -h, --help            显示帮助
`

type Flags = Record<string, string | true>

function parseFlags(args: string[]): { cmd: string; flags: Flags } {
  const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'help'
  const rest = cmd === 'help' && args[0] !== 'help' ? args : args.slice(1)
  const flags: Flags = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '-h' || a === '--help') {
      flags.help = true
      continue
    }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    }
  }
  return { cmd, flags }
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
}

async function optionsFromFlags(flags: Flags): Promise<ColorfontOptions> {
  let base: Partial<ColorfontOptions> = {}
  const config = str(flags.config)
  if (config) {
    const mod = await import(pathToFileURL(resolve(config)).href)
    base = (mod.default ?? mod) as Partial<ColorfontOptions>
  }
  const input = str(flags.input)
  const merged: ColorfontOptions = {
    ...base,
    input: input ? input.split(',') : (base.input as ColorfontOptions['input']),
    outDir: str(flags.out) ?? (base.outDir as string),
    fontName: str(flags.name) ?? (base.fontName as string),
  }
  const fmt = str(flags.format)
  if (fmt) merged.formats = fmt.split(',') as FontFormat[]
  const color = str(flags.color)
  if (color) merged.colorFormat = color as ColorFormat
  const cp = str(flags.codepoints)
  if (cp) merged.codepointsFile = cp
  return merged
}

function requireOpts(o: ColorfontOptions): string | null {
  if (!o.input) return '缺少 --input'
  if (!o.outDir) return '缺少 --out'
  if (!o.fontName) return '缺少 --name'
  return null
}

type Log = (msg: string) => void

async function readMaybe(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

function summarize(label: string, assets: { color: string; format: string }[], log: Log): void {
  const flavors = [...new Set(assets.map((a) => a.color))].join(', ')
  log(`[colorfont] ${label}: ${assets.length} 个产物(档位: ${flavors})`)
}

/** 程序化入口:返回退出码(0 成功,非 0 失败)。便于测试与 bin 复用。 */
export async function run(argv: string[], log: Log = console.log): Promise<number> {
  const { cmd, flags } = parseFlags(argv)

  if (flags.help || cmd === 'help') {
    log(USAGE)
    return 0
  }

  if (cmd !== 'build' && cmd !== 'watch' && cmd !== 'check') {
    log(`未知命令: ${cmd}\n`)
    log(USAGE)
    return 2
  }

  const options = await optionsFromFlags(flags)
  const missing = requireOpts(options)
  if (missing) {
    log(`[colorfont] ${missing}\n`)
    log(USAGE)
    return 2
  }

  if (cmd === 'build') {
    const result = await buildAndWrite(options)
    summarize('build 完成', result.assets, log)
    for (const w of result.warnings) log(`[colorfont] 警告: ${w.message}`)
    return 0
  }

  if (cmd === 'check') {
    const cpFile = options.codepointsFile ?? resolve(options.outDir, 'codepoints.json')
    const before = await readMaybe(resolve(cpFile))
    const result = await build(options) // 不落盘
    const after = serializeLockfile(result.codepoints)
    if (before === null) {
      log(`[colorfont] check 失败: 码位锁文件不存在(${cpFile})。请先 build 并提交。`)
      return 1
    }
    if (before !== after) {
      const beforeNames = new Set(Object.keys(JSON.parse(before).glyphs ?? {}))
      const afterNames = Object.keys(result.codepoints.glyphs)
      const added = afterNames.filter((n) => !beforeNames.has(n))
      log(`[colorfont] check 失败: 码位锁文件漂移。新增未提交图标: ${added.join(', ') || '(顺序/内容变化)'}`)
      return 1
    }
    log(`[colorfont] check 通过: 码位稳定(${result.metadata.glyphs.length} 图标)`)
    return 0
  }

  // watch
  const { watch } = await import('node:fs')
  const result = await buildAndWrite(options)
  summarize('watch 初次构建', result.assets, log)
  const dirs = Array.isArray(options.input) ? options.input : [options.input]
  let timer: ReturnType<typeof setTimeout> | undefined
  for (const dir of dirs) {
    watch(dir, { recursive: true }, (_ev, file) => {
      if (!file || !String(file).toLowerCase().endsWith('.svg')) return
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const r = await buildAndWrite(options)
        summarize(`重建(${file})`, r.assets, log)
      }, 80)
    })
  }
  log('[colorfont] watching… (Ctrl+C 退出)')
  return await new Promise<number>(() => {}) // 常驻
}
