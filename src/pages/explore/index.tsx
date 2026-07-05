// @title 探索
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Image, View, Text, Button } from '@tarojs/components'
import { getNearbyProducts, getCartCount, addToCart } from '@/db/api'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { useLocation } from '@/contexts/LocationContext'
import type { NearbyProduct } from '@/db/api'

const CATEGORIES = ['全部', '图书', '美食', '饮品', '零食', '日用', '礼品']

const STORE_CATEGORY_MAP: Record<string, string> = {
  '图书': '图书', '美食': '美食', '饮品': '饮品', '零食': '零食', '日用': '日用', '礼品': '礼品'
}

// 图片加载失败时的占位组件
function ProductImagePlaceholder({ name }: { name: string }) {
  return (
    <View className="w-full flex items-center justify-center bg-muted"
      style={{ height: '120px' }}>
      <View className="flex flex-col items-center gap-1">
        <View className="i-mdi-image-off text-3xl text-muted-foreground" />
        <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
      </View>
    </View>
  )
}

export default function ExplorePage() {
  const { location } = useLocation()
  const [activeCat, setActiveCat] = useState('全部')
  const [products, setProducts] = useState<NearbyProduct[]>([])
  const [cartCount, setCartCount] = useState(0)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const page = useRef(0)
  const hasMore = useRef(true)

  const loadProducts = useCallback(async (cat: string, reset = true) => {
    if (loading && !reset) return
    const p = reset ? 0 : page.current
    setLoading(true)

    // 如果用户已定位，根据距离推荐附近商品
    if (location?.latitude && location?.longitude) {
      const data = await getNearbyProducts(
        location.latitude,
        location.longitude,
        20,
        cat !== '全部' ? cat : undefined
      )
      if (reset) {
        setProducts(data)
        page.current = 1
      } else {
        setProducts(prev => [...prev, ...data])
        page.current = p + 1
      }
      hasMore.current = data.length === 20
    } else {
      // 如果未定位，使用原来的 API（按时间排序）
      const { getProducts } = await import('@/db/api')
      const data = await getProducts({
        page: p, limit: 20,
        ...(cat !== '全部' ? { search: cat } : {}),
      })
      if (reset) {
        setProducts(data.map(p => ({
          product_id: p.id,
          product_name: p.name,
          product_price: p.price,
          product_image_url: p.image_url || '',
          product_mood_tags: p.mood_tags || [],
          store_id: p.store_id,
          store_name: (p as any).stores?.name || '',
          store_address: '',
          store_lat: 0,
          store_lng: 0,
          distance_km: 0,
        })))
        page.current = 1
      } else {
        setProducts(prev => [...prev, ...data.map(p => ({
          product_id: p.id,
          product_name: p.name,
          product_price: p.price,
          product_image_url: p.image_url || '',
          product_mood_tags: p.mood_tags || [],
          store_id: p.store_id,
          store_name: (p as any).stores?.name || '',
          store_address: '',
          store_lat: 0,
          store_lng: 0,
          distance_km: 0,
        }))])
        page.current = p + 1
      }
      hasMore.current = data.length === 20
    }

    setLoading(false)
  }, [loading, location])

  const refreshCart = useCallback(async () => {
    const c = await getCartCount()
    setCartCount(c)
  }, [])

  // 加载商品（城市信息从 LocationContext 获取）
  useEffect(() => {
    loadProducts('全部')
    refreshCart()
  }, [refreshCart])

  useDidShow(() => { refreshCart() })

  // 分享配置：携带推广码
  useShareWithReferral({
    title: '来店有喜 · 探索江湖好物',
    path: '/pages/explore/index',
    timelineTitle: '来店有喜 · 发现品质好物',
  })

  const handleCatSelect = (cat: string) => {
    setActiveCat(cat)
    loadProducts(cat, true)
  }

  const handleAddCart = async (product: NearbyProduct) => {
    const { supabase } = await import('@/client/supabase')
    const uid = (await supabase.auth.getUser()).data.user
    if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.product_id)
    await addToCart(product.product_id, product.store_id)
    setAddingId(null)
    setCartCount(c => c + 1)
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  const handleLoadMore = () => {
    if (!loading && hasMore.current) loadProducts(activeCat, false)
  }

  const handleImageError = (id: string) => {
    setFailedImages(prev => new Set(prev).add(id))
  }

  return (
    <View className="h-screen flex flex-col bg-background">
      {/* 顶部搜索栏 */}
      <View className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <View className="i-mdi-magnify text-xl text-muted-foreground" />
          <Text className="text-xl text-muted-foreground">搜索商品...</Text>
        </View>
        <Button type="button" className="w-10 h-10 flex items-center justify-center"
          onClick={() => Taro.scanCode({ onlyFromCamera: false }).catch(() => {})}>
          <View className="i-mdi-qrcode-scan text-2xl text-foreground" />
        </Button>
        <View className="relative" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <View className="i-mdi-shopping-outline text-2xl text-foreground" />
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white text-xs">{cartCount > 99 ? '99' : cartCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 主体：左导航+右列表 */}
      <View className="flex flex-1 overflow-hidden">
        {/* 左侧分类 */}
        <View className="w-24 flex flex-col bg-muted overflow-y-auto">
          {CATEGORIES.map(cat => (
            <View key={cat}
              className={`py-4 flex items-center justify-center text-xl font-bold transition ${activeCat === cat ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
              onClick={() => handleCatSelect(cat)}>
              {cat}
            </View>
          ))}
        </View>

        {/* 右侧商品网格 */}
        <View className="flex-1 overflow-y-auto px-3 py-3">
          {loading && products.length === 0 ? (
            <View className="flex items-center justify-center pt-20">
              <View className="i-mdi-loading text-3xl text-primary animate-spin" />
            </View>
          ) : (
            <View className="grid grid-cols-2 gap-3">
              {products.map(p => (
                <View key={p.product_id} className="bg-card rounded-2xl overflow-hidden border border-border relative"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}>
                  {failedImages.has(p.product_id) || !p.product_image_url ? (
                    <ProductImagePlaceholder name={p.product_name} />
                  ) : (
                    <Image src={p.product_image_url || ''} mode="aspectFill" className="w-full" style={{ height: '120px' }}
                      onError={() => handleImageError(p.product_id)} />
                  )}
                  <View className="p-3">
                    <Text className="text-xl font-bold text-foreground leading-tight line-clamp-2">{p.product_name}</Text>
                    {/* 显示距离 */}
                    {p.distance_km > 0 && (
                      <Text className="text-base text-primary mt-1">📍 {p.distance_km}km</Text>
                    )}
                    {/* 显示门店名称 */}
                    {p.store_name && (
                      <Text className="text-base text-muted-foreground mt-1">{p.store_name}</Text>
                    )}
                    {p.product_mood_tags && p.product_mood_tags.length > 0 && (
                      <View className="flex gap-1 mt-1 flex-wrap">
                        {p.product_mood_tags.slice(0, 3).map(t => (
                          <Text key={t} className="px-2 py-0.5 rounded-full text-base bg-primary/10 text-primary">{t}</Text>
                        ))}
                      </View>
                    )}
                    <View className="flex items-center gap-2 mt-1">
                      <Text className="text-xl font-bold text-primary">¥{p.product_price}</Text>
                    </View>
                  </View>
                  <Button type="button"
                    className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-primary flex items-center justify-center"
                    onClick={e => { e.stopPropagation(); handleAddCart(p) }}>
                    {addingId === p.product_id
                      ? <View className="i-mdi-loading text-white text-base animate-spin" />
                      : <View className="i-mdi-plus text-white text-base" />}
                  </Button>
                </View>
              ))}
            </View>
          )}
          {hasMore.current && products.length > 0 && (
            <View className="flex justify-center pt-4 pb-2">
              <Button type="button" className="px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={handleLoadMore}>
                {loading ? '加载中...' : '加载更多'}
              </Button>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
