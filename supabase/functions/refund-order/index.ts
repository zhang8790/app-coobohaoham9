/**
 * refund-order Edge Function
 * 流程：
 *   1. 鉴权 + 校验参数
 *   2. 查订单 & 验证退款资格
 *   3. 内联计算可退金额（原 get_refundable_amount RPC 已随 schema 变更移除）
 *   4. 写 refunds 记录（processing；微信订单等回调落 completed）
 *   5. 如果是微信支付订单 → 直接发起微信退款（简化流程，无需人工审核）
 *   6. 更新退款状态 → 触发佣金+积分扣回
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Wechatpay from 'npm:wechatpay-axios-plugin@0.9.4'
import ShortUniqueId from 'npm:short-unique-id'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const generateRefundNo = () =>
  `REF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${new ShortUniqueId({ length: 8 }).rnd()}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 鉴权
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })

  try {
    const body = await req.json() as {
      order_id: string; order_no: string; item_index: number
      refund_quantity: number; refund_amount: number; reason: string; description?: string
    }
    const { order_id, order_no, item_index, refund_quantity, refund_amount, reason, description } = body

    // 1. 查订单 & 权限
    // 注意：当前 orders 表无 refunded_amount / wechat_transaction_id 列，
    // 累计退款记在 refund_amount，微信交易号已不再单独落库（微信退款用 out_trade_no=order_no）。
    const { data: order } = await supabase.from('orders')
      .select('id,order_no,user_id,status,total_amount,refund_amount,payment_method,tb_used')
      .eq('id', order_id).maybeSingle()

    if (!order) return Response.json({ success: false, error: '订单不存在' }, { status: 404, headers: corsHeaders })
    if (order.user_id !== user.id) return Response.json({ success: false, error: '无权操作此订单' }, { status: 403, headers: corsHeaders })
    if (!['pending_ship', 'pending_receive', 'completed'].includes(order.status)) {
      return Response.json({ success: false, error: `订单状态(${order.status})不支持退款` }, { status: 400, headers: corsHeaders })
    }

    // 2. 计算可退金额（原 get_refundable_amount RPC 已随 schema 变更移除，此处内联）
    //    当前 orders 累计退款记在 refund_amount（numeric，默认 0）
    const alreadyRefunded = Number(order.refund_amount ?? 0)
    const refundable = Math.max(0, Math.round((Number(order.total_amount) - alreadyRefunded) * 100) / 100)
    if (refund_amount > refundable + 0.0001) {
      return Response.json({ success: false, error: `退款金额(¥${refund_amount})超过可退金额(¥${refundable.toFixed(2)})` }, { status: 400, headers: corsHeaders })
    }

    const refundNo = generateRefundNo()

    // 3. 写退款申请记录
    const { data: refundRecord, error: insertErr } = await supabase.from('refunds').insert({
      refund_no: refundNo, order_id, order_no, item_index, user_id: user.id,
      refund_quantity, refund_amount, reason, description: description ?? null,
      initiated_by: 'user', status: 'processing',
    }).select().maybeSingle()

    if (insertErr || !refundRecord) {
      return Response.json({ success: false, error: '创建退款记录失败：' + insertErr?.message }, { status: 500, headers: corsHeaders })
    }

    // 4. 发起微信退款（如有微信支付部分）
    // 注意：00096 后 tb_used 已统一为「元」口径（1 豆 = 1 元），直接按比例扣减，勿再 ×0.01
    const wxRefundAmount = Math.max(
      0,
      Math.round((refund_amount - (Number(order.tb_used ?? 0) * (refund_amount / Number(order.total_amount)))) * 100)
    )
    // 退款占比 & 应返还金豆（金豆抵扣部分，所有退款路径通用，下面统一退还）
    const ratio = Number(order.total_amount) > 0 ? refund_amount / Number(order.total_amount) : 1
    const beanPortion = Math.max(0, Math.round(Number(order.tb_used ?? 0) * ratio * 100) / 100)

    const MERCHANT_ID = Deno.env.get('MERCHANT_ID') ?? ''
    const MCH_CERT_SERIAL_NO = Deno.env.get('MCH_CERT_SERIAL_NO') ?? ''
    const MCH_PRIVATE_KEY = Deno.env.get('MCH_PRIVATE_KEY') ?? ''
    const WECHAT_PAY_PUBLIC_KEY_ID = Deno.env.get('WECHAT_PAY_PUBLIC_KEY_ID') ?? ''
    const WECHAT_PAY_PUBLIC_KEY = Deno.env.get('WECHAT_PAY_PUBLIC_KEY') ?? ''
    const notifyUrl = `${SUPABASE_URL}/functions/v1/wechat-refund-callback`

    let wechatRefundId: string | null = null

    if (wxRefundAmount > 0 && order.payment_method === 'wxpay' && MERCHANT_ID && MCH_CERT_SERIAL_NO && MCH_PRIVATE_KEY) {
      try {
        const wxpay = new Wechatpay({
          mchid: MERCHANT_ID, serial: MCH_CERT_SERIAL_NO,
          privateKey: MCH_PRIVATE_KEY,
          certs: { [WECHAT_PAY_PUBLIC_KEY_ID]: WECHAT_PAY_PUBLIC_KEY },
        })
        const { data: refundData } = await wxpay.v3.refund.domestic.refunds.post({
          out_trade_no: order.order_no,
          out_refund_no: refundNo,
          reason: reason || '用户申请退款',
          notify_url: notifyUrl,
          amount: {
            refund: wxRefundAmount,
            total: Math.round(Number(order.total_amount) * 100),
            currency: 'CNY',
          },
        }, { headers: { 'Wechatpay-Serial': WECHAT_PAY_PUBLIC_KEY_ID } })

        wechatRefundId = refundData?.refund_id ?? null
        console.log(`[refund-order] WeChat refund submitted: refund_id=${wechatRefundId}`)
      } catch (wxErr: any) {
        // 微信退款失败不阻断流程，更新状态为 abnormal
        console.error('[refund-order] WeChat refund error:', wxErr?.message)
        await supabase.from('refunds').update({ status: 'abnormal' }).eq('id', refundRecord.id)
        return Response.json({ success: false, error: '微信退款发起失败：' + wxErr?.message }, { status: 500, headers: corsHeaders })
      }
    }

    // 5. 金豆部分退还（始终执行：纯金豆订单=全额，混合订单=金豆抵扣占比部分）
    // 00096 后 tb_used 为「元」口径（1 豆 = 1 元），按退款占比计算应返还金豆，切勿 ×0.01。
    if (beanPortion > 0) {
      const { data: profile } = await supabase.from('profiles').select('tb_balance').eq('id', user.id).maybeSingle()
      const newTb = Math.round((Number(profile?.tb_balance ?? 0) + beanPortion) * 100) / 100
      await supabase.from('profiles').update({ tb_balance: newTb }).eq('id', user.id)
      // 金豆返还流水（tb_balance 变动必须留账，便于对账防资损）
      await supabase.from('tongbao_logs').insert({
        user_id: user.id, order_id, type: 'refund_return',
        delta: beanPortion, balance_after: newTb,
        remark: `订单${order.order_no}退款返还金豆`,
      })
    }

    // 6. 无微信支付（纯情绪豆订单）→ 直接完成退款
    if (wxRefundAmount === 0) {
      // 直接完成退款
      await supabase.from('refunds').update({ status: 'completed', wechat_refund_id: null, completed_at: new Date().toISOString() }).eq('id', refundRecord.id)
      // 累计退款金额（原 update_order_refunded_amount RPC 已移除，改为直写当前列）
      const newRefundAmount = Math.round((alreadyRefunded + refund_amount) * 100) / 100
      await supabase.from('orders').update({
        refund_amount: newRefundAmount,
        refund_ratio: Number(order.total_amount) > 0 ? Math.round((newRefundAmount / Number(order.total_amount)) * 10000) / 10000 : 0,
        refund_status: 'refunded',
      }).eq('id', order_id)
      // 触发佣金&积分扣回
      await triggerClawback(supabase, order_id, order.order_no, user.id, refund_amount, Number(order.total_amount))
      // 更新订单状态
      await supabase.from('orders').update({ status: 'after_sale' }).eq('id', order_id)

      // 推送「退款成功」通知
      supabase.functions.invoke('send-notification', {
        body: {
          user_id: user.id,
          type: 'refund_result',
          title: '退款成功',
          body: `订单 ${order.order_no} 的退款 ¥${refund_amount.toFixed(2)} 已成功（以金豆形式到账）`,
          order_id: order_id,
          payload: {
            order_no: order.order_no,
            refund_amount: refund_amount.toFixed(2),
            status_label: '退款成功',
            refunded_at: new Date().toLocaleString('zh-CN'),
            page: 'pages/order-center/index',
          },
        }
      }).catch(e => console.warn('[refund-order] send-notification error:', e))

      return Response.json({ success: true, refund_id: refundRecord.id, refund_no: refundNo, method: 'emotion_beans' }, { headers: corsHeaders })
    }

    // 6. 更新退款记录 wechat_refund_id（等待回调完成最终状态）
    if (wechatRefundId) {
      await supabase.from('refunds').update({ wechat_refund_id: wechatRefundId }).eq('id', refundRecord.id)
    }

    return Response.json({
      success: true,
      refund_id: refundRecord.id,
      refund_no: refundNo,
      wx_refund_amount: wxRefundAmount / 100,
      method: 'wechat',
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[refund-order] error:', err)
    return Response.json({ success: false, error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})

/** 扣回佣金 & 积分 */
async function triggerClawback(
  supabase: ReturnType<typeof createClient>,
  orderId: string, orderNo: string,
  payerId: string, refundAmount: number, totalAmount: number
) {
  const ratio = totalAmount > 0 ? refundAmount / totalAmount : 1

  // 佣金扣回：按比例标记，并同步回滚受益人「情绪豆账户」(tb_balance)。
  // 2026-07-19 起推广佣金统一发放到 tb_balance（不再进 commission_balance），
  // 故此处必须扣 tb_balance，否则已退款订单的佣金仍留在 tb_balance 可被消费 = 资损。
  // 历史遗留（pre-07-19 发往 commission_balance 的极少订单）如遇，可另写迁移补扣。
  const { data: commissions } = await supabase.from('commissions')
    .select('id, beneficiary_id, commission_amount, status')
    .eq('order_id', orderId)
    .in('status', ['pending', 'settled'])

  for (const c of (commissions ?? [])) {
    const clawback = Math.max(0, Math.round(Number(c.commission_amount || 0) * ratio * 100) / 100)
    await supabase.from('commissions').update({ status: 'refunded' }).eq('id', c.id)
    if (clawback > 0 && c.beneficiary_id) {
      const { data: bProf } = await supabase.from('profiles')
        .select('tb_balance').eq('id', c.beneficiary_id).maybeSingle()
      if (bProf) {
        const newTb = Math.round((Number(bProf.tb_balance || 0) - clawback) * 100) / 100
        await supabase.from('profiles').update({ tb_balance: newTb }).eq('id', c.beneficiary_id)
        // 佣金回冲流水（与 distribute-commission 的 commission_earn 对应，便于对账防资损）
        await supabase.from('tongbao_logs').insert({
          user_id: c.beneficiary_id, order_id: orderId,
          type: 'commission_revoke', delta: -clawback, balance_after: newTb,
          remark: `订单${orderNo}退款佣金回冲`,
        })
      }
    }
    console.log(`[clawback] commission ${c.id} marked refunded, clawback=${clawback}`)
  }

  // 积分扣回（points_logs 真实列：related_order_id/amount/type/source，无 order_id/delta/balance_after）
  const { data: pointsLogs } = await supabase.from('points_logs')
    .select('id, user_id, amount').eq('related_order_id', orderId).eq('type', 'purchase_earn')
  for (const pl of (pointsLogs ?? [])) {
    const deduct = Math.floor((Number(pl.amount) || 0) * ratio)
    if (deduct <= 0) continue
    const { data: profile } = await supabase.from('profiles').select('points').eq('id', pl.user_id).maybeSingle()
    const newPoints = Math.max(0, (profile?.points ?? 0) - deduct)
    await supabase.from('profiles').update({ points: newPoints }).eq('id', pl.user_id)
    await supabase.from('points_logs').insert({
      user_id: pl.user_id,
      related_order_id: orderId,
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
      .select('id, refund_ratio').eq('order_id', orderId)
    for (const it of (items ?? [])) {
      const cur = Number(it.refund_ratio ?? 0)
      const next = Math.min(1, Math.round((cur + ratio) * 10000) / 10000)
      if (next === cur) continue
      await supabase.from('order_item_commissions').update({
        refund_ratio: next,
        refunded_at: new Date().toISOString(),
      }).eq('id', it.id)
    }
    console.log(`[clawback] order_item_commissions refund_ratio accumulated by ${ratio.toFixed(4)} for order ${orderId}`)
  }
}
