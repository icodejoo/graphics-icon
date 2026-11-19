// used-icons 集成自测:真实 vite build / dev server,验证「类名扫描 → 自动出字体」「只收用到的」「开发期热更新」。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build, createServer } from 'vite'

import usedIcons from './src/index.ts'

import type { Rollup } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '.used-icons-test-tmp')
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

// sun 写在 HTML 里;moon 写在入口 JS 里;heart 在一个没人 import 的文件里(不会进产物);notanicon 不是图标;my-lucide-box 是别的类名,不能误识别
writeFileSync(
  resolve(root, 'index.html'),
  '<!doctype html><div id="app"><i class="lucide-sun"></i><i class="lucide-notanicon my-lucide-box xlucide-ghost"></i></div><script type="module" src="/main.js"></script>',
)
writeFileSync(
  resolve(root, 'main.js'),
  ["import 'virtual:used-icons.css'", "document.body.insertAdjacentHTML('beforeend', '<i class=\"lucide-moon\"></i><i class=\"lucide-star\"></i>')"].join('\n'),
)
writeFileSync(resolve(root, 'orphan.js'), "export default '<i class=\"lucide-heart\"></i>'")

let pass = 0
let fail = 0
const check = (c: boolean, m: string): void => {
  if (c) pass++
  else {
    fail++
    console.error('  ✗', m)
  }
}

/** 构建并取出 CSS 文本。 */
async function buildCss(...args: Parameters<typeof usedIcons>): Promise<string> {
  return buildCssFrom('index.html', ...args)
}

/** 以指定 HTML 为入口构建并取出 CSS 文本。 */
async function buildCssFrom(entry: string, ...args: Parameters<typeof usedIcons>): Promise<string> {
  const out = (await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [usedIcons(...args)],
    build: { write: false, rollupOptions: { input: resolve(root, entry) } },
  })) as Rollup.RollupOutput
  const css = out.output.find((o) => o.type === 'asset' && o.fileName.endsWith('.css'))
  return css && css.type === 'asset' ? String(css.source) : ''
}

// ── 构建 ──
const css = await buildCss([{ collect: 'lucide', iconPrefix: 'lucide-' }], { safelist: ['lucide-bell', 'lucide-cat'] })
check(css.includes('.lucide-sun'), 'build: HTML 里的 lucide-sun 被收进字体')
check(css.includes('.lucide-moon'), 'build: JS 里的 lucide-moon 被收进字体')
check(css.includes('.lucide-star'), 'build: lucide-star 同样被识别')
check(css.includes('.lucide-bell') && css.includes('.lucide-cat'), 'build: safelist 里的 lucide-bell 与 lucide-cat')
check(!css.includes('lucide-heart'), 'build: 没出现在产物里的 heart 不进字体')
check(!css.includes('notanicon') && !css.includes('lucide-box') && !css.includes('ghost'), 'build: 不是图标的类名与别的类名(my-lucide-box)被忽略')
check(css.includes('data:font/woff2;base64,'), 'build: 字体以 data URI 内联')
check(!css.includes('__USED_ICONS_RULES__') && !css.includes('__used-icons-slot__'), 'build: 占位规则已被整条替换')
check(css.includes('font-family: "UsedIcons" !important') && /\.lucide-sun(,|\s*\{)/.test(css), 'build: 每个图标类自己带 font-family(只写 lucide-xxx 就够)')

// 类名前缀:设成 i- 后只认 i-lucide-xxx
writeFileSync(resolve(root, 'prefixed.html'), '<!doctype html><i class="i-lucide-anchor lucide-sun"></i><script type="module" src="/prefixed-entry.js"></script>')
writeFileSync(resolve(root, 'prefixed-entry.js'), "import 'virtual:used-icons.css'")
const prefixed = await buildCssFrom('prefixed.html', [{ collect: 'lucide', iconPrefix: 'i-lucide-' }], { safelist: ['i-lucide-bell'] })
check(prefixed.includes('.i-lucide-bell'), 'build: 带前缀的 safelist 写完整类名也行')
check(prefixed.includes('.i-lucide-anchor') && !prefixed.includes('.lucide-sun') && !prefixed.includes('.i-lucide-sun'), 'build: iconPrefix 设成 i-lucide- 后只认 i-lucide-xxx')

// 前缀与图标集解耦:`i-` 映射到 lucide(写 i-sun),没写 iconPrefix 时默认 `<collect>-`
writeFileSync(resolve(root, 'short.html'), '<!doctype html><i class="i-sun"></i><i class="lucide-moon"></i><script type="module" src="/prefixed-entry.js"></script>')
const short = await buildCssFrom('short.html', [{ collect: 'lucide', iconPrefix: 'i-' }])
check(short.includes('.i-sun') && !short.includes('lucide-moon'), 'build: iconPrefix 与集合名解耦,i-sun 即 lucide 的 sun')
const dflt = await buildCssFrom('short.html', [{ collect: 'lucide' }])
check(dflt.includes('.lucide-moon') && !dflt.includes('.i-sun'), 'build: 不写 iconPrefix 默认 <collect>-')

// 数组可写多个库:同一个库也能挂两个前缀,各自独立生效
writeFileSync(resolve(root, 'multi.html'), '<!doctype html><i class="a-sun"></i><i class="b-moon"></i><i class="a-moon"></i><script type="module" src="/prefixed-entry.js"></script>')
const multi = await buildCssFrom('multi.html', [
  { collect: 'lucide', iconPrefix: 'a-' },
  { collect: 'lucide', iconPrefix: 'b-' },
])
check(multi.includes('.a-sun') && multi.includes('.b-moon') && multi.includes('.a-moon'), 'build: 数组里写多个库/前缀,各自的类名都识别')


// ── 业界实践补齐的几项 ──
// 无障碍:生成内容带空替代文本,读软件跳过装饰性图标;并保留不带替代文本的回退声明
check(/content: "\\e000"; content: "\\e000" \/ "";/.test(css), 'a11y: 生成内容带空替代文本 `/ ""`,且有回退声明')
// 对齐与复位:默认附加样式
check(css.includes('display: inline-block') && css.includes('vertical-align: -0.125em') && css.includes('font-style: normal'), '样式: 默认附加属性(inline-block / 对齐 / 复位)')
const styled = await buildCss([{ collect: 'lucide' }], { scale: 1.5, extraProperties: { 'vertical-align': 'middle', 'line-height': '' } })
check(styled.includes('font-size: 1.5em') && styled.includes('vertical-align: middle') && !styled.includes('line-height: 1;'), '样式: scale 与 extraProperties(覆盖 / 空串去掉)')

// safelist 通配
const wild = await buildCss([{ collect: 'lucide' }], { safelist: ['lucide-arrow-up-*'] })
check(wild.includes('.lucide-arrow-up-right') && wild.includes('.lucide-arrow-up-left') && !wild.includes('.lucide-arrow-down'), 'safelist: 通配展开成图标集里匹配的全部图标')

// 配置写错要在启动时报
let e1 = ''
try {
  await buildCss([{ collect: 'no-such-collection-xyz' }])
} catch (e) {
  e1 = String(e)
}
check(e1.includes('no-such-collection-xyz'), 'fail-fast: 图标集没装,启动时就报并点名')
let e2 = ''
try {
  await buildCss([{ collect: 'lucide', iconPrefix: 'x-' }, { collect: 'lucide', iconPrefix: 'x-' }])
} catch (e) {
  e2 = String(e)
}
check(e2.includes('iconPrefix') && e2.includes('x-'), 'fail-fast: 前缀重复时报错')

// 本地 SVG 目录当图标集
mkdirSync(resolve(root, 'svgs'), { recursive: true })
writeFileSync(resolve(root, 'svgs/Brand Logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>')
writeFileSync(resolve(root, 'local.html'), '<!doctype html><i class="my-brand-logo"></i><script type="module" src="/prefixed-entry.js"></script>')
const local = await buildCssFrom('local.html', [{ collect: 'my', iconPrefix: 'my-', dir: 'svgs' }])
check(local.includes('.my-brand-logo'), 'dir: 本地 SVG 目录当图标集,文件名归一成图标名(Brand Logo.svg → brand-logo)')

// include:不经过模块图的文件(CMS JSON / 后端模板)也要扫
mkdirSync(resolve(root, 'content'), { recursive: true })
writeFileSync(resolve(root, 'content/page.json'), '{"icon":"lucide-rocket"}')
const included = await buildCss([{ collect: 'lucide' }], { include: ['content/**/*.json'] })
check(included.includes('.lucide-rocket'), 'include: 额外 glob 里的文件被扫描')

// 字体大小阈值:小的内联;达到阈值则单独输出文件 + preload + 相对 base
const outExt = (await build({
  root,
  logLevel: 'silent',
  configFile: false,
  base: './',
  plugins: [usedIcons([{ collect: 'lucide' }], { inlineLimit: 0 })],
  build: { write: false },
})) as Rollup.RollupOutput
const fontAsset = outExt.output.find((o) => o.fileName.endsWith('.woff2'))
const extCss = outExt.output.find((o) => o.type === 'asset' && o.fileName.endsWith('.css'))
const extHtml = outExt.output.find((o) => o.type === 'asset' && o.fileName.endsWith('.html'))
check(!!fontAsset && /\.woff2$/.test(fontAsset.fileName) && /-[\w-]{6,}\.woff2$/.test(fontAsset.fileName), 'external: 超过阈值时单独输出带哈希的 woff2')
check(extCss?.type === 'asset' && !String(extCss.source).includes('data:font/woff2') && String(extCss.source).includes(fontAsset!.fileName.replace('assets/', '')), 'external: CSS 引用该文件(相对 base)')
check(extHtml?.type === 'asset' && String(extHtml.source).includes('rel="preload"') && String(extHtml.source).includes('crossorigin'), 'external: HTML 里有 preload(crossorigin)')

// SSR 构建不崩、不产出样式
let ssrOk = true
try {
  await build({ root, logLevel: 'silent', configFile: false, plugins: [usedIcons([{ collect: 'lucide' }])], build: { write: false, ssr: resolve(root, 'main.js') } })
} catch {
  ssrOk = false
}
check(ssrOk, 'ssr: 服务端构建不崩')

// ── 开发服务器 ──
const server = await createServer({
  root,
  logLevel: 'silent',
  configFile: false,
  plugins: [usedIcons([{ collect: 'lucide', iconPrefix: 'lucide-' }], { customData: 'hints/data.json' })],
  server: { middlewareMode: true },
  appType: 'custom',
})
try {
  // 启动时生成编辑器类名提示:含 Lucide 全部图标名
  const data = JSON.parse(readFileSync(resolve(root, 'hints/data.json'), 'utf8')) as { globalAttributes: { name: string; values: { name: string }[] }[] }
  const hints = data.globalAttributes[0]!.values.map((v) => v.name)
check(data.globalAttributes[0]!.name === 'class' && hints.includes('lucide-sun') && hints.includes('lucide-arrow-left'), 'dev: 启动时生成 VS Code class 值提示数据')
check(hints.length > 1000 && hints.every((h) => h.startsWith('lucide-')), `dev: 提示里是 Lucide 全集量级且都带 lucide- 前缀(${hints.length} 个)`)

  await server.transformRequest('/main.js')
  const css1 = await server.transformRequest('virtual:used-icons.css')
  check(!!css1?.code.includes('.lucide-moon') && !!css1.code.includes('.lucide-star'), 'dev: 转换源文件时发现类名并出字体')
  check(!css1?.code.includes('lucide-heart'), 'dev: 还没被转换的文件里的类名不在')

  await server.transformRequest('/orphan.js')
  await new Promise((r) => setTimeout(r, 150)) // 等合并后的样式失效
  const css2 = await server.transformRequest('virtual:used-icons.css')
  check(!!css2?.code.includes('lucide-heart') && !!css2.code.includes('.lucide-moon'), 'dev: 新文件里出现新图标后样式更新为并集')

  const html = await server.transformIndexHtml('/', '<i class="lucide-sun"></i>')
  check(html.includes('lucide-sun'), 'dev: transformIndexHtml 正常返回')
  await new Promise((r) => setTimeout(r, 150))
  const css3 = await server.transformRequest('virtual:used-icons.css')
  check(!!css3?.code.includes('.lucide-sun'), 'dev: HTML 里的类名也被发现')
} finally {
  await server.close()
}


// ── 开发期:warn 与本地 SVG 目录热更新 ──
{
  const warnings: string[] = []
  const logger = { info() {}, warn: (m: string) => void warnings.push(m), warnOnce() {}, error() {}, clearScreen() {}, hasErrorLogged: () => false, hasWarned: false }
  const devServer = await createServer({
    root,
    logLevel: 'silent',
    configFile: false,
    customLogger: logger,
    plugins: [usedIcons([{ collect: 'my', iconPrefix: 'my-', dir: 'svgs' }, { collect: 'lucide' }], { warn: true, customData: false })],
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  try {
    writeFileSync(resolve(root, 'warn.js'), "export default '<i class=\"lucide-nothing-here my-brand-logo\"></i>'")
    await devServer.transformRequest('/warn.js')
    check(warnings.some((w) => w.includes('lucide-nothing-here')), 'warn: 前缀对、图标不存在的类名给出警告')
    check(!warnings.some((w) => w.includes('my-brand-logo')), 'warn: 存在的本地图标不警告')
    const cssLocal = await devServer.transformRequest('virtual:used-icons.css')
    check(!!cssLocal?.code.includes('.my-brand-logo'), 'dev: 本地 SVG 图标进字体')
  } finally {
    await devServer.close()
  }
}

rmSync(root, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '❌'} used-icons test: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
