// L2 统一金刚区：把原先散落的小程序扫码×3、食养路径×5、活动散落等入口
// 收敛为 6 个标准入口，统一图标语言与跳转，建立「层级分明」的导航心智。
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

const ENTRIES = [
  { emoji: '🌱', label: '食养中心', sub: '体质·方案', url: '/pages/food/index' },
  { emoji: '📷', label: '扫码查安全', sub: '成分报告', url: '/pages/food/food-scan/index' },
  { emoji: '🍱', label: '节气食盒', sub: '当季限定', url: '/pages/food/seasonal-box/index' },
  { emoji: '⏰', label: '临期特惠', sub: '捡漏好物', url: '/pages/expiry/index' },
  { emoji: '🎁', label: '会员福利', sub: '金豆权益', url: '/pages/mine/coupon/index' },
  { emoji: '🏛️', label: '品牌故事', sub: '企业实力', url: '/pages/brand-story/index' },
]

export default function IconZone() {
  return (
    <View className="mx-4 mt-4">
      <View className="flex items-center gap-1.5 mb-2">
        <View className="section-accent" />
        <Text className="text-base font-bold text-foreground">逛一逛</Text>
        <Text className="text-[10px] text-muted-foreground">六大入口 · 层级分明</Text>
      </View>
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {ENTRIES.map((e) => (
          <View
            key={e.label}
            className="scene-grid-card"
            hoverClass="scene-grid-card-hover"
            style={{ width: 'calc((100% - 24px) / 3)', borderColor: 'hsl(var(--border))' }}
            onClick={() => Taro.navigateTo({ url: e.url })}
          >
            <View
              className="flex items-center justify-center mb-1.5"
              style={{ width: 44, height: 44, borderRadius: 13, background: 'hsl(var(--primary) / 0.10)', fontSize: 22 }}
            >
              {e.emoji}
            </View>
            <Text className="text-sm font-bold text-foreground block">{e.label}</Text>
            <Text className="text-[10px] text-muted-foreground mt-0.5 block">{e.sub}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
