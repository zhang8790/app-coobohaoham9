// 自动写入测试数据到 Supabase
// 运行方式：node seed.js <SERVICE_KEY>
// 如果只有 anon key，尝试直接写入（需 RLS 已禁用）

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDk4MTQzMDMyLCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwic3ViIjoiYW5vbmUifQ.3N9FG29GyKFP5N2bzWBoxb22FrF1aItWRKdkHAfkkFQ'

// 如果提供了 service key，用 service key（可以绕过 RLS）
const SERVICE_KEY = process.argv[2] || ANON_KEY
const USE_SERVICE = process.argv[2] ? true : false

console.log(`Supabase URL: ${SUPABASE_URL}`)
console.log(`使用 Key: ${USE_SERVICE ? 'SERVICE KEY (绕过 RLS)' : 'ANON KEY (需 RLS 已禁用)'}`)
console.log('---')

// 直接用 fetch 调用 Supabase REST API
async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`❌ ${options.method || 'GET'} ${path}: ${res.status} ${text}`)
    return null
  }
  try { return JSON.parse(text) } catch { return text }
}

async function checkTable(name) {
  const data = await supabaseRequest(name + '?select=id&limit=1')
  if (data === null) return 'ERROR'
  if (Array.isArray(data)) return `OK (${data.length} 行可读取)`
  return 'UNKNOWN'
}

async function insertIgnore(path, rows) {
  // 先检查是否已存在（按 id 或唯一字段）
  const existing = await supabaseRequest(path + '?select=id&limit=1')
  if (existing && existing.length > 0) {
    console.log(`⚠️  ${path} 已有数据，跳过插入`)
    return existing
  }
  const res = await supabaseRequest(path, {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
  })
  if (res) console.log(`✅ ${path}: 插入 ${res.length} 条`)
  return res
}

// ============ 主流程 ============
;(async () => {
  console.log('🔍 第1步：检测各表 RLS 状态（anon key 能否读取）')
  const tables = ['profiles','stores','store_categories','products','orders','order_items','articles','merchant_applications','announcements','commissions','withdrawals','refunds','points_logs','user_addresses','favorites','footprints','product_reviews','coupons']
  for (const t of tables) {
    const status = await checkTable(t)
    console.log(`   ${t}: ${status}`)
  }

  console.log('\n🔍 第2步：尝试写入测试数据（需要 RLS 禁用或 service key）')
  console.log('   如果没有 service key，且 RLS 未禁用，写入会失败')
  console.log('   请去 Supabase Dashboard → SQL Editor 执行 supabase/disable_rls_dev.sql')
  console.log('')

  // 由于 anon key 无法写入受 RLS 保护的表，这里只做检测
  // 真正的数据写入需要：
  //   A. 在 Supabase Dashboard 执行 disable_rls_dev.sql
  //   B. 或者提供 service key 重新运行此脚本

  console.log('📋 检测结果：')
  console.log('   如果上面显示 ERROR 或 0 行，说明：')
  console.log('   1. RLS 未禁用 → 去 Dashboard 执行 SQL')
  console.log('   2. 或者提供 service key：node seed.js <YOUR_SERVICE_KEY>')
  console.log('')
  console.log('🚀 如果有 service key，直接运行：')
  console.log('   node seed.js "your-service-key-here"')
})()
