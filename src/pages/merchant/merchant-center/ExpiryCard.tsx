// 商家中心：临期预警摘要卡（纯展示，按本店过滤，零逻辑改动）
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'

interface ExpiryStats {
  total: number
  red: number
  orange: number
  amber: number
}

export default function ExpiryCard({ expiryStats }: { expiryStats: ExpiryStats | null }) {
  if (!expiryStats || expiryStats.total === 0) return null
  return (
    <View
      className="mx-4 mt-3 p-4 rounded-2xl border border-destructive/30"
      style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.10), rgba(249,115,22,0.06))' }}
      onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-expiry/index' })}>
      <View className="flex items-center justify-between">
        <View className="flex items-center gap-2">
          <View className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center">
            <Icon name="bell-outline" size={20} className="text-destructive" />
          </View>
          <Text className="text-lg font-bold text-foreground">临期预警</Text>
        </View>
        <Text className="text-base text-destructive font-bold">{expiryStats.total} 件 →</Text>
      </View>
      <View className="flex gap-4 mt-3">
        <View className="flex items-center gap-1.5">
          <View style={{ width: 10, height: 10, borderRadius: 5, background: '#DC2626' }} />
          <Text className="text-base text-foreground">紧急 {expiryStats.red}</Text>
        </View>
        <View className="flex items-center gap-1.5">
          <View style={{ width: 10, height: 10, borderRadius: 5, background: '#B45309' }} />
          <Text className="text-base text-foreground">紧迫 {expiryStats.orange}</Text>
        </View>
        <View className="flex items-center gap-1.5">
          <View style={{ width: 10, height: 10, borderRadius: 5, background: '#B45309' }} />
          <Text className="text-base text-foreground">临期 {expiryStats.amber}</Text>
        </View>
      </View>
      <Text className="text-sm text-muted-foreground mt-2">引擎已自动写入折扣，点此查看/调整</Text>
    </View>
  )
}
