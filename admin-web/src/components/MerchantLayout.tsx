import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const MERCHANT_NAV_GROUPS = [
  {
    title: '日常运营',
    items: [
      { to: '/merchant', icon: '⬡', label: '店铺概况' },
      { to: '/merchant/products', icon: '📦', label: '商品管理' },
      { to: '/merchant/orders', icon: '📋', label: '订单管理' },
      { to: '/merchant/members', icon: '👥', label: '会员管理' },
      { to: '/merchant/coupons', icon: '🎟️', label: '优惠券' },
      { to: '/merchant/analytics', icon: '📊', label: '数据分析' },
      { to: '/merchant/messages', icon: '🔔', label: '消息通知' },
      { to: '/merchant/withdraw', icon: '💰', label: '货款提现' },
      { to: '/merchant/printers', icon: '🖨️', label: '小票打印' },
    ],
  },
  {
    title: '进阶设置',
    items: [
      { to: '/merchant/ads', icon: '📢', label: '营销活动' },
      { to: '/merchant/vehicles', icon: '🚚', label: '流动车' },
      { to: '/merchant/staff', icon: '🤝', label: '运营成员' },
      { to: '/merchant/settings', icon: '⚙️', label: '店铺设置' },
    ],
  },
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
          <div style={{ width: 32, height: 32, background: 'var(--success-strong)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: 'white', fontSize: 16 }}>🏪</span>
          </div>
          {!collapsed && (
            <div>
              <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>自营门店中心</p>
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>来电有喜</p>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {MERCHANT_NAV_GROUPS.map(group => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {collapsed ? (
                <div style={{ height: 10 }} />
              ) : (
                <div style={{ padding: '12px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  {group.title}
                </div>
              )}
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to}
                  end={item.to === '/merchant'}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: collapsed ? '10px 14px' : '10px 12px',
                    borderRadius: 8,
                    background: isActive ? 'rgba(5,150,105,0.15)' : 'transparent',
                    color: isActive ? 'var(--success-strong)' : 'var(--text-muted)',
                    textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.15s',
                    borderLeft: isActive ? '2px solid var(--success-strong)' : '2px solid transparent',
                  })}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
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
          <h1 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>自营门店管理后台</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, background: 'var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14 }}>🏪</span>
              </div>
              <div>
                <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, lineHeight: 1 }}>
                  {profile?.nickname || '自营门店'}
                </p>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>自营门店账号</p>
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
