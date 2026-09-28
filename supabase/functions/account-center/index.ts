// account-center Edge Function
// ------------------------------------------------------------
// 账号中心：注册 / 开通密码登录 / 重置密码 / 管理端代改密
//
// 为什么需要它：
//   密码类写操作必须持有 service_role（admin.updateUserById 才能改 auth.users），
//   客户端绝不能持有该 key，故统一收口到本 EF。
//
// 动作（body.action）：
//   register             { phone, code, password, nickname?, ref? }
//   enable_password      { phone, code, password }      申请开通密码登录
//   reset_password       { phone, code, password }      忘记密码后重置
//   admin_reset_password { user_id, password }          管理端代改密（免验证码，需 is_admin）
//
// 验证码通道：项目使用 Supabase 原生 SMS OTP（signInWithOtp / verifyOtp），
//   因此本 EF 用 anon client 调 verifyOtp 校验，不依赖任何第三方短信服务。
//
// 手机号：前端可能传裸号或 +86 前缀，本函数统一规范化为 E.164 后再交给 GoTrue。
//
// 风格对齐本仓库：jsr import、Deno.serve、corsHeaders(含 x-ef-version)、try/catch 兜底。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const EF_VERSION = '2026-09-28a'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // 版本 beacon：线上到底跑哪一版，curl -i 看响应头即可判定，无需真实业务数据
  'x-ef-version': EF_VERSION,
}

const MIN_PASSWORD_LEN = 8

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(code: string, message: string, status = 400) {
  return json({ ok: false, error: code, message }, status)
}

/** 手机号 → E.164（+8613800138000）。已带 + 的原样返回。 */
function toE164(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  if (String(raw).trim().startsWith('+')) return `+${digits}`
  if (digits.length === 11) return `+86${digits}`
  if (digits.length === 13 && digits.startsWith('86')) return `+${digits}`
  return null
}

/** 手机号 → 派生登录邮箱（与登录页/映射表口径一致） */
function deriveEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '')
  const bare = digits.length >= 11 ? digits.slice(-11) : digits
  return `${bare}@ldyx.local`
}

/** 手机号裸号后 11 位，用于映射表比对 */
function barePhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '')
  return digits.length >= 11 ? digits.slice(-11) : digits
}

type Ctx = {
  admin: ReturnType<typeof createClient> // service_role
  anon: ReturnType<typeof createClient>  // 验码、RLS 上下文
}

/** 校验短信验证码：通过返回 user_id，失败返回错误码 */
async function verifySmsCode(
  ctx: Ctx,
  phoneE164: string,
  code: string,
): Promise<{ userId: string | null; error?: string }> {
  const { data, error } = await ctx.anon.auth.verifyOtp({
    phone: phoneE164,
    token: String(code || '').trim(),
    type: 'sms',
  })
  if (error || !data?.user) {
    const msg = String(error?.message || '')
    // GoTrue 对过期/错误码统一报 "Token has expired or is invalid"
    return { userId: null, error: msg.includes('expired') || msg.includes('invalid')
      ? 'code_invalid_or_expired' : 'code_invalid_or_expired' }
  }
  return { userId: data.user.id }
}

/** 写映射表：开通/重置密码后统一置 password_enabled = true */
async function upsertIdentity(
  ctx: Ctx,
  userId: string,
  phoneE164: string,
  loginEmail: string,
) {
  const { error } = await ctx.admin
    .from('user_login_identities')
    .upsert(
      {
        user_id: userId,
        phone: barePhone(phoneE164),
        login_email: loginEmail,
        password_enabled: true,
        password_set_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) throw new Error(`identity upsert failed: ${error.message}`)
}

async function audit(ctx: Ctx, row: Record<string, unknown>) {
  await ctx.admin.from('account_audit_logs').insert(row)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    })
    const ctx: Ctx = { admin, anon }

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')
    const channel = body?.channel === 'admin-web' ? 'admin-web' : 'miniprogram'

    // ---------------- admin_reset_password：免验证码，但必须是管理员 ----------------
    if (action === 'admin_reset_password') {
      const targetId = String(body?.user_id || '')
      const password = String(body?.password || '')
      if (!targetId) return fail('missing_user_id', '缺少 user_id')
      if (password.length < MIN_PASSWORD_LEN)
        return fail('weak_password', `密码至少 ${MIN_PASSWORD_LEN} 位`)

      // 用带调用者 JWT 的 client 判定 is_admin()，RLS 上下文真实生效
      const { data: isAdmin } = await ctx.anon.rpc('is_admin')
      if (!isAdmin) return fail('not_admin', '仅管理员可代改密码', 403)

      const { error } = await ctx.admin.auth.admin.updateUserById(targetId, { password })
      if (error) return fail('update_failed', error.message, 500)

      // 代改密后同样视为已开通密码登录
      const { data: ident } = await ctx.admin
        .from('user_login_identities')
        .select('phone, login_email')
        .eq('user_id', targetId)
        .maybeSingle()
      if (ident?.login_email) {
        await ctx.admin
          .from('user_login_identities')
          .update({ password_enabled: true, password_set_at: new Date().toISOString() })
          .eq('user_id', targetId)
      }

      await audit(ctx, {
        actor_id: (await ctx.anon.auth.getUser()).data.user?.id ?? null,
        target_id: targetId,
        action: 'admin_reset_password',
        channel,
        detail: { forced: true },
      })
      return json({ ok: true })
    }

    // ---------------- 以下动作都需要 手机号 + 验证码 + 新密码 ----------------
    const phoneE164 = toE164(String(body?.phone || ''))
    const code = String(body?.code || '').trim()
    const password = String(body?.password || '')

    if (!phoneE164) return fail('invalid_phone', '手机号格式不正确')
    if (!code) return fail('missing_code', '请填写验证码')
    if (password.length < MIN_PASSWORD_LEN)
      return fail('weak_password', `密码至少 ${MIN_PASSWORD_LEN} 位`)

    if (!['register', 'enable_password', 'reset_password'].includes(action))
      return fail('unknown_action', `未知 action: ${action}`)

    // 1) 验码（Supabase 原生 SMS OTP）
    const { userId, error: codeErr } = await verifySmsCode(ctx, phoneE164, code)
    if (!userId) return fail(codeErr || 'code_invalid_or_expired', '验证码错误或已过期')

    // 2) 写密码 + 派生邮箱（email_confirm 必须为 true，否则无法 signInWithPassword）
    const loginEmail = deriveEmail(phoneE164)
    const { error: updErr } = await ctx.admin.auth.admin.updateUserById(userId, {
      email: loginEmail,
      password,
      email_confirm: true,
      phone_confirm: true,
    })
    if (updErr) {
      // 邮箱已被占用（极端情况：同一手机号重复派生）→ 只改密码
      if (/already|registered|exists/i.test(updErr.message || '')) {
        const { error: pwErr } = await ctx.admin.auth.admin.updateUserById(userId, { password })
        if (pwErr) return fail('update_failed', pwErr.message, 500)
      } else {
        return fail('update_failed', updErr.message, 500)
      }
    }

    // 3) 写映射表
    await upsertIdentity(ctx, userId, phoneE164, loginEmail)

    // 4) 注册场景补昵称
    if (action === 'register' && body?.nickname) {
      await ctx.admin
        .from('profiles')
        .update({ nickname: String(body.nickname) })
        .eq('id', userId)
    }

    // 5) 审计
    await audit(ctx, {
      actor_id: userId,
      target_id: userId,
      action,
      channel,
      detail: { phone: barePhone(phoneE164), login_email: loginEmail },
    })

    return json({ ok: true, user_id: userId, login_email: loginEmail })
  } catch (e: any) {
    console.error('[account-center] unhandled:', e)
    return fail('internal_error', e?.message || '服务异常', 500)
  }
})
