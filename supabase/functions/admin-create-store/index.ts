/**
 * admin-create-store Edge Function
 * 总后台「建店 + 建登陆」原子操作：以 service_role 身份
 *   1) 校验调用者为 role='admin' 的已登录用户；
 *   2) auth.admin.createUser 创建门店运营登录账号（email + 密码，立即可登）；
 *   3) 插入 stores（owner_id=新账号, is_platform=true, created_by=admin, store_type, short_code）；
 *   4) 插入 store_staff（role='owner', is_active=true）统一运营身份；
 *   5) 置 profiles.role='merchant'，使该账号可登录小程序自营门店中心与后台管理本店。
 *
 * 安全要点（与 admin-create-user 一致）：
 *   - service_role 仅服务端使用，绝不进前端；
 *   - 必须二次校验调用者 role='admin'，否则任何登录用户都能开自营店；
 *   - 调用方（admin-web）用普通 anon 客户端携带当前 admin 的 JWT 发起。
 *
 * 说明：user_role 枚举实际含 'merchant'（生产 DB 已手动扩展，现有 createSelfStore 即用），
 *       此处沿用同一约定，不改动枚举迁移。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

// 生成门店 short_code（LDYX + 4 位随机字母数字），冲突重试
function genShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'LDYX'
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

const STORE_TYPES = ['hub', 'transfer', 'truck', 'branch'] as const

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
    .select('role, id')
    .eq('id', user.id)
    .maybeSingle()
  if (callerErr || !caller || caller.role !== 'admin') {
    return json({ error: '权限不足：仅超级管理员可建自营店' }, 403)
  }

  // ---- 2. 解析并校验入参 ----
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const store_name: string = (body?.store_name ?? '').trim()
  const category: string = (body?.category ?? '').trim()
  const description: string = (body?.description ?? '').trim()
  const referral_rate: number = Number(body?.referral_rate ?? 0)
  const open_time: string = body?.open_time ?? '08:00'
  const close_time: string = body?.close_time ?? '22:00'
  const image_url: string = (body?.image_url ?? '').trim()
  const banner_url: string = (body?.banner_url ?? '').trim()
  const store_type: string = (body?.store_type ?? 'branch')
  const manager_email: string = (body?.manager_email ?? '').trim()
  const manager_password: string = (body?.manager_password ?? '').toString()
  const manager_phone: string = (body?.manager_phone ?? '').trim()
  const manager_nickname: string = (body?.manager_nickname ?? '').trim()

  if (!store_name) return json({ error: '请填写店名' }, 400)
  if (!category) return json({ error: '请选择类目' }, 400)
  if (!isValidEmail(manager_email)) return json({ error: '请输入合法的运营邮箱' }, 400)
  if (manager_password.length < 6) return json({ error: '运营账号密码至少 6 位' }, 400)
  if (manager_phone && !/^\d{6,20}$/.test(manager_phone)) return json({ error: '手机号格式不正确' }, 400)
  if (!STORE_TYPES.includes(store_type as any)) return json({ error: '非法门店类型' }, 400)
  if (referral_rate < 0 || referral_rate > 1) return json({ error: '让利率需为 0~1 的小数' }, 400)

  try {
    // ---- 3. 创建运营登录账号（email 直接确认，可立即登录）----
    const { data: newUser, error: createErr } = await serviceSupabase.auth.admin.createUser({
      email: manager_email,
      password: manager_password,
      phone: manager_phone || undefined,
      email_confirm: true,
      phone_confirm: manager_phone ? true : undefined,
      user_metadata: { nickname: manager_nickname || store_name },
    })
    if (createErr || !newUser?.user) {
      return json({ error: createErr?.message || '创建运营账号失败' }, 400)
    }
    const newUserId = newUser.user.id

    // ---- 4. 建店（owner=运营账号, is_platform=true, created_by=admin）----
    let storeId: string | null = null
    for (let attempt = 0; attempt < 6; attempt++) {
      const shortCode = genShortCode()
      const { data: store, error: storeErr } = await serviceSupabase
        .from('stores')
        .insert({
          owner_id: newUserId,
          created_by: caller.id,
          name: store_name,
          description: description || null,
          category,
          referral_rate: referral_rate || 0.2,
          referral_rate_enabled: true,
          is_platform: true,
          is_active: true,
          is_open: true,
          open_time,
          close_time,
          image_url: image_url || null,
          banner_url: banner_url || null,
          store_type,
          short_code: shortCode,
          rating: 5.0,
        })
        .select('id')
        .maybeSingle()
      if (store && !storeErr) {
        storeId = store.id
        break
      }
      // 唯一约束冲突则重试；其它错误直接抛出
      if (storeErr && !String(storeErr.message).includes('short_code')) {
        throw new Error('建店失败：' + storeErr.message)
      }
    }
    if (!storeId) return json({ error: '建店失败：short_code 生成冲突，请重试' }, 500)

    // ---- 5. 绑定运营身份（store_staff，统一身份来源）----
    const { error: staffErr } = await serviceSupabase
      .from('store_staff')
      .upsert({
        store_id: storeId,
        user_id: newUserId,
        role: 'owner',
        is_active: true,
      }, { onConflict: 'store_id,user_id' })
    if (staffErr) {
      // 账号与店已建，仅绑定失败：返回部分成功，提示手动补绑
      return json({ ok: false, partial: true, store_id: storeId, user_id: newUserId, error: '门店已建，但运营身份绑定失败：' + staffErr.message }, 500)
    }

    // ---- 6. 置运营角色（与现有 createSelfStore 行为一致）----
    await serviceSupabase.from('profiles').update({
      role: 'merchant',
      nickname: manager_nickname || store_name,
      phone: manager_phone || null,
    }).eq('id', newUserId)

    console.log(`[admin-create-store] admin ${caller.id} 建自营店 ${store_name}(${storeId}) 运营=${manager_email}`)
    return json({ ok: true, store_id: storeId, user_id: newUserId, email: manager_email })
  } catch (err: any) {
    console.error('[admin-create-store] error:', err)
    return json({ error: err?.message ?? '内部错误' }, 500)
  }
})
