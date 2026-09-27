// @title P3 门店联动：流动车摘要卡（纯展示）
import { View, Text, Image } from '@tarojs/components'
import { BRAND_LINE_ICONS } from '@/components/brandIcons'

export interface MerchantVehicle {
  id: string
  name: string
  status: 'active' | 'offline'
}

interface Props {
  vehicles: MerchantVehicle[]
  onOpenModal: () => void
  onToggle: (v: MerchantVehicle) => void
}

export default function VehiclesCard({ vehicles, onOpenModal, onToggle }: Props) {
  return (
    <View
      className="mx-4 mt-3 p-4 rounded-2xl border border-primary/30"
      style={{ background: 'linear-gradient(135deg, rgba(94,122,79,0.10), rgba(94,122,79,0.04))' }}
      onClick={onOpenModal}>
      <View className="flex items-center justify-between">
        <View className="flex items-center gap-2">
          <View className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Image src={BRAND_LINE_ICONS['truck']} style={{ width: '22rpx', height: '22rpx' }} />
          </View>
          <Text className="text-lg font-bold text-foreground">流动车</Text>
        </View>
        <Text className="text-base text-primary font-bold">{vehicles.length} 辆 →</Text>
      </View>
      {vehicles.length === 0 ? (
        <Text className="text-sm text-muted-foreground mt-2">点击添加本店流动车（随统一运营身份按店隔离）</Text>
      ) : (
        <View className="mt-3 flex flex-col gap-2">
          {vehicles.slice(0, 3).map(v => (
            <View key={v.id} className="flex items-center justify-between"
              onClick={(e) => { e.stopPropagation(); onToggle(v) }}>
              <Text className="text-base text-foreground">{v.name}</Text>
              <View className="flex items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, background: v.status === 'active' ? '#2E9E5B' : '#94A3B8' }} />
                <Text className="text-base" style={{ color: v.status === 'active' ? '#2E9E5B' : '#94A3B8' }}>
                  {v.status === 'active' ? '运营中' : '已停驶'}
                </Text>
              </View>
            </View>
          ))}
          {vehicles.length > 3 && (
            <Text className="text-sm text-muted-foreground">还有 {vehicles.length - 3} 辆…</Text>
          )}
        </View>
      )}
    </View>
  )
}
