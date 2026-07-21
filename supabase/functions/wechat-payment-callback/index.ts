/**
 * wechat-payment-callback Edge Function
 * 微信支付结果回调：验签 → 解密 → 更新订单状态 → 触发分润
 * 幂等：affected_rows=0 时直接返回 SUCCESS
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Aes, Formatter, Rsa } from 'npm:wechatpay-axios-plugin@0.9.4'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' }

async function decryptTradeState(
  MCH_API_V3_KEY: string, associatedData: string, nonce: string, ciphertext: string
): Promise<{ tradeState: string; outTradeNo: string; transactionId: string }> {
  const plaintext = await Aes.AesGcm.decrypt(ciphertext, MCH_API_V3_KEY, nonce, associatedData)
  const obj = JSON.parse(plaintext)
  return {
    tradeState: obj.trade_state === 'SUCCESS' ? 'SUCCESS' : 'OTHERS',
    outTradeNo: obj.out_trade_no ?? '',
    transactionId: obj.transaction_id ?? '',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const MCH_API_V3_KEY = Deno.env.get('MCH_API_V3_KEY') ?? ''
  const WECHAT_PAY_PUBLIC_KEY_ID = Deno.env.get('WECHAT_PAY_PUBLIC_KEY_ID') ?? ''
  const WECHAT_PAY_PUBLIC_KEY = Deno.env.get('WECHAT_PAY_PUBLIC_KEY') ?? ''
  if (!MCH_API_V3_KEY || !WECHAT_PAY_PUBLIC_KEY_ID || !WECHAT_PAY_PUBLIC_KEY) {
    return new Response(JSON.stringify({ code: 'FAIL', message: '微信支付配置缺失' }), { status: 200 })
  }

  // 1) 读取原始报文（用于验签，不能先 json 化）
  const rawBody = await req.text()

  // 2) 验签：防止伪造回调（微信使用平台私钥对 timestamp\nnonce\nbody\n 签名）
  const timestamp = req.headers.get('Wechatpay-Timestamp') ?? ''
  const nonce = req.headers.get('Wechatpay-Nonce') ?? ''
  const signature = req.headers.get('Wechatpay-Signature') ?? ''
  const serial = req.headers.get('Wechatpay-Serial') ?? ''
  if (!timestamp || !nonce || !signature) {
    return new Response(JSON.stringify({ code: 'FAIL', message: '缺少签名头' }), { status: 200 })
  }
  // 平台证书可能轮换，序列号不匹配时拒绝（如需多证书在此扩展 certs map）
  if (serial !== WECHAT_PAY_PUBLIC_KEY_ID) {
    console.error('[callback] 平台证书序列号不匹配:', serial)
    return new Response(JSON.stringify({ code: 'FAIL', message: '证书序列号不匹配' }), { status: 200 })
  }
  const verifyMessage = Formatter.joinedByLineFeed(timestamp, nonce, rawBody)
  if (!Rsa.verify(verifyMessage, signature, WECHAT_PAY_PUBLIC_KEY)) {
    console.error('[callback] 签名校验失败')
    return new Response(JSON.stringify({ code: 'FAIL', message: '签名校验失败' }), { status: 200 })
  }

  // 3) 解析并解密业务报文
  let body: { resource?: { associated_data: string; nonce: string; ciphertext: string } }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ code: 'FAIL', message: '报文解析失败' }), { status: 200 })
  }
  if (!body.resource) {
    return new Response(JSON.stringify({ code: 'FAIL', message: '缺少 resource' }), { status: 200 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { tradeState, outTradeNo, transactionId } = await decryptTradeState(
      MCH_API_V3_KEY,
      body.resource.associated_data,
      body.resource.nonce,
      body.resource.ciphertext,
    )

    if (tradeState !== 'SUCCESS') {
      // 非成功状态，忽略即可
      return new Response(JSON.stringify({ code: 'SUCCESS', message: '已忽略非成功回调' }), { status: 200 })
    }

    // 幂等更新：WHERE status='pending_pay' 保证只处理一次
    const { data: updated, error } = await supabase.from('orders')
      .update({ status: 'pending_ship', wechat_transaction_id: transactionId, paid_at: new Date().toISOString() })
      .eq('order_no', outTradeNo)
      .eq('status', 'pending_pay')
      .select('id, order_no, user_id, total_amount, referrer_id, tb_used, store_id')

    if (error) {
      console.error('[wechat-payment-callback] DB error:', error.message)
      return new Response(JSON.stringify({ code: 'FAIL', message: 'DB error' }), { status: 200 })
    }

    if (!updated || updated.length === 0) {
      // 0行受影响 = 重复回调，直接返回 SUCCESS
      console.log('[wechat-payment-callback] duplicate callback for', outTradeNo)
      return new Response(JSON.stringify({ code: 'SUCCESS', message: '重复回调已忽略' }), { status: 200 })
    }

    const order = updated[0]

    // D1~D3 修复：读取商家让利率 stores.referral_rate（小数口径，如 0.09=9%）及整体让利开关
    // referral_rate_enabled，透传给 distribute-commission，使云端分佣让利池基数与前端支付页预览完全一致（展示=实发）。
    // 开关关闭时门店默认让利率不参与回退（仅商品级 discount_rate 生效，无商品让利则该单让利=0）。
    let storeRate: number | null = null
    let storeEnabled = true
    if (order.store_id) {
      try {
        const { data: storeData } = await supabase
          .from('stores')
          .select('referral_rate, referral_rate_enabled')
          .eq('id', order.store_id)
          .maybeSingle()
        const sd = storeData as unknown as { referral_rate?: number | null; referral_rate_enabled?: boolean | null } | null
        storeRate = sd?.referral_rate ?? null
        storeEnabled = sd?.referral_rate_enabled !== false
      } catch (e) { console.warn('[wechat-payment-callback] 读取商家让利率失败', e) }
    }
    // 门店回退率：开关开 + 有值 → 门店率；开关开 + 无值 → 全局默认 0.09；开关关 → 0（仅商品让利生效）
    const storeFallback = storeEnabled ? (storeRate ?? 0.09) : 0

    // 让利点合并规则（按商品自身，金额加权）：每商品用【自身 discount_rate（整数%÷100）】，
    // 未设则回退门店率（受开关控制）；按商品金额(price×quantity)加权得到整单混合率。
    // 高利润商品（让利点高）主导让利池、低利润商品（让利点低）少分，完全贴合「按利润高低让利」，且绝不二次叠加。
    // 分佣引擎对 amount×rate 线性，加权混合率喂入 = 逐商品求和结果一致（个税 800 免征阈值在超大单时极微偏差，可忽略）。
    let effectiveRate = storeFallback
    try {
      const { data: itemRows } = await supabase
        .from('order_items')
        .select('price, quantity, product_id')
        .eq('order_id', order.id)
      const items = (itemRows || []) as Array<{ price?: any; quantity?: any; product_id?: string | null }>
      const productIds = Array.from(new Set((items || []).map(it => it?.product_id).filter(Boolean))) as string[]
      let rateMap: Record<string, number> = {}
      if (productIds.length) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, discount_rate')
          .in('id', productIds)
        for (const p of (prods || []) as Array<{ id?: string; discount_rate?: any }>) {
          if (p?.id) rateMap[p.id] = Number(p.discount_rate ?? 0)
        }
      }
      let totalAmt = 0, weightedSum = 0
      for (const it of items) {
        const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
        const pid = String(it?.product_id)
        const pRate = (typeof rateMap[pid] === 'number' && rateMap[pid] > 0)
          ? rateMap[pid] / 100
          : storeFallback
        totalAmt += amt
        weightedSum += amt * pRate
      }
      if (totalAmt > 0) effectiveRate = weightedSum / totalAmt
    } catch (e) { console.warn('[wechat-payment-callback] 读取商品让利点失败，回退店铺让利率', e) }

    // P0 修复：混合支付情绪豆抵扣——纯情绪豆已在下单时当场扣除；混合支付(payment_method=wxpay 但
    // tb_used>0)的情绪豆推迟到此处（微信支付成功）扣除，避免支付失败却锁豆。此前此处漏扣 → 用户白嫖抵扣。
    const goldBeansUsed = order.tb_used ?? 0
    if (goldBeansUsed > 0 && order.payment_method === 'wxpay') {
      try {
        const { data: gbProf } = await supabase.from('profiles').select('tb_balance').eq('id', order.user_id).maybeSingle()
        const cur = gbProf?.tb_balance ?? 0
        if (cur >= goldBeansUsed) {
          await supabase.from('profiles').update({ tb_balance: cur - goldBeansUsed }).eq('id', order.user_id)
          supabase.from('tongbao_logs').insert({
            user_id: order.user_id, order_id: order.id, type: 'purchase_spend',
            delta: -goldBeansUsed, balance_after: cur - goldBeansUsed,
            remark: `订单${order.order_no}混合支付金豆抵扣`,
          }).then(() => {}).catch(() => {})
        } else {
          console.warn('[wechat-payment-callback] 情绪豆不足，跳过扣减', { uid: order.user_id, cur, need: goldBeansUsed })
        }
      } catch (e) { console.error('[wechat-payment-callback] 混合情绪豆扣减异常', e) }
    }

    // 异步触发分润（不阻塞回调响应）
    // total_amount = 订单全额（含情绪豆），作为分佣/让利池基数（2026-07-19 起全额参与分佣）
    // net_amount = 实际微信现金支付额（扣除情绪豆抵扣后），仅用于计提微信收单通道费
    const netCashAmount = Math.max(0, (order.total_amount ?? 0) - goldBeansUsed)
    // 落库整单加权率（便于展示/追溯）
    try { await supabase.from('orders').update({ effective_rate: effectiveRate }).eq('id', order.id) } catch {}
    supabase.functions.invoke('distribute-commission', {
      body: {
        order_id: order.id,
        order_no: order.order_no,
        payer_id: order.user_id,
        total_amount: order.total_amount,
        net_amount: netCashAmount,
        referrer_id: order.referrer_id ?? null,
        discount_rate: effectiveRate,  // 按商品自身让利点、金额加权混合率（小数口径），与前端支付页预览一致
      }
    }).catch(async (e) => {
      const msg = (e as any)?.message || String(e)
      console.error('[wechat-payment-callback] distribute-commission error:', msg)
      try { await supabase.from('orders').update({ commission_error: msg }).eq('id', order.id) } catch {}
    })

    // 异步推送「订单支付成功」通知（不阻塞回调）
    supabase.functions.invoke('send-notification', {
      body: {
        user_id: order.user_id,
        type: 'order_paid',
        title: '订单支付成功',
        body: `订单 ${order.order_no} 已完成支付，感谢您的支持`,
        order_id: order.id,
        payload: {
          order_no: order.order_no,
          amount: (order.total_amount ?? 0).toFixed(2),
          paid_at: new Date().toLocaleString('zh-CN'),
          product_name: (order as { product_name?: string }).product_name ?? '商品',
          page: 'pages/order-center/index',
        },
      }
    }).catch(e => console.warn('[wechat-payment-callback] send-notification error:', e))

    return new Response(JSON.stringify({ code: 'SUCCESS', message: '处理成功' }), { status: 200 })

  } catch (err: any) {
    console.error('[wechat-payment-callback] error:', err?.message ?? err)
    return new Response(JSON.stringify({ code: 'FAIL', message: err?.message ?? '内部错误' }), { status: 200 })
  }
})
