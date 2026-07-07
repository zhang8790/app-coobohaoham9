import { View, Button, Input, Text } from '@tarojs/components'
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
    setBalance(bal.gold_beans)
    setStoreId(store?.id)
    setRecords(recs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { Taro.showToast({ title: '请填写正确的提现金额', icon: 'none' }); return }
    if (amt > balance) { Taro.showToast({ title: '提现金额不能超过可用余额', icon: 'none' }); return }
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
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  // 可提余额（金豆 1 豆 = 1 元，已统一为 1:1）
  const availableYuan = balance.toFixed(2)

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {/* 余额卡 */}
      <View className="mx-4 mt-3 p-5 rounded-3xl" style={{ background: 'linear-gradient(135deg, #C2410C, #EA580C)' }}>
        <Text className="text-xl text-white/80 mb-1">可提现余额（元）</Text>
        <Text className="text-4xl font-bold text-white">{balance.toLocaleString()}<Text className="text-xl ml-1">豆</Text></Text>
        <Text className="text-xl text-white/70 mt-2">≈ ¥{availableYuan}</Text>
      </View>

      {/* Tab 切换 */}
      <View className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([['apply', '申请提现'], ['records', '提现记录']] as const).map(([key, label]) => (
          <View key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </View>
        ))}
      </View>

      {/* 申请表单 */}
      {tab === 'apply' && (
        <View className="px-4 mt-4">
          {/* 金额 */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-xl font-bold text-foreground mb-3">提现金额（元）</Text>
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden flex items-center gap-2">
              <Text className="text-2xl text-muted-foreground">¥</Text>
              <Input className="flex-1 text-2xl font-bold text-foreground bg-transparent outline-none"
                placeholder="0.00"
                value={amount}
                onInput={e => { const ev = e as any; setAmount(ev.detail?.value ?? ev.target?.value ?? '') }} />
              <Button type="button"
                className="flex items-center justify-center leading-none rounded-lg bg-muted"
                onClick={() => setAmount(availableYuan)}>
                <View className="px-3 py-1 text-xl text-primary font-bold">全部</View>
              </Button>
            </View>
            <Text className="text-base text-muted-foreground mt-2">可提：¥{availableYuan}（最低提现 ¥1.00）</Text>
          </View>

          {/* 提现方式 */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-xl font-bold text-foreground mb-3">收款方式</Text>
            <View className="flex gap-3">
              {methodOptions.map(m => (
                <View key={m.key}
                  className={`flex-1 flex flex-col items-center py-4 rounded-2xl border-2 transition ${method === m.key ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                  onClick={() => setMethod(m.key)}>
                  <View className={`${m.icon} text-3xl ${method === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
                  <Text className={`text-xl mt-2 font-bold ${method === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 收款账户信息 */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-xl font-bold text-foreground mb-3">账户信息</Text>
            {method === 'bank' && (
              <>
                {[
                  { label: '开户行', val: bankName, set: setBankName, placeholder: '如：中国工商银行' },
                  { label: '银行卡号', val: bankAccount, set: setBankAccount, placeholder: '请输入银行卡号' },
                  { label: '持卡人姓名', val: bankHolder, set: setBankHolder, placeholder: '请输入持卡人真实姓名' },
                ].map(f => (
                  <View key={f.label} className="mb-3">
                    <Text className="text-xl text-foreground mb-1">{f.label}</Text>
                    <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                      <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                        placeholder={f.placeholder} value={f.val}
                        onInput={e => { const ev = e as any; f.set(ev.detail?.value ?? ev.target?.value ?? '') }} />
                    </View>
                  </View>
                ))}
              </>
            )}
            {method === 'alipay' && (
              <View className="mb-3">
                <Text className="text-xl text-foreground mb-1">支付宝账号</Text>
                <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                  <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder="手机号或邮箱" value={alipayAccount}
                    onInput={e => { const ev = e as any; setAlipayAccount(ev.detail?.value ?? ev.target?.value ?? '') }} />
                </View>
              </View>
            )}
            {method === 'wechat' && (
              <View className="flex flex-col items-center py-6 gap-2">
                <View className="i-mdi-wechat text-5xl text-green-500" />
                <Text className="text-xl text-muted-foreground text-center">微信到账将打款至您的微信零钱，无需填写账号</Text>
              </View>
            )}
            {/* 备注 */}
            <View>
              <Text className="text-xl text-foreground mb-1">备注（可选）</Text>
              <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="如有特殊说明可填写"
                  value={remark}
                  onInput={e => { const ev = e as any; setRemark(ev.detail?.value ?? ev.target?.value ?? '') }} />
              </View>
            </View>
          </View>

          {/* 提交按钮 */}
          <Button type="button"
            className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
            onClick={handleSubmit}>
            <View className="py-4 text-xl font-bold text-white">{submitting ? '提交中…' : '立即申请提现'}</View>
          </Button>
          <Text className="text-base text-muted-foreground text-center mt-3">提现申请审核通常需要 1-3 个工作日</Text>
          <View className="mt-2 text-center" onClick={() => Taro.navigateTo({ url: '/pages/withdraw-rules/index' })}>
            <Text className="text-base text-primary">查看《提现规则》</Text>
          </View>
        </View>
      )}

      {/* 提现记录 */}
      {tab === 'records' && (
        <View className="px-4 mt-4">
          {records.length === 0 ? (
            <View className="flex flex-col items-center py-16 gap-3">
              <View className="i-mdi-history text-6xl text-muted-foreground/40" />
              <Text className="text-xl text-muted-foreground">暂无提现记录</Text>
            </View>
          ) : (
            records.map(r => (
              <View key={r.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
                <View className="flex items-center justify-between mb-2">
                  <Text className="text-2xl font-bold text-foreground">¥{Number(r.amount).toFixed(2)}</Text>
                  <Text className={`text-xl font-bold ${statusColor[r.status] || 'text-foreground'}`}>
                    {statusLabel[r.status] || r.status}
                  </Text>
                </View>
                <View className="flex items-center gap-3">
                  <Text className="text-xl text-muted-foreground">
                    {r.withdraw_method === 'bank' ? '银行卡' : r.withdraw_method === 'alipay' ? '支付宝' : '微信'}
                  </Text>
                  {r.bank_account && (
                    <Text className="text-xl text-muted-foreground">
                      {r.bank_account.slice(-4).padStart(r.bank_account.length, '·')}
                    </Text>
                  )}
                </View>
                {r.reject_reason && (
                  <View className="mt-2 p-3 bg-red-50 rounded-xl">
                    <Text className="text-xl text-red-500">拒绝原因：{r.reject_reason}</Text>
                  </View>
                )}
                <Text className="text-base text-muted-foreground mt-2">
                  {new Date(r.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default WithdrawPage
