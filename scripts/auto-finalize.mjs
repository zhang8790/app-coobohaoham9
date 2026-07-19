#!/usr/bin/env node
// 自动化收口清单 · 一键复制粘贴
// 检测所有待用户本机执行的项目，输出可粘贴的 SQL / 函数代码 / 验证探针
// 用法：node scripts/auto-finalize.mjs [--sql-only] [--funcs-only] [--probes-only]

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations')
const FUNCS_DIR = join(ROOT, 'supabase/functions')
const args = process.argv.slice(2)

const sections = []

// ============ 1. 迁移清单 ============
if (!args.includes('--funcs-only') && !args.includes('--probes-only')) {
  const migrations = [
    { no: '00054', name: '扩展列（orders/products/commissions）',  status: '⏳ 待执行' },
    { no: '00072', name: 'emotion_* 5 表 RLS 收口（DISABLE）', status: '⏳ 待执行' },
    { no: '00073', name: '情绪徽章种子', status: '⏳ 待执行' },
    { no: '00074', name: 'body_templates 表', status: '⏳ 待执行' },
    { no: '00075', name: 'points_logs DISABLE RLS', status: '⏳ 待执行' },
    { no: '00076', name: 'tongbao_logs 表(原gold_bean_logs)', status: '⏳ 待执行' },
    { no: '00077', name: 'withdrawals 身份证/真实姓名', status: '⏳ 待执行' },
    { no: '00078', name: 'tongbao_amount 改 numeric + tongbao_logs 强制 DISABLE RLS', status: '⏳ 待执行' },
    { no: '00080', name: '原子 RPC + 唯一索引', status: '⏳ 待执行' },
    { no: '00082', name: 'orders 加 channel_fee / channel_fee_rate', status: '⏳ 待执行' },
    { no: '00083', name: 'commissions 加 channel_fee/tax_withheld/net_amount + orders.tax_withheld', status: '⏳ 待执行' },
    { no: '00084', name: 'notifications 通知中心表', status: '⏳ 待执行' },
  ]

  let out = '═'.repeat(60) + '\n'
  out += '  📋 迁移清单（按顺序执行，全部幂等）\n'
  out += '═'.repeat(60) + '\n\n'
  for (const m of migrations) {
    out += `  [${m.status}]  ${m.no}  ${m.name}\n`
    out += `     文件：supabase/migrations/${m.no}_*.sql\n`
  }
  out += '\n📌 操作：Dashboard → SQL Editor → 依次 New Query → 粘贴 .sql 全文 → Run\n\n'
  sections.push({ title: '迁移', body: out })
}

// ============ 2. 云函数清单 ============
if (!args.includes('--sql-only') && !args.includes('--probes-only')) {
  const funcs = [
    { name: 'send-notification', desc: '【新】通知中心云函数（写库+调订阅消息）', env: 'WX_APPID, WX_SECRET, TMPL_5个' },
    { name: 'wechat-payment-callback', desc: 'D1~D3 修复：透传 stores.referral_rate + send-notification', env: 'MCH_API_V3_KEY, WECHAT_PAY_*' },
    { name: 'distribute-commission', desc: 'D1~D3 修复：discount_rate 小数口径 + 通道费+代扣税分摊 + send-notification', env: 'CHANNEL_FEE_RATE 可选' },
    { name: 'refund-order', desc: '加 send-notification (refund_result)', env: 'MCH_API_V3_KEY' },
    { name: 'wechat-refund-callback', desc: '加 send-notification (refund_result)', env: 'MCH_API_V3_KEY' },
  ]

  let out = '═'.repeat(60) + '\n'
  out += '  ☁️ 云函数清单（Dashboard 贴代码部署）\n'
  out += '═'.repeat(60) + '\n\n'
  for (const f of funcs) {
    out += `  ⏳ ${f.name}\n`
    out += `     ${f.desc}\n`
    out += `     Env: ${f.env}\n`
    out += `     路径：supabase/functions/${f.name}/index.ts\n\n`
  }
  out += '📌 操作：Dashboard → Edge Functions → Create/Edit → 粘贴 index.ts 全文 → Deploy\n'
  sections.push({ title: '云函数', body: out })
}

// ============ 3. 探针清单 ============
const envFile = join(ROOT, '.env')
const env = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'))
        .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
    ) : {}
const URL = env.TARO_APP_SUPABASE_URL || 'https://pyqgsxcjmijtbstwthbn.supabase.co'
const REF = URL.replace('https://', '').replace('.supabase.co', '')

if (!args.includes('--sql-only') && !args.includes('--funcs-only')) {
  let out = '═'.repeat(60) + '\n'
  out += '  🩺 验证探针（curl / 浏览器直接打开）\n'
  out += '═'.repeat(60) + '\n\n'
  out += `# 1) send-notification 单发（应返回 sent:false, reason:no_openid）\n`
  out += `curl -s -X POST "${URL}/functions/v1/send-notification" \\\\\n`
  out += `  -H "apikey: ${env.TARO_APP_SUPABASE_ANON_KEY?.slice(0, 20)}..." \\\\\n`
  out += `  -H "Content-Type: application/json" \\\\\n`
  out += `  -d '{"user_id":"00000000-0000-0000-0000-000000000000","type":"order_paid","title":"探针","body":"测试"}'\n\n`

  out += `# 2) distribute-commission 幂等探针（应返回 success:true, skipped:true）\n`
  out += `curl -s -X POST "${URL}/functions/v1/distribute-commission" \\\\\n`
  out += `  -H "apikey: ${env.TARO_APP_SUPABASE_ANON_KEY?.slice(0, 20)}..." \\\\\n`
  out += `  -H "Content-Type: application/json" \\\\\n`
  out += `  -d '{"order_id":"00000000-0000-0000-0000-000000000000","order_no":"PROBE","payer_id":"x","total_amount":0,"net_amount":0,"referrer_id":null,"discount_rate":0.09}'\n\n`

  out += `# 3) 数据库：notifications 表行数\n`
  out += `curl -s -H "apikey: ${env.TARO_APP_SUPABASE_ANON_KEY?.slice(0, 20)}..." \\\\\n`
  out += `  "${URL}/rest/v1/notifications?select=id&limit=1" -w "\\nstatus=%{http_code}\\n"\n\n`

  out += `# 4) 数据库：orders.channel_fee / tax_withheld 列存在性\n`
  out += `curl -s -H "apikey: ${env.TARO_APP_SUPABASE_ANON_KEY?.slice(0, 20)}..." \\\\\n`
  out += `  "${URL}/rest/v1/orders?select=id,channel_fee,tax_withheld&limit=1" -w "\\nstatus=%{http_code}\\n"\n\n`
  sections.push({ title: '探针', body: out })
}

// ============ 输出 ============
for (const s of sections) {
  console.log(s.body)
}

// 一键存为 markdown
if (!args.includes('--no-save')) {
  const mdPath = join(ROOT, 'deliverables/自动收口清单_' + new Date().toISOString().slice(0, 10) + '.md')
  const md = sections.map(s => s.body).join('\n')
  writeFileSync(mdPath, md)
  console.log(`\n📄 已落档：${mdPath}`)
}
