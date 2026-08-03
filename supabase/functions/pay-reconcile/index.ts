/**
 * pay-reconcile Edge Function
 * 每日/手动 对账：本地 orders / refunds 状态、金额 与 微信支付侧 比对，差异落 reconcile_discrepancies。
 *
 * 支付对账：逐单调微信查单 API（wechatpay-axios-plugin），
 *   - 微信 SUCCESS + 本地 pending_pay  → 漏回调（资损/漏分佣风险）
 *   - 本地已支付类 + 微信 NOTPAY/CLOSED/PAYERROR → 本地状态错误（假支付/漏关单）
 *   - 微信 SUCCESS + 金额不符  → 资损风险
 * 退款对账（本地一致性）：refunds.status='completed' ↔ orders.refund_status / refunded_amount 是否对齐。
 *
 * 微信不可用（配置缺失/初始化失败）时降级：跳过支付查单，仅做退款本地一致性，绝不整体崩溃。
 * 单笔查单失败不中断整体，记一笔 QUERY_FAILED 差异。有差异才推 biz-alert（避免空跑刷屏）。
 *
 * 调用：curl -X POST .../functions/v1/pay-reconcile -H "Authorization: Bearer <anon>" \
 *        -H "Content-Type: application/json" -d '{"days":7}'
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Wechatpay from 'npm:wechatpay-axios-plugin@0.9.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const MERCHANT_ID = Deno.env.get('MERCHANT_ID') ?? ''
    const MCH_CERT_SERIAL_NO = Deno.env.get('MCH_CERT_SERIAL_NO') ?? ''
    const MCH_PRIVATE_KEY = Deno.env.get('MCH_PRIVATE_KEY') ?? ''
    const WECHAT_PAY_PUBLIC_KEY_ID = Deno.env.get('WECHAT_PAY_PUBLIC_KEY_ID') ?? ''
    const WECHAT_PAY_PUBLIC_KEY = Deno.env.get('WECHAT_PAY_PUBLIC_KEY') ?? ''

    // 微信初始化放在 try 内：失败仅降级跳过支付查单，不让整个函数崩溃（否则网关返回 Internal Server Error）
    const wxConfigured = MERCHANT_ID && MCH_CERT_SERIAL_NO && MCH_PRIVATE_KEY && WECHAT_PAY_PUBLIC_KEY_ID && WECHAT_PAY_PUBLIC_KEY
    let wxpay: any = null
    if (wxConfigured) {
      try {
        wxpay = new Wechatpay({
          mchid: MERCHANT_ID,
          serial: MCH_CERT_SERIAL_NO,
          privateKey: MCH_PRIVATE_KEY,
          certs: { [WECHAT_PAY_PUBLIC_KEY_ID]: WECHAT_PAY_PUBLIC_KEY },
        })
      } catch (e: any) {
        console.warn('[pay-reconcile] 微信 SDK 初始化失败，跳过支付查单:', e?.message)
        wxpay = null
      }
    }

    const { days = 7 } = await req.json().catch(() => ({ days: 7 })) as { days?: number }
    const since = new Date(Date.now() - days * 86400000).toISOString()

    let payChecked = 0
    let payDisc = 0
    let refundDisc = 0

    // ---------- 支付对账（用 neq 过滤，规避 orders.status 枚举越界 22P02）----------
    if (!wxpay) {
      console.warn('[pay-reconcile] 微信不可用，跳过支付查单（仅做退款本地一致性）')
    } else {
      const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('id, order_no, status, total_amount, tb_used, user_id')
        .neq('status', 'pending_pay')
        .neq('status', 'cancelled')
        .gte('updated_at', since)
        .not('order_no', 'like', 'ffff%')
        .not('order_no', 'like', 'TEST_%')
        .order('updated_at', { ascending: false })
        .limit(2000)

      if (oErr) throw new Error(`查 orders 失败: ${oErr.message}`)

      for (const o of orders ?? []) {
        payChecked++
        const localWxAmount = Math.round((Number(o.total_amount) - Number(o.tb_used ?? 0)) * 100) / 100

        let wx: any = null
        try {
          const r: any = await wxpay.v3.pay.transactions.outTradeNo.get({ out_trade_no: o.order_no })
          wx = r?.data ?? null
        } catch (e: any) {
          console.warn('[pay-reconcile] 查单失败', o.order_no, e?.message)
          await supabase.from('reconcile_discrepancies').insert({
            biz_type: 'pay', order_id: o.id, order_no: o.order_no,
            local_status: o.status, wechat_status: 'QUERY_FAILED',
            detail: '微信查单失败: ' + (e?.message ?? '未知'),
          }).then(() => {}, () => {})
          payDisc++
          continue
        }
        if (!wx) {
          await supabase.from('reconcile_discrepancies').insert({
            biz_type: 'pay', order_id: o.id, order_no: o.order_no,
            local_status: o.status, wechat_status: 'EMPTY',
            detail: '微信查单返回空',
          }).then(() => {}, () => {})
          payDisc++
          continue
        }

        const tradeState = wx.trade_state // SUCCESS / REFUND / NOTPAY / CLOSED / PAYERROR
        const wxAmount = Math.round((Number(wx.amount?.total ?? 0) / 100) * 100) / 100

        // 漏回调：微信已付但本地仍 pending_pay
        if (tradeState === 'SUCCESS' && o.status === 'pending_pay') {
          await supabase.from('reconcile_discrepancies').insert({
            biz_type: 'pay', order_id: o.id, order_no: o.order_no,
            local_status: o.status, wechat_status: tradeState,
            local_amount: localWxAmount, wechat_amount: wxAmount, diff_amount: 0,
            detail: '漏回调：微信已支付但本地仍为 pending_pay（需补触发支付回调/分佣）',
          }).then(() => {}, () => {})
          payDisc++
          continue
        }

        // 本地已支付类 但微信未成功 → 本地状态错误（假支付/漏关单）
        if (
          o.status !== 'pending_pay' &&
          (tradeState === 'NOTPAY' || tradeState === 'CLOSED' || tradeState === 'PAYERROR')
        ) {
          await supabase.from('reconcile_discrepancies').insert({
            biz_type: 'pay', order_id: o.id, order_no: o.order_no,
            local_status: o.status, wechat_status: tradeState,
            local_amount: localWxAmount, wechat_amount: wxAmount, diff_amount: 0,
            detail: '本地已支付状态但微信侧未成功（可能为未真付款/漏关单）',
          }).then(() => {}, () => {})
          payDisc++
          continue
        }

        // 金额不符（资损）
        if (tradeState === 'SUCCESS' && Math.abs(wxAmount - localWxAmount) > 0.01) {
          await supabase.from('reconcile_discrepancies').insert({
            biz_type: 'pay', order_id: o.id, order_no: o.order_no,
            local_status: o.status, wechat_status: tradeState,
            local_amount: localWxAmount, wechat_amount: wxAmount,
            diff_amount: Math.round((wxAmount - localWxAmount) * 100) / 100,
            detail: '微信实付金额与本地应收现金不符（资损风险）',
          }).then(() => {}, () => {})
          payDisc++
          continue
        }
      }
    }

    // ---------- 退款本地一致性 ----------
    const { data: refunds, error: rErr } = await supabase
      .from('refunds')
      .select('id, refund_no, order_id, order_no, status, refund_amount, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', since)
      .order('completed_at', { ascending: false })
      .limit(2000)
    if (rErr) throw new Error(`查 refunds 失败: ${rErr.message}`)

    for (const rf of refunds ?? []) {
      const { data: ord } = await supabase
        .from('orders')
        .select('refund_status, refunded_amount, total_amount')
        .eq('id', rf.order_id)
        .maybeSingle()
      if (!ord) continue

      if (ord.refund_status !== 'completed') {
        await supabase.from('reconcile_discrepancies').insert({
          biz_type: 'refund', order_id: rf.order_id, order_no: rf.order_no, refund_no: rf.refund_no,
          local_status: ord.refund_status, wechat_status: 'LOCAL_MISMATCH',
          local_amount: rf.refund_amount,
          detail: '退款单 status=completed 但订单 refund_status 未同步为 completed',
        }).then(() => {}, () => {})
        refundDisc++
        continue
      }
      if (Math.abs(Number(ord.refunded_amount ?? 0) - Number(rf.refund_amount)) > 0.01) {
        await supabase.from('reconcile_discrepancies').insert({
          biz_type: 'refund', order_id: rf.order_id, order_no: rf.order_no, refund_no: rf.refund_no,
          local_status: ord.refund_status, wechat_status: 'AMOUNT_MISMATCH',
          local_amount: rf.refund_amount, wechat_amount: ord.refunded_amount,
          diff_amount: Math.round((Number(rf.refund_amount) - Number(ord.refunded_amount ?? 0)) * 100) / 100,
          detail: '退款金额与订单已退金额(refunded_amount)不符',
        }).then(() => {}, () => {})
        refundDisc++
        continue
      }
    }

    const totalDisc = payDisc + refundDisc

    // 有差异才告警（避免空跑刷屏）
    if (totalDisc > 0) {
      await supabase.functions.invoke('biz-alert', {
        body: {
          level: 'critical',
          title: `对账发现 ${totalDisc} 笔差异`,
          content:
            `支付查单 ${payChecked} 笔，支付差异 ${payDisc} 笔；退款差异 ${refundDisc} 笔。` +
            `请登录后台处理（漏回调/假支付/资损/退款未同步）。`,
          source: 'pay-reconcile',
          tags: { payChecked, payDisc, refundDisc, days },
        },
      }).then(() => {}, (e: any) => console.warn('[pay-reconcile] 告警失败', e?.message))
    }

    return Response.json({ success: true, wxReady: !!wxpay, payChecked, payDisc, refundDisc, totalDisc, since }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[pay-reconcile] error:', err?.message)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
