import { useEffect, useState, useCallback } from 'react'
import { getPendingProducts, approveProduct, rejectProduct } from '@/api/admin'
import type { Product } from '@/types'
import { resolveIngredientEntries, SHIYANG_DISCLAIMER } from '@/utils/shiyang'

const PAGE_SIZE = 10

export default function Products() {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null)
  const [reason, setReason] = useState('')
  const [detailModal, setDetailModal] = useState<Product | null>(null)

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
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>商品审阅</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>待上架商品审核 · 共 {total} 件待审</p>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>暂无待审商品 ✓</div>
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
                        : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--border)', flexShrink: 0 }} />
                      }
                      <div>
                        <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{p.name}</p>
                        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{p.description?.slice(0, 30) || '—'}</p>
                        {resolveIngredientEntries(p).length > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '2px 8px', background: 'var(--success-soft)', border: '1px solid var(--success-strong)', borderRadius: 999, color: 'var(--success-strong)', fontSize: 11 }}>
                            {resolveIngredientEntries(p).length} 味原料
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...S.td, color: 'var(--text-muted)' }}>
                    {(p.stores as unknown as { name?: string } | null)?.name || '—'}
                  </td>
                  <td style={{ ...S.td, color: 'var(--primary)', fontWeight: 700 }}>¥{Number(p.price).toFixed(2)}</td>
                  <td style={{ ...S.td, color: 'var(--text-muted)' }}>{p.stock}</td>
                  <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: 13 }}>{new Date(p.created_at).toLocaleDateString('zh-CN')}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setDetailModal(p)}
                        style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                        详情
                      </button>
                      <button disabled={processing === p.id} onClick={() => handleApprove(p.id)}
                        style={{ padding: '5px 12px', background: 'var(--success-soft)', border: '1px solid var(--success-strong)', borderRadius: 6, color: 'var(--success-strong)', cursor: 'pointer', fontSize: 12 }}>
                        批准上架
                      </button>
                      <button disabled={processing === p.id} onClick={() => { setRejectModal({ id: p.id, name: p.name }); setReason('') }}
                        style={{ padding: '5px 12px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? 'var(--primary)' : 'var(--border)', color: page === i ? '#fff' : 'var(--text-muted)' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 440 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>驳回商品</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>商品：{rejectModal.name}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="请填写驳回理由，将通知自营门店..."
              style={{ width: '100%', height: 100, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'none', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModal(null)}
                style={{ padding: '9px 20px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleReject} disabled={!reason.trim()}
                style={{ padding: '9px 20px', background: reason.trim() ? 'var(--danger)' : 'var(--primary-disabled)', border: 'none', borderRadius: 8, color: '#fff', cursor: reason.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}

      {detailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDetailModal(null)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
              {detailModal.image_url
                ? <img src={detailModal.image_url} alt={detailModal.name} style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--border)', flexShrink: 0 }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>{detailModal.name}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>门店：{(detailModal.stores as unknown as { name?: string } | null)?.name || '—'}</p>
                <p style={{ color: 'var(--primary)', fontSize: 14, fontWeight: 700, marginTop: 4 }}>¥{Number(detailModal.price).toFixed(2)} · 库存 {detailModal.stock}</p>
              </div>
              <button onClick={() => setDetailModal(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            {detailModal.description && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>{detailModal.description}</p>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
              <p style={{ color: 'var(--text)', fontSize: 15, fontWeight: 700, marginBottom: 14 }}>原料分析</p>
              {(() => {
                const entries = resolveIngredientEntries(detailModal)
                if (entries.length === 0) {
                  return <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>暂未识别到食养原料成分。</p>
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {entries.map(e => (
                      <div key={e.zh} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 20 }}>{e.icon}</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{e.zh}</span>
                          <span style={{ padding: '1px 8px', background: `${e.color}22`, border: `1px solid ${e.color}`, borderRadius: 999, color: e.color, fontSize: 11 }}>性{e.nature}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {e.benefits.map(b => (
                            <span key={b} style={{ padding: '2px 8px', background: 'var(--success-soft)', border: '1px solid var(--success-strong)', borderRadius: 6, color: 'var(--success-strong)', fontSize: 11 }}>功效·{b}</span>
                          ))}
                          {e.audiences.map(a => (
                            <span key={a} style={{ padding: '2px 8px', background: 'var(--info-soft)', border: '1px solid var(--info)', borderRadius: 6, color: 'var(--info-text)', fontSize: 11 }}>人群·{a}</span>
                          ))}
                          {e.scenarios.map(s => (
                            <span key={s} style={{ padding: '2px 8px', background: 'var(--warning)18', border: '1px solid var(--warning)', borderRadius: 6, color: 'var(--warning)', fontSize: 11 }}>场景·{s}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>{SHIYANG_DISCLAIMER}</p>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
