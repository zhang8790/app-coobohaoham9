// 通用开关（店铺设置页多处复用：营业状态 / 整体让利 / 配送 / 打印机启用 / 支付后自动打印）
import { View } from '@tarojs/components'

export default function ToggleSwitch({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <View
      className={`w-12 h-7 rounded-full relative ${value ? 'bg-success' : 'bg-muted'}`}
      onClick={() => onChange(!value)}
    >
      <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
    </View>
  )
}
