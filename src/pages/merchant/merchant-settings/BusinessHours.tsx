// 营业设置（营业状态开关 + 营业时间）—— 纯展示，状态由父页 form 驱动
import { View, Text, Input, Picker } from '@tarojs/components'
import type { StoreForm } from './index'
import ToggleSwitch from './ToggleSwitch'

export default function BusinessHours({
  form,
  updateField,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
}) {
  return (
    <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-3 block">营业设置</Text>

      {/* 营业状态开关 */}
      <View className="flex items-center justify-between py-2 border-b border-gray-100">
        <Text className="text-base text-foreground">营业状态</Text>
        <ToggleSwitch value={form.is_open} onChange={(v) => updateField('is_open', v)} />
      </View>

      {/* 营业时间（时间选择器，避免手输非法格式）*/}
      <View className="flex items-center gap-3 mt-3">
        <View className="flex-1">
          <Text className="text-xs text-gray-500 mb-1 block">开始时间</Text>
          <Picker mode="time" value={form.open_time} onChange={e => updateField('open_time', e.detail.value)}>
            <View className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm text-foreground">
              {form.open_time || '08:00'}
            </View>
          </Picker>
        </View>
        <Text className="pt-5 text-gray-400">至</Text>
        <View className="flex-1">
          <Text className="text-xs text-gray-500 mb-1 block">结束时间</Text>
          <Picker mode="time" value={form.close_time} onChange={e => updateField('close_time', e.detail.value)}>
            <View className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm text-foreground">
              {form.close_time || '20:00'}
            </View>
          </Picker>
        </View>
      </View>
    </View>
  )
}
