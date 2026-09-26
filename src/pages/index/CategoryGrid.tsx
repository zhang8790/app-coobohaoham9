// @title 首页金刚区
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { getCategories, getProducts } from '@/db/api'
import { useLocation } from '@/contexts/LocationContext'
import type { StoreCategory } from '@/db/types'

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
 * 图标取 Base64 白名单内的通用语义图标（见 components/Icon/iconBase64.ts），
 * 类目是后台可维护的动态数据，未命中的类目回退到 leaf，不会显示空白。
 */
// 金刚区图标：彩色 emoji（贴近截图 3D 风格；小程序真机彩色，开发者工具可能灰显）
// key 与 store_categories 库内 name 保持一致（已在 Supabase 后台统一为场景名）
const CAT_EMOJI: Record<string, string> = {
  '宝宝零食': '🍼',
  '孕产营养': '🥕',
  '银发呵护': '👵',
  '睡前安适': '🌙',
  '肠胃养护': '🥣',
  '体虚调理': '💪',
  '敏感防护': '🛡️',
  '熬夜党': '⚡',
}

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
            .filter((c) => c.scope === 'global')
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
      <View className="flex items-center mb-1" style={{ borderLeft: '3px solid hsl(var(--primary))', paddingLeft: 8 }}>
        <Text className="cat-eyebrow">按场景挑好物</Text>
      </View>
      <View className="flex flex-wrap mt-2">
        {cats.map((c) => (
          <View
            key={c.id}
            style={{ width: '25%' }}
            className="flex flex-col items-center py-2.5 active:opacity-60 transition-opacity"
            hoverClass="none"
            onClick={() => Taro.navigateTo({
              url: `/pages/explore/list/index?categoryId=${c.id}&name=${encodeURIComponent(c.name)}`,
            })}
          >
            <View
              className="flex items-center justify-center"
              style={{
                width: '100rpx',
                height: '100rpx',
                borderRadius: '30rpx',
                background: 'hsl(var(--primary-soft))',
              }}
            >
              <Text style={{ fontSize: '52rpx' }}>{c.icon || CAT_EMOJI[c.name] || '🌿'}</Text>
            </View>
            {/* 分类名：与好物页左栏共用 .cat-name（单一事实源，禁止各自硬写字号） */}
            <Text className="cat-name mt-2 truncate" style={{ maxWidth: '136rpx' }}>{c.name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
