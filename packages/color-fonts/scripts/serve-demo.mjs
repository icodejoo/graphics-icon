// 极简静态服务器,给浏览器真人验收用(无第三方依赖)。
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../.demo')
const port = Number(process.env.PORT) || 8173
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
}

http
  .createServer(async (req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0])
    if (p === '/') p = '/index.html'
    const safe = normalize(p).replace(/^([\\/]|\.\.[\\/])+/, '')
    try {
      const buf = await readFile(join(root, safe))
      res.setHeader('Content-Type', TYPES[extname(safe)] || 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.end(buf)
    } catch {
      res.statusCode = 404
      res.end('404')
    }
  })
  .listen(port, () => console.log(`colorfont demo: http://localhost:${port}  (serving ${root})`))
