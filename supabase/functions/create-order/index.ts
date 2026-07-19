/**
 * create-order Edge Function (V2 - 支持跨门店拆单)
 * 三种支付模式：pure_gold（纯情绪豆）| hybrid（混合）| wxpay（纯微信）
 * 情绪豆优先扣减，防重复提交（order_no 幂等）
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

// 情绪豆换算比例：与前端 api.ts / payment 页保持一致，1 情绪豆 = 1 元（人民币 1:1 锚定，tb_balance 单位即元）
const GOLD_BEAN_RATE = 1

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
      tb_used?: number
      referrer_id?: string
      idempotency_key?: string
    }

    const { items, pay_mode, referrer_id, idempotency_key } = body
    if (!items?.length) return Response.json({ error: '订单商品不能为空' }, { status: 400, headers: corsHeaders })

    // P0 修复：服务端回查 products 目录价，覆盖客户端传入 price，杜绝压价下单资损
    const productIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))]
    const { data: dbProducts } = await supabase.from('products').select('id, price').in('id', productIds)
    const dbPriceMap = new Map<string, number>()
    for (const p of (dbProducts || []) as any[]) dbPriceMap.set(p.id, Number(p.price) || 0)
    const validatedItems = items.map((i: any) => {
      const dbPrice = dbPriceMap.get(i.product_id)
      // 目录中无此商品则禁止下单（不放行客户端伪造 price）
      if (dbPrice == null) throw new Error(`商品不存在: ${i.product_id}`)
      return { ...i, price: dbPrice }
    })

    // 重新计算总金额（服务端校验，万分位精度，基于目录价）
    const totalAmount = toFixed4(validatedItems.reduce((s: number, i: any) => s + toFixed4(i.price * i.quantity), 0))

    // 按门店分组（基于目录价校验后的 items）
    const storeGroups = new Map<string, typeof validatedItems>()
    for (const item of validatedItems) {
      const sid = item.store_id
      if (!storeGroups.has(sid)) storeGroups.set(sid, [])
      storeGroups.get(sid)!.push(item)
    }

    const isMultiStore = storeGroups.size > 1

    // 查用户情绪豆余额
    const { data: profile } = await supabase.from('profiles').select('tb_balance, points').eq('id', user.id).maybeSingle()
    const goldBeanBalance = profile?.tb_balance ?? 0

    // 计算情绪豆抵扣（按总金额计算）
    let goldBeansUsed = 0
    let wxpayAmount = toFixed4(totalAmount)

    if (pay_mode === 'pure_gold' || pay_mode === 'hybrid') {
      const requested = body.tb_used ?? goldBeanBalance
      const maxDeductYuan = toFixed4(goldBeanBalance * GOLD_BEAN_RATE)

      if (pay_mode === 'pure_gold') {
        const needed = toFixed4(totalAmount / GOLD_BEAN_RATE)
        if (goldBeanBalance < needed) {
          return Response.json({ error: `情绪豆不足，需要${needed}豆，当前${goldBeanBalance}豆`, code: 'INSUFFICIENT_GOLD_BEANS' }, { status: 400, headers: corsHeaders })
        }
        goldBeansUsed = Math.min(needed, toFixed4(totalAmount / GOLD_BEAN_RATE))
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

    // 扣情绪豆（如有）— 先扣，失败则回滚
    if (goldBeansUsed > 0) {
      const { error: balErr } = await supabase.from('profiles')
        .update({ tb_balance: goldBeanBalance - goldBeansUsed })
        .eq('id', user.id)
        .gte('tb_balance', goldBeansUsed)
      if (balErr) return Response.json({ error: '情绪豆扣减失败，请重试', code: 'GOLD_DEDUCT_FAIL' }, { status: 500, headers: corsHeaders })
    }

    // 创建订单（单门店或跨门店）
    const createdOrders: Array<{ id: string; order_no: string; status: string; store_id: string; total_amount: number }> = []

    try {
      for (const [storeId, storeItems] of storeGroups.entries()) {
        // 计算该门店的金额（基于目录价）
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
          payment_method: pay_mode === 'wxpay' ? 'wxpay' : pay_mode === 'pure_gold' ? 'emotion_beans' : 'wxpay',
          tb_used: isMultiStore ? 0 : goldBeansUsed, // 情绪豆只扣一次，记在第一个订单
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

      // 纯情绪豆支付 → 触发分佣（fix: 此前干标 commission_distributed=true 却零发放，导致「假分佣」且补跑被跳过）
      // 与小程序 createOrderV2 对齐：调用 distribute-commission 把佣金以情绪豆(tb_balance)发给上线，纯豆全部分佣。
      if (pay_mode === 'pure_gold') {
        for (const order of createdOrders) {
          const orderTotal = Number(order.total_amount) || 0
          if (orderTotal <= 0) continue
          let discountRate = 0.09
          try {
            if (order.store_id) {
              const { data: sd } = await supabase
                .from('stores')
                .select('referral_rate, referral_rate_enabled')
                .eq('id', order.store_id)
                .maybeSingle()
              const enabled = sd?.referral_rate_enabled !== false
              discountRate = enabled ? (Number(sd?.referral_rate ?? 0.09)) : 0
            }
            await supabase.functions.invoke('distribute-commission', {
              body: {
                order_id: order.id,
                order_no: order.order_no,
                payer_id: user.id,
                total_amount: orderTotal,
                net_amount: 0,
                referrer_id: order.referrer_id ?? null,
                discount_rate: discountRate,
              },
            })
          } catch (e) {
            console.error('[create-order] 纯情绪豆分佣触发失败(不影响下单):', (e as any)?.message)
          }
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
        tb_used: goldBeansUsed,
        pay_mode,
      }, { headers: corsHeaders })

    } catch (err) {
      // 创建订单失败，回滚情绪豆
      if (goldBeansUsed > 0) {
        await supabase.from('profiles').update({ tb_balance: goldBeanBalance }).eq('id', user.id)
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
