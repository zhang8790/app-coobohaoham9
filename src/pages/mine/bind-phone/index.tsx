// @title 绑定/更换手机号
// 用途：给已登录（微信登录）的账号补一个手机号身份，使该账号可用「手机号 + 密码」
// 登录网页版管理后台，并让总后台可按手机号检索到该用户（profiles.phone）。
// 流程（Supabase 安全换绑）：updateUser({phone}) 向新号发送 OTP → verifyOtp(type='phone_change')
// 确认 → 回写 profiles.phone（best-effort，失败不阻断，auth 侧已完成绑定）。
import { useState, useRef, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import { updateUserProfile } from '@/db/api'
import Icon from '@/components/Icon'

// Auth 报错中文化：GoTrue 原始信息是英文（"Unable to get SMS provider" 等），直接弹给用户看不懂。
// 只映射能指导下一步动作的几类。
function humanizeAuthError(raw?: string | null, fallback = '操作失败，请稍后重试'): string {
  const m = (raw || '').toLowerCase()
  if (m.includes('sms provider') || m.includes('error sending') || m.includes('sms_send_failed')) {
    return '短信服务未配置，暂时收不到验证码'
  }
  if (m.includes('phone logins are disabled') || m.includes('phone_provider_disabled')) {
    return '手机号登录未开通，请联系管理员'
  }
  if (m.includes('already been registered') || m.includes('already registered') || m.includes('duplicate')) {
    return '该手机号已被其他账号绑定'
  }
  if (m.includes('rate limit') || m.includes('too many')) return '操作过于频繁，请稍后再试'
  return raw || fallback
}

export default function BindPhonePage() {
  const { user, profile, loading, refreshProfile } = useAuth()

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [otpSent, setOtpSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const boundPhone = profile?.phone || user?.phone || ''
  const isChange = !!boundPhone
  const mask = (p: string) => (/^\d{11}$/.test(p) ? `${p.slice(0, 3)}****${p.slice(-4)}` : p)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startCountdown = () => {
    setCountdown(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    if (!user) { Taro.showToast({ title: '请先登录', icon: 'none' }); return }
    if (!/^1[3-9]\d{9}$/.test(phone)) { Taro.showToast({ title: '请输入正确的手机号', icon: 'none' }); return }
    if (phone === boundPhone) { Taro.showToast({ title: '该手机号已绑定当前账号', icon: 'none' }); return }
    if (countdown > 0 || submitting) return

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ phone: `+86${phone}` })
    setSubmitting(false)

    if (error) {
      Taro.showToast({ title: error.message || '发送失败，请稍后重试', icon: 'none' })
      return
    }
    setOtpSent(true)
    startCountdown()
    Taro.showToast({ title: '验证码已发送', icon: 'success' })
  }

  const handleConfirm = async () => {
    if (!otpSent) { Taro.showToast({ title: '请先获取验证码', icon: 'none' }); return }
    if (!code || code.length < 4) { Taro.showToast({ title: '请输入验证码', icon: 'none' }); return }
    if (submitting) return

    setSubmitting(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: `+86${phone}`,
      token: code,
      type: 'phone_change',
    })
    if (error) {
      setSubmitting(false)
      Taro.showToast({ title: error.message || '验证码错误', icon: 'none' })
      return
    }

    // auth 侧已绑定成功；profiles.phone 同步失败不影响登录能力，仅影响后台按手机号检索
    const synced = await updateUserProfile({ phone })
    await refreshProfile().catch(() => {})
    setSubmitting(false)

    Taro.showToast({ title: isChange ? '手机号已更换' : '手机号已绑定', icon: 'success' })
    if (!synced) {
      // 不阻断主流程，但要让用户知道后台检索可能查不到
      setTimeout(() => Taro.showToast({ title: '资料同步稍后自动完成', icon: 'none' }), 1400)
    }
    setTimeout(() => Taro.navigateBack(), 1600)
  }

  const showLoginGuard = !loading && !user

  return (
    <View className="min-h-screen flex flex-col bg-background">
      {/* 顶部装饰 */}
      <View className="relative px-6 pt-16 pb-10" style={{ background: 'linear-gradient(160deg,#F0E6D2 0%,#F7F3E9 100%)' }}>
        <View className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center"
          onClick={() => Taro.navigateBack()}>
          <Icon name="arrow-left" size={24} className="text-foreground" />
        </View>
        <View className="flex items-center gap-3 mt-2">
          <View className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Text className="text-white font-bold text-xl">喜</Text>
          </View>
          <View>
            <Text className="text-3xl font-bold text-foreground">{isChange ? '更换手机号' : '绑定手机号'}</Text>
            <Text className="text-xl text-muted-foreground mt-1">绑定后可用手机号登录管理后台</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 px-6 pt-8">
        {showLoginGuard ? (
          <View className="mt-10 flex flex-col items-center gap-4">
            <Text className="text-xl text-muted-foreground text-center">请先登录后再绑定手机号</Text>
            <View
              className="flex items-center justify-center leading-none rounded-xl bg-primary"
              onClick={() => Taro.redirectTo({ url: '/pages/login/index' })}>
              <View className="px-8 py-3 text-xl text-white font-bold">去登录</View>
            </View>
          </View>
        ) : (
          <>
            {isChange && (
              <View className="flex items-center justify-between px-4 py-4 bg-card border border-border rounded-xl mb-6">
                <Text className="text-xl text-foreground">当前手机号</Text>
                <Text className="text-xl text-muted-foreground">{mask(boundPhone)}</Text>
              </View>
            )}

            <Text className="text-xl text-muted-foreground mb-6">
              {isChange ? '请输入新手机号，验证后旧号自动解绑' : '请输入常用手机号，用于登录与账号找回'}
            </Text>

            {/* 新手机号 */}
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
              <View className="flex items-center gap-2">
                <Text className="text-xl text-muted-foreground">+86</Text>
                <View className="w-px h-5 bg-border" />
                <Input
                  className="flex-1 text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入手机号"
                  type="tel"
                  maxLength={11}
                  disabled={otpSent}
                  value={phone}
                  onInput={(e) => { const ev = e as any; setPhone(ev.detail?.value ?? ev.target?.value ?? '') }} />
              </View>
            </View>

            {/* 验证码 */}
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
              <View className="flex items-center gap-2">
                <Input
                  className="flex-1 text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入验证码"
                  type="number"
                  maxLength={6}
                  value={code}
                  onInput={(e) => { const ev = e as any; setCode(ev.detail?.value ?? ev.target?.value ?? '') }} />
                <View
                  className={`px-3 py-1 rounded-lg ${countdown > 0 ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}
                  onClick={handleSendCode}>
                  <Text className="text-lg">{countdown > 0 ? `${countdown}s` : (submitting ? '发送中…' : '获取验证码')}</Text>
                </View>
              </View>
            </View>

            <View
              className={`w-full flex items-center justify-center leading-none rounded-xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handleConfirm}>
              <View className="py-4 text-xl text-white font-bold">{submitting ? '提交中…' : (isChange ? '确认更换' : '确认绑定')}</View>
            </View>

            <Text className="text-base text-muted-foreground mt-4 text-center leading-relaxed">
              同一手机号只能绑定一个账号。绑定后即可用该手机号登录网页版管理后台；
              如果收不到验证码，可联系管理员协助处理。
            </Text>
          </>
        )}
      </View>
    </View>
  )
}
