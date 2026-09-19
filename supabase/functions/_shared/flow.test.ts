/**
 * flow.test.ts — 资金流集成测试（deno test，注入内存 Mock Supabase）
 *
 * 覆盖「建单→退款」全链路的关键资损不变量：
 *  1. 服务端目录价覆盖（防客户端压价下单）
 *  2. 纯健康豆建单 → 扣豆 + 触发分佣
 *  3. 跨门店拆单 → 健康豆只记首单（对账口径）
 *  4. 退款状态白名单（前端可点 / 后端 400 必须一致）
 *  5. 退款额超额拦截
 *  6. 纯健康豆退款 → 整笔返还、订单完成
 *  7. 混合支付退款 → 微信部分 = (total - tb_used)*100 分口径、健康豆占比返还
 *
 * ⚠️ 本文件 import 了真实的 Edge Function（含 jsr/npm 依赖），只能在 deno 下跑：
 *      deno test supabase/functions/_shared/flow.test.ts
 *   纯函数口径另见 money.test.ts / commission.test.ts；node 直跑见 _sanity.ts。
 */
import { assertEquals, assert } from 'jsr:@std/assert@1'
import { handleCreateOrder } from '../create-order/index.ts'
import { handleRefundOrder } from '../refund-order/index.ts'
import { seedBasic, MockSupabaseClient } from './supabase-mock.ts'

function post(body: unknown): Request {
  return new Request('http://localhost/edge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const getUser = async () => ({ id: 'U1' })

// ---------------------------------------------------------------- 建单
Deno.test('flow: 服务端目录价覆盖，杜绝压价下单', async () => {
  const client = seedBasic()
  const res = await handleCreateOrder(
    post({
      items: [
        { product_id: 'p1', store_id: 's1', store_name: 'S1', product_name: 'A', product_image: null, price: 999, quantity: 2 },
        { product_id: 'p2', store_id: 's1', store_name: 'S1', product_name: 'B', product_image: null, price: 999, quantity: 1 },
      ],
      total_amount: 2997, // 客户端伪造总价
      pay_mode: 'wxpay',
    }),
    { supabase: client, getUser },
  )
  const json = await res.json()
  assertEquals(json.success, true)
  // 服务端按目录价重算：10*2 + 20*1 = 40，而非 2997
  assertEquals(json.total_amount, 40)
  assertEquals(json.order.total_amount, 40)
  assertEquals(client.tables['orders'][0].total_amount, 40)
})

Deno.test('flow: 纯健康豆建单 → 扣豆 + 触发分佣', async () => {
  const client = seedBasic({ tbBalance: 100 })
  const res = await handleCreateOrder(
    post({
      items: [{ product_id: 'p1', store_id: 's1', store_name: 'S1', product_name: 'A', product_image: null, price: 10, quantity: 1 }],
      total_amount: 10,
      pay_mode: 'pure_gold',
    }),
    { supabase: client, getUser },
  )
  const json = await res.json()
  assertEquals(json.success, true)
  assertEquals(json.order.status, 'pending_ship')
  assertEquals(json.tb_used, 10)
  // 账户健康豆扣减 100 → 90
  const profile = client.tables['profiles'][0]
  assertEquals(profile.tb_balance, 90)
  // 触发分佣一次
  assertEquals(client.functionInvocations['distribute-commission']?.length, 1)
})

Deno.test('flow: 跨门店拆单 → 健康豆只记首单，其余 0', async () => {
  const client = seedBasic({
    tbBalance: 100,
    products: [
      { id: 'p1', price: 10, discount_rate: 9 },
      { id: 'p2', price: 20, discount_rate: 9 },
    ],
    stores: [
      { id: 's1', referral_rate: 0.09, referral_rate_enabled: true },
      { id: 's2', referral_rate: 0.09, referral_rate_enabled: true },
    ],
  })
  const res = await handleCreateOrder(
    post({
      items: [
        { product_id: 'p1', store_id: 's1', store_name: 'S1', product_name: 'A', product_image: null, price: 10, quantity: 1 },
        { product_id: 'p2', store_id: 's2', store_name: 'S2', product_name: 'B', product_image: null, price: 20, quantity: 1 },
      ],
      total_amount: 30,
      pay_mode: 'pure_gold',
    }),
    { supabase: client, getUser },
  )
  const json = await res.json()
  assertEquals(json.success, true)
  assertEquals(json.is_multi_store, true)
  assertEquals(json.orders.length, 2)
  // 首单记 30 健康豆，次单 0（单一事实源 beanUsedForSubOrder）
  const first = json.orders.find((o: any) => o.store_id === 's1')
  const second = json.orders.find((o: any) => o.store_id === 's2')
  assertEquals(first.tb_used, 30)
  assertEquals(second.tb_used, 0)
  // 账户仅扣一次：100 - 30 = 70
  assertEquals(client.tables['profiles'][0].tb_balance, 70)
  // 每店触发一次分佣
  assertEquals(client.functionInvocations['distribute-commission']?.length, 2)
})

// ---------------------------------------------------------------- 退款
function seedOrder(client: MockSupabaseClient, row: Record<string, any>) {
  client.tables['orders'].push({
    id: 'O1',
    order_no: 'ORD-TEST',
    user_id: 'U1',
    refund_amount: 0,
    parent_order_no: null,
    ...row,
  })
}

Deno.test('flow: 退款状态白名单外 → 400', async () => {
  const client = seedBasic()
  seedOrder(client, { status: 'cancelled', payment_method: 'wxpay', total_amount: 100, tb_used: 0 })
  const res = await handleRefundOrder(
    post({ order_id: 'O1', order_no: 'ORD-TEST', item_index: 0, refund_quantity: 1, refund_amount: 10, reason: 'x' }),
    { supabase: client, getUser },
  )
  assertEquals(res.status, 400)
})

Deno.test('flow: 退款额超过可退额 → 400', async () => {
  const client = seedBasic()
  seedOrder(client, { status: 'completed', payment_method: 'wxpay', total_amount: 100, tb_used: 0 })
  const res = await handleRefundOrder(
    post({ order_id: 'O1', order_no: 'ORD-TEST', item_index: 0, refund_quantity: 1, refund_amount: 150, reason: 'x' }),
    { supabase: client, getUser },
  )
  assertEquals(res.status, 400)
})

Deno.test('flow: 纯健康豆退款 → 整笔返还 + 订单完成', async () => {
  const client = seedBasic({ tbBalance: 0 })
  seedOrder(client, { status: 'pending_ship', payment_method: 'emotion_beans', total_amount: 100, tb_used: 100 })
  const res = await handleRefundOrder(
    post({ order_id: 'O1', order_no: 'ORD-TEST', item_index: 0, refund_quantity: 1, refund_amount: 100, reason: 'x' }),
    { supabase: client, getUser },
  )
  const json = await res.json()
  assertEquals(json.success, true)
  // 健康豆整笔返还 0 + 100 = 100
  assertEquals(client.tables['profiles'][0].tb_balance, 100)
  // 健康豆返还流水
  const tbLog = client.tables['tongbao_logs'].find((l) => l.type === 'refund_return')
  assert(tbLog && tbLog.delta === 100, '应有 refund_return 流水 100')
  // 退款单完成
  const refund = client.tables['refunds'][0]
  assertEquals(refund.status, 'completed')
  // 订单标记已退 + after_sale
  const order = client.tables['orders'][0]
  assertEquals(order.refund_amount, 100)
  assertEquals(order.refund_status, 'refunded')
  assertEquals(order.status, 'after_sale')
})

Deno.test('flow: 混合支付退款 → 微信部分 (total-tb_used)*100 分 + 健康豆占比返还', async () => {
  const client = seedBasic({ tbBalance: 0 })
  seedOrder(client, { status: 'completed', payment_method: 'wxpay', total_amount: 100, tb_used: 30 })
  const res = await handleRefundOrder(
    post({ order_id: 'O1', order_no: 'ORD-TEST', item_index: 0, refund_quantity: 1, refund_amount: 70, reason: 'x' }),
    { supabase: client, getUser },
  )
  const json = await res.json()
  assertEquals(json.success, true)
  // 微信退款额 = (70 - 30*(70/100))*100 /100 = 49 元（=微信实付 70 元的退款口径）
  assertEquals(json.wx_refund_amount, 49)
  assertEquals(json.method, 'wechat')
  // 健康豆占比 30/100 * 70 = 21 返还
  assertEquals(client.tables['profiles'][0].tb_balance, 21)
  // 混合支付等微信回调，退款单先 processing
  assertEquals(client.tables['refunds'][0].status, 'processing')
})
