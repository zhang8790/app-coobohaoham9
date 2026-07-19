import { useEffect, useState, useCallback } from 'react'
import { getPendingWithdrawals, approveWithdrawal, payWithdrawal, rejectWithdrawal, triggerSettlementPayout, rejectSettlementWithdrawal } from '@/api/admin'
import type { Withdrawal } from '@/types'
import { supabase } from '@/lib/supabase'
import { maskIdCard, maskName, maskPhone, maskAccount } from '@/utils/mask'

const PAGE_SIZE = 10
const TAX_RATE = 0.20
const TAX_THRESHOLD = 800
// 劳务报酬所得税：单次收入 ≤800 元免征，超过部分按 20% 计征（与 V5 算法口径一致）
const calcWithholdingTax = (amt: number) => (amt > TAX_THRESHOLD ? (amt - TAX_THRESHOLD) * TAX_RATE : 0)
const METHOD_LABELS: Record<string, string> = { bank: '银行转账', alipay: '支付宝', wechat: '微信零钱' }
const STATUS_LABEL: Record<string, string> = { pending: '待审核', approved: '已通过', paid: '已打款', rejected: '已驳回' }
const STATUS_COLOR: Record<string, string> = { pending: '#F59E0B', approved: '#3B82F6', paid: '#10B981', rejected: '#EF4444' }
const FILTERS: { key: string; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'paid', label: '已打款' },
  { key: 'rejected', label: '已驳回' },
  { key: 'all', label: '全部' },
]

// 提现类型切换（迁移 00120：佣金 / 货款）
const KIND_TABS: { key: 'commission' | 'settlement'; label: string }[] = [
  { key: 'commission', label: '佣金提现' },
  { key: 'settlement', label: '货款提现' },
]
const KIND_LABEL: Record<string, string> = { commission: '佣金', settlement: '货款' }

// 脱敏函数统一来自 @/utils/mask（maskIdCard / maskName / maskPhone / maskAccount）

export default function Withdrawals() {
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('pending')
  const [kind, setKind] = useState<'commission' | 'settlement'>('commission')
  const [list, setList] = useState<Withdrawal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  // 详情抽屉
  const [selected, setSelected] = useState<Withdrawal | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [remark, setRemark] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getPendingWithdrawals(page, PAGE_SIZE, status, kind)
    setList(data); setTotal(t); setLoading(false)
  }, [page, status, kind])

  useEffect(() => { load() }, [load])

  const openDetail = (w: Withdrawal) => {
    setSelected(w); setRemark(w.remark || ''); setDrawerOpen(true)
  }

  const handleApprove = async (w: Withdrawal) => {
    if (!confirm(`确认通过 ¥${Number(w.amount).toFixed(2)} 的提现申请？通过后状态变为"已通过"，待财务实际打款。`)) return
    setProcessing(w.id)
    const ok = await approveWithdrawal(w.id, remark || undefined)
    if (ok) {
      // 推送「提现审核通过」通知
      supabase.functions.invoke('send-notification', {
        body: {
          user_id: w.user_id,
          type: 'withdraw_progress',
          title: '提现审核通过',
          body: `您的提现 ¥${Number(w.amount).toFixed(2)} 已通过审核，财务即将打款`,
          payload: {
            amount: Number(w.amount).toFixed(2),
            status_label: '已通过',
            updated_at: new Date().toLocaleString('zh-CN'),
            remark: '审核通过',
            page: 'pages/withdraw/index',
          },
        }
      }).catch(e => console.warn('[Withdrawals] send-notification approve error:', e))
    }
    setProcessing(null)
    setDrawerOpen(false); setSelected(null); load()
  }

  const handlePay = async (w: Withdrawal) => {
    if (w.kind === 'settlement') {
      // 货款提现：执行微信服务商分账（资金直达商家子商户号）；缺配置则提示手动打款
      if (!confirm(`确认执行货款分账打款 ¥${Number(w.amount).toFixed(2)}？\n将通过微信服务商分账直达商家子商户号；若未配置子商户号/证书，需线下银行转账后手动置为已打款。`)) return
      setProcessing(w.id)
      const r = await triggerSettlementPayout(w.id)
      setProcessing(null)
      if (r.ok) {
        alert(r.message || '分账已发起/打款完成')
      } else {
        alert(`分账失败：${r.error || r.message || '未知错误'}\n如为 NEED_SUB_MCH/NEED_CONFIG，请配置门店子商户号或微信证书后重试，或线下转账后手动置为已打款。`)
      }
      setDrawerOpen(false); setSelected(null); load()
      return
    }
    if (!confirm(`确认已完成打款 ¥${Number(w.amount).toFixed(2)}？代付后请在微信商户平台/银行完成实际转账，状态将变为"已打款"。`)) return
    setProcessing(w.id)
    const ok = await payWithdrawal(w.id, remark || undefined)
    if (ok) {
      // 推送「提现已打款」通知
      supabase.functions.invoke('send-notification', {
        body: {
          user_id: w.user_id,
          type: 'withdraw_progress',
          title: '提现已打款',
          body: `您的提现 ¥${Number(w.amount).toFixed(2)} 已完成打款，请查收账户`,
          payload: {
            amount: Number(w.amount).toFixed(2),
            status_label: '已打款',
            updated_at: new Date().toLocaleString('zh-CN'),
            remark: '已完成打款',
            page: 'pages/withdraw/index',
          },
        }
      }).catch(e => console.warn('[Withdrawals] send-notification pay error:', e))
    }
    setProcessing(null)
    setDrawerOpen(false); setSelected(null); load()
  }

  const handleReject = async (w: Withdrawal) => {
    const reason = prompt(w.kind === 'settlement'
      ? '请输入驳回原因（将通知商家，并退回货款到门店可结算余额）：'
      : '请输入驳回原因（将通知用户；佣金保留在其账户余额中，未扣减）：')
    if (reason === null) return
    if (!reason.trim()) { alert('请填写驳回原因'); return }
    setProcessing(w.id)
    const ok = w.kind === 'settlement'
      ? await rejectSettlementWithdrawal(w.id, reason.trim(), remark || undefined)
      : await rejectWithdrawal(w.id, reason.trim(), remark || undefined)
    if (ok && w.kind !== 'settlement') {
      // 推送「提现被驳回」通知
      supabase.functions.invoke('send-notification', {
        body: {
          user_id: w.user_id,
          type: 'withdraw_progress',
          title: '提现被驳回',
          body: `您的提现 ¥${Number(w.amount).toFixed(2)} 被驳回：${reason.trim()}。佣金已保留在账户中。`,
          payload: {
            amount: Number(w.amount).toFixed(2),
            status_label: '已驳回',
            updated_at: new Date().toLocaleString('zh-CN'),
            remark: reason.trim().slice(0, 20),
            page: 'pages/withdraw/index',
          },
        }
      }).catch(e => console.warn('[Withdrawals] send-notification reject error:', e))
    }
    setProcessing(null)
    setDrawerOpen(false); setSelected(null); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalAmount = list.reduce((s, w) => s + Number(w.amount), 0)
  const totalTax = calcWithholdingTax(totalAmount)
  const totalActual = totalAmount - totalTax

  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 14px', textAlign: 'left' as const, background: '#0B0F19', whiteSpace: 'nowrap' as const },
    td: { padding: '14px 14px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{kind === 'settlement' ? '货款兑付' : '佣金兑付'}</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>{kind === 'settlement' ? '商家货款提现审核 · 微信服务商分账直达' : '推广佣金提现审核'} · 当前筛选「{FILTERS.find(f => f.key === status)?.label}」共 {total} 条 · 合计 ¥{totalAmount.toFixed(2)}</p>
      </div>

      {/* 类型切换（佣金 / 货款） */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {KIND_TABS.map(k => (
          <button key={k.key} onClick={() => { setPage(0); setKind(k.key) }}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: kind === k.key ? (k.key === 'settlement' ? '#10B981' : '#C2410C') : '#111827',
              color: kind === k.key ? '#fff' : '#9CA3AF',
              border: `1px solid ${kind === k.key ? (k.key === 'settlement' ? '#10B981' : '#C2410C') : '#1F2937'}` }}>
            {k.label}
          </button>
        ))}
      </div>

      {/* 状态筛选 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => { setPage(0); setStatus(f.key) }}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: status === f.key ? '#C2410C' : '#111827', color: status === f.key ? '#fff' : '#9CA3AF',
              border: `1px solid ${status === f.key ? '#C2410C' : '#1F2937'}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 汇总卡 */}
      {(() => {
        const cards =
          kind === 'settlement'
            ? [
                { label: '筛选条数', val: total, color: '#F59E0B' },
                { label: '货款提现总额', val: `¥${totalAmount.toFixed(2)}`, color: '#10B981' },
                { label: '说明', val: '含金豆垫付', color: '#A78BFA' },
              ]
            : [
                { label: '筛选条数', val: total, color: '#F59E0B' },
                { label: '提现总额', val: `¥${totalAmount.toFixed(2)}`, color: '#C2410C' },
                { label: '应缴个税(20%)后预估', val: `¥${totalActual.toFixed(2)}`, color: '#10B981' },
              ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {cards.map(c => (
              <div key={c.label} style={{ ...S.card, padding: '16px 20px' }}>
                <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 6 }}>{c.label}</p>
                <p style={{ color: c.color, fontSize: 24, fontWeight: 700 }}>{c.val}</p>
              </div>
            ))}
          </div>
        )
      })()}

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无相关提现记录 ✓</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
              <thead>
                <tr>
                  {['申请人', '手机', '提现金额', '应缴个税(20%)', '税后预估到账', '方式', '开户行', '状态', '类型', '操作'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(w => {
                  const tax = calcWithholdingTax(Number(w.amount))
                  const actual = Number(w.amount) - tax
                  const prof = w.profiles as unknown as { nickname?: string; phone?: string } | null
                  const realName = w.real_name || w.bank_holder || ''
                  return (
                    <tr key={w.id}>
                      <td style={S.td}>
                        <div style={{ color: '#E5E7EB', fontWeight: 600 }}>{maskName(realName)}</div>
                        {prof?.nickname && <div style={{ color: '#6B7280', fontSize: 12 }}>{prof.nickname}</div>}
                      </td>
                      <td style={{ ...S.td, color: '#9CA3AF' }}>{maskPhone(prof?.phone)}</td>
                      <td style={{ ...S.td, color: '#C2410C', fontWeight: 700 }}>¥{Number(w.amount).toFixed(2)}</td>
                      <td style={{ ...S.td, color: '#9CA3AF' }}>-¥{tax.toFixed(2)}</td>
                      <td style={{ ...S.td, color: '#10B981', fontWeight: 700 }}>¥{actual.toFixed(2)}</td>
                      <td style={{ ...S.td, color: '#9CA3AF' }}>{METHOD_LABELS[w.withdraw_method] || w.withdraw_method}</td>
                      <td style={{ ...S.td, color: '#9CA3AF' }}>
                        {w.withdraw_method === 'bank' ? (w.bank_name || '—') : (w.withdraw_method === 'alipay' ? '支付宝' : w.withdraw_method === 'wechat' ? '微信' : '—')}
                      </td>
                      <td style={S.td}>
                        <span style={{ color: STATUS_COLOR[w.status], fontSize: 12, fontWeight: 600, padding: '2px 8px', background: `${STATUS_COLOR[w.status]}22`, borderRadius: 4 }}>
                          {STATUS_LABEL[w.status] || w.status}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span style={{ color: w.kind === 'settlement' ? '#10B981' : '#C2410C', fontSize: 12, fontWeight: 600 }}>
                          {KIND_LABEL[w.kind || 'commission']}
                        </span>
                      </td>
                      <td style={S.td}>
                        <button onClick={() => openDetail(w)}
                          style={{ padding: '5px 14px', background: '#1F2937', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', cursor: 'pointer', fontSize: 12 }}>
                          查看
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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

      {/* 详情抽屉 */}
      {drawerOpen && selected && (
        <div onClick={() => { setDrawerOpen(false); setSelected(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '92vw', height: '100%', background: '#0F172A', borderLeft: '1px solid #1F2937', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>提现详情</h2>
              <button onClick={() => { setDrawerOpen(false); setSelected(null) }}
                style={{ background: 'transparent', border: 'none', color: '#6B7280', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <span style={{ color: STATUS_COLOR[selected.status], fontSize: 12, fontWeight: 600, padding: '3px 10px', background: `${STATUS_COLOR[selected.status]}22`, borderRadius: 4, alignSelf: 'flex-start' }}>
              {STATUS_LABEL[selected.status] || selected.status}
            </span>

            {/* 收款人实名信息 */}
            <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 600 }}>收款人信息（打款核对）</p>
              <Field label="真实姓名" value={selected.real_name || selected.bank_holder || '—'} />
              <Field label="身份证号" value={maskIdCard(selected.id_card)} />
              <Field label="手机号" value={maskPhone((selected.profiles as any)?.phone)} />
              <Field label="收款方式" value={METHOD_LABELS[selected.withdraw_method] || selected.withdraw_method} />
              <Field label="开户银行" value={selected.withdraw_method === 'bank' ? (selected.bank_name || '—') : '—'} />
              <Field label="收款账号" value={maskAccount(selected.withdraw_method === 'bank' ? selected.bank_account : selected.alipay_account, selected.withdraw_method)} />
            </div>

            {/* 金额 */}
            <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="提现金额" value={`¥${Number(selected.amount).toFixed(2)}`} strong />
              {selected.kind === 'settlement' ? (
                <>
                  <Field label="类型" value="商家货款结算（含金豆垫付等值部分）" />
                  <Field label="税务说明" value="货款结算属商家销售回款，不涉及推广佣金个税" />
                </>
              ) : (
                <>
                  <Field label="应缴个税(20%)" value={`-¥${calcWithholdingTax(Number(selected.amount)).toFixed(2)}`} />
                  <Field label="税后预估到账" value={`¥${(Number(selected.amount) - calcWithholdingTax(Number(selected.amount))).toFixed(2)}`} strong />
                </>
              )}
              <Field label="申请时间" value={new Date(selected.created_at).toLocaleString('zh-CN')} />
              {selected.remark && <Field label="备注" value={selected.remark} />}
              {selected.reject_reason && <Field label="驳回原因" value={selected.reject_reason} />}
            </div>

            {/* 财务备注 */}
            <div>
              <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>财务备注 / 打款批次号</label>
              <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2}
                placeholder="选填，随审核/打款记录保存"
                style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {/* 操作区：按状态展示 */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.status === 'pending' && (
                <>
                  <button disabled={processing === selected.id} onClick={() => handleApprove(selected)}
                    style={{ padding: '12px', background: '#3B82F6', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                    审核通过
                  </button>
                  <button disabled={processing === selected.id} onClick={() => handleReject(selected)}
                    style={{ padding: '12px', background: 'transparent', border: '1px solid #EF4444', borderRadius: 8, color: '#EF4444', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                    驳回申请
                  </button>
                </>
              )}
              {selected.status === 'approved' && (
                <>
                  <button disabled={processing === selected.id} onClick={() => handlePay(selected)}
                    style={{ padding: '12px', background: '#10B981', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                    {selected.kind === 'settlement' ? '执行分账打款' : '确认打款'}
                  </button>
                  <button disabled={processing === selected.id} onClick={() => handleReject(selected)}
                    style={{ padding: '12px', background: 'transparent', border: '1px solid #EF4444', borderRadius: 8, color: '#EF4444', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                    驳回申请
                  </button>
                </>
              )}
              {(selected.status === 'paid' || selected.status === 'rejected') && (
                <div style={{ textAlign: 'center', padding: '12px', color: '#6B7280', fontSize: 13 }}>
                  该申请已{STATUS_LABEL[selected.status]}，流程结束。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ color: '#9CA3AF', fontSize: 13, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: strong ? '#E5E7EB' : '#C9D1D9', fontSize: 14, fontWeight: strong ? 700 : 500, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
