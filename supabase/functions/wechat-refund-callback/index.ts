/**
 * wechat-refund-callback Edge Function
 * 微信退款结果回调 TX3：
 *   1. 解密通知
 *   2. 幂等更新 refunds 状态
 *   3. 更新订单 refund_amount + refund_status + status
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
      // 更新订单已退金额 & 状态（原 update_order_refunded_amount RPC 已移除，改为直写当前列）
      const orderRes = await supabase.from('orders')
        .select('total_amount, refund_amount').eq('order_no', outTradeNo).maybeSingle()
      const totalAmount = Number(orderRes.data?.total_amount ?? 1)
      const prevRefunded = Number(orderRes.data?.refund_amount ?? 0)
      const newRefundAmount = Math.round((prevRefunded + refundAmount) * 100) / 100
      await supabase.from('orders').update({
        refund_amount: newRefundAmount,
        refund_ratio: totalAmount > 0 ? Math.round((newRefundAmount / totalAmount) * 10000) / 10000 : 0,
        refund_status: 'refunded',
        status: 'after_sale',
      }).eq('order_no', outTradeNo)

      // 扣回佣金：覆盖 pending 与 settled，按比例扣回「情绪豆账户」(tb_balance)。
      // 2026-07-19 起佣金统一发往 tb_balance，故此处扣 tb_balance 并写 commission_revoke 流水；
      // 此前扣 commission_balance 对当前订单无效（资损），已修正。
      const { data: commissions } = await supabase.from('commissions')
        .select('id,beneficiary_id,commission_amount').eq('order_id', existing.order_id).in('status', ['pending', 'settled'])

      const ratio = refundAmount / totalAmount

      for (const c of (commissions ?? [])) {
        const amt = Math.max(0, Math.round(Number(c.commission_amount || 0) * ratio * 100) / 100)
        await supabase.from('commissions').update({ status: 'refunded' }).eq('id', c.id)
        if (amt <= 0 || !c.beneficiary_id) {
          console.log(`[wechat-refund-callback] commission ${c.id} marked refunded (no clawback)`)
          continue
        }
        const { data: benBal } = await supabase.from('profiles').select('tb_balance').eq('id', c.beneficiary_id).maybeSingle()
        if (benBal) {
          const newTb = Math.round((Number(benBal.tb_balance || 0) - amt) * 100) / 100
          await supabase.from('profiles').update({ tb_balance: newTb }).eq('id', c.beneficiary_id)
          await supabase.from('tongbao_logs').insert({
            user_id: c.beneficiary_id, order_id: existing.order_id,
            type: 'commission_revoke', delta: -amt, balance_after: newTb,
            remark: `订单${existing.order_no}退款佣金回冲`,
          })
        }
        console.log(`[wechat-refund-callback] commission ${c.id} clawback amt=${amt} ratio=${ratio.toFixed(4)}`)
      }

      // 扣回积分（points_logs 真实列：related_order_id/amount/type/source）
      const { data: pointsLogs } = await supabase.from('points_logs')
        .select('id,user_id,amount').eq('related_order_id', existing.order_id).eq('type', 'purchase_earn')
      for (const pl of (pointsLogs ?? [])) {
        const deduct = Math.floor((Number(pl.amount) || 0) * ratio)
        if (deduct <= 0) continue
        const { data: profile } = await supabase.from('profiles').select('points').eq('id', pl.user_id).maybeSingle()
        const newPoints = Math.max(0, (profile?.points ?? 0) - deduct)
        await supabase.from('profiles').update({ points: newPoints }).eq('id', pl.user_id)
        await supabase.from('points_logs').insert({
          user_id: pl.user_id,
          related_order_id: existing.order_id,
          type: 'refund_deduct',
          amount: -deduct,
          source: 'order_refund',
        })
      }

      // 商品级分佣同步回冲（#48）：按同一订单退款 ratio 累加 order_item_commissions.refund_ratio，
      // 使 Σ 各行净留存 = (1 - refund_ratio) × 原佣金，与上方 commissions 余额回冲口径一致。
      // 原始 l1_commission/l2_commission/buyer_points 保留不动（审计用），仅展示层折净。
      // 无商品明细行的订单（历史未补建）优雅跳过——订单级 commissions 回冲已保障余额正确。
      if (ratio > 0) {
        const { data: items } = await supabase.from('order_item_commissions')
          .select('id, refund_ratio').eq('order_id', existing.order_id)
        for (const it of (items ?? [])) {
          const cur = Number(it.refund_ratio ?? 0)
          const next = Math.min(1, Math.round((cur + ratio) * 10000) / 10000)
          if (next === cur) continue
          await supabase.from('order_item_commissions').update({
            refund_ratio: next,
            refunded_at: new Date().toISOString(),
          }).eq('id', it.id)
        }
        console.log(`[wechat-refund-callback] order_item_commissions refund_ratio accumulated by ${ratio.toFixed(4)} for order ${existing.order_id}`)
      }

      console.log(`[wechat-refund-callback] refund ${outRefundNo} completed, clawback done`)

      // 推送「退款成功」通知
      supabase.functions.invoke('send-notification', {
        body: {
          user_id: existing.user_id,
          type: 'refund_result',
          title: '退款成功',
          body: `订单 ${outTradeNo} 的退款 ¥${refundAmount.toFixed(2)} 已成功到账`,
          order_id: existing.order_id,
          payload: {
            order_no: outTradeNo,
            refund_amount: refundAmount.toFixed(2),
            status_label: '退款成功',
            refunded_at: new Date().toLocaleString('zh-CN'),
            page: 'pages/order-center/index',
          },
        }
      }).catch(e => console.warn('[wechat-refund-callback] send-notification error:', e))
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
