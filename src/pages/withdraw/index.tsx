import { View, Button, Input, Text } from '@tarojs/components'
// @title 提现管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { applyWithdraw, getMyWithdrawals, getMyBalance, getMerchantStore, getMerchantSettlement, applyMerchantWithdrawal, getWithdrawalAccounts, saveWithdrawalAccount, deleteWithdrawalAccount } from '@/db/api'
import { supabase } from '@/client/supabase'
import type { Withdrawal, WithdrawMethod, SavedWithdrawalAccount } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import RiskWarning from '@/components/RiskWarning'

type Tab = 'apply' | 'records'
type MethodKey = WithdrawMethod
type WithdrawMode = 'commission' | 'settlement'

const methodOptions: { key: MethodKey; label: string; icon: string }[] = [
  { key: 'bank', label: '银行卡', icon: 'i-mdi-bank-outline' },
  { key: 'alipay', label: '支付宝', icon: 'i-mdi-alpha-a-box-outline' },
  { key: 'wechat', label: '微信', icon: 'i-mdi-wechat' },
]

const statusLabel: Record<string, string> = {
  pending: '审核中', approved: '已审核', rejected: '已拒绝', paid: '已到账', processing: '打款中',
}
const statusColor: Record<string, string> = {
  pending: 'text-orange-500', approved: 'text-blue-500', rejected: 'text-red-500', paid: 'text-green-600', processing: 'text-emerald-600',
}

function WithdrawPage() {
  const router = Taro.getCurrentInstance().router
  // 模式：默认佣金提现；商家中心「货款提现」携带 ?kind=settlement&storeId=xxx
  const mode: WithdrawMode = router?.params?.kind === 'settlement' ? 'settlement' : 'commission'
  const [tab, setTab] = useState<Tab>('apply')
  const [balance, setBalance] = useState(0)                 // 佣金余额（commission 模式）
  const [merchantBalance, setMerchantBalance] = useState(0) // 货款余额（settlement 模式）
  const [storeId, setStoreId] = useState<string | undefined>()
  const [records, setRecords] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 申请表单状态
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<MethodKey>('bank')
  const [realName, setRealName] = useState('')
  const [idCard, setIdCard] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [alipayAccount, setAlipayAccount] = useState('')
  const [remark, setRemark] = useState('')

  // 已保存收款账户（迁移 00123）：绑定一次，免二次填写
  const [savedAccounts, setSavedAccounts] = useState<SavedWithdrawalAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [useSaved, setUseSaved] = useState(false)   // true=选用已保存账户（隐藏手填）；false=手填/新增

  // 把已保存账户回填到表单字段
  const applyAccount = useCallback((a: SavedWithdrawalAccount) => {
    setMethod(a.method)
    setRealName(a.real_name ?? '')
    setIdCard(a.id_card ?? '')
    setBankName(a.bank_name ?? '')
    setBankAccount(a.bank_account ?? '')
    setBankHolder(a.bank_holder ?? '')
    setAlipayAccount(a.alipay_account ?? '')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let ownerId: string | undefined
    let ownerType: 'user' | 'store' = 'user'

    if (mode === 'settlement') {
      const sid = router?.params?.storeId || storeId
      setStoreId(sid)
      ownerId = sid
      ownerType = 'store'
      const [sett, wds] = await Promise.all([
        sid ? getMerchantSettlement(sid) : Promise.resolve(null),
        sid ? (async () => {
          const { data } = await supabase
            .from('withdrawals').select('*').eq('store_id', sid).eq('kind', 'settlement')
            .order('created_at', { ascending: false })
          return (data ?? []) as Withdrawal[]
        })() : Promise.resolve([]),
      ])
      setMerchantBalance(Number(sett?.merchant_balance ?? 0))
      setRecords(wds)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const [bal, store, recs] = await Promise.all([
        getMyBalance(), getMerchantStore(), getMyWithdrawals(),
      ])
      setBalance(bal.tb_balance)
      setStoreId(store?.id)
      setRecords(recs)
      ownerId = user?.id
      ownerType = 'user'
    }

    // 拉取已保存收款账户，自动带出默认/首个（绑定一次，免二次填写）
    if (ownerId) {
      const saved = await getWithdrawalAccounts(ownerId, ownerType)
      setSavedAccounts(saved)
      const def = saved.find(a => a.is_default) || saved[0]
      if (def) {
        applyAccount(def)
        setSelectedAccountId(def.id)
        setUseSaved(true)
      } else {
        setSelectedAccountId(null)
        setUseSaved(false)
      }
    } else {
      setSavedAccounts([])
    }
    setLoading(false)
  }, [mode, router, storeId, applyAccount])

  useEffect(() => { load() }, [load])

  // 导航栏标题随模式切换
  useEffect(() => {
    Taro.setNavigationBarTitle({ title: mode === 'settlement' ? '货款提现' : '佣金提现' })
  }, [mode])

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { Taro.showToast({ title: '请填写正确的提现金额', icon: 'none' }); return }
    const curBalance = mode === 'settlement' ? merchantBalance : balance
    if (amt > curBalance) {
      Taro.showToast({ title: mode === 'settlement' ? '提现金额不能超过可结算货款' : '提现金额不能超过可用佣金', icon: 'none' }); return
    }
    if (!realName.trim()) { Taro.showToast({ title: '请填写真实姓名', icon: 'none' }); return }
    if (method === 'bank') {
      if (!bankName.trim()) { Taro.showToast({ title: '请填写开户行', icon: 'none' }); return }
      if (!bankAccount.trim()) { Taro.showToast({ title: '请填写银行卡号', icon: 'none' }); return }
      if (!bankHolder.trim()) { Taro.showToast({ title: '请填写持卡人姓名', icon: 'none' }); return }
      if (!idCard.trim()) { Taro.showToast({ title: '请填写身份证号', icon: 'none' }); return }
    }
    if (method === 'alipay' && !alipayAccount.trim()) {
      Taro.showToast({ title: '请填写支付宝账号', icon: 'none' }); return
    }
    if (method !== 'bank' && !idCard.trim()) {
      Taro.showToast({ title: '请填写身份证号（打款核对）', icon: 'none' }); return
    }
    setSubmitting(true)
    let result: any = null
    if (mode === 'settlement') {
      const account_info: Record<string, unknown> = method === 'bank'
        ? { bank_name: bankName, bank_account: bankAccount, bank_holder: bankHolder, id_card: idCard }
        : method === 'alipay'
          ? { alipay_account: alipayAccount, id_card: idCard }
          : { id_card: idCard }
      const r = await applyMerchantWithdrawal({
        store_id: (router?.params?.storeId || storeId) as string,
        amount: amt,
        method,
        account_info,
      })
      result = r.ok ? {} : null
      if (!r.ok) Taro.showToast({ title: r.error || '提交失败', icon: 'none' })
    } else {
      result = await applyWithdraw({
        store_id: storeId,
        amount: amt,
        withdraw_method: method,
        bank_name: method === 'bank' ? bankName : undefined,
        bank_account: method === 'bank' ? bankAccount : (method === 'alipay' ? alipayAccount : undefined),
        bank_holder: method === 'bank' ? bankHolder : undefined,
        alipay_account: method === 'alipay' ? alipayAccount : undefined,
        real_name: realName.trim(),
        id_card: idCard.trim(),
        remark: remark || undefined,
      })
    }
    setSubmitting(false)
    if (result) {
      // 提交成功后，异步把当前账户存为「已保存账户」（不阻塞主流程）
      // user 维度：佣金模式按 user.id 存；store 维度：货款模式按 store_id 存
      // 重复存同一张卡由 fn_save_withdrawal_account 内部去重（method+账号相同视为同一张）
      const sid = (router?.params?.storeId || storeId) as string | undefined
      ;(async () => {
        try {
          if (mode === 'settlement' && sid) {
            await saveWithdrawalAccount({
              ownerId: sid, ownerType: 'store',
              method, realName, idCard, bankName, bankAccount, bankHolder, alipayAccount, makeDefault: true,
            })
          } else {
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.id) {
              await saveWithdrawalAccount({
                ownerId: user.id, ownerType: 'user',
                method, realName, idCard, bankName, bankAccount, bankHolder, alipayAccount, makeDefault: true,
              })
            }
          }
        } catch (e) { console.warn('[withdraw] 保存收款账户失败，不影响提现', e) }
      })()

      Taro.showToast({ title: '申请已提交，等待审核', icon: 'success' })
      setAmount(''); setRealName(''); setIdCard(''); setBankName(''); setBankAccount(''); setBankHolder(''); setAlipayAccount(''); setRemark('')
      setSelectedAccountId(null); setUseSaved(false)
      setTab('records')
      load()
    } else if (mode === 'settlement') {
      // settlement 失败时上面已 toast
    } else {
      Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  // 可提余额（佣金模式=推广佣金；结算模式=商家货款）
  const availableYuan = (mode === 'settlement' ? merchantBalance : balance).toFixed(2)

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      <RiskWarning />

      {/* 余额卡 */}
      {mode === 'settlement' ? (
        <View className="mx-4 mt-3 p-5 rounded-3xl" style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}>
          <Text className="text-xl text-white/80 mb-1">可结算货款（元）</Text>
          <Text className="text-4xl font-bold text-white">{merchantBalance.toLocaleString()}<Text className="text-xl ml-1">元</Text></Text>
          <Text className="text-xl text-white/70 mt-2">≈ ¥{availableYuan}（含金豆支付等值部分，由平台垫付）</Text>
        </View>
      ) : (
        <View className="mx-4 mt-3 p-5 rounded-3xl" style={{ background: 'linear-gradient(135deg, #C2410C, #EA580C)' }}>
          <Text className="text-xl text-white/80 mb-1">我的金豆（推广佣金发放至此）</Text>
          <Text className="text-4xl font-bold text-white">{balance.toLocaleString()}<Text className="text-xl ml-1">豆</Text></Text>
          <Text className="text-xl text-white/70 mt-2">可直接在平台内消费支付 · 不可提现</Text>
        </View>
      )}

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

      {/* 申请表单（仅货款模式可提现；佣金已转为金豆，不可提现） */}
      {tab === 'apply' && mode === 'commission' && (
        <View className="px-4 mt-4">
          <View className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-2">
            <View className="flex items-center gap-2">
              <View className="i-mdi-emoticon-happy text-3xl text-primary" />
              <Text className="text-xl font-bold text-foreground">推广佣金已升级为「金豆」</Text>
            </View>
            <Text className="text-base text-muted-foreground">你的推广佣金（含好友/粉丝佣金）已直接发放至「金豆」钱包，可在平台内消费支付、兑换专属体验，形成消费回流边花边赚。</Text>
            <Text className="text-base text-muted-foreground">金豆为平台内部货币，按规则不可提现/兑现金，故佣金提现通道已关闭。</Text>
            <View className="mt-2 p-3 rounded-xl bg-primary/5">
              <Text className="text-base text-primary">👉 前往「我的推广」可查看累计佣金（金豆）与我的金豆余额</Text>
            </View>
          </View>
        </View>
      )}
      {tab === 'apply' && mode === 'settlement' && (
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
                  onClick={() => {
                    if (method === m.key) return
                    setMethod(m.key)
                    // 切换方式时，若当前用已保存账户但不匹配，则切回手填
                    if (useSaved) {
                      const cur = savedAccounts.find(a => a.id === selectedAccountId)
                      if (!cur || cur.method !== m.key) {
                        setUseSaved(false); setSelectedAccountId(null)
                        setRealName(''); setIdCard(''); setBankName(''); setBankAccount(''); setBankHolder(''); setAlipayAccount('')
                      }
                    }
                  }}>
                  <View className={`${m.icon} text-3xl ${method === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
                  <Text className={`text-xl mt-2 font-bold ${method === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 已保存收款账户（迁移 00123）—— 绑定一次，后续免填 */}
          {savedAccounts.length > 0 && (
            <View className="bg-card rounded-2xl border border-border p-4 mb-4">
              <View className="flex items-center justify-between mb-3">
                <Text className="text-xl font-bold text-foreground">已保存的收款账户</Text>
                <Text className="text-base text-muted-foreground">选一张直接提现</Text>
              </View>
              {savedAccounts.map(a => {
                const mask = (s: string | null) => s ? `${s.slice(0, 2)}****${s.slice(-2)}` : ''
                const isActive = useSaved && selectedAccountId === a.id
                return (
                  <View key={a.id}
                    className={`mb-2 p-3 rounded-xl border-2 transition ${isActive ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                    onClick={() => {
                      if (selectedAccountId === a.id) return
                      applyAccount(a)
                      setSelectedAccountId(a.id)
                      setUseSaved(true)
                    }}>
                    <View className="flex items-center justify-between">
                      <View className="flex items-center gap-2 flex-1 min-w-0">
                        <View className={`text-2xl ${a.method === 'bank' ? 'i-mdi-bank-outline' : a.method === 'alipay' ? 'i-mdi-alpha-a-box-outline' : 'i-mdi-wechat'} ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                        <View className="flex-1 min-w-0">
                          <View className="flex items-center gap-2">
                            <Text className="text-xl font-bold text-foreground truncate">
                              {a.method === 'bank' ? (a.bank_name || '银行卡') : a.method === 'alipay' ? '支付宝' : '微信'}
                            </Text>
                            {a.is_default && (
                              <Text className="text-base px-2 py-0.5 rounded-full bg-primary/10 text-primary">默认</Text>
                            )}
                          </View>
                          <Text className="text-base text-muted-foreground truncate">
                            {a.method === 'bank'
                              ? `${a.bank_holder || a.real_name || '持卡人'} · ${mask(a.bank_account)}`
                              : a.method === 'alipay'
                                ? `${a.real_name || ''} · ${mask(a.alipay_account)}`
                                : a.real_name || '微信到账'}
                          </Text>
                        </View>
                      </View>
                      <View className="flex items-center gap-2 ml-2">
                        {isActive && <View className="i-mdi-check-circle text-2xl text-primary" />}
                        <View className="i-mdi-trash-can-outline text-2xl text-muted-foreground p-1"
                          onClick={async (e) => {
                            e?.stopPropagation?.()
                            const res = await Taro.showModal({ title: '删除该账户？', content: '删除后下次提现需重新填写', confirmText: '删除', confirmColor: '#EF4444' })
                            if (!res.confirm) return
                            const ok = await deleteWithdrawalAccount(a.id)
                            if (ok) {
                              setSavedAccounts(prev => prev.filter(x => x.id !== a.id))
                              if (selectedAccountId === a.id) { setSelectedAccountId(null); setUseSaved(false) }
                              Taro.showToast({ title: '已删除', icon: 'success' })
                            } else {
                              Taro.showToast({ title: '删除失败', icon: 'none' })
                            }
                          }}
                        />
                      </View>
                    </View>
                  </View>
                )
              })}
              <View className="mt-2 p-3 rounded-xl border-2 border-dashed border-border flex items-center justify-center gap-2"
                onClick={() => {
                  setUseSaved(false); setSelectedAccountId(null)
                  setRealName(''); setIdCard(''); setBankName(''); setBankAccount(''); setBankHolder(''); setAlipayAccount('')
                }}>
                <View className="i-mdi-plus-circle-outline text-xl text-muted-foreground" />
                <Text className="text-xl text-muted-foreground">使用新账户（提交后将自动保存）</Text>
              </View>
            </View>
          )}

          {/* 收款账户信息 */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-xl font-bold text-foreground mb-3">账户信息</Text>

            {/* 真实姓名（所有方式必填） */}
            <View className="mb-3">
              <Text className="text-xl text-foreground mb-1">真实姓名 <Text className="text-red-500">*</Text></Text>
              <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入与收款账户一致的真实姓名"
                  value={realName}
                  onInput={e => { const ev = e as any; setRealName(ev.detail?.value ?? ev.target?.value ?? '') }} />
              </View>
            </View>

            {/* 身份证号（打款核对，打款核对） */}
            <View className="mb-3">
              <Text className="text-xl text-foreground mb-1">身份证号 <Text className="text-red-500">*</Text></Text>
              <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="用于打款核对，仅平台打款核对"
                  value={idCard}
                  onInput={e => { const ev = e as any; setIdCard(ev.detail?.value ?? ev.target?.value ?? '') }} />
              </View>
            </View>

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
          <Text className="text-base text-muted-foreground text-center mt-3">
            {mode === 'settlement'
              ? '货款提现为商家销售货款结算，审核通过后由微信直接打款到您的账户；如含金豆垫付部分，由平台自有资金打款。'
              : '提现按申请金额发放，审核 1-3 个工作日到账；推广佣金为劳务报酬所得，请依法履行纳税申报义务'}
          </Text>
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
