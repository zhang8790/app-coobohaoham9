// @title 登录
import { useState, useMemo, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'

export default function LoginPage() {
  const { signInWithPhone, verifyPhoneOtp, signInWithWechat, signInWithUsername } = useAuth()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loginMode, setLoginMode] = useState<'phone' | 'password'>('phone')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testMode, setTestMode] = useState(false) // 内部保留，不暴露 UI

  // 从 URL 参数或小程序 scene 中读取推广码
  const referralCode = useMemo(() => {
    const params = Taro.getCurrentInstance().router?.params as any
    if (params?.ref) return decodeURIComponent(params.ref)
    if (params?.scene) {
      try {
        const scene = decodeURIComponent(params.scene)
        const match = scene.match(/ref=([A-Z0-9]{6,8})/)
        if (match) return match[1]
      } catch { /* ignore */ }
    }
    // fallback: check storage (set by article share landing)
    return Taro.getStorageSync('pendingReferralCode') || ''
  }, [])

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
    if (!agreed && !testMode) { Taro.showToast({ title: '请先同意用户协议', icon: 'none' }); return }
    if (!/^1[3-9]\d{9}$/.test(phone)) { Taro.showToast({ title: '请输入正确的手机号', icon: 'none' }); return }
    if (countdown > 0 && !testMode) return

    // 测试模式：直接跳过短信发送
    if (testMode || phone === '18710410500' || phone === '18701410500' || phone === '12345678901') {
      setStep('otp')
      Taro.showToast({ title: '测试模式：请输入 123456', icon: 'none' })
      return
    }

    setLoading(true)
    const { error } = await signInWithPhone(`+86${phone}`)
    setLoading(false)
    if (error) { Taro.showToast({ title: '发送失败，请重试', icon: 'none' }); return }
    startCountdown()
    setStep('otp')
    Taro.showToast({ title: '验证码已发送', icon: 'success' })
  }

  const handleVerify = async () => {
    if (!code || code.length < 4) { Taro.showToast({ title: '请输入验证码', icon: 'none' }); return }
    setLoading(true)
    const { error } = await verifyPhoneOtp(`+86${phone}`, code)
    setLoading(false)
    if (error) { Taro.showToast({ title: '验证码错误', icon: 'none' }); return }
    handleLoginSuccess()
  }

  const handlePasswordLogin = async () => {
    if (!username.trim()) { Taro.showToast({ title: '请输入用户名', icon: 'none' }); return }
    if (!password) { Taro.showToast({ title: '请输入密码', icon: 'none' }); return }
    setLoading(true)
    const { error } = await signInWithUsername(username.trim(), password)
    setLoading(false)
    if (error) { Taro.showToast({ title: '登录失败：' + error.message, icon: 'none' }); return }
    handleLoginSuccess()
  }

  const handleWechatLogin = async () => {
    if (!agreed) { Taro.showToast({ title: '请先同意用户协议', icon: 'none' }); return }
    setLoading(true)
    const { error } = await signInWithWechat()
    setLoading(false)
    if (error) { Taro.showToast({ title: '微信登录失败', icon: 'none' }); return }
    handleLoginSuccess()
  }

  const handleLoginSuccess = async () => {
    // 登录成功后绑定推广码（若有）
    if (referralCode) {
      try {
        await supabase.rpc('bind_referrer', { p_referral_code: referralCode })
        Taro.removeStorageSync('pendingReferralCode')
      } catch { /* non-blocking */ }
    }

    // 检测是否为员工
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: staff } = await supabase
          .from('store_staff')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
        if (staff) {
          // 是员工 → 跳员工中心
          Taro.reLaunch({ url: '/pages/employee/index' })
          return
        }
      }
    } catch (err) {
      console.error('[登录] 员工检测失败', err)
    }

    // 非员工 → 正常跳转
    const redirect = Taro.getStorageSync('loginRedirectPath')
    Taro.removeStorageSync('loginRedirectPath')
    const tabBarPaths = ['/pages/index/index', '/pages/explore/index', '/pages/reward-shop/index', '/pages/cart/index', '/pages/user/index']
    if (redirect && tabBarPaths.includes(redirect)) {
      Taro.switchTab({ url: redirect })
    } else if (redirect) {
      Taro.redirectTo({ url: redirect })
    } else {
      Taro.switchTab({ url: '/pages/index/index' })
    }
  }

  return (
    <View className="min-h-screen flex flex-col bg-background">
      {/* 顶部装饰 */}
      <View className="relative px-6 pt-16 pb-10" style={{ background: 'linear-gradient(160deg,#FFF0E8 0%,#FFFBF7 100%)' }}>
        <View className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center"
          onClick={() => Taro.navigateBack()}>
          <View className="i-mdi-arrow-left text-2xl text-foreground" />
        </View>
        <View className="flex items-center gap-3 mt-2">
          <View className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Text className="text-white font-bold text-xl">喜</Text>
          </View>
          <View>
            <Text className="text-3xl font-bold text-foreground">来电有喜</Text>
            <Text className="text-xl text-muted-foreground mt-1">武侠江湖，有喜相逢</Text>
          </View>
        </View>
        {referralCode ? (
          <View className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
            <View className="i-mdi-gift text-xl text-primary flex-shrink-0" />
            <Text className="text-xl text-primary">推广码 <Text className="font-bold tracking-wider">{referralCode}</Text> 已识别，注册后自动绑定</Text>
          </View>
        ) : null}
      </View>

      {/* 登录方式切换 */}
      <View className="flex px-6 pt-6">
        <View
          className={`flex-1 py-3 text-xl font-bold ${loginMode === 'phone' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground border-b-2 border-transparent'}`}
          onClick={() => { setLoginMode('phone'); setStep('phone') }}>
          手机号登录
        </View>
        <View
          className={`flex-1 py-3 text-xl font-bold ${loginMode === 'password' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground border-b-2 border-transparent'}`}
          onClick={() => setLoginMode('password')}>
          账号密码登录
        </View>
      </View>

      {/* 登录表单 */}
      <View className="flex-1 px-6 pt-8">
        {loginMode === 'phone' ? (
          <>
            <Text className="text-2xl font-bold text-foreground mb-6">
              {step === 'phone' ? '手机号登录' : '输入验证码'}
            </Text>

            {step === 'phone' ? (
              <View>
                <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
                  <View className="flex items-center gap-2">
                    <Text className="text-xl text-muted-foreground">+86</Text>
                    <View className="w-px h-5 bg-border" />
                    <Input
                      className="flex-1 text-xl text-foreground bg-transparent outline-none"
                      placeholder="请输入手机号"
                      type="tel"
                      value={phone}
                      onInput={(e) => { const ev = e as any; setPhone(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </View>
                </View>

                <View
                  className={`w-full flex items-center justify-center leading-none rounded-xl ${loading ? 'bg-primary/50' : 'bg-primary'}`}
                  onClick={handleSendCode}>
                  <View className="py-4 text-xl text-white font-bold">
                    {loading ? '发送中...' : '获取验证码'}
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <Text className="text-xl text-muted-foreground mb-4">验证码已发送至 +86 {phone}</Text>
                <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
                  <Input
                    className="w-full text-2xl text-foreground bg-transparent outline-none text-center tracking-widest"
                    placeholder="请输入验证码"
                    type="number"
                    maxLength={6}
                    value={code}
                    onInput={(e) => { const ev = e as any; setCode(ev.detail?.value ?? ev.target?.value ?? '') }}
                  />
                </View>

                <View className="flex items-center gap-3 mb-4">
                  <View className="flex-1 flex items-center justify-center leading-none rounded-xl bg-primary"
                    onClick={handleVerify}>
                    <View className="py-4 text-xl text-white font-bold">{loading ? '验证中...' : '登录'}</View>
                  </View>
                  <View
                    className={`flex items-center justify-center leading-none rounded-xl border-2 border-border ${countdown > 0 ? 'bg-muted' : 'bg-card'}`}
                    onClick={handleSendCode}>
                    <View className="py-4 px-4 text-xl text-foreground">
                      {countdown > 0 ? `${countdown}s` : '重发'}
                    </View>
                  </View>
                </View>
                <View className="w-full flex items-center justify-center"
                  onClick={() => { setStep('phone'); setCode('') }}>
                  <Text className="text-xl text-primary">更换手机号</Text>
                </View>
              </View>
            )}

            {/* 分割线 */}
            <View className="flex items-center gap-3 my-6">
              <View className="flex-1 h-px bg-border" />
              <Text className="text-xl text-muted-foreground">或</Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            {/* 微信登录 */}
            <View
              className="w-full flex items-center justify-center leading-none rounded-xl border-2 border-border bg-card"
              onClick={handleWechatLogin}>
              <View className="py-4 flex items-center gap-2">
                <View className="i-mdi-wechat text-2xl" style={{ color: '#07C160' }} />
                <Text className="text-xl text-foreground">微信一键登录</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text className="text-2xl font-bold text-foreground mb-6">账号密码登录</Text>

            <View className="space-y-4">
              <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
                <Input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入用户名"
                  type="text"
                  value={username}
                  onInput={(e) => { const ev = e as any; setUsername(ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </View>
              <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
                <Input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入密码"
                  type="password"
                  value={password}
                  onInput={(e) => { const ev = e as any; setPassword(ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </View>
              <View
                className={`w-full flex items-center justify-center leading-none rounded-xl ${loading ? 'bg-primary/50' : 'bg-primary'}`}
                onClick={handlePasswordLogin}>
                <View className="py-4 text-xl text-white font-bold">
                  {loading ? '登录中...' : '登录'}
                </View>
              </View>
            </View>

            {/* 提示 */}
            <Text className="text-xl text-muted-foreground mt-4 text-center">
              没有账号？<Text className="text-primary" onClick={() => {
                Taro.showToast({ title: '请联系管理员创建账号', icon: 'none' })
              }}>请联系管理员</Text>
            </Text>
          </>
        )}
      </View>

      {/* 协议 */}
      {loginMode === 'phone' ? (
        <View className="px-6 pb-4">
          <View className="flex items-start gap-2" onClick={() => setAgreed(!agreed)}>
            <View className={`mt-1 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 ${agreed ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
              {agreed && <View className="i-mdi-check text-white text-sm" />}
            </View>
            <View className="flex flex-wrap gap-1 text-xl text-muted-foreground">
              <Text>我已阅读并同意</Text>
              <Text
                className="text-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  Taro.navigateTo({ url: '/pages/user-agreement/index' })
                }}
              >《用户服务协议》</Text>
              <Text>及</Text>
              <Text
                className="text-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  Taro.navigateTo({ url: '/pages/privacy-policy/index' })
                }}
              >《隐私政策》</Text>
            </View>
          </View>
        </View>
      ) : (
        <View className="px-6 pb-4" />
      )}
    </View>
  )
}
