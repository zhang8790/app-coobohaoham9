// L6 品牌故事出口：克制的 B 端出口卡，把完整企业信息（团队/资质/合作/历程）
// 收敛到独立品牌故事页，给投资人/合作方点进去才看全，不稀释 C 端交易转化。
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

export default function BrandStoryEntry() {
  return (
    <View
      className="mx-4 mt-4 rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden active:scale-[0.99] transition-transform"
      hoverClass="none"
      onClick={() => Taro.navigateTo({ url: '/pages/brand-story/index' })}
      style={{ background: 'linear-gradient(120deg, hsl(var(--card)), hsl(40 38% 88%))', borderWidth: 1, borderColor: 'hsl(var(--border))' }}
    >
      <View
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 52, height: 52, borderRadius: 15, background: 'linear-gradient(135deg,#E8C66B,hsl(40 42% 52%))', color: '#fff', fontSize: 26, boxShadow: '0 6px 18px rgba(190,154,78,0.4)' }}
      >
        🏛️
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-extrabold text-foreground block">了解来电有喜</Text>
        <Text className="text-xs text-muted-foreground mt-1 block" style={{ lineHeight: 1.5 }}>
          我们的食养战略、团队、资质与合作机构 →
        </Text>
      </View>
      <Text style={{ fontSize: 20, color: 'hsl(40 42% 52%)' }} className="flex-shrink-0">›</Text>
    </View>
  )
}
