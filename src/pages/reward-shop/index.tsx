// @title 犒赏铺
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { getStores, getCartCount } from '@/db/api'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import type { Store } from '@/db/types'

const CATEGORIES = ['全部', '餐饮', '购物', '娱乐', '美容', '家政', '教育']

// 图片加载失败时的占位组件
function StoreImagePlaceholder({ name }: { name: string }) {
  return (
    <View className="flex items-center justify-center bg-muted"
      style={{ width: '100px', height: '100px', flexShrink: 0 }}>
      <View className="flex flex-col items-center gap-1">
        <View className="i-mdi-store-outline text-2xl text-muted-foreground" />
        <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
      </View>
    </View>
  )
}

export default function RewardShopPage() {
  const [activeCat, setActiveCat] = useState('全部')
  const [stores, setStores] = useState<Store[]>([])
  const [cartCount, setCartCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const page = useRef(0)
  const hasMore = useRef(true)

  const loadStores = useCallback(async (cat: string, reset = true) => {
    const p = reset ? 0 : page.current
    setLoading(true)
    // ⭐ 犒赏铺只看商家门店，排除自营门店
    const data = await getStores(cat, p, 20, 'exclude')
    console.log('[犒赏铺] loadStores 结果:', { cat, reset, count: data.length, stores: data.map(s => ({ name: s.name, is_active: s.is_active, is_platform: s.is_platform })) })
    if (reset) { setStores(data); page.current = 1 }
    else { setStores(prev => [...prev, ...data]); page.current = p + 1 }
    hasMore.current = data.length === 20
    setLoading(false)
  }, [])

  const refreshCart = useCallback(async () => { setCartCount(await getCartCount()) }, [])

  useEffect(() => { loadStores('全部'); refreshCart() }, [refreshCart])
  useDidShow(() => { refreshCart() })

  // 分享配置：携带推广码
  useShareWithReferral({
    title: '来店有喜 · 犒赏铺，品质门店推荐',
    path: '/pages/reward-shop/index',
    timelineTitle: '来店有喜 · 发现身边好店',
  })

  const handleImageError = (id: string) => {
    setFailedImages(prev => new Set(prev).add(id))
  }

  const getStoreImage = (store: Store): string | null => {
    // 优先 banner_url（用户最新上传），其次 image_url 兜底
    const url = store.banner_url || store.image_url || ''
    // 排除无效值
    if (!url || url === 'null' || url === 'undefined') return null
    if (url.startsWith('wxfile://') || url.startsWith('http://tmp') || url.startsWith('tmp://') || url.startsWith('data:')) return null
    // 只接受 http(s) 开头的公网 URL
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return null
  }

  return (
    <View className="h-screen flex flex-col bg-background">
      {/* 顶部搜索栏 */}
      <View className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <View className="i-mdi-magnify text-xl text-muted-foreground" />
          <Text className="text-xl text-muted-foreground">搜索门店...</Text>
        </View>
        <View className="relative" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <View className="i-mdi-shopping-outline text-2xl text-foreground" />
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white text-xs">{cartCount > 99 ? '99' : cartCount}</Text>
            </View>
          )}
        </View>
      </View>

      <View className="flex flex-1 overflow-hidden">
        {/* 左侧分类 */}
        <ScrollView scrollY className="w-24 flex flex-col bg-muted">
          {CATEGORIES.map(cat => (
            <View key={cat}
              className={`py-4 flex items-center justify-center text-xl font-bold transition ${activeCat === cat ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
              onClick={() => { setActiveCat(cat); loadStores(cat, true) }}>
              <Text>{cat}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 右侧商家列表 */}
        <ScrollView scrollY className="flex-1 px-3 py-3">
          {loading && stores.length === 0 ? (
            <View className="flex items-center justify-center pt-20">
              <View className="i-mdi-loading text-3xl text-primary animate-spin" />
            </View>
          ) : (
            stores.map(store => {
              const img = getStoreImage(store)
              return (
              <View key={store.id} className="bg-card rounded-2xl overflow-hidden border border-border mb-3 flex gap-0"
                onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${store.id}` })}>
                {failedImages.has(store.id) || !img ? (
                  <StoreImagePlaceholder name={store.name} />
                ) : (
                  <Image src={img} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }}
                    onError={() => handleImageError(store.id)} />
                )}
                <View className="flex-1 p-3 flex flex-col justify-between">
                  <View>
                    <Text className="text-xl font-bold text-foreground">{store.name}</Text>
                    {store.category && (
                      <View className="inline-flex mt-1 px-2 py-0.5 rounded-full text-base bg-primary/10 text-primary">
                        <Text className="text-base bg-primary/10 text-primary">{store.category}</Text>
                      </View>
                    )}
                    {store.description && (
                      <Text className="text-base text-muted-foreground mt-1 line-clamp-2">{store.description}</Text>
                    )}
                  </View>
                  <View className="flex items-center gap-2 mt-2">
                    <View className="i-mdi-star text-base text-yellow-500" />
                    <Text className="text-xl text-foreground font-bold">{store.rating}</Text>
                  </View>
                </View>
                <View className="flex items-center pr-3">
                  <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
                </View>
              </View>
              )
            })
          )}
          {hasMore.current && stores.length > 0 && (
            <View className="flex justify-center pt-2 pb-2">
              <View className="px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={() => loadStores(activeCat, false)}>
                <Text>{loading ? '加载中...' : '加载更多'}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}
