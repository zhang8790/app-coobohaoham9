#!/usr/bin/env node
/**
 * style-discipline.mjs — 来店有喜设计纪律卡口
 * ----------------------------------------------------------------------------
 * 目的：把"暖珊瑚设计系统"的治理成果（色系统一 + 字重纪律）用机制锁死，防回归。
 *
 * 设计原则（重要）：
 *   1. 只卡"明确越界"的红线，不卡风格选择。全仓大量裸 hex 是数据驱动的语义色
 *      映射（SAFE_COLORS / NATURE_COLOR / TYPE_COLOR 等），一刀切禁 hex 会误伤、
 *      让 CI 不可用——那是反模式。
 *   2. 受保护区（C 端核心屏）= pages/index、pages/product、pages/food。这些是被
 *      精心治理过的目录，要求 0 越界。
 *   3. 受保护区之外的 800 越界（账本/优惠券等后台大数字 hero）只软报告，不阻断，
 *      避免范围爆炸；后续可逐步收紧。
 *
 * 硬规则（--ci 模式下命中即非零退出）：
 *   R1 旧副调色板绿 #1F9D6B / #157A52（已无 token 对应，纯越界）——全仓禁止。
 *   R2 受保护区内越界字重 800（font-black / font-extrabold / fontWeight:800）。
 *       系统最高字重 token 是 --fw-bold:700，800 根本无 token 定义。
 *   R3 受保护区内低对比度灰（#9CA3AF/#999/#999999 等 ≈2.8:1，WCAG AA 失败）。
 *       正文需 ≥4.5:1，应使用 var(--muted-foreground)（#555，7.4:1）。
 *
 * 软报告（永不 fail）：
 *   W1 受保护区之外的 800 越界，列出"建议治理清单"。
 *   W2 受保护区内珊瑚品牌裸值（#D9694F/#E87964/#F6E2DA/#F9EBE7）计数摘要，
 *       提示后续 token 化基线。
 *   W3 受保护区之外的低对比度灰（无障碍缺陷，建议改为 token 或达标色）。
 *
 * 用法：
 *   node scripts/style-discipline.mjs            # 报告模式，exit 0
 *   node scripts/style-discipline.mjs --ci       # CI 模式，硬规则命中 exit 1
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = 'src'
const PROTECTED = ['pages/index', 'pages/product', 'pages/food'] // 相对 src 的目录

// R1：旧清新绿副调色板（已废弃，无 token 对应）
const HARD_HEX = [/#1F9D6B/i, /#157A52/i]

// R2 / W1：越界字重 800
const WEIGHT_RE = /fontWeight:\s*['"]?800\b|\bfont-black\b|\bfont-extrabold\b/

// W2：受保护区内珊瑚品牌裸值（应改用 hsl(var(--primary)) / --primary-soft）
const BRAND_HEX = [/#D9694F/i, /#E87964/i, /#F6E2DA/i, /#F9EBE7/i]

// R3 / W3：低对比度灰（WCAG AA 失败，正文需 ≥4.5:1，应使用 var(--muted-foreground)）
// 顺序：先匹配 6 位，再匹配 3 位（避免 #999999 被 #999\b 重复命中）
const LOW_GRAY = [/#999999/i, /#9ca3af/i, /#cccccc/i, /#bbbbbb/i, /#999(?![0-9a-fA-F])/i, /#ccc(?![0-9a-fA-F])/i]

// W5：承载文字的"浅语义色"——对比度治理（2026-09-26）后，凡承载文字的浅强调色已统一压深：
//     绿 #16A34A/#10B981 → #15803D；蓝 #0EA5E9 → #0369A1；琥珀/橙 #D97706/#EA580C/#F97316 → #B45309；
//     金 #B8923A → #8A6B22。这些色作文字/按钮底不达 WCAG AA，残留即回归风险。仅扫 .tsx（.scss 的
//     token 定义 --color-herb-500 等不计入），软警告、不阻断。
const LIGHT_SEMANTIC = [/#16A34A/i, /#10B981/i, /#0EA5E9/i, /#D97706/i, /#EA580C/i, /#F97316/i, /#B8923A/i]

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
let lightHits = 0

for (const f of files) {
  const rel = relative('.', f).replace(/\\/g, '/')
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  const inProtected = isProtected(rel)
  lines.forEach((ln, i) => {
    for (const re of HARD_HEX) {
      if (re.test(ln)) {
        errors.push({ file: rel, line: i + 1, msg: `旧副调色板绿 ${re.source.replace(/i$/, '')} 已废弃，应使用 --color-herb-* 语义 token` })
      }
    }
    if (WEIGHT_RE.test(ln)) {
      if (inProtected) {
        errors.push({ file: rel, line: i + 1, msg: '越界字重 800（系统最高 token --fw-bold:700），应降到 700' })
      } else {
        warnings.push({ file: rel, line: i + 1, msg: '越界字重 800（建议治理：系统最高 token --fw-bold:700）' })
      }
    }
    if (LOW_GRAY.some((re) => re.test(ln))) {
      // 仅当是「文字色」上下文才计入（color: / color= / text-[# / placeholderStyle）；
      // 排除数据驱动兜底（含 || 或 ?? 的三元/默认值）与图表/边框/背景装饰灰，避免误报。
      const isTextColor = /(?:color:\s*['"]?#{1,2}|color="#|text-\[#|placeholderStyle)/i.test(ln)
      const isFallback = /[|]{2}|\?\?/.test(ln)
      if (isTextColor && !isFallback) {
        if (inProtected) {
          errors.push({ file: rel, line: i + 1, msg: '低对比度灰（WCAG AA 失败 ≈2.8:1），应改用 var(--muted-foreground) #555 达标' })
        } else {
          warnings.push({ file: rel, line: i + 1, msg: '低对比度灰（无障碍缺陷，建议改为 var(--muted-foreground) 或达标色）' })
        }
      }
    }
    if (inProtected && BRAND_HEX.some((re) => re.test(ln))) brandHits += 1
    if (rel.endsWith('.tsx') && LIGHT_SEMANTIC.some((re) => re.test(ln))) {
      warnings.push({ file: rel, line: i + 1, msg: '浅语义色（对比度治理后应压深：绿→#15803D / 蓝→#0369A1 / 琥珀橙→#B45309 / 金→#8A6B22），防回归' })
      lightHits += 1
    }
  })
}

const ci = process.argv.includes('--ci')

console.log('\n=== 设计纪律扫描 (style-discipline) ===')
if (errors.length === 0) {
  console.log(`[硬规则] 通过 ✓（受保护区 0 越界：旧副调色板绿 / 越界字重 800 / 低对比度灰 全部清零）`)
} else {
  console.log(`[硬规则] 发现 ${errors.length} 处违规（CI 将失败）`)
  for (const e of errors) console.log(`  ✗ ${e.file}:${e.line}  ${e.msg}`)
}

if (warnings.length) {
  const w1 = warnings.filter((w) => w.msg.includes('字重 800'))
  const w3 = warnings.filter((w) => w.msg.includes('低对比度灰'))
  if (w1.length) {
    console.log(`\n[W1] 受保护区外待治理字重 800：${w1.length} 处（仅提示，不阻断）`)
    for (const w of w1) console.log(`  · ${w.file}:${w.line}  ${w.msg}`)
  }
  if (w3.length) {
    console.log(`\n[W3] 受保护区外低对比度灰（无障碍缺陷）：${w3.length} 处（仅提示，不阻断）`)
    if (w3.length <= 40) for (const w of w3) console.log(`  · ${w.file}:${w.line}  ${w.msg}`)
  }
}

if (brandHits) {
  console.log(`\n[W2] 受保护区内珊瑚品牌裸值：${brandHits} 处（后续 token 化基线，不阻断）`)
}

if (lightHits) {
  console.log(`\n[W5] 承载文字浅语义色残留：${lightHits} 处（对比度防回归，建议改用加深版色值 / --primary-strong，不阻断）`)
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
