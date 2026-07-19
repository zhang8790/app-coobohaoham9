// @title 探索
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { getNearbyProducts, addToCart, getProducts } from '@/db/api'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { getEmotionBasedRecommendations } from '@/utils/emotion-recommendation'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { useLocation } from '@/contexts/LocationContext'
import LazyImage from '@/components/LazyImage'
import StoreStrip from '@/components/StoreStrip'
import ProductGridCard from '@/components/ProductGridCard'
import { generateEmotionDescription } from '@/utils/emotion-description'
import { UNIFIED_EMOTION_FILTERS } from '@/utils/category-emotion'
import type { NearbyProduct } from '@/db/api'

// 探索(自营)商品类目：后端按 products.category exact 匹配（不可改名）。
// 语义对齐见 category-emotion.ts 的 EXPLORE_PRODUCT_CATEGORY_TO_LOCAL_LIFE（商品类目 → 本地生活业态），
// 与犒赏铺门店类目(REWARD_SHOP_CATEGORY_TO_LOCAL_LIFE)统一到「本地生活」框架。
const CATEGORIES = ['全部', '图书', '美食', '饮品', '零食', '日用', '礼品', '情绪']

// 情绪筛选层：与犒赏铺共用统一情绪筛选 chips（category-emotion.ts: UNIFIED_EMOTION_FILTERS），
// 实现「探索 / 犒赏铺」两类目体系共享同一情绪维度。
const EMOTION_FILTERS = UNIFIED_EMOTION_FILTERS

const STORE_CATEGORY_MAP: Record<string, string> = {
  '图书': '图书', '美食': '美食', '饮品': '饮品', '零食': '零食', '日用': '日用', '礼品': '礼品'
}

// 探索页商品图：全宽 16:10 + 缺失占位
function ExploreProductImage({ src, name }: { src: string | null | undefined; name: string }) {
  if (!src) {
    return (
      <View className="w-full flex items-center justify-center" style={{ height: '150px', backgroundColor: '#F7F3EF' }}>
        <View className="flex flex-col items-center gap-1">
          <Text style={{ fontSize: '28px' }}>🛍️</Text>
          <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
        </View>
      </View>
    )
  }
  return (
    <LazyImage
      src={src}
      mode="aspectFill"
      className="w-full bg-muted"
      style={{ height: '150px' }}
    />
  )
}

// 情绪推荐商品图：全宽 16:10 + 缺失占位
function EmotionProductImage({ src, name }: { src: string | null | undefined; name: string }) {
  if (!src) {
    return (
      <View className="w-full flex items-center justify-center" style={{ height: '150px', backgroundColor: '#F7F3EF' }}>
        <View className="flex flex-col items-center gap-1">
          <Text style={{ fontSize: '28px' }}>🎁</Text>
          <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
        </View>
      </View>
    )
  }
  return (
    <LazyImage
      src={src}
      mode="aspectFill"
      className="w-full bg-muted"
      style={{ height: '150px' }}
    />
  )
}

export default function ExplorePage() {
  const { location } = useLocation()
  const [activeCat, setActiveCat] = useState('全部')
  const [products, setProducts] = useState<NearbyProduct[]>([])
  const [emotionProducts, setEmotionProducts] = useState<Product[]>([]) // 情绪推荐商品
  const [showEmotionSection, setShowEmotionSection] = useState(false) // 是否显示情绪推荐区
  const cartCount = useCartCount()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addingEmotionId, setAddingEmotionId] = useState<string | null>(null)
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
        ...(cat !== '全部' ? { search: cat } : {})})
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
          distance_km: 0})))
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
          distance_km: 0}))])
        page.current = p + 1
      }
      hasMore.current = data.length === 20
    }

    setLoading(false)
  }, [loading, location])

  const refreshCart = useCallback(async () => {
    await refreshCartCount()
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
    timelineTitle: '来电有喜 · 发现品质好物'})

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
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  // 情绪推荐卡片的加购（商品为 Product 类型，id/store_id 字段不同）
  const handleAddCartEmotion = async (p: any) => {
    const { supabase } = await import('@/client/supabase')
    const uid = (await supabase.auth.getUser()).data.user
    if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingEmotionId(p.id)
    await addToCart(p.id, p.store_id)
    setAddingEmotionId(null)
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
                Taro.navigateTo({ url: `/pages/scan-result/index?code=${encodeURIComponent(res.result)}` })
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
          {/* 精选好店 横向滑动 */}
          <StoreStrip />
          {/* 情绪推荐区 */}
          {showEmotionSection && emotionProducts.length > 0 && (
            <View className="mb-4">
              <View className="flex items-center gap-2 mb-3">
                <Text className="text-xl font-bold text-foreground">😊 根据你的情绪偏好推荐</Text>
              </View>
              <View className="flex flex-wrap justify-between">
                {emotionProducts.slice(0, 4).map((p: any) => (
                  <ProductGridCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    price={p.price}
                    imageSlot={<EmotionProductImage src={p.main_image || p.image_url} name={p.name} />}
                    moodTags={p.mood_tags}
                    onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                    onAddCart={() => handleAddCartEmotion(p)}
                    adding={addingEmotionId === p.id}
                  />
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
                        distance_km: 0})))
                      setLoading(false)
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      background: '#F5F5F5',
                      border: '1.5px solid #EEE'}}>
                    <Text style={{ fontSize: '14px' }}>{item.icon} {item.tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 商品网格 */}
          {loading && products.length === 0 ? (
            <View className="flex flex-wrap justify-between">
              {[0, 1, 2, 3].map(i => (
                <View key={i} className="bg-card rounded-2xl border border-border animate-pulse flex flex-col overflow-hidden" style={{ width: '48%', marginBottom: '12px' }}>
                  <View className="bg-muted w-full" style={{ height: '150px' }} />
                  <View className="p-2.5 flex flex-col gap-2">
                    <View className="h-4 bg-muted rounded w-3/4" />
                    <View className="h-3 bg-muted rounded w-1/2" />
                    <View className="h-4 bg-muted rounded w-1/3" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="flex flex-wrap justify-between">
              {products.map(p => (
                <ProductGridCard
                  key={p.product_id}
                  id={p.product_id}
                  name={p.product_name}
                  price={p.product_price}
                  imageSlot={<ExploreProductImage src={p.product_image_url} name={p.product_name} />}
                  moodTags={p.product_mood_tags}
                  subtitle={generateEmotionDescription({ name: p.product_name }, p.product_mood_tags || [])}
                  footerExtra={p.distance_km > 0 ? <Text className="text-xs text-primary">📍 {p.distance_km}km</Text> : null}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}
                  onAddCart={() => handleAddCart(p)}
                  adding={addingId === p.product_id}
                />
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
