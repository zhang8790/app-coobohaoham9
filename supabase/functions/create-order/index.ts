/**
 * create-order Edge Function (V2 - 支持跨门店拆单)
 * 三种支付模式：pure_gold（纯金豆）| hybrid（混合）| wxpay（纯微信）
 * 金豆优先扣减，防重复提交（order_no 幂等）
 * 跨门店结算：自动按 store_id 拆分成多个子订单，共享同一 parent_order_no
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 万分位精度：所有金额运算
function toFixed4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// 金豆换算比例：1金豆 = 0.01元
const GOLD_BEAN_RATE = 0.01

type PayMode = 'pure_gold' | 'hybrid' | 'wxpay'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 鉴权
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })
  const { data: { user }, error: authErr } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  ).auth.getUser()
  if (authErr || !user) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })

  try {
    const body = await req.json() as {
      items: Array<{
        product_id: string; store_id: string; store_name: string
        product_name: string; product_image: string | null; price: number; quantity: number
      }>
      total_amount: number
      pay_mode: PayMode
      gold_beans_to_use?: number
      referrer_id?: string
      idempotency_key?: string
    }

    const { items, pay_mode, referrer_id, idempotency_key } = body
    if (!items?.length) return Response.json({ error: '订单商品不能为空' }, { status: 400, headers: corsHeaders })

    // 重新计算总金额（服务端校验，万分位精度）
    const totalAmount = toFixed4(items.reduce((s, i) => s + toFixed4(i.price * i.quantity), 0))

    // 按门店分组
    const storeGroups = new Map<string, typeof items>()
    for (const item of items) {
      const sid = item.store_id
      if (!storeGroups.has(sid)) storeGroups.set(sid, [])
      storeGroups.get(sid)!.push(item)
    }

    const isMultiStore = storeGroups.size > 1

    // 查用户金豆余额
    const { data: profile } = await supabase.from('profiles').select('gold_beans, points').eq('id', user.id).maybeSingle()
    const goldBeanBalance = profile?.gold_beans ?? 0

    // 计算金豆抵扣（按总金额计算）
    let goldBeansUsed = 0
    let wxpayAmount = toFixed4(totalAmount)

    if (pay_mode === 'pure_gold' || pay_mode === 'hybrid') {
      const requested = body.gold_beans_to_use ?? goldBeanBalance
      const maxDeductYuan = toFixed4(goldBeanBalance * GOLD_BEAN_RATE)

      if (pay_mode === 'pure_gold') {
        const needed = Math.ceil(totalAmount / GOLD_BEAN_RATE)
        if (goldBeanBalance < needed) {
          return Response.json({ error: `金豆不足，需要${needed}豆，当前${goldBeanBalance}豆`, code: 'INSUFFICIENT_GOLD_BEANS' }, { status: 400, headers: corsHeaders })
        }
        goldBeansUsed = needed
        wxpayAmount = 0
      } else {
        const beansToUse = Math.min(requested, goldBeanBalance)
        const deductYuan = toFixed4(Math.min(beansToUse * GOLD_BEAN_RATE, totalAmount))
        goldBeansUsed = Math.floor(deductYuan / GOLD_BEAN_RATE)
        wxpayAmount = toFixed4(totalAmount - deductYuan)
      }
    }

    // 防重复：同一幂等key已存在则直接返回
    if (idempotency_key) {
      const { data: existing, error: existErr } = await supabase.from('orders')
        .select('id, order_no, status, total_amount, parent_order_no')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existErr) {
        console.warn('[create-order] 幂等键查询失败（可能字段不存在）:', existErr.message)
        // 不阻塞主流程，继续执行
      } else if (existing) {
        return Response.json({ success: true, order: existing, reused: true, is_multi_store: !!existing.parent_order_no }, { headers: corsHeaders })
      }
    }

    // 生成父订单号（跨门店结算时共享）
    const parentOrderNo = isMultiStore ? `PARENT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : null

    // 扣金豆（如有）— 先扣，失败则回滚
    if (goldBeansUsed > 0) {
      const { error: balErr } = await supabase.from('profiles')
        .update({ gold_beans: goldBeanBalance - goldBeansUsed })
        .eq('id', user.id)
        .gte('gold_beans', goldBeansUsed)
      if (balErr) return Response.json({ error: '金豆扣减失败，请重试', code: 'GOLD_DEDUCT_FAIL' }, { status: 500, headers: corsHeaders })
    }

    // 创建订单（单门店或跨门店）
    const createdOrders: Array<{ id: string; order_no: string; status: string; store_id: string; total_amount: number }> = []

    try {
      for (const [storeId, storeItems] of storeGroups.entries()) {
        // 计算该门店的金额（按比例）
        const storeAmount = toFixed4(storeItems.reduce((s, i) => s + toFixed4(i.price * i.quantity), 0))
        
        // 生成订单号
        const orderNo = isMultiStore 
          ? `${parentOrderNo}-${storeGroups.keys().indexOf(storeId) + 1}`
          : `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

        // 创建订单
        const orderPayload: Record<string, unknown> = {
          order_no: orderNo,
          user_id: user.id,
          store_id: storeId,
          total_amount: storeAmount,
          payment_method: pay_mode === 'wxpay' ? 'wxpay' : pay_mode === 'pure_gold' ? 'gold_beans' : 'wxpay',
          gold_beans_used: isMultiStore ? 0 : goldBeansUsed, // 金豆只扣一次，记在第一个订单
          status: pay_mode === 'pure_gold' ? 'pending_ship' : 'pending_pay',
          referrer_id: referrer_id ?? null,
          parent_order_no: parentOrderNo,
        }
        if (idempotency_key && !isMultiStore) orderPayload.idempotency_key = idempotency_key

        const { data: order, error: orderErr } = await supabase.from('orders').insert(orderPayload).select().maybeSingle()
        if (orderErr || !order) {
          throw new Error(`创建订单失败: ${orderErr?.message}`)
        }

        // 写订单商品
        await supabase.from('order_items').insert(storeItems.map(i => ({ order_id: order.id, ...i })))

        createdOrders.push({
          id: order.id,
          order_no: orderNo,
          status: order.status,
          store_id: storeId,
          total_amount: storeAmount,
        })
      }

      // 纯金豆支付 → 标记所有订单已分润
      if (pay_mode === 'pure_gold') {
        for (const order of createdOrders) {
          await supabase.from('orders').update({ commission_distributed: true }).eq('id', order.id)
        }
      }

      // 返回第一个订单的信息（用于支付）
      const firstOrder = createdOrders[0]

      return Response.json({
        success: true,
        order: { 
          id: firstOrder.id, 
          order_no: firstOrder.order_no, 
          status: firstOrder.status,
          parent_order_no: parentOrderNo,
        },
        orders: createdOrders, // 所有子订单
        is_multi_store: isMultiStore,
        total_amount: totalAmount,
        wxpay_amount: wxpayAmount,
        gold_beans_used: goldBeansUsed,
        pay_mode,
      }, { headers: corsHeaders })

    } catch (err) {
      // 创建订单失败，回滚金豆
      if (goldBeansUsed > 0) {
        await supabase.from('profiles').update({ gold_beans: goldBeanBalance }).eq('id', user.id)
      }
      // 删除已创建的订单（回滚）
      for (const order of createdOrders) {
        await supabase.from('orders').delete().eq('id', order.id)
      }
      throw err
    }

  } catch (err: any) {
    console.error('[create-order]', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
