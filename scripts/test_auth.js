// 方案：走 Supabase Auth 登录 → 获取 JWT → 读写数据
const SUPABASE_URL = 'https://backend.appmiaoda.com/projects/supabase330158129083891712'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDk4MTQzMDMyLCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwic3ViIjoiYW5vbmUifQ.3N9FG29GyKFP5N2bzWBoxb22FrF1aItWRKdkHAfkkFQ'

const h = (token) => ({
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${token || ANON_KEY}`,
  'Content-Type': 'application/json',
})

async function req(path, method = 'GET', body, token) {
  const url = `${SUPABASE_URL}${path}`
  const res = await fetch(url, { method, headers: h(token), body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`)
  try { return JSON.parse(text) } catch { return text }
}

;(async () => {
  console.log('🔐 尝试登录 Supabase Auth...\n')

  // 尝试用 admin 账号登录（如果已注册）
  let jwt = null
  let uid = null

  try {
    const login = await req('/auth/v1/token?grant_type=password', 'POST', {
      email: 'admin@laidianyouxi.com',
      password: 'Admin123456',
    }, null)
    jwt = login.access_token
    uid = login.user?.id
    console.log('✅ 登录成功！用户 ID：', uid)
  } catch (e) {
    console.log('❌ 登录失败：', e.message.slice(0, 200))
    console.log('\n📋 需要先在 Supabase Dashboard → Authentication → Users 中创建用户：')
    console.log('   邮箱：admin@laidianyouxi.com')
    console.log('   密码：Admin123456')
    console.log('   然后在 Profiles 表中手动设置 role = admin')
    return
  }

  // 尝试读取 profiles
  console.log('\n🔍 用 JWT 读取 profiles...')
  try {
    const data = await req('/rest/v1/profiles?select=id,nickname,role&limit=3', 'GET', null, jwt)
    console.log('✅ 读取成功：', JSON.stringify(data, null, 2))
  } catch (e) {
    console.log('❌ 读取失败：', e.message.slice(0, 200))
  }
})()
