// 真正自动执行：注册管理员 → 获取 JWT → 写入测试数据
// 运行：node scripts/auto_seed_v2.js

const SUPABASE_URL = 'https://backend.appmiaoda.com/projects/supabase330158129083891712'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDk4MTQzMDMyLCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwic3ViIjoiYW5vbmUifQ.3N9FG29GyKFP5N2bzWBoxb22FrF1aItWRKdkHAfkkFQ'

const authHeaders = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
}

const REST = (token) => ({
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

async function post(path, body, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders, ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function put(path, body, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'PUT',
    headers: { ...REST(token) },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function get(path, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: REST(token),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function insert(path, rows, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...REST(token), 'Prefer': 'return=representation' },
    body: JSON.stringify(rows),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

// ============ 主流程 ============
;(async () => {
  console.log('🚀 开始自动写入测试数据...\n')

  // 第1步：注册/登录管理员账号
  console.log('📋 第1步：注册管理员账号...')
  let jwt = null
  let userId = null

  try {
    // 尝试注册
    const signup = await post('/auth/v1/signup', {
      email: 'admin@laidianyouxi.com',
      password: 'Admin123456',
      data: { nickname: '管理员', role: 'admin' },
    }, null)
    jwt = signup.session?.access_token
    userId = signup.user?.id
    console.log('✅ 注册成功，用户 ID：', userId)
  } catch (e) {
    // 已注册，尝试登录
    console.log('   （账号已存在，尝试登录...）')
    try {
      const login = await post('/auth/v1/token?grant_type=password', {
        email: 'admin@laidianyouxi.com',
        password: 'Admin123456',
      }, null)
      jwt = login.access_token
      userId = login.user?.id
      console.log('✅ 登录成功，用户 ID：', userId)
    } catch (e2) {
      console.log('❌ 登录失败：', e2.message.slice(0, 150))
      console.log('   请在 Supabase Dashboard → Authentication → Users 中手动创建账号')
      console.log('   邮箱：admin@laidianyouxi.com  密码：Admin123456')
      return
    }
  }

  if (!jwt) { console.log('❌ 无法获取 JWT'); return }

  // 第2步：写入 profiles（需要 insert 权限）
  console.log('\n📋 第2步：写入 profiles...')
  try {
    // 先检查是否已存在
    const existing = await get(`profiles?id=eq.${userId}`, jwt)
    if (existing.length === 0) {
      await insert('profiles', [{
        id: userId,
        nickname: '管理员',
        username: 'admin',
        role: 'admin',
        level: '盟主',
        points: 9999,
        balance: 0,
        created_at: new Date().toISOString(),
      }], jwt)
      console.log('✅ profiles 写入成功')
    } else {
      console.log('⚠️  profiles 已存在，跳过')
    }
  } catch (e) {
    console.log('❌ profiles 写入失败：', e.message.slice(0, 150))
    console.log('   原因：RLS 阻止写入，请在 Supabase Dashboard 执行：')
    console.log('   ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;')
  }

  console.log('\n📊 检测结果：')
  console.log('   如果看到 ❌ 写入失败，说明 RLS 仍未禁用')
  console.log('   请去 Supabase Dashboard → SQL Editor 执行：')
  console.log('   ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;')
  console.log('   （对所有表执行此操作）')
  console.log('\n   或者提供 Supabase service key，我直接绕过 RLS 写入')
})()
