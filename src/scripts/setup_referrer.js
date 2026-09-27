// 建立账号 18565613635 并设为 18701410500 的上级（一级推荐人 / L1）
//
// 前置条件：
//   1) 设置环境变量 SUPABASE_URL
//   2) 用 service_role key 运行（可绕过 RLS，且必须能写 auth.users / profiles）
//   3) 线上若报 "column referrer_id does not exist"，请先在 SQL Editor 跑 supabase/fix-referrer-id.sql
//
// 运行：
//   export SUPABASE_URL="https://xxxx.supabase.co"
//   node scripts/setup_referrer.js "<你的 SUPABASE SERVICE_ROLE KEY>"
//
// 说明：幂等——已存在则不重复创建；关系已正确则不动。

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('用法: node scripts/setup_referrer.js "<SERVICE_ROLE_KEY>"')
  console.error('且需先 export SUPABASE_URL="https://xxxx.supabase.co"')
  process.exit(1)
}

const H = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...H, ...(opts.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) { console.error(`  ❌ ${opts.method || 'GET'} /rest/v1/${path} -> ${res.status} ${text}`); return null }
  try { return JSON.parse(text) } catch { return text }
}

async function authAdmin(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) { console.error(`  ❌ /auth/v1/${path} -> ${res.status} ${text}`); return null }
  try { return JSON.parse(text) } catch { return text }
}

const SUPERIOR_PHONE = '18565613635'
const SUBORDINATE_PHONE = '18701410500'

async function findOrCreateUser(phone) {
  const existing = await rest(`profiles?phone=eq.${phone}&select=id,phone,referral_code,referrer_id&limit=1`)
  if (existing && existing.length) {
    console.log(`✅ 用户已存在: ${phone} (id=${existing[0].id})`)
    return existing[0]
  }
  const tempPwd = `Tmp${phone.slice(-6)}@` + Math.random().toString(36).slice(2, 6)
  const email = `test${phone}@test.com`
  const created = await authAdmin('admin/users', {
    phone,
    email,
    password: tempPwd,
    phone_confirm: true,
    email_confirm: true,
    user_metadata: { phone, nickname: phone },
  })
  if (!created || !created.id) {
    console.error(`❌ 创建用户失败: ${phone}`)
    return null
  }
  console.log(`✅ 已创建用户: ${phone} (id=${created.id})  临时密码=${tempPwd}（请尽快在 app 内修改）`)
  await new Promise((r) => setTimeout(r, 800)) // 等 trigger 生成 profile + referral_code
  const prof = await rest(`profiles?phone=eq.${phone}&select=id,phone,referral_code,referrer_id&limit=1`)
  return prof && prof.length ? prof[0] : { id: created.id, phone }
}

async function main() {
  console.log('--- 1) 确保上级账号存在 ---')
  const superior = await findOrCreateUser(SUPERIOR_PHONE)
  if (!superior) return
  console.log('--- 2) 确保下级账号存在 ---')
  const subordinate = await findOrCreateUser(SUBORDINATE_PHONE)
  if (!subordinate) return

  // 确保上级有推广码（trigger 应已生成，缺失则补）
  if (!superior.referral_code) {
    const code = String(superior.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
    await rest(`profiles?id=eq.${superior.id}`, { method: 'PATCH', body: JSON.stringify({ referral_code: code }) })
    console.log(`✅ 已为上级补充 referral_code: ${code}`)
  }

  console.log('--- 3) 绑定上级关系 ---')
  if (subordinate.referrer_id === superior.id) {
    console.log(`✅ 关系已正确：${SUBORDINATE_PHONE}.referrer_id = ${SUPERIOR_PHONE}（无需改动）`)
    return
  }
  const ok = await rest(`profiles?id=eq.${subordinate.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ referrer_id: superior.id }),
  })
  if (ok !== null) {
    console.log(`✅ 已绑定：${SUPERIOR_PHONE} 是 ${SUBORDINATE_PHONE} 的上级（一级推荐人 / L1）`)
  }
}

main().then(() => console.log('--- 完成 ---')).catch((e) => console.error(e))
