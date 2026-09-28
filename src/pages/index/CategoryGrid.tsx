// @title 首页金刚区
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getCategories, getProducts } from '@/db/api'
import { useLocation } from '@/contexts/LocationContext'
import type { StoreCategory } from '@/db/types'
import { SCENE_ICON, BRAND_LINE_ICONS } from '@/components/brandIcons'
// 场景展示名单例（避免各页面各自维护导致首屏/好物页名字不一致）
import { sceneLabel } from '@/utils/scene-alias'

/**
 * 首页金刚区（分类导航）
 *
 * 存在的理由：删掉首页 8 个需求入口后，首页变成
 * 「主视觉 → 扫码 CTA → 商品流」的断层结构，中间没有导航层，用户只能被动滚 feed。
 *
 * 铁律：**只渲染真实有货的类目**。每个格子都带真实商品数，
 * 数量来自与落地页完全一致的取数口径（门店 → 城市 → 自营兜底），
 * 所以「点进去有几款」和「格子上写几款」必然一致——不再出现点了就空的入口。
 * 一个类目都没有（例如当前门店尚未铺货）时整块不渲染，不留空壳。
 *
 * 图标统一用品牌专属线性 SVG（见 components/brandIcons.ts）：
 * 8 个场景命中 SCENE_ICON，其余后台可维护类目回退到品牌 leaf 线性图标，
 * 不再使用任何 emoji，保证全站图标语言统一。
 */

export default function CategoryGrid({ storeId }: { storeId?: string }) {
  const { currentCity } = useLocation()
  const [cats, setCats] = useState<Array<StoreCategory & { count: number }>>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        // 取数口径必须与首页 Feed 完全一致（手动选店 → 城市聚合 → 全平台兜底）。
        // ⚠️ 历史 bug：这里曾优先用 currentStore（GPS 最近门店 = 官方自营店），
        // 而自营店是 37 款无类目的老测试数据 → 计数全 0 → 整块金刚区静默消失。
        // Feed 走的是「城市聚合」，两者口径不一致才是「首页有货但金刚区是空」的根因。
        const [catList, pool] = await Promise.all([
          getCategories({ isActive: true }),
          storeId
            ? getProducts({ storeId, limit: 200 })
            : currentCity?.id
              ? getProducts({ cityId: String(currentCity.id), limit: 200 })
              : getProducts({ platformFilter: 'only', limit: 200 }),
        ])
        if (!alive) return
        const counter: Record<string, number> = {}
        for (const p of pool) {
          if (p.category_id) counter[p.category_id] = (counter[p.category_id] || 0) + 1
        }
        setCats(
          catList
            // 金刚区只列一级场景（parent_id 为空）；二级分类在类目落地页顶部以 Tab 呈现
            .filter((c) => c.scope === 'global' && !c.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => ({ ...c, count: counter[c.id] || 0 }))
            .filter((c) => c.count > 0),
        )
      } catch {
        if (alive) setCats([])
      }
    }
    load()
    return () => { alive = false }
  }, [storeId, currentCity?.id])

  if (!cats.length) return null

  return (
    <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border" style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
      {/* 区块标题：菱形 + 双侧渐变线 + 居中主副标题。
          ⚠️ 两侧渐变线用【固定等宽 44px】而非 flex:1 —— 小程序下 flex:1 的宽度分配在部分
          场景不稳定，两侧不等长就会把标题挤偏。固定等宽保证标题绝对居中，视觉两侧对称。 */}
      <View className="flex flex-col items-center">
        <View className="flex items-center justify-center my-1" style={{ gap: 10 }}>
          <View style={{ width: 44, height: 1, flex: '0 0 44px', background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.35))' }} />
          <View style={{ width: 7, height: 7, background: 'hsl(var(--primary))', transform: 'rotate(45deg)', borderRadius: 1, flex: '0 0 7px' }} />
          <Text style={{ fontSize: 16, fontWeight: 700, color: 'hsl(var(--foreground))', letterSpacing: 1, textAlign: 'center' }}>按场景选食养</Text>
          <View style={{ width: 7, height: 7, background: 'hsl(var(--primary))', transform: 'rotate(45deg)', borderRadius: 1, flex: '0 0 7px' }} />
          <View style={{ width: 44, height: 1, flex: '0 0 44px', background: 'linear-gradient(90deg, hsl(var(--primary) / 0.35), transparent)' }} />
        </View>
        <Text style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', textAlign: 'center', marginTop: -2, marginBottom: 14 }}>挑选适配日常状态的小食</Text>
      </View>
      <View className="flex flex-wrap mt-2">
        {cats.map((c) => {
          const label = sceneLabel(c.name)
          return (
          <View
            key={c.id}
            style={{ width: '25%' }}
            className="flex flex-col items-center py-2.5 active:opacity-60 transition-opacity"
            hoverClass="none"
            onClick={() => Taro.navigateTo({
              url: `/pages/goods/list/index?categoryId=${c.id}&name=${encodeURIComponent(label)}`,
            })}
          >
            <View
              className="flex items-center justify-center"
              style={{
                width: '100rpx',
                height: '100rpx',
                borderRadius: '50%',
                background: 'hsl(var(--primary-soft))',
                borderWidth: 1,
                borderColor: 'hsl(var(--primary) / 0.25)',
              }}
            >
              {SCENE_ICON[label] ? (
                <Image src={SCENE_ICON[label]} style={{ width: '56rpx', height: '56rpx' }} />
              ) : (
                <Image src={BRAND_LINE_ICONS['leaf']} style={{ width: '56rpx', height: '56rpx' }} />
              )}
            </View>
            {/* 分类名：与好物页左栏共用 .cat-name（单一事实源，禁止各自硬写字号） */}
            <Text className="cat-name mt-2 truncate" style={{ maxWidth: '136rpx' }}>{label}</Text>
          </View>
          )
        })}
      </View>
    </View>
  )
}
