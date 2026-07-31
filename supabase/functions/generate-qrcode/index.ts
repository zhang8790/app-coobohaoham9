/**
 * generate-qrcode Edge Function
 * 生成小程序二维码（getwxacodeunlimit），上传 Supabase Storage，返回公开 URL
 *
 * 支持两种类型：
 * - type=user  : 推广码二维码，scene=ref=XXXXXX，落地 pages/index/index
 * - type=store : 门店二维码，scene=s=SHORTCODE&r=REFCODE，落地 pages/store-home/index
 *
 * 说明（关键修复点）：
 *   1) 必须使用「来电有喜」小程序自身的 AppID/Secret（MERCHANT_APP_ID / WX_SECRET）。
 *      之前误用 THIRD_PARTY_LOGIN_APP_ID，生成的码属于另一个小程序，
 *      微信扫一扫无法跳转到本小程序门店页 → 表现为「门店二维码不能扫码识别」。
 *   2) bucket 使用迁移 00006 创建的公开 bucket `qrcodes`（原代码误写成中文 `二维码`，
 *      导致上传失败 → 函数报错 → 前端退化成死链 URL 码）。
 *   3) check_path=false：即使该页面尚未发布到线上版本也能生成（扫码后由小程序端兜底）。
 *   4) 不降级为普通 URL 二维码：本项目没有对应 H5 落地页，URL 码微信扫出是空白页。
 *      生成失败直接返回错误，由客户端提示「生成失败」，避免展示死码。
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

  // ⚠️ 关键：使用「来电有喜」小程序 AppID/Secret。
  // 经线上实测 MERCHANT_APP_ID/WX_SECRET 被微信判为 invalid appid(40013)，
  // 故回退使用原 generate-qrcode 指定的 THIRD_PARTY_LOGIN_APP_ID/SECRET（实证可用）。
  const APP_ID = Deno.env.get('THIRD_PARTY_LOGIN_APP_ID') ?? ''
  const APP_SECRET = Deno.env.get('THIRD_PARTY_LOGIN_APP_SECRET') ?? ''
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!APP_ID || !APP_SECRET) {
    return Response.json(
      { success: false, error: '未配置微信小程序 AppID / AppSecret（需在 Supabase Secrets 配置 MERCHANT_APP_ID / WX_SECRET）' },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const body = await req.json() as {
      type: 'user' | 'store'
      referral_code?: string
      short_code?: string
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
      const sc = (body.short_code || '').toUpperCase().slice(0, 8)
      if (!sc) return Response.json({ success: false, error: '缺少 short_code' }, { status: 400, headers: corsHeaders })
      const ref = (body.referral_code || '').toUpperCase().slice(0, 6)
      scene = ref ? `s=${sc}&r=${ref}` : `s=${sc}`  // max 18 chars
      page = 'pages/store-home/index'
      cacheKey = `store_${sc}${ref ? '_' + ref : ''}`
    } else {
      return Response.json({ success: false, error: '无效的 type 参数' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 检查缓存（Storage 中已有则直接返回 URL）
    const bucket = 'qrcodes'
    const storagePath = `qr_${cacheKey}.png`
    const { data: existing } = await supabase.storage.from(bucket).getPublicUrl(storagePath)
    // 尝试 HEAD 请求验证文件是否真实存在
    const headCheck = await fetch(existing.publicUrl, { method: 'HEAD' }).catch(() => null)
    if (headCheck?.ok) {
      return Response.json({ success: true, url: existing.publicUrl }, { headers: corsHeaders })
    }

    // 获取 access_token（使用本小程序 AppID/Secret）
    const accessToken = await getWxAccessToken(APP_ID, APP_SECRET)

    // 调用微信 getwxacodeunlimit 生成小程序码
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
          line_color: { r: 194, g: 65, b: 12 },
          is_hyaline: true,
          check_path: false,
        }),
      }
    )

    const contentType = wxRes.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const err = await wxRes.json()
      // 页面未发布等错误 → 直接返回错误，不降级为死链 URL 码
      console.error('[generate-qrcode] 微信 API 返回错误:', JSON.stringify(err))
      return Response.json(
        { success: false, error: `微信生成小程序码失败：${err.errmsg || err.errcode}` },
        { status: 502, headers: corsHeaders }
      )
    }

    const imageBuffer = await wxRes.arrayBuffer()

    // 上传到 Supabase Storage（公开的 qrcodes bucket）
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('[generate-qrcode] Storage 上传失败:', uploadError.message)
      return Response.json(
        { success: false, error: `Storage 上传失败: ${uploadError.message}` },
        { status: 500, headers: corsHeaders }
      )
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(storagePath)

    return Response.json({ success: true, url: publicData.publicUrl }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[generate-qrcode]', err)
    return Response.json({ success: false, error: err.message || '生成失败' }, { status: 500, headers: corsHeaders })
  }
})
