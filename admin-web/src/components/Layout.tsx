import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const NAV = [
  { to: '/dashboard', icon: '⬡', label: '仪表盘' },
  { to: '/merchants', icon: '🏪', label: '门派大典' },
  { to: '/products', icon: '📦', label: '宝贝审阅' },
  { to: '/withdrawals', icon: '💰', label: '银票兑付' },
  { to: '/ugc', icon: '📰', label: '武林贴管理' },
  { to: '/users', icon: '👤', label: '用户管理' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    nav('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B0F19' }}>
      {/* 侧边栏 */}
      <aside style={{
        width: collapsed ? 64 : 220,
        background: '#080C14',
        borderRight: '1px solid #1F2937',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 16px' : '20px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #1F2937', minHeight: 64 }}>
          <div style={{ width: 32, height: 32, background: '#C2410C', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          {!collapsed && (
            <div>
              <p style={{ color: '#E5E7EB', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>武林盟</p>
              <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>管理后台</p>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 14px' : '10px 12px',
                borderRadius: 8,
                background: isActive ? 'rgba(194,65,12,0.15)' : 'transparent',
                color: isActive ? '#C2410C' : '#9CA3AF',
                textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
                borderLeft: isActive ? '2px solid #C2410C' : '2px solid transparent',
              })}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* 折叠按钮 */}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{ margin: '8px', padding: '8px', background: 'transparent', border: '1px solid #1F2937', borderRadius: 6, color: '#6B7280', cursor: 'pointer', fontSize: 12 }}
        >
          {collapsed ? '→' : '← 收起'}
        </button>
      </aside>

      {/* 主区域 */}
      <div style={{ flex: 1, marginLeft: collapsed ? 64 : 220, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s', minHeight: '100vh' }}>
        {/* 顶部 Header */}
        <header style={{
          height: 64, background: '#080C14', borderBottom: '1px solid #1F2937',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 24px', gap: 16, position: 'sticky', top: 0, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: '#1F2937', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14 }}>👤</span>
            </div>
            <div>
              <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, lineHeight: 1 }}>
                {profile?.nickname || '管理员'}
              </p>
              <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>超级管理员</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', cursor: 'pointer', fontSize: 13 }}
          >
            退出
          </button>
        </header>

        {/* 页面内容 */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
