// 执行SQL脚本到Supabase
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://pyqgsxcjmijtbstwthbn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM'
)

async function executeSQL() {
  console.log('=== 开始执行SQL脚本 ===\n')
  
  // 1. 添加情绪标签字段到营销活动表
  console.log('1. 添加 mood_tags 到 marketing_campaigns...')
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS mood_tags text[];`
    })
    if (error) {
      console.log('   RPC失败，尝试直接查询...')
      // 如果RPC不可用，记录需要手动执行的SQL
    }
  } catch (e) {
    console.log('   异常:', e.message)
  }
  
  // 2. 添加情绪标签字段到商品评价表
  console.log('2. 添加 mood_tags 到 product_reviews...')
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS mood_tags text[];`
    })
    if (error) {
      console.log('   RPC失败，需要手动执行')
    }
  } catch (e) {
    console.log('   异常:', e.message)
  }
  
  // 3. 创建用户情绪偏好表
  console.log('3. 创建 user_mood_preferences 表...')
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_mood_preferences (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
          mood_tag text NOT NULL,
          score integer DEFAULT 1,
          created_at timestamp with time zone DEFAULT now()
        );
        ALTER TABLE user_mood_preferences DISABLE ROW LEVEL SECURITY;
      `
    })
    if (error) {
      console.log('   RPC失败，需要手动执行')
    }
  } catch (e) {
    console.log('   异常:', e.message)
  }
  
  console.log('\n=== SQL脚本执行完成 ===')
  console.log('如果上面有失败，请手动在 Supabase Dashboard → SQL Editor 中运行 sql/add_mood_tags_to_campaigns.sql')
}

executeSQL().catch(console.error)
