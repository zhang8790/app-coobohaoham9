// 自动执行数据库迁移：给 products 表新增字段
// 通过 Supabase pg 端点执行 SQL

const https = require('https');
const fs = require('fs');
const path = require('path');

// 读取 .env.production
const envContent = fs.readFileSync(path.join(__dirname, '.env.production'), 'utf8');
const urlMatch = envContent.match(/TARO_APP_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/TARO_APP_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.error('❌ 找不到 Supabase URL 或 ANON_KEY');
  process.exit(1);
}

const SUPABASE_URL = urlMatch[1].trim();
const ANON_KEY = keyMatch[1].trim();

// 读取迁移 SQL
const sqlPath = path.join(__dirname, 'supabase/migrations/00010_add_product_new_fields.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('📦 Supabase URL:', SUPABASE_URL);
console.log('📝 SQL to execute:');
console.log(sql);
console.log('---');

// 尝试通过 Supabase /pg 端点执行 SQL（需要 service role key，anon key 会失败）
// 这里先试 anon key，如果失败则提示用户手动执行
function tryExecuteSQL() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query: sql });
    
    const url = new URL('/pg', SUPABASE_URL);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('HTTP Status:', res.statusCode);
        console.log('Response:', data);
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => { reject(e); });
    req.write(postData);
    req.end();
  });
}

// 也尝试通过 TCB 代理的 /sql 端点
function tryExecuteSQL_TCB() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ sql });
    
    const url = new URL('/sql', SUPABASE_URL);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('TCB SQL HTTP Status:', res.statusCode);
        console.log('TCB SQL Response:', data);
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => { reject(e); });
    req.write(postData);
    req.end();
  });
}

(async () => {
  console.log('🚀 尝试自动执行数据库迁移...');
  
  // 方法1: 尝试 /pg 端点
  try {
    console.log('\n📍 方法1: 尝试 /pg 端点...');
    await tryExecuteSQL();
    console.log('✅ 迁移执行成功！');
    return;
  } catch (e) {
    console.log('❌ 方法1失败:', e.message);
  }

  // 方法2: 尝试 TCB /sql 端点
  try {
    console.log('\n📍 方法2: 尝试 TCB /sql 端点...');
    await tryExecuteSQL_TCB();
    console.log('✅ 迁移执行成功！');
    return;
  } catch (e) {
    console.log('❌ 方法2失败:', e.message);
  }

  console.log('\n⚠️ 自动执行失败，需要手动执行 SQL');
  console.log('\n📋 请在 Supabase 后台 SQL Editor 中执行以下 SQL：');
  console.log('---SQL START---');
  console.log(sql);
  console.log('---SQL END---');
  console.log('\n🔗 Supabase 后台: https://app.supabase.com/project/supabase330158129083891712/sql');
})();
