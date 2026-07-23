import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { NavIcon } from './icons'

const NAV = [
  { to: '/dashboard', icon: 'grid', label: '仪表盘' },
  { to: '/merchants', icon: 'store', label: '自营门店' },
  { to: '/products', icon: 'box', label: '商品审阅' },
  { to: '/withdrawals', icon: 'dollar', label: '佣金兑付' },
  { to: '/ugc', icon: 'news', label: 'UGC管理' },
  { to: '/users', icon: 'user', label: '用户管理' },
  { to: '/refunds', icon: 'refund', label: '退款管理' },
  { to: '/announcements', icon: 'megaphone', label: '公告管理' },
  { to: '/emotion-claims', icon: 'shield', label: '确权治理' },
  { to: '/finance', icon: 'chart', label: '财务看板' },
  { to: '/members', icon: 'users', label: '会员明细' },
  { to: '/orders', icon: 'document', label: '成交订单' },
  { to: '/ledgers', icon: 'book', label: '资产流水' },
  { to: '/merchant-settlements', icon: 'bank', label: '货款结算' },
  { to: '/behavior', icon: 'trending', label: '行为分析' },
  { to: '/symptom-rules', icon: 'tea', label: '食疗规则库' },
  { to: '/marketing-templates', icon: 'chat', label: '导购话术库' },
  { to: '/self-stores', icon: 'building', label: '自营门店' },
  { to: '/commission-guide', icon: 'calculator', label: '佣金说明' },
]

// NavIcon 已抽到 ./icons 共享组件

export default function Layout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

  const handleSignOut = async () => {
    await signOut()
    nav('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 侧边栏 */}
      <aside style={{
        width: collapsed ? 64 : 220,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 16px' : '20px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', minHeight: 64 }}>
          <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          {!collapsed && (
            <div>
              <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>来电有喜</p>
              <p style={{ color: 'var(--primary)', fontSize: 11, marginTop: 2, fontWeight: 600 }}>管理后台</p>
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
                background: isActive ? 'var(--primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
                borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              })}
            >
              <NavIcon name={item.icon} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* 折叠按钮 */}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{ margin: '8px', padding: '8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}
        >
          {collapsed ? '→' : ' 收起'}
        </button>
      </aside>

      {/* 主区域 */}
      <div style={{ flex: 1, marginLeft: collapsed ? 64 : 220, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s', minHeight: '100vh' }}>
        {/* 顶部 Header */}
        <header style={{
          height: 64, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', position: 'sticky', top: 0, zIndex: 30,
        }}>
          {/* 模式指示器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: useMock ? 'var(--warning-soft)' : 'var(--success-soft)',
              color: useMock ? 'var(--warning)' : 'var(--success)',
              border: `1px solid ${useMock ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
            }}>
              {useMock ? 'Mock 模式' : '真实后端'}
            </span>
            {!useMock && (
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                需要禁用 RLS 才能访问数据
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, background: 'var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <NavIcon name="user" size={14} />
              </div>
              <div>
                <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, lineHeight: 1 }}>
                  {profile?.nickname || '管理员'}
                </p>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>超级管理员</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              退出
            </button>
          </div>
        </header>

        {/* 页面内容 */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
