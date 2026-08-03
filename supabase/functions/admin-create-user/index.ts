/**
 * admin-create-user Edge Function
 * 后台「新建登录账号」：以 service_role 身份调用 auth.admin.createUser 创建认证账号，
 * 并补写 profiles 行（含目标角色）。
 *
 * 安全要点（与 admin-web/src/lib/supabase.ts 的强制约束一致）：
 *   - service_role 仅在服务端（本函数）使用，绝不进浏览器前端；
 *   - 必须校验调用者确为 role='admin' 的已登录用户，否则任何登录用户都能建账号；
 *   - 调用方（admin-web）用普通 anon 客户端发起，自动携带当前登录 admin 的 JWT。
 *
 * 角色说明：user_role 枚举仅含 ('user','admin')，merchant 权限由 merchant_status 控制，
 *   故本函数只创建 admin / user 两类登录账号。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 允许创建的角色（必须与 public.user_role 枚举一致）
const ALLOWED_ROLES = ['admin', 'user'] as const
type Role = (typeof ALLOWED_ROLES)[number]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
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
    return json({ error: '权限不足：仅超级管理员可创建账号' }, 403)
  }

  // ---- 2. 解析并校验入参 ----
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const email: string = (body?.email ?? '').trim()
  const password: string = (body?.password ?? '').toString()
  const nickname: string = (body?.nickname ?? '').trim()
  const phone: string = (body?.phone ?? '').trim()
  const role: string = (body?.role ?? 'user')

  // 邮箱与手机号「二选一必填」：至少提供一种登录标识
  if (!email && !phone) return json({ error: '请填写邮箱或手机号（至少其一）' }, 400)
  if (email && !isValidEmail(email)) return json({ error: '请输入合法的邮箱地址' }, 400)
  if (password.length < 6) return json({ error: '密码至少 6 位' }, 400)
  if (!ALLOWED_ROLES.includes(role as Role)) return json({ error: '非法角色' }, 400)
  if (phone && !/^\d{6,20}$/.test(phone)) return json({ error: '手机号格式不正确' }, 400)

  // 展示用标识（优先手机号，便于仅手机号账号回显）
  const label = phone || email

  try {
    // ---- 3. 创建认证账号（email / phone 二选一均可，均自动确认可立即登录）----
    const { data: newUser, error: createErr } = await serviceSupabase.auth.admin.createUser({
      email: email || undefined,
      password,
      phone: phone || undefined,
      email_confirm: email ? true : undefined,
      phone_confirm: phone ? true : undefined,
      user_metadata: { nickname: nickname || label },
    })
    if (createErr || !newUser?.user) {
      // 常见：邮箱/手机号已存在(duplicate) / 密码策略
      return json({ error: createErr?.message || '创建账号失败' }, 400)
    }

    // ---- 4. 补写 profiles（触发器默认 role='user'，这里显式落地目标角色与昵称）----
    const { error: profErr } = await serviceSupabase.from('profiles').upsert({
      id: newUser.user.id,
      username: email ? email.split('@')[0] : phone,
      phone: phone || null,
      nickname: nickname || label,
      role: role as Role,
    })
    if (profErr) {
      // 账号已建但 profile 写入失败：保留 auth 账号并提示，避免半截状态
      return json({ error: '账号已创建，但用户资料写入失败：' + profErr.message, ok: false }, 500)
    }

    console.log(`[admin-create-user] admin ${user.id} 创建账号 ${label} 角色=${role}`)
    return json({ ok: true, user: { id: newUser.user.id, email: email || null, phone: phone || null, role } })
  } catch (err: any) {
    console.error('[admin-create-user] error:', err)
    return json({ error: err?.message ?? '内部错误' }, 500)
  }
})
