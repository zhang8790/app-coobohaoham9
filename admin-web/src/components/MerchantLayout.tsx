import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const MERCHANT_NAV = [
  { to: '/merchant', icon: '⬡', label: '店铺概况' },
  { to: '/merchant/products', icon: '📦', label: '商品管理' },
  { to: '/merchant/orders', icon: '📋', label: '订单管理' },
  { to: '/merchant/members', icon: '👥', label: '会员管理' },
  { to: '/merchant/coupons', icon: '🎟️', label: '优惠券' },
  { to: '/merchant/analytics', icon: '📊', label: '数据分析' },
  { to: '/merchant/ads', icon: '📢', label: '广告管理' },
  { to: '/merchant/messages', icon: '🔔', label: '消息通知' },
  { to: '/merchant/withdraw', icon: '💰', label: '佣金提现' },
  { to: '/merchant/emotion-studio', icon: '🎭', label: '情绪工作台' },
  { to: '/merchant/emotion-funnel', icon: '📈', label: '情绪漏斗' },
]

export default function MerchantLayout() {
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
          <div style={{ width: 32, height: 32, background: '#059669', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: 'white', fontSize: 16 }}>🏪</span>
          </div>
          {!collapsed && (
            <div>
              <p style={{ color: '#E5E7EB', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>商家中心</p>
              <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>来店有喜</p>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {MERCHANT_NAV.map(item => (
            <NavLink key={item.to} to={item.to}
              end={item.to === '/merchant'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 14px' : '10px 12px',
                borderRadius: 8,
                background: isActive ? 'rgba(5,150,105,0.15)' : 'transparent',
                color: isActive ? '#059669' : '#9CA3AF',
                textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
                borderLeft: isActive ? '2px solid #059669' : '2px solid transparent',
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
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', position: 'sticky', top: 0, zIndex: 30,
        }}>
          <h1 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>商家管理后台</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, background: '#1F2937', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14 }}>🏪</span>
              </div>
              <div>
                <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, lineHeight: 1 }}>
                  {profile?.nickname || '商家'}
                </p>
                <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>商家账号</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', cursor: 'pointer', fontSize: 13 }}
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
