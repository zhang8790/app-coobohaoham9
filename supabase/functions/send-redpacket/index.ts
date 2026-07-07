/**
 * send-redpacket Edge Function
 * 领取红包后，将真实现金通过微信支付 v3「商家转账到零钱」发放到用户微信零钱。
 *
 * 触发：小程序 campaign-claim 页在 claim_campaign 成功后调用。
 * 安全：全程服务端执行，密钥仅存于 Supabase Secrets，不落前端。
 *       openid 优先使用前端传入，缺失时由服务端从 profiles 表读取。
 *
 * 状态机（防资损）：
 *   pending_manual → 框架待启用（未开启真发钱，仅记录）
 *   processing     → 已提交微信，受理中
 *   accepted       → 微信已受理（异步到账），待对账确认
 *   success        → 已确认到账
 *   failed         → 调用失败（记录 error_msg，可人工/批量重试）
 *
 * 并发安全：redpacket_payouts 有 UNIQUE(user_id, campaign_id) 兜底，配合本函数预查，
 *          确保连点/网络重试不会产生重复打款。
 *
 * 开关：REDPACKET_PAYOUT_ENABLED !== 'true' 时，仅写入 redpacket_payouts
 *       状态=pending_manual（待启用/待人工发放），不发真实请求。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Formatter, Rsa } from 'npm:wechatpay-axios-plugin@0.9.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 转账场景 ID：1000 = 现金营销（来电有喜新人红包属此类）
const TRANSFER_SCENE_ID = '1000'
const TRANSFER_REMARK = '来电有喜新人红包'

// 商家转账到零钱单笔限额：0.1元 ~ 200元（单位：分）
const MIN_AMOUNT_FEN = 10
const MAX_AMOUNT_FEN = 20000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })
  const { data: { user } } = await createClient(
    SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  ).auth.getUser()
  if (!user) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })

  try {
    const body = await req.json() as {
      campaign_id?: number
      openid?: string | null
      amount_fen?: number
      claim_id?: string | null
    }
    const campaign_id = body.campaign_id
    const amount_fen = Math.round(Number(body.amount_fen) || 0)
    const claim_id = body.claim_id ?? null

    if (!campaign_id || !amount_fen || amount_fen <= 0) {
      return Response.json({ error: '缺少参数 campaign_id 或 amount_fen 非法' }, { status: 400, headers: corsHeaders })
    }

    // 金额校验：商家转账到零钱单笔 0.1~200 元
    if (amount_fen < MIN_AMOUNT_FEN) {
      return Response.json({ error: `红包金额过小（最低 0.1 元）` }, { status: 400, headers: corsHeaders })
    }
    if (amount_fen > MAX_AMOUNT_FEN) {
      return Response.json({ error: `红包金额超限（单笔最高 200 元）` }, { status: 400, headers: corsHeaders })
    }

    const ENABLED = (Deno.env.get('REDPACKET_PAYOUT_ENABLED') ?? 'false') === 'true'

    // ===== 预查：已 success/accepted/processing 视为已处理，直接返回，绝不再打款 =====
    const buildAlready = (ex: { id: string; status: string; wx_transfer_bill_no: string | null }) => {
      const done = ex.status === 'success' || ex.status === 'accepted'
      return Response.json({
        success: true,
        mode: done ? 'live' : 'processing',
        already: true,
        payout_id: ex.id,
        transfer_bill_no: ex.wx_transfer_bill_no ?? null,
        message: done ? '现金红包已受理，将发放至您的微信零钱' : '红包发放处理中',
      }, { headers: corsHeaders })
    }

    const { data: existing } = await supabase
      .from('redpacket_payouts')
      .select('id, status, wx_transfer_bill_no')
      .eq('user_id', user.id)
      .eq('campaign_id', campaign_id)
      .in('status', ['success', 'accepted', 'processing'])
      .order('created_at', { ascending: false })
      .maybeSingle()
    if (existing) return buildAlready(existing)

    // openid：优先用前端传入，缺失时由服务端从 profiles 读取
    let openid: string | null = (body.openid && body.openid.trim()) ? body.openid.trim() : null
    if (!openid) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('openid')
        .eq('id', user.id)
        .maybeSingle()
      openid = prof?.openid ?? null
    }

    // 写入发放记录（UNIQUE(user_id, campaign_id) 兜底并发重复；冲突则按已存在返回，绝不再打款）
    const { data: payout, error: insErr } = await supabase
      .from('redpacket_payouts')
      .insert({
        user_id: user.id,
        campaign_id,
        claim_id,
        openid,
        amount_fen,
        status: ENABLED ? 'processing' : 'pending_manual',
      })
      .select('id, status, wx_transfer_bill_no')
      .single()

    if (insErr) {
      if (insErr.code === '23505') {
        // 唯一约束冲突（并发兜底命中）：取已存在的记录返回
        const { data: dup } = await supabase
          .from('redpacket_payouts')
          .select('id, status, wx_transfer_bill_no')
          .eq('user_id', user.id)
          .eq('campaign_id', campaign_id)
          .maybeSingle()
        if (dup) return buildAlready(dup)
      }
      return Response.json({ error: '发放记录写入失败：' + (insErr?.message ?? '') }, { status: 500, headers: corsHeaders })
    }
    const payoutId = payout.id

    // 框架待启用：仅记录，不发钱
    if (!ENABLED) {
      return Response.json({
        success: true,
        mode: 'manual',
        payout_id: payoutId,
        message: '红包已记录，待启用商户转账后发放至微信零钱',
      }, { headers: corsHeaders })
    }

    // ===== 以下为真发钱逻辑（REDPACKET_PAYOUT_ENABLED=true） =====
    const MERCHANT_ID = Deno.env.get('MERCHANT_ID') ?? ''
    const MERCHANT_APP_ID = Deno.env.get('MERCHANT_APP_ID') ?? ''
    const MCH_CERT_SERIAL_NO = Deno.env.get('MCH_CERT_SERIAL_NO') ?? ''
    const MCH_PRIVATE_KEY = Deno.env.get('MCH_PRIVATE_KEY') ?? ''

    const missing = [
      !MERCHANT_ID && 'MERCHANT_ID',
      !MERCHANT_APP_ID && 'MERCHANT_APP_ID',
      !MCH_CERT_SERIAL_NO && 'MCH_CERT_SERIAL_NO',
      !MCH_PRIVATE_KEY && 'MCH_PRIVATE_KEY',
    ].filter(Boolean)
    if (missing.length) {
      await supabase.from('redpacket_payouts').update({
        status: 'failed',
        error_msg: '微信支付商户密钥缺失：' + missing.join(', '),
        updated_at: new Date().toISOString(),
      }).eq('id', payoutId)
      return Response.json({ error: '微信商户密钥未配置：' + missing.join(', '), payout_id: payoutId }, { status: 400, headers: corsHeaders })
    }

    if (!openid) {
      await supabase.from('redpacket_payouts').update({
        status: 'failed',
        error_msg: '缺少用户 openid（请确认在微信小程序内登录，已自动获取授权）',
        updated_at: new Date().toISOString(),
      }).eq('id', payoutId)
      return Response.json({ error: '缺少 openid，无法发放', payout_id: payoutId }, { status: 400, headers: corsHeaders })
    }

    // 全局唯一单号（微信要求 out_bill_no 不可重复）
    const out_bill_no = `RP${Date.now()}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const url = 'https://api.mch.weixin.qq.com/v3/fund-app/mch-transfer/transfer-to-balance'
    const reqBody = JSON.stringify({
      appid: MERCHANT_APP_ID,
      out_bill_no,
      transfer_scene_id: TRANSFER_SCENE_ID,
      openid,
      amount: { total: amount_fen, currency: 'CNY' },
      transfer_remark: TRANSFER_REMARK,
    })

    // 手动构造 v3 签名（WECHATPAY2-SHA256-RSA2048）
    const method = 'POST'
    const canonicalUrl = '/v3/fund-app/mch-transfer/transfer-to-balance'
    const timestamp = '' + Formatter.timestamp()
    const nonce = Formatter.nonce()
    const signature = Rsa.sign(
      Formatter.joinedByLineFeed(method, canonicalUrl, timestamp, nonce, reqBody),
      Rsa.from(MCH_PRIVATE_KEY)
    )
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${MERCHANT_ID}",nonce_str="${nonce}",` +
      `signature="${signature}",timestamp="${timestamp}",serial_no="${MCH_CERT_SERIAL_NO}"`

    const wxRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'laidianyouxi/1.0',
      },
      body: reqBody,
    })
    const wxText = await wxRes.text()
    let wxData: any = null
    try { wxData = JSON.parse(wxText) } catch { /* 非 JSON 响应 */ }

    if (!wxRes.ok) {
      await supabase.from('redpacket_payouts').update({
        status: 'failed',
        error_msg: `微信受理失败(${wxRes.status})：${wxText}`,
        updated_at: new Date().toISOString(),
      }).eq('id', payoutId)
      return Response.json({ error: '微信转账受理失败', detail: wxData, payout_id: payoutId }, { status: 502, headers: corsHeaders })
    }

    // 微信返回 200 = 「已受理」，金额异步到账（state 通常为 ACCEPTED）。
    // 先置 accepted 中间态，待微信账单/回调确认到账后再翻 success，避免「受理即记成功」的资损风险。
    await supabase.from('redpacket_payouts').update({
      status: 'accepted',
      wx_out_bill_no: out_bill_no,
      wx_transfer_bill_no: wxData?.transfer_bill_no ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', payoutId)

    return Response.json({
      success: true,
      mode: 'live',
      payout_id: payoutId,
      transfer_bill_no: wxData?.transfer_bill_no ?? null,
      message: '现金红包已受理，将发放至您的微信零钱',
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[send-redpacket]', err?.message ?? err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
