// @title 自营
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { addToCart, getProducts, getCategories } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import Icon from '@/components/Icon'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { useLocation } from '@/contexts/LocationContext'
import { scanAndRoute } from '@/utils/scan'
import LazyImage from '@/components/LazyImage'
import ProductGridCard from '@/components/ProductGridCard'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import { getProductCareInfo } from '@/utils/product-care'
import { buildTherapyReport, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import type { NearbyProduct } from '@/db/api'
import type { Product, StoreCategory } from '@/db/types'

// 自营页商品 = 基础商品信息 + 原始 Product（透传给食养引擎，保证关怀层/适合我与首页口径一致）
type ExploreProduct = NearbyProduct & { raw?: Product }

// 探索(自营)商品类目：改为读 store_categories(scope='global', is_active=true)，后台可编辑/上架下架
// 点选后按类目名精确匹配 products.category 文本（见 getProducts 的 categoryName 参数）

// 探索页商品图：全宽 16:10 + 缺失占位
function ExploreProductImage({ src, name }: { src: string | null | undefined; name: string }) {
  if (!src) {
    return (
      <View className="relative w-full overflow-hidden" style={{ paddingTop: '100%', backgroundColor: 'hsl(var(--muted))' }}>
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

// 探索页商品卡复用 ProductGridCard；当前仅自营门店商品
export default function ExplorePage() {
  const { currentStore } = useLocation()
  const { getSuitability } = useFoodTherapy()
  const [activeCat, setActiveCat] = useState('全部')
  const [categories, setCategories] = useState<StoreCategory[]>([])  // 动态类目（已过滤上架+全局）
  const [products, setProducts] = useState<ExploreProduct[]>([])
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  useEffect(() => {
    getFoodIngredients().then(setIngredientDict).catch(() => {})
  }, [])
  // 与首页同源的食养关怀层抽取（包 try/catch 兜底，单品异常不影响整列表）
  const safeCare = (p?: Product): ReturnType<typeof getProductCareInfo> | null => {
    try { return p ? getProductCareInfo(p) : null } catch { return null }
  }
  // 食疗引擎报告映射（与详情页/门店卡/首页同源）：自营页商品池一次性算好，卡片直接取用
  const therapyMap = useMemo<Record<string, ProductTherapyReport | null>>(() => {
    const map: Record<string, ProductTherapyReport | null> = {}
    const dictMap = new Map(ingredientDict.map((d) => [d.name, d]))
    products.forEach((p) => {
      const raw = p.raw as Product | undefined
      if (!raw || !raw.ingredients || (raw.ingredients as string[]).length === 0) { map[p.product_id] = null; return }
      const inputs: ProductIngredientInput[] = (raw.ingredients as string[]).map((name) => {
        const row = dictMap.get(name)
        if (!row) return null
        const fi: FoodIngredient = {
          name: row.name, nature: row.nature, base_effect: row.base_effect ?? null,
          fit_scenes: row.fit_scenes ?? null, caution_crowds: row.caution_crowds ?? null,
          allergens: row.allergens ?? null, chronic_tags: row.chronic_tags ?? null, neutralize: row.neutralize ?? null,
        }
        return { ingredient: fi }
      }).filter(Boolean) as ProductIngredientInput[]
      map[p.product_id] = buildTherapyReport(raw.name, inputs)
    })
    return map
  }, [products, ingredientDict])
  const cartCount = useCartCount()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const page = useRef(0)
  const hasMore = useRef(true)
  // 防重入：首屏 useEffect + currentStore 切换可能并发触发同一 reset 拉取
  const inflightRef = useRef<Promise<void> | null>(null)

  const loadProducts = useCallback(async (cat: string, reset = true) => {
    if (loading && !reset) return
    // reset 拉取并发去重：已有同类型请求在飞则复用，避免双拉覆盖闪烁
    if (reset && inflightRef.current) return inflightRef.current
    const exec = async () => {
      const p = reset ? 0 : page.current
      setLoading(true)
      try {
        // 默认只显示【当前自营门店】商品；未选定门店时降级为附近/全部自营聚合
        const catParam = cat !== '全部' ? cat : undefined
          const mapToNearby = (p: any): ExploreProduct => ({
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
            raw: p,  // 透传原始 Product，供食养引擎算关怀层/适合我
          })

        if (currentStore?.id) {
          // ✅ 已选定当前门店：仅该门店商品（按时间倒序）
          const data = await getProducts({
            storeId: currentStore.id,
            platformFilter: 'only',
            page: p, limit: 20,
            ...(catParam ? { categoryName: catParam } : {}),
          })
          const mapped = data.map(mapToNearby)
          if (reset) { setProducts(mapped); page.current = 1 }
          else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
          hasMore.current = data.length === 20
        } else {
          // 降级：未定位未选店 → 时间排序全部自营
          const data = await getProducts({
            page: p, limit: 20,
            platformFilter: 'only',
            ...(catParam ? { categoryName: catParam } : {}),
          })
          const mapped = data.map(mapToNearby)
          if (reset) { setProducts(mapped); page.current = 1 }
          else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
          hasMore.current = data.length === 20
        }
      } finally {
        setLoading(false)
        if (reset) inflightRef.current = null
      }
    }

    if (reset) {
      inflightRef.current = exec()
      return inflightRef.current
    }
    return exec()
  }, [loading, currentStore])

  const refreshCart = useCallback(async () => {
    await refreshCartCount()
  }, [])

  // 加载商品（城市信息从 LocationContext 获取）
  // 加载自营页类目：后台全局类目 + 仅上架
  const loadCategories = useCallback(async () => {
    const cats = await getCategories({ includeGlobal: true, isActive: true })
    setCategories(cats.filter(c => c.scope === 'global').sort((a, b) => a.sort_order - b.sort_order))
  }, [])

  useEffect(() => {
    loadProducts('全部')
    loadCategories()
    refreshCart()
  }, [refreshCart, loadCategories])

  useDidShow(() => { refreshCart() })

  // 分享配置：携带推广码
  useShareWithReferral({
    title: '来电有喜 · 自营好物',
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
    showCartToast()
  }

  const handleLoadMore = () => {
    if (!loading && hasMore.current) loadProducts(activeCat, false)
  }

  // 当前门店切换（来自首页选择）→ 重新加载该门店商品
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
      <View className="ex-search-bar flex items-center gap-3 px-4 py-3">
        <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <View className="text-muted-foreground"><Icon name="search" size={20} /></View>
          <Text className="text-xl text-muted-foreground">搜索商品...</Text>
        </View>
        <View className="w-10 h-10 flex items-center justify-center"
          onClick={() => scanAndRoute()} >
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

      {/* 主体：左分类 + 右商品（全部为自营门店商品） */}
      <View className="flex flex-1 overflow-hidden">
        {/* 左侧分类：全部 + 后台动态类目（下架的已被 is_active 过滤不显示） */}
        <View className="w-24 flex flex-col bg-muted overflow-y-auto">
          <View key="全部"
            className={`ex-cat py-4 flex items-center justify-center text-xl font-bold ${activeCat === '全部' ? 'ex-cat-active' : 'text-foreground'}`}
            onClick={() => handleCatSelect('全部')}>
            全部
          </View>
          {categories.map(cat => (
            <View key={cat.id}
              className={`ex-cat py-4 flex items-center justify-center text-xl font-bold ${activeCat === cat.name ? 'ex-cat-active' : 'text-foreground'}`}
              onClick={() => handleCatSelect(cat.name)}>
              {cat.name}
            </View>
          ))}
        </View>

        {/* 右侧内容 */}
        <View className="flex-1 overflow-y-auto px-3 py-3">
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
                  care={safeCare(p.raw)}
                  suitability={getSuitability(p.raw as Product)}
                  therapyReport={therapyMap[p.product_id] ?? null}
                  footerExtra={null}
                  sales={p.raw?.sales_count}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}
                  onAddCart={() => handleAddCart(p as NearbyProduct)}
                  adding={addingId === p.product_id} />
              ))}
            </View>
          )}
          {hasMore.current && products.length > 0 && (
            <View className="flex justify-center pt-4 pb-2">
              <Button type="default" className="ex-loadmore px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={handleLoadMore}>
                {loading ? '加载中...' : '加载更多'}
              </Button>
            </View>
          )}
        </View>
      </View>

      <FloatingActionBar />
      <CustomTabBar />
    </View>
  )
}
