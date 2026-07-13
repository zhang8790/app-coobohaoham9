/**
 * delete-account Edge Function
 * PIPL 账号注销：以 service_role 身份彻底删除用户账号及其关联数据。
 * 关键：必须删除 auth.users 中的认证记录，否则用户仍可凭原凭证重新登录，
 *       profile 虽被删但 auth 账号残留 = 注销不彻底（隐私合规硬伤）。
 *
 * 仅允许本人调用（Authorization 头携带自己的 JWT）。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 按 user_id 直接关联、可安全整行删除的表
const USER_SCOPED_TABLES = [
  'cart_items',
  'user_addresses',
  'favorites',
  'footprints',
  'coupons',
  'points_logs',
  'emotion_claims',
  'emotion_assets',
  'emotion_badge_grants',
  'emotion_tongbao_logs',
  'product_reviews',
  'pending_referrals',
  'user_campaign_claims',
  'redpacket_payouts',
  'orders',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const serviceSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // 鉴权：必须用调用者自己的 JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })
  const userClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })

  const uid = user.id

  try {
    // 1. 删除各业务表的用户数据（逐表 try/catch，避免某表结构变动中断整体删除）
    for (const table of USER_SCOPED_TABLES) {
      try {
        await serviceSupabase.from(table).delete().eq('user_id', uid)
      } catch (e) {
        console.warn(`[delete-account] 删除 ${table} 失败（已跳过）:`, (e as any)?.message)
      }
    }

    // 2. 佣金表：受益人或被推广人任一侧涉及本用户都清理
    try {
      await serviceSupabase.from('commissions').delete().eq('beneficiary_id', uid)
      await serviceSupabase.from('commissions').delete().eq('payer_id', uid)
    } catch (e) {
      console.warn('[delete-account] 删除 commissions 失败（已跳过）:', (e as any)?.message)
    }

    // 3. 删除 profile（最后删，因其它表可能引用）
    try {
      await serviceSupabase.from('profiles').delete().eq('id', uid)
    } catch (e) {
      console.warn('[delete-account] 删除 profiles 失败（已跳过）:', (e as any)?.message)
    }

    // 4. 彻底删除认证账号（PIPL 注销核心：清掉 auth.users，使原凭证失效）
    const { error: adminErr } = await serviceSupabase.auth.admin.deleteUser(uid)
    if (adminErr) {
      console.error('[delete-account] 删除 auth 用户失败:', adminErr.message)
      return Response.json({ success: false, error: '账号注销失败：' + adminErr.message }, { status: 500, headers: corsHeaders })
    }

    console.log(`[delete-account] 用户 ${uid} 已彻底注销`)
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[delete-account] error:', err)
    return Response.json({ success: false, error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
