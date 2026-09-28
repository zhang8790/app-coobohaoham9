// @title 手机号注册
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/Icon'

export default function RegisterPage() {
  const { signInWithPhone, registerByPhone, signInWithUsername } = useAuth()

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [nickname, setNickname] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdVisible, setPwdVisible] = useState(false)
  const [agreed, setAgreed] = useState(false)
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

  const handleSubmit = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { Taro.showToast({ title: '请输入正确的手机号', icon: 'none' }); return }
    if (!code || code.length < 4) { Taro.showToast({ title: '请输入验证码', icon: 'none' }); return }
    if (newPwd.length < 8) { Taro.showToast({ title: '密码至少 8 位', icon: 'none' }); return }
    if (newPwd !== confirmPwd) { Taro.showToast({ title: '两次密码不一致', icon: 'none' }); return }
    if (!agreed) { Taro.showToast({ title: '请先同意用户协议', icon: 'none' }); return }

    setSubmitting(true)
    const { error } = await registerByPhone(phone, code, newPwd, nickname.trim() || undefined)
    if (error) {
      setSubmitting(false)
      Taro.showToast({ title: error.message || '注册失败', icon: 'none' })
      return
    }

    // 注册成功：服务端已写好登录映射，这里直接用手机号+密码建立登录态
    const { error: loginErr } = await signInWithUsername(phone, newPwd)
    setSubmitting(false)
    if (loginErr) {
      // 极少数情况（如短信通道异常）自动登录失败，退回登录页即可，账号已建好
      Taro.showToast({ title: '注册成功，请登录', icon: 'success' })
      setTimeout(() => Taro.redirectTo({ url: '/pages/login/index' }), 1200)
      return
    }
    Taro.showToast({ title: '注册成功', icon: 'success' })
    setTimeout(() => Taro.switchTab({ url: '/pages/index/index' }), 1000)
  }

  return (
    <View className="min-h-screen flex flex-col bg-background">
      {/* 顶部装饰 */}
      <View className="relative px-6 pt-16 pb-10" style={{ background: 'linear-gradient(160deg,#F0E6D2 0%,#F7F3E9 100%)' }}>
        <View
          className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center"
          onClick={() => Taro.navigateBack()}>
          <Icon name="arrow-left" size={24} className="text-foreground" />
        </View>
        <View className="flex items-center gap-3 mt-2">
          <View className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Text className="text-white font-bold text-xl">喜</Text>
          </View>
          <View>
            <Text className="text-3xl font-bold text-foreground">来店有喜</Text>
            <Text className="text-xl text-muted-foreground mt-1">手机号注册</Text>
          </View>
        </View>
      </View>

      {/* 内容区 */}
      <View className="flex-1 px-6 pt-8">
        <Text className="text-xl text-muted-foreground mb-6">
          注册后即可用手机号 + 密码登录
        </Text>

        {/* 手机号 */}
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
              className={`px-3 py-1 rounded-lg ${countdown > 0 ? 'bg-muted text-muted-foreground' : 'bg-primary_f10 text-primary'}`}
              onClick={handleSendCode}>
              <Text className="text-lg">{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
            </View>
          </View>
        </View>

        {/* 昵称（可选） */}
        <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
          <Input
            className="text-xl text-foreground bg-transparent outline-none"
            placeholder="昵称（选填）"
            value={nickname}
            onInput={(e) => { const ev = e as any; setNickname(ev.detail?.value ?? ev.target?.value ?? '') }} />
        </View>

        {/* 新密码 */}
        <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
          <View className="flex items-center gap-2">
            <Input
              className="flex-1 text-xl text-foreground bg-transparent outline-none"
              placeholder="请设置密码（至少 8 位）"
              type={pwdVisible ? 'text' : 'password'}
              value={newPwd}
              onInput={(e) => { const ev = e as any; setNewPwd(ev.detail?.value ?? ev.target?.value ?? '') }} />
            <View onClick={() => setPwdVisible(v => !v)}>
              <Icon name={pwdVisible ? 'eye-off' : 'eye'} size={22} className="text-muted-foreground" />
            </View>
          </View>
        </View>

        {/* 确认密码 */}
        <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-6">
          <Input
            className="text-xl text-foreground bg-transparent outline-none"
            placeholder="请再次输入密码"
            type={pwdVisible ? 'text' : 'password'}
            value={confirmPwd}
            onInput={(e) => { const ev = e as any; setConfirmPwd(ev.detail?.value ?? ev.target?.value ?? '') }} />
        </View>

        {/* 提交 */}
        <View
          className={`w-full flex items-center justify-center leading-none rounded-xl ${submitting ? 'bg-primary_f40' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <View className="py-4 text-xl text-white font-bold">{submitting ? '注册中...' : '注册并登录'}</View>
        </View>

        {/* 协议 */}
        <View className="flex items-center justify-center gap-2 mt-6">
          <View
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${agreed ? 'bg-primary border-primary' : 'border-border'}`}
            onClick={() => setAgreed(v => !v)}>
            {agreed ? <Icon name="check" size={14} className="text-white" /> : null}
          </View>
          <Text className="text-lg text-muted-foreground">
            已阅读并同意
            <Text
              className="text-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/agreement/user-agreement/index' })}>
              《用户协议》
            </Text>
            和
            <Text
              className="text-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/agreement/privacy-policy/index' })}>
              《隐私政策》
            </Text>
          </Text>
        </View>

        {/* 已有账号 */}
        <View className="flex items-center justify-center gap-1 mt-6">
          <Text className="text-lg text-muted-foreground">已有账号？</Text>
          <Text className="text-lg text-primary" onClick={() => Taro.redirectTo({ url: '/pages/login/index' })}>
            去登录
          </Text>
        </View>
      </View>
    </View>
  )
}
