import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { NavIcon } from './icons'

type NavItem = { to: string; icon: string; label: string }
type NavSection = { title: string; items: NavItem[] }

// 调试页（配料识别调试）仅开发态/显式开启时可见，避免运营在生产菜单看到开发工具
const SHOW_DEBUG = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEBUG === 'true'

const NAV_SECTIONS: NavSection[] = [
  {
    title: '运营管理',
    items: [
      { to: '/dashboard', icon: 'grid', label: '仪表盘' },
      { to: '/merchants', icon: 'store', label: '商家入驻审核' },
      { to: '/products', icon: 'box', label: '商品审阅' },
      { to: '/users', icon: 'user', label: '用户管理' },
      { to: '/refunds', icon: 'refund', label: '退款管理' },
      { to: '/announcements', icon: 'megaphone', label: '公告管理' },
      { to: '/orders', icon: 'document', label: '成交订单' },
      { to: '/expiry', icon: 'alert', label: '临期预警' },
      { to: '/members', icon: 'users', label: '会员明细' },
      { to: '/behavior', icon: 'trending', label: '行为分析' },
    ],
  },
  {
    title: '风控中心',
    items: [
      { to: '/risk', icon: 'shield-alert', label: '推广风控' },
    ],
  },
  {
    title: '财务中心',
    items: [
      { to: '/withdrawals', icon: 'dollar', label: '佣金兑付' },
      { to: '/finance', icon: 'chart', label: '财务看板' },
      { to: '/ledgers', icon: 'book', label: '资产流水' },
      { to: '/merchant-settlements', icon: 'bank', label: '货款结算' },
    ],
  },
  {
    title: '商品与内容',
    items: [
      { to: '/symptom-rules', icon: 'tea', label: '食疗规则库' },
      { to: '/food-safety-libs', icon: 'shield', label: '食品安全库' },
      { to: '/food-ingredients', icon: 'book', label: '食材库' },
      { to: '/food-tag-rules', icon: 'check', label: '人群标签规则' },
      { to: '/categories', icon: 'tag', label: '商品分类' },
    ],
  },
  {
    title: '小程序配置',
    items: [
      { to: '/home-branding', icon: 'image', label: '首页品牌' },
      { to: '/home-ads', icon: 'megaphone', label: '首页广告位' },
    ],
  },
  {
    title: '帮助',
    items: [
      { to: '/self-stores', icon: 'building', label: '门店与店长管理' },
      { to: '/commission-guide', icon: 'calculator', label: '佣金说明' },
    ],
  },
]

// 调试工具：仅在开发态或显式开启时挂到「商品与内容」组末尾
if (SHOW_DEBUG) {
  const contentGroup = NAV_SECTIONS.find(s => s.title === '商品与内容')
  if (contentGroup) {
    contentGroup.items.push({ to: '/ocr-debug', icon: 'image', label: '配料识别调试' })
  }
}

// 扁平化：path -> { section, label }，用于顶栏面包屑
const PATH_MAP: Record<string, { section: string; label: string }> = {}
NAV_SECTIONS.forEach(s => s.items.forEach(i => { PATH_MAP[i.to] = { section: s.title, label: i.label } }))
PATH_MAP['/settings'] = { section: '系统', label: '模型配置' }

function currentCrumb(pathname: string): { section: string; label: string } {
  if (PATH_MAP[pathname]) return PATH_MAP[pathname]
  // 兼容子路由：取最长前缀
  const keys = Object.keys(PATH_MAP).filter(k => k !== '/settings' && pathname.startsWith(k)).sort((a, b) => b.length - a.length)
  return keys.length ? PATH_MAP[keys[0]] : { section: '工作台', label: '管理后台' }
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

  const handleSignOut = async () => {
    await signOut()
    nav('/login')
  }

  const crumb = currentCrumb(location.pathname)

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
          <div style={{ width: 34, height: 34, background: 'var(--primary-strong)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p style={{ color: 'var(--text)', fontWeight: 'var(--fw-bold)', fontSize: 15, lineHeight: 1.1, whiteSpace: 'nowrap' }}>来店有喜</p>
              <p style={{ color: 'var(--primary-strong)', fontSize: 11, marginTop: 2, fontWeight: 600, whiteSpace: 'nowrap' }}>管理后台</p>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!collapsed && (
                <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, padding: '14px 12px 6px', letterSpacing: 1.2, margin: 0 }}>
                  {section.title}
                </p>
              )}
              {collapsed && <div style={{ height: 10 }} />}
              {section.items.map(item => (
                <NavLink key={item.to} to={item.to}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: collapsed ? '11px 0' : '10px 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--radius-md)',
                    background: isActive ? 'var(--primary-soft)' : 'transparent',
                    color: isActive ? 'var(--primary-strong)' : 'var(--text-muted)',
                    textDecoration: 'none', fontSize: 'var(--text-base)', fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                    transition: 'all var(--motion-fast) var(--ease-out)',
                    borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                    boxShadow: isActive ? 'inset 0 0 0 1px rgba(232,121,100,0.18)' : 'none',
                  })}
                >
                  <NavIcon name={item.icon} />
                  {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* 系统配置固定入口 */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <NavLink
            to="/settings"
            aria-label="模型配置"
            title={collapsed ? '模型配置' : undefined}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 11,
              padding: collapsed ? '11px 0' : '10px 12px', justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 'var(--radius-md)',
              background: isActive ? 'var(--primary-soft)' : 'transparent',
              color: isActive ? 'var(--primary-strong)' : 'var(--text-muted)',
              textDecoration: 'none', fontSize: 'var(--text-base)', fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-medium)',
              transition: 'all var(--motion-fast) var(--ease-out)',
              borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
            })}
          >
            <NavIcon name="calculator" />
            {!collapsed && <span>模型配置</span>}
          </NavLink>
        </div>

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
          {/* 面包屑 / 当前页标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <NavIcon name="grid" size={14} /> {crumb.section}
            </span>
            <span style={{ color: 'var(--border-strong)', fontSize: 'var(--text-sm)' }}>/</span>
            <span style={{ color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb.label}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: useMock ? 'var(--warning-soft)' : 'var(--success-soft)',
              color: useMock ? 'var(--warning)' : 'var(--success-strong)',
              border: `1px solid ${useMock ? 'rgba(217,135,10,0.3)' : 'rgba(21,163,74,0.3)'}`,
            }}>
              {useMock ? 'Mock 模式' : '真实后端'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <NavIcon name="user" size={15} />
              </div>
              <div>
                <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 'var(--fw-semibold)', lineHeight: 1 }}>
                  {profile?.nickname || '管理员'}
                </p>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>超级管理员</p>
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
