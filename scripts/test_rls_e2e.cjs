/* 端到端 RLS 测试：验证「商家上架商品」与「买家下单」写权限
 * 用法: node scripts/test_rls_e2e.cjs
 * 说明: 读取 .env 的 TARO_APP_SUPABASE_URL / TARO_APP_SUPABASE_ANON_KEY，
 *       用真库实测。测试数据以 __RLS_TEST__ 前缀标记并自动清理。
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const txt = fs.readFileSync(envPath, 'utf8');
  const env = {};
  txt.split('\n').forEach((l) => {
    const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  });
  return env;
}

const env = loadEnv();
const URL = env.TARO_APP_SUPABASE_URL;
const ANON = env.TARO_APP_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('缺少 TARO_APP_SUPABASE_URL / TARO_APP_SUPABASE_ANON_KEY');
  process.exit(1);
}

const anonClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const TEST = '__RLS_TEST__';
const stamp = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('=== 0) 连接 ', URL);

  // 1) 公开读 products（应成功）
  const { data: rd, error: re } = await anonClient.from('products').select('id').limit(1);
  console.log(`[公开读 products] ${re ? '失败: ' + re.message : '成功 rows=' + (rd ? rd.length : 0)}`);

  // 2) 未登录写 products（应被 RLS 拒绝 42501）
  const { error: ue } = await anonClient.from('products').insert({
    name: TEST + 'unauth', price: 1, stock: 1, store_id: '00000000-0000-0000-0000-000000000000',
  });
  console.log(`[未登录写 products] ${ue ? '被拒: ' + ue.code + ' ✅' : '竟然成功 ❌(写未受保护!)'}`);

  // 3) 取得已认证会话：优先用 .env 里的真实商家账号，否则尝试 signUp
  let uid = null;
  const testEmail = env.TARO_APP_TEST_EMAIL;
  const testPw = env.TARO_APP_TEST_PASSWORD;
  if (testEmail && testPw) {
    const { data: li, error: lie } = await authClient.auth.signInWithPassword({ email: testEmail, password: testPw });
    if (lie) console.log('[登录测试账号] 失败:', lie.message, '→ 改走 signUp');
    else if (li.session) { uid = li.user.id; console.log(`[登录测试账号] ✅ uid=${uid}`); }
  }
  if (!uid) {
    const email = `rls_e2e_${stamp}@example.com`;
    const pw = 'Test123456!';
    const { data: su, error: sue } = await authClient.auth.signUp({ email, password: pw });
    if (sue) { console.log('[注册] 失败:', sue.message); return finish(false); }
    if (!su.session) {
      console.log('[注册] 无 session（Email Confirmation 可能开启 / 触发器报错）。');
      console.log('        请在 .env 填入 TARO_APP_TEST_EMAIL / TARO_APP_TEST_PASSWORD（你的真实商家账号）后重跑，');
      console.log('        或在 Supabase Dashboard → Auth → Providers → Email 关闭 Confirm email。');
      return finish(false, su.user && su.user.id);
    }
    uid = su.user.id;
    console.log(`[注册] ✅ uid=${uid}`);
  }

  const created = { storeId: null, productId: null, orderId: null, itemId: null };

  try {
    // 4) 建店（stores owner 写）
    const { data: store, error: se } = await authClient.from('stores')
      .insert({ name: TEST + 'store', owner_id: uid }).select().single();
    if (se) { console.log(`[建店] 失败: ${se.code} ${se.message}`); }
    else {
      created.storeId = store.id;
      console.log(`[建店] ✅ id=${store.id}`);

      // 5) 上架商品（products owner 写）
      const { data: prod, error: pe } = await authClient.from('products')
        .insert({ name: TEST + 'product', price: 9.9, stock: 5, store_id: store.id, is_active: true })
        .select().single();
      if (pe) console.log(`[上架商品] ❌ 失败: ${pe.code} ${pe.message}`);
      else { created.productId = prod.id; console.log(`[上架商品] ✅ id=${prod.id}`); }

      // 6) 下单（orders owner 写）
      const orderNo = `TEST_${stamp}_${Math.floor(Math.random() * 1e6)}`;
      const { data: ord, error: oe } = await authClient.from('orders')
        .insert({ order_no: orderNo, total_amount: 9.9, user_id: uid }).select().single();
      if (oe) console.log(`[下单] ❌ 失败: ${oe.code} ${oe.message}`);
      else {
        created.orderId = ord.id;
        console.log(`[下单] ✅ id=${ord.id}`);

        // 7) 写 order_items（经 order_id 归属）
        const { data: item, error: ie } = await authClient.from('order_items')
          .insert({ order_id: ord.id, product_name: TEST + 'item', price: 9.9, quantity: 1 }).select().single();
        if (ie) console.log(`[写 order_items] ❌ 失败: ${ie.code} ${ie.message}`);
        else { created.itemId = item.id; console.log(`[写 order_items] ✅ id=${item.id}`); }
      }
    }
  } finally {
    // 8) 清理测试数据（依赖顺序）
    if (created.itemId) await authClient.from('order_items').delete().eq('id', created.itemId);
    if (created.orderId) await authClient.from('orders').delete().eq('id', created.orderId);
    if (created.productId) await authClient.from('products').delete().eq('id', created.productId);
    if (created.storeId) await authClient.from('stores').delete().eq('id', created.storeId);
    console.log('[清理] 测试数据已删除（测试账号 ' + email + ' 可手动删除）');
  }

  const ok = created.storeId && created.productId && created.orderId && created.itemId;
  finish(ok, uid, email);
}

function finish(ok, uid, email) {
  console.log('\n=== 结论 ===');
  if (ok) {
    console.log('✅ 商家上架 + 买家下单 写权限在真库验证通过。00095 已生效（或原本就正确）。');
  } else {
    console.log('❌ 写权限未通过。若当前未跑 00095，请先在 Dashboard 执行 00095_consolidated_rls_final.sql，再重跑本脚本。');
    console.log('   测试账号: ' + (email || '(见上)') + (uid ? ' uid=' + uid : ''));
  }
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error('脚本异常:', e); process.exit(3); });
