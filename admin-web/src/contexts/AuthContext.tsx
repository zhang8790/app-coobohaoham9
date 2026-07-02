import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthCtx {
  profile: Profile | null
  loading: boolean
  useMock: boolean
  signInWithEmail: (email: string, password: string) => Promise<string | null>
  signInAsAdmin: () => Promise<void>
  signInAsMerchant: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  profile: null, loading: true, useMock: false,
  signInWithEmail: async () => null,
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
    setProfile(data ?? null)
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
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    if (!prof) return '账号未激活，请联系管理员'
    // 允许 admin 和 merchant 两种角色登录
    if (!['admin', 'merchant'].includes(prof.role ?? '')) {
      await supabase.auth.signOut()
      return '无权限：该账号不是管理员或商家'
    }
    return null
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

  const signOut = async () => {
    if (useMock) { setProfile(null); return }
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <Ctx.Provider value={{ profile, loading, useMock, signInWithEmail, signInAsAdmin, signInAsMerchant, signOut }}>
      {/* 演示模式提示条 */}
      {useMock && (
        <div style={{
          background: 'linear-gradient(90deg, #C2410C, #EA580C)',
          color: '#fff', textAlign: 'center', padding: '8px 0',
          fontSize: 13, fontWeight: 500, letterSpacing: 0.5,
        }}>
          ⚡ 演示模式：已使用模拟数据，连接 Supabase 后自动切换真实数据
          （当前身份：{profile?.role === 'admin' ? '超级管理员' : '犒赏铺商家'}）
        </div>
      )}
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
