// 店铺公告 —— 纯展示，状态由父页 form 驱动
import { View, Text, Textarea } from '@tarojs/components'
import type { StoreForm } from './index'

export default function Announcement({
  form,
  updateField,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
}) {
  return (
    <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-3 block">店铺公告</Text>
      <Textarea
        className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base min-h-[100px]"
        placeholder="输入店铺公告内容，顾客可在门店首页看到..."
        value={form.announcement}
        onInput={e => updateField('announcement', (e.detail?.value as string) ?? '')} />
    </View>
  )
}
