// @title Phase 4 门店切换弹层（纯展示，写库逻辑在页面）
import { View, Text } from '@tarojs/components'
import type { Store } from '@/db/types'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  stores: Store[]
  currentStore: Store
  onSwitch: (s: Store) => void
  onClose: () => void
}

export default function StoreSwitchSheet({ visible, stores, currentStore, onSwitch, onClose }: Props) {
  return (
    visible && (
      <View
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose} catchMove>
        <View
          className="w-full rounded-t-3xl bg-card px-6 pt-6 pb-10"
          style={{ maxHeight: '80vh' }}
          onClick={(e) => e.stopPropagation()}>
          <View className="flex items-center justify-between mb-5">
            <Text className="text-xl font-bold text-foreground">切换管理门店</Text>
            <View onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '16px', backgroundColor: '#FBF7EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} />
            </View>
          </View>
          <View className="flex flex-col gap-2" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {stores.map(s => (
              <View key={s.id}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${s.id === currentStore?.id ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                onClick={() => onSwitch(s)}>
                <View className="flex-1 mr-3">
                  <Text className={`text-base font-bold ${s.id === currentStore?.id ? 'text-primary' : 'text-foreground'}`}>{s.name}</Text>
                  <Text className="text-base text-muted-foreground mt-0.5">{s.address || '暂无地址'}</Text>
                </View>
                {s.id === currentStore?.id && (
                  <View className="px-3 py-1 rounded-full bg-primary/10">
                    <Text className="text-sm font-bold text-primary">当前</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  )
}
