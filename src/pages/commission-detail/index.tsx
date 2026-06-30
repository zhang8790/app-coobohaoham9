// @title 佣金明细
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getMyCommissions } from '@/db/api'
import type { Commission } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

type Tab = 'all' | 'pending' | 'settled'

const statusLabel: Record<string, string> = {
  pending: '待结算', settled: '已结算', refunded: '已退款',
}
const statusColor: Record<string, string> = {
  pending: 'text-orange-500', settled: 'text-green-600', refunded: 'text-muted-foreground',
}

function CommissionDetailPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [items, setItems] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await getMyCommissions(0, 50))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = items.filter(c => tab === 'all' || c.status === tab)

  const totalPending = items.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.commission_amount), 0)
  const totalSettled = items.filter(c => c.status === 'settled').reduce((s, c) => s + Number(c.commission_amount), 0)

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">佣金明细</span>
      </div>

      {/* 汇总卡 */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #C2410C, #EA580C)' }}>
        <div className="grid grid-cols-2 py-5">
          <div className="flex flex-col items-center gap-1 border-r border-white/20">
            <span className="text-3xl font-black text-white">¥{totalPending.toFixed(2)}</span>
            <span className="text-xl text-white/80">待结算</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl font-black text-white">¥{totalSettled.toFixed(2)}</span>
            <span className="text-xl text-white/80">已结算</span>
          </div>
        </div>
        <div className="px-4 pb-4">
          <button type="button"
            className="w-full flex items-center justify-center leading-none rounded-xl border border-white/40 bg-white/10"
            onClick={() => Taro.navigateTo({ url: '/pages/withdraw/index' })}>
            <div className="py-2 text-xl text-white font-bold">申请提现 →</div>
          </button>
        </div>
      </div>

      {/* Tab */}
      <div className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([['all', '全部'], ['pending', '待结算'], ['settled', '已结算']] as const).map(([key, label]) => (
          <div key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </div>
        ))}
      </div>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="i-mdi-loading text-4xl text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="i-mdi-cash-remove text-6xl text-muted-foreground/30" />
            <p className="text-xl text-muted-foreground">暂无佣金记录</p>
            <p className="text-base text-muted-foreground text-center px-8">分享商品给好友，好友购买后即可获得佣金</p>
          </div>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${c.level === 1 ? 'bg-primary/10' : 'bg-blue-50'}`}>
                    <span className={`text-base font-bold ${c.level === 1 ? 'text-primary' : 'text-blue-600'}`}>L{c.level}</span>
                  </div>
                  <span className="text-xl text-foreground">
                    {c.level === 1 ? '直推佣金' : '二级佣金'}
                  </span>
                </div>
                <span className={`text-2xl font-black ${statusColor[c.status] || 'text-foreground'}`}>
                  +¥{Number(c.commission_amount).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`text-xl font-bold ${statusColor[c.status] || ''}`}>
                  {statusLabel[c.status] || c.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(CommissionDetailPage)
