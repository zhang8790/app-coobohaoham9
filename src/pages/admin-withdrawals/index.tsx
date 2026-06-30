// @title 银票兑付
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getAdminWithdrawals, adminApproveWithdrawal, adminRejectWithdrawal } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'

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

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="i-mdi-loading text-5xl text-primary animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="i-mdi-cash-check text-6xl text-emerald-500" />
            <span className="text-2xl text-muted-foreground">暂无待审提现申请</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map(w => {
              const taxAmount = Number(w.amount) * 0.1
              const actualAmount = Number(w.amount) - taxAmount
              return (
                <div key={w.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        {w.profiles?.nickname || '侠客'}
                      </span>
                      <span className="text-xl text-muted-foreground">{w.profiles?.phone || '未知手机'}</span>
                    </div>
                    <span className="text-3xl font-black text-primary">¥{Number(w.amount).toFixed(2)}</span>
                  </div>

                  <div className="bg-muted rounded-xl p-3 flex flex-col gap-2">
                    {[
                      { label: '提现方式', val: METHOD_LABELS[w.withdraw_method] || w.withdraw_method },
                      { label: '江湖税(10%)', val: `-¥${taxAmount.toFixed(2)}` },
                      { label: '实际到手', val: `¥${actualAmount.toFixed(2)}` },
                      { label: '申请时间', val: new Date(w.created_at).toLocaleString('zh-CN') },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className="text-xl text-muted-foreground">{item.label}</span>
                        <span className="text-xl text-foreground font-bold">{item.val}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-row gap-3">
                    <button type="button"
                      className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === w.id ? 'bg-primary/50' : 'bg-primary'}`}
                      onClick={() => handleApprove(w.id)}>
                      <div className="py-3 text-xl font-bold text-white flex items-center gap-1">
                        <div className="i-mdi-cash-check text-xl" />
                        <span>通过代付</span>
                      </div>
                    </button>
                    <button type="button"
                      className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                      onClick={() => handleReject(w.id)}>
                      <div className="py-3 text-xl font-bold text-destructive flex items-center gap-1">
                        <div className="i-mdi-close-circle text-xl" />
                        <span>驳回退款</span>
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(AdminWithdrawalsPage)
