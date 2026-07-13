/**
 * send-notification Edge Function
 * 写 notifications 表 + 调 微信「订阅消息」subscribeMessage.send
 *
 * 5 个模板对应 5 种业务事件（tmpl_id 从环境变量读）：
 *   TMPL_ORDER_PAID         订单支付成功通知
 *   TMPL_COMMISSION_ARRIVED 佣金到账通知
 *   TMPL_WITHDRAW_PROGRESS  提现进度通知
 *   TMPL_REFUND_RESULT      退款结果通知
 *   TMPL_ANNOUNCEMENT       系统公告通知
 *
 * 调用方式：
 *   1) 单发：{ user_id, type, title, body, order_id?, payload? }
 *   2) 广播（公告）：{ broadcast: true, type: 'announcement', title, body, payload? }
 *      → 查 profiles 全部有 openid 的用户，循环调用单发（按 1000 批）
 *
 * 失败兜底：微信推送失败不影响 notifications 写库（用户进消息中心仍能看历史）
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ 配置 ============

const WX_APPID = Deno.env.get('WX_APPID') ?? ''
const WX_SECRET = Deno.env.get('WX_SECRET') ?? ''

// 5 个订阅消息模板 ID（用户在 mp.weixin.qq.com 后台申请后填入 env）
const TMPL_IDS: Record<string, string> = {
  order_paid:          Deno.env.get('TMPL_ORDER_PAID') ?? '',
  commission_arrived:  Deno.env.get('TMPL_COMMISSION_ARRIVED') ?? '',
  withdraw_progress:   Deno.env.get('TMPL_WITHDRAW_PROGRESS') ?? '',
  refund_result:       Deno.env.get('TMPL_REFUND_RESULT') ?? '',
  announcement:        Deno.env.get('TMPL_ANNOUNCEMENT') ?? '',
}

// access_token 缓存（同进程内有效 2h）
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  if (!WX_APPID || !WX_SECRET) throw new Error('WX_APPID/WX_SECRET 未配置')

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`
  const resp = await fetch(url)
  const data = await resp.json() as { access_token?: string; expires_in?: number; errmsg?: string }
  if (!data.access_token) throw new Error(`微信 access_token 获取失败: ${data.errmsg ?? '未知'}`)

  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in ?? 7200) * 1000 }
  return data.access_token
}

/**
 * 调微信 subscribeMessage.send
 * 返回 { ok, errcode, errmsg }，失败不抛异常（写库已落，通知失败可走"消息中心补看"）
 */
async function sendWxMessage(openid: string, tmplId: string, data: Record<string, { value: string }>, page?: string) {
  if (!tmplId) return { ok: false, errcode: -1, errmsg: 'tmpl_id 未配置' }
  try {
    const token = await getAccessToken()
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: openid, template_id: tmplId, data, page: page ?? 'pages/messages/index' }),
    })
    const result = await resp.json() as { errcode: number; errmsg: string; msgid?: string }
    return { ok: result.errcode === 0, errcode: result.errcode, errmsg: result.errmsg, msgid: result.msgid }
  } catch (e) {
    return { ok: false, errcode: -1, errmsg: (e as Error).message }
  }
}

// ============ 类型映射：内部 type → 微信 data 字段 ============
// 每个模板对应微信后台申请的字段名，调用方在 payload 里给完整值
function buildWxData(type: string, body: string, payload: Record<string, unknown>): Record<string, { value: string }> {
  const safe = (v: unknown, fallback = '') => (v == null ? fallback : String(v))
  switch (type) {
    case 'order_paid':
      return {
        thing1:           { value: safe(payload.order_no).slice(0, 20) },
        amount2:          { value: safe(payload.amount, '0.00') },
        time3:            { value: safe(payload.paid_at, new Date().toLocaleString('zh-CN')) },
        phrase4:          { value: '支付成功' },
        thing5:           { value: safe(payload.product_name, '商品').slice(0, 20) },
      }
    case 'commission_arrived':
      return {
        amount1:          { value: safe(payload.net_amount, '0.00') },
        thing2:           { value: safe(payload.remark, '佣金到账').slice(0, 20) },
        time3:            { value: safe(payload.arrived_at, new Date().toLocaleString('zh-CN')) },
        phrase4:          { value: '已到账' },
        thing5:           { value: safe(payload.order_no, '').slice(0, 20) },
      }
    case 'withdraw_progress':
      return {
        amount1:          { value: safe(payload.amount, '0.00') },
        phrase2:          { value: safe(payload.status_label, '处理中') },
        time3:            { value: safe(payload.updated_at, new Date().toLocaleString('zh-CN')) },
        thing4:           { value: safe(payload.remark, '').slice(0, 20) },
      }
    case 'refund_result':
      return {
        thing1:           { value: safe(payload.order_no, '').slice(0, 20) },
        amount2:          { value: safe(payload.refund_amount, '0.00') },
        phrase3:          { value: safe(payload.status_label, '退款成功') },
        time4:            { value: safe(payload.refunded_at, new Date().toLocaleString('zh-CN')) },
      }
    case 'announcement':
      return {
        thing1:           { value: body.slice(0, 20) },
        time2:            { value: safe(payload.published_at, new Date().toLocaleString('zh-CN')) },
        thing3:           { value: safe(payload.summary, '').slice(0, 20) },
      }
    default:
      return { thing1: { value: body.slice(0, 20) }, time2: { value: new Date().toLocaleString('zh-CN') } }
  }
}

// ============ 主流程 ============

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json() as {
      user_id?: string
      type: string
      title: string
      body: string
      order_id?: string
      payload?: Record<string, unknown>
      broadcast?: boolean
    }

    // ---------- 广播模式（公告） ----------
    if (body.broadcast) {
      // 查所有有 openid 的用户
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, openid')
        .not('openid', 'is', null)
        .limit(10000)
      if (error) throw new Error(`查用户失败: ${error.message}`)

      const tmplId = TMPL_IDS[body.type] ?? ''
      const wxData = buildWxData(body.type, body.body, body.payload ?? {})
      const page = (body.payload?.page as string | undefined) ?? 'pages/messages/index'

      const results = { total: users?.length ?? 0, sent: 0, failed: 0, skipped: 0 }

      for (const u of users ?? []) {
        // 1) 写库
        const { data: notif } = await supabase.from('notifications').insert({
          user_id: u.id, type: body.type, title: body.title, body: body.body,
          payload: body.payload ?? {}, order_id: body.order_id ?? null,
        }).select('id').maybeSingle()

        if (!u.openid) {
          results.skipped++
          continue
        }

        // 2) 推微信
        const r = await sendWxMessage(u.openid, tmplId, wxData, page)
        if (r.ok) {
          results.sent++
          if (notif?.id) await supabase.from('notifications').update({ sent_at: new Date().toISOString() }).eq('id', notif.id)
        } else {
          results.failed++
          console.warn('[send-notification] 广播失败', { openid: u.openid, errcode: r.errcode, errmsg: r.errmsg })
        }
      }

      return Response.json({ success: true, mode: 'broadcast', results }, { headers: corsHeaders })
    }

    // ---------- 单发模式 ----------
    if (!body.user_id) return Response.json({ success: false, error: 'user_id 必填' }, { status: 400, headers: corsHeaders })
    if (!body.type || !body.title || !body.body) {
      return Response.json({ success: false, error: 'type/title/body 必填' }, { status: 400, headers: corsHeaders })
    }

    // 1) 写 notifications 表
    const { data: notif, error: insertErr } = await supabase.from('notifications').insert({
      user_id: body.user_id, type: body.type, title: body.title, body: body.body,
      payload: body.payload ?? {}, order_id: body.order_id ?? null,
    }).select('id').maybeSingle()
    if (insertErr) throw new Error(`写 notifications 失败: ${insertErr.message}`)

    // 2) 取 openid
    const { data: profile } = await supabase.from('profiles').select('openid').eq('id', body.user_id).maybeSingle()
    const openid = profile?.openid ?? null
    if (!openid) {
      return Response.json({ success: true, notification_id: notif?.id, sent: false, reason: 'no_openid' }, { headers: corsHeaders })
    }

    // 3) 推微信
    const tmplId = TMPL_IDS[body.type] ?? ''
    const wxData = buildWxData(body.type, body.body, body.payload ?? {})
    const page = (body.payload?.page as string | undefined) ?? 'pages/messages/index'
    const r = await sendWxMessage(openid, tmplId, wxData, page)

    if (r.ok && notif?.id) {
      await supabase.from('notifications').update({ sent_at: new Date().toISOString() }).eq('id', notif.id)
    }

    return Response.json({
      success: true, notification_id: notif?.id, sent: r.ok,
      wx: { errcode: r.errcode, errmsg: r.errmsg, msgid: r.msgid },
    }, { headers: corsHeaders })

  } catch (err) {
    const msg = (err as Error).message
    console.error('[send-notification] error:', msg)
    return Response.json({ success: false, error: msg }, { status: 500, headers: corsHeaders })
  }
})
