// 让利（推荐）配置：让利率输入 + 整体让利开关 —— 纯展示，状态由父页 form / rateInput 驱动
import { View, Text, Input } from '@tarojs/components'
import type { StoreForm } from './index'
import ToggleSwitch from './ToggleSwitch'

export default function ReferralConfig({
  form,
  updateField,
  rateInput,
  setRateInput,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
  rateInput: string
  setRateInput: (v: string) => void
}) {
  return (
    <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-1 block">让利（推荐）配置</Text>
      <Text className="text-xs text-gray-400 mb-3 block">设置订单金额中让利的比例，用于消费者推荐奖励和健康豆返还</Text>

      <View className="flex items-center justify-between">
        <Text className="text-sm text-gray-600">让利率</Text>
        <Text className="text-xl font-bold text-primary">{Math.round(form.referral_rate * 100)}%</Text>
      </View>
      <View className="mt-2">
        <Input
          type="number"
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base text-center"
          value={rateInput}
          onInput={e => {
            // 输入过程不做 clamp：否则输入「10」时第一下「1」会被抬到 3，
            // 光标内容被改写，用户永远打不出 10/30（历史 bug）。
            const raw = (e.detail?.value as string) ?? ''
            setRateInput(raw.replace(/[^\d]/g, '').slice(0, 2))
          }}
          onBlur={() => {
            const v = Number(rateInput)
            const safe = !Number.isFinite(v) || v <= 0 ? 9 : Math.min(30, Math.max(3, v))
            setRateInput(String(safe))
            updateField('referral_rate', safe / 100)
          }}
          placeholder="3~30" />
        <Text className="text-xs text-gray-400 mt-1 block text-center">输入 3~30 之间的整数（表示 3%~30%）</Text>
      </View>
      <View className="mt-2 p-2 rounded-lg bg-primary/10">
        <Text className="text-xs text-primary">
          示例：让利率 10%，订单 100 元 → 品牌让利 10 元，用于消费者推荐奖励 + 健康豆返还 + 品牌收入
        </Text>
      </View>
      {/* 店铺整体让利开关 */}
      <View className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <View className="flex-1 pr-3">
          <Text className="text-sm text-gray-700 font-medium">店铺整体让利</Text>
          <Text className="text-xs text-gray-400 mt-0.5 block">
            {form.referral_rate_enabled
              ? '开启：商品未单独设让利时，按此门店率参与推荐奖励'
              : '关闭：仅商品级让利生效，整店不被统一让利吃掉利润'}
          </Text>
        </View>
        <ToggleSwitch value={form.referral_rate_enabled} onChange={(v) => updateField('referral_rate_enabled', v)} />
      </View>
    </View>
  )
}
