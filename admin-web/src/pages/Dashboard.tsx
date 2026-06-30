import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminStats, getRecentMerchants } from '@/api/admin'
import type { AdminStats, MerchantApplication } from '@/types'

const S = {
  card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12, padding: '20px 24px' } as React.CSSProperties,
  label: { color: '#9CA3AF', fontSize: 13, marginBottom: 6 } as React.CSSProperties,
  val: { color: '#E5E7EB', fontSize: 32, fontWeight: 700 } as React.CSSProperties,
  badge: (color: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${color}22`, color }),
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审', color: '#F59E0B' },
  approved: { label: '已通过', color: '#10B981' },
  rejected: { label: '已驳回', color: '#EF4444' },
}

export default function Dashboard() {
  const nav = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [recent, setRecent] = useState<MerchantApplication[]>([])

  useEffect(() => {
    getAdminStats().then(setStats)
    getRecentMerchants(5).then(setRecent)
  }, [])

  const CARDS = [
    { label: '待审商家', key: 'merchants', color: '#F59E0B', to: '/merchants', icon: '🏪' },
    { label: '待审商品', key: 'products', color: '#3B82F6', to: '/products', icon: '📦' },
    { label: '待审提现', key: 'withdrawals', color: '#C2410C', to: '/withdrawals', icon: '💰' },
    { label: '文章总数', key: 'articles', color: '#8B5CF6', to: '/ugc', icon: '📰' },
    { label: '用户总数', key: 'users', color: '#10B981', to: '/users', icon: '👤' },
    { label: '订单总数', key: 'orders', color: '#6B7280', to: '/dashboard', icon: '📋' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>仪表盘</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>平台关键数据总览</p>
      </div>

      {/* 数据卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {CARDS.map(c => (
          <div key={c.key} style={{ ...S.card, cursor: 'pointer', transition: 'border-color 0.15s' }}
            onClick={() => nav(c.to)}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = c.color)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#1F2937')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
            </div>
            <p style={S.label}>{c.label}</p>
            <p style={{ ...S.val, color: c.color }}>
              {stats ? (stats as unknown as Record<string, number>)[c.key] : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* 最新商家申请预览 */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 600 }}>最新商家申请</h2>
          <button onClick={() => nav('/merchants')}
            style={{ background: 'none', border: 'none', color: '#C2410C', fontSize: 13, cursor: 'pointer' }}>
            查看全部 →
          </button>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>暂无待审申请</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1F2937' }}>
                {['商家名称', '联系人', '类型', '申请时间', '状态'].map(h => (
                  <th key={h} style={{ color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '8px 12px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(r => {
                const st = STATUS_MAP[r.status] ?? { label: r.status, color: '#9CA3AF' }
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #1F2937' }}>
                    <td style={{ padding: '12px', color: '#E5E7EB', fontSize: 14, fontWeight: 500 }}>{r.store_name}</td>
                    <td style={{ padding: '12px', color: '#9CA3AF', fontSize: 14 }}>{r.contact_name}</td>
                    <td style={{ padding: '12px', color: '#9CA3AF', fontSize: 14 }}>{r.business_type}</td>
                    <td style={{ padding: '12px', color: '#6B7280', fontSize: 13 }}>{new Date(r.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={{ padding: '12px' }}><span style={S.badge(st.color)}>{st.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
