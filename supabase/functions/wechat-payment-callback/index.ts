/**
 * wechat-payment-callback Edge Function
 * 微信支付结果回调：验签 → 更新订单状态 → 触发分润
 * 幂等：affected_rows=0 时直接返回 SUCCESS
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Aes } from 'npm:wechatpay-axios-plugin@0.9.4'

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
  if (!MCH_API_V3_KEY) {
    return new Response(JSON.stringify({ code: 'FAIL', message: 'MCH_API_V3_KEY 未配置' }), { status: 200 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const body = await req.json() as {
      resource: { associated_data: string; nonce: string; ciphertext: string }
    }

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
      .select('id, order_no, user_id, total_amount, referrer_id')

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

    // 异步触发分润（不阻塞回调响应）
    // net_amount = 实际微信现金支付额（扣除金豆抵扣后），作为让利池计算基数
    const goldBeansUsed = order.gold_beans_used ?? 0
    const netCashAmount = Math.max(0, (order.total_amount ?? 0) - goldBeansUsed * 0.01)
    supabase.functions.invoke('distribute-commission', {
      body: {
        order_id: order.id,
        order_no: order.order_no,
        payer_id: order.user_id,
        total_amount: order.total_amount,
        net_amount: netCashAmount,
        referrer_id: order.referrer_id ?? null,
      }
    }).catch(e => console.error('[wechat-payment-callback] distribute-commission error:', e))

    return new Response(JSON.stringify({ code: 'SUCCESS', message: '处理成功' }), { status: 200 })

  } catch (err: any) {
    console.error('[wechat-payment-callback] error:', err?.message ?? err)
    return new Response(JSON.stringify({ code: 'FAIL', message: err?.message ?? '内部错误' }), { status: 200 })
  }
})
