import { View, Button, Text } from '@tarojs/components'
// @title 银票兑付
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getAdminWithdrawals, adminApproveWithdrawal, adminRejectWithdrawal } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'

type Withdrawal = {
  id: string; user_id: string; amount: number; status: string
  withdraw_method: string; reject_reason: string | null; remark: string | null
  created_at: string
  profiles?: { nickname: string | null; phone: string | null }
}

const METHOD_LABELS: Record<string, string> = { bank: '银行转账', alipay: '支付宝', wechat: '微信零钱' }

function AdminWithdrawalsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [list, setList] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    const data = await getAdminWithdrawals()
    setList(data)
    setLoading(false)
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    Taro.showModal({
      title: '确认通过代付',
      content: '确认后将标记为已代付，请在微信商户平台完成实际转账操作',
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(id)
        const ok = await adminApproveWithdrawal(id)
        setProcessing(null)
        if (ok) { Taro.showToast({ title: '已通过', icon: 'success' }); load() }
        else Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    })
  }

  const handleReject = async (id: string) => {
    Taro.showModal({
      title: '确认驳回',
      content: '驳回后该提现申请将被关闭，余额退还至用户账户',
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(id)
        const ok = await adminRejectWithdrawal(id)
        setProcessing(null)
        if (ok) { Taro.showToast({ title: '已驳回', icon: 'success' }); load() }
        else Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 py-4">
        {loading ? (
          <View className="flex items-center justify-center py-20">
            <View className="i-mdi-loading text-5xl text-primary animate-spin" />
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center justify-center py-20 gap-3">
            <View className="i-mdi-cash-check text-6xl text-emerald-500" />
            <Text className="text-2xl text-muted-foreground">暂无待审提现申请</Text>
          </View>
        ) : (
          <View className="flex flex-col gap-4">
            {list.map(w => {
              const taxAmount = Number(w.amount) * 0.1
              const actualAmount = Number(w.amount) - taxAmount
              return (
                <View key={w.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
                  <View className="flex items-start justify-between">
                    <View className="flex flex-col gap-1">
                      <Text className="text-2xl font-bold text-foreground">
                        {w.profiles?.nickname || '侠客'}
                      </Text>
                      <Text className="text-xl text-muted-foreground">{w.profiles?.phone || '未知手机'}</Text>
                    </View>
                    <Text className="text-3xl font-black text-primary">¥{Number(w.amount).toFixed(2)}</Text>
                  </View>

                  <View className="bg-muted rounded-xl p-3 flex flex-col gap-2">
                    {[
                      { label: '提现方式', val: METHOD_LABELS[w.withdraw_method] || w.withdraw_method },
                      { label: '江湖税(10%)', val: `-¥${taxAmount.toFixed(2)}` },
                      { label: '实际到手', val: `¥${actualAmount.toFixed(2)}` },
                      { label: '申请时间', val: new Date(w.created_at).toLocaleString('zh-CN') },
                    ].map(item => (
                      <View key={item.label} className="flex items-center justify-between">
                        <Text className="text-xl text-muted-foreground">{item.label}</Text>
                        <Text className="text-xl text-foreground font-bold">{item.val}</Text>
                      </View>
                    ))}
                  </View>

                  <View className="flex flex-row gap-3">
                    <Button type="button"
                      className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === w.id ? 'bg-primary/50' : 'bg-primary'}`}
                      onClick={() => handleApprove(w.id)}>
                      <View className="py-3 text-xl font-bold text-white flex items-center gap-1">
                        <View className="i-mdi-cash-check text-xl" />
                        <Text>通过代付</Text>
                      </View>
                    </Button>
                    <Button type="button"
                      className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                      onClick={() => handleReject(w.id)}>
                      <View className="py-3 text-xl font-bold text-destructive flex items-center gap-1">
                        <View className="i-mdi-close-circle text-xl" />
                        <Text>驳回退款</Text>
                      </View>
                    </Button>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default AdminWithdrawalsPage
