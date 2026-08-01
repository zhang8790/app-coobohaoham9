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
  signInAsMerchant: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  profile: null, loading: true, useMock: false,
  signInWithEmail: async () => null,
  signInWithPhonePassword: async () => null,
  signInWithPhone: async () => null,
  sendOtpCode: async () => null,
  signInAsMerchant: async () => {},
  signOut: async () => {},
})

// ============ Mock 身份（仅商户演示保留） ============
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
          // 未登录：停留在登录页，不自动回退演示模式
          console.log('[Auth] 未登录，等待用户登录')
          setLoading(false)
        }
      })
      .catch(() => {
        // 连接失败：停留在登录页，提示检查网络
        console.warn('[Auth] Supabase 连接失败，请检查网络')
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
      console.warn('[Auth] Profile 未找到，账号未激活')
      return null
    }
  }

  const signInWithEmail = async (email: string, _password: string): Promise<string | null> => {
    // 始终尝试真实登录
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: _password })
    if (error) {
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
      return '短信发送失败，请检查手机号'
    }
  }

  const signInWithPhone = async (phone: string, code: string): Promise<string | null> => {
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
    <Ctx.Provider value={{ profile, loading, useMock, signInWithEmail, signInWithPhonePassword, signInWithPhone, sendOtpCode, signInAsMerchant, signOut }}>
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
