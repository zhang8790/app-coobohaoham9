import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

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
    // 登录后统一走根路径，由 RoleRouter 按角色分发
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

  // 统一输入框样式
  const inputStyle = {
    width: '100%', padding: '13px 16px', background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
    color: '#E5E7EB', fontSize: 15, outline: 'none',
    transition: 'all 0.2s', boxSizing: 'border-box' as const,
  }
  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#C2410C'
    e.target.style.boxShadow = '0 0 0 2px rgba(194,65,12,0.15)'
  }
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.08)'
    e.target.style.boxShadow = 'none'
  }
  const labelStyle = { color: '#9CA3AF', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }

  return (
    <div style={{
      minHeight: '100vh', background: '#0F0B19',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute', top: '-20%', left: '50%',
        transform: 'translateX(-50%)', width: 600, height: 600,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(194,65,12,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 居中登录卡 */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(17,20,30,0.85)',
        backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 20, padding: '48px 36px 36px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 100px rgba(194,65,12,0.05)',
      }}>
        {/* Logo + 品牌名 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginBottom: 16,
          }}>
            <div style={{
              width: 42, height: 42, background: 'linear-gradient(135deg, #C2410C, #EA580C)',
              borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 18px rgba(194,65,12,0.35)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
                />
              </svg>
            </div>
            <span style={{ color: '#F9FAFB', fontWeight: 700, fontSize: 20 }}>来店有喜</span>
          </div>
          <h1 style={{ color: '#F9FAFB', fontSize: 22, fontWeight: 700, margin: 0 }}>欢迎回来</h1>
          <p style={{ color: '#6B7280', fontSize: 14, marginTop: 6 }}>商家管理中心</p>
        </div>

        {/* 登录方式切换 */}
        <div style={{
          display: 'flex', gap: 0, background: 'rgba(15,23,42,0.6)',
          borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
          padding: 3, marginBottom: 28,
        }}>
          {([
            { key: 'password' as LoginMethod, label: '密码登录' },
            { key: 'otp' as LoginMethod, label: '验证码登录' },
            { key: 'email' as LoginMethod, label: '邮箱登录' },
          ]).map(m => (
            <button key={m.key} type="button" onClick={() => { setMethod(m.key); setErr('') }} style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              background: method === m.key ? '#C2410C' : 'transparent',
              border: 'none', color: method === m.key ? '#fff' : '#6B7280',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            }}>{m.label}</button>
          ))}
        </div>

        {/* === 密码表单 === */}
        {method === 'password' && (
          <form onSubmit={handlePwdSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>手机号码</label>
              <input type="tel" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入 11 位手机号" maxLength={11}
                style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>
            <div>
              <label style={labelStyle}>登录密码</label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="请输入密码"
                style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>

            {err && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                color: '#FCA5A5', fontSize: 13,
              }}>{err}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: loading ? '#7A2508' : 'linear-gradient(135deg, #C2410C, #EA580C)',
              border: 'none', borderRadius: 10, color: '#fff', fontSize: 15,
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', boxShadow: loading ? 'none' : '0 4px 20px rgba(194,65,12,0.3)',
              marginTop: 4,
            }}>{loading ? '登 录 中 ...' : '登 录'}</button>
          </form>
        )}

        {/* === 验证码表单 === */}
        {method === 'otp' && (
          <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>手机号码</label>
              <input type="tel" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入 11 位手机号" maxLength={11}
                style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>
            <div>
              <label style={labelStyle}>短信验证码</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input type="text" value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 位验证码" maxLength={6}
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                <button type="button" onClick={handleSendOtp}
                  disabled={otpSending || countdown > 0}
                  style={{
                    whiteSpace: 'nowrap', padding: '13px 16px',
                    background: countdown > 0 ? 'rgba(31,41,55,0.6)' : 'rgba(194,65,12,0.08)',
                    border: `1px solid ${countdown > 0 ? 'rgba(55,65,81,0.5)' : '#C2410C'}`,
                    borderRadius: 10, color: countdown > 0 ? '#6B7280' : '#C2410C',
                    fontSize: 13, fontWeight: 600,
                    cursor: (otpSending || countdown > 0) ? 'not-allowed' : 'pointer',
                    minWidth: 112, transition: 'all 0.2s',
                  }}
                >
                  {otpSending ? '发送中...' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
            </div>

            {err && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                color: '#FCA5A5', fontSize: 13,
              }}>{err}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: loading ? '#7A2508' : 'linear-gradient(135deg, #C2410C, #EA580C)',
              border: 'none', borderRadius: 10, color: '#fff', fontSize: 15,
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', boxShadow: loading ? 'none' : '0 4px 20px rgba(194,65,12,0.3)',
              marginTop: 4,
            }}>{loading ? '登 录 中 ...' : '登 录'}</button>
          </form>
        )}

        {/* === 邮箱表单 === */}
        {method === 'email' && (
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>邮箱地址</label>
              <input type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="请输入邮箱地址"
                style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>
            <div>
              <label style={labelStyle}>登录密码</label>
              <input type="password" value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)} placeholder="请输入密码"
                style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>

            {err && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                color: '#FCA5A5', fontSize: 13,
              }}>{err}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: loading ? '#7A2508' : 'linear-gradient(135deg, #C2410C, #EA580C)',
              border: 'none', borderRadius: 10, color: '#fff', fontSize: 15,
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', boxShadow: loading ? 'none' : '0 4px 20px rgba(194,65,12,0.3)',
              marginTop: 4,
            }}>{loading ? '登 录 中...' : '登 录'}</button>
          </form>
        )}

        {/* 底部 */}
        <p style={{ color: '#374151', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
          {method === 'email' ? '管理员邮箱：admin@laidianyouxi.com / Admin123456' : '测试账号：18701410500 / 123456'}
        </p>
      </div>
    </div>
  )
}
