/**
 * 商家货款批量补结算（00131 放宽后）
 * - 遍历所有「已成交」状态 + 真实门店 的订单
 * - 已有 merchant_settlements 的跳过（幂等）
 * - store_id=null（无门店/平台）与 ffffffff（测试门店）排除
 * - 对每笔调 fn_settle_order RPC 结算
 */
const SUPABASE_URL = 'https://pyqgsxcjmijtbstwthbn.supabase.co'
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || '***REMOVED***'
const H = { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' }
const ACTIVE = ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup']
const TEST_STORE = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  const txt = await res.text()
  if (!res.ok) throw new Error(`REST ${res.status} ${path}: ${txt}`)
  return txt ? JSON.parse(txt) : null
}
async function rpcSettle(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_settle_order`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_order_id: id })
  })
  const txt = await res.text()
  try { return JSON.parse(txt) } catch { return { ok: false, raw: txt } }
}

// 1) 拉取所有「已成交」+ 有门店 订单
const orders = await rest(`orders?select=id,order_no,status,store_id,total_amount&status=in.(${ACTIVE.join(',')})&store_id=not.is.null&limit=2000`)
const real = (orders || []).filter(o => o.store_id && o.store_id !== TEST_STORE)
console.log(`【待补候选】已成交+真实门店订单: ${(real || []).length} 笔`)

let done = 0, skipped = 0, failed = 0, totalAmt = 0
const fails = []
for (const o of real) {
  // 幂等检查
  const ex = await rest(`merchant_settlements?select=id&order_id=eq.${o.id}&limit=1`)
  if (ex?.length) { skipped++; continue }
  const r = await rpcSettle(o.id)
  if (r?.ok) { done++; totalAmt += Number(r.settle_amount || 0) }
  else if (r?.skipped) { skipped++ }
  else { failed++; fails.push({ order_no: o.order_no, status: o.status, resp: r }) }
}
console.log(`\n【BACKFILL 结果】结算成功 ${done} 笔 | 已存在跳过 ${skipped} 笔 | 失败 ${failed} 笔`)
console.log(`【补发商家货款总额】¥${Math.round(totalAmt * 10000) / 10000}`)
if (fails.length) console.log('失败明细:', JSON.stringify(fails.slice(0, 20), null, 2))
