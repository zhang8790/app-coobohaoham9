/**
 * wxacode Edge Function
 * 生成「无限量」小程序码（getwxacodeunlimit），用于朋友圈分享海报锁客。
 *
 * 入参：{ articleId: string, referrerCode?: string }
 * 返回：{ success: true, scene: string, code: "data:image/png;base64,..." }
 *
 * 说明：
 *   - scene 仅 ≤32 字节，故先落 article_share_codes 短码表，扫码时反查 article_id；
 *   - 小程序码打开后，article-detail 通过 query.scene 反查并锁定访客为作者客户；
 *   - 依赖 Secret：MERCHANT_APP_ID（小程序 appid）、WX_SECRET（小程序 secret）。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** 生成 ≤32 字符短码 */
function genScene(): string {
  const u = crypto.randomUUID().replace(/-/g, '')
  return u.slice(0, 24)
}

/** ArrayBuffer → base64（避免大图 btoa(String.fromCharCode(...)) 爆栈） */
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any)
  }
  return btoa(bin)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const APP_ID = Deno.env.get('MERCHANT_APP_ID') ?? ''
  const APP_SECRET = Deno.env.get('WX_SECRET') ?? ''
  if (!APP_ID || !APP_SECRET) {
    return Response.json(
      { success: false, error: '微信小程序未配置（需在 Supabase Secrets 配置 WX_SECRET）' },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const articleId: string = body.articleId
    const referrerCode: string | undefined = body.referrerCode
    if (!articleId) {
      return Response.json({ success: false, error: '缺少 articleId' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 解析分享人（仅作归属参考；锁客主逻辑仍按文章作者）
    let referrerId: string | null = null
    if (referrerCode) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id')
        .or(`referral_code.eq.${referrerCode},invite_code.eq.${referrerCode}`)
        .maybeSingle()
      referrerId = p?.id ?? null
    }

    // 生成短码并落库（冲突重试）
    let scene = ''
    for (let i = 0; i < 5; i++) {
      scene = genScene()
      const { error } = await supabase.from('article_share_codes').insert({
        scene,
        article_id: articleId,
        referrer_id: referrerId,
      })
      if (!error) break
      scene = ''
    }
    if (!scene) {
      return Response.json({ success: false, error: '生成分享码失败' }, { status: 500, headers: corsHeaders })
    }

    // 取 access_token
    const tkRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential` +
      `&appid=${encodeURIComponent(APP_ID)}&secret=${encodeURIComponent(APP_SECRET)}`
    )
    const tk = await tkRes.json()
    if (tk.errcode) {
      console.error('[wxacode] token error:', JSON.stringify(tk))
      return Response.json({ success: false, error: `获取 access_token 失败：${tk.errmsg || tk.errcode}` }, { status: 502, headers: corsHeaders })
    }

    // 生成小程序码（无限量）
    const codeRes = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${tk.access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          page: 'pages/content/article-detail/index',
          width: 430,
          check_path: false,
        }),
      }
    )
    const ct = codeRes.headers.get('content-type') || ''
    if (!ct.includes('image')) {
      const err = JSON.parse(new TextDecoder().decode(await codeRes.arrayBuffer()))
      console.error('[wxacode] code error:', JSON.stringify(err))
      return Response.json({ success: false, error: `生成小程序码失败：${err.errmsg || err.errcode}` }, { status: 502, headers: corsHeaders })
    }

    const base64 = bufToBase64(await codeRes.arrayBuffer())
    return Response.json(
      { success: true, scene, code: `data:image/png;base64,${base64}` },
      { headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('[wxacode] error:', err?.message ?? err)
    return Response.json({ success: false, error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
