// @title P3 门店联动：流动车管理弹窗（纯展示，写库逻辑在页面）
import { View, Text, Button, Input } from '@tarojs/components'
import type { MerchantVehicle } from './VehiclesCard'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  vehicles: MerchantVehicle[]
  vehicleName: string
  vehicleSubmitting: boolean
  onVehicleNameChange: (v: string) => void
  onAdd: () => void
  onToggle: (v: MerchantVehicle) => void
  onClose: () => void
}

export default function VehicleManageModal({ visible, vehicles, vehicleName, vehicleSubmitting, onVehicleNameChange, onAdd, onToggle, onClose }: Props) {
  return (
    visible && (
      <View
        className="fixed inset-0 z-[1001] flex items-end justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose} catchMove>
        <View
          className="w-full rounded-t-3xl bg-card px-6 pt-6 pb-10"
          style={{ maxHeight: '80vh' }}
          onClick={(e) => e.stopPropagation()}>

          <View className="flex items-center justify-between mb-5">
            <Text className="text-xl font-bold text-foreground">流动车管理</Text>
            <View onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '16px', backgroundColor: '#FBF7EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} />
            </View>
          </View>

          {/* 列表 + 启停 */}
          <View className="flex flex-col gap-2 mb-4">
            {vehicles.length === 0 && (
              <Text className="text-base text-muted-foreground text-center py-4">暂无流动车，在下方添加</Text>
            )}
            {vehicles.map(v => (
              <View key={v.id} className="flex items-center justify-between bg-background rounded-2xl border border-border px-4 py-3">
                <Text className="text-base text-foreground font-bold">{v.name}</Text>
                <Button
                  className="!m-0 !p-0 !rounded-xl"
                  style={{ background: v.status === 'active' ? '#2E9E5B' : '#6F675C', border: 'none' }}
                  onClick={() => onToggle(v)}>
                  <View className="px-4 py-1.5 flex items-center gap-1">
                    <Text className="text-base font-bold text-white">{v.status === 'active' ? '运营中' : '已停驶'}</Text>
                  </View>
                </Button>
              </View>
            ))}
          </View>

          {/* 新增 */}
          <Text className="text-base text-muted-foreground mb-2">新增流动车（归属本店）</Text>
          <View className="flex gap-2">
            <View className="flex-1 bg-background rounded-2xl border border-border px-4 py-3">
              <Input
                value={vehicleName}
                onInput={(e: any) => onVehicleNameChange(e.detail.value)}
                placeholder="如：城西夜市流动车"
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#2A2A2A', fontSize: '32rpx' }}
              />
            </View>
            <Button
              className="!m-0 !p-0 !rounded-2xl"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)))', border: 'none' }}
              disabled={vehicleSubmitting}
              onClick={onAdd}>
              <View className="px-5 py-3 flex items-center justify-center">
                <Text className="text-base font-bold text-white">{vehicleSubmitting ? '添加中…' : '添加'}</Text>
              </View>
            </Button>
          </View>
        </View>
      </View>
    )
  )
}
