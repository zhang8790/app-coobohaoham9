/**
 * get-wechat-openid Edge Function
 * 给非微信登录的用户（手机号/邮箱）静默获取 openid，用于微信支付
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const APP_ID = Deno.env.get('THIRD_PARTY_LOGIN_APP_ID') ?? ''
  const AUTHORIZATION = Deno.env.get('WX_OPEN_CFC_JWT_TOKEN') ?? ''
  const OPENID_URL = 'https://ct6gb7rg8n0rf.cfc-execute.bj.baidubce.com/get_openid'

  if (!APP_ID || !AUTHORIZATION) {
    return Response.json({ success: false, error: '微信登录未配置，请在插件中心配置 THIRD_PARTY_LOGIN_APP_ID 和 WX_OPEN_CFC_JWT_TOKEN' }, { status: 400, headers: corsHeaders })
  }

  try {
    const { code } = await req.json() as { code: string }
    if (!code) return Response.json({ success: false, error: '缺少 code 参数' }, { status: 400, headers: corsHeaders })

    const res = await fetch(OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTHORIZATION },
      body: JSON.stringify({ appid: APP_ID, jscode: code }),
    })
    const data = await res.json()

    if (!data.openid) {
      console.error('[get-wechat-openid] failed:', JSON.stringify(data))
      return Response.json({ success: false, error: '获取 openid 失败，请确认在微信小程序中打开' }, { headers: corsHeaders })
    }

    // 存储到 profiles（供后续支付复用）
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user } } = await userClient.auth.getUser()
      if (user) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        await supabase.from('profiles').update({ openid: data.openid }).eq('id', user.id)
      }
    }

    return Response.json({ success: true, openid: data.openid }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[get-wechat-openid] error:', err?.message ?? err)
    return Response.json({ success: false, error: err?.message ?? '内部错误' }, { headers: corsHeaders })
  }
})
