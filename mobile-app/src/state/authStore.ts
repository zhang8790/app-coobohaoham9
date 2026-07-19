// 认证状态管理（Zustand）—— 由小程序 AuthContext 平移到原生 App
// 关键变化：移除 Taro.login() 小程序微信登录（原生 App 改用手机号 OTP / 用户名密码，
// 微信登录后续通过微信开放平台 Open SDK 接入，见 README 待办）。
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/db'

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  initialized: boolean
  bootstrap: () => Promise<void>
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>
  signUpWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>
  signInWithPhone: (phone: string) => Promise<{ error: Error | null }>
  verifyPhoneOtp: (phone: string, code: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error('[auth] 获取资料失败:', error)
    return null
  }
  return data
}

const TEST_PHONES = ['+8618701410500', '+8612345678901', '+8618710410500']

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  bootstrap: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        set({ user: null, profile: null, loading: false, initialized: true })
        return
      }
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        set({ user: null, profile: null, loading: false, initialized: true })
        return
      }
      const profile = await getProfile(userData.user.id)
      set({ user: userData.user, profile, loading: false, initialized: true })
    } catch {
      set({ user: null, profile: null, loading: false, initialized: true })
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      set({ user })
      if (user) {
        getProfile(user.id).then((profile) => set({ profile }))
      } else {
        set({ profile: null })
      }
    })
  },

  signInWithUsername: async (username, password) => {
    try {
      let email = username
      if (!username.includes('@')) {
        if (/^1[3-9]\d{9}$/.test(username)) {
          if (username === '18701410500' || username === '18710410500' || username === '187101410500') {
            email = 'test18701410500@test.com'
          } else {
            throw new Error('该手机号未开通密码登录，请使用短信验证码登录')
          }
        } else {
          email = `${username}@app.example.com`
        }
      }
      let { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error && email === 'test18701410500@test.com' && error.message.includes('Invalid login credentials')) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { phone: '18701410500', nickname: '测试用户' } },
        })
        if (signUpError) throw signUpError
        const { error: reLoginError } = await supabase.auth.signInWithPassword({ email, password })
        error = reLoginError
      }
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  signUpWithUsername: async (username, password) => {
    try {
      const email = `${username}@app.example.com`
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  signInWithPhone: async (phone) => {
    try {
      if (TEST_PHONES.includes(phone)) return { error: null } // 测试账号：不真正发短信
      const { error } = await supabase.auth.signInWithOtp({ phone })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  verifyPhoneOtp: async (phone, code) => {
    try {
      if (TEST_PHONES.includes(phone) && code === '123456') {
        let { error } = await supabase.auth.signInWithPassword({
          email: 'test18701410500@test.com',
          password: '12345678',
        })
        if (error && error.message.includes('Invalid login credentials')) {
          const { error: signUpError } = await supabase.auth.signUp({
            email: 'test18701410500@test.com',
            password: '12345678',
            options: { data: { phone: '18701410500', nickname: '测试用户' } },
          })
          if (signUpError) throw signUpError
          const { error: reLoginError } = await supabase.auth.signInWithPassword({
            email: 'test18701410500@test.com',
            password: '12345678',
          })
          error = reLoginError
        }
        if (error) throw error
        return { error: null }
      }
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
      if (error) throw error
      if (data.user) {
        // TODO: 登录成功后转化预归属记录（小程序调用 convertPendingReferral）
      }
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  refreshProfile: async () => {
    const { user } = get()
    if (!user) {
      set({ profile: null })
      return
    }
    const profile = await getProfile(user.id)
    set({ profile })
  },
}))
