/**
 * refund-order Edge Function
 * 流程：
 *   1. 鉴权 + 校验参数
 *   2. 查订单 & 验证退款资格
 *   3. 调 get_refundable_amount RPC 确认可退金额
 *   4. 写 refunds 记录（pending_review）
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
    const { data: order } = await supabase.from('orders')
      .select('id,order_no,user_id,status,total_amount,refunded_amount,wechat_transaction_id,payment_method,gold_beans_used')
      .eq('id', order_id).maybeSingle()

    if (!order) return Response.json({ success: false, error: '订单不存在' }, { status: 404, headers: corsHeaders })
    if (order.user_id !== user.id) return Response.json({ success: false, error: '无权操作此订单' }, { status: 403, headers: corsHeaders })
    if (!['pending_ship', 'pending_receive', 'completed'].includes(order.status)) {
      return Response.json({ success: false, error: `订单状态(${order.status})不支持退款` }, { status: 400, headers: corsHeaders })
    }

    // 2. 查可退金额
    const { data: refundableData } = await supabase.rpc('get_refundable_amount', { p_order_id: order_id, p_item_index: item_index })
    const refundable = Number(refundableData ?? 0)
    if (refund_amount > refundable + 0.0001) {
      return Response.json({ success: false, error: `退款金额(¥${refund_amount})超过可退金额(¥${refundable.toFixed(2)})` }, { status: 400, headers: corsHeaders })
    }

    const refundNo = generateRefundNo()

    // 3. 写退款申请记录
    const { data: refundRecord, error: insertErr } = await supabase.from('refunds').insert({
      refund_no: refundNo, order_id, order_no, item_index, user_id: user.id,
      refund_quantity, refund_amount, reason, description: description ?? null,
      status: 'processing',
    }).select().maybeSingle()

    if (insertErr || !refundRecord) {
      return Response.json({ success: false, error: '创建退款记录失败：' + insertErr?.message }, { status: 500, headers: corsHeaders })
    }

    // 4. 发起微信退款（如有微信支付部分）
    const wxRefundAmount = Math.max(
      0,
      Math.round((refund_amount - (Number(order.gold_beans_used ?? 0) * 0.01 * (refund_amount / Number(order.total_amount)))) * 100)
    )

    const MERCHANT_ID = Deno.env.get('MERCHANT_ID') ?? ''
    const MCH_CERT_SERIAL_NO = Deno.env.get('MCH_CERT_SERIAL_NO') ?? ''
    const MCH_PRIVATE_KEY = Deno.env.get('MCH_PRIVATE_KEY') ?? ''
    const WECHAT_PAY_PUBLIC_KEY_ID = Deno.env.get('WECHAT_PAY_PUBLIC_KEY_ID') ?? ''
    const WECHAT_PAY_PUBLIC_KEY = Deno.env.get('WECHAT_PAY_PUBLIC_KEY') ?? ''
    const notifyUrl = `${SUPABASE_URL}/functions/v1/wechat-refund-callback`

    let wechatRefundId: string | null = null

    if (wxRefundAmount > 0 && order.wechat_transaction_id && MERCHANT_ID && MCH_CERT_SERIAL_NO && MCH_PRIVATE_KEY) {
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

    // 5. 无微信支付（纯金豆订单）→ 直接退还金豆
    if (wxRefundAmount === 0) {
      const goldBeansToReturn = Math.floor(refund_amount / 0.01)
      if (goldBeansToReturn > 0) {
        const { data: profile } = await supabase.from('profiles').select('gold_beans').eq('id', user.id).maybeSingle()
        await supabase.from('profiles').update({ gold_beans: (profile?.gold_beans ?? 0) + goldBeansToReturn }).eq('id', user.id)
      }
      // 直接完成退款
      await supabase.from('refunds').update({ status: 'completed', wechat_refund_id: null, completed_at: new Date().toISOString() }).eq('id', refundRecord.id)
      await supabase.rpc('update_order_refunded_amount', { p_order_id: order_id, p_amount: refund_amount })
      // 触发佣金&积分扣回
      await triggerClawback(supabase, order_id, order.order_no, user.id, refund_amount, Number(order.total_amount))
      // 更新订单状态
      await supabase.from('orders').update({ status: 'after_sale' }).eq('id', order_id)
      return Response.json({ success: true, refund_id: refundRecord.id, refund_no: refundNo, method: 'gold_beans' }, { headers: corsHeaders })
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

  // 佣金扣回：按比例标记
  const { data: commissions } = await supabase.from('commissions')
    .select('id, beneficiary_id, commission_amount').eq('order_id', orderId).eq('status', 'pending')

  for (const c of (commissions ?? [])) {
    const clawback = Math.round(c.commission_amount * ratio * 10000) / 10000
    await supabase.from('commissions').update({ status: 'refunded' }).eq('id', c.id)
    // 若已发放到余额则扣回（此处标记状态即可，T+7结算前不扣余额）
    console.log(`[clawback] commission ${c.id} marked refunded, clawback=${clawback}`)
  }

  // 积分扣回
  const { data: pointsLogs } = await supabase.from('points_logs')
    .select('id, user_id, delta').eq('order_id', orderId).eq('type', 'purchase_earn')
  for (const pl of (pointsLogs ?? [])) {
    const deduct = Math.floor(pl.delta * ratio)
    if (deduct <= 0) continue
    const { data: profile } = await supabase.from('profiles').select('points').eq('id', pl.user_id).maybeSingle()
    const newPoints = Math.max(0, (profile?.points ?? 0) - deduct)
    await supabase.from('profiles').update({ points: newPoints }).eq('id', pl.user_id)
    await supabase.from('points_logs').insert({
      user_id: pl.user_id, order_id: orderId,
      type: 'refund_deduct', delta: -deduct, balance_after: newPoints,
      remark: `订单${orderNo}退款积分扣回`,
    })
  }
}
