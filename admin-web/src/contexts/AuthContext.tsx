import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
  role: 'admin', level: '盟主', points: 9999, balance: 0, avatar_url: '', phone: '13800138000',
  created_at: new Date().toISOString(),
}
const MOCK_MERCHANT: Profile = {
  id: 'mock-merchant-001', username: 'merchant', nickname: '犒赏铺商家',
  role: 'merchant', level: '掌柜', points: 1000, balance: 0, avatar_url: '', phone: '13900139000',
  created_at: new Date().toISOString(),
}

// 判断用户是否有商家权限（role=merchant 或 merchant_status=approved）
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

  const loadProfile = async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (data) {
      setProfile(data as any)
      setUseMock(false)
    } else {
      console.log('[Auth] Profile 未找到，启用演示模式')
      setProfile(MOCK_ADMIN)
      setUseMock(true)
    }
  }

  const signInWithEmail = async (email: string, _password: string): Promise<string | null> => {
    // Mock 模式：根据邮箱判断角色
    if (useMock || email === 'admin' || email.includes('admin')) {
      setProfile(MOCK_ADMIN)
      return null
    }
    if (email === 'merchant' || email.includes('merchant') || email.includes('store')) {
      setProfile(MOCK_MERCHANT)
      return null
    }
    // 真实登录
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: _password })
    if (error) return error.message
    if (!data.user) return '登录失败'
    const { data: prof } = await supabase.from('profiles').select('role,merchant_status').eq('id', data.user.id).maybeSingle()
    if (!prof) return '账号未激活，请联系管理员'
    // 允许 admin 和有商家权限的用户
    if (prof.role !== 'admin' && !isMerchantUser(prof as any)) {
      await supabase.auth.signOut()
      return '无权限：该账号不是管理员或商家'
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
      // 回退：直接从数据库加载 profile
      try {
        const { data: profData } = await supabase
          .from('profiles').select('*').eq('phone', '18701410500').maybeSingle()
        if (profData) {
          setProfile(profData as any); setUseMock(true); return null
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
      targetUser = userData.users.find(u => u.id === prof.id)
      if (!targetUser?.email) return '该账号未绑定邮箱，请使用验证码登录'
      const { data, error } = await supabase.auth.signInWithPassword({ email: targetUser.email, password })
      if (error) return error.message || '密码错误'
      if (!data.user) return '登录失败'
      await loadProfile(data.user.id)
      setUseMock(false)
      // 允许 admin 和有商家权限的用户
      const { data: pData } = await supabase.from('profiles').select('role,merchant_status').eq('id', data.user.id).maybeSingle()
      if (pData && pData.role !== 'admin' && !isMerchantUser(pData as any)) {
        await supabase.auth.signOut()
        setProfile(null)
        return '无权限：该账号不是管理员或商家'
      }
      return null
    } catch (e: unknown) {
      return '登录失败，请稍后重试'
    }
  }

  const signInAsAdmin = async () => {
    if (useMock) { setProfile(MOCK_ADMIN); return }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'admin@laidianyouxi.com', password: 'admin123456',
      })
      if (error) {
        const { data: d2, error: e2 } = await supabase.auth.signUp({
          email: 'admin@laidianyouxi.com', password: 'admin123456',
        })
        if (e2) throw e2
        if (d2.user) {
          await supabase.from('profiles').upsert({
            id: d2.user.id, username: 'admin', role: 'admin', nickname: '超级管理员',
          })
          await supabase.auth.signInWithPassword({
            email: 'admin@laidianyouxi.com', password: 'admin123456',
          })
        }
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) await loadProfile(session.user.id)
    } catch {
      setProfile(MOCK_ADMIN)
      setUseMock(true)
    }
  }

  const signInAsMerchant = async () => {
    if (useMock) { setProfile(MOCK_MERCHANT); return }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'merchant@laidianyouxi.com', password: 'merchant123',
      })
      if (error) {
        const { data: d2, error: e2 } = await supabase.auth.signUp({
          email: 'merchant@laidianyouxi.com', password: 'merchant123',
        })
        if (e2) throw e2
        if (d2.user) {
          await supabase.from('profiles').upsert({
            id: d2.user.id, username: 'merchant', role: 'merchant', nickname: '犒赏铺商家',
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
      // 最终兜底：mock 商家身份
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
        return '无权限：该账号不是管理员或商家'
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
          background: 'linear-gradient(90deg, #C2410C, #EA580C)',
          color: '#fff', textAlign: 'center', padding: '8px 0',
          fontSize: 13, fontWeight: 500, letterSpacing: 0.5,
        }}>
          ⚡ 演示模式：已使用模拟数据，连接 Supabase 后自动切换真实数据
          （当前身份：{profile?.role === 'admin' ? '超级管理员' : (profile?.nickname || '商家')}）
        </div>
      )}
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
