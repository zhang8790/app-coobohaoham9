/**
 * 构建期预压缩：为 dist/ 下可压缩的静态资源生成同名 .gz
 *
 * 为什么要这么做：
 *   服务器 nginx 开了 `gzip_static on`，会优先直接吐已存在的 .gz 文件，
 *   省掉每次请求的实时压缩 CPU；没有 .gz 时才回退到动态 gzip。
 *   （务必确认 nginx 同时 `gzip on`，否则动态回退不生效。）
 *
 * 用法：node scripts/gzip-dist.mjs   （已挂在 npm run build 末尾）
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = join(process.cwd(), 'dist')

// 文本类才值得压缩；图片/字体本就已压缩，再 gzip 只浪费空间
const COMPRESSIBLE = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.svg', '.xml', '.txt', '.map', '.wasm',
])
// 小于该体积不压（省不了多少，反而多一个文件）
const MIN_SIZE = 1024

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

let total = 0
let saved = 0

for (const file of walk(DIST)) {
  if (file.endsWith('.gz')) continue
  if (!COMPRESSIBLE.has(extname(file).toLowerCase())) continue

  const raw = readFileSync(file)
  if (raw.length < MIN_SIZE) continue

  // level 9：构建期一次性成本，换取每次请求都更小的传输量
  const gz = gzipSync(raw, { level: 9, memLevel: 9 })
  // 只有真的变小才落盘
  if (gz.length >= raw.length) continue

  writeFileSync(`${file}.gz`, gz)
  total += raw.length
  saved += raw.length - gz.length
  const pct = ((1 - gz.length / raw.length) * 100).toFixed(0)
  console.log(
    `  gzip ${file.replace(DIST, 'dist')}  ` +
    `${(raw.length / 1024).toFixed(1)}KB → ${(gz.length / 1024).toFixed(1)}KB  (-${pct}%)`,
  )
}

if (total === 0) {
  console.log('  (无可压缩文件，跳过)')
} else {
  console.log(
    `  ✅ 预压缩完成：${(total / 1024).toFixed(1)}KB → ` +
    `${((total - saved) / 1024).toFixed(1)}KB，共省 ${(saved / 1024).toFixed(1)}KB`,
  )
}
