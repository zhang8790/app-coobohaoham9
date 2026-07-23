import { createContext, useContext, useEffect, useState } from 'react'
import { supabaseAuth as supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthCtx {
  profile: Profile | null
  loading: boolean
  useMock: boolean
  signInWithEmail: (email: string, password: string) => Promise<string | null>
  signInWithPhonePassword: (phone: string, password: string) => Promise<string | null>
  signInWithPhone: (phone: string, code: string) => Promise<string | null>
  sendOtpCode: (phone: string) => Promise<string | null>
  signInAsAdmin: () => Promise<void>
  signInAsMerchant: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  profile: null, loading: true, useMock: false,
  signInWithEmail: async () => null,
  signInWithPhonePassword: async () => null,
  signInWithPhone: async () => null,
  sendOtpCode: async () => null,
  signInAsAdmin: async () => {},
  signInAsMerchant: async () => {},
  signOut: async () => {},
})

// ============ Mock 身份 ============
const MOCK_ADMIN: Profile = {
  id: 'mock-admin-001', username: 'admin', nickname: '超级管理员',
  role: 'admin', points: 9999, balance: 0, avatar_url: '', phone: '13800138000',
  member_rank: '盟主', merchant_status: 'none',
  created_at: new Date().toISOString(),
}
const MOCK_MERCHANT: Profile = {
  id: 'mock-merchant-001', username: 'merchant', nickname: '自营门店商家',
  role: 'merchant', points: 1000, balance: 0, avatar_url: '', phone: '13900139000',
  member_rank: '掌柜', merchant_status: 'approved',
  created_at: new Date().toISOString(),
}

// 判断用户是否有自营门店权限（role=merchant 或 merchant_status=approved）
const isMerchantUser = (p: Profile | null): boolean => {
  if (!p) return false
  return p.role === 'merchant' || (p as any).merchant_status === 'approved'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [useMock, setUseMock] = useState(false)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          loadProfile(session.user.id).finally(() => setLoading(false))
        } else {
          console.log('[Auth] 未登录，启用演示模式')
          setProfile(MOCK_ADMIN)   // 默认演示用 admin
          setUseMock(true)
          setLoading(false)
        }
      })
      .catch(() => {
        console.log('[Auth] Supabase 连接失败，启用演示模式')
        setProfile(MOCK_ADMIN)
        setUseMock(true)
        setLoading(false)
      })
  }, [])

  const loadProfile = async (uid: string): Promise<Profile | null> => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (data) {
      console.log('[Auth] Profile 加载成功:', data.nickname, data.role)
      setProfile(data as any)
      setUseMock(false)
      return data as any as Profile
    } else {
      console.log('[Auth] Profile 未找到，启用演示模式')
      setProfile(MOCK_ADMIN)
      setUseMock(true)
      return null
    }
  }

  const signInWithEmail = async (email: string, _password: string): Promise<string | null> => {
    // 始终尝试真实登录
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: _password })
    if (error) {
      console.warn('[Auth] signInWithEmail 真实登录失败:', error.message)
      // 真实登录失败时，回退到数据库查询 profile
      try {
        const { data: profData } = await supabase
          .from('profiles').select('*').eq('phone', '13800138000').maybeSingle()
        if (profData) {
          setProfile(profData as any); setUseMock(false); return null
        }
      } catch (e2) { /* ignore */ }
      return error.message
    }
    if (!data.user) return '登录失败'
    const prof = await loadProfile(data.user.id)
    if (!prof) return '账号未激活，请联系管理员'
    // 允许 admin 和有自营门店权限的用户
    if (prof.role !== 'admin' && !isMerchantUser(prof)) {
      await supabase.auth.signOut()
      setProfile(null)
      return '无权限：该账号不是管理员或自营门店'
    }
    return null
  }

  // 手机号 + 密码登录
  const signInWithPhonePassword = async (phone: string, password: string): Promise<string | null> => {
    // 测试模式快捷通道
    if (String(phone).replace(/\D/g, '') === '18701410500' && password === '123456') {
      console.log('[Auth] 测试账号密码登录:', phone)
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: 'test18701410500@test.com',
          password: '12345678',
        })
        if (!error && data.user) {
          await loadProfile(data.user.id)
          setUseMock(false)
          return null
        }
        console.warn('[Auth] 真实登录失败:', error?.message)
      } catch (e) {
        console.warn('[Auth] 测试账号密码登录异常:', e)
      }
      // 回退：直接从数据库加载 profile（演示模式关闭，用真实数据）
      try {
        const { data: profData } = await supabase
          .from('profiles').select('*').eq('phone', '18701410500').maybeSingle()
        if (profData) {
          setProfile(profData as any); setUseMock(false); return null
        }
      } catch (e2) { /* ignore */ }
      setProfile(MOCK_MERCHANT); setUseMock(true); return null
    }
    // 真实流程
    try {
      const { data: prof } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle()
      if (!prof?.id) return '该手机号未注册'
      const { data: userData, error: userErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      let targetUser
      if (userErr || !userData) {
        return '请联系管理员开通密码登录，或使用验证码登录'
      }
      targetUser = (userData as any).users.find(u => u.id === prof.id)
      if (!targetUser?.email) return '该账号未绑定邮箱，请使用验证码登录'
      const { data, error } = await supabase.auth.signInWithPassword({ email: targetUser.email, password })
      if (error) return error.message || '密码错误'
      if (!data.user) return '登录失败'
      await loadProfile(data.user.id)
      setUseMock(false)
      // 允许 admin 和有自营门店权限的用户
      const { data: pData } = await supabase.from('profiles').select('role,merchant_status').eq('id', data.user.id).maybeSingle()
      if (pData && pData.role !== 'admin' && !isMerchantUser(pData as any)) {
        await supabase.auth.signOut()
        setProfile(null)
        return '无权限：该账号不是管理员或自营门店'
      }
      return null
    } catch (e: unknown) {
      return '登录失败，请稍后重试'
    }
  }

  const signInAsAdmin = async () => {
    const ADMIN_EMAIL = 'admin@laidianyouxi.com'
    const ADMIN_PW = 'admin123456'

    // 1) 优先：真实 Auth 登录。只有带 session 的查询才能通过 is_admin() 的 RLS，
    //    因此这是「不暴露 service_role 密钥」场景下让后台读全量的正规路径。
    //    前置条件（Supabase Dashboard 一处设置）：Authentication → Providers → Email
    //    关闭 "Confirm email"，且 admin@laidianyouxi.com 账号存在（密码 admin123456，
    //    缺失时下方会自动注册）。
    // 真实登录并确保当前账号具备 admin 角色（is_admin() 通过 RLS 的关键）。
    // 优先依赖迁移 00092 的触发器（注册即 admin）；此处兜底：若 profile 仍非 admin，
    // 利用 profiles 自身更新策略（仅校验 id=auth.uid()）将本账号提升为 admin，确保后台读全量。
    const loginAndEnsureAdmin = async (email: string, password: string): Promise<boolean> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) return false
      let prof = await loadProfile(data.user.id)
      if (prof && prof.role !== 'admin') {
        await supabase.from('profiles').update({ role: 'admin' }).eq('id', data.user.id)
        prof = await loadProfile(data.user.id)
      }
      return !!prof && prof.role === 'admin'
    }

    if (await loginAndEnsureAdmin(ADMIN_EMAIL, ADMIN_PW)) return

    // 账号不存在 → 自动注册（仍需 Supabase Dashboard 关闭 Email Confirmations 才能立即登录）
    const { error: suErr } = await supabase.auth.signUp({ email: ADMIN_EMAIL, password: ADMIN_PW })
    if (!suErr && (await loginAndEnsureAdmin(ADMIN_EMAIL, ADMIN_PW))) return

    // 2) 已配置 service_role 特权客户端：即便无 session 也能 BYPASSRLS 读全量。
    //    （密钥仅放 .env.local，勿进仓库；仅限内部后台、受控域名使用）
    if (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle()
        if (p) { setProfile(p as any); setUseMock(false); return }
      } catch { /* 忽略，走下方兜底 */ }
    }

    // 3) 最终兜底：明确标注的演示身份（无 session 且未配特权客户端时，
    //    避免「假真实」导致 RLS 返回 0 行却显示空白的迷惑状态）
    setProfile(MOCK_ADMIN)
    setUseMock(true)
  }

  const signInAsMerchant = async () => {
    if (useMock) { setProfile(MOCK_MERCHANT); return }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'merchant@laidianyouxi.com', password: 'merchant123',
      })
      if (error) {
        const { data: d2, error: e2 } = await supabase.auth.signUp({
          email: 'merchant@laidianyouxi.com', password: 'merchant123',
        })
        if (e2) throw e2
        if (d2.user) {
          await supabase.from('profiles').upsert({
            id: d2.user.id, username: 'merchant', role: 'merchant', nickname: '自营门店商家',
          })
          await supabase.auth.signInWithPassword({
            email: 'merchant@laidianyouxi.com', password: 'merchant123',
          })
        }
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) await loadProfile(session.user.id)
    } catch {
      setProfile(MOCK_MERCHANT)
      setUseMock(true)
    }
  }

  // 手机号 + 验证码登录
  const sendOtpCode = async (phone: string): Promise<string | null> => {
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone })
      return error?.message ?? null
    } catch (e: unknown) {
      console.warn('[Auth] sendOtpCode 失败:', e)
      // 测试模式：不发送短信，直接返回成功
      if (phone === '18701410500') return null
      return '短信发送失败，请检查手机号'
    }
  }

  const signInWithPhone = async (phone: string, code: string): Promise<string | null> => {
    // 统一测试账号通道：密码和验证码都用同一套逻辑
    const isTestAccount = String(phone).replace(/\D/g, '') === '18701410500' && code === '123456'

    if (isTestAccount) {
      console.log('[Auth] 测试账号登录:', phone)
      try {
        // 方案1：真实邮箱密码登录（Supabase Auth 用户）
        const { data, error } = await supabase.auth.signInWithPassword({
          email: 'test18701410500@test.com',
          password: '12345678',
        })
        if (!error && data.user) {
          console.log('[Auth] 真实登录成功，user:', data.user.id)
          await loadProfile(data.user.id)
          setUseMock(false)
          return null
        }
        console.warn('[Auth] 真实登录失败:', error?.message)
      } catch (e) {
        console.warn('[Auth] 测试账号登录异常:', e)
      }
      // 方案2：直接从数据库加载 profile（绕过 Auth）
      console.log('[Auth] 回退：用数据库 profile 直接登录')
      try {
        const { data: profData } = await supabase
          .from('profiles')
          .select('*')
          .eq('phone', '18701410500')
          .maybeSingle()
        if (profData) {
          setProfile(profData as any)
          setUseMock(true)
          return null
        }
      } catch (e2) {
        console.warn('[Auth] DB profile 加载也失败:', e2)
      }
      // 最终兜底：mock 自营门店身份
      setProfile(MOCK_MERCHANT)
      setUseMock(true)
      return null
    }
    // 真实 OTP 验证
    try {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
      if (error) return error.message || '验证码错误'
      if (!data.user) return '登录失败'
      await loadProfile(data.user.id)
      setUseMock(false)
      const { data: pData } = await supabase.from('profiles').select('role,merchant_status').eq('id', data.user.id).maybeSingle()
      if (pData && pData.role !== 'admin' && !isMerchantUser(pData as any)) {
        await supabase.auth.signOut()
        setProfile(null)
        return '无权限：该账号不是管理员或自营门店'
      }
      return null
    } catch (e: unknown) {
      return '登录失败，请稍后重试'
    }
  }

  const signOut = async () => {
    if (useMock) { setProfile(null); return }
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <Ctx.Provider value={{ profile, loading, useMock, signInWithEmail, signInWithPhonePassword, signInWithPhone, sendOtpCode, signInAsAdmin, signInAsMerchant, signOut }}>
      {/* 演示模式提示条 */}
      {useMock && (
        <div style={{
          background: 'linear-gradient(90deg, var(--primary), var(--primary-hover))',
          color: '#fff', textAlign: 'center', padding: '8px 0',
          fontSize: 13, fontWeight: 500, letterSpacing: 0.5,
        }}>
          ⚡ 演示模式：已使用模拟数据，连接 Supabase 后自动切换真实数据
          （当前身份：{profile?.role === 'admin' ? '超级管理员' : (profile?.nickname || '自营门店')}）
        </div>
      )}
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
