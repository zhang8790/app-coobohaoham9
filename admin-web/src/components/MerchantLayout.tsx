import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/contexts/StoreContext'

const MERCHANT_NAV_GROUPS = [
  {
    title: '日常运营',
    items: [
      { to: '/merchant', icon: 'grid', label: '店铺概况' },
      { to: '/merchant/products', icon: 'box', label: '商品管理' },
      { to: '/merchant/orders', icon: 'document', label: '订单管理' },
      { to: '/merchant/members', icon: 'users', label: '会员管理' },
      { to: '/merchant/analytics', icon: 'chart', label: '数据分析' },
      { to: '/merchant/messages', icon: 'bell', label: '消息通知' },
      { to: '/merchant/withdraw', icon: 'dollar', label: '货款提现' },
      { to: '/merchant/coupons', icon: 'coupon', label: '优惠券' },
      { to: '/merchant/ads', icon: 'megaphone', label: '广告投放' },
      { to: '/merchant/printers', icon: 'print', label: '小票打印' },
      { to: '/merchant/barcode-maker', icon: 'tag', label: '条形码制作' },
    ],
  },
  {
    title: '进阶设置',
    items: [
      { to: '/merchant/vehicles', icon: 'truck', label: '流动车' },
      { to: '/merchant/staff', icon: 'user', label: '运营成员' },
      { to: '/merchant/settings', icon: 'settings', label: '店铺设置' },
    ],
  },
]

// 顶栏面包屑
const MERCHANT_PATH_MAP: Record<string, { section: string; label: string }> = {}
MERCHANT_NAV_GROUPS.forEach(g => g.items.forEach(i => { MERCHANT_PATH_MAP[i.to] = { section: g.title, label: i.label } }))
function merchantCrumb(pathname: string) {
  if (MERCHANT_PATH_MAP[pathname]) return MERCHANT_PATH_MAP[pathname]
  const keys = Object.keys(MERCHANT_PATH_MAP).filter(k => pathname.startsWith(k)).sort((a, b) => b.length - a.length)
  return keys.length ? MERCHANT_PATH_MAP[keys[0]] : { section: '工作台', label: '自营门店中心' }
}

function StoreSwitcher() {
  const { stores, selectedStoreId, setSelectedStore, loading } = useStore()
  const [open, setOpen] = useState(false)
  if (loading) return <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>门店加载中…</span>
  if (!stores.length) return <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>未关联门店</span>
  const current = stores.find(s => s.id === selectedStoreId) ?? stores[0]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)',
        }}
      >
        <span style={{ fontSize: 15 }}>🏪</span>
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.name}</span>
        {stores.length > 1 && <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 2 }}>▾</span>}
      </button>
      {open && stores.length > 1 && (
        <div style={{
          position: 'absolute', top: 46, right: 0, zIndex: 60, minWidth: 220, maxHeight: 320, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 6,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: 1 }}>
            切换门店（{stores.length}）
          </div>
          {stores.map(s => {
            const active = s.id === selectedStoreId
            return (
              <div
                key={s.id}
                onMouseDown={() => { setSelectedStore(s.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '9px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 'var(--text-base)',
                  background: active ? 'var(--success-soft)' : 'transparent',
                  color: active ? 'var(--success-strong)' : 'var(--text)', fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-regular)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ flexShrink: 0, fontSize: 11, color: s.is_platform ? 'var(--warning)' : 'var(--text-dim)' }}>
                  {s.is_platform ? '自营' : '门店'}{active ? ' ✓' : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MerchantLayout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    nav('/login')
  }
  const crumb = merchantCrumb(location.pathname)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 侧边栏 */}
      <aside style={{
        width: collapsed ? 72 : 236,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s var(--ease-out)',
        flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 40,
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '0 16px' : '0 20px', display: 'flex', alignItems: 'center', gap: 11, borderBottom: '1px solid var(--border)', height: 64, flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ width: 34, height: 34, background: 'var(--success-strong)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: 'white', fontSize: 17 }}>🏪</span>
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p style={{ color: 'var(--text)', fontWeight: 'var(--fw-bold)', fontSize: 15, lineHeight: 1.1, whiteSpace: 'nowrap' }}>自营门店中心</p>
              <p style={{ color: 'var(--success-strong)', fontSize: 11, marginTop: 2, fontWeight: 600, whiteSpace: 'nowrap' }}>来店有喜</p>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {MERCHANT_NAV_GROUPS.map(group => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!collapsed && (
                <div style={{ padding: '14px 12px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: 1.2 }}>
                  {group.title}
                </div>
              )}
              {collapsed && <div style={{ height: 8 }} />}
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to}
                  end={item.to === '/merchant'}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: collapsed ? '11px 0' : '10px 12px', justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--radius-md)',
                    background: isActive ? 'var(--success-soft)' : 'transparent',
                    color: isActive ? 'var(--success-strong)' : 'var(--text-muted)',
                    textDecoration: 'none', fontSize: 'var(--text-base)', fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                    transition: 'all var(--motion-fast) var(--ease-out)',
                    borderLeft: isActive ? '3px solid var(--success-strong)' : '3px solid transparent',
                    boxShadow: isActive ? 'inset 0 0 0 1px rgba(21,163,74,0.18)' : 'none',
                  })}
                >
                  <span style={{ fontSize: 17, flexShrink: 0, display: 'inline-flex' }}><NavIcon name={item.icon} /></span>
                  {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* 折叠按钮 */}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{ margin: '8px 12px 12px', padding: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}
        >
          {collapsed ? '»' : '« 收起'}
        </button>
      </aside>

      {/* 主区域 */}
      <div style={{ flex: 1, marginLeft: collapsed ? 72 : 236, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s var(--ease-out)', minHeight: '100vh' }}>
        {/* 顶部 Header */}
        <header style={{
          height: 64, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', position: 'sticky', top: 0, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <NavIcon name="store" size={14} /> {crumb.section}
            </span>
            <span style={{ color: 'var(--border-strong)', fontSize: 'var(--text-sm)' }}>/</span>
            <span style={{ color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb.label}</span>
          </div>
          <StoreSwitcher />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14 }}>🏪</span>
              </div>
              <div>
                <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 'var(--fw-semibold)', lineHeight: 1 }}>
                  {profile?.nickname || '自营门店'}
                </p>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>自营门店账号</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{ padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
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

// 局部图标映射（避免引入 icons 全量，仅取商家端用到的）
function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const ICONS: Record<string, string> = {
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    box: 'M21 16V8l-9-5-9 5v8l9 5zM3.3 7L12 12l8.7-5M12 22V12',
    document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    chart: 'M3 3v18h18M7 16l4-5 4 3 5-7',
    megaphone: 'M3 11l18-5v12L3 13zM11.6 16.8a3 3 0 1 1-5.8-1.6',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
    coupon: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z',
    dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
    tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
    truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    store: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
  }
  const d = ICONS[name] ?? ICONS.grid
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
