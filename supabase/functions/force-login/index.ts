// force-login Edge Function
// ------------------------------------------------------------
// 硬登陆：绕过 GoTrue 的损坏密码登录路径，为测试账号/损坏账号重建可用认证。
//
// v2 流程：
// 1. 优先尝试 admin.updateUserById：给已存在的用户直接补 email + password + 确认态，
//    不删 auth 行，保留 profiles 行及其外键（1870 等真实账号需保持 referrer_id）。
// 2. 若 updateUserById 失败（通常是 auth 行损坏），再回退到 deleteUser + createUser。
// 3. 用 signInWithPassword 或 generateLink 签发 session token 返回前端。
//
// 如果 deleteUser 仍报错（GoTrue 连删除都做不到），返回提示让用户先跑 SQL 脚本。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const userId   = body.user_id   || '03165ead-8fef-46c4-8f57-bc5a905ac716'
    const email    = body.email    || 'test18565613635@test.com'
    const password = body.password || '12345678'
    const phone    = body.phone    || '+8618565613635'
    const nickname = body.nickname || '18565613635'
    const usernameParam = body.username || '18565613635'

    const supabaseUrl       = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey           = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseAdmin     = createClient(supabaseUrl, serviceRoleKey)
    const freshClient       = createClient(supabaseUrl, anonKey)

    const userMeta = {
      phone: phone.replace('+86', ''),
      nickname: nickname,
      username: usernameParam,
    }

    // ── Step 0：备份需要恢复 referrer_id 的下级 profiles ──
    // 情况 A：prep SQL 之前调用（profiles 还在）→ 实时查 live
    // 情况 B：prep SQL 之后调用（profiles 已删 / referrer 已清空）→ 查 _tmp_referrer_backup 备份表
    let referrerBackups: { id: string; referrer_id: string | null }[] = []

    const { data: liveRows } = await supabaseAdmin
      .from('profiles')
      .select('id, referrer_id')
      .eq('referrer_id', userId)
    if (liveRows) referrerBackups.push(...(liveRows as any[]))

    try {
      const { data: bakRows } = await supabaseAdmin
        .from('_tmp_referrer_backup')
        .select('id, referrer_id')
        .neq('id', userId)
      if (bakRows) referrerBackups.push(...(bakRows as any[]))
    } catch {
      // 备份表不存在（未跑 prep SQL）则忽略
    }

    let userObj: any

    // ── Step 1（优先）：尝试不删除账号，直接补 email/password ──
    // 适用于 1870 等真实账号：auth 行正常，但缺 email/password，profiles 行必须保留。
    console.log('[force-login] Step 1: Try updateUserById for', userId)
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      password,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: userMeta,
    })

    if (!updateError && updateData?.user) {
      console.log('[force-login] updateUserById success, user preserved:', updateData.user.id)
      userObj = updateData.user
    } else {
      // ── Step 1b（回退）：auth 行损坏，走 delete + create ──
      // 注意：此路径要求 profiles 行已被删除或不存在，否则 deleteUser 会被 FK 挡住。
      // 1856 需先跑 force-login-prep-v2.sql 删掉 profiles 行；1870 不建议走此路径。
      console.log('[force-login] updateUserById failed:', updateError?.message, '→ fallback delete+create')

      console.log('[force-login] Step 1b: Deleting old user', userId)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

      if (deleteError) {
        const delMsg = deleteError.message || ''
        const alreadyGone = /not found|does not exist|no rows|不存在/i.test(delMsg)
        if (!alreadyGone) {
          console.error('[force-login] admin.deleteUser failed:', delMsg)
          return new Response(JSON.stringify({
            error: `deleteUser failed: ${delMsg}`,
            hint: '可能是 profiles 行仍指向该 user，导致外键阻挡。请先在 Supabase SQL Editor 跑 scripts/force-login-prep-v2.sql 删除旧行后，再调用本函数。',
            sql_cleanup_needed: true,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        console.log('[force-login] 旧用户已不存在（可能已用 prep SQL 删除），跳过删除直接创建')
      }

      console.log('[force-login] Step 2: Creating new user with same id')
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        id: userId,
        email,
        password,
        phone,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: userMeta,
      })

      if (createError) {
        console.error('[force-login] admin.createUser failed:', createError.message)
        return new Response(JSON.stringify({ error: `createUser failed: ${createError.message}` }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      console.log('[force-login] New user created:', createData.user?.id)
      userObj = createData.user

      // 恢复下级 profiles.referrer_id
      if (referrerBackups.length > 0) {
        const ids = [...new Set(referrerBackups.map((r) => r.id))]
        console.log('[force-login] Restoring referrer_id for', ids.length, 'profiles:', ids)
        await supabaseAdmin
          .from('profiles')
          .update({ referrer_id: userId })
          .in('id', ids)
      }

      // 从备份恢复 profiles 重要字段（balance/referral_code/nickname 等）
      try {
        const { data: bak } = await supabaseAdmin
          .from('_tmp_profile_backup')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
        if (bak) {
          console.log('[force-login] Restoring profile fields from backup')
          await supabaseAdmin
            .from('profiles')
            .update({
              nickname: (bak as any).nickname,
              username: (bak as any).username,
              referral_code: (bak as any).referral_code,
              avatar_url: (bak as any).avatar_url,
            })
            .eq('id', userId)
        }
      } catch {
        // 备份表不存在则忽略
      }
    }

    // ── Step 3：签发 session token ──
    console.log('[force-login] Step 3: Generating session token')

    let accessToken: string
    let refreshToken: string

    // 优先用密码登录拿 token（用户已肯定有 email + password）
    const { data: signInData, error: signInError } = await freshClient.auth.signInWithPassword({
      email,
      password,
    })

    if (!signInError && signInData?.session) {
      accessToken  = signInData.session.access_token
      refreshToken = signInData.session.refresh_token
      userObj      = signInData.user || userObj
      console.log('[force-login] Session token obtained via signInWithPassword')
    } else {
      // 兜底：magiclink
      console.log('[force-login] signInWithPassword failed, trying generateLink:', signInError?.message)
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })

      if (!linkError && linkData?.properties?.access_token) {
        accessToken  = linkData.properties.access_token
        refreshToken = linkData.properties.refresh_token
        userObj      = linkData.user || userObj
        console.log('[force-login] Session token obtained via generateLink')
      } else {
        console.error('[force-login] All session generation methods failed:', signInError?.message || linkError?.message)
        return new Response(JSON.stringify({
          error: `All session generation methods failed: ${signInError?.message || linkError?.message || 'unknown'}`,
          user_created: userObj?.id ? true : false,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // 兜底：若 referral_code 仍为空，补一个默认（仅 delete+create 场景需要）
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('id, referral_code')
      .eq('id', userId)
      .single()

    if (profileData && !profileData.referral_code) {
      await supabaseAdmin
        .from('profiles')
        .update({ referral_code: '44B923' })
        .eq('id', userId)
    }

    console.log('[force-login] Done! Returning session token')

    return new Response(JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userObj,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[force-login] Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
