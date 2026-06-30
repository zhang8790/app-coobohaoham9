/**
 * generate-qrcode Edge Function
 * 生成小程序二维码（getwxacodeunlimit），上传 Supabase Storage，返回公开 URL
 *
 * 支持两种类型：
 * - type=user  : 推广码二维码，scene=ref=XXXXXX，落地 pages/index/index
 * - type=store : 门店二维码，scene=s=SHORTCODE&r=REFCODE，落地 pages/store-home/index
 *
 * 请求体 JSON:
 *   { type: 'user', referral_code: string }
 *   { type: 'store', store_short_code: string, referral_code?: string }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getWxAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.access_token) throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`)
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const APP_ID = Deno.env.get('THIRD_PARTY_LOGIN_APP_ID') ?? ''
  const APP_SECRET = Deno.env.get('THIRD_PARTY_LOGIN_APP_SECRET') ?? ''
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!APP_ID || !APP_SECRET) {
    return Response.json({ success: false, error: '未配置微信 AppID / AppSecret' }, { status: 400, headers: corsHeaders })
  }

  try {
    const body = await req.json() as {
      type: 'user' | 'store'
      referral_code?: string
      store_short_code?: string
    }

    // 构建 scene 参数（最大 32 字符）
    let scene = ''
    let page = 'pages/index/index'
    let cacheKey = ''

    if (body.type === 'user') {
      const ref = (body.referral_code || '').toUpperCase().slice(0, 6)
      if (!ref) return Response.json({ success: false, error: '缺少 referral_code' }, { status: 400, headers: corsHeaders })
      scene = `ref=${ref}`          // 10 chars
      page = 'pages/index/index'
      cacheKey = `user_${ref}`
    } else if (body.type === 'store') {
      const sc = (body.store_short_code || '').toUpperCase().slice(0, 8)
      if (!sc) return Response.json({ success: false, error: '缺少 store_short_code' }, { status: 400, headers: corsHeaders })
      const ref = (body.referral_code || '').toUpperCase().slice(0, 6)
      scene = ref ? `s=${sc}&r=${ref}` : `s=${sc}`  // max 18 chars
      page = 'pages/store-home/index'
      cacheKey = `store_${sc}${ref ? '_' + ref : ''}`
    } else {
      return Response.json({ success: false, error: '无效的 type 参数' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 检查缓存（Storage 中已有则直接返回 URL）
    const storagePath = `qr_${cacheKey}.png`
    const { data: existing } = await supabase.storage.from('qrcodes').getPublicUrl(storagePath)
    // 尝试 HEAD 请求验证文件是否真实存在
    const headCheck = await fetch(existing.publicUrl, { method: 'HEAD' }).catch(() => null)
    if (headCheck?.ok) {
      return Response.json({ success: true, url: existing.publicUrl }, { headers: corsHeaders })
    }

    // 获取 access_token
    const accessToken = await getWxAccessToken(APP_ID, APP_SECRET)

    // 调用微信 getwxacodeunlimit 接口
    const wxRes = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          page,
          width: 280,
          auto_color: false,
          line_color: { r: 194, g: 65, b: 12 },  // 武侠朱砂红
          is_hyaline: true,  // 透明背景
        }),
      }
    )

    // 微信返回的是二进制图片（成功）或 JSON（失败）
    const contentType = wxRes.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const err = await wxRes.json()
      throw new Error(`微信 API 错误: ${JSON.stringify(err)}`)
    }

    const imageBuffer = await wxRes.arrayBuffer()

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('qrcodes')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) throw new Error(`Storage 上传失败: ${uploadError.message}`)

    const { data: publicData } = supabase.storage.from('qrcodes').getPublicUrl(storagePath)

    return Response.json({ success: true, url: publicData.publicUrl }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[generate-qrcode]', err)
    return Response.json({ success: false, error: err.message || '生成失败' }, { status: 500, headers: corsHeaders })
  }
})
