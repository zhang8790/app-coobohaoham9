/**
 * 把 vite 产出的 SPA(dist) 转成"纯静态服务器友好"的 dist-cloud：
 *  1. 资源路径 ./assets/ -> /assets/  （子路径下也能正确解析）
 *  2. 为每个前端路由预生成 <route>/index.html，绕开无 history-fallback 的静态服务器
 *  3. 追加 404.html / 200.html 兜底（部分静态服务器识别）
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'dist')
const out = join(root, 'dist-cloud')

if (!existsSync(join(src, 'index.html'))) {
  console.error('[make-static-cloud] 缺少 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

if (existsSync(out)) rmSync(out, { recursive: true, force: true })
cpSync(src, out, { recursive: true })

const html = readFileSync(join(src, 'index.html'), 'utf8')
  .replaceAll('src="./assets/', 'src="/assets/')
  .replaceAll('href="./assets/', 'href="/assets/')
  .replaceAll('href="./favicon.svg"', 'href="/favicon.svg"')

writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, '404.html'), html)
writeFileSync(join(out, '200.html'), html)

// 从 App.tsx 里抽取路由，避免手工维护漏项
// ⚠️ 必须还原「父子嵌套」关系：子路由写的是相对 path（如 path="products"），
// 若直接按字面预渲染，会生成顶层 /products 而真正需要的 /merchant/products 缺失 ——
// 静态托管对没有实体目录的路径不回落到 404.html，于是「复制商家后台子页链接打开」直接 404。
// 这里用一个轻量栈还原完整路径：遇到绝对路径重置栈，遇到自闭合标签不入栈。
const appSrc = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
const routes = (() => {
  const out = new Set()
  const stack = []
  const tagRe = /<Route\b([^>]*?)(\/?)>|<\/Route>/g
  let m
  while ((m = tagRe.exec(appSrc)) !== null) {
    if (m[0] === '</Route>') { stack.pop(); continue }
    const attrs = m[1] || ''
    const selfClosing = m[2] === '/'
    const pm = attrs.match(/\bpath="([^"*]+)"/)
    if (!pm) continue
    const raw = pm[1]
    if (raw.includes(':')) { if (!selfClosing) stack.push(''); continue }
    if (raw.startsWith('/')) stack.length = 0
    stack.push(raw)
    out.add(stack.join('/').replace(/^\/+/, '').replace(/\/{2,}/g, '/'))
    if (selfClosing) stack.pop()
  }
  return [...out].filter(Boolean)
})()

for (const r of routes) {
  const dir = join(out, r)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
}

console.log(`[make-static-cloud] 生成 dist-cloud，预渲染 ${routes.length} 条路由入口：`)
console.log('  ' + routes.join(', '))
