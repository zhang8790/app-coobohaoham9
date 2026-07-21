import { useEffect, useState, useCallback } from 'react'
import { getRefunds } from '@/api/admin'
import type { Refund, RefundStatus } from '@/types'

const PAGE_SIZE = 10
const STATUS_LABELS: Record<RefundStatus, string> = {
  pending_review: '待审核',
  processing: '处理中',
  completed: '已完成',
  closed: '已关闭',
  abnormal: '异常',
}
const STATUS_COLORS: Record<RefundStatus, string> = {
  pending_review: 'var(--warning)',
  processing: 'var(--info)',
  completed: 'var(--success-strong)',
  closed: 'var(--text-dim)',
  abnormal: 'var(--danger)',
}

const TABS: { value: 'all' | RefundStatus; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'abnormal', label: '异常' },
  { value: 'closed', label: '已关闭' },
  { value: 'pending_review', label: '待审核(旧)' },
]

export default function Refunds() {
  const [tab, setTab] = useState<'all' | RefundStatus>('all')
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Refund[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getRefunds(tab, page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [tab, page])

  useEffect(() => { setPage(0) }, [tab])
  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '8px 16px', background: active ? 'var(--primary-soft)' : 'transparent', color: active ? 'var(--primary)' : 'var(--text-muted)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
    btn: (bg: string) => ({ padding: '5px 12px', background: bg, color: 'white', border: 'none', borderRadius: 5, fontSize: 12, cursor: 'pointer', marginRight: 6 }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>退款管理</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>处理用户退款申请 · 共 {total} 条</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)} style={S.tab(tab === t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>退款单号</th>
              <th style={S.th}>订单号</th>
              <th style={S.th}>退款金额</th>
              <th style={S.th}>原因</th>
              <th style={S.th}>状态</th>
              <th style={S.th}>申请时间</th>
              <th style={S.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>暂无记录</td></tr>
            ) : list.map(r => (
              <tr key={r.id}>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{r.refund_no || r.id.slice(0, 8)}</td>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{r.order_no}</td>
                <td style={{ ...S.td, color: 'var(--primary)', fontWeight: 600 }}>¥{Number(r.refund_amount).toFixed(2)}</td>
                <td style={{ ...S.td, color: 'var(--text)' }}>{r.reason || '-'}</td>
                <td style={S.td}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${STATUS_COLORS[r.status]}22`, color: STATUS_COLORS[r.status] }}>
                    {STATUS_LABELS[r.status] || r.status}
                  </span>
                </td>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{new Date(r.created_at).toLocaleString('zh-CN')}</td>
                <td style={S.td}>
                  {r.status === 'abnormal' && <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>⚠ 需人工核查</span>}
                  {r.status === 'processing' && <span style={{ color: 'var(--info)', fontSize: 12 }}>等待微信回调</span>}
                  {r.status !== 'abnormal' && r.status !== 'processing' && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={S.btn('var(--border-soft)')}>上一页</button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>第 {page + 1} / {totalPages} 页</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={S.btn('var(--border-soft)')}>下一页</button>
        </div>
      )}
    </div>
  )
}
