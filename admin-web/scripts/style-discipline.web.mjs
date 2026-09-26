#!/usr/bin/env node
/**
 * style-discipline.web.mjs — 来店有喜管理后台（B 端）设计纪律卡口
 * ----------------------------------------------------------------------------
 * 与小程序端 scripts/style-discipline.mjs 同源同哲学，仅把"受保护区"与"越界值"
 * 适配到 admin-web（React + Vite，暗色国潮主题）。
 *
 * 设计原则：
 *   1. 只卡"明确越界"的红线，不卡风格选择。B 端大量裸 hex 是数据驱动的语义色
 *      映射（临期红/橙/琥珀、状态色等），一刀切禁 hex 会误伤、让 CI 不可用。
 *   2. 受保护区 = 核心业务屏（商品/订单/看板/登录/商户/会员/财务/退款/流水）。
 *      这些屏被精心治理，要求 0 越界。
 *   3. 受保护区之外的越界只软报告，不阻断，避免范围爆炸。
 *
 * 硬规则（--ci 命中即 exit 1）：
 *   R1 废弃旧品牌橙 #C2410C / #7A2508（被暖珊瑚 var(--primary) 取代）——全仓禁止。
 *   R2 受保护区内越界字重 800（系统最高 token --fw-bold:700，800 无 token 定义）。
 *   R3 受保护区内低对比度灰 #6B7280（≈3.8:1，WCAG AA 失败，应改用 var(--text-dim) 已提亮）。
 *
 * 软报告（永不 fail）：
 *   W1 受保护区外 800 越界（建议治理清单）。
 *   W2 受保护区内珊瑚品牌裸值（#E87964/#D9694F/#F0997B/#F5C4B3），提示 token 化基线。
 *   W3 低对比度灰（#999999 等，无障碍缺陷，建议改为 token 或达标色）。
 *   W4 遗留橙 #EA580C（旧 hover / 状态歧义色，建议改用 var(--warning) 或状态 token）。
 *
 * 用法：
 *   node scripts/style-discipline.web.mjs            # 报告模式，exit 0
 *   node scripts/style-discipline.web.mjs --ci       # CI 模式，硬规则命中 exit 1
 *
 * 解析根目录取脚本所在 admin-web/，与 cwd 无关，可被 npm script 直接调用。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

// 受保护区（相对 src 的目录）
const PROTECTED = [
  'pages/Products', 'pages/Orders', 'pages/Dashboard', 'pages/Login',
  'pages/Merchants', 'pages/Members', 'pages/FinanceDashboard', 'pages/Ledgers',
  'pages/Refunds', 'pages/merchant',
]

// R1：废弃旧品牌橙（被珊瑚 var(--primary) 取代），全仓禁止
const HARD_HEX = [/#C2410C/i, /#7A2508/i]

// R2 / W1：越界字重 800
const WEIGHT_RE = /fontWeight:\s*['"]?800\b|\bfont-black\b|\bfont-extrabold\b/

// W2：受保护区内珊瑚品牌裸值（应改用 var(--primary) / --primary-soft）
const BRAND_HEX = [/#E87964/i, /#D9694F/i, /#F0997B/i, /#F5C4B3/i]

// W4：遗留橙（旧 hover / 状态歧义色）
const LEGACY_ORANGE = [/#EA580C/i]

// R3 / W3：低对比度灰（仅当是文字色上下文才计入，排除数据兜底与装饰灰）
const LOW_GRAY = [/#999999/i, /#999(?![0-9a-fA-F])/i]
const LOW_GRAY_PROTECTED = [/#6B7280/i]

function walk(dir, files = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, files)
    else if (/\.(tsx|scss)$/.test(e.name)) files.push(p)
  }
  return files
}

function isProtected(rel) {
  const norm = rel.replace(/\\/g, '/')
  return PROTECTED.some((p) => norm.includes('/' + p + '/'))
}

const files = walk(SRC)
const errors = []
const warnings = []
let brandHits = 0
let legacyHits = 0

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  const inProtected = isProtected(rel)
  lines.forEach((ln, i) => {
    for (const re of HARD_HEX) {
      if (re.test(ln)) {
        errors.push({ file: rel, line: i + 1, msg: `废弃旧品牌橙 ${re.source.replace(/i$/, '')} 已无 token 对应，应使用 var(--primary)` })
      }
    }
    if (WEIGHT_RE.test(ln)) {
      if (inProtected) {
        errors.push({ file: rel, line: i + 1, msg: '越界字重 800（系统最高 token --fw-bold:700），应降到 700' })
      } else {
        warnings.push({ file: rel, line: i + 1, msg: '越界字重 800（建议治理：系统最高 token --fw-bold:700）' })
      }
    }
    if (LOW_GRAY_PROTECTED.some((re) => re.test(ln))) {
      const isTextColor = /(?:color:\s*['"]?#{1,2}|color="#|text-\[#|placeholderStyle)/i.test(ln)
      const isFallback = /[|]{2}|\?\?/.test(ln)
      if (isTextColor && !isFallback) {
        errors.push({ file: rel, line: i + 1, msg: '低对比度灰 #6B7280（WCAG AA 失败 ≈3.8:1），应改用 var(--text-dim)（已提亮达标）' })
      }
    }
    if (inProtected && BRAND_HEX.some((re) => re.test(ln))) brandHits += 1
    if (LEGACY_ORANGE.some((re) => re.test(ln))) {
      warnings.push({ file: rel, line: i + 1, msg: '遗留橙 #EA580C（旧 hover/状态歧义），建议改用 var(--warning) 或状态 token' })
    }
    if (LOW_GRAY.some((re) => re.test(ln))) {
      const isTextColor = /(?:color:\s*['"]?#{1,2}|color="#|text-\[#|placeholderStyle)/i.test(ln)
      const isFallback = /[|]{2}|\?\?/.test(ln)
      if (isTextColor && !isFallback) {
        warnings.push({ file: rel, line: i + 1, msg: '低对比度灰（无障碍缺陷，建议改为 var(--text-dim) 或达标色）' })
      }
    }
    // W5：珊瑚底白字按钮防回归——暗色主题下珊瑚字在深底已达标，仅"珊瑚底 + 白字"实心按钮
    //     不达标（2.9:1）。已统一将按钮 background 改为 var(--primary-strong)，残留即回归。
    //     仅匹配 background 值内直接为 'var(--primary)' 的写法（排除同行 border/color 的亮珊瑚边框/文字）。
    if (/\.tsx$/.test(rel)) {
      if (/background\w*\s*:\s*[^,]*?'var\(--primary\)'/i.test(ln) && !/primary-strong/.test(ln)) {
        warnings.push({ file: rel, line: i + 1, msg: '珊瑚底白字按钮未用 --primary-strong（暗色下白字 2.9:1 不达 AA），应加深按钮底' })
      }
    }
  })
}

const ci = process.argv.includes('--ci')

console.log('\n=== 网页后台设计纪律扫描 (style-discipline.web) ===')
if (errors.length === 0) {
  console.log('[硬规则] 通过 ✓（受保护区 0 越界：旧品牌橙 / 越界字重 800 / 低对比度灰 全部清零）')
} else {
  console.log(`[硬规则] 发现 ${errors.length} 处违规（CI 将失败）`)
  for (const e of errors) console.log(`  ✗ ${e.file}:${e.line}  ${e.msg}`)
}

if (warnings.length) {
  const w1 = warnings.filter((w) => w.msg.includes('字重 800'))
  const w3 = warnings.filter((w) => w.msg.includes('低对比度灰'))
  const w4 = warnings.filter((w) => w.msg.includes('遗留橙'))
  if (w1.length) {
    console.log(`\n[W1] 受保护区外待治理字重 800：${w1.length} 处（仅提示，不阻断）`)
  }
  if (w3.length) {
    console.log(`\n[W3] 低对比度灰（无障碍缺陷）：${w3.length} 处（仅提示，不阻断）`)
  }
  if (w4.length) {
    console.log(`\n[W4] 遗留橙 #EA580C：${w4.length} 处（仅提示，不阻断）`)
  }
}

if (brandHits) {
  console.log(`\n[W2] 受保护区内珊瑚品牌裸值：${brandHits} 处（后续 token 化基线，不阻断）`)
}

const w5 = warnings.filter((w) => w.msg.includes('珊瑚底白字'))
if (w5.length) {
  console.log(`\n[W5] 珊瑚底白字按钮未加深：${w5.length} 处（对比度防回归，仅提示，不阻断）`)
}

console.log('')

if (errors.length > 0) {
  if (ci) {
    console.log(`RESULT: FAILED — ${errors.length} 处硬规则违规，修复后重跑。`)
    process.exit(1)
  } else {
    console.log(`RESULT: 报告模式（非 CI），硬规则违规 ${errors.length} 处——接入 --ci 后将阻断。`)
    process.exit(0)
  }
} else {
  console.log('RESULT: PASS ✓ 设计纪律校验通过。')
  process.exit(0)
}
