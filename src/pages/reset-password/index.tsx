// @title 重置/修改密码
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import Icon from '@/components/Icon'

export default function ResetPasswordPage() {
  const { user, loading, signInWithPhone, enablePasswordLogin, resetPassword } = useAuth()

  // mode: 'forgot' (未登录·忘记密码) | 'enable' (未登录·开通密码登录) | 'change' (已登录·修改密码)
  const params = Taro.getCurrentInstance().router?.params as any
  const isChange = params?.mode === 'change'
  const isEnable = params?.mode === 'enable'

  // 登录页引导跳转时会带 phone=，此处预填，免得用户再输一遍
  const [phone, setPhone] = useState(params?.phone || '')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [otpVerified, setOtpVerified] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdVisible, setPwdVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { Taro.showToast({ title: '请输入正确的手机号', icon: 'none' }); return }
    if (countdown > 0) return
    setSubmitting(true)
    const { error } = await signInWithPhone(`+86${phone}`)
    setSubmitting(false)
    if (error) { Taro.showToast({ title: '发送失败，请重试', icon: 'none' }); return }
    startCountdown()
    Taro.showToast({ title: '验证码已发送', icon: 'success' })
  }

  const handleVerifyOtp = async () => {
    if (!code || code.length < 4) { Taro.showToast({ title: '请输入验证码', icon: 'none' }); return }
    // 注意：这里**不能**真的调 verifyOtp。
    // Supabase 的短信验证码是一次性 token，若在本步就被消费，
    // 提交时 account-center EF 再验同一个 code 必然报「已过期/无效」。
    // 因此本步只做前端格式校验，真正的验码由 EF 在提交时一次性完成
    // （验码 + 改密 + 写登录映射，全在服务端一次调用内）。
    setOtpVerified(true)
    Taro.showToast({ title: '请设置新密码', icon: 'success' })
  }

  const validatePwd = () => {
    if (newPwd.length < 8) { Taro.showToast({ title: '密码至少 8 位', icon: 'none' }); return false }
    if (newPwd !== confirmPwd) { Taro.showToast({ title: '两次密码不一致', icon: 'none' }); return false }
    return true
  }

  const handleSubmit = async () => {
    if (!validatePwd()) return
    setSubmitting(true)

    if (isChange) {
      // 已登录修改密码：直接调 GoTrue 即可（会话内改密）
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      setSubmitting(false)
      if (error) { Taro.showToast({ title: '设置失败：' + error.message, icon: 'none' }); return }
    } else {
      // 未登录：走 account-center EF。
      // 密码写入 auth.users 必须持有 service_role，客户端无权，
      // 故由 EF 在一次调用内完成：验码 → 改密 → 写 user_login_identities。
      const { error } = isEnable
        ? await enablePasswordLogin(phone, code, newPwd)
        : await resetPassword(phone, code, newPwd)
      setSubmitting(false)
      if (error) { Taro.showToast({ title: error.message || '设置失败', icon: 'none' }); return }
    }

    Taro.showToast({
      title: isChange ? '密码已修改' : (isEnable ? '已开通密码登录' : '密码已重置'),
      icon: 'success',
    })
    if (!isChange) {
      // 忘记密码：清除临时登录态，回到上一层（登录页），保留栈让微信胶囊能显示返回箭头
      await supabase.auth.signOut().catch(() => {})
      setTimeout(() => Taro.navigateBack({ delta: 1 }), 1200)
    } else {
      setTimeout(() => Taro.navigateBack(), 1200)
    }
  }

  const goBack = () => {
    if (isChange) Taro.navigateBack()
    else Taro.navigateBack()
  }

  const showChangeGuard = isChange && !loading && !user

  return (
    <View className="min-h-screen flex flex-col bg-background">
      {/* 顶部装饰 */}
      <View className="relative px-6 pt-16 pb-10" style={{ background: 'linear-gradient(160deg,#F0E6D2 0%,#F7F3E9 100%)' }}>
        <View className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center" onClick={goBack}>
          <Icon name="arrow-left" size={24} className="text-foreground" />
        </View>
        <View className="flex items-center gap-3 mt-2">
          <View className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Text className="text-white font-bold text-xl">喜</Text>
          </View>
          <View>
            <Text className="text-3xl font-bold text-foreground">来店有喜</Text>
            <Text className="text-xl text-muted-foreground mt-1">
              {isChange ? '修改密码' : (isEnable ? '开通密码登录' : '重置密码')}
            </Text>
          </View>
        </View>
      </View>

      {/* 内容区 */}
      <View className="flex-1 px-6 pt-8">
        {showChangeGuard ? (
          <View className="mt-10 flex flex-col items-center gap-4">
            <Text className="text-xl text-muted-foreground text-center">请先登录后再修改密码</Text>
            <View
              className="flex items-center justify-center leading-none rounded-xl bg-primary"
              onClick={() => Taro.redirectTo({ url: '/pages/login/index' })}>
              <View className="px-8 py-3 text-xl text-white font-bold">去登录</View>
            </View>
          </View>
        ) : (
          <>
            {(!isChange && !otpVerified) ? (
              <>
                <Text className="text-xl text-muted-foreground mb-6">
                  请输入注册手机号，验证身份后重置密码
                </Text>

                <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
                  <View className="flex items-center gap-2">
                    <Text className="text-xl text-muted-foreground">+86</Text>
                    <View className="w-px h-5 bg-border" />
                    <Input
                      className="flex-1 text-xl text-foreground bg-transparent outline-none"
                      placeholder="请输入手机号"
                      type="tel"
                      value={phone}
                      onInput={(e) => { const ev = e as any; setPhone(ev.detail?.value ?? ev.target?.value ?? '') }} />
                  </View>
                </View>

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
                      <Text className="text-lg">{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
                    </View>
                  </View>
                </View>

                <View
                  className={`w-full flex items-center justify-center leading-none rounded-xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
                  onClick={handleVerifyOtp}>
                  <View className="py-4 text-xl text-white font-bold">{submitting ? '验证中...' : '验证并下一步'}</View>
                </View>

                <Text className="text-base text-muted-foreground mt-4 text-center leading-relaxed">
                  若使用账号名登录且无法接收短信，请联系管理员重置密码
                </Text>
              </>
            ) : (
              <>
                <Text className="text-xl text-muted-foreground mb-6">
                  {isChange ? '请设置新的登录密码' : '验证成功，请设置新的登录密码'}
                </Text>

                <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
                  <View className="flex items-center gap-2">
                    <Input
                      className="flex-1 text-xl text-foreground bg-transparent outline-none"
                      placeholder="请输入新密码（至少 6 位）"
                      type={pwdVisible ? 'text' : 'password'}
                      value={newPwd}
                      onInput={(e) => { const ev = e as any; setNewPwd(ev.detail?.value ?? ev.target?.value ?? '') }} />
                    <View onClick={() => setPwdVisible(v => !v)}>
                      <Icon name={pwdVisible ? 'eye-off' : 'eye'} size={22} className="text-muted-foreground" />
                    </View>
                  </View>
                </View>

                <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
                  <Input
                    className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder="请再次输入新密码"
                    type={pwdVisible ? 'text' : 'password'}
                    value={confirmPwd}
                    onInput={(e) => { const ev = e as any; setConfirmPwd(ev.detail?.value ?? ev.target?.value ?? '') }} />
                </View>

                <View
                  className={`w-full flex items-center justify-center leading-none rounded-xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
                  onClick={handleSubmit}>
                  <View className="py-4 text-xl text-white font-bold">
                    {submitting ? '提交中...' : (isChange ? '确认修改' : '确认重置')}
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </View>
    </View>
  )
}
