import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminStats, getRecentMerchants, testConnection } from '@/api/admin'
import { useAuth } from '@/contexts/AuthContext'
import type { AdminStats, MerchantApplication } from '@/types'
import { NavIcon } from '@/components/icons'

// Mock 数据
const MOCK_STATS: AdminStats = {
  merchants: 3, products: 5, withdrawals: 2, articles: 3, users: 8, orders: 12,
}
const MOCK_RECENT: MerchantApplication[] = [
  { id: 'm1', user_id: 'u1', store_name: '霸王茶姬（旗舰店）', contact_name: '张三', contact_phone: '13800138001', business_type: '餐饮', description: '头部新中式茶饮品牌', status: 'pending', reject_reason: null, created_at: new Date().toISOString() },
  { id: 'm2', user_id: 'u2', store_name: '瑞幸咖啡（科技园店）', contact_name: '李四', contact_phone: '13800138002', business_type: '餐饮', description: '知名连锁咖啡品牌', status: 'approved', reject_reason: null, created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'm3', user_id: 'u3', store_name: '名创优品（万达店）', contact_name: '王五', contact_phone: '13800138003', business_type: '零售', description: '生活好物集合店', status: 'pending', reject_reason: null, created_at: new Date(Date.now()-2*864e5).toISOString() },
]

const S = {
  card: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' } as React.CSSProperties,
  label: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 } as React.CSSProperties,
  val: { color: 'var(--text)', fontSize: 32, fontWeight: 700 } as React.CSSProperties,
  badge: (color: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${color}22`, color }),
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审', color: 'var(--warning)' },
  approved: { label: '已通过', color: 'var(--success-strong)' },
  rejected: { label: '已驳回', color: 'var(--danger)' },
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
    { label: '待审商家', key: 'merchants', color: 'var(--warning)', to: '/merchants', icon: 'store' },
    { label: '待审商品', key: 'products', color: 'var(--info)', to: '/products', icon: 'box' },
    { label: '待审提现', key: 'withdrawals', color: 'var(--primary)', to: '/withdrawals', icon: 'dollar' },
    { label: '文章总数', key: 'articles', color: 'var(--accent)', to: '/ugc', icon: 'news' },
    { label: '用户总数', key: 'users', color: 'var(--success-strong)', to: '/users', icon: 'user' },
    { label: '订单总数', key: 'orders', color: 'var(--text-dim)', to: '/dashboard', icon: 'document' },
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
            ? 'var(--success-soft)' : connStatus === 'real_fail'
            ? 'var(--danger-soft)' : 'rgba(107,114,128,0.1)',
          border: `1px solid ${
            connStatus === 'real_ok' ? 'rgba(16,185,129,0.3)' : connStatus === 'real_fail'
            ? 'rgba(239,68,68,0.3)' : 'rgba(107,114,128,0.3)'
          }`,
        }}>
          {connStatus !== 'testing' && (
            <NavIcon name={connStatus === 'real_ok' ? 'check' : 'alert'} size={18} style={{ color: connStatus === 'real_ok' ? 'var(--success-strong)' : 'var(--danger)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 2 }}>
              {connStatus === 'testing' && '正在检测后端连接...'}
              {connStatus === 'real_ok' && '已连接真实后端'}
              {connStatus === 'real_fail' && '真实后端连接失败'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {connStatus === 'testing' && '请稍候...'}
              {connStatus === 'real_ok' && connMsg}
              {connStatus === 'real_fail' && (
                <>
                  {connMsg}
                  {connMsg.includes('RLS') && (
                    <> — 请在 Supabase Dashboard 执行 <code style={{ background: 'var(--border)', padding: '1px 4px', borderRadius: 3 }}>supabase/disable_rls_dev.sql</code></>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>仪表盘</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>平台关键数据总览</p>
      </div>

      {/* 数据卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {CARDS.map(c => (
          <div key={c.key} style={{ ...S.card, cursor: 'pointer', transition: 'border-color 0.15s' }}
            onClick={() => nav(c.to)}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = c.color)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <NavIcon name={c.icon} size={22} style={{ color: c.color }} />
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
          <h2 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>最新商家申请</h2>
          <button onClick={() => nav('/merchants')}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, cursor: 'pointer' }}>
            查看全部 →
          </button>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>暂无待审申请</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['商家名称', '联系人', '类型', '申请时间', '状态'].map(h => (
                  <th key={h} style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '8px 12px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(r => {
                const st = STATUS_MAP[r.status] ?? { label: r.status, color: 'var(--text-muted)' }
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{r.store_name}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 14 }}>{r.contact_name}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 14 }}>{r.business_type}</td>
                    <td style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 13 }}>{new Date(r.created_at).toLocaleDateString('zh-CN')}</td>
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
