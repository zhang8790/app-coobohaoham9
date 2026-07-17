// fix-1856-email-login.js
// 修复 18565613635 只能用手机号 OTP 登录的问题：
// 通过 Admin API 给该账号补上 email 身份并设置密码 12345678，
// 使小程序「账号密码登录」可用。
//
// 运行：
//   export SUPABASE_URL="https://pyqgsxcjmijtbstwthbn.supabase.co"
//   node scripts/fix-1856-email-login.js "<SUPABASE_SERVICE_ROLE_KEY>"

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const PHONE = '+8618565613635'
const EMAIL = 'test18565613635@test.com'
const PASSWORD = '12345678'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('用法: node scripts/fix-1856-email-login.js "<SUPABASE_SERVICE_ROLE_KEY>"')
  console.error('且需先 export SUPABASE_URL="https://pyqgsxcjmijtbstwthbn.supabase.co"')
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

async function authAdminUpdate(userId, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) { console.error(`  ❌ PUT /auth/v1/admin/users/${userId} -> ${res.status} ${text}`); return null }
  try { return JSON.parse(text) } catch { return text }
}

async function main() {
  console.log(`--- 1) 在 profiles 查找 ${PHONE} 对应的 auth id ---`)
  const profiles = await rest(`profiles?phone=eq.${PHONE}&select=id,phone,referrer_id,referral_code&limit=1`)
  if (!profiles || !profiles.length) {
    console.error(`❌ 找不到 phone=${PHONE} 的 profile；请确认账号已创建`)
    return
  }
  const userId = profiles[0].id
  console.log(`✅ 找到用户 id=${userId}，准备更新 email + password`)

  console.log('--- 2) 通过 Admin API 更新 email 与密码 ---')
  const updated = await authAdminUpdate(userId, {
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })
  if (!updated) {
    console.error('❌ 更新失败，请检查 service_role key 是否有权限')
    return
  }
  console.log(`✅ 已更新：email=${updated.email}, email_confirmed_at=${updated.email_confirmed_at}`)
  console.log('--- 完成 ---')
  console.log(`现在可用「账号密码登录」：手机号 ${PHONE.replace('+86', '')} / 密码 ${PASSWORD}`)
}

main().catch(e => console.error(e))
