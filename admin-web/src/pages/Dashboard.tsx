import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminStats, getRecentMerchants, getTodoCounts, testConnection, type TodoCounts } from '@/api/admin'
import { useAuth } from '@/contexts/AuthContext'
import type { AdminStats, MerchantApplication } from '@/types'
import { NavIcon } from '@/components/icons'
import { Card, PageHeader, StatCard } from '@/components/ui'

// Mock 数据
const MOCK_STATS: AdminStats = {
  merchants: 3, products: 5, withdrawals: 2, users: 8, orders: 12,
}
const MOCK_RECENT: MerchantApplication[] = [
  { id: 'm1', user_id: 'u1', store_name: '霸王茶姬（旗舰店）', contact_name: '张三', contact_phone: '13800138001', business_type: '餐饮', description: '头部新中式茶饮品牌', status: 'pending', reject_reason: null, created_at: new Date().toISOString() },
  { id: 'm2', user_id: 'u2', store_name: '瑞幸咖啡（科技园店）', contact_name: '李四', contact_phone: '13800138002', business_type: '餐饮', description: '知名连锁咖啡品牌', status: 'approved', reject_reason: null, created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'm3', user_id: 'u3', store_name: '名创优品（万达店）', contact_name: '王五', contact_phone: '13800138003', business_type: '零售', description: '生活好物集合店', status: 'pending', reject_reason: null, created_at: new Date(Date.now()-2*864e5).toISOString() },
]

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
  const [todo, setTodo] = useState<TodoCounts | null>(null)
  const [recent, setRecent] = useState<MerchantApplication[]>([])
  const [connStatus, setConnStatus] = useState<ConnStatus>('testing')
  const [connMsg, setConnMsg] = useState('')

  useEffect(() => {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setConnStatus('mock')
      setConnMsg('')
    } else {
      setConnStatus('testing')
      testConnection()
        .then(r => {
          if (r.ok) { setConnStatus('real_ok'); setConnMsg(r.message) }
          else { setConnStatus('real_fail'); setConnMsg(r.message) }
        })
        .catch(e => { setConnStatus('real_fail'); setConnMsg(String(e)) })
    }
  }, [])

  useEffect(() => {
    if (useMock) {
      setStats(MOCK_STATS)
      setRecent(MOCK_RECENT)
      setTodo({ merchantApps: 2, products: 3, withdrawals: 1, refunds: 0, expiry: 4 })
      return
    }
    getAdminStats().then(setStats).catch(() => setStats(MOCK_STATS))
    getRecentMerchants(5).then(setRecent).catch(() => setRecent(MOCK_RECENT))
    getTodoCounts().then(setTodo).catch(() => setTodo(null))
  }, [useMock])

  // 待办事项：可点击直达处理页；数量 >0 时用告警色高亮
  const TODO_CARDS = [
    { label: '待审商家申请', key: 'merchantApps', color: 'var(--warning)', to: '/merchants', icon: 'store' },
    { label: '待审商品', key: 'products', color: 'var(--info)', to: '/products', icon: 'box' },
    { label: '待付佣金提现', key: 'withdrawals', color: 'var(--primary)', to: '/withdrawals', icon: 'dollar' },
    { label: '待处理退款', key: 'refunds', color: 'var(--danger)', to: '/refunds', icon: 'refund' },
    { label: '临期预警', key: 'expiry', color: 'var(--warning)', to: '/expiry', icon: 'alert' },
  ] as const

  const STAT_CARDS = [
    { label: '用户总数', key: 'users', color: 'var(--success-strong)', to: '/users', icon: 'user' },
    { label: '订单总数', key: 'orders', color: 'var(--text-dim)', to: '/orders', icon: 'document' },
  ] as const

  const todoTotal = todo ? Object.values(todo).reduce((s, v) => s + v, 0) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="仪表盘"
        subtitle="平台关键数据总览"
        breadcrumb={<><NavIcon name="grid" size={13} /> 运营管理</>}
        extra={connStatus === 'mock' ? (
          <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid rgba(217,135,10,0.3)' }}>Mock 模式</span>
        ) : connStatus === 'real_ok' ? (
          <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--success-soft)', color: 'var(--success-strong)', border: '1px solid rgba(21,163,74,0.3)' }}>已连接真实后端</span>
        ) : connStatus === 'real_fail' ? (
          <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--danger-soft)', color: 'var(--danger-text)', border: '1px solid rgba(220,38,38,0.3)' }}>后端连接失败</span>
        ) : undefined}
      />

      {/* 后端连接状态条（非 Mock 时展示真实后端返回信息） */}
      {connStatus !== 'mock' && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 10,
          background: connStatus === 'real_ok' ? 'var(--success-soft)' : connStatus === 'real_fail' ? 'var(--danger-soft)' : 'var(--surface-2)',
          border: `1px solid ${
            connStatus === 'real_ok' ? 'rgba(21,163,74,0.25)' : connStatus === 'real_fail' ? 'rgba(220,38,38,0.25)' : 'var(--border)'
          }`,
        }}>
          <NavIcon name={connStatus === 'real_ok' ? 'check' : connStatus === 'real_fail' ? 'alert' : 'grid'} size={16}
            style={{ color: connStatus === 'real_ok' ? 'var(--success-strong)' : connStatus === 'real_fail' ? 'var(--danger-text)' : 'var(--text-dim)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text)', fontWeight: 'var(--fw-semibold)' }}>
            {connStatus === 'testing' && '正在检测后端连接...'}
            {connStatus === 'real_ok' && '已连接真实后端'}
            {connStatus === 'real_fail' && '真实后端连接失败'}
          </span>
          {connMsg && <span style={{ color: 'var(--text-muted)' }}>— {connMsg}</span>}
        </div>
      )}

      {/* 待办事项 */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', margin: 0 }}>待办事项</h2>
          {todoTotal > 0 && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)', background: 'var(--danger-soft)', padding: '2px 10px', borderRadius: 999 }}>
              共 {todoTotal} 项待处理
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
          {TODO_CARDS.map(c => {
            const n = todo ? (todo as unknown as Record<string, number>)[c.key] : null
            const hot = (n ?? 0) > 0
            return (
              <StatCard key={c.key} icon={<NavIcon name={c.icon} size={22} />} label={c.label} value={n === null ? '—' : n} color={c.color} hot={hot} onClick={() => nav(c.to)} />
            )
          })}
        </div>
      </section>

      {/* 数据总览 */}
      <section>
        <h2 style={{ color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', marginBottom: 12 }}>数据总览</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
          {STAT_CARDS.map(c => (
            <StatCard key={c.key} icon={<NavIcon name={c.icon} size={22} />} label={c.label} value={stats ? (stats as unknown as Record<string, number>)[c.key] : '—'} color={c.color} onClick={() => nav(c.to)} />
          ))}
        </div>
      </section>

      {/* 最新自营门店申请预览 */}
      <Card
        title="最新自营门店申请"
        action={<button onClick={() => nav('/merchants')} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--primary-strong)', fontSize: 13, padding: '6px 12px', cursor: 'pointer' }}>查看全部 →</button>}
      >
        {recent.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>暂无待审申请</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['自营门店名称', '联系人', '类型', '申请时间', '状态'].map(h => (
                    <th key={h} style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 'var(--fw-semibold)', padding: '10px 12px', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map(r => {
                  const st = STATUS_MAP[r.status] ?? { label: r.status, color: 'var(--text-muted)' }
                  return (
                    <tr key={r.id} className="lx-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', color: 'var(--text)', fontSize: 14, fontWeight: 'var(--fw-medium)' }}>{r.store_name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 14 }}>{r.contact_name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 14 }}>{r.business_type}</td>
                      <td style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 13 }}>{new Date(r.created_at).toLocaleDateString('zh-CN')}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 'var(--fw-semibold)', background: `${st.color}1A`, color: st.color }}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
