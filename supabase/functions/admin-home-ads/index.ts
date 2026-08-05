/**
 * admin-home-ads Edge Function
 * 后台「首页广告」的写操作（新增 / 启停 / 排序 / 删除）统一走本函数，
 * 以 service_role 身份写库，规避 admin-web 前端 anon 客户端直接 insert/update/delete
 * 被 home_ads 的 RLS 策略拦截（曾导致视频上传成功却落库失败、小程序看不到）。
 *
 * 安全要点（与 admin-create-user 一致）：
 *   - service_role 仅在服务端使用，绝不进浏览器前端；
 *   - 必须校验调用者是已登录且 role='admin' 的用户，否则任意登录用户都能改广告；
 *   - 调用方（admin-web）用普通 anon 客户端发起，自动携带当前登录 admin 的 JWT。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const serviceSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // ---- 1. 鉴权：解析调用者 JWT，确认是已登录的 admin ----
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: '未授权：缺少令牌' }, 401)
  const userClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: '未授权：令牌无效' }, 401)

  const { data: caller, error: callerErr } = await serviceSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (callerErr || !caller || caller.role !== 'admin') {
    return json({ error: '权限不足：仅管理员可管理首页广告' }, 403)
  }

  // ---- 2. 解析入参 ----
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const action = body?.action
  const id = body?.id

  try {
    if (action === 'create') {
      const { media_type, media_url, poster_url, link_url, title, sort_order, is_active } = body
      if (!['image', 'video'].includes(media_type)) return json({ error: 'media_type 非法' }, 400)
      if (!media_url) return json({ error: 'media_url 必填' }, 400)

      const insertRow: any = {
        media_type,
        media_url,
        poster_url: poster_url ?? null,
        link_url: link_url ?? null,
        title: title ?? null,
        sort_order: typeof sort_order === 'number' ? sort_order : 0,
        is_active: is_active !== false,
      }
      const { data, error } = await serviceSupabase.from('home_ads').insert(insertRow).select().single()
      if (error) return json({ error: '新增失败：' + error.message }, 500)
      console.log(`[admin-home-ads] admin ${user.id} 新增广告 ${data.id} (${media_type})`)
      return json({ ok: true, data })

    } else if (action === 'update') {
      if (!id) return json({ error: 'id 必填' }, 400)
      const patch = body?.patch
      if (!patch || typeof patch !== 'object') return json({ error: 'patch 必填' }, 400)
      // 仅允许更新白名单字段
      const allowed: Record<string, unknown> = {}
      if ('is_active' in patch) allowed.is_active = !!patch.is_active
      if ('sort_order' in patch) allowed.sort_order = Number(patch.sort_order)
      if ('title' in patch) allowed.title = patch.title ?? null
      if ('link_url' in patch) allowed.link_url = patch.link_url ?? null
      if ('media_url' in patch) allowed.media_url = patch.media_url
      if ('poster_url' in patch) allowed.poster_url = patch.poster_url ?? null
      if (Object.keys(allowed).length === 0) return json({ error: '无可更新字段' }, 400)

      const { error } = await serviceSupabase.from('home_ads').update(allowed).eq('id', id)
      if (error) return json({ error: '更新失败：' + error.message }, 500)
      console.log(`[admin-home-ads] admin ${user.id} 更新广告 ${id}`, allowed)
      return json({ ok: true })

    } else if (action === 'delete') {
      if (!id) return json({ error: 'id 必填' }, 400)
      const { error } = await serviceSupabase.from('home_ads').delete().eq('id', id)
      if (error) return json({ error: '删除失败：' + error.message }, 500)
      console.log(`[admin-home-ads] admin ${user.id} 删除广告 ${id}`)
      return json({ ok: true })

    } else {
      return json({ error: '未知 action：' + String(action) }, 400)
    }
  } catch (err: any) {
    console.error('[admin-home-ads] error:', err)
    return json({ error: err?.message ?? '内部错误' }, 500)
  }
})
