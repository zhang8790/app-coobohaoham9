// @title 横向滑动门店卡（精选好店）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { getStores } from '@/db/api'
import type { Store } from '@/db/types'

/**
 * 横向滑动门店卡：在首页/探索页顶部展示「精选好店」，
 * 每张卡宽 140px，横滑可看多家，纵向仅占用 ~150px，
 * 比把门店信息塞进商品卡更优雅、信息更聚焦。
 * 展示：logo(无则🏪占位) + 店名(单行截断) + ★评分 + 分类。
 * 注：Store 无经纬度字段，无法算精确距离，故标题用「精选好店」而非「附近」。
 */
export default function StoreStrip({
  title = '精选好店',
  limit = 8,
}: {
  title?: string
  limit?: number
}) {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getStores(undefined, 0, limit)
      .then((list) => { if (alive) setStores(list) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [limit])

  const goStore = (id: string) => {
    Taro.navigateTo({ url: `/pages/store-home/index?id=${id}` })
  }

  return (
    <View className="px-3 mt-3">
      <Text className="text-lg font-bold text-foreground block mb-2">{title}</Text>

      <ScrollView scrollX showScrollbar={false} className="store-strip-scroll">
        <View className="flex flex-row gap-2 pr-3" style={{ display: 'flex', flexDirection: 'row' }}>
          {loading
            ? [0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  className="bg-card rounded-xl border border-border animate-pulse"
                    style={{ width: '112px', flexShrink: 0 }}
                  >
                    <View className="w-full bg-muted" style={{ height: '80px' }} />
                  <View className="p-2 flex flex-col gap-1.5">
                    <View className="h-4 bg-muted rounded w-3/4" />
                    <View className="h-3 bg-muted rounded w-1/2" />
                  </View>
                </View>
              ))
            : stores.map((s) => {
                const logo = s.image_url || s.banner_url
                return (
                  <View
                    key={s.id}
                    onClick={() => goStore(s.id)}
                    className="bg-card rounded-xl border border-border overflow-hidden"
                    style={{ width: '112px', flexShrink: 0 }}
                  >
                    <View
                      style={{
                        width: '80px',
                        height: '80px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: logo ? 'transparent' : 'rgba(194,65,12,0.06)',
                      }}
                    >
                      {logo ? (
                        <Image src={logo} mode="aspectFill" style={{ width: '80px', height: '80px' }} />
                      ) : (
                        <Text style={{ fontSize: '32px' }}>🏪</Text>
                      )}
                    </View>
                    <View className="p-2">
                      <Text
                        className="text-base font-bold text-foreground leading-tight block"
                        style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {s.name}
                      </Text>
                      <View className="flex items-center gap-1 mt-1">
                        <Text className="text-sm text-primary font-bold">★ {s.rating || '5.0'}</Text>
                        {s.category && (
                          <Text
                            className="text-xs text-muted-foreground"
                            style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                          >
                            {s.category}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                )
              })}
        </View>
      </ScrollView>
    </View>
  )
}
