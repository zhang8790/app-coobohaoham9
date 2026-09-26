// 商家中心：跨店总览卡（纯展示，多店时聚合，零逻辑改动）
import { View, Text } from '@tarojs/components'

interface CrossSummary {
  products: number
  orders: number
  balance: number
}

export default function CrossSummaryCard({ storeCount, crossSummary }: { storeCount: number; crossSummary: CrossSummary | null }) {
  if (!(storeCount > 1 && crossSummary)) return null
  return (
    <View className="mx-4 mt-3 p-4 rounded-2xl border border-primary/30"
      style={{ background: 'linear-gradient(135deg, rgba(232,121,100,0.08), rgba(232,121,100,0.03))' }}>
      <View className="flex items-center justify-between">
        <View className="flex items-center gap-2">
          <Text className="text-xl" style={{ fontSize: '40rpx' }}></Text>
          <Text className="text-lg font-bold text-foreground">全门店总览</Text>
        </View>
        <Text className="text-base text-primary font-bold">{storeCount} 家门店</Text>
      </View>
      <View className="flex gap-3 mt-3">
        <View className="flex-1 bg-background/60 rounded-xl py-2 text-center">
          <Text className="text-2xl font-bold text-foreground">{crossSummary.products}</Text>
          <Text className="text-base text-muted-foreground">总商品</Text>
        </View>
        <View className="flex-1 bg-background/60 rounded-xl py-2 text-center">
          <Text className="text-2xl font-bold text-foreground">{crossSummary.orders}</Text>
          <Text className="text-base text-muted-foreground">总订单</Text>
        </View>
        <View className="flex-1 bg-background/60 rounded-xl py-2 text-center">
          <Text className="text-2xl font-bold text-success">¥{crossSummary.balance.toFixed(2)}</Text>
          <Text className="text-base text-muted-foreground">总货款</Text>
        </View>
      </View>
    </View>
  )
}
