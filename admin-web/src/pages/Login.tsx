import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Segmented, Field, PrimaryButton, inputBase } from '@/components/ui'

type LoginMethod = 'password' | 'otp' | 'email'

export default function Login() {
  const { profile, signInWithPhonePassword, signInWithPhone, sendOtpCode, signInWithEmail } = useAuth()
  const nav = useNavigate()
  const [method, setMethod] = useState<LoginMethod>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!profile) return
    nav('/', { replace: true })
  }, [profile, nav])

  useEffect(() => {
    if (countdown <= 0) { if (timerRef.current) clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [countdown])

  const handlePwdSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone) { setErr('请输入手机号'); return }
    if (phone.length !== 11) { setErr('手机号格式不正确'); return }
    if (!password) { setErr('请输入密码'); return }
    setLoading(true); setErr('')
    const errMsg = await signInWithPhonePassword(phone, password)
    setLoading(false)
    if (errMsg) setErr(errMsg)
  }

  const handleSendOtp = async () => {
    if (!phone) { setErr('请输入手机号'); return }
    if (phone.length !== 11) { setErr('手机号格式不正确'); return }
    setOtpSending(true); setErr('')
    const errMsg = await sendOtpCode(phone)
    setOtpSending(false)
    if (errMsg) { setErr(errMsg); return }
    setCountdown(60)
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || !otpCode) { setErr('请填写手机号和验证码'); return }
    setLoading(true); setErr('')
    const errMsg = await signInWithPhone(phone, otpCode)
    setLoading(false)
    if (errMsg) setErr(errMsg)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setErr('请输入邮箱'); return }
    if (!emailPassword) { setErr('请输入密码'); return }
    setLoading(true); setErr('')
    const errMsg = await signInWithEmail(email, emailPassword)
    setLoading(false)
    if (errMsg) setErr(errMsg)
  }

  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--primary)'
    e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'
  }
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--border-strong)'
    e.target.style.boxShadow = 'none'
  }

  return (
    <div style={{
      minHeight: '100vh', background:
        'radial-gradient(1200px 600px at 50% -10%, var(--primary-soft) 0%, transparent 60%), var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* 登录卡 */}
      <div style={{
        width: '100%', maxWidth: 408,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', padding: '40px 36px 32px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Logo + 品牌名 */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, marginBottom: 14,
            background: 'var(--primary-strong)', borderRadius: 12,
            boxShadow: 'var(--shadow-primary)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 'var(--fw-bold)', margin: 0 }}>来店有喜 · 管理后台</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 6 }}>欢迎回来，请登录您的账户</p>
        </div>

        {/* 登录方式切换 */}
        <div style={{ marginBottom: 24 }}>
          <Segmented
            value={method}
            onChange={(v) => { setMethod(v); setErr('') }}
            options={[
              { key: 'password', label: '密码登录' },
              { key: 'otp', label: '验证码登录' },
              { key: 'email', label: '邮箱登录' },
            ]}
          />
        </div>

        {/* === 密码表单 === */}
        {method === 'password' && (
          <form onSubmit={handlePwdSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="手机号码">
              <input type="tel" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入 11 位手机号" maxLength={11}
                style={inputBase} onFocus={focusHandler} onBlur={blurHandler} />
            </Field>
            <Field label="登录密码">
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="请输入密码"
                style={inputBase} onFocus={focusHandler} onBlur={blurHandler} />
            </Field>
            {err && <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 'var(--radius-md)', color: 'var(--danger-text)', fontSize: 13 }}>{err}</div>}
            <PrimaryButton type="submit" loading={loading} fullWidth>{loading ? '登 录 中 ...' : '登 录'}</PrimaryButton>
          </form>
        )}

        {/* === 验证码表单 === */}
        {method === 'otp' && (
          <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="手机号码">
              <input type="tel" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入 11 位手机号" maxLength={11}
                style={inputBase} onFocus={focusHandler} onBlur={blurHandler} />
            </Field>
            <Field label="短信验证码">
              <div style={{ display: 'flex', gap: 10 }}>
                <input type="text" value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 位验证码" maxLength={6}
                  style={{ ...inputBase, flex: 1 }}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                <button type="button" onClick={handleSendOtp}
                  disabled={otpSending || countdown > 0}
                  style={{
                    whiteSpace: 'nowrap', padding: '11px 16px',
                    background: countdown > 0 ? 'var(--surface-2)' : 'var(--primary-soft)',
                    border: `1px solid ${countdown > 0 ? 'var(--border)' : 'var(--primary)'}`,
                    borderRadius: 'var(--radius-md)', color: countdown > 0 ? 'var(--text-dim)' : 'var(--primary-strong)',
                    fontSize: 13, fontWeight: 'var(--fw-semibold)',
                    cursor: (otpSending || countdown > 0) ? 'not-allowed' : 'pointer', minWidth: 116,
                  }}
                >
                  {otpSending ? '发送中...' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
            </Field>
            {err && <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 'var(--radius-md)', color: 'var(--danger-text)', fontSize: 13 }}>{err}</div>}
            <PrimaryButton type="submit" loading={loading} fullWidth>{loading ? '登 录 中 ...' : '登 录'}</PrimaryButton>
          </form>
        )}

        {/* === 邮箱表单 === */}
        {method === 'email' && (
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="邮箱地址">
              <input type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="请输入邮箱地址"
                style={inputBase} onFocus={focusHandler} onBlur={blurHandler} />
            </Field>
            <Field label="登录密码">
              <input type="password" value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)} placeholder="请输入密码"
                style={inputBase} onFocus={focusHandler} onBlur={blurHandler} />
            </Field>
            {err && <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 'var(--radius-md)', color: 'var(--danger-text)', fontSize: 13 }}>{err}</div>}
            <PrimaryButton type="submit" loading={loading} fullWidth>{loading ? '登 录 中 ...' : '登 录'}</PrimaryButton>
          </form>
        )}

        <p style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', marginTop: 18 }}>
          {method === 'email' ? '请使用管理员账号登录（role=admin）' : '请联系管理员获取账号权限'}
        </p>
      </div>
    </div>
  )
}
