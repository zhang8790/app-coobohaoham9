// 基本信息（店铺名称 / 简介 / 主营类目）—— 纯展示，状态由父页 form 驱动
import { View, Text, Input, Textarea } from '@tarojs/components'
import type { StoreForm } from './index'

const CATEGORY_OPTIONS = ['餐饮', '零售', '水果', '服务', '娱乐', '其他']

export default function BasicInfo({
  form,
  updateField,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
}) {
  return (
    <View className="px-4 mt-4 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-3 block">基本信息</Text>

      {/* 店铺名称 */}
      <View className="mb-3">
        <Text className="text-sm text-gray-500 mb-1 block">店铺名称 *</Text>
        <Input
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
          value={form.name}
          placeholder="请输入店铺名称"
          onInput={e => updateField('name', (e.detail?.value as string) ?? '')} />
      </View>

      {/* 店铺简介 */}
      <View className="mb-3">
        <Text className="text-sm text-gray-500 mb-1 block">店铺简介</Text>
        <Textarea
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base min-h-[80px]"
          placeholder="简述店铺特色..."
          value={form.description}
          onInput={e => updateField('description', (e.detail?.value as string) ?? '')} />
      </View>

      {/* 主营类目 */}
      <View className="mb-3">
        <Text className="text-sm text-gray-500 mb-1 block">主营类目 *</Text>
        <View className="flex gap-2 flex-wrap">
          {CATEGORY_OPTIONS.map(cat => (
            <View key={cat}
              className={`px-3 py-1.5 rounded-lg text-sm ${form.category === cat
                ? 'bg-primary' : 'bg-muted'}`}
              onClick={() => updateField('category', cat)}
            >
              <Text className={form.category === cat ? 'text-white' : 'text-gray-600'}>{cat}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
