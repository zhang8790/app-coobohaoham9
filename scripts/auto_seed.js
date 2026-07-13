// 自动检测 + 写入测试数据
// 运行：node scripts/auto_seed.js

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDk4MTQzMDMyLCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwic3ViIjoiYW5vbmUifQ.3N9FG29GyKFP5N2bzWBoxb22FrF1aItWRKdkHAfkkFQ'

const headers = (token) => ({
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${token || ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

async function api(path, opts = {}, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...headers(token), ...opts.headers },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  return JSON.parse(text)
}

// ============ 检测 ============
async function detect() {
  console.log('🔍 检测 Supabase 连通性...\n')
  try {
    const data = await api('profiles?select=id&limit=1')
    console.log('✅ anon key 可读取 profiles，RLS 已禁用或表中无数据')
    console.log('   当前数据：', JSON.stringify(data))
    return data.length
  } catch (e) {
    console.log('❌ anon key 无法读取：', e.message.slice(0, 120))
    console.log('   需要：1) 在 Supabase Dashboard 执行 disable_rls_dev.sql')
    console.log('         2) 或提供 service key 自动写入')
    return -1
  }
}

// ============ 主流程 ============
;(async () => {
  const count = await detect()
  
  if (count === 0) {
    console.log('\n📝 表中无数据，开始自动写入测试数据...')
    console.log('   需要 service key 或已禁用 RLS')
    console.log('\n⚠️ 由于安全限制，自动写入需要以下之一：')
    console.log('   1. 在 Supabase Dashboard → SQL Editor 执行：')
    console.log('      C:\\Users\\zhanglin\\Desktop\\app-coobohaoham9\\supabase\\seed_test_data.sql')
    console.log('   2. 提供 Supabase service key，我自动写入')
    console.log('\n📋 SQL 文件已生成在：supabase/seed_test_data.sql')
  } else if (count > 0) {
    console.log('\n✅ 数据库中已有数据，无需重复写入')
    console.log('   直接打开 http://localhost:5173 测试管理后台即可')
  } else {
    console.log('\n❌ 无法连接，请检查 Supabase 配置')
  }
})()
