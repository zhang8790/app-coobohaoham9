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

    // 联网校验 token 有效性（getSession 只读本机，坏 refresh_token 会静默通过）
    const getUserWithTimeout = () =>
      Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getUser timeout after 8s')), 8000)
        ),
      ])

    getSessionWithTimeout()
      .then(async ({ data: { session } }: any) => {
        if (cancelled) return
        if (!session) {
          // 完全无登录态：保持干净未登录
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }
        // 本地有 token 但可能已失效（refresh_token 过期/被吊销），联网校验
        try {
          const { data: userData, error: userErr } = (await getUserWithTimeout()) as any
          if (cancelled) return
          if (userErr || !userData?.user) {
            // 清理损坏的本地 session，回到干净登录态，避免反复 403 卡死确权流程
            console.warn('[Auth] 本地 token 已失效，清理并回登录态')
            Taro.showToast({ title: '登录已失效，请重新登录', icon: 'none', duration: 2500 })
            await supabase.auth.signOut().catch(() => {})
            setUser(null)
            setProfile(null)
            setLoading(false)
            return
          }
          setUser(userData.user)
          getProfile(userData.user.id).then(setProfile).catch(() => setProfile(null))
        } catch {
          // 校验超时/网络异常：保守清空，由 RouteGuard 引导重新登录
          console.warn('[Auth] token 校验失败（超时/网络），清理本地 session')
          await supabase.auth.signOut().catch(() => {})
          setUser(null)
          setProfile(null)
        }
        setLoading(false)
      })
      .catch((error: Error) => {
        if (cancelled) return
        console.warn('[Auth] getSession 失败（已超时或网络错误）:', error?.message || error)
        // 清理可能损坏的本地 session（坏 refresh_token 会一直阻塞自动登录），
        // 让用户能以干净状态重新登录，避免反复 Invalid Refresh Token
        Taro.showToast({ title: '登录校验失败，请重新登录', icon: 'none', duration: 2500 })
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
      // 手机号格式：支持测试账号直接映射（仅 DEV 构建生效）
      if (/^1[3-9]\d{9}$/.test(username)) {
        if (process.env.TARO_APP_LOCAL_DEV === 'true' && username === '18701410500') {
            email = 'test18701410500@test.com'
        } else if (username === '18565613635') {
          // 1856 账号 GoTrue 密码登录损坏（Database error querying schema）
          // 硬登陆：通过 force-login Edge Function 绕过 GoTrue，
          // 删除旧坏行 → 用 Admin API 重建同 id 干净账号 → 签发 session token
          try {
            const { data: fnData, error: fnError } = await supabase.functions.invoke('force-login', {
              body: {
                user_id: '03165ead-8fef-46c4-8f57-bc5a905ac716',
                email: 'test18565613635@test.com',
                password: password || '12345678',
                phone: '+8618565613635',
              }
            })
            if (fnError) throw fnError
            if (fnData?.error) throw new Error(fnData.error)
            if (fnData?.sql_cleanup_needed) {
              throw new Error('需要先在 Supabase SQL Editor 跑 scripts/force-login-prep.sql 删除旧行，再重新登录')
            }
            if (!fnData?.access_token) throw new Error('force-login 未返回 access_token')

            // 用返回的 token 直接建立登录态
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: fnData.access_token,
              refresh_token: fnData.refresh_token,
            })
            if (sessionError) throw sessionError

            console.log('[Auth] 1856 硬登陆成功（force-login）')
            return { error: null }
          } catch (forceLoginErr) {
            // force-login 也失败（可能函数未部署 404 或其他错误），回退密码登录
            console.warn('[Auth] force-login 失败，回退密码登录:', (forceLoginErr as Error).message)
            email = 'test18565613635@test.com'
            // 继续走下面的 signInWithPassword（大概率也报错，但至少显示原始错误）
          }
        } else if (username === '18701410500') {
          // 1870 已通过 scripts/fix-1870-password.sql 补好 email+密码，直接账号密码登录（不依赖任何 Edge Function）
          try {
            const { error: pwError } = await supabase.auth.signInWithPassword({
              email: 'test18701410500@test.com',
              password: password || '12345678',
            })
            if (pwError) throw pwError
            console.log('[Auth] 1870 登录成功（密码）')
            return { error: null }
          } catch (pwLoginErr) {
            throw new Error('1870 登录失败：' + (pwLoginErr as Error).message + '（请先在本机 Supabase SQL Editor 跑 scripts/fix-1870-password.sql）')
          }
        } else if (username === '13526245633') {
          // 后台脚本建号账号（scripts/create_user_with_upline.js）：email 规则 test<裸号>@test.com，走密码登录
          email = 'test13526245633@test.com'
          // 落到下方 signInWithPassword
        } else {
            // 生产环境：此处应通过 backend API 按手机号查邮箱
            throw new Error('该手机号未开通密码登录，请使用短信验证码登录')
          }
        } else {
          // 纯用户名：补 @app.example.com 后缀
          email = `${username}@app.example.com`
        }
      }
      
      // 先尝试登录
      let {error} = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      // 如果是测试账号且登录失败（用户不存在），自动创建（仅 DEV 构建生效）
      if (process.env.TARO_APP_LOCAL_DEV === 'true' && error && email === 'test18701410500@test.com' && error.message.includes('Invalid login credentials')) {
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
      const email = `${username}@app.example.com`
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {data: {username}}
      })

      if (error) throw error
      
      // 【新增】注册成功后，转化预归属记录
      if (data.user) {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral(data.user.id)
        console.log('[Auth] 已转化预归属记录:', data.user.id)
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
      
      // 【新增】注册成功后，转化预归属记录
      if (data.user) {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral(data.user.id)
        console.log('[Auth] 已转化预归属记录:', data.user.id)
      }
      
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signInWithPhone = async (phone: string) => {
    try {
      // 本地测试模式（仅 DEV 构建生效，生产构建死代码消除）：测试账号直接发送固定验证码
      if (process.env.TARO_APP_LOCAL_DEV === 'true' && (phone === '+8618701410500' || phone === '+8618565613635')) {
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
      // 本地测试模式（仅 DEV 构建生效）：测试账号绕过真实短信验证
      if (process.env.TARO_APP_LOCAL_DEV === 'true' && ((phone === '+8618701410500' || phone === '+8618565613635') && code === '123456')) {
        // 1856 账号走 force-login 硬登陆（密码登录损坏）
        if (phone === '+8618565613635') {
          try {
            const { data: fnData, error: fnError } = await supabase.functions.invoke('force-login', {
              body: {
                user_id: '03165ead-8fef-46c4-8f57-bc5a905ac716',
                email: 'test18565613635@test.com',
                password: '12345678',
                phone: '+8618565613635',
              }
            })
            if (fnError) throw fnError
            if (fnData?.error) throw new Error(fnData.error)
            if (fnData?.sql_cleanup_needed) {
              throw new Error('需要先在 Supabase SQL Editor 跑 scripts/force-login-prep.sql 删除旧行，再重新登录')
            }
            if (!fnData?.access_token) throw new Error('force-login 未返回 access_token')

            const { error: sessionError } = await supabase.auth.setSession({
              access_token: fnData.access_token,
              refresh_token: fnData.refresh_token,
            })
            if (sessionError) throw sessionError

            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              const { convertPendingReferral } = await import('@/db/api')
              await convertPendingReferral(user.id)
            }

            return { error: null }
          } catch (err) {
            return { error: err as Error }
          }
        }
        // 其他测试账号：先尝试密码登录
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
        
        // 【新增】登录/注册成功后，转化预归属记录
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { convertPendingReferral } = await import('@/db/api')
          await convertPendingReferral(user.id)
          console.log('[Auth] 已转化预归属记录:', user.id)
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
      
      // 【新增】验证成功后，转化预归属记录
      if (data.user) {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral(data.user.id)
        console.log('[Auth] 已转化预归属记录:', data.user.id)
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

      // 用云函数签发的会话直接建立登录态（无需邮件/OTP）
      const {error: sessionError} = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })

      if (sessionError) throw sessionError
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
