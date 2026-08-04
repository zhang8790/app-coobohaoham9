// L2 统一金刚区：首页唯一入口集群，收敛散落入口、去重、层级分明。
// 去重说明：
//   · 扫码由首屏 Hero 搜索栏的「📷扫码」唯一承载，本区不再重复；
//   · 临期特惠 / 限时福利 原散落在「运营惠专区」双列块，已并入本区，专区整块删除；
//   · 品牌故事（了解来电有喜）已移至「我的」页，不再占首页位置；
//   · 节气食盒已并入「食养中心」hub 内（顺时节气食盒板块），不再单独占金刚区，避免与食养中心重复。
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

type Entry = { emoji: string; label: string; sub: string; url?: string; campaign?: boolean }

const ENTRIES: Entry[] = [
  { emoji: '🌱', label: '食养中心', sub: '体质·节气·方案', url: '/pages/food/index' },
  { emoji: '⏰', label: '临期特惠', sub: '捡漏好物', url: '/pages/expiry/index' },
  { emoji: '🎁', label: '限时福利', sub: '红包实物', campaign: true },
  { emoji: '🎫', label: '会员福利', sub: '金豆权益', url: '/pages/mine/coupon/index' },
]

export default function IconZone({ onCampaign }: { onCampaign?: () => void }) {
  return (
    <View className="mx-4 mt-4">
      <View className="flex items-center gap-1.5 mb-2">
        <View className="section-accent" />
        <Text className="text-base font-bold text-foreground">逛一逛</Text>
        <Text className="text-[10px] text-muted-foreground">精选入口 · 层级分明</Text>
      </View>
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {ENTRIES.map((e) => (
          <View
            key={e.label}
            className="scene-grid-card"
            hoverClass="scene-grid-card-hover"
            style={{ width: 'calc((100% - 24px) / 3)', borderColor: 'hsl(var(--border))' }}
            onClick={() => {
              if (e.campaign) { onCampaign?.(); return }
              if (e.url) Taro.navigateTo({ url: e.url })
            }}
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
