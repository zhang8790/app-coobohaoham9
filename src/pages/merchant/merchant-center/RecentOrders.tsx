// 商家中心：最近订单预览（纯展示，零逻辑改动）
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'

export default function RecentOrders({ statsLoaded, recentOrders }: { statsLoaded: boolean; recentOrders: any[] }) {
  return (
    <View className="px-4 mt-4">
      <View className="flex items-center justify-between mb-2">
        <Text className="text-lg font-bold text-foreground">最近订单</Text>
        <Button className="!p-0 !bg-transparent !border-none" onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-orders/index' })}>
          <Text className="text-base text-primary">查看全部 →</Text>
        </Button>
      </View>
      <View className="bg-card rounded-2xl border border-border p-4">
        {!statsLoaded ? (
          <Text className="text-base text-muted-foreground">加载中…</Text>
        ) : recentOrders.length === 0 ? (
          <Text className="text-base text-muted-foreground">暂无订单</Text>
        ) : (
          recentOrders.map((it, idx) => {
            const o = it.orders || {}
            const statusMap: Record<string, string> = {
              pending_pay: '待付款', paid: '已付款', pending: '待发货',
              pending_receive: '待收货', pending_review: '待评价', done: '已完成', completed: '已完成', cancelled: '已取消',
            }
            const statusText = statusMap[o.status] || o.status || '未知'
            const amt = o.total_amount ?? 0
            const time = (o.created_at || '').replace('T', ' ').slice(0, 16)
            return (
              <View
                key={o.order_no || idx}
                className="flex items-center justify-between py-2.5"
                style={idx > 0 ? { borderTop: '1px solid rgba(148,163,184,0.15)' } : undefined}>
                <View className="flex-1 mr-3">
                  <Text className="text-base text-foreground">订单 {String(o.order_no || '').slice(-6)}</Text>
                  <Text className="text-base text-muted-foreground mt-0.5">{time || '—'}</Text>
                </View>
                <View className="flex items-center gap-2">
                  <Text className="text-base text-muted-foreground">{statusText}</Text>
                  <Text className="text-base font-bold text-foreground">¥{amt}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}
