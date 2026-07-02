// @title 提现管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { applyWithdraw, getMyWithdrawals, getMyBalance, getMerchantStore } from '@/db/api'
import type { Withdrawal, WithdrawMethod } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

type Tab = 'apply' | 'records'
type MethodKey = WithdrawMethod

const methodOptions: { key: MethodKey; label: string; icon: string }[] = [
  { key: 'bank', label: '银行卡', icon: 'i-mdi-bank-outline' },
  { key: 'alipay', label: '支付宝', icon: 'i-mdi-alpha-a-box-outline' },
  { key: 'wechat', label: '微信', icon: 'i-mdi-wechat' },
]

const statusLabel: Record<string, string> = {
  pending: '审核中', approved: '已审核', rejected: '已拒绝', paid: '已到账',
}
const statusColor: Record<string, string> = {
  pending: 'text-orange-500', approved: 'text-blue-500', rejected: 'text-red-500', paid: 'text-green-600',
}

function WithdrawPage() {
  const [tab, setTab] = useState<Tab>('apply')
  const [balance, setBalance] = useState(0)
  const [storeId, setStoreId] = useState<string | undefined>()
  const [records, setRecords] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 申请表单状态
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<MethodKey>('bank')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [alipayAccount, setAlipayAccount] = useState('')
  const [remark, setRemark] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [bal, store, recs] = await Promise.all([
      getMyBalance(), getMerchantStore(), getMyWithdrawals(),
    ])
    setBalance(bal.balance)
    setStoreId(store?.id)
    setRecords(recs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { Taro.showToast({ title: '请填写正确的提现金额', icon: 'none' }); return }
    if (amt > balance / 100) { Taro.showToast({ title: '提现金额不能超过可用余额', icon: 'none' }); return }
    if (method === 'bank') {
      if (!bankName.trim()) { Taro.showToast({ title: '请填写开户行', icon: 'none' }); return }
      if (!bankAccount.trim()) { Taro.showToast({ title: '请填写银行卡号', icon: 'none' }); return }
      if (!bankHolder.trim()) { Taro.showToast({ title: '请填写持卡人姓名', icon: 'none' }); return }
    }
    if (method === 'alipay' && !alipayAccount.trim()) {
      Taro.showToast({ title: '请填写支付宝账号', icon: 'none' }); return
    }
    setSubmitting(true)
    const result = await applyWithdraw({
      store_id: storeId,
      amount: amt,
      withdraw_method: method,
      bank_name: method === 'bank' ? bankName : undefined,
      bank_account: method === 'bank' ? bankAccount : (method === 'alipay' ? alipayAccount : undefined),
      bank_holder: method === 'bank' ? bankHolder : undefined,
      alipay_account: method === 'alipay' ? alipayAccount : undefined,
      remark: remark || undefined,
    })
    setSubmitting(false)
    if (result) {
      Taro.showToast({ title: '申请已提交，等待审核', icon: 'success' })
      setAmount(''); setBankName(''); setBankAccount(''); setBankHolder(''); setAlipayAccount(''); setRemark('')
      setTab('records')
      load()
    } else {
      Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  // 可提余额（积分 100 = 1元，balance 字段单位为积分/金豆）
  const availableYuan = (balance / 100).toFixed(2)

  return (<RouteGuard>
    <div className="min-h-screen bg-background pb-8">
      {/* 顶部导航 */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">提现管理</span>
      </div>

      {/* 余额卡 */}
      <div className="mx-4 mt-3 p-5 rounded-3xl" style={{ background: 'linear-gradient(135deg, #C2410C, #EA580C)' }}>
        <p className="text-xl text-white/80 mb-1">可提现余额（金豆）</p>
        <p className="text-4xl font-bold text-white">{balance.toLocaleString()}<span className="text-xl ml-1">豆</span></p>
        <p className="text-xl text-white/70 mt-2">≈ ¥{availableYuan}</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([['apply', '申请提现'], ['records', '提现记录']] as const).map(([key, label]) => (
          <div key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </div>
        ))}
      </div>

      {/* 申请表单 */}
      {tab === 'apply' && (
        <div className="px-4 mt-4">
          {/* 金额 */}
          <div className="bg-card rounded-2xl border border-border p-4 mb-4">
            <p className="text-xl font-bold text-foreground mb-3">提现金额（元）</p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden flex items-center gap-2">
              <span className="text-2xl text-muted-foreground">¥</span>
              <input className="flex-1 text-2xl font-bold text-foreground bg-transparent outline-none"
                placeholder="0.00"
                value={amount}
                onInput={e => { const ev = e as any; setAmount(ev.detail?.value ?? ev.target?.value ?? '') }} />
              <button type="button"
                className="flex items-center justify-center leading-none rounded-lg bg-muted"
                onClick={() => setAmount(availableYuan)}>
                <div className="px-3 py-1 text-xl text-primary font-bold">全部</div>
              </button>
            </div>
            <p className="text-base text-muted-foreground mt-2">可提：¥{availableYuan}（最低提现 ¥1.00）</p>
          </div>

          {/* 提现方式 */}
          <div className="bg-card rounded-2xl border border-border p-4 mb-4">
            <p className="text-xl font-bold text-foreground mb-3">收款方式</p>
            <div className="flex gap-3">
              {methodOptions.map(m => (
                <div key={m.key}
                  className={`flex-1 flex flex-col items-center py-4 rounded-2xl border-2 transition ${method === m.key ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                  onClick={() => setMethod(m.key)}>
                  <div className={`${m.icon} text-3xl ${method === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-xl mt-2 font-bold ${method === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 收款账户信息 */}
          <div className="bg-card rounded-2xl border border-border p-4 mb-4">
            <p className="text-xl font-bold text-foreground mb-3">账户信息</p>
            {method === 'bank' && (
              <>
                {[
                  { label: '开户行', val: bankName, set: setBankName, placeholder: '如：中国工商银行' },
                  { label: '银行卡号', val: bankAccount, set: setBankAccount, placeholder: '请输入银行卡号' },
                  { label: '持卡人姓名', val: bankHolder, set: setBankHolder, placeholder: '请输入持卡人真实姓名' },
                ].map(f => (
                  <div key={f.label} className="mb-3">
                    <p className="text-xl text-foreground mb-1">{f.label}</p>
                    <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                      <input className="w-full text-xl text-foreground bg-transparent outline-none"
                        placeholder={f.placeholder} value={f.val}
                        onInput={e => { const ev = e as any; f.set(ev.detail?.value ?? ev.target?.value ?? '') }} />
                    </div>
                  </div>
                ))}
              </>
            )}
            {method === 'alipay' && (
              <div className="mb-3">
                <p className="text-xl text-foreground mb-1">支付宝账号</p>
                <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                  <input className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder="手机号或邮箱" value={alipayAccount}
                    onInput={e => { const ev = e as any; setAlipayAccount(ev.detail?.value ?? ev.target?.value ?? '') }} />
                </div>
              </div>
            )}
            {method === 'wechat' && (
              <div className="flex flex-col items-center py-6 gap-2">
                <div className="i-mdi-wechat text-5xl text-green-500" />
                <p className="text-xl text-muted-foreground text-center">微信到账将打款至您的微信零钱，无需填写账号</p>
              </div>
            )}
            {/* 备注 */}
            <div>
              <p className="text-xl text-foreground mb-1">备注（可选）</p>
              <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                <input className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="如有特殊说明可填写"
                  value={remark}
                  onInput={e => { const ev = e as any; setRemark(ev.detail?.value ?? ev.target?.value ?? '') }} />
              </div>
            </div>
          </div>

          {/* 提交按钮 */}
          <button type="button"
            className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
            onClick={handleSubmit}>
            <div className="py-4 text-xl font-bold text-white">{submitting ? '提交中…' : '立即申请提现'}</div>
          </button>
          <p className="text-base text-muted-foreground text-center mt-3">提现申请审核通常需要 1-3 个工作日</p>
        </div>
      )}

      {/* 提现记录 */}
      {tab === 'records' && (
        <div className="px-4 mt-4">
          {records.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="i-mdi-history text-6xl text-muted-foreground/40" />
              <p className="text-xl text-muted-foreground">暂无提现记录</p>
            </div>
          ) : (
            records.map(r => (
              <div key={r.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-foreground">¥{Number(r.amount).toFixed(2)}</span>
                  <span className={`text-xl font-bold ${statusColor[r.status] || 'text-foreground'}`}>
                    {statusLabel[r.status] || r.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xl text-muted-foreground">
                    {r.withdraw_method === 'bank' ? '银行卡' : r.withdraw_method === 'alipay' ? '支付宝' : '微信'}
                  </span>
                  {r.bank_account && (
                    <span className="text-xl text-muted-foreground">
                      {r.bank_account.slice(-4).padStart(r.bank_account.length, '·')}
                    </span>
                  )}
                </div>
                {r.reject_reason && (
                  <div className="mt-2 p-3 bg-red-50 rounded-xl">
                    <p className="text-xl text-red-500">拒绝原因：{r.reject_reason}</p>
                  </div>
                )}
                <p className="text-base text-muted-foreground mt-2">
                  {new Date(r.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default WithdrawPage
