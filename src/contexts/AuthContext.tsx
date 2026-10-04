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
  // 账号中心（EF account-center）：注册 / 开通密码登录 / 重置密码
  registerByPhone: (phone: string, code: string, password: string, nickname?: string) => Promise<{error: Error | null}>
  enablePasswordLogin: (phone: string, code: string, password: string) => Promise<{error: Error | null}>
  resetPassword: (phone: string, code: string, password: string) => Promise<{error: Error | null}>
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

  // 账号中心错误码 → 用户可读文案（EF account-center 返回）
  const ACCOUNT_ERROR_TEXT: Record<string, string> = {
    invalid_phone: '手机号格式不正确',
    missing_code: '请填写验证码',
    weak_password: '密码至少 8 位，建议字母与数字组合',
    code_invalid_or_expired: '验证码错误或已过期，请重新获取',
    update_failed: '设置失败，请稍后重试',
    not_admin: '仅管理员可执行该操作',
    unknown_action: '未知操作',
    internal_error: '服务异常，请稍后重试',
  }

  // 统一调用账号中心 EF：注册 / 开通密码登录 / 重置密码
  // 密码类写操作必须走服务端（EF 持有 service_role），客户端绝不持有该 key。
  const callAccountCenter = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('account-center', { body: payload })
    if (error) throw new Error(error.message || '服务异常')
    if (data && (data as any).ok === false) {
      const code = String((data as any).error || '')
      throw new Error(ACCOUNT_ERROR_TEXT[code] || (data as any).message || '操作失败')
    }
    return data
  }

  const registerByPhone = async (
    phone: string,
    code: string,
    password: string,
    nickname?: string,
  ) => {
    try {
      await callAccountCenter({ action: 'register', phone, code, password, nickname, channel: 'miniprogram' })
      // 注册成功后沿用推荐关系绑定（与验证码登录链路一致）
      try {
        const { convertPendingReferral } = await import('@/db/api')
        await convertPendingReferral()
      } catch (e) {
        console.warn('[Auth] 推荐关系绑定跳过:', e)
      }
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const enablePasswordLogin = async (phone: string, code: string, password: string) => {
    try {
      await callAccountCenter({ action: 'enable_password', phone, code, password, channel: 'miniprogram' })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const resetPassword = async (phone: string, code: string, password: string) => {
    try {
      await callAccountCenter({ action: 'reset_password', phone, code, password, channel: 'miniprogram' })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signInWithUsername = async (username: string, password: string) => {
    try {
      // 支持三种形态：邮箱（含 @）、用户名、手机号
      let email = username
      if (!username.includes('@')) {
        if (/^1[3-9]\d{9}$/.test(username)) {
          // 手机号：登录邮箱由服务端映射表 public.user_login_identities 决定，
          // 客户端不再猜（此前只能对 3 个硬编码测试号开后门，其余手机号一律拒绝）。
          // resolve_login_email 内部做手机号规范化，裸号 / +86 前缀都能命中。
          const { data: resolved, error: rpcErr } = await supabase
            .rpc('resolve_login_email', { p_phone: username })
          if (rpcErr) {
            console.warn('[Auth] resolve_login_email 失败:', rpcErr.message)
          }
          if (!resolved) {
            // 未开通密码登录：引导用户去开通，而不是笼统报"不支持"
            throw new Error('该手机号未开通密码登录，可先在下方"开通密码登录"或用短信验证码登录')
          }
          email = resolved as string
        } else {
          // 纯用户名：先查映射表，查不到再沿用历史派生规则兜底
          const { data: byName } = await supabase
            .from('user_login_identities')
            .select('login_email')
            .eq('username', username)
            .maybeSingle()
          email = ((byName as any)?.login_email as string) || `${username}@app.example.com`
        }
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
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
      // 说明：这里原先有一段「DEV 本地测试模式」——对测试手机号放行固定验证码并绕过
      // GoTrue 直接签发 session。该分支属于生产后门（任何人构造手机号+固定码即可登录），
      // 已整体移除。现在所有手机号一律走 Supabase 原生 SMS OTP 校验，测试请用真实验证码。

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
      }
      
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signInWithWechat = async () => {
    try {
      if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
        throw new Error('仅支持微信小程序登录，网页端请使用用户名密码登录')
      }

      // Get WeChat login code
      const loginResult = await Taro.login()

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
        registerByPhone,
        enablePasswordLogin,
        resetPassword,
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
