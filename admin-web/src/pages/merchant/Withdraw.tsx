// @title 商家中心 - 佣金提现（真实数据）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore, getMerchantWithdrawals, getCommissionBalance, createWithdrawal } from '@/api/merchant'
import { supabase } from '@/lib/supabase'
import type { WithdrawalRecord, SavedWithdrawalAccount } from '@/types'

const STATUS_LABEL: Record<string, string> = { pending: '审核中', approved: '已审核', paid: '已到账', rejected: '已拒绝' }
const STATUS_COLOR: Record<string, string> = { pending: '#F59E0B', approved: '#3B82F6', paid: '#059669', rejected: '#EF4444' }

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
  const [balance, setBalance] = useState<{ available: number; totalEarned: number; withdrawn: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  // 已保存收款账户（迁移 00123）：绑定一次后免二次填写
  const [savedAccounts, setSavedAccounts] = useState<SavedWithdrawalAccount[]>([])
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)

  const loadSavedAccounts = async (uid: string) => {
    try {
      const { data, error } = await supabase.rpc('fn_get_withdrawal_accounts', {
        p_owner_id: uid, p_owner_type: 'user',
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
        getMerchantWithdrawals(profile.id).catch(() => []),
        getCommissionBalance(profile.id).catch(() => null),
      ])
      if (!cancelled) { setRecords(wds); setBalance(bal); setLoading(false) }
      await loadSavedAccounts(profile.id)
    })()
    return () => { cancelled = true }
  }, [profile])

  const reload = async () => {
    if (!profile) return
    const [wds, bal] = await Promise.all([
      getMerchantWithdrawals(profile.id).catch(() => []),
      getCommissionBalance(profile.id).catch(() => null),
    ])
    setRecords(wds); setBalance(bal)
  }

  const handleSubmit = async () => {
    if (!profile) return
    const amt = parseFloat(amount)
    if (!amt || amt < 100) { alert('提现金额不得低于¥100'); return }
    if (balance && amt > balance.available) { alert('提现金额不得超过可提现佣金'); return }
    if (!account.trim()) { alert('请输入到账账号'); return }
    if (!name.trim()) { alert('请输入真实姓名'); return }
    if (method === 'bank' && !bankName.trim()) { alert('请输入开户银行'); return }
    if (!idCard.trim()) { alert('请输入身份证号（打款核对）'); return }
    setSubmitting(true)
    try {
      await createWithdrawal({ userId: profile.id, storeId, amount: amt, method, account: account.trim(), name: name.trim(), idCard: idCard.trim(), bankName: method === 'bank' ? bankName.trim() : undefined })
      // 提交成功后异步保存为「已保存账户」（不阻塞主流程）
      ;(async () => {
        try {
          await supabase.rpc('fn_save_withdrawal_account', {
            p_owner_id: profile.id, p_owner_type: 'user',
            p_method: method,
            p_real_name: name.trim(), p_id_card: idCard.trim(),
            p_bank_name: method === 'bank' ? bankName.trim() : null,
            p_bank_account: method === 'bank' ? account.trim() : null,
            p_bank_holder: method === 'bank' ? name.trim() : null,
            p_alipay_account: method === 'alipay' ? account.trim() : null,
            p_make_default: true,
          })
          // 刷新一下列表，让"已保存账户"下拉显示新卡
          await loadSavedAccounts(profile.id)
        } catch (e) { console.warn('[merchant/Withdraw] 保存收款账户失败', e) }
      })()
      await reload()
      setAmount(''); setAccount(''); setName(''); setIdCard(''); setBankName('')
      setSelectedSavedId(null)
      alert('提现申请已提交，预计1-2个工作日到账')
    } catch (e: any) { alert('提交失败：' + (e?.message || e)) }
    finally { setSubmitting(false) }
  }

  return (
    <div>
      <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>💰 佣金提现</h2>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>加载中…</div>}

      {!loading && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[{ key: 'balance', label: '申请提现' }, { key: 'record', label: '提现记录' }].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{
                padding: '8px 20px',
                background: activeTab === tab.key ? '#C2410C' : '#111827',
                border: `1px solid ${activeTab === tab.key ? '#C2410C' : '#1F2937'}`,
                borderRadius: 8,
                color: activeTab === tab.key ? 'white' : '#9CA3AF',
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
                <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>账户总览</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#9CA3AF', fontSize: 14 }}>可提现佣金</span>
                      <span style={{ color: '#059669', fontSize: 24, fontWeight: 800 }}>¥{balance ? balance.available.toFixed(2) : '0.00'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#9CA3AF', fontSize: 13 }}>累计收益</span>
                      <span style={{ color: '#E5E7EB', fontSize: 15, fontWeight: 600 }}>¥{balance ? balance.totalEarned.toFixed(2) : '0.00'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#9CA3AF', fontSize: 13 }}>已提现</span>
                      <span style={{ color: '#6B7280', fontSize: 15 }}>¥{balance ? balance.withdrawn.toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 16 }}>
                  <h4 style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>📋 提现须知</h4>
                  <ul style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.8, paddingLeft: 16 }}>
                    <li>最低提现金额：¥100</li>
                    <li>到账时间：1-2个工作日</li>
                    <li>提现由平台审核后打款</li>
                  </ul>
                </div>
              </div>

              <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>申请提现</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>提现金额（元）*</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="请输入提现金额" style={{ flex: 1, padding: '12px 16px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 16, outline: 'none' }} />
                      <button onClick={() => balance && setAmount(String(balance.available))} style={{ padding: '12px 16px', background: 'transparent', border: '1px solid #059669', borderRadius: 8, color: '#059669', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>全部</button>
                    </div>
                    <p style={{ color: '#6B7280', fontSize: 12, marginTop: 6 }}>可提现佣金：{balance ? balance.available : '0'}</p>
                  </div>
                  {/* 已保存收款账户（迁移 00123）—— 快速选择 */}
                  {savedAccounts.length > 0 && (
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>
                        已保存账户
                        <span style={{ color: '#6B7280', fontSize: 12, marginLeft: 8 }}>选一张免填下方信息</span>
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
                                background: active ? '#C2410C' : '#0B0F19',
                                color: active ? 'white' : '#9CA3AF',
                                border: `1px solid ${active ? '#C2410C' : '#374151'}`,
                              }}>
                                {a.is_default && '⭐ '}{label}
                              </div>
                              <button onClick={async () => {
                                if (!confirm(`删除「${label}」？`)) return
                                const { error } = await supabase.rpc('fn_delete_withdrawal_account', { p_id: a.id })
                                if (error) { alert('删除失败：' + error.message); return }
                                setSavedAccounts(prev => prev.filter(x => x.id !== a.id))
                                if (selectedSavedId === a.id) setSelectedSavedId(null)
                              }} style={{ padding: '4px 6px', background: 'transparent', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 14 }} title="删除">🗑</button>
                            </div>
                          )
                        })}
                        <div onClick={() => { setSelectedSavedId(null); setName(''); setIdCard(''); setBankName(''); setAccount('') }} style={{
                          padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                          background: 'transparent', color: '#9CA3AF',
                          border: '1px dashed #374151',
                        }}>
                          + 使用新账户
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>到账方式</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[{ key: 'alipay', label: '支付宝', icon: '💰' }, { key: 'bank', label: '银行卡', icon: '🏦' }].map(m => (
                        <div key={m.key} onClick={() => setMethod(m.key as any)} style={{
                          flex: 1, padding: '12px', background: method === m.key ? '#C2410C20' : '#0B0F19',
                          border: `2px solid ${method === m.key ? '#C2410C' : '#374151'}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                          <span style={{ fontSize: 20, display: 'block', marginBottom: 4 }}>{m.icon}</span>
                          <span style={{ color: method === m.key ? '#C2410C' : '#9CA3AF', fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>真实姓名 <span style={{ color: '#EF4444' }}>*</span></label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入与收款账户一致的真实姓名" style={{ width: '100%', padding: '12px 16px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>身份证号 <span style={{ color: '#EF4444' }}>*</span></label>
                    <input value={idCard} onChange={e => setIdCard(e.target.value)} placeholder="用于打款核对，仅平台财务可见" style={{ width: '100%', padding: '12px 16px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {method === 'bank' && (
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>开户银行 <span style={{ color: '#EF4444' }}>*</span></label>
                      <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="如：中国工商银行" style={{ width: '100%', padding: '12px 16px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  )}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 8 }}>{method === 'alipay' ? '支付宝账号' : '银行卡号'} <span style={{ color: '#EF4444' }}>*</span></label>
                    <input value={account} onChange={e => setAccount(e.target.value)} placeholder={method === 'alipay' ? '请输入支付宝账号' : '请输入银行卡号'} style={{ width: '100%', padding: '12px 16px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '14px', background: submitting ? '#374151' : '#C2410C', border: 'none', borderRadius: 8, color: 'white', fontSize: 16, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', marginTop: 8 }}>{submitting ? '提交中...' : `确认提现 ¥${amount || '0'}`}</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {records.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#6B7280', fontSize: 14 }}>暂无提现记录</div>
              ) : records.map(record => (
                <div key={record.id} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ color: STATUS_COLOR[record.status] || '#6B7280', fontSize: 12, fontWeight: 600, padding: '2px 8px', background: `${(STATUS_COLOR[record.status] || '#6B7280')}20`, borderRadius: 4 }}>{STATUS_LABEL[record.status] || record.status}</span>
                        <span style={{ color: '#6B7280', fontSize: 12 }}>{record.method} · {record.account}</span>
                      </div>
                      <p style={{ color: '#E5E7EB', fontSize: 14 }}>申请时间：{record.created_at}</p>
                      {record.transferred_at && <p style={{ color: '#059669', fontSize: 13, marginTop: 4 }}>到账时间：{record.transferred_at}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#C2410C', fontSize: 24, fontWeight: 800 }}>¥{record.amount.toFixed(2)}</p>
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
