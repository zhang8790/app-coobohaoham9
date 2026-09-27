// @title 首页金刚区
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getCategories, getProducts } from '@/db/api'
import { useLocation } from '@/contexts/LocationContext'
import type { StoreCategory } from '@/db/types'
import { SCENE_ICON, BRAND_LINE_ICONS } from '@/components/brandIcons'

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
// 场景展示名桥接：DB 仍为旧名时，首页/落地页立即显示截图（replica）新名；
// 待执行 20260927_rename_scenes_to_replica.sql 把 DB 改名后，此映射自动失效（旧键查不到→原样）。
const SCENE_ALIAS: Record<string, string> = {
  '银发呵护': '老年养生',
  '睡前安适': '舒心食养',
  '体虚调理': '温润食养',
  '肠胃养护': '肠胃食养',
  '熬夜党': '熬夜加餐',
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
      {/* 区块标题：菱形 + 双侧渐变线（对齐截图 replica 的「按场景选食养」装饰风格） */}
      <View className="flex items-center justify-center gap-3 my-1">
        <View style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.35))' }} />
        <View style={{ width: 7, height: 7, background: 'hsl(var(--primary))', transform: 'rotate(45deg)', borderRadius: 1, flex: '0 0 7px' }} />
        <Text style={{ fontSize: 16, fontWeight: 800, color: 'hsl(var(--foreground))', letterSpacing: 1 }}>按场景选食养</Text>
        <View style={{ width: 7, height: 7, background: 'hsl(var(--primary))', transform: 'rotate(45deg)', borderRadius: 1, flex: '0 0 7px' }} />
        <View style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, hsl(var(--primary) / 0.35), transparent)' }} />
      </View>
      <Text className="text-center" style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', marginTop: -4, marginBottom: 14 }}>挑选适配日常状态的小食</Text>
      <View className="flex flex-wrap mt-2">
        {cats.map((c) => {
          const label = SCENE_ALIAS[c.name] ?? c.name
          return (
          <View
            key={c.id}
            style={{ width: '25%' }}
            className="flex flex-col items-center py-2.5 active:opacity-60 transition-opacity"
            hoverClass="none"
            onClick={() => Taro.navigateTo({
              url: `/pages/explore/list/index?categoryId=${c.id}&name=${encodeURIComponent(label)}`,
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
