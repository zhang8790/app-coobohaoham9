import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { profile, signInWithEmail, signInAsAdmin, signInAsMerchant } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // profile 变化时自动跳转（登录成功）
  useEffect(() => {
    if (!profile) return
    const target = profile.role === 'admin' ? '/dashboard' : '/merchant'
    nav(target, { replace: true })
  }, [profile, nav])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setErr('请填写邮箱和密码'); return }
    setLoading(true); setErr('')
    const errMsg = await signInWithEmail(email, password)
    setLoading(false)
    if (errMsg) setErr(errMsg)
    // 跳转由 useEffect 处理
  }

  const handleAdminLogin = async () => {
    setLoading(true); setErr('')
    try {
      await signInAsAdmin()
      // 跳转由 useEffect 处理
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr('管理员登录失败：' + msg)
    } finally { setLoading(false) }
  }

  const handleMerchantLogin = async () => {
    setLoading(true); setErr('')
    try {
      await signInAsMerchant()
      // 跳转由 useEffect 处理
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr('商家登录失败：' + msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0F0B19' }}>
      {/* 左侧装饰 */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: 'linear-gradient(135deg, #080C14 0%, #0F172A 100%)', borderRight: '1px solid #1F2937' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 36, height: 36, background: '#C2410C', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <span style={{ color: '#E5E7EB', fontWeight: 700, fontSize: 18 }}>来店有喜 · 统一身份入口</span>
        </div>
        <div>
          <h1 style={{ color: '#E5E7EB', fontSize: 40, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            一个入口<br />
            <span style={{ color: '#C2410C' }}>两种身份</span>
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 16, lineHeight: 1.7 }}>
            平台管理员进入「总后台」管理全平台，<br />犒赏铺商家进入「商家中心」管理自有店铺。
          </p>
          <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: '👑', label: '总后台', desc: '平台超级管理员', color: '#C2410C' },
              { icon: '🏪', label: '犒赏铺', desc: '店铺商家管理', color: '#059669' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <div>
                  <span style={{ color: '#E5E7EB', fontWeight: 600 }}>{item.label}</span>
                  <span style={{ color: '#6B7280', marginLeft: 8, fontSize: 14 }}>{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ color: '#374151', fontSize: 13 }}>© 2025 来店有喜平台 · 统一身份管理系统</p>
      </div>

      {/* 右侧登录表单 */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ color: '#E5E7EB', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>统一登录</h2>
            <p style={{ color: '#9CA3AF', fontSize: 15 }}>请输入账号密码，或选择演示身份快速体验</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com 或 merchant@store.com"
                style={{
                  width: '100%', padding: '12px 16px', background: '#0F172A',
                  border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB',
                  fontSize: 15, outline: 'none',
                }}
                onFocus={e => (e.target.style.borderColor = '#C2410C')}
                onBlur={e => (e.target.style.borderColor = '#1F2937')}
              />
            </div>

            <div>
              <label style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                登录密码
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '12px 16px', background: '#0F172A',
                  border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB',
                  fontSize: 15, outline: 'none',
                }}
                onFocus={e => (e.target.style.borderColor = '#C2410C')}
                onBlur={e => (e.target.style.borderColor = '#1F2937')}
              />
            </div>

            {err && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#EF4444', fontSize: 14 }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px', background: loading ? '#7A2508' : '#C2410C',
                border: 'none', borderRadius: 8, color: '#fff', fontSize: 16,
                fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? '登录中...' : '登  录'}
            </button>

            {/* 演示模式一键登录 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleAdminLogin}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', background: 'transparent',
                  border: '1px solid #C2410C', borderRadius: 8, color: '#C2410C', fontSize: 14,
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                👑 总后台演示
              </button>
              <button
                type="button"
                onClick={handleMerchantLogin}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', background: 'transparent',
                  border: '1px solid #059669', borderRadius: 8, color: '#059669', fontSize: 14,
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                🏪 犒赏铺演示
              </button>
            </div>
          </form>

          <p style={{ color: '#4B5563', fontSize: 13, marginTop: 32, textAlign: 'center' }}>
            演示模式：无需真实账号，点击上方按钮快速体验不同身份后台
          </p>
        </div>
      </div>
    </div>
  )
}
