/**
 * wechat_miniapp_login Edge Function
 * 微信小程序登录：wx.login() 的 code -> 微信 jscode2session -> openid
 * -> 在 Supabase 查找/创建用户 -> 用 Admin API 直接签发会话 (access_token/refresh_token)
 * -> 前端 supabase.auth.setSession(...) 建立登录态。
 *
 * 不依赖邮件/SMTP（原 magiclink 方案需 SMTP，易失败），直接签发会话最稳。
 *
 * 依赖 Supabase Secrets:
 *   - MERCHANT_APP_ID   = 微信小程序 appid
 *   - WX_SECRET         = 微信小程序 app secret
 *   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (函数运行时自动注入)
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
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!APP_ID || !APP_SECRET) {
    return Response.json(
      { error: '微信登录未配置（需在 Supabase Secrets 配置 MERCHANT_APP_ID / WX_SECRET）' },
      { status: 400, headers: corsHeaders }
    )
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Supabase 服务未配置' }, { status: 500, headers: corsHeaders })
  }

  try {
    const { code } = (await req.json()) as { code?: string }
    if (!code) {
      return Response.json({ error: '缺少微信登录 code' }, { status: 400, headers: corsHeaders })
    }

    // 1. 微信 code -> openid（直连官方 jscode2session，与 get-wechat-openid 同款写法）
    const wxUrl =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${encodeURIComponent(APP_ID)}` +
      `&secret=${encodeURIComponent(APP_SECRET)}` +
      `&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`

    const wxRes = await fetch(wxUrl)
    const wx = await wxRes.json()
    if (wx.errcode) {
      console.error('[wechat_miniapp_login] wx error:', JSON.stringify(wx))
      return Response.json(
        { error: `微信登录失败：${wx.errmsg || wx.errcode}` },
        { status: 502, headers: corsHeaders }
      )
    }
    const openid = wx.openid as string
    if (!openid) {
      return Response.json(
        { error: 'openid 为空，请确认在微信小程序内打开' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 2. Supabase Admin
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 用 openid 派生的稳定虚拟邮箱作为用户唯一标识
    const email = `${openid}@wx.mini.app`

    // 3. 查找已有用户（按虚拟邮箱）
    let userId: string | undefined
    const { data: existing } = await supabase.auth.admin.getUserByEmail(email)
    userId = existing?.user?.id

    // 4. 不存在则创建
    if (!userId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { openid, provider: 'wechat' },
      })
      if (createErr || !created?.user?.id) {
        console.error('[wechat_miniapp_login] createUser error:', createErr?.message)
        return Response.json(
          { error: `创建用户失败：${createErr?.message || 'unknown'}` },
          { status: 500, headers: corsHeaders }
        )
      }
      userId = created.user.id
    }

    // 5. 直接签发会话（无邮件依赖）
    const { data: sessionData, error: sessionErr } = await supabase.auth.admin.createSession({
      userId,
    })
    if (sessionErr || !sessionData?.session) {
      console.error('[wechat_miniapp_login] createSession error:', sessionErr?.message)
      return Response.json(
        { error: `签发会话失败：${sessionErr?.message || 'unknown'}` },
        { status: 500, headers: corsHeaders }
      )
    }

    return Response.json(
      {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      },
      { headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('[wechat_miniapp_login] error:', err?.message ?? err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
