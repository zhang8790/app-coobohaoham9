import { useEffect, useState, useCallback } from 'react'
import { getRefunds, approveRefund, rejectRefund } from '@/api/admin'
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
  pending_review: '#F59E0B',
  processing: '#3B82F6',
  completed: '#10B981',
  closed: '#6B7280',
  abnormal: '#EF4444',
}

const TABS: { value: 'all' | RefundStatus; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending_review', label: '待审核' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'closed', label: '已关闭' },
]

export default function Refunds() {
  const [tab, setTab] = useState<'all' | RefundStatus>('pending_review')
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Refund[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getRefunds(tab, page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [tab, page])

  useEffect(() => { setPage(0) }, [tab])
  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string, amount: number) => {
    if (!confirm(`确认通过 ¥${Number(amount).toFixed(2)} 退款？需在微信商户平台完成实际退款。`)) return
    setProcessing(id)
    await approveRefund(id)
    setProcessing(null); load()
  }

  const handleReject = async (id: string) => {
    const reason = prompt('请输入驳回原因：')
    if (!reason) return
    setProcessing(id)
    await rejectRefund(id, reason)
    setProcessing(null); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '8px 16px', background: active ? '#C2410C22' : 'transparent', color: active ? '#C2410C' : '#9CA3AF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
    btn: (bg: string) => ({ padding: '5px 12px', background: bg, color: 'white', border: 'none', borderRadius: 5, fontSize: 12, cursor: 'pointer', marginRight: 6 }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>退款管理</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>处理用户退款申请 · 共 {total} 条</p>
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
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#6B7280' }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#6B7280' }}>暂无记录</td></tr>
            ) : list.map(r => (
              <tr key={r.id}>
                <td style={{ ...S.td, color: '#9CA3AF', fontSize: 12 }}>{r.refund_no || r.id.slice(0, 8)}</td>
                <td style={{ ...S.td, color: '#9CA3AF', fontSize: 12 }}>{r.order_no}</td>
                <td style={{ ...S.td, color: '#C2410C', fontWeight: 600 }}>¥{Number(r.refund_amount).toFixed(2)}</td>
                <td style={{ ...S.td, color: '#E5E7EB' }}>{r.reason || '-'}</td>
                <td style={S.td}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${STATUS_COLORS[r.status]}22`, color: STATUS_COLORS[r.status] }}>
                    {STATUS_LABELS[r.status] || r.status}
                  </span>
                </td>
                <td style={{ ...S.td, color: '#9CA3AF', fontSize: 12 }}>{new Date(r.created_at).toLocaleString('zh-CN')}</td>
                <td style={S.td}>
                  {r.status === 'pending_review' && (
                    <>
                      <button onClick={() => handleApprove(r.id, r.refund_amount)} disabled={processing === r.id} style={S.btn('#10B981')}>通过</button>
                      <button onClick={() => handleReject(r.id)} disabled={processing === r.id} style={S.btn('#EF4444')}>驳回</button>
                    </>
                  )}
                  {r.status !== 'pending_review' && <span style={{ color: '#6B7280', fontSize: 12 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={S.btn('#374151')}>上一页</button>
          <span style={{ color: '#9CA3AF', fontSize: 13, alignSelf: 'center' }}>第 {page + 1} / {totalPages} 页</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={S.btn('#374151')}>下一页</button>
        </div>
      )}
    </div>
  )
}
