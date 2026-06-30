/**
 * wechat-refund-callback Edge Function
 * 微信退款结果回调 TX3：
 *   1. 解密通知
 *   2. 幂等更新 refunds 状态
 *   3. 更新订单 refunded_amount + status
 *   4. 扣回佣金 & 积分
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Aes } from 'npm:wechatpay-axios-plugin@0.9.4'

async function decryptRefundState(
  MCH_API_V3_KEY: string, associatedData: string, nonce: string, ciphertext: string
): Promise<{ refundStatus: string; outTradeNo: string; outRefundNo: string; refundAmount: number }> {
  const plaintext = await Aes.AesGcm.decrypt(ciphertext, MCH_API_V3_KEY, nonce, associatedData)
  const obj = JSON.parse(plaintext)
  return {
    refundStatus: obj.refund_status ?? '',
    outTradeNo: obj.out_trade_no ?? '',
    outRefundNo: obj.out_refund_no ?? '',
    refundAmount: (obj.amount?.refund ?? 0) / 100,
  }
}

Deno.serve(async (req: Request) => {
  const MCH_API_V3_KEY = Deno.env.get('MCH_API_V3_KEY') ?? ''
  if (!MCH_API_V3_KEY) {
    return new Response(JSON.stringify({ code: 'FAIL', message: 'MCH_API_V3_KEY 未配置' }), { status: 200 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const body = await req.json() as {
      resource: { associated_data: string; nonce: string; ciphertext: string }
    }

    const { refundStatus, outTradeNo, outRefundNo, refundAmount } = await decryptRefundState(
      MCH_API_V3_KEY,
      body.resource.associated_data,
      body.resource.nonce,
      body.resource.ciphertext,
    )

    const newStatus = refundStatus === 'SUCCESS' ? 'completed'
      : refundStatus === 'CLOSED' ? 'closed' : 'abnormal'

    // 幂等：已完成/关闭的不重复处理
    const { data: existing } = await supabase.from('refunds')
      .select('id,order_id,order_no,user_id,refund_amount,status').eq('refund_no', outRefundNo).maybeSingle()

    if (!existing) {
      console.warn('[wechat-refund-callback] refund not found:', outRefundNo)
      return new Response(JSON.stringify({ code: 'SUCCESS', message: '未找到退款记录' }), { status: 200 })
    }

    if (['completed', 'closed', 'abnormal'].includes(existing.status)) {
      console.log('[wechat-refund-callback] duplicate callback, skip:', outRefundNo)
      return new Response(JSON.stringify({ code: 'SUCCESS', message: '重复回调已忽略' }), { status: 200 })
    }

    // TX3：更新退款状态
    const { error: updateErr } = await supabase.from('refunds')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('refund_no', outRefundNo)
      .not('status', 'in', '("completed","closed","abnormal")')

    if (updateErr) {
      console.error('[wechat-refund-callback] update refund error:', updateErr.message)
      return new Response(JSON.stringify({ code: 'FAIL', message: updateErr.message }), { status: 200 })
    }

    if (newStatus === 'completed') {
      // 更新订单已退金额 & 状态
      await supabase.rpc('update_order_refunded_amount', { p_order_id: existing.order_id, p_amount: refundAmount })
      await supabase.from('orders').update({ status: 'after_sale' }).eq('order_no', outTradeNo)

      // 扣回佣金
      const { data: commissions } = await supabase.from('commissions')
        .select('id,beneficiary_id,commission_amount').eq('order_id', existing.order_id).eq('status', 'pending')

      const orderRes = await supabase.from('orders').select('total_amount').eq('order_no', outTradeNo).maybeSingle()
      const totalAmount = Number(orderRes.data?.total_amount ?? 1)
      const ratio = refundAmount / totalAmount

      for (const c of (commissions ?? [])) {
        await supabase.from('commissions').update({ status: 'refunded' }).eq('id', c.id)
        console.log(`[wechat-refund-callback] commission ${c.id} clawback ratio=${ratio.toFixed(4)}`)
      }

      // 扣回积分
      const { data: pointsLogs } = await supabase.from('points_logs')
        .select('id,user_id,delta').eq('order_id', existing.order_id).eq('type', 'purchase_earn')
      for (const pl of (pointsLogs ?? [])) {
        const deduct = Math.floor(pl.delta * ratio)
        if (deduct <= 0) continue
        const { data: profile } = await supabase.from('profiles').select('points').eq('id', pl.user_id).maybeSingle()
        const newPoints = Math.max(0, (profile?.points ?? 0) - deduct)
        await supabase.from('profiles').update({ points: newPoints }).eq('id', pl.user_id)
        await supabase.from('points_logs').insert({
          user_id: pl.user_id, order_id: existing.order_id,
          type: 'refund_deduct', delta: -deduct, balance_after: newPoints,
          remark: `订单${existing.order_no}退款积分扣回`,
        })
      }

      console.log(`[wechat-refund-callback] refund ${outRefundNo} completed, clawback done`)
    } else if (newStatus === 'closed') {
      console.warn(`[wechat-refund-callback] refund ${outRefundNo} closed by WeChat`)
    } else {
      console.warn(`[wechat-refund-callback] refund ${outRefundNo} abnormal status: ${refundStatus}`)
    }

    return new Response(JSON.stringify({ code: 'SUCCESS', message: '处理成功' }), { status: 200 })
  } catch (err: any) {
    console.error('[wechat-refund-callback] error:', err?.message ?? err)
    return new Response(JSON.stringify({ code: 'FAIL', message: err?.message ?? '内部错误' }), { status: 200 })
  }
})
