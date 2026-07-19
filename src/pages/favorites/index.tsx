// @title 我的收藏
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { getMyFavorites, toggleFavorite } from '@/db/api'
import type { Favorite } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import LazyImage from '@/components/LazyImage'

function FavoritesPage() {
  const [items, setItems] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await getMyFavorites())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const handleRemove = async (fav: Favorite) => {
    setRemovingId(fav.id)
    await toggleFavorite(fav.product_id)
    setItems(prev => prev.filter(f => f.id !== fav.id))
    setRemovingId(null)
    Taro.showToast({ title: '已取消收藏', icon: 'none' })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {loading ? (
        <View className="flex justify-center py-16">
          <View className="i-mdi-loading text-4xl text-primary animate-spin" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex flex-col items-center py-20 gap-4">
          <View className="i-mdi-heart-off-outline text-7xl text-muted-foreground/30" />
          <Text className="text-xl text-muted-foreground">暂无收藏，去逛逛吧</Text>
          <View type="button"
            className="flex items-center justify-center leading-none rounded-2xl bg-primary"
            onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
            <View className="py-3 px-8 text-xl font-bold text-white">去逛逛</View>
          </View>
        </View>
      ) : (
        <View className="px-4 mt-2">
          <Text className="text-base text-muted-foreground mb-3">共 {items.length} 件收藏</Text>
          <View className="grid grid-cols-2 gap-3">
            {items.map(fav => {
              const p = fav.products
              if (!p) return null
              return (
                <View key={fav.id} className="bg-card rounded-2xl border border-border overflow-hidden"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(p.id)}` })}>
                  <View className="relative" style={{ height: '160px' }}>
                    <LazyImage
                      src={p.image_url}
                      mode="aspectFill"
                      style={{ width: '100%', height: '160px' }}
                      fallbackIcon="i-mdi-image"
                    />
                    <View type="button"
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center"
                      onClick={e => { e.stopPropagation(); handleRemove(fav) }}>
                      {removingId === fav.id
                        ? <View className="i-mdi-loading text-xl text-primary animate-spin" />
                        : <View className="i-mdi-heart text-xl text-red-400" />}
                    </View>
                  </View>
                  <View className="p-3">
                    <Text className="text-xl font-bold text-foreground line-clamp-2">{p.name}</Text>
                    <View className="flex items-center justify-between mt-2">
                      <Text className="text-xl font-bold text-primary">¥{p.price}</Text>
                      {p.stores && <Text className="text-base text-muted-foreground line-clamp-1">{p.stores.name}</Text>}
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default FavoritesPage
