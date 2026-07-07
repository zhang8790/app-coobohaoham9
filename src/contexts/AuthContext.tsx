import {createContext, useContext, useEffect, useState, type ReactNode} from 'react'
import Taro from '@tarojs/taro'
import {supabase} from '@/client/supabase'
import type {User, Session, AuthChangeEvent} from '@supabase/supabase-js'

import type { Profile } from '@/db/types'
export type { Profile } from '@/db/types'

export async function getProfile(userId: string): Promise<Profile | null> {
  const {data, error} = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error) {
    console.error('Failed to fetch user profile:', error)
    return null
  }
  return data
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signInWithUsername: (username: string, password: string) => Promise<{error: Error | null}>
  signUpWithUsername: (username: string, password: string) => Promise<{error: Error | null}>
  signUpWithPhone: (phone: string, password: string) => Promise<{error: Error | null}>
  signInWithPhone: (phone: string) => Promise<{error: Error | null}>
  verifyPhoneOtp: (phone: string, code: string) => Promise<{error: Error | null}>
  signInWithWechat: () => Promise<{error: Error | null}>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null)
      return
    }

    const profileData = await getProfile(user.id)
    setProfile(profileData)
  }

  useEffect(() => {
    let cancelled = false

    // 用 Promise.race 强制定时，确保 getSession 不会永远挂起
    const getSessionWithTimeout = () =>
      Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout after 8s')), 8000)
        ),
      ])

    getSessionWithTimeout()
      .then(({ data: { session } }: any) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        if (session?.user) {
          getProfile(session.user.id).then(setProfile).catch(() => setProfile(null))
        }
        setLoading(false)
      })
      .catch((error: Error) => {
        if (cancelled) return
        console.warn('[Auth] getSession 失败（已超时或网络错误）:', error?.message || error)
        // 清理可能损坏的本地 session（坏 refresh_token 会一直阻塞自动登录），
        // 让用户能以干净状态重新登录，避免反复 Invalid Refresh Token
        supabase.auth.signOut().catch(() => {})
        setUser(null)
        setProfile(null)
        setLoading(false)
      })

    // 监听登录状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return
      setUser(session?.user ?? null)
      if (session?.user) {
        getProfile(session.user.id).then(setProfile).catch(() => setProfile(null))
      } else {
        setProfile(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signInWithUsername = async (username: string, password: string) => {
    try {
      // 支持：邮箱（含 @）、用户名、手机号
      let email = username
      if (!username.includes('@')) {
      // 手机号格式：支持测试账号直接映射（18701410500 / 18710410500 均可）
      if (/^1[3-9]\d{9}$/.test(username)) {
        if (username === '18701410500' || username === '18710410500' || username === '187101410500') {
            email = 'test18701410500@test.com'
          } else {
            // 生产环境：此处应通过 backend API 按手机号查邮箱
            throw new Error('该手机号未开通密码登录，请使用短信验证码登录')
          }
        } else {
          // 纯用户名：补 @miaoda.com 后缀
          email = `${username}@miaoda.com`
        }
      }
      
      // 先尝试登录
      let {error} = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      // 如果是测试账号且登录失败（用户不存在），自动创建
      if (error && email === 'test18701410500@test.com' && error.message.includes('Invalid login credentials')) {
        console.log('[Auth] 测试账号不存在，自动创建...')
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              phone: '18701410500',
              nickname: '测试用户'
            }
          }
        })
        
        if (signUpError) {
          console.error('[Auth] 自动创建测试账号失败:', signUpError)
          throw signUpError
        }
        
        // 创建成功，重新登录
        const { error: reLoginError } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        error = reLoginError
      }
      
      if (error) throw error
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signUpWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username}@miaoda.com`
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {data: {username}}
      })

      if (error) throw error
      
      // 【新增】注册成功后，转化预锁客记录
      if (data.user) {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral(data.user.id)
        console.log('[Auth] 已转化预锁客记录:', data.user.id)
      }
      
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signUpWithPhone = async (phone: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        phone,
        password
      })

      if (error) throw error
      
      // 【新增】注册成功后，转化预锁客记录
      if (data.user) {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral(data.user.id)
        console.log('[Auth] 已转化预锁客记录:', data.user.id)
      }
      
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signInWithPhone = async (phone: string) => {
    try {
      // 本地测试模式：测试账号直接发送固定验证码
      if (phone === '+8618701410500' || phone === '+8612345678901' || phone === '+8618710410500') {
        // 测试账号，不真正发送短信，而是提示用户使用固定验证码
        return { error: null }
      }

      const { error } = await supabase.auth.signInWithOtp({ phone })

      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const verifyPhoneOtp = async (phone: string, code: string) => {
    try {
      // 本地测试模式：测试账号绕过真实短信验证
      if ((phone === '+8618701410500' || phone === '+8612345678901' || phone === '+8618710410500') && code === '123456') {
        // 先尝试登录
        let { error } = await supabase.auth.signInWithPassword({
          email: 'test18701410500@test.com',
          password: '12345678',
        })
        
        // 如果用户不存在，自动创建
        if (error && error.message.includes('Invalid login credentials')) {
          console.log('[Auth] 短信登录：测试账号不存在，自动创建...')
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: 'test18701410500@test.com',
            password: '12345678',
            options: {
              data: { 
                phone: '18701410500',
                nickname: '测试用户'
              }
            }
          })
          
          if (signUpError) {
            console.error('[Auth] 自动创建测试账号失败:', signUpError)
            throw signUpError
          }
          
          // 创建成功，重新登录
          const { error: reLoginError } = await supabase.auth.signInWithPassword({
            email: 'test18701410500@test.com',
            password: '12345678',
          })
          error = reLoginError
        }
        
        if (error) throw error
        
        // 【新增】登录/注册成功后，转化预锁客记录
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { convertPendingReferral } = await import('@/db/api')
          await convertPendingReferral(user.id)
          console.log('[Auth] 已转化预锁客记录:', user.id)
        }
        
        return { error: null }
      }

      // 生产模式：真实短信验证
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: 'sms'
      })
      if (error) throw error
      
      // 【新增】验证成功后，转化预锁客记录
      if (data.user) {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral(data.user.id)
        console.log('[Auth] 已转化预锁客记录:', data.user.id)
      }
      
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signInWithWechat = async () => {
    try {
      // Check if running in WeChat Mini Program environment
      if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
        throw new Error('仅支持微信小程序登录，网页端请使用用户名密码登录')
      }

      // Get WeChat login code
      const loginResult = await Taro.login()

      // Call backend Edge Function for login
      const {data, error} = await supabase.functions.invoke('wechat_miniapp_login', {
        body: {code: loginResult?.code}
      })

      if (error) {
        const errorMsg = (await error?.context?.text?.()) || error.message
        throw new Error(errorMsg)
      }

      // Verify OTP token
      const {error: verifyError} = await supabase.auth.verifyOtp({
        token_hash: data.token,
        type: 'magiclink'
      })

      if (verifyError) throw verifyError
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithUsername,
        signUpWithUsername,
        signUpWithPhone,
        signInWithPhone,
        verifyPhoneOtp,
        signInWithWechat,
        signOut,
        refreshProfile
      }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
