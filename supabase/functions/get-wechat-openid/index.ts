/**
 * get-wechat-openid Edge Function
 * 给非微信登录的用户（手机号/邮箱）静默获取 openid，用于微信支付 / 真发现金红包。
 *
 * 2026-07-07 重写：原实现将用户 jscode 发给第三方百度云函数代理，存在隐私与可用性风险。
 * 现改为直连微信官方 jscode2session（标准做法，零外部依赖）。
 *   依赖 Secret：
 *     - MERCHANT_APP_ID  = 小程序 appid（wxb5bdfdbb471a500f）
 *     - WX_SECRET        = 小程序 app secret（需在 Supabase Secrets 配置）
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const APP_ID = Deno.env.get('MERCHANT_APP_ID') ?? ''
  const APP_SECRET = Deno.env.get('WX_SECRET') ?? ''

  if (!APP_ID || !APP_SECRET) {
    return Response.json(
      { success: false, error: '微信登录未配置（需在 Supabase Secrets 配置 WX_SECRET）' },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const { code } = await req.json() as { code: string }
    if (!code) {
      return Response.json({ success: false, error: '缺少 code 参数' }, { status: 400, headers: corsHeaders })
    }

    // 直连微信官方 jscode2session
    const url =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${encodeURIComponent(APP_ID)}` +
      `&secret=${encodeURIComponent(APP_SECRET)}` +
      `&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`

    const res = await fetch(url)
    const data = await res.json()

    if (data.errcode) {
      console.error('[get-wechat-openid] wx error:', JSON.stringify(data))
      return Response.json(
        { success: false, error: `获取 openid 失败：${data.errmsg || data.errcode}` },
        { status: 502, headers: corsHeaders }
      )
    }

    const openid = data.openid
    if (!openid) {
      console.error('[get-wechat-openid] empty openid:', JSON.stringify(data))
      return Response.json({ success: false, error: 'openid 为空，请确认在微信小程序内打开' }, { headers: corsHeaders })
    }

    // 存储到 profiles（供后续支付/发钱复用）
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user } } = await userClient.auth.getUser()
      if (user) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        await supabase.from('profiles').update({ openid }).eq('id', user.id)
      }
    }

    return Response.json({ success: true, openid }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[get-wechat-openid] error:', err?.message ?? err)
    return Response.json({ success: false, error: err?.message ?? '内部错误' }, { headers: corsHeaders })
  }
})
