import { useEffect, useState, useCallback } from 'react'
import { getPendingProducts, approveProduct, rejectProduct } from '@/api/admin'
import type { Product } from '@/types'

const PAGE_SIZE = 10

export default function Products() {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getPendingProducts(page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    if (!confirm('确认批准该商品上架？')) return
    setProcessing(id)
    await approveProduct(id)
    setProcessing(null); load()
  }

  const handleReject = async () => {
    if (!rejectModal || !reason.trim()) return
    setProcessing(rejectModal.id)
    await rejectProduct(rejectModal.id, reason.trim())
    setProcessing(null); setRejectModal(null); setReason(''); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>宝贝审阅</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>待上架商品审核 · 共 {total} 件待审</p>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无待审商品 ✓</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['商品', '所属门店', '价格', '库存', '提交时间', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 8, background: '#1F2937', flexShrink: 0 }} />
                      }
                      <div>
                        <p style={{ color: '#E5E7EB', fontWeight: 600, fontSize: 14 }}>{p.name}</p>
                        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{p.description?.slice(0, 30) || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...S.td, color: '#9CA3AF' }}>
                    {(p.stores as unknown as { name?: string } | null)?.name || '—'}
                  </td>
                  <td style={{ ...S.td, color: '#C2410C', fontWeight: 700 }}>¥{Number(p.price).toFixed(2)}</td>
                  <td style={{ ...S.td, color: '#9CA3AF' }}>{p.stock}</td>
                  <td style={{ ...S.td, color: '#6B7280', fontSize: 13 }}>{new Date(p.created_at).toLocaleDateString('zh-CN')}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={processing === p.id} onClick={() => handleApprove(p.id)}
                        style={{ padding: '5px 12px', background: '#10B98122', border: '1px solid #10B981', borderRadius: 6, color: '#10B981', cursor: 'pointer', fontSize: 12 }}>
                        批准上架
                      </button>
                      <button disabled={processing === p.id} onClick={() => { setRejectModal({ id: p.id, name: p.name }); setReason('') }}
                        style={{ padding: '5px 12px', background: '#EF444422', border: '1px solid #EF4444', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>
                        驳回
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0F172A', border: '1px solid #1F2937', borderRadius: 16, padding: 28, width: 440 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>驳回商品</h3>
            <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 20 }}>商品：{rejectModal.name}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="请填写驳回理由，将通知商家..."
              style={{ width: '100%', height: 100, padding: '10px 14px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'none', outline: 'none' }} />
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
