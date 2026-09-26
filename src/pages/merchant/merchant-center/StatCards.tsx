// 商家中心：统计卡片（商品/订单/会员，纯展示，零逻辑改动）
import { View, Text } from '@tarojs/components'

interface Stats {
  products: number
  online: number
  orders: number
  todayOrders: number
  members: number
  crossStore: number
}

export default function StatCards({ stats }: { stats: Stats }) {
  return (
    <View className="flex gap-3 px-4 mt-3">
      {[
        { label: '商品', value: stats.products, sub: `${stats.online}在售`, color: 'text-primary' },
        { label: '订单', value: stats.orders, sub: `今日${stats.todayOrders}`, color: 'text-primary' },
        { label: '会员', value: stats.members, sub: `${stats.crossStore}跨店`, color: 'text-primary' },
      ].map((s) => (
        <View key={s.label} className="flex-1 bg-card rounded-2xl border border-border p-3 text-center">
          <Text className={`text-3xl font-bold ${s.color}`}>{s.value}</Text>
          <Text className="text-base text-muted-foreground">{s.label}</Text>
          <Text className="text-base text-muted-foreground">{s.sub}</Text>
        </View>
      ))}
    </View>
  )
}
