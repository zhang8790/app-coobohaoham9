// @title 自营门店中心 - 货款提现（真实数据）
// 双通道隔离：本页 = 商家货款结算通道（kind='settlement'），与用户侧「健康豆（推广佣金）」完全独立。
// 余额来自门店 merchant_settlement，提交走原子 RPC fn_merchant_withdraw（预扣余额 + 写单 + 关联结算单）。
// 严禁在此页接入任何「用户佣金/健康豆」口径。
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore, getMerchantWithdrawals, getMerchantSettlementBalance, applyMerchantSettlementWithdrawal } from '@/api/merchant'
import { supabase } from '@/lib/supabase'
import type { WithdrawalRecord, SavedWithdrawalAccount } from '@/types'

const STATUS_LABEL: Record<string, string> = { pending: '审核中', approved: '已审核', paid: '已到账', rejected: '已拒绝' }
const STATUS_COLOR: Record<string, string> = { pending: 'var(--warning)', approved: 'var(--info)', paid: 'var(--success-strong)', rejected: 'var(--danger)' }

export default function MerchantWithdraw() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<'balance' | 'record'>('balance')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'bank' | 'alipay'>('alipay')
  const [account, setAccount] = useState('')
  const [name, setName] = useState('')
  const [idCard, setIdCard] = useState('')
  const [bankName, setBankName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [records, setRecords] = useState<WithdrawalRecord[]>([])
  // 货款结算余额概览（替代原「佣金余额」）：可结算货款 / 冻结中 / 累计已结算
  const [balance, setBalance] = useState<{ merchant_balance: number; settlement_frozen: number; total_settled: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  // 已保存收款账户（双通道隔离：门店货款通道用 owner_type='store'，与用户健康豆通道 owner_type='user' 互不串）
  const [savedAccounts, setSavedAccounts] = useState<SavedWithdrawalAccount[]>([])
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)

  const loadSavedAccounts = async (sid: string) => {
    try {
      const { data, error } = await supabase.rpc('fn_get_withdrawal_accounts', {
        p_owner_id: sid, p_owner_type: 'store',
      })
      if (error) return
      const d = (data as any) || {}
      const list = (d.accounts ?? []) as SavedWithdrawalAccount[]
      setSavedAccounts(list)
      const def = list.find(a => a.is_default) || list[0]
      if (def) applySavedAccount(def)
    } catch (e) { console.warn('[merchant/Withdraw] 拉已保存账户失败', e) }
  }

  const applySavedAccount = (a: SavedWithdrawalAccount) => {
    setSelectedSavedId(a.id)
    setMethod(a.method as any)
    setName(a.real_name || '')
    setIdCard(a.id_card || '')
    setBankName(a.bank_name || '')
    setAccount(a.method === 'bank' ? (a.bank_account || '') : (a.alipay_account || ''))
  }

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      setStoreId(store?.id || null)
      const [wds, bal] = await Promise.all([
        getMerchantWithdrawals(profile.id).catch(() => [] as WithdrawalRecord[]),
        store?.id ? getMerchantSettlementBalance(store.id).catch(() => null) : Promise.resolve(null),
      ])
      // 仅展示本店货款结算提现（kind='settlement'），与用户佣金通道隔离
      const settleRecords = (wds || []).filter(r => (r.kind || 'settlement') === 'settlement')
      if (!cancelled) {
        setRecords(settleRecords)
        setBalance(bal ? {
          merchant_balance: bal.merchant_balance,
          settlement_frozen: bal.settlement_frozen,
          total_settled: bal.total_settled,
        } : null)
        setLoading(false)
      }
      if (store?.id) await loadSavedAccounts(store.id)
    })()
    return () => { cancelled = true }
  }, [profile])

  const available = balance?.merchant_balance ?? 0
  // 已提现（货款通道：已通过/已打款）
  const withdrawn = records
    .filter(r => ['paid', 'approved'].includes(r.status))
    .reduce((s, r) => s + Number(r.amount || 0), 0)

  const reload = async () => {
    if (!profile || !storeId) return
    const [wds, bal] = await Promise.all([
      getMerchantWithdrawals(profile.id).catch(() => [] as WithdrawalRecord[]),
      getMerchantSettlementBalance(storeId).catch(() => null),
    ])
    setRecords((wds || []).filter(r => (r.kind || 'settlement') === 'settlement'))
    if (bal) setBalance({ merchant_balance: bal.merchant_balance, settlement_frozen: bal.settlement_frozen, total_settled: bal.total_settled })
  }

  const handleSubmit = async () => {
    if (!profile || !storeId) return
    const amt = parseFloat(amount)
    if (!amt || amt < 1) { alert('提现金额不得低于¥1'); return }
    if (amt > available) { alert('提现金额不得超过可结算货款'); return }
    if (!account.trim()) { alert('请输入到账账号'); return }
    if (!name.trim()) { alert('请输入真实姓名'); return }
    if (method === 'bank' && !bankName.trim()) { alert('请输入开户银行'); return }
    if (!idCard.trim()) { alert('请输入身份证号（打款核对）'); return }
    // 组装账户信息（与小程序货款提现通道一致）
    const account_info: Record<string, unknown> = method === 'bank'
      ? { bank_name: bankName.trim(), bank_account: account.trim(), bank_holder: name.trim(), id_card: idCard.trim() }
      : method === 'alipay'
        ? { alipay_account: account.trim(), id_card: idCard.trim() }
        : { id_card: idCard.trim() }
    setSubmitting(true)
    try {
      const r = await applyMerchantSettlementWithdrawal({ store_id: storeId, amount: amt, method, account_info })
      if (!r.ok) { alert('提交失败：' + (r.error || '未知错误')); return }
      // 提交成功后异步保存为「已保存账户」（不阻塞主流程），按门店维度隔离
      ;(async () => {
        try {
          await supabase.rpc('fn_save_withdrawal_account', {
            p_owner_id: storeId, p_owner_type: 'store',
            p_method: method,
            p_real_name: name.trim(), p_id_card: idCard.trim(),
            p_bank_name: method === 'bank' ? bankName.trim() : null,
            p_bank_account: method === 'bank' ? account.trim() : null,
            p_bank_holder: method === 'bank' ? name.trim() : null,
            p_alipay_account: method === 'alipay' ? account.trim() : null,
            p_make_default: true,
          })
          await loadSavedAccounts(storeId)
        } catch (e) { console.warn('[merchant/Withdraw] 保存收款账户失败', e) }
      })()
      await reload()
      setAmount(''); setAccount(''); setName(''); setIdCard(''); setBankName('')
      setSelectedSavedId(null)
      alert('货款提现申请已提交，平台审核后由微信分账直达您的子商户号')
    } catch (e: any) { alert('提交失败：' + (e?.message || e)) }
    finally { setSubmitting(false) }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, marginBottom: 24 }}> 货款提现</h2>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}

      {!loading && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[{ key: 'balance', label: '申请提现' }, { key: 'record', label: '提现记录' }].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{
                padding: '8px 20px',
                background: activeTab === tab.key ? 'var(--primary)' : 'var(--surface-2)',
                border: `1px solid ${activeTab === tab.key ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8,
                color: activeTab === tab.key ? 'white' : 'var(--text-muted)',
                fontSize: 14,
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'balance' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>账户总览</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>可结算货款</span>
                      <span style={{ color: 'var(--success-strong)', fontSize: 24, fontWeight: 800 }}>¥{balance ? balance.merchant_balance.toFixed(2) : '0.00'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>冻结中货款</span>
                      <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>¥{balance ? balance.settlement_frozen.toFixed(2) : '0.00'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>累计已结算</span>
                      <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>¥{balance ? balance.total_settled.toFixed(2) : '0.00'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>已提现</span>
                      <span style={{ color: 'var(--text-dim)', fontSize: 15 }}>¥{withdrawn.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <h4 style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}> 提现须知</h4>
                  <ul style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.8, paddingLeft: 16 }}>
                    <li>最低提现金额：¥1</li>
                    <li>到账方式：微信服务商分账直达门店子商户号（含健康豆垫付部分由平台自有资金打款）</li>
                    <li>提现由平台审核后打款，审核 1-3 个工作日</li>
                  </ul>
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>申请提现</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>提现金额（元）*</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="请输入提现金额" style={{ flex: 1, padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 16, outline: 'none' }} />
                      <button onClick={() => setAmount(String(available))} style={{ padding: '12px 16px', background: 'transparent', border: '1px solid var(--success-strong)', borderRadius: 8, color: 'var(--success-strong)', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>全部</button>
                    </div>
                    <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>可结算货款：{available.toFixed(2)}</p>
                  </div>
                  {/* 已保存收款账户（双通道隔离：owner_type='store'）—— 快速选择 */}
                  {savedAccounts.length > 0 && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>
                        已保存账户
                        <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 8 }}>选一张免填下方信息</span>
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {savedAccounts.map(a => {
                          const mask = (s: string | null) => s ? `${s.slice(0, 2)}****${s.slice(-2)}` : ''
                          const label = a.method === 'bank'
                            ? `${a.bank_name || '银行卡'} ${mask(a.bank_account)}`
                            : `支付宝 ${mask(a.alipay_account)}`
                          const active = selectedSavedId === a.id
                          return (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div onClick={() => applySavedAccount(a)} style={{
                                padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                                background: active ? 'var(--primary)' : 'var(--bg)',
                                color: active ? 'white' : 'var(--text-muted)',
                                border: `1px solid ${active ? 'var(--primary)' : 'var(--border-soft)'}`,
                              }}>
                                {a.is_default && '⭐ '}{label}
                              </div>
                              <button onClick={async () => {
                                if (!confirm(`删除「${label}」？`)) return
                                const { error } = await supabase.rpc('fn_delete_withdrawal_account', { p_id: a.id })
                                if (error) { alert('删除失败：' + error.message); return }
                                setSavedAccounts(prev => prev.filter(x => x.id !== a.id))
                                if (selectedSavedId === a.id) setSelectedSavedId(null)
                              }} style={{ padding: '4px 6px', background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }} title="删除">🗑</button>
                            </div>
                          )
                        })}
                        <div onClick={() => { setSelectedSavedId(null); setName(''); setIdCard(''); setBankName(''); setAccount('') }} style={{
                          padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                          background: 'transparent', color: 'var(--text-muted)',
                          border: '1px dashed var(--border-soft)',
                        }}>
                          + 使用新账户
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>到账方式</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[{ key: 'alipay', label: '支付宝', icon: '💰' }, { key: 'bank', label: '银行卡', icon: '🏦' }].map(m => (
                        <div key={m.key} onClick={() => setMethod(m.key as any)} style={{
                          flex: 1, padding: '12px', background: method === m.key ? 'var(--primary)20' : 'var(--bg)',
                          border: `2px solid ${method === m.key ? 'var(--primary)' : 'var(--border-soft)'}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                          <span style={{ fontSize: 20, display: 'block', marginBottom: 4 }}>{m.icon}</span>
                          <span style={{ color: method === m.key ? 'var(--primary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>真实姓名 <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入与收款账户一致的真实姓名" style={{ width: '100%', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>身份证号 <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input value={idCard} onChange={e => setIdCard(e.target.value)} placeholder="用于打款核对，仅平台打款核对" style={{ width: '100%', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {method === 'bank' && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>开户银行 <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="如：中国工商银行" style={{ width: '100%', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  )}
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>{method === 'alipay' ? '支付宝账号' : '银行卡号'} <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input value={account} onChange={e => setAccount(e.target.value)} placeholder={method === 'alipay' ? '请输入支付宝账号' : '请输入银行卡号'} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '14px', background: submitting ? 'var(--border-soft)' : 'var(--primary)', border: 'none', borderRadius: 8, color: 'white', fontSize: 16, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', marginTop: 8 }}>{submitting ? '提交中...' : `确认提现 ¥${amount || '0'}`}</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {records.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>暂无货款提现记录</div>
              ) : records.map(record => (
                <div key={record.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ color: STATUS_COLOR[record.status] || 'var(--text-dim)', fontSize: 12, fontWeight: 600, padding: '2px 8px', background: `${(STATUS_COLOR[record.status] || 'var(--text-dim)')}20`, borderRadius: 4 }}>{STATUS_LABEL[record.status] || record.status}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>货款结算</span>
                      </div>
                      <p style={{ color: 'var(--text)', fontSize: 14 }}>申请时间：{record.created_at}</p>
                      {record.transferred_at && <p style={{ color: 'var(--success-strong)', fontSize: 13, marginTop: 4 }}>到账时间：{record.transferred_at}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: 'var(--primary)', fontSize: 24, fontWeight: 800 }}>¥{Number(record.amount || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
