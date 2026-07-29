// @title 临期特惠
import { useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { getNearExpiryProducts } from '@/db/api'
import type { StoreNearExpiry } from '@/db/types'
import ProductGridCard from '@/components/ProductGridCard'

// 分级中文 + 配色（红=紧急 / 橙=紧迫 / 琥珀=临期）
const STAGE_META: Record<string, { label: string; color: string }> = {
  red: { label: '紧急', color: '#EF4444' },
  orange: { label: '紧迫', color: '#F97316' },
  amber: { label: '临期', color: '#F59E0B' },
}

type FilterKey = 'all' | 'red' | 'orange' | 'amber'

export default function ExpiryPage() {
  const [list, setList] = useState<StoreNearExpiry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getNearExpiryProducts({ limit: 100 })
    setList(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? list : list.filter((p) => p.discount_stage === filter)
  const counts: Record<FilterKey, number> = {
    all: list.length,
    red: list.filter((p) => p.discount_stage === 'red').length,
    orange: list.filter((p) => p.discount_stage === 'orange').length,
    amber: list.filter((p) => p.discount_stage === 'amber').length,
  }

  const tabs: FilterKey[] = ['all', 'red', 'orange', 'amber']

  return (
    <View className="min-h-screen bg-background">
      {/* 头部 */}
      <View className="px-4 pt-3 pb-2">
        <Text className="text-2xl font-extrabold text-foreground">临期特惠</Text>
        <Text className="block text-xs text-muted-foreground mt-1">
          越临近过期折扣越大 · 新鲜不浪费，闭眼囤
        </Text>
      </View>

      {/* 分级筛选 */}
      <View className="flex items-center gap-2 px-4 pb-3">
        {tabs.map((k) => (
          <View
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${filter === k ? 'text-white' : 'text-muted-foreground bg-card'}`}
            style={filter === k ? { background: k === 'all' ? 'hsl(var(--primary))' : STAGE_META[k].color } : undefined}
          >
            {k === 'all' ? '全部' : STAGE_META[k].label} {counts[k]}
          </View>
        ))}
      </View>

      {/* 网格 */}
      <View className="px-3 flex flex-wrap justify-between">
        {loading ? (
          <View className="w-full py-20 flex items-center justify-center">
            <Text className="text-muted-foreground">加载中…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="w-full py-20 flex flex-col items-center">
            <Text className="text-4xl mb-2">🥫</Text>
            <Text className="text-muted-foreground">暂无临期商品</Text>
            <Text className="text-xs text-muted-foreground mt-1">库存都新鲜着呢~</Text>
          </View>
        ) : (
          filtered.map((p) => (
            <ProductGridCard
              key={p.batch_id}
              id={p.product_id}
              name={p.name || '商品'}
              price={p.effective_price}
              originalPrice={p.price}
              imageUrl={p.image_url}
              imageRatio="4:3"
              subtitle={`剩 ${p.days_left} 天`}
              footerExtra={
                <View className="flex items-center gap-1.5 mt-1">
                  <View
                    className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ background: STAGE_META[p.discount_stage].color }}
                  >
                    {STAGE_META[p.discount_stage].label} · 省{p.auto_discount_rate}%
                  </View>
                  {p.decided_by === 'ai' && (
                    <Text className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15">
                      AI
                    </Text>
                  )}
                </View>
              }
              onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}
            />
          ))
        )}
      </View>
    </View>
  )
}
