// L2 统一金刚区：首页唯一入口集群，收敛散落入口、去重、层级分明。
// 去重说明：
//   · 入口清单来自 src/config/nav-registry.ts（全站唯一登记册），本组件不再就地硬编码 label/url；
//   · 扫码由首屏 Hero 搜索栏的「📷扫码」唯一承载，本区不再重复；
//   · 临期特惠 / 限时福利 / 食养中心 等统一在登记册定义，避免重复造入口；
//   · 品牌故事（了解来电有喜）已移至「我的」页服务中心分组，不再占首页位置；
//   · 节气食盒已并入「食养中心」hub 内（顺时节气食盒板块），不单独占金刚区。
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ReactNode } from 'react'
import { NAV, HOME_ICON_ZONE } from '@/config/nav-registry'

export default function IconZone({ onCampaign, extraBottom }: { onCampaign?: () => void; extraBottom?: ReactNode }) {
  const entries = HOME_ICON_ZONE.map(id => NAV[id]).filter(Boolean)
  return (
    <View className="mx-4 mt-4">
      <View className="flex items-center gap-1.5 mb-2">
        <View className="section-accent" />
        <Text className="text-base font-bold text-foreground">优惠福利</Text>
        <Text className="text-[10px] text-muted-foreground">临期 · 限时 · 食养偏好</Text>
      </View>
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {entries.map((e) => (
          <View
            key={e.id}
            className="scene-grid-card"
            hoverClass="scene-grid-card-hover"
            style={{ width: 'calc((100% - 24px) / 3)', borderColor: 'hsl(var(--border))' }}
            onClick={() => {
              if (e.kind === 'campaign') { onCampaign?.(); return }
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
            {e.sub && <Text className="text-[10px] text-muted-foreground mt-0.5 block">{e.sub}</Text>}
          </View>
        ))}
      </View>
      {/* 日常饮食偏好等附加区块：虚线分隔嵌入优惠福利卡内（首页改版 2026-08-04） */}
      {extraBottom && (
        <View className="mt-4 pt-4" style={{ borderTop: '1px dashed hsl(var(--border))' }}>
          {extraBottom}
        </View>
      )}
    </View>
  )
}
