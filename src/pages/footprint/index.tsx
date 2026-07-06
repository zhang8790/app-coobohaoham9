// @title 浏览足迹
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { getMyFootprints, deleteFootprint } from '@/db/api'
import type { Footprint } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import LazyImage from '@/components/LazyImage'

function FootprintPage() {
  const [items, setItems] = useState<Footprint[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await getMyFootprints(0, 50))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const handleClearAll = () => {
    Taro.showModal({
      title: '清空足迹', content: '确认清空全部浏览记录？',
      confirmText: '清空', confirmColor: '#ef4444',
      success: async (r) => {
        if (r.confirm) {
          await Promise.all(items.map(i => deleteFootprint(i.id)))
          setItems([])
          Taro.showToast({ title: '已清空', icon: 'success' })
        }
      },
    })
  }

  // 按日期分组
  const grouped = items.reduce<Record<string, Footprint[]>>((acc, fp) => {
    const date = new Date(fp.viewed_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    if (!acc[date]) acc[date] = []
    acc[date].push(fp)
    return acc
  }, {})

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {loading ? (
        <View className="flex justify-center py-16">
          <View className="i-mdi-loading text-4xl text-primary animate-spin" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex flex-col items-center py-20 gap-4">
          <View className="i-mdi-history text-7xl text-muted-foreground/30" />
          <Text className="text-xl text-muted-foreground">暂无浏览记录</Text>
        </View>
      ) : (
        <View className="px-4 mt-2">
          {Object.entries(grouped).map(([date, fps]) => (
            <View key={date} className="mb-4">
              <Text className="text-base text-muted-foreground mb-2 px-1">{date}</Text>
              <View className="flex flex-col gap-2">
                {fps.map(fp => {
                  const p = fp.products
                  if (!p) return null
                  return (
                    <View key={fp.id} className="bg-card rounded-2xl border border-border flex items-center gap-3 p-3"
                      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(p.id)}` })}>
                      <View className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                        <LazyImage
                          src={p.image_url}
                          mode="aspectFill"
                          style={{ width: '64px', height: '64px' }}
                          fallbackIcon="i-mdi-image"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-xl font-bold text-foreground line-clamp-1">{p.name}</Text>
                        <View className="flex items-center justify-between mt-1">
                          <Text className="text-xl font-bold text-primary">¥{p.price}</Text>
                          {p.stores && <Text className="text-base text-muted-foreground">{p.stores.name}</Text>}
                        </View>
                      </View>
                      <View
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-muted flex-shrink-0"
                        onClick={e => { e.stopPropagation(); deleteFootprint(fp.id).then(() => setItems(prev => prev.filter(f => f.id !== fp.id))) }}>
                        <View className="i-mdi-close text-xl text-muted-foreground" />
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default FootprintPage
