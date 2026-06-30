import { useEffect, useState, useCallback } from 'react'
import { getPendingWithdrawals, approveWithdrawal, rejectWithdrawal } from '@/api/admin'
import type { Withdrawal } from '@/types'

const PAGE_SIZE = 10
const METHOD_LABELS: Record<string, string> = { bank: '银行转账', alipay: '支付宝', wechat: '微信零钱' }

export default function Withdrawals() {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Withdrawal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getPendingWithdrawals(page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string, amount: number) => {
    if (!confirm(`确认通过 ¥${Number(amount).toFixed(2)} 提现申请？代付后请在微信商户平台完成实际转账。`)) return
    setProcessing(id)
    await approveWithdrawal(id)
    setProcessing(null); load()
  }

  const handleReject = async (id: string) => {
    if (!confirm('确认驳回该提现申请？余额将退还至用户账户。')) return
    setProcessing(id)
    await rejectWithdrawal(id)
    setProcessing(null); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalAmount = list.reduce((s, w) => s + Number(w.amount), 0)

  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>银票兑付</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>提现申请审核 · 共 {total} 条待审 · 合计 ¥{totalAmount.toFixed(2)}</p>
      </div>

      {/* 汇总卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: '待审条数', val: total, color: '#F59E0B' },
          { label: '待审总额', val: `¥${totalAmount.toFixed(2)}`, color: '#C2410C' },
          { label: '扣税后合计', val: `¥${(totalAmount * 0.9).toFixed(2)}`, color: '#10B981' },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, padding: '16px 20px' }}>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 6 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 24, fontWeight: 700 }}>{c.val}</p>
          </div>
        ))}
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无待审提现 ✓</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['用户', '手机', '提现金额', '江湖税(10%)', '实际到手', '方式', '申请时间', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(w => {
                const tax = Number(w.amount) * 0.1
                const actual = Number(w.amount) - tax
                const prof = w.profiles as unknown as { nickname?: string; phone?: string } | null
                return (
                  <tr key={w.id}>
                    <td style={{ ...S.td, color: '#E5E7EB', fontWeight: 600 }}>{prof?.nickname || '侠客'}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{prof?.phone || '—'}</td>
                    <td style={{ ...S.td, color: '#C2410C', fontWeight: 700 }}>¥{Number(w.amount).toFixed(2)}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>-¥{tax.toFixed(2)}</td>
                    <td style={{ ...S.td, color: '#10B981', fontWeight: 700 }}>¥{actual.toFixed(2)}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{METHOD_LABELS[w.withdraw_method] || w.withdraw_method}</td>
                    <td style={{ ...S.td, color: '#6B7280', fontSize: 13 }}>{new Date(w.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={processing === w.id} onClick={() => handleApprove(w.id, w.amount)}
                          style={{ padding: '5px 12px', background: '#10B98122', border: '1px solid #10B981', borderRadius: 6, color: '#10B981', cursor: 'pointer', fontSize: 12 }}>
                          通过代付
                        </button>
                        <button disabled={processing === w.id} onClick={() => handleReject(w.id)}
                          style={{ padding: '5px 12px', background: '#EF444422', border: '1px solid #EF4444', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>
                          驳回退款
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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
    </div>
  )
}
