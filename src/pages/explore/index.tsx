// @title 自营
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import { getNearbyProducts, addToCart, getProducts } from '@/db/api'
import Icon from '@/components/Icon'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { getEmotionBasedRecommendations } from '@/utils/emotion-recommendation'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { useLocation } from '@/contexts/LocationContext'
import LazyImage from '@/components/LazyImage'
import ProductGridCard from '@/components/ProductGridCard'
import CustomTabBar from '@/components/custom-tabbar'
import { generateEmotionDescription } from '@/utils/emotion-description'
import { UNIFIED_EMOTION_FILTERS } from '@/utils/category-emotion'
import { getProductCareInfo } from '@/utils/product-care'
import type { NearbyProduct } from '@/db/api'
import type { Product } from '@/db/types'

// 探索(自营)商品类目：后端按 products.category exact 匹配（不可改名）。
const CATEGORIES = ['全部', '图书', '美食', '饮品', '零食', '日用', '礼品', '情绪']

// 情绪筛选层：统一情绪筛选 chips（category-emotion.ts: UNIFIED_EMOTION_FILTERS）
const EMOTION_FILTERS = UNIFIED_EMOTION_FILTERS

const STORE_CATEGORY_MAP: Record<string, string> = {
  '图书': '图书', '美食': '美食', '饮品': '饮品', '零食': '零食', '日用': '日用', '礼品': '礼品'
}

// 探索页商品图：全宽 16:10 + 缺失占位
function ExploreProductImage({ src, name }: { src: string | null | undefined; name: string }) {
  if (!src) {
    return (
      <View className="relative w-full overflow-hidden" style={{ paddingTop: '100%', backgroundColor: '#F7F3EF' }}>
        <View className="flex flex-col items-center justify-center" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Icon name="bag" size={28} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
        </View>
      </View>
    )
  }
  return (
    <View className="relative w-full overflow-hidden" style={{ paddingTop: '100%' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <LazyImage
          src={src}
          mode="aspectFill"
          className="w-full h-full bg-muted"
          width="100%"
          height="100%" />
      </View>
    </View>
  )
}

// 情绪推荐商品图：1:1 正方形，与商品卡统一比例
function EmotionProductImage({ src, name }: { src: string | null | undefined; name: string }) {
  if (!src) {
    return (
      <View className="relative w-full overflow-hidden" style={{ paddingTop: '100%', backgroundColor: '#F7F3EF' }}>
        <View className="flex flex-col items-center justify-center" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Text style={{ fontSize: '28px' }}>🎁</Text>
          <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
        </View>
      </View>
    )
  }
  return (
    <View className="relative w-full overflow-hidden" style={{ paddingTop: '100%' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <LazyImage
          src={src}
          mode="aspectFill"
          className="w-full h-full bg-muted"
          width="100%"
          height="100%" />
      </View>
    </View>
  )
}

// 探索页商品卡复用 ProductGridCard；当前仅自营门店商品
export default function ExplorePage() {
  const { currentLocation, currentStore, nearbyStores, setStore, followLocation, detectLocation } = useLocation()
  const [activeCat, setActiveCat] = useState('全部')
  const [products, setProducts] = useState<NearbyProduct[]>([])
  const [emotionProducts, setEmotionProducts] = useState<Product[]>([]) // 情绪推荐商品
  const [showEmotionSection, setShowEmotionSection] = useState(false) // 是否显示情绪推荐区
  const cartCount = useCartCount()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addingEmotionId, setAddingEmotionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const page = useRef(0)
  const hasMore = useRef(true)

  const loadProducts = useCallback(async (cat: string, reset = true) => {
    if (loading && !reset) return
    const p = reset ? 0 : page.current
    setLoading(true)

    // 默认只显示【当前自营门店】商品；未选定门店时降级为附近/全部自营聚合
    const catParam = cat !== '全部' ? cat : undefined
    const mapToNearby = (p: any) => ({
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
    })

    if (currentStore?.id) {
      // ✅ 已选定当前门店：仅该门店商品（按时间倒序）
      const data = await getProducts({
        storeId: currentStore.id,
        platformFilter: 'only',
        page: p, limit: 20,
        ...(catParam ? { search: catParam } : {}),
      })
      const mapped = data.map(mapToNearby)
      if (reset) { setProducts(mapped); page.current = 1 }
      else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
      hasMore.current = data.length === 20
    } else if (currentLocation?.lat && currentLocation?.lng) {
      // 降级：有定位但未选定门店 → 附近全部自营门店聚合（按距离）
      const data = await getNearbyProducts(
        currentLocation.lat,
        currentLocation.lng,
        20,
        catParam,
        'only'  // ✅ 只显示自营门店商品
      )
      if (reset) { setProducts(data); page.current = 1 }
      else { setProducts(prev => [...prev, ...data]); page.current = p + 1 }
      hasMore.current = data.length === 20
    } else {
      // 降级：未定位未选店 → 时间排序全部自营
      const data = await getProducts({
        page: p, limit: 20,
        platformFilter: 'only',
        ...(catParam ? { search: catParam } : {}),
      })
      const mapped = data.map(mapToNearby)
      if (reset) { setProducts(mapped); page.current = 1 }
      else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
      hasMore.current = data.length === 20
    }

    setLoading(false)
  }, [loading, currentLocation, currentStore])

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
    title: '来电有喜 · 自营江湖好物',
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

  // 进入探索页时若无定位，自动检测（同时按定位切换最近自营门店）
  useEffect(() => {
    if (!currentLocation) detectLocation()
  }, [currentLocation, detectLocation])

  // 当前门店切换（手动切换 / 跟随定位 / 定位解析完成）→ 重新加载该门店商品
  useEffect(() => {
    if (!currentStore?.id) return
    page.current = 0
    loadProducts(activeCat, true)
    // 仅在门店变化时触发；分类切换由 handleCatSelect 负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.id])

  return (
    <View className="h-screen flex flex-col bg-background tabbar-pad">
      {/* 顶部搜索栏 */}
      <View className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <View className="text-muted-foreground"><Icon name="search" size={20} /></View>
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
          <Icon name="qrcode-scan" size={24} className="text-foreground" />
        </View>
        <View className="relative" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <View className="text-foreground"><Icon name="bag" size={24} /></View>
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white text-xs">{cartCount > 99 ? '99' : cartCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 食品配料安全识别入口 */}
      <View
        className="mx-4 mt-3 rounded-2xl border border-black/5 px-4 py-3 flex flex-row items-center justify-between"
        style={{ background: '#fff' }}
        onClick={() => Taro.navigateTo({ url: '/pages/food-scan/index' })}
      >
        <View className="flex flex-row items-center" style={{ gap: 8 }}>
          <Text style={{ fontSize: 18 }}>🍱</Text>
          <Text className="text-sm font-semibold text-foreground">食品配料安全</Text>
          <Text className="text-xs text-muted-foreground">拍照/输入即时识别添加剂</Text>
        </View>
        <Text className="text-xs text-primary">去识别 ›</Text>
      </View>

      {/* 当前自营门店：按定位自动切换，可手动切换 */}
      <View className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #F0E9DF', background: '#FFF8F0' }}>
        <View className="flex items-center gap-2 min-w-0">
          <Icon name="store" size={18} className="text-primary" />
          <View className="min-w-0">
            <Text className="text-base font-bold text-foreground block truncate">
              {currentStore ? currentStore.store_name : '定位中…'}
            </Text>
            <Text className="text-xs text-muted-foreground block truncate">
              {currentStore ? `距您 ${currentStore.distance_km}km${currentStore.is_open === false ? ' · 休息中' : ''}` : '正在为您匹配最近自营门店'}
            </Text>
          </View>
        </View>
        <View className="flex items-center gap-2 shrink-0">
          <View className="px-3 py-1 rounded-full" style={{ backgroundColor: '#FDEFE0' }}
            onClick={() => setPickerOpen(true)}>
            <Text className="text-sm text-primary font-semibold">切换</Text>
          </View>
          <View className="px-3 py-1 rounded-full bg-muted"
            onClick={() => followLocation()}>
            <Text className="text-sm text-muted-foreground">跟随定位</Text>
          </View>
        </View>
      </View>

      {/* 主体：左分类 + 右商品（全部为自营门店商品） */}
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
              <View className="flex flex-wrap justify-between">
                {emotionProducts.slice(0, 4).map((p: any) => (
                  <ProductGridCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    price={p.price}
                    imageRatio="4:3"
                    imageSlot={<EmotionProductImage src={p.main_image || p.image_url} name={p.name} />}
                    moodTags={p.mood_tags}
                    care={getProductCareInfo(p)}
                    onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                    onAddCart={() => handleAddCartEmotion(p)}
                    adding={addingEmotionId === p.id} />
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
                      const data = await getProducts({ moodTag: item.tag, platformFilter: 'only', limit: 20, ...(currentStore?.id ? { storeId: currentStore.id } : {}) })
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
                        care: getProductCareInfo(p)})))
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
                  <View className="bg-muted w-full" style={{ paddingTop: '75%' }} />
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
                  imageRatio="4:3"
                  imageSlot={<ExploreProductImage src={p.product_image_url} name={p.product_name} />}
                  moodTags={p.product_mood_tags}
                  care={p.care}
                  subtitle={generateEmotionDescription({ name: p.product_name }, p.product_mood_tags || [])}
                  footerExtra={p.distance_km > 0 ? <View className="text-xs text-primary flex items-center gap-1"><Icon name="location" size={12} className="text-primary" /><Text>{p.distance_km}km</Text></View> : null}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}
                  onAddCart={() => handleAddCart(p)}
                  adding={addingId === p.product_id} />
              ))}
            </View>
          )}
          {hasMore.current && products.length > 0 && (
            <View className="flex justify-center pt-4 pb-2">
              <Button type="default" className="px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={handleLoadMore}>
                {loading ? '加载中...' : '加载更多'}
              </Button>
            </View>
          )}
        </View>
      </View>

      {/* 门店切换弹层 */}
      {pickerOpen && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
          onClick={() => setPickerOpen(false)}>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '70vh' }}
            onClick={(e: any) => e.stopPropagation()}>
            <Text className="text-lg font-bold text-foreground" style={{ display: 'block', marginBottom: 12 }}>选择自营门店</Text>
            <ScrollView scrollY style={{ maxHeight: '60vh' }}>
              {nearbyStores.length === 0 && (
                <Text className="text-sm text-muted-foreground">附近暂无自营门店</Text>
              )}
              {nearbyStores.map((s) => (
                <View key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 8px', borderRadius: 12, marginBottom: 8,
                    backgroundColor: currentStore?.id === s.id ? '#FDEFE0' : '#F5F5F5',
                  }}
                  onClick={() => {
                    setStore(s)
                    setPickerOpen(false)
                    Taro.showToast({ title: `已切换到${s.store_name}`, icon: 'none' })
                  }}>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text className="text-base font-semibold text-foreground" style={{ display: 'block' }}>{s.store_name}</Text>
                    <Text className="text-xs text-muted-foreground" style={{ display: 'block' }}>{s.address}</Text>
                  </View>
                  <Text className="text-sm text-primary" style={{ marginLeft: 8 }}>{s.distance_km}km</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <CustomTabBar />
    </View>
  )
}
