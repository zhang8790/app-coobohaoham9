// 联系信息（电话 / 联系人 / 地址）—— 纯展示，状态由父页 form 驱动
import { View, Text, Input } from '@tarojs/components'
import type { StoreForm } from './index'

export default function ContactInfo({
  form,
  updateField,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
}) {
  return (
    <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-3 block">联系信息</Text>

      <View className="mb-3">
        <Text className="text-sm text-gray-500 mb-1 block">联系电话 *</Text>
        <Input
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
          type="number"
          maxlength={11}
          value={form.phone}
          placeholder="客服电话"
          onInput={e => updateField('phone', (e.detail?.value as string) ?? '')} />
      </View>

      <View className="mb-3">
        <Text className="text-sm text-gray-500 mb-1 block">联系人</Text>
        <Input
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
          value={form.contact}
          placeholder="联系人姓名"
          onInput={e => updateField('contact', (e.detail?.value as string) ?? '')} />
      </View>

      <View>
        <Text className="text-sm text-gray-500 mb-1 block">店铺地址</Text>
        <Input
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
          value={form.address}
          placeholder="详细地址，如：杭州市西湖区文三路 100 号"
          onInput={e => updateField('address', (e.detail?.value as string) ?? '')} />
        <Text className="text-xs text-gray-400 mt-1 block">顾客端「门店详情」会展示此地址；留空则不展示。</Text>
      </View>
    </View>
  )
}
