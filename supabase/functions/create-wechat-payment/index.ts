/**
 * create-wechat-payment Edge Function
 * 调起微信JSAPI预支付，返回前端所需签名参数
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Wechatpay, { Formatter, Rsa } from 'npm:wechatpay-axios-plugin@0.9.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // 环境检查
  const MERCHANT_ID = Deno.env.get('MERCHANT_ID') ?? ''
  const MERCHANT_APP_ID = Deno.env.get('MERCHANT_APP_ID') ?? ''
  const MCH_CERT_SERIAL_NO = Deno.env.get('MCH_CERT_SERIAL_NO') ?? ''
  const MCH_PRIVATE_KEY = Deno.env.get('MCH_PRIVATE_KEY') ?? ''
  const WECHAT_PAY_PUBLIC_KEY_ID = Deno.env.get('WECHAT_PAY_PUBLIC_KEY_ID') ?? ''
  const WECHAT_PAY_PUBLIC_KEY = Deno.env.get('WECHAT_PAY_PUBLIC_KEY') ?? ''
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

  const missingSecrets = [
    !MERCHANT_ID && 'MERCHANT_ID',
    !MERCHANT_APP_ID && 'MERCHANT_APP_ID',
    !MCH_CERT_SERIAL_NO && 'MCH_CERT_SERIAL_NO',
    !MCH_PRIVATE_KEY && 'MCH_PRIVATE_KEY',
    !WECHAT_PAY_PUBLIC_KEY_ID && 'WECHAT_PAY_PUBLIC_KEY_ID',
    !WECHAT_PAY_PUBLIC_KEY && 'WECHAT_PAY_PUBLIC_KEY',
  ].filter(Boolean)
  if (missingSecrets.length) {
    return Response.json({ error: `微信支付配置缺失，请在插件中心配置：${missingSecrets.join(', ')}` }, { status: 400, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })
  const { data: { user } } = await createClient(
    SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  ).auth.getUser()
  if (!user) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })

  try {
    const { order_id, openid } = await req.json() as { order_id: string; openid: string }
    if (!order_id || !openid) return Response.json({ error: '缺少参数 order_id 或 openid' }, { status: 400, headers: corsHeaders })

    // 查订单
    const { data: order } = await supabase.from('orders').select('id,order_no,total_amount,tb_used,status,user_id').eq('id', order_id).maybeSingle()
    if (!order) return Response.json({ error: '订单不存在' }, { status: 404, headers: corsHeaders })
    if (order.user_id !== user.id) return Response.json({ error: '无权操作此订单' }, { status: 403, headers: corsHeaders })
    if (order.status !== 'pending_pay') return Response.json({ error: `订单状态异常(${order.status})，无法发起支付` }, { status: 400, headers: corsHeaders })

    // 实际微信支付金额 = 总金额 - 情绪豆抵扣
    // 注意：00096 后 tb_used 已统一为「元」口径（1 豆 = 1 元，与 tb_balance 一致），直接相减即可，勿再 ×0.01
    const wxAmount = Math.round((order.total_amount - (order.tb_used ?? 0)) * 100) // 分
    if (wxAmount <= 0) return Response.json({ error: '微信支付金额为0，请使用纯情绪豆支付' }, { status: 400, headers: corsHeaders })

    const notifyUrl = `${SUPABASE_URL}/functions/v1/wechat-payment-callback`

    const wxpay = new Wechatpay({
      mchid: MERCHANT_ID,
      serial: MCH_CERT_SERIAL_NO,
      privateKey: MCH_PRIVATE_KEY,
      certs: { [WECHAT_PAY_PUBLIC_KEY_ID]: WECHAT_PAY_PUBLIC_KEY },
    })

    const { data } = await wxpay.v3.pay.transactions.jsapi.post({
      mchid: MERCHANT_ID,
      appid: MERCHANT_APP_ID,
      description: '来电有喜 · 订单支付',
      out_trade_no: order.order_no,
      notify_url: notifyUrl,
      amount: { total: wxAmount, currency: 'CNY' },
      payer: { openid },
    }, { headers: { 'Wechatpay-Serial': WECHAT_PAY_PUBLIC_KEY_ID } })

    if (!data.prepay_id) {
      return Response.json({ error: '微信预支付失败，prepay_id 为空' }, { status: 500, headers: corsHeaders })
    }

    const nonceStr = Formatter.nonce()
    const timeStamp = '' + Formatter.timestamp()
    const packageStr = 'prepay_id=' + data.prepay_id
    const paySign = Rsa.sign(
      Formatter.joinedByLineFeed(MERCHANT_APP_ID, timeStamp, nonceStr, packageStr),
      Rsa.from(MCH_PRIVATE_KEY)
    )

    // 保存 openid 到订单
    await supabase.from('orders').update({ openid }).eq('id', order_id)

    return Response.json({
      success: true,
      paymentParams: { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign },
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[create-wechat-payment]', err?.message ?? err)
    return Response.json({ error: err?.message ?? '微信支付调用失败，请检查商户配置' }, { status: 500, headers: corsHeaders })
  }
})
