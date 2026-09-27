// 快速检测 Supabase 连接状态
// 在浏览器控制台执行此脚本

(async () => {
  console.log('🔍 开始检测后端连接...')

  // 1. 检查环境变量
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  console.log('📁 环境变量:')
  console.log('  URL:', url ? '✅ 已配置' : '❌ 未配置')
  console.log('  ANON KEY:', key ? '✅ 已配置' : '❌ 未配置')

  if (!url || !key) {
    console.error('❌ 环境变量缺失，请检查 .env 文件')
    return
  }

  // 2. 创建 Supabase 客户端
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key)

  // 3. 测试连接（受 RLS 影响）
  console.log('\n📡 测试 API 连接...')
  try {
    const { data, error, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .limit(0)

    if (error) {
      console.error('❌ API 调用失败:', error.message)
      console.error('   错误代码:', error.code)
      console.error('   错误详情:', error.details)

      if (error.message?.includes('permission denied') || error.code === '42501') {
        console.warn('⚠️ RLS 阻止访问！请在 Supabase Dashboard 执行以下 SQL:')
        console.warn(`
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
        `)
      }
      return
    }

    console.log('✅ API 连接成功！')
    console.log('   可访问数据条数 (profiles):', count)

    // 4. 测试查询实际数据
    console.log('\n📥 测试查询数据...')
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, nickname, phone, role')
      .limit(5)

    if (profileError) {
      console.error('❌ 查询数据失败:', profileError.message)
      return
    }

    console.log('✅ 查询数据成功！')
    console.log('   获取到', profiles?.length || 0, '条记录')
    console.table(profiles)

    // 5. 测试其他表
    console.log('\n📊 测试其他表...')
    const tables = ['stores', 'products', 'orders', 'withdrawals', 'announcements']
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .limit(0)

      if (error) {
        console.warn(`⚠️ ${table}:`, error.message)
      } else {
        console.log(`✅ ${table}:`, count, '条记录')
      }
    }

    console.log('\n🎉 所有检测通过！管理后台可以连接真实后端了。')
    console.log('👉 请确保 .env.local 中 VITE_USE_MOCK=false')

  } catch (e) {
    console.error('❌ 连接异常:', e)
  }
})()
