/**
 * admin-update-user-identity Edge Function
 * 后台「补 / 改已有账号的网页版登录身份」：以 service_role 身份调用
 *   auth.admin.updateUserById，把手机号写入 auth.users.phone（身份列，确认态），
 *   并可选重置密码；同时同步 public.profiles.phone，保证小程序与网页版身份一致。
 *
 * 存在意义：平台全仓不采集手机号，历史账号（尤其微信注册）常缺 phone 身份，
 *   导致「手机号+密码」网页版登录不可用；本函数让管理员能直接把身份补齐。
 *
 * 安全要点（与 admin-create-user / admin-create-store 一致）：
 *   - service_role 仅在服务端使用，绝不进前端；
 *   - 必须校验调用者为 role='admin'，否则任何登录用户都能改他人账号身份；
 *   - 调用方（admin-web）用普通 anon 客户端携带当前 admin 的 JWT 发起。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// 归一化为 E.164（+86 前缀），与网页版 signInWithPhonePassword 的入参规则保持一致
function normalizeCnPhone(v: string): string {
  const digits = (v || '').replace(/\D/g, '').replace(/^86/, '')
  return '+86' + digits
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const serviceSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // ---- 1. 鉴权：确认调用者为已登录 admin ----
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: '未授权：缺少令牌' }, 401)
  const userClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: '未授权：令牌无效' }, 401)

  const { data: caller } = await serviceSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!caller || caller.role !== 'admin') {
    return json({ error: '权限不足：仅超级管理员可修改账号身份' }, 403)
  }

  // ---- 2. 解析并校验入参 ----
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const userId: string = (body?.user_id ?? '').trim()
  const rawPhone: string = (body?.phone ?? '').trim()
  const password: string = (body?.password ?? '').toString()
  const nickname: string = (body?.nickname ?? '').trim()

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: '缺少或非法的 user_id' }, 400)
  }
  if (!rawPhone && !password && !nickname) {
    return json({ error: '请至少提供 手机号 / 密码 / 昵称 之一' }, 400)
  }
  if (rawPhone && !/^\d{6,20}$/.test(rawPhone.replace(/\D/g, ''))) {
    return json({ error: '手机号格式不正确' }, 400)
  }
  if (password && password.length < 6) {
    return json({ error: '密码至少 6 位' }, 400)
  }

  const e164 = rawPhone ? normalizeCnPhone(rawPhone) : ''

  try {
    // ---- 3. 更新认证账号身份（phone 写入身份列并置确认态；password 可选重置）----
    const { data: updated, error: updErr } = await serviceSupabase.auth.admin.updateUserById(userId, {
      ...(e164 ? { phone: e164, phone_confirm: true } : {}),
      ...(password ? { password } : {}),
      ...(nickname ? { user_metadata: { nickname } } : {}),
    })
    if (updErr || !updated?.user) {
      // 常见：phone 已被其他账号占用(duplicate) / 密码策略
      return json({ error: updErr?.message || '更新账号身份失败' }, 400)
    }

    // ---- 4. 同步业务表（profiles）：手机号 / 昵称 ----
    const patch: Record<string, unknown> = {}
    if (rawPhone) patch.phone = rawPhone.replace(/\D/g, '')
    if (nickname) patch.nickname = nickname
    if (Object.keys(patch).length > 0) {
      const { error: profErr } = await serviceSupabase.from('profiles').update(patch).eq('id', userId)
      if (profErr) {
        // 身份已更新，仅业务表同步失败：返回部分成功，提示手动核对
        return json({ ok: false, partial: true, error: '身份已更新，但 profiles 同步失败：' + profErr.message }, 500)
      }
    }

    console.log(`[admin-update-user-identity] admin ${user.id} 更新账号 ${userId} phone=${e164 || '-'} pwd=${password ? 'yes' : 'no'}`)
    return json({
      ok: true,
      user: { id: userId, phone: e164 || null, password_reset: !!password },
    })
  } catch (err: any) {
    console.error('[admin-update-user-identity] error:', err)
    return json({ error: err?.message ?? '内部错误' }, 500)
  }
})
