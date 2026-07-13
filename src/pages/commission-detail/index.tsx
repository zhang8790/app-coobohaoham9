import { View, Button, Text } from '@tarojs/components'
// @title 佣金明细
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getMyCommissions } from '@/db/api'
import type { Commission } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

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

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {/* 汇总卡 */}
      <View className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #C2410C, #EA580C)' }}>
        <View className="grid grid-cols-2 py-5">
          <View className="flex flex-col items-center gap-1 border-r border-white/20">
            <Text className="text-3xl font-black text-white">¥{totalPending.toFixed(2)}</Text>
            <Text className="text-xl text-white/80">待结算</Text>
          </View>
          <View className="flex flex-col items-center gap-1">
            <Text className="text-3xl font-black text-white">¥{totalSettled.toFixed(2)}</Text>
            <Text className="text-xl text-white/80">已结算</Text>
          </View>
        </View>
        <View className="px-4 pb-4">
          <Button type="button"
            className="w-full flex items-center justify-center leading-none rounded-xl border border-white/40 bg-white/10"
            onClick={() => Taro.navigateTo({ url: '/pages/withdraw/index' })}>
            <View className="py-2 text-xl text-white font-bold">申请提现 →</View>
          </Button>
        </View>
      </View>

      {/* Tab */}
      <View className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([['all', '全部'], ['pending', '待结算'], ['settled', '已结算']] as const).map(([key, label]) => (
          <View key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </View>
        ))}
      </View>

      <View className="px-4 mt-4">
        {loading ? (
          <View className="flex justify-center py-16">
            <View className="i-mdi-loading text-4xl text-primary animate-spin" />
          </View>
        ) : filtered.length === 0 ? (
          <View className="flex flex-col items-center py-16 gap-3">
            <View className="i-mdi-cash-remove text-6xl text-muted-foreground/30" />
            <Text className="text-xl text-muted-foreground">暂无佣金记录</Text>
            <Text className="text-base text-muted-foreground text-center px-8">分享商品给好友，好友购买后即可获得佣金</Text>
          </View>
        ) : (
          filtered.map(c => (
            <View key={c.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
              <View className="flex items-center justify-between mb-2">
                <View className="flex items-center gap-2">
                  <View className={`w-7 h-7 rounded-full flex items-center justify-center ${c.level === 1 ? 'bg-primary/10' : 'bg-blue-50'}`}>
                    <Text className={`text-base font-bold ${c.level === 1 ? 'text-primary' : 'text-blue-600'}`}>L{c.level}</Text>
                  </View>
                  <Text className="text-xl text-foreground">
                    {c.level === 1 ? '我的好友佣金' : '我的粉丝佣金'}
                  </Text>
                </View>
                <Text className={`text-2xl font-black ${statusColor[c.status] || 'text-foreground'}`}>
                  +¥{Number(c.commission_amount).toFixed(2)}
                </Text>
              </View>
              <View className="flex items-center justify-between">
                <Text className="text-base text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text className={`text-xl font-bold ${statusColor[c.status] || ''}`}>
                  {statusLabel[c.status] || c.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default CommissionDetailPage
