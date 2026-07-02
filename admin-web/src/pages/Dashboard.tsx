import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminStats, getRecentMerchants, testConnection } from '@/api/admin'
import { useAuth } from '@/contexts/AuthContext'
import type { AdminStats, MerchantApplication } from '@/types'

// Mock 数据
const MOCK_STATS: AdminStats = {
  merchants: 3, products: 5, withdrawals: 2, articles: 3, users: 8, orders: 12,
}
const MOCK_RECENT: MerchantApplication[] = [
  { id: 'm1', user_id: 'u1', store_name: '霸王茶姬（旗舰店）', contact_name: '张三', business_type: '餐饮', status: 'pending', created_at: new Date().toISOString() },
  { id: 'm2', user_id: 'u2', store_name: '瑞幸咖啡（科技园店）', contact_name: '李四', business_type: '餐饮', status: 'approved', created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'm3', user_id: 'u3', store_name: '名创优品（万达店）', contact_name: '王五', business_type: '零售', status: 'pending', created_at: new Date(Date.now()-2*864e5).toISOString() },
]

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

type ConnStatus = 'testing' | 'real_ok' | 'real_fail' | 'mock'

export default function Dashboard() {
  const nav = useNavigate()
  const { useMock } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [recent, setRecent] = useState<MerchantApplication[]>([])
  const [connStatus, setConnStatus] = useState<ConnStatus>('testing')
  const [connMsg, setConnMsg] = useState('')

  useEffect(() => {
    // 检测后端连接
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setConnStatus('mock')
      setConnMsg('')
    } else {
      setConnStatus('testing')
      testConnection()
        .then(r => {
          if (r.ok) {
            setConnStatus('real_ok')
            setConnMsg(r.message)
          } else {
            setConnStatus('real_fail')
            setConnMsg(r.message)
          }
        })
        .catch(e => {
          setConnStatus('real_fail')
          setConnMsg(String(e))
        })
    }
  }, [])

  useEffect(() => {
    if (useMock) {
      setStats(MOCK_STATS)
      setRecent(MOCK_RECENT)
      return
    }
    getAdminStats().then(setStats).catch(() => setStats(MOCK_STATS))
    getRecentMerchants(5).then(setRecent).catch(() => setRecent(MOCK_RECENT))
  }, [useMock])

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
      {/* 连接状态提示 */}
      {connStatus !== 'mock' && (
        <div style={{
          padding: '12px 20px',
          borderRadius: 8,
          fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 12,
          background: connStatus === 'real_ok'
            ? 'rgba(16,185,129,0.1)' : connStatus === 'real_fail'
            ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)',
          border: `1px solid ${
            connStatus === 'real_ok' ? 'rgba(16,185,129,0.3)' : connStatus === 'real_fail'
            ? 'rgba(239,68,68,0.3)' : 'rgba(107,114,128,0.3)'
          }`,
        }}>
          <span style={{ fontSize: 16 }}>
            {connStatus === 'testing' ? '⏳' : connStatus === 'real_ok' ? '✅' : '⚠️'}
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 2 }}>
              {connStatus === 'testing' && '正在检测后端连接...'}
              {connStatus === 'real_ok' && '已连接真实后端'}
              {connStatus === 'real_fail' && '真实后端连接失败'}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }}>
              {connStatus === 'testing' && '请稍候...'}
              {connStatus === 'real_ok' && connMsg}
              {connStatus === 'real_fail' && (
                <>
                  {connMsg}
                  {connMsg.includes('RLS') && (
                    <> — 请在 Supabase Dashboard 执行 <code style={{ background: '#1F2937', padding: '1px 4px', borderRadius: 3 }}>supabase/disable_rls_dev.sql</code></>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      )}

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
