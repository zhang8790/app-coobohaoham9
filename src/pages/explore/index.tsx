// @title 探索
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { getNearbyProducts, getCartCount, addToCart, getProducts, getProductsByEmotion } from '@/db/api'
import { recordEmotionPreference, getEmotionBasedRecommendations } from '@/utils/emotion-recommendation'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { useLocation } from '@/contexts/LocationContext'
import LazyImage from '@/components/LazyImage'
import type { NearbyProduct } from '@/db/api'

const CATEGORIES = ['全部', '图书', '美食', '饮品', '零食', '日用', '礼品', '情绪']

// 情绪筛选选项
const EMOTION_FILTERS = [
  { tag: '快乐', icon: '😊' },
  { tag: '温馨', icon: '🏠' },
  { tag: '清爽', icon: '🍃' },
  { tag: '奢华', icon: '👑' },
  { tag: '有趣', icon: '🎈' },
  { tag: '平静', icon: '🧘' },
]

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
  const [emotionProducts, setEmotionProducts] = useState<Product[]>([]) // 情绪推荐商品
  const [showEmotionSection, setShowEmotionSection] = useState(false) // 是否显示情绪推荐区
  const [cartCount, setCartCount] = useState(0)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const page = useRef(0)
  const hasMore = useRef(true)

  const loadProducts = useCallback(async (cat: string, reset = true) => {
    if (loading && !reset) return
    const p = reset ? 0 : page.current
    setLoading(true)

    // 如果用户已定位，根据距离推荐附近商品（只显示自营门店商品）
    if (location?.latitude && location?.longitude) {
      const data = await getNearbyProducts(
        location.latitude,
        location.longitude,
        20,
        cat !== '全部' ? cat : undefined,
        'only'  // ✅ 只显示自营门店商品
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
      // 如果未定位，使用原来的 API（按时间排序）— 只显示自营门店商品
      const { getProducts } = await import('@/db/api')
      const data = await getProducts({
        page: p, limit: 20,
        platformFilter: 'only',  // ✅ 只显示自营门店商品
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
    
    // 加载情绪推荐商品
    const loadEmotionRecs = async () => {
      const { supabase } = await import('@/client/supabase')
      const uid = (await supabase.auth.getUser()).data.user?.id
      if (!uid) return
      
      const recs = await getEmotionBasedRecommendations(uid, 10)
      if (recs && recs.length > 0) {
        setEmotionProducts(recs)
        setShowEmotionSection(true)
      }
    }
    
    loadEmotionRecs()
  }, [refreshCart])

  useDidShow(() => { refreshCart() })

  // 分享配置：携带推广码
  useShareWithReferral({
    title: '来电有喜 · 探索江湖好物',
    path: '/pages/explore/index',
    timelineTitle: '来电有喜 · 发现品质好物',
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

  return (
    <View className="h-screen flex flex-col bg-background">
      {/* 顶部搜索栏 */}
      <View className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <View className="i-mdi-magnify text-xl text-muted-foreground" />
          <Text className="text-xl text-muted-foreground">搜索商品...</Text>
        </View>
        <View className="w-10 h-10 flex items-center justify-center"
          onClick={() => {
            Taro.scanCode({
              onlyFromCamera: false,
              success: (res) => {
                console.log('[Explore] 扫码结果:', res.result)
                // 处理扫码结果（可能是商品条码或推广码）
                Taro.showToast({ title: '扫码成功', icon: 'success' })
              },
              fail: (err) => {
                console.log('[Explore] 扫码取消或失败:', err)
              }
            })
          }}>
          <View className="i-mdi-qrcode-scan text-2xl text-foreground" />
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

        {/* 右侧内容 */}
        <View className="flex-1 overflow-y-auto px-3 py-3">
          {/* 情绪推荐区 */}
          {showEmotionSection && emotionProducts.length > 0 && (
            <View className="mb-4">
              <View className="flex items-center gap-2 mb-3">
                <Text className="text-xl font-bold text-foreground">😊 根据你的情绪偏好推荐</Text>
              </View>
              <View className="grid grid-cols-2 gap-3">
                {emotionProducts.slice(0, 4).map((p: any) => (
                  <View key={p.id} className="bg-card rounded-2xl overflow-hidden border border-border"
                    onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                    <LazyImage 
                      src={p.main_image || p.image_url || ''} 
                      mode="aspectFill"
                      className="w-full"
                      style={{ height: '100px' }}
                    />
                    <View className="p-2">
                      <Text className="text-xl font-bold text-foreground leading-tight line-clamp-2">{p.name}</Text>
                      {p.mood_tags && p.mood_tags.length > 0 && (
                        <View className="flex gap-1 mt-1 flex-wrap">
                          {p.mood_tags.slice(0, 2).map((t: string) => (
                            <Text key={t} className="px-2 py-0.5 rounded-full text-base bg-primary/10 text-primary">{t}</Text>
                          ))}
                        </View>
                      )}
                      <Text className="text-xl font-bold text-primary mt-1">¥{p.price}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 情绪筛选区（当选择"情绪"分类时显示） */}
          {activeCat === '情绪' && (
            <View className="mb-4">
              <Text className="text-xl font-bold text-foreground mb-3" style={{ display: 'block' }}>🎯 选择你想感受的情绪</Text>
              <View className="flex gap-2 flex-wrap">
                {EMOTION_FILTERS.map((item, idx) => (
                  <View
                    key={idx}
                    onClick={async () => {
                      setLoading(true)
                      const data = await getProducts({ moodTag: item.tag, platformFilter: 'only', limit: 20 })
                      setProducts(data.map(p => ({
                        product_id: p.id,
                        product_name: p.name,
                        product_price: p.price,
                        product_image_url: p.main_image || p.image_url || '',
                        product_mood_tags: p.mood_tags || [],
                        store_id: p.store_id,
                        store_name: (p as any).stores?.name || '',
                        store_address: '',
                        store_lat: 0,
                        store_lng: 0,
                        distance_km: 0,
                      })))
                      setLoading(false)
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      background: '#F5F5F5',
                      border: '1.5px solid #EEE',
                    }}>
                    <Text style={{ fontSize: '14px' }}>{item.icon} {item.tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 商品网格 */}
          {loading && products.length === 0 ? (
            <View className="flex items-center justify-center pt-20">
              <View className="i-mdi-loading text-3xl text-primary animate-spin" />
            </View>
          ) : (
            <View className="grid grid-cols-2 gap-3">
              {products.map(p => (
                <View key={p.product_id} className="bg-card rounded-2xl overflow-hidden border border-border relative"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}>
                  {!p.product_image_url ? (
                    <ProductImagePlaceholder name={p.product_name} />
                  ) : (
                    <LazyImage 
                      src={p.product_image_url} 
                      mode="aspectFill"
                      className="w-full"
                      style={{ height: '120px' }}
                    />
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
