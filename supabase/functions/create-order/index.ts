/**
 * create-order Edge Function
 * 三种支付模式：pure_gold（纯金豆）| hybrid（混合）| wxpay（纯微信）
 * 金豆优先扣减，防重复提交（order_no 幂等）
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

// 段位 → 让利池比例（商户设定，此处示例 25%）
const PROFIT_POOL_RATIO = 0.25

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
      gold_beans_to_use?: number   // 用户希望使用的金豆数量（混合/纯金豆时传入）
      referrer_id?: string         // 推荐人ID（可选）
      idempotency_key?: string     // 幂等key，由前端生成（uuid）
    }

    const { items, pay_mode, referrer_id, idempotency_key } = body
    if (!items?.length) return Response.json({ error: '订单商品不能为空' }, { status: 400, headers: corsHeaders })

    // 重新计算总金额（服务端校验，万分位精度）
    const totalAmount = toFixed4(items.reduce((s, i) => s + toFixed4(i.price * i.quantity), 0))

    // 查用户金豆余额
    const { data: profile } = await supabase.from('profiles').select('balance, points').eq('id', user.id).maybeSingle()
    const goldBeanBalance = profile?.balance ?? 0

    // 计算金豆抵扣
    let goldBeansUsed = 0
    let wxpayAmount = toFixed4(totalAmount)

    if (pay_mode === 'pure_gold' || pay_mode === 'hybrid') {
      const requested = body.gold_beans_to_use ?? goldBeanBalance
      const maxDeductYuan = toFixed4(goldBeanBalance * GOLD_BEAN_RATE)

      if (pay_mode === 'pure_gold') {
        // 纯金豆：全额抵扣，验证够不够
        const needed = Math.ceil(totalAmount / GOLD_BEAN_RATE)
        if (goldBeanBalance < needed) {
          return Response.json({ error: `金豆不足，需要${needed}豆，当前${goldBeanBalance}豆`, code: 'INSUFFICIENT_GOLD_BEANS' }, { status: 400, headers: corsHeaders })
        }
        goldBeansUsed = needed
        wxpayAmount = 0
      } else {
        // 混合：用户指定金豆数，不超过余额也不超过订单金额
        const beansToUse = Math.min(requested, goldBeanBalance)
        const deductYuan = toFixed4(Math.min(beansToUse * GOLD_BEAN_RATE, totalAmount))
        goldBeansUsed = Math.floor(deductYuan / GOLD_BEAN_RATE)
        wxpayAmount = toFixed4(totalAmount - deductYuan)
      }
    }

    // 防重复：同一幂等key已存在则直接返回
    if (idempotency_key) {
      const { data: existing } = await supabase.from('orders')
        .select('id, order_no, status, total_amount').eq('idempotency_key' as any, idempotency_key).maybeSingle()
      if (existing) {
        return Response.json({ success: true, order: existing, reused: true }, { headers: corsHeaders })
      }
    }

    // 生成订单号
    const orderNo = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    // 扣金豆（如有）— 先扣，失败则回滚
    if (goldBeansUsed > 0) {
      const { error: balErr } = await supabase.from('profiles')
        .update({ balance: goldBeanBalance - goldBeansUsed })
        .eq('id', user.id)
        .gte('balance', goldBeansUsed) // 乐观锁
      if (balErr) return Response.json({ error: '金豆扣减失败，请重试', code: 'GOLD_DEDUCT_FAIL' }, { status: 500, headers: corsHeaders })
    }

    // 创建订单
    const orderPayload: Record<string, unknown> = {
      order_no: orderNo,
      user_id: user.id,
      total_amount: totalAmount,
      payment_method: pay_mode === 'wxpay' ? 'wxpay' : pay_mode === 'pure_gold' ? 'gold_beans' : 'wxpay',
      gold_beans_used: goldBeansUsed,
      status: pay_mode === 'pure_gold' ? 'pending_ship' : 'pending_pay',
      referrer_id: referrer_id ?? null,
    }
    if (idempotency_key) orderPayload.idempotency_key = idempotency_key

    const { data: order, error: orderErr } = await supabase.from('orders').insert(orderPayload).select().maybeSingle()
    if (orderErr || !order) {
      // 订单创建失败，回滚金豆
      if (goldBeansUsed > 0) {
        await supabase.from('profiles').update({ balance: goldBeanBalance }).eq('id', user.id)
      }
      return Response.json({ error: '创建订单失败', detail: orderErr?.message }, { status: 500, headers: corsHeaders })
    }

    // 写订单商品
    await supabase.from('order_items').insert(items.map(i => ({ order_id: order.id, ...i })))

    // 纯金豆支付 → 净现金额为0，标记已分润即可，不触发分佣
    // 混合支付 → 以实际微信支付金额（wxpayAmount）为分佣基数，触发分佣
    if (pay_mode === 'pure_gold') {
      // 纯金豆无现金流入，跳过分佣（金豆属已入账资产，无需二次分润）
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', order.id)
    } else if (pay_mode === 'hybrid' && wxpayAmount <= 0) {
      // 混合支付但微信部分为0（极端情况），同上
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', order.id)
    }

    return Response.json({
      success: true,
      order: { id: order.id, order_no: orderNo, status: order.status },
      wxpay_amount: wxpayAmount,
      gold_beans_used: goldBeansUsed,
      pay_mode,
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[create-order]', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
