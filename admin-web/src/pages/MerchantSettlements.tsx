import { useEffect, useState, useCallback } from 'react'
import {
  getMerchantSettlements, getMerchantSettlementSummary, triggerSettlementBackfill,
} from '@/api/admin'
import type { MerchantSettlement } from '@/types'

const PAGE_SIZE = 12
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'settled', label: '已结算' },
  { key: 'reversed', label: '已回冲' },
]
const STATUS_LABEL: Record<string, string> = { settled: '已结算', reversed: '已回冲' }
const STATUS_COLOR: Record<string, string> = { settled: '#10B981', reversed: '#EF4444' }

const yuan = (n: number) => `¥${Number(n || 0).toFixed(2)}`

export default function MerchantSettlements() {
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('all')
  const [list, setList] = useState<MerchantSettlement[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ total_settled: 0, count: 0, store_count: 0 })
  const [loading, setLoading] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, total: t }, sum] = await Promise.all([
      getMerchantSettlements(page, PAGE_SIZE, status),
      getMerchantSettlementSummary(),
    ])
    setList(data); setTotal(t); setSummary(sum); setLoading(false)
  }, [page, status])

  useEffect(() => { load() }, [load])

  const handleBackfill = async () => {
    if (!confirm('将对「已完成但未结算」的历史订单补跑货款结算，并累加门店余额。确定执行？')) return
    setBackfilling(true); setBackfillMsg(null)
    const r = await triggerSettlementBackfill()
    setBackfilling(false)
    if (r.ok) setBackfillMsg(`补结算完成：新增 ${r.backfilled ?? 0} 笔，跳过 ${r.skipped ?? 0} 笔`)
    else setBackfillMsg(`补结算失败：${r.error}`)
    load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 14px', textAlign: 'left' as const, background: '#0B0F19', whiteSpace: 'nowrap' as const },
    td: { padding: '12px 14px', fontSize: 13, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>商家货款结算</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>
          订单完成后按「净额结算」自动计入商家货款（含情绪豆支付等值部分，由平台垫付），通过微信服务商分账直达商家子商户号。
        </p>
      </div>

      {/* 汇总卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: '累计已结算货款', val: yuan(summary.total_settled), color: '#10B981' },
          { label: '结算笔数', val: summary.count, color: '#C2410C' },
          { label: '涉及门店数', val: summary.store_count, color: '#3B82F6' },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, padding: '16px 20px' }}>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 6 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 24, fontWeight: 700 }}>{c.val}</p>
          </div>
        ))}
      </div>

      {/* 操作行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => { setPage(0); setStatus(f.key) }}
              style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: status === f.key ? '#10B981' : '#111827', color: status === f.key ? '#fff' : '#9CA3AF',
                border: `1px solid ${status === f.key ? '#10B981' : '#1F2937'}` }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={handleBackfill} disabled={backfilling}
          style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: backfilling ? 'not-allowed' : 'pointer',
            background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', opacity: backfilling ? 0.6 : 1 }}>
          {backfilling ? '补结算中…' : '历史补结算'}
        </button>
      </div>
      {backfillMsg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: '#111827', border: '1px solid #1F2937', color: '#9CA3AF', fontSize: 13 }}>
          {backfillMsg}
        </div>
      )}

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无结算记录 ✓</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  {['门店', '订单号', '订单全额', '豆付部分', '现金部分', '让利池', '通道费', '应收货款', '状态', '结算时间'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...S.td, color: '#E5E7EB', fontWeight: 600 }}>
                      {r.stores?.name || '—'}
                      {r.stores?.wx_sub_mch_id && <div style={{ color: '#6B7280', fontSize: 11 }}>子商户号 {r.stores.wx_sub_mch_id}</div>}
                    </td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{r.order_no || '—'}</td>
                    <td style={{ ...S.td, color: '#C9D1D9' }}>{yuan(r.total_amount)}</td>
                    <td style={{ ...S.td, color: '#A78BFA' }}>{yuan(r.tb_portion)}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{yuan(r.cash_portion)}</td>
                    <td style={{ ...S.td, color: '#F59E0B' }}>-{yuan(r.discount_pool)}</td>
                    <td style={{ ...S.td, color: '#6B7280' }}>-{yuan(r.channel_fee)}</td>
                    <td style={{ ...S.td, color: '#10B981', fontWeight: 700 }}>{yuan(r.settle_amount)}</td>
                    <td style={S.td}>
                      <span style={{ color: STATUS_COLOR[r.status] || '#9CA3AF', fontSize: 12, fontWeight: 600, padding: '2px 8px', background: `${(STATUS_COLOR[r.status] || '#6B7280')}22`, borderRadius: 4 }}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: '#6B7280' }}>{r.settled_at ? new Date(r.settled_at).toLocaleString('zh-CN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid #1F2937' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? '#10B981' : '#1F2937', color: page === i ? '#fff' : '#9CA3AF' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 18px', borderRadius: 12, background: '#111827', border: '1px solid #1F2937', color: '#9CA3AF', fontSize: 13, lineHeight: 1.8 }}>
        <strong style={{ color: '#E5E7EB' }}>资金下发与安全说明：</strong><br />
        · 真实打款走「微信支付服务商分账」模式，资金直达商家子商户号（stores.wx_sub_mch_id），平台不池化销售款，规避二清红线。<br />
        · 情绪豆支付部分由平台以自有资金垫付（用户充值时平台已收 RMB），货款仍按 1:1 等值计入，不要求商家持有/接收情绪豆。<br />
        · 如门店未配置子商户号或微信证书未配置，分账将返回 NEED_SUB_MCH / NEED_CONFIG，需平台以自有资金经银行转账完成（审核页「执行分账打款」会提示）。<br />
        · 三者严格隔离：情绪豆(tb_balance) 不可提现、推广佣金(commission_balance) 可提现、商家货款(merchant_balance) 可提现，互相不混用。
      </div>
    </div>
  )
}
