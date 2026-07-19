/**
 * merchant-payout Edge Function —— 商家货款结算 / 真实分账接入点
 *
 * 三种 action：
 *  - ledger   : 查询 merchant_settlements 台账（admin 对账/审核用）
 *  - backfill : 历史补结算（将已完成但未结算的订单补跑 fn_settle_order）
 *  - payout   : 对「货款提现」申请执行微信支付服务商分账（资金直达商家子商户号，规避二清）
 *
 * 合规要点：
 *  - 真实资金下发走「微信支付服务商分账」模式：资金直接从微信清分至商家子商户号，
 *    平台不池化商家销售款 → 规避二清红线。
 *  - 情绪豆支付部分由平台以自有资金垫付（充值时平台已收 RMB），不分账、不要求商家持豆。
 *
 * 接入前提（用户本机配置）：
 *  - Supabase Secrets：MERCHANT_ID / MERCHANT_APP_ID / MCH_CERT_SERIAL_NO /
 *    MCH_PRIVATE_KEY / WECHAT_PAY_PUBLIC_KEY_ID / WECHAT_PAY_PUBLIC_KEY
 *    （与 create-wechat-payment 共用同一套微信支付证书）。
 *  - stores.wx_sub_mch_id：每个商家在服务商模式下的子商户号（admin 后台维护）。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Wechatpay from 'npm:wechatpay-axios-plugin@0.9.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 万分位
function toFixed4(n: number): number {
  return Math.round(n * 10000) / 10000
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 微信支付配置（与 create-wechat-payment 共用）
  const MERCHANT_ID = Deno.env.get('MERCHANT_ID') ?? ''
  const MERCHANT_APP_ID = Deno.env.get('MERCHANT_APP_ID') ?? ''
  const MCH_CERT_SERIAL_NO = Deno.env.get('MCH_CERT_SERIAL_NO') ?? ''
  const MCH_PRIVATE_KEY = Deno.env.get('MCH_PRIVATE_KEY') ?? ''
  const WECHAT_PAY_PUBLIC_KEY_ID = Deno.env.get('WECHAT_PAY_PUBLIC_KEY_ID') ?? ''
  const WECHAT_PAY_PUBLIC_KEY = Deno.env.get('WECHAT_PAY_PUBLIC_KEY') ?? ''

  const wxConfigured =
    MERCHANT_ID && MERCHANT_APP_ID && MCH_CERT_SERIAL_NO && MCH_PRIVATE_KEY &&
    WECHAT_PAY_PUBLIC_KEY_ID && WECHAT_PAY_PUBLIC_KEY

  try {
    const body = await req.json().catch(() => ({})) as {
      action?: string
      store_id?: string
      withdrawal_id?: string
      page?: number
      limit?: number
    }
    const action = body.action ?? 'ledger'

    // ============ ledger：台账查询 ============
    if (action === 'ledger') {
      const page = Math.max(0, body.page ?? 0)
      const limit = Math.min(100, body.limit ?? 20)
      let q = supabase
        .from('merchant_settlements')
        .select('*, stores(name, wx_sub_mch_id)', { count: 'exact' })
        .order('created_at', { ascending: false })
      if (body.store_id) q = q.eq('store_id', body.store_id)
      const { data, count, error } = await q.range(page * limit, (page + 1) * limit - 1)
      if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders })
      return Response.json({ ok: true, total: count ?? 0, rows: data ?? [] }, { headers: corsHeaders })
    }

    // ============ backfill：历史补结算 ============
    if (action === 'backfill') {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'completed')
        .not('store_id', 'is', null)
      if (!orders?.length) {
        return Response.json({ ok: true, backfilled: 0, message: '无待补结算订单' }, { headers: corsHeaders })
      }
      let done = 0
      let skipped = 0
      for (const o of orders as any[]) {
        // 已是结算状态则跳过
        const { data: ex } = await supabase
          .from('merchant_settlements').select('id').eq('order_id', o.id).limit(1)
        if (ex?.length) { skipped++; continue }
        const r = await supabase.rpc('fn_settle_order', { p_order_id: o.id })
        if (r.data?.ok) done++
      }
      return Response.json({ ok: true, backfilled: done, skipped }, { headers: corsHeaders })
    }

    // ============ payout：执行微信服务商分账 ============
    if (action === 'payout') {
      const wid = body.withdrawal_id
      if (!wid) return Response.json({ error: '缺少 withdrawal_id' }, { status: 400, headers: corsHeaders })

      // 读取提现单（仅 kind='settlement'）
      const { data: w } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', wid).maybeSingle()
      if (!w) return Response.json({ error: '提现单不存在' }, { status: 404, headers: corsHeaders })
      if (w.kind !== 'settlement') return Response.json({ error: '非货款提现单' }, { status: 400, headers: corsHeaders })
      // 允许 pending / approved / processing 调用；已 paid / rejected 视为重复打款，拦截
      if (w.status === 'paid' || w.status === 'rejected') {
        return Response.json({ error: `提现单状态=${w.status}，不可重复打款` }, { status: 400, headers: corsHeaders })
      }

      // 读取门店子商户号
      const { data: store } = await supabase
        .from('stores').select('id, name, wx_sub_mch_id').eq('id', w.store_id).maybeSingle()
      if (!store) return Response.json({ error: '门店不存在' }, { status: 404, headers: corsHeaders })
      if (!store.wx_sub_mch_id) {
        return Response.json({
          ok: false, status: 'NEED_SUB_MCH',
          error: `门店「${store.name}」未配置微信子商户号(wx_sub_mch_id)，无法分账。请在 admin 后台维护。`,
        }, { status: 200, headers: corsHeaders })
      }

      if (!wxConfigured) {
        return Response.json({
          ok: false, status: 'NEED_CONFIG',
          error: '微信支付证书未配置（MERCHANT_ID/MCH_PRIVATE_KEY 等）。请在 Supabase Secrets 配置后重试，或改为平台自有资金手动打款。',
        }, { status: 200, headers: corsHeaders })
      }

      const wxpay = new Wechatpay({
        mchid: MERCHANT_ID,
        serial: MCH_CERT_SERIAL_NO,
        privateKey: MCH_PRIVATE_KEY,
        certs: { [WECHAT_PAY_PUBLIC_KEY_ID]: WECHAT_PAY_PUBLIC_KEY },
      })

      const settlementIds = (w.merchant_settlement_ids || []) as string[]
      if (settlementIds.length === 0) {
        return Response.json({
          ok: true, status: 'MANUAL_PAYOUT',
          message: '该货款提现单未关联结算台账，需平台以自有资金经银行转账/企业付款完成。',
          amount: Number(w.amount),
        }, { headers: corsHeaders })
      }

      // 读取该提现单关联的结算台账 + 订单交易号（关键列：wechat_transaction_id）
      const { data: rows, error: rowsErr } = await supabase
        .from('merchant_settlements')
        .select('id, settle_amount, cash_portion, tb_portion, orders!inner(wechat_transaction_id, order_no)')
        .in('id', settlementIds)
      if (rowsErr) {
        return Response.json({ error: `读取结算台账失败: ${rowsErr.message}` }, { status: 500, headers: corsHeaders })
      }
      if (!rows?.length) {
        return Response.json({
          ok: true, status: 'MANUAL_PAYOUT',
          message: '未找到关联的结算台账，需平台以自有资金经银行转账/企业付款完成。',
          amount: Number(w.amount),
        }, { headers: corsHeaders })
      }

      let wechatTotal = 0
      let manualTotal = 0
      let sentCount = 0
      let failCount = 0
      const details: any[] = []

      for (const row of rows as any[]) {
        const settleAmount = Number(row.settle_amount || 0)
        const cashPortion = Number(row.cash_portion || 0)
        const txId = row.orders?.wechat_transaction_id as string | undefined
        const orderNo = row.orders?.order_no || '-'

        // 现金实付部分走微信服务商分账；情绪豆垫付部分 + 差额由平台自有资金支付
        const cashPayout = Math.min(settleAmount, cashPortion)
        const manualPayout = Math.max(0, settleAmount - cashPayout)

        if (cashPayout > 0 && txId) {
          const amountFen = Math.round(toFixed4(cashPayout) * 100)
          try {
            const { data: ps } = await (wxpay as any).v3.profitsharing.orders.post({
              appid: MERCHANT_APP_ID,
              sub_mchid: store.wx_sub_mch_id,
              transaction_id: txId,
              out_order_no: `SETTLE-${wid.slice(0, 8).toUpperCase()}-${String(row.id).slice(0, 8).toUpperCase()}-${Date.now()}`,
              receivers: [
                {
                  type: 'merchant',
                  account: store.wx_sub_mch_id,
                  amount: amountFen,
                  description: `商家货款结算-${store.name}-${orderNo}`,
                },
              ],
            })
            if (ps?.status === 'PROCESSING' || ps?.status === 'FINISHED') {
              wechatTotal += cashPayout
              manualTotal += manualPayout  // 情绪豆垫付部分仍需平台自有资金支付
              sentCount++
              details.push({ row_id: row.id, order_no: orderNo, type: 'wechat', amount: cashPayout, manual: manualPayout, status: ps.status })
            } else {
              failCount++
              details.push({ row_id: row.id, order_no: orderNo, type: 'wechat', amount: cashPayout, status: 'REJECTED', detail: ps })
            }
          } catch (wxErr: any) {
            failCount++
            details.push({ row_id: row.id, order_no: orderNo, type: 'wechat', amount: cashPayout, error: wxErr?.message ?? '微信分账调用失败' })
          }
        } else {
          manualTotal += manualPayout
          if (cashPayout > 0 && !txId) {
            // 有现金部分但无交易号（异常），只能平台垫付
            manualTotal += cashPayout
            details.push({ row_id: row.id, order_no: orderNo, type: 'manual', amount: cashPayout + manualPayout, reason: 'missing_transaction_id' })
          } else {
            details.push({ row_id: row.id, order_no: orderNo, type: 'manual', amount: manualPayout })
          }
        }
      }

      if (sentCount > 0) {
        return Response.json({
          ok: true,
          status: 'PROFITSHARING_SENT',
          message: `已发起 ${sentCount} 笔微信服务商分账，资金将直达商家子商户号；另有 ¥${manualTotal.toFixed(2)} 为情绪豆垫付部分，需平台自有资金支付。`,
          wechat_total: Math.round(wechatTotal * 100) / 100,
          manual_total: Math.round(manualTotal * 100) / 100,
          details,
        }, { headers: corsHeaders })
      }

      return Response.json({
        ok: true,
        status: 'MANUAL_PAYOUT',
        message: '该笔货款无微信分账交易号或全部为情绪豆支付部分，需平台以自有资金经银行转账/企业付款完成。',
        manual_total: Math.round(manualTotal * 100) / 100,
        details,
      }, { headers: corsHeaders })
    }

    return Response.json({ error: `未知 action: ${action}` }, { status: 400, headers: corsHeaders })
  } catch (err: any) {
    console.error('[merchant-payout]', err?.message ?? err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
