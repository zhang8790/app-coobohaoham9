// 配送配置：配送开关 + 配送范围/费/免运/起送 —— 纯展示，状态由父页 form 驱动
import { View, Text, Input } from '@tarojs/components'
import type { StoreForm } from './index'
import ToggleSwitch from './ToggleSwitch'

export default function DeliveryConfig({
  form,
  updateField,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
}) {
  return (
    <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-3 block">配送配置</Text>

      <View className="p-3 rounded-xl bg-gray-50">
        <View className="flex items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-foreground">配送</Text>
            <Text className="text-xs text-gray-400 mt-0.5 block">支持送到客户地址</Text>
          </View>
          <ToggleSwitch value={form.delivery_enabled} onChange={(v) => updateField('delivery_enabled', v)} />
        </View>

        {form.delivery_enabled && (
          <View className="grid grid-cols-2 gap-2 mt-3">
            <View>
              <Text className="text-xs text-gray-500 mb-1 block">配送范围(km)</Text>
              <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                type="digit" value={String(form.delivery_radius)}
                placeholder="3"
                onInput={e => updateField('delivery_radius', Number(e.detail?.value) || 0)} />
            </View>
            <View>
              <Text className="text-xs text-gray-500 mb-1 block">配送费(元)</Text>
              <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                type="digit" value={String(form.delivery_fee)}
                placeholder="2"
                onInput={e => updateField('delivery_fee', Number(e.detail?.value) || 0)} />
            </View>
            <View>
              <Text className="text-xs text-gray-500 mb-1 block">满额免运费(元)</Text>
              <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                type="digit" value={String(form.free_delivery_threshold)}
                placeholder="30"
                onInput={e => updateField('free_delivery_threshold', Number(e.detail?.value) || 0)} />
            </View>
            <View>
              <Text className="text-xs text-gray-500 mb-1 block">起送价(元)</Text>
              <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                type="digit" value={String(form.min_order_amount)}
                placeholder="20"
                onInput={e => updateField('min_order_amount', Number(e.detail?.value) || 0)} />
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
