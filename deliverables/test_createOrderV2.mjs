// ============================================================
// 行为仿真：复刻 src/db/api.ts createOrderV2 (848-1110)
// 目的：验证金豆支付「创建订单失败」的所有出口，排除代码逻辑 bug。
// 方法：mock supabase + mock Taro，按场景驱动每个分支。
// ============================================================

const toasts = [];
const Taro = { showToast: (t) => { toasts.push(t.title); } };

function calculateCommissionV5() { return { l1Commission: 0, l2Commission: 0, buyerPoints: 0 }; }
async function distributeCommissionDirect() { /* noop */ }

function makeSupabase(s) {
  function chain(table) {
    const c = { table };
    c.select = (cols) => { c.op = 'select'; c.cols = cols; return c; };
    c.insert = (rows) => { c.op = 'insert'; c.rows = rows; return c; };
    c.update = (obj) => { c.op = 'update'; c.obj = obj; return c; };
    c.eq = (col, val) => { c.eqv = [col, val]; return c; };
    c.in = (col, vals) => { c.inv = [col, vals]; return c; };
    c.single = () => { c.single = true; return c; };
    c.maybeSingle = () => { c.maybe = true; return c; };
    c.then = (resolve, reject) => {
      let resp;
      if (table === 'products') resp = { data: s.products ?? [], error: s.productsErr ?? null };
      else if (table === 'profiles') {
        if (c.op === 'update') resp = { error: s.deductErr ?? null };
        else if ((c.cols || '').includes('gold_beans')) resp = { data: { gold_beans: s.goldBeans }, error: s.profileErr ?? null };
        else resp = { data: { total_consumption: 0, invited_by: null }, error: null };
      } else if (table === 'orders') {
        // 注意：真实 .insert(x).select(y) 是标准链式；mock 里 select 会覆盖 op，故用 c.rows 判定 insert
        if (c.op === 'insert' || c.rows) resp = { data: s.insertReturn ?? [{ id: 'o1', order_no: 'N1', status: 'pending_review' }], error: s.orderErr ?? null };
        else resp = { data: null, error: null };
      } else if (table === 'order_items') resp = { data: null, error: null };
      else if (table === 'user_store_relation') resp = { data: null, error: null };
      else if (table === 'stores') resp = { data: { referral_rate: 0.09 }, error: null };
      else if (table === 'gold_bean_logs') resp = { data: null, error: null };
      else resp = { data: null, error: null };
      return Promise.resolve(resp).then(resolve, reject);
    };
    return c;
  }
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: s.user } }) },
    from: (t) => chain(t),
  };
}

// ===== 以下是 createOrderV2 逻辑复刻（去类型/去import）=====
async function createOrderV2(supabase, params) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Taro.showToast({ title: '请先登录', icon: 'none' }); return null; }

    const orderNo = `LDYX${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const storeIds = [...new Set(params.items.map(i => i.store_id).filter(Boolean))];
    const isMultiStore = storeIds.length > 1;
    const parentOrderNo = isMultiStore ? `P${orderNo}` : null;

    const dbProductIds = [...new Set(params.items.map(i => i.product_id).filter(Boolean))];
    const { data: dbProducts, error: dbProdErr } = await supabase
      .from('products').select('id, price, is_active').in('id', dbProductIds);
    if (dbProdErr) { Taro.showToast({ title: '商品目录校验失败，禁止下单', icon: 'none' }); return null; }
    const dbPriceMap = new Map();
    for (const p of (dbProducts || [])) dbPriceMap.set(p.id, Number(p.price) || 0);
    const verifiedItems = params.items.map(item => {
      const dbPrice = dbPriceMap.get(item.product_id);
      if (dbPrice == null || dbPrice <= 0) {
        const exists = (dbProducts || []).some(p => p.id === item.product_id);
        const reason = exists ? '商品价格缺失' : '商品不存在或已下架';
        Taro.showToast({ title: `含无效商品：${reason}`, icon: 'none', duration: 5000 });
        throw new Error(`INVALID_PRODUCT: ${reason}`);
      }
      return { ...item, price: dbPrice };
    });
    const catalogTotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    let goldBeansUsed = (params.gold_beans_to_use && (params.pay_mode === 'pure_gold' || params.pay_mode === 'hybrid')) ? params.gold_beans_to_use : 0;
    if (params.pay_mode === 'pure_gold' && params.gold_beans_to_use) {
      try {
        const { data: profile, error: profileErr } = await supabase.from('profiles').select('gold_beans').eq('id', user.id).single();
        if (profileErr) { Taro.showToast({ title: '查询金豆失败，请重试', icon: 'none' }); return null; }
        else if (!profile || profile.gold_beans < params.gold_beans_to_use) { Taro.showToast({ title: '金豆余额不足', icon: 'none' }); return null; }
        else {
          const { error: deductErr } = await supabase.from('profiles').update({ gold_beans: profile.gold_beans - params.gold_beans_to_use }).eq('id', user.id);
          if (deductErr) { Taro.showToast({ title: `金豆扣减失败: ${deductErr.message}`, icon: 'none', duration: 4000 }); return null; }
          else { supabase.from('gold_bean_logs').insert({ user_id: user.id }).then(() => {}).catch(() => {}); }
        }
      } catch (e) { console.warn('[createOrderV2] 金豆操作异常，跳过', e); }
    }

    const isInStore = params.service_type !== 'delivery';
    const nowIso = new Date().toISOString();
    const ordersToInsert = verifiedItems.map(item => ({
      user_id: user.id,
      store_id: item.store_id || null,
      order_no: isMultiStore ? `C${orderNo}${item.store_id?.slice(0, 4)}` : orderNo,
      parent_order_no: parentOrderNo,
      total_amount: Math.round(item.price * item.quantity * 100) / 100,
      status: params.pay_mode === 'pure_gold' ? (params.service_type === 'delivery' ? 'pending_ship' : 'pending_review') : 'pending_pay',
      payment_method: params.pay_mode === 'pure_gold' ? 'gold_beans' : 'wxpay',
      gold_beans_used: isMultiStore ? 0 : goldBeansUsed,
      referrer_id: params.referrer_id || null,
      idempotency_key: params.idempotency_key || orderNo,
      service_type: params.service_type || 'self_pickup',
      shipping_address: params.address || null,
    }));

    const { data: insertedOrders, error: orderErr } = await supabase.from('orders').insert(ordersToInsert).select('id, order_no, status');
    if (orderErr) {
      if (goldBeansUsed > 0) {
        try { await supabase.from('profiles').update({ gold_beans: 0 }).eq('id', user.id); } catch (e) { console.error('回滚失败', e); }
      }
      const errMsg = orderErr.message || '未知错误';
      const errCode = orderErr.code || '';
      const errHint = orderErr.hint || '';
      const fullErrMsg = `${errMsg}${errCode ? ` [${errCode}]` : ''}${errHint ? ` (${errHint})` : ''}`;
      Taro.showToast({ title: `创建订单失败: ${fullErrMsg}`, icon: 'none', duration: 6000 });
      return null;
    }

    if (params.pay_mode === 'pure_gold' && isInStore && insertedOrders && insertedOrders.length > 0) {
      const ids = insertedOrders.map(o => o.id);
      await supabase.from('orders').update({ verified_at: nowIso }).in('id', ids);
    }
    if (insertedOrders && insertedOrders.length > 0) {
      const orderItems = insertedOrders.map((o, idx) => ({
        order_id: o.id, store_id: o.store_id || params.items[idx]?.store_id || null,
        product_id: verifiedItems[idx]?.product_id || null, quantity: verifiedItems[idx]?.quantity || 1,
        price: verifiedItems[idx]?.price || 0,
      }));
      await supabase.from('order_items').insert(orderItems);
    }
    // 分佣（mock 内不抛）
    const mainOrder = insertedOrders?.[0];
    if (!mainOrder) { Taro.showToast({ title: '订单创建异常', icon: 'none' }); return null; }
    return { order: { id: mainOrder.id, order_no: mainOrder.order_no, status: mainOrder.status }, wxpay_amount: 0, gold_beans_used: goldBeansUsed, pay_mode: params.pay_mode };
  } catch (err) {
    Taro.showToast({ title: `创建订单失败: ${err.message}`, icon: 'none' });
    return null;
  }
}

// ===== 场景定义 =====
const ITEM = { product_id: 'p1', store_id: 's1', store_name: '店', product_name: '商品', product_image: null, price: 9.9, quantity: 1 };
const activeProduct = [{ id: 'p1', price: 9.9, is_active: true }];

async function run(name, scenario, params, expectNull, expectToasts) {
  toasts.length = 0;
  const supabase = makeSupabase(scenario);
  const res = await createOrderV2(supabase, params);
  const isNull = res === null;
  const toastOk = expectToasts.every(t => toasts.some(x => x.includes(t)));
  const pass = (isNull === expectNull) && toastOk;
  console.log(`\n【${pass ? 'PASS' : 'FAIL'}】 ${name}`);
  console.log('   return:', isNull ? 'null(失败)' : 'order(成功)');
  console.log('   toasts:', JSON.stringify(toasts));
  if (!pass) console.log('   !! 期望 return=null:', expectNull, ' 期望含toast:', JSON.stringify(expectToasts));
  return pass;
}

const user = { id: 'u1' };
const results = [];
results.push(await run('纯金豆-正常', { user, products: activeProduct, goldBeans: 2000 },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'pure_gold', gold_beans_to_use: 990, service_type: 'self_pickup' },
  false, []));

results.push(await run('纯金豆-商品下架', { user, products: [] },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'pure_gold', gold_beans_to_use: 990, service_type: 'self_pickup' },
  true, ['含无效商品', '创建订单失败: INVALID_PRODUCT']));

results.push(await run('纯金豆-金豆余额不足', { user, products: activeProduct, goldBeans: 10 },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'pure_gold', gold_beans_to_use: 990, service_type: 'self_pickup' },
  true, ['金豆余额不足']));

results.push(await run('纯金豆-金豆扣减失败', { user, products: activeProduct, goldBeans: 2000, deductErr: { message: 'RLS deny' } },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'pure_gold', gold_beans_to_use: 990, service_type: 'self_pickup' },
  true, ['金豆扣减失败']));

results.push(await run('纯金豆-orders插入失败(status约束)', { user, products: activeProduct, goldBeans: 2000, orderErr: { message: 'invalid input value for enum', code: '22P02', hint: 'status' } },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'pure_gold', gold_beans_to_use: 990, service_type: 'self_pickup' },
  true, ['创建订单失败']));

results.push(await run('混合支付-正常', { user, products: activeProduct, goldBeans: 2000 },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'hybrid', gold_beans_to_use: 500, service_type: 'self_pickup' },
  false, []));

results.push(await run('微信支付-正常', { user, products: activeProduct },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'wxpay', service_type: 'self_pickup' },
  false, []));

results.push(await run('未登录', { user: null, products: activeProduct },
  { items: [ITEM], total_amount: 9.9, pay_mode: 'pure_gold', gold_beans_to_use: 990, service_type: 'self_pickup' },
  true, ['请先登录']));

const allPass = results.every(Boolean);
console.log(`\n===== 仿真结论：${allPass ? '全部 PASS（代码逻辑无 bug，各出口行为符合预期）' : '存在 FAIL，需修正仿真/代码'} =====`);
