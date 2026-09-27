// @title 自营
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { addToCart, getProducts, getCategories } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import Icon from '@/components/Icon'
import { refreshCartCount } from '@/utils/cartStore'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { useLocation } from '@/contexts/LocationContext'
import LazyImage from '@/components/LazyImage'
import ProductGridCard from '@/components/ProductGridCard'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import { getProductCareInfo } from '@/utils/product-care'
import { buildTherapyReport, isFoodProduct, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { FOOD_REFERENCE_DISCLAIMER, shieldCopy } from '@/utils/compliance/shield'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import type { NearbyProduct } from '@/db/api'
import type { Product, StoreCategory } from '@/db/types'

// 自营页商品 = 基础商品信息 + 原始 Product（透传给食养引擎，保证关怀层/适合我与首页口径一致）
type ExploreProduct = NearbyProduct & { raw?: Product }

// 探索(自营)商品类目：改为读 store_categories(scope='global', is_active=true)，后台可编辑/上架下架
// 点选后按类目名精确匹配 products.category 文本（见 getProducts 的 categoryName 参数）

// 探索页商品图：填满卡片自身的比例框（4:3 / 1:1 由 ProductGridCard 统一控制）。
// 这里不要再套一层 paddingTop 比例框：会与卡片比例框叠加，导致图片被二次裁切成正方形，白占高度。
function ExploreProductImage({ src, name }: { src: string | null | undefined; name: string }) {
 if (!src) {
 return (
 <View className="w-full h-full flex flex-col items-center justify-center" style={{ backgroundColor: 'hsl(var(--muted))' }}>
 <Icon name="bag" size={28} className="text-muted-foreground" />
 <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
 </View>
 )
 }
 return (
 <View className="w-full h-full">
 <LazyImage
 src={src}
 mode="aspectFill"
 className="w-full h-full bg-muted"
 width="100%"
 height="100%" />
 </View>
 )
}

// 探索页商品卡复用 ProductGridCard；当前仅自营门店商品
export default function ExplorePage() {
 const { currentStore, currentCity } = useLocation()
 const { getSuitability } = useFoodTherapy()
 const [activeCat, setActiveCat] = useState('全部')
 const [categories, setCategories] = useState<StoreCategory[]>([]) // 动态类目（已过滤上架+全局）
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
 // 类型闸门：非食养商品不参与食疗计算（工艺品/日用品不应出现「适合人群 / 食性」）
 if (!isFoodProduct(raw)) { map[p.product_id] = null; return }
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
 const [addingId, setAddingId] = useState<string | null>(null)
 const [loading, setLoading] = useState(false)
 const page = useRef(0)
 const hasMore = useRef(true)
 // 防重入：首屏 useEffect + currentStore 切换可能并发触发同一 reset 拉取
 // 关键修复：用 generation 计数器替代 boolean 锁，确保 currentStore 变化驱动的reload不会被上一次mount请求阻塞
 const inflightRef = useRef<Promise<void> | null>(null)
 const loadGeneration = useRef(0)

 const loadProducts = useCallback(async (cat: string, reset = true) => {
 if (loading && !reset) return
 // 修复：currentStore 切换驱动的 reload 必须穿透，不能被 mount 请求的 inflightRef 阻塞
 // 用 generation 计数器区分"同一次请求复用" vs "新门店驱动的新请求"
 const gen = ++loadGeneration.current
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
 raw: p, // 透传原始 Product，供食养引擎算关怀层/适合我
 })

 if (currentStore?.id) {
 // 已选定当前门店：仅该门店商品（按时间倒序）
 const data = await getProducts({
 storeId: currentStore.id,
 page: p, limit: 20,
 ...(catParam ? { categoryName: catParam } : {}),


 })
 const mapped = data.map(mapToNearby)
 if (gen !== loadGeneration.current) return // 旧请求被新请求超越，丢弃结果
 if (reset) { setProducts(mapped); page.current = 1 }
 else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
 hasMore.current = data.length === 20
 } else if (currentCity?.id) {
 // 城市聚合（Phase 3）：市内门店商品 + 全国通用（city_id=null），真正城市维度
 const data = await getProducts({
 cityId: String(currentCity.id),
 page: p, limit: 20,
 ...(catParam ? { categoryName: catParam } : {}),


 })
 const mapped = data.map(mapToNearby)
 if (gen !== loadGeneration.current) return // 旧请求被新请求超越，丢弃结果
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
 if (gen !== loadGeneration.current) return // 旧请求被超越，丢弃
 if (reset) { setProducts(mapped); page.current = 1 }
 else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
 hasMore.current = data.length === 20
 }
 } finally {
 if (gen === loadGeneration.current) {
 setLoading(false)
 if (reset) inflightRef.current = null
 }
 }
 }

 if (reset) {
 inflightRef.current = exec()
 return inflightRef.current
 }
 return exec()
 }, [loading, currentStore, currentCity])

 const refreshCart = useCallback(async () => {
 await refreshCartCount()
 }, [])

 // 加载商品（城市信息从 LocationContext 获取）
 // 加载自营页类目：后台全局类目 + 仅上架
 const loadCategories = useCallback(async () => {
 const cats = await getCategories({ includeGlobal: true, isActive: true })
 // 左栏只列一级场景（parent_id 为空）；二级分类在类目落地页顶部以 Tab 呈现
 setCategories(cats.filter(c => c.scope === 'global' && !c.parent_id).sort((a, b) => a.sort_order - b.sort_order))
 }, [])

 useEffect(() => {
 loadProducts('全部')
 loadCategories()
 refreshCart()
 }, [refreshCart, loadCategories])

 useDidShow(() => { refreshCart() })

 // 分享配置：携带推广码
 useShareWithReferral({
 title: '来店有喜 · 全城好物',
 path: '/pages/explore/index',
 timelineTitle: '来店有喜 · 发现品质好物'})

 const handleCatSelect = (cat: string) => {
 setActiveCat(cat)
 loadProducts(cat, true)
 }

 const handleAddCart = async (product: NearbyProduct) => {
 const { supabase, getLocalUser } = await import('@/client/supabase')
 const uid = (await getLocalUser()).data.user
 if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
 setAddingId(product.product_id)
 await addToCart(product.product_id, product.store_id)
 setAddingId(null)
 showCartToast()
 }

  // 翻页加载：由右栏 ScrollView 触底触发（onScrollToLower），不再提供「加载更多」按钮
  const handleLoadMore = () => {
    if (!loading && hasMore.current) loadProducts(activeCat, false)
  }

 // 当前门店切换（来自首页选择）→ 重新加载该门店商品
 useEffect(() => {
 // 门店或城市任一变化都重新拉取（城市维度优先；门店下钻次之）
 if (!currentStore?.id && !currentCity?.id) return
 page.current = 0
 loadProducts(activeCat, true)
 // 仅在门店/城市变化时触发；分类切换由 handleCatSelect 负责
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [currentStore?.id, currentCity?.id])

 return (
 <View className="h-screen flex flex-col bg-background tabbar-pad">
 {/* 顶部搜索栏 */}
 <View className="ex-search-bar flex items-center gap-3 px-4 py-3">
 <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
 onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
 <View className="text-muted-foreground"><Icon name="search" size={20} /></View>
 <Text className="text-sm text-muted-foreground">搜索好物</Text>
 </View>
 </View>

 {/* 合规免责：场景/人群分类仅为食养参考，不替代医师诊疗建议 */}
 <View className="px-4 py-2 bg-muted">
 <Text className="text-xs text-muted-foreground leading-relaxed">{FOOD_REFERENCE_DISCLAIMER}</Text>
 </View>

 {/* 主体：左分类 + 右商品（全部为自营门店商品） */}
 <View className="flex flex-1 overflow-hidden">
 {/* 左侧分类：全部 + 后台动态类目（下架的已被 is_active 过滤不显示）
 字体走全局 .cat-name（与首页金刚区同一套字号/字重，单一事实源）；
 选中态用内联样式实现——本页 index.scss 历史遗留未被 import，原 .ex-cat-active 是死样式，
 曾导致「左栏点了没有任何选中反馈」。 */}
 <View className="w-24 flex flex-col bg-card overflow-y-auto">
 <View className="px-2 pt-3 pb-1">
 <Text className="cat-eyebrow">按场景挑好物</Text>
 </View>
 {[{ id: '__all__', name: '全部', label: '全部' }, ...categories.map(c => ({ id: c.id, name: c.name, label: shieldCopy(c.name).safe }))].map(cat => {
 const active = activeCat === cat.name
 return (
 <View key={cat.id}
 hoverClass="none"
 onClick={() => handleCatSelect(cat.name)}
 className="flex items-center justify-center"
 style={{
 padding: '16px 6px',
 background: active ? 'hsl(var(--background))' : 'transparent',
 borderLeft: active ? '3px solid hsl(var(--primary))' : '3px solid transparent',
 }}
 >
 <Text className={`cat-name ${active ? 'cat-name-active' : ''}`}>{cat.label}</Text>
 </View>
 )
 })}
 </View>

 {/* 右侧内容：ScrollView 触底自动加载下一页（替代原「加载更多」按钮） */}
 {/* 注意：高度必须内联——本页 index.scss 未被任何地方 import（历史遗留），类样式不会生效 */}
 <ScrollView scrollY className="flex-1 px-3 py-3" style={{ height: '100%' }} onScrollToLower={handleLoadMore}>
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
 spec={p.raw?.spec}
 imageRatio="4:3"
 imageSlot={<ExploreProductImage src={p.product_image_url} name={p.product_name} />}
 care={safeCare(p.raw)}
 suitability={getSuitability(p.raw as Product)}
 therapyReport={therapyMap[p.product_id] ?? null}
 footerExtra={null}
 onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.product_id}` })}
 onAddCart={() => handleAddCart(p as NearbyProduct)}
 adding={addingId === p.product_id} />
 ))}
 </View>
 )}
 {loading && products.length > 0 && (
 <View className="flex justify-center pt-4 pb-2">
 <Text className="text-sm text-muted-foreground">加载中…</Text>
 </View>
 )}
 </ScrollView>
 </View>

 <FloatingActionBar />
 <CustomTabBar />
 </View>
 )
}
