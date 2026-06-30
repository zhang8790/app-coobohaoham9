// @title 登录
import { useState, useMemo } from 'react'
import Taro from '@tarojs/taro'
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

  // 从 URL 参数或小程序 scene 中读取推广码
  const referralCode = useMemo(() => {
    const params = Taro.getCurrentInstance().router?.params as any
    if (params?.ref) return decodeURIComponent(params.ref)
    if (params?.scene) {
      try {
        const scene = decodeURIComponent(params.scene)
        const match = scene.match(/ref=([A-Z0-9]{6})/)
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
    if (!agreed) { Taro.showToast({ title: '请先同意用户协议', icon: 'none' }); return }
    if (!/^1[3-9]\d{9}$/.test(phone)) { Taro.showToast({ title: '请输入正确的手机号', icon: 'none' }); return }
    if (countdown > 0) return
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
    <div className="min-h-screen flex flex-col bg-background">
      {/* 顶部装饰 */}
      <div className="relative px-6 pt-16 pb-10" style={{ background: 'linear-gradient(160deg,#FFF0E8 0%,#FFFBF7 100%)' }}>
        <button type="button" className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-xl">喜</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">来店有喜</h1>
            <p className="text-xl text-muted-foreground mt-1">武侠江湖，有喜相逢</p>
          </div>
        </div>
        {referralCode ? (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
            <div className="i-mdi-gift text-xl text-primary flex-shrink-0" />
            <span className="text-xl text-primary">推广码 <span className="font-bold tracking-wider">{referralCode}</span> 已识别，注册后自动绑定</span>
          </div>
        ) : null}
      </div>

      {/* 登录表单 */}
      <div className="flex-1 px-6 pt-8">
        <h2 className="text-2xl font-bold text-foreground mb-6">
          {step === 'phone' ? '手机号登录' : '输入验证码'}
        </h2>

        {step === 'phone' ? (
          <div>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl text-muted-foreground">+86</span>
                <div className="w-px h-5 bg-border" />
                <input
                  className="flex-1 text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入手机号"
                  type="tel"
                  value={phone}
                  onInput={(e) => { const ev = e as any; setPhone(ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </div>
            </div>
            <button type="button"
              className={`w-full flex items-center justify-center leading-none rounded-xl ${loading ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handleSendCode}>
              <div className="py-4 text-xl text-white font-bold">
                {loading ? '发送中...' : '获取验证码'}
              </div>
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xl text-muted-foreground mb-4">验证码已发送至 +86 {phone}</p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
              <input
                className="w-full text-2xl text-foreground bg-transparent outline-none text-center tracking-widest"
                placeholder="请输入验证码"
                type="number"
                maxLength={6}
                value={code}
                onInput={(e) => { const ev = e as any; setCode(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <button type="button" className="flex-1 flex items-center justify-center leading-none rounded-xl bg-primary"
                onClick={handleVerify}>
                <div className="py-4 text-xl text-white font-bold">{loading ? '验证中...' : '登录'}</div>
              </button>
              <button type="button"
                className={`flex items-center justify-center leading-none rounded-xl border-2 border-border ${countdown > 0 ? 'bg-muted' : 'bg-card'}`}
                onClick={handleSendCode}>
                <div className="py-4 px-4 text-xl text-foreground">
                  {countdown > 0 ? `${countdown}s` : '重发'}
                </div>
              </button>
            </div>
            <button type="button" className="w-full flex items-center justify-center"
              onClick={() => { setStep('phone'); setCode('') }}>
              <span className="text-xl text-primary">更换手机号</span>
            </button>
          </div>
        )}

        {/* 分割线 */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xl text-muted-foreground">或</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* 微信登录 */}
        <button type="button"
          className="w-full flex items-center justify-center leading-none rounded-xl border-2 border-border bg-card"
          onClick={handleWechatLogin}>
          <div className="py-4 flex items-center gap-2">
            <div className="i-mdi-wechat text-2xl" style={{ color: '#07C160' }} />
            <span className="text-xl text-foreground">微信一键登录</span>
          </div>
        </button>
      </div>

      {/* 协议 */}
      <div className="px-6 pb-10">
        <div className="flex items-start gap-2" onClick={() => setAgreed(!agreed)}>
          <div className={`mt-1 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 ${agreed ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
            {agreed && <div className="i-mdi-check text-white text-sm" />}
          </div>
          <div className="flex flex-wrap gap-1 text-xl text-muted-foreground">
            <span>我已阅读并同意</span>
            <span className="text-primary">《用户服务协议》</span>
            <span>及</span>
            <span className="text-primary">《隐私政策》</span>
          </div>
        </div>
      </div>
    </div>
  )
}
