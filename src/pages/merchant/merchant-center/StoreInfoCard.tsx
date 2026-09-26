// @title 门店信息卡（纯展示）
import { View, Text, Button } from '@tarojs/components'
import Icon from '@/components/Icon'
import type { Store } from '@/db/types'

interface Props {
  store: Store
  storeCount: number
  onViewStore: () => void
  onShowQr: () => void
  onSwitch: () => void
}

export default function StoreInfoCard({ store, storeCount, onViewStore, onShowQr, onSwitch }: Props) {
  return (
    <View className="mx-4 mt-2 p-4 rounded-2xl bg-card border border-border">
      <View className="flex items-center gap-3">
        <View className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon name="store" size={24} className="text-primary" />
        </View>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">{store.name}</Text>
          <Text className="text-base text-muted-foreground">{store.address || '暂无地址'}</Text>
        </View>
        {storeCount > 1 && (
          <View
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary/5"
            onClick={onSwitch}>
            <Text className="text-sm font-bold text-primary">切换</Text>
            <Text className="text-primary" style={{ fontSize: '28rpx' }}>▾</Text>
          </View>
        )}
      </View>
      {/* 操作按钮行：查看 + 二维码 */}
      <View className="flex gap-2 mt-3">
        <Button className="!flex-1 !m-0 !p-0 !bg-primary !border-none !rounded-xl"
          onClick={onViewStore}>
          <View className="py-2 flex items-center justify-center gap-1">
            <Icon name="eye" size={28} className="text-white" />
            <Text className="text-base font-bold text-white">查看门店</Text>
          </View>
        </Button>
        <Button className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-primary !rounded-xl"
          onClick={onShowQr}>
          <View className="py-2 flex items-center justify-center gap-1">
            <Icon name="qrcode" size={28} className="text-primary" />
            <Text className="text-base font-bold text-primary">门店二维码</Text>
          </View>
        </Button>
      </View>
    </View>
  )
}
