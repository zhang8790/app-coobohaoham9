// 来店有喜 V3 · 自动化验收 runner · 共享库
// 纯 ESM + 全局 fetch（Node 22 自带），不依赖项目内 @supabase/supabase-js，
// 避免沙箱内 import 解析负担。约定沿用 e2e-test.mjs：读 .env 的
//   TARO_APP_SUPABASE_URL / TARO_APP_SUPABASE_ANON_KEY
//   （可选）SUPABASE_SERVICE_ROLE_KEY 用于写权限探针。

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '..', '..', '..') // src/scripts/acceptance -> 项目根
export const DELIVER = join(ROOT, 'deliverables')

/** 读取项目根 .env（与 e2e-test.mjs 同解析逻辑） */
export function loadEnv() {
  const envFile = join(ROOT, '.env')
  const env = {}
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
    }
  }
  return {
    url: env.TARO_APP_SUPABASE_URL || 'https://pyqgsxcjmijtbstwthbn.supabase.co',
    anon: env.TARO_APP_SUPABASE_ANON_KEY || '',
    appId: env.TARO_APP_APP_ID || '',
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
  }
}

/** HTTP 探针：超时 + 文本/JSON 解析，失败不抛 */
export async function probe(url, init = {}, timeoutMs = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON */ }
    return { status: res.status, ok: res.ok, text, json, error: null }
  } catch (e) {
    return { status: 0, ok: false, text: '', json: null, error: e.name === 'AbortError' ? `timeout>${timeoutMs}ms` : e.message }
  } finally {
    clearTimeout(timer)
  }
}

export const NOW = () => new Date().toISOString()
export const tsShort = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

/**
 * 结果记录器。每条记录：
 *   category 模块（准入检查 / 接口自动化 / UI 静态 / 业务链路 / 性能 / 安全 / 兼容性）
 *   name     检查项
 *   status   PASS | WARN | FAIL | BLOCK
 *   severity P0 | P1 | P2 | P3 | NA（仅 FAIL 才参与分级裁决）
 *   detail   描述
 *   evidence 证据（文件:行 / 接口响应码 / 命令输出片段）
 */
export class Reporter {
  constructor() { this.records = [] }
  add(r) {
    const rec = { ts: NOW(), ...r }
    this.records.push(rec)
    const icon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', BLOCK: '🚫' }[r.status] || '·'
    const sev = r.severity && r.severity !== 'NA' ? `[${r.severity}]` : ''
    console.log(`  ${icon} ${r.category} · ${r.name}${sev}${r.detail ? ' — ' + r.detail : ''}`)
    return rec
  }
  pass(c, n, d = '', e = '') { return this.add({ category: c, name: n, status: 'PASS', severity: 'NA', detail: d, evidence: e }) }
  warn(c, n, d = '', e = '', sev = 'NA') { return this.add({ category: c, name: n, status: 'WARN', severity: sev, detail: d, evidence: e }) }
  fail(c, n, sev, d = '', e = '') { return this.add({ category: c, name: n, status: 'FAIL', severity: sev, detail: d, evidence: e }) }
  block(c, n, d = '', e = '') { return this.add({ category: c, name: n, status: 'BLOCK', severity: 'P0', detail: d, evidence: e }) }

  counts() {
    const c = { PASS: 0, WARN: 0, FAIL: 0, BLOCK: 0 }
    for (const r of this.records) c[r.status] = (c[r.status] || 0) + 1
    return c
  }
  /** 仅统计 FAIL 的缺陷分级（按规范 P0-P3） */
  defects() {
    const d = { P0: 0, P1: 0, P2: 0, P3: 0 }
    for (const r of this.records) if (r.status === 'FAIL' && r.severity && d[r.severity] !== undefined) d[r.severity]++
    return d
  }
}

/**
 * 准入 / 退出裁决（依据规范阶段3 缺陷分级规则）
 *   P0 阻断级：核心业务不可用 → 出现任意 1 个即验收失败，终止
 *   P1 严重级：重要功能异常 → 最多允许 0 个
 *   P2 一般缺陷：UI/文案/次要 → 允许少量，产品确认可上线
 *   P3 优化建议：不计入阻断
 * 另：BLOCK（准入门禁未过）直接判 REJECT。
 */
export function adjudicate(rep) {
  const d = rep.defects()
  const blocks = rep.records.filter(r => r.status === 'BLOCK')
  if (blocks.length > 0) {
    return { verdict: 'REJECT', reason: `准入门禁未过 ${blocks.length} 项（${blocks.map(b => b.name).join('、')}），不进入正式自动测试`, d }
  }
  if (d.P0 > 0) {
    return { verdict: 'REJECT', reason: `出现 ${d.P0} 个 P0 阻断级缺陷，验收直接失败，终止流程`, d }
  }
  if (d.P1 > 0) {
    return { verdict: 'REJECT', reason: `出现 ${d.P1} 个 P1 严重级缺陷（规则：最多允许 0 个）`, d }
  }
  if (d.P2 > 0) {
    return { verdict: 'CONDITIONAL', reason: `存在 ${d.P2} 个 P2 一般缺陷，产品确认后可上线`, d }
  }
  return { verdict: 'PASS', reason: '无 P0/P1 缺陷，P2/P3 在允许范围内，验收通过', d }
}

/** 写出 JSON + Markdown 报告 */
export function writeReports(rep, gate, verdict) {
  if (!existsSync(DELIVER)) mkdirSync(DELIVER, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const base = join(DELIVER, `验收自动化报告_${date}`)
  const json = {
    timestamp: NOW(),
    project: 'app-coobohaoham9',
    stack: 'Taro4 + Supabase + admin-web(Vue3)',
    supabase_url: gate.url,
    spec: '自动化检测/缺陷分级/验收准入退出（适配本栈）',
    gate_ok: gate.ok,
    gate_items: gate.items,
    summary: rep.counts(),
    defects: rep.defects(),
    verdict,
    results: rep.records,
  }
  writeFileSync(base + '.json', JSON.stringify(json, null, 2))

  const md = [
    `# 来店有喜 V3 · 验收自动化报告`,
    '',
    `> 生成时间：${NOW()}  `,
    `> 技术栈：Taro4 + Supabase + admin-web（规范原稿 SpringBoot/RDS/OSS/UniApp 已适配本栈）`,
    `> Supabase：${gate.url}`,
    '',
    `## 一、验收裁决`,
    '',
    `**结论：${verdict.verdict === 'PASS' ? '✅ 验收合格（准入/退出条件满足）' : verdict.verdict === 'CONDITIONAL' ? '🟡 有条件通过（P2 需产品确认）' : '🔴 验收不合格（阻断级缺陷）'}**`,
    '',
    `- 裁决理由：${verdict.reason}`,
    `- 缺陷分布：P0=${verdict.d.P0}  P1=${verdict.d.P1}  P2=${verdict.d.P2}  P3=${verdict.d.P3}`,
    `- 用例统计：${JSON.stringify(rep.counts())}`,
    '',
    `## 二、阶段1 准入门禁（不满足不启动自动检测）`,
    '',
    ...gate.items.map(i => `- ${i.ok ? '✅' : '🚫'} ${i.name}${i.detail ? ' — ' + i.detail : ''}`),
    '',
    `## 三、阶段2/3 自动化检测明细`,
    '',
    `| 模块 | 检查项 | 状态 | 等级 | 详情 | 证据 |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...rep.records.map(r => `| ${r.category} | ${r.name} | ${r.status} | ${r.severity || ''} | ${String(r.detail || '').replace(/\|/g, '\\|')} | ${String(r.evidence || '').replace(/\|/g, '\\|').slice(0, 80)} |`),
    '',
    `## 四、CI / 手动扩展点（本沙箱未执行，需 CI 环境）`,
    '',
    `- 性能压测（JMeter）：核心接口 <300ms / 95分位 <500ms / 并发200 无5xx —— 见 src/scripts/acceptance/perf-thresholds.json`,
    `- 小程序 UI 自动化（Airtest + 微信开发者工具）：页面路由/表单/授权/兼容性 —— 见 src/scripts/acceptance/airtest-entry.js`,
    `- 安全扫描（越权/XSS/敏感信息泄露/防刷）：接入 CI 后跑 OWASP ZAP 或自研用例`,
    '',
    `## 五、交付物`,
    '',
    `- 本报告 JSON：${base}.json`,
    `- 接口/链路详情：复用 src/scripts/e2e-test.mjs 输出的一级测试报告`,
    '',
  ].join('\n')
  writeFileSync(base + '.md', md)
  return base
}
