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
const out = join(root, process.env.STATIC_OUT || 'dist-cloud')

if (!existsSync(join(src, 'index.html'))) {
  console.error('[make-static-cloud] 缺少 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

// 删除旧产物；若被安全删除策略拦截(EPERM)则降级为覆盖模式
// （cpSync / writeFileSync 均为覆盖写，不触发 unlink，可正常生成）
if (existsSync(out)) {
  try {
    rmSync(out, { recursive: true, force: true })
  } catch (e) {
    console.warn('[make-static-cloud] 无法删除旧 dist-cloud (' + e.code + ')，改用覆盖模式')
  }
}
cpSync(src, out, { recursive: true })

const html = readFileSync(join(src, 'index.html'), 'utf8')
  .replaceAll('src="./assets/', 'src="/assets/')
  .replaceAll('href="./assets/', 'href="/assets/')
  .replaceAll('href="./favicon.svg"', 'href="/favicon.svg"')

writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, '404.html'), html)
writeFileSync(join(out, '200.html'), html)

// 从 App.tsx 里抽取路由，避免手工维护漏项
const appSrc = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
const routes = [
  ...new Set(
    [...appSrc.matchAll(/path="([^"*]+)"/g)]
      .map((m) => m[1].replace(/^\/+/, ''))
      .filter((p) => p && !p.includes(':')),
  ),
]

for (const r of routes) {
  const dir = join(out, r)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
}

console.log(`[make-static-cloud] 生成 dist-cloud，预渲染 ${routes.length} 条路由入口：`)
console.log('  ' + routes.join(', '))
