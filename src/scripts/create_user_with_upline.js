// 创建（或确保存在）一个手机号用户，并绑定上级（上线），使用 service_role 权限。
//
// 前置：
//   export SUPABASE_URL="https://<project-ref>.supabase.co"
// 运行：
//   node scripts/create_user_with_upline.js <新用户手机号> <登陆密码> <上线手机号> "<SERVICE_ROLE_KEY>"
//
// 例（本项目）：
//   export SUPABASE_URL="https://pyqgsxcjmijtbstwthbn.supabase.co"
//   node scripts/create_user_with_upline.js 13526245633 123456789 18565613635 "<你的 SERVICE_ROLE KEY>"
//
// 行为：
//   1) 若新用户不存在 -> 用指定密码创建（phone_confirm=true，可直接密码登录）
//      若已存在     -> 将其密码更新为指定密码（幂等覆盖，会打印提示）
//   2) 查找上线手机号对应的 profile（兼容 +86 / 裸号两种格式）
//   3) 将新用户 profiles.referrer_id 绑定为上线 id（已正确则不动）
//   4) 确保新用户有 referral_code（trigger 应已生成，缺失则补）
//
// 注意：SERVICE_ROLE KEY 拥有绕过 RLS 的超级权限，切勿提交进仓库 / 泄露。

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.argv[5] || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const NEW_PHONE = process.argv[2]
const NEW_PASSWORD = process.argv[3]
const UPLINE_PHONE = process.argv[4]

if (!SUPABASE_URL || !SERVICE_KEY || !NEW_PHONE || !NEW_PASSWORD || !UPLINE_PHONE) {
  console.error('用法: node scripts/create_user_with_upline.js <新手机号> <密码> <上线手机号> "<SERVICE_ROLE_KEY>"')
  console.error('且需先 export SUPABASE_URL="https://xxxx.supabase.co"')
  process.exit(1)
}

if (String(NEW_PASSWORD).length < 6) {
  console.error('❌ 密码长度至少 6 位（Supabase 默认策略），请换更长的密码')
  process.exit(1)
}

const H = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const text = await res.text()
  if (!res.ok) { console.error(`  ❌ ${opts.method || 'GET'} /rest/v1/${path} -> ${res.status} ${text}`); return null }
  try { return JSON.parse(text) } catch { return text }
}

async function authAdmin(path, body, method = 'POST') {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) { console.error(`  ❌ /auth/v1/${path} -> ${res.status} ${text}`); return null }
  try { return JSON.parse(text) } catch { return text }
}

// 兼容 +86 / 裸号两种格式查找 profile
async function findProfileByPhone(phone) {
  for (const p of [phone, `+86${phone}`, `+${phone}`]) {
    const r = await rest(`profiles?phone=eq.${encodeURIComponent(p)}&select=id,phone,referral_code,referrer_id&limit=1`)
    if (r && r.length) return r[0]
  }
  return null
}

// phone -> E.164 规范化（Supabase GoTrue 强制要求，裸号会被 400 拒绝）
function toE164(phone) {
  const p = String(phone || '').trim()
  if (!p) return p
  if (p.startsWith('+')) return p
  if (p.startsWith('00')) return '+' + p.slice(2)
  if (/^1[3-9]\d{9}$/.test(p)) return `+86${p}`
  return p
}

async function findOrCreateUser(phone, password) {
  const e164 = toE164(phone)
  const existing = await findProfileByPhone(phone)
  if (existing) {
    console.log(`✅ 用户已存在: ${phone} (id=${existing.id}) -> 更新密码为指定值`)
    const upd = await authAdmin(`admin/users/${existing.id}`, { password }, 'PUT')
    if (!upd) { console.error(`❌ 密码更新失败: ${phone}`); return null }
    return existing
  }
  // email 用裸号（与前端 signInWithUsername 派生规则 test<裸号>@test.com 一致）；phone 用 E.164
  const email = `test${phone}@test.com`
  const created = await authAdmin('admin/users', {
    phone: e164,
    email,
    password,
    phone_confirm: true,
    email_confirm: true,
    user_metadata: { phone: e164, nickname: phone },
  })
  if (!created || !created.id) { console.error(`❌ 创建用户失败: ${phone}`); return null }
  console.log(`✅ 已创建用户: ${phone} (id=${created.id})  密码=${password}`)
  await new Promise((r) => setTimeout(r, 800)) // 等 trigger 生成 profile + referral_code
  const prof = await findProfileByPhone(phone)
  return prof && prof.id ? prof : { id: created.id, phone }
}

async function main() {
  console.log('--- 1) 确认上线账号存在 ---')
  const upline = await findProfileByPhone(UPLINE_PHONE)
  if (!upline) {
    console.error(`❌ 上线 ${UPLINE_PHONE} 不存在，请先确保其账号已注册（可先跑 scripts/setup_referrer.js 或用正常流程注册）`)
    process.exit(1)
  }
  console.log(`✅ 上线: ${UPLINE_PHONE} (id=${upline.id}, referral_code=${upline.referral_code || '(待补)'})`)

  console.log('--- 2) 创建 / 更新新用户 ---')
  const user = await findOrCreateUser(NEW_PHONE, NEW_PASSWORD)
  if (!user) return

  if (!user.referral_code) {
    const code = String(user.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
    await rest(`profiles?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ referral_code: code }) })
    console.log(`✅ 已补充 referral_code: ${code}`)
  }

  console.log('--- 3) 绑定上级关系 ---')
  if (user.referrer_id === upline.id) {
    console.log(`✅ 关系已正确：${NEW_PHONE}.referrer_id = ${UPLINE_PHONE}（无需改动）`)
    return
  }
  const ok = await rest(`profiles?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ referrer_id: upline.id }) })
  if (ok !== null) console.log(`✅ 已绑定：${UPLINE_PHONE} 是 ${NEW_PHONE} 的上级（一级推荐人 / L1）`)
}

main().then(() => console.log('--- 完成 ---')).catch((e) => console.error(e))
