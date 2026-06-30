import { useEffect, useState, useCallback } from 'react'
import { getMerchantApplications, approveApplication, rejectApplication } from '@/api/admin'
import type { MerchantApplication } from '@/types'

const PAGE_SIZE = 10
const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]
const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: '待审', color: '#F59E0B' },
  approved: { label: '已通过', color: '#10B981' },
  rejected: { label: '已驳回', color: '#EF4444' },
  none: { label: '未申请', color: '#6B7280' },
}

export default function Merchants() {
  const [filter, setFilter] = useState('pending')
  const [page, setPage] = useState(0)
  const [list, setList] = useState<MerchantApplication[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getMerchantApplications(filter, page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [filter, page])

  useEffect(() => { setPage(0) }, [filter])
  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    if (!confirm('确认通过该商家申请？')) return
    setProcessing(id)
    await approveApplication(id)
    setProcessing(null); load()
  }

  const handleReject = async () => {
    if (!rejectModal || !reason.trim()) return
    setProcessing(rejectModal.id)
    await rejectApplication(rejectModal.id, reason.trim())
    setProcessing(null); setRejectModal(null); setReason(''); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
    badge: (color: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${color}22`, color }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>门派大典</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>商家入驻申请审核</p>
      </div>

      {/* 状态筛选 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: filter === t.key ? '#C2410C' : '#0F172A',
              color: filter === t.key ? '#fff' : '#9CA3AF' }}>
            {t.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#6B7280', fontSize: 13, display: 'flex', alignItems: 'center' }}>共 {total} 条</span>
      </div>

      {/* 表格 */}
      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无数据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0B0F19' }}>
                {['商家名称', '联系人', '电话', '类型', '简介', '申请时间', '状态', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r => {
                const st = STATUS_BADGE[r.status] ?? STATUS_BADGE.none
                return (
                  <tr key={r.id}>
                    <td style={{ ...S.td, color: '#E5E7EB', fontWeight: 600 }}>{r.store_name}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{r.contact_name}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{r.contact_phone}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{r.business_type}</td>
                    <td style={{ ...S.td, color: '#6B7280', maxWidth: 160 }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.description || '—'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: '#6B7280', fontSize: 13 }}>{new Date(r.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={S.td}><span style={S.badge(st.color)}>{st.label}</span></td>
                    <td style={S.td}>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button disabled={processing === r.id} onClick={() => handleApprove(r.id)}
                            style={{ padding: '5px 12px', background: '#10B98122', border: '1px solid #10B981', borderRadius: 6, color: '#10B981', cursor: 'pointer', fontSize: 12 }}>
                            通过
                          </button>
                          <button disabled={processing === r.id} onClick={() => { setRejectModal({ id: r.id, name: r.store_name }); setReason('') }}
                            style={{ padding: '5px 12px', background: '#EF444422', border: '1px solid #EF4444', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>
                            驳回
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid #1F2937' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? '#C2410C' : '#1F2937', color: page === i ? '#fff' : '#9CA3AF' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 驳回弹窗 */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0F172A', border: '1px solid #1F2937', borderRadius: 16, padding: 28, width: 440 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>驳回申请</h3>
            <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 20 }}>商家：{rejectModal.name}</p>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="请填写驳回理由，将通知申请商家..."
              style={{ width: '100%', height: 100, padding: '10px 14px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'none', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModal(null)}
                style={{ padding: '9px 20px', background: 'transparent', border: '1px solid #374151', borderRadius: 8, color: '#9CA3AF', cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleReject} disabled={!reason.trim()}
                style={{ padding: '9px 20px', background: reason.trim() ? '#EF4444' : '#7f1d1d', border: 'none', borderRadius: 8, color: '#fff', cursor: reason.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
