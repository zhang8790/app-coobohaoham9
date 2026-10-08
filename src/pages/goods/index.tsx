// @title 好物（自营）
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
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import type { NearbyProduct } from '@/db/api'
import type { Product, StoreCategory } from '@/db/types'
// 场景展示名单例：与首页金刚区同一套名字（DB 里的旧名/变体名在此归一）
import { sceneLabel } from '@/utils/scene-alias'
// 食疗筛选：复用共享词表的功效标签，保证与详情页/卡片口径一致
import { HEALTH_TAGS } from '@/lib/food-engine/wordTables'

// 好物页商品 = 基础商品信息 + 原始 Product（透传给食养引擎，保证关怀层/适合我与首页口径一致）
type GoodsProduct = NearbyProduct & { raw?: Product }

// 商品类目读 store_categories(scope='global', is_active=true)：后台可编辑/上下架。
// 两级结构：parent_id 为空 = 一级场景（左栏）；非空 = 二级子类（右栏顶部 Tab）。

// 商品图：填满卡片自身的比例框（4:3 由 ProductGridCard 统一控制）。
// 这里不要再套一层 paddingTop 比例框：会与卡片比例框叠加，导致图片被二次裁切成正方形，白占高度。
function GoodsProductImage({ src, name }: { src: string | null | undefined; name: string }) {
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

export default function GoodsPage() {
  const { currentStore, currentCity } = useLocation()
  const { getSuitability } = useFoodTherapy()
  // 左栏一级场景（activeTopId='all' = 全部）＋ 右栏顶部二级子类（activeSubId='' = 该场景全部）
  const [activeTopId, setActiveTopId] = useState<string>('all')
  const [activeSubId, setActiveSubId] = useState<string>('')
  // 食疗筛选（客户端，基于已算好的 therapyMap，不重新请求）：性味(温/平/凉) + 功效标签
  const [natureFilter, setNatureFilter] = useState<'' | '温' | '平' | '凉'>('')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [topCats, setTopCats] = useState<StoreCategory[]>([]) // 一级场景（已过滤上架+全局）
  const [subsByParent, setSubsByParent] = useState<Record<string, StoreCategory[]>>({}) // 一级 id → 二级子类
  const [products, setProducts] = useState<GoodsProduct[]>([])
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  // 取数时读 ref：分类树不能进 loadProducts 的 deps，否则每次分类更新都会重建回调、触发重复拉取
  const treeRef = useRef<{ subs: Record<string, StoreCategory[]> }>({ subs: {} })

  useEffect(() => {
    getFoodIngredients().then(setIngredientDict).catch(() => {})
  }, [])

  // 当前一级场景的二级子类（无子类时右栏 Tab 整块隐藏，行为与升级前一致）
  const subCats = useMemo(
    () => (activeTopId === 'all' ? [] : (subsByParent[activeTopId] || [])),
    [activeTopId, subsByParent],
  )

  // 与首页同源的食养关怀层抽取（包 try/catch 兜底，单品异常不影响整列表）
  const safeCare = (p?: Product): ReturnType<typeof getProductCareInfo> | null => {
    try { return p ? getProductCareInfo(p) : null } catch { return null }
  }

  // 食疗引擎报告映射（与详情页/门店卡/首页同源）：好物页商品池一次性算好，卡片直接取用
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

  // 性味 → 粗分桶（温/平/凉），与卡片三色预警同源（NATURE_COLOR）
  const NATURE_BUCKET: Record<string, '温' | '平' | '凉'> = {
    '大热': '温', '温热': '温', '微温': '温',
    '平性': '平',
    '寒凉': '凉', '大寒': '凉',
  }
  const natureBucketOf = (code?: string | null): '' | '温' | '平' | '凉' =>
    code ? (NATURE_BUCKET[code] ?? '') : ''

  // 食疗筛选结果：在当前已加载商品池内，按性味桶 + 功效标签做客户端过滤
  const displayed = useMemo(() => {
    if (!natureFilter && !tagFilter) return products
    return products.filter((p) => {
      const r = therapyMap[p.product_id] ?? null
      if (natureFilter && natureBucketOf(r?.overall_nature_code) !== natureFilter) return false
      if (tagFilter && !((p.raw?.health_tag as string[] | undefined) ?? []).includes(tagFilter)) return false
      return true
    })
  }, [products, therapyMap, natureFilter, tagFilter])

  // 食疗筛选候选功效标签（取共享词表前 6 项，覆盖最常见食养诉求）
  const TAG_FILTERS = HEALTH_TAGS.slice(0, 6)
  const NATURE_FILTERS: Array<'' | '温' | '平' | '凉'> = ['', '温', '平', '凉']

  const [addingId, setAddingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const page = useRef(0)
  const hasMore = useRef(true)
  // 防重入：首屏 useEffect + currentStore 切换可能并发触发同一 reset 拉取
  // 关键：用 generation 计数器替代 boolean 锁，确保 currentStore 变化驱动的 reload 不会被上一次 mount 请求阻塞
  const inflightRef = useRef<Promise<void> | null>(null)
  const loadGeneration = useRef(0)

  /**
   * 拉商品。分类过滤统一走「类目 id 集合」（不再按 name 反查：改名/同名类目都不受影响）：
   *   选中二级 → 只查该子类
   *   选中一级 → 一级自身 + 其全部二级子类（兼容历史只挂一级的商品）
   *   未选一级（全部）→ 不加分类条件
   */
  const loadProducts = useCallback(async (topId: string, subId: string, reset = true) => {
    if (loading && !reset) return
    // 修复：currentStore 切换驱动的 reload 必须穿透，不能被 mount 请求的 inflightRef 阻塞
    // 用 generation 计数器区分"同一次请求复用" vs "新门店驱动的新请求"
    const gen = ++loadGeneration.current
    const exec = async () => {
      const p = reset ? 0 : page.current
      setLoading(true)
      try {
        let catIds: string[] | undefined
        if (subId) catIds = [subId]
        else if (topId !== 'all') catIds = [topId, ...((treeRef.current.subs[topId] || []).map(s => s.id))]
        const catParam = catIds ? { categoryIds: catIds } : {}
        // 默认只显示【当前自营门店】商品；未选定门店时降级为城市聚合/附近全部自营
        const mapToNearby = (p: any): GoodsProduct => ({
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
          const data = await getProducts({ storeId: currentStore.id, page: p, limit: 20, ...catParam })
          const mapped = data.map(mapToNearby)
          if (gen !== loadGeneration.current) return // 旧请求被新请求超越，丢弃结果
          if (reset) { setProducts(mapped); page.current = 1 }
          else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
          hasMore.current = data.length === 20
        } else if (currentCity?.id) {
          // 城市聚合：市内门店商品 + 全国通用（city_id=null），真正城市维度
          const data = await getProducts({ cityId: String(currentCity.id), page: p, limit: 20, ...catParam })
          const mapped = data.map(mapToNearby)
          if (gen !== loadGeneration.current) return
          if (reset) { setProducts(mapped); page.current = 1 }
          else { setProducts(prev => [...prev, ...mapped]); page.current = p + 1 }
          hasMore.current = data.length === 20
        } else {
          // 降级：未定位未选店 → 时间排序全部自营
          const data = await getProducts({ page: p, limit: 20, platformFilter: 'only', ...catParam })
          const mapped = data.map(mapToNearby)
          if (gen !== loadGeneration.current) return
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

  // 加载类目：后台全局类目 + 仅上架。一次取两级，前端本地建树（避免二级 Tab 每次点选都发请求）
  const loadCategories = useCallback(async () => {
    const cats = await getCategories({ includeGlobal: true, isActive: true })
    const globals = cats
      .filter(c => c.scope === 'global')
      .sort((a, b) => a.sort_order - b.sort_order)
    const subs: Record<string, StoreCategory[]> = {}
    globals.forEach(c => {
      if (!c.parent_id) return
      if (!subs[c.parent_id]) subs[c.parent_id] = []
      subs[c.parent_id].push(c)
    })
    treeRef.current.subs = subs
    setSubsByParent(subs)
    setTopCats(globals.filter(c => !c.parent_id))
  }, [])

  useEffect(() => {
    loadProducts('all', '', true)
    loadCategories()
    refreshCart()
  }, [refreshCart, loadCategories])

  useDidShow(() => { refreshCart() })

  // 分享配置：携带推广码
  useShareWithReferral({
    title: '来店有喜 · 全城好物',
    path: '/pages/goods/index',
    timelineTitle: '来店有喜 · 发现品质好物' })

  // 选一级场景：重置二级（避免「上一场景的二级」串到新场景）
  const handleTopSelect = (topId: string) => {
    if (topId === activeTopId && !activeSubId) return
    setActiveTopId(topId)
    setActiveSubId('')
    loadProducts(topId, '', true)
  }

  // 选二级子类：只换子类，一级不变
  const handleSubSelect = (subId: string) => {
    if (subId === activeSubId) return
    setActiveSubId(subId)
    loadProducts(activeTopId, subId, true)
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
    if (!loading && hasMore.current) loadProducts(activeTopId, activeSubId, false)
  }

  // 当前门店/城市切换（来自首页选择）→ 按当前分类重新加载
  useEffect(() => {
    // 门店或城市任一变化都重新拉取（城市维度优先；门店下钻次之）
    if (!currentStore?.id && !currentCity?.id) return
    page.current = 0
    loadProducts(activeTopId, activeSubId, true)
    // 仅在门店/城市变化时触发；分类切换由 handleTopSelect / handleSubSelect 负责
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

      {/* 主体：左一级场景 + 右（二级 Tab + 商品） */}
      <View className="flex flex-1 overflow-hidden">
        {/* 左侧一级场景栏：
            米白底 + 选中项白卡（与门店页同一套左栏语言），不再用「同底色描边」——
            旧写法选中态与背景几乎同色，用户看不出选中，反馈等于没有。
            必须用 ScrollView：View + overflow-y-auto 在小程序里不会滚动，8 个场景在小屏会溢出且无法触达。 */}
        <ScrollView scrollY style={{ width: '176rpx', height: '100%', flexShrink: 0, backgroundColor: 'hsl(var(--background))' }}>
          <View style={{ padding: '24rpx 8rpx 8rpx' }}>
            <Text className="cat-eyebrow">按场景挑好物</Text>
          </View>
          {[{ id: 'all', label: '全部' }, ...topCats.map(c => ({ id: c.id, label: sceneLabel(c.name) }))].map(cat => {
            const active = activeTopId === cat.id
            return (
              <View key={cat.id}
                hoverClass="none"
                onClick={() => handleTopSelect(cat.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '24rpx 8rpx',
                  backgroundColor: active ? '#FFF' : 'transparent',
                  borderLeftWidth: '6rpx',
                  borderLeftColor: active ? 'hsl(var(--primary))' : 'transparent',
                }}
              >
                <Text className={`cat-name ${active ? 'cat-name-active' : ''}`}>{cat.label}</Text>
              </View>
            )
          })}
        </ScrollView>

        {/* 右侧：二级分类 Tab（固定）+ 商品滚动区 */}
        <View className="flex-1 flex flex-col overflow-hidden">
          {/* 二级子类：该一级场景下有子类才渲染（数据与 admin-web 后台同源）。
              「全部」= 一级 + 全部子类商品；点具体子类 = 只看该子类。无子类时整块隐藏。 */}
          {subCats.length > 0 && (
            <ScrollView scrollX className="whitespace-nowrap" style={{ flexShrink: 0 }}>
              <View style={{ display: 'inline-flex', gap: '16rpx', padding: '20rpx 24rpx 8rpx' }}>
                {[{ id: '', label: '全部' }, ...subCats.map(s => ({ id: s.id, label: sceneLabel(s.name) }))].map(s => {
                  const on = activeSubId === s.id
                  return (
                    <View
                      key={s.id || 'all-sub'}
                      onClick={() => handleSubSelect(s.id)}
                      style={{
                        flex: '0 0 auto',
                        padding: '10rpx 28rpx',
                        borderRadius: '999rpx',
                        fontSize: '26rpx',
                        lineHeight: 1.4,
                        backgroundColor: on ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                        color: on ? '#ffffff' : 'hsl(var(--muted-foreground))',
                        borderWidth: 1,
                        borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      }}
                    >
                      {s.label}
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          )}

          {/* 食疗筛选（客户端）：性味 + 功效，与卡片三色预警/详情页同源，不重新请求 */}
          <View style={{ flexShrink: 0, padding: '8rpx 24rpx 4rpx' }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: '12rpx', marginBottom: '8rpx' }}>
              <Text style={{ fontSize: '22rpx', color: 'hsl(var(--muted-foreground))' }}>性味</Text>
              {NATURE_FILTERS.map((n) => {
                const on = natureFilter === n
                return (
                  <View key={`n-${n || 'all'}`} onClick={() => setNatureFilter(n)}
                    style={{
                      padding: '6rpx 20rpx', borderRadius: '999rpx', fontSize: '24rpx', lineHeight: 1.3,
                      backgroundColor: on ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                      color: on ? '#fff' : 'hsl(var(--muted-foreground))',
                      borderWidth: 1, borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    }}>
                    {n === '' ? '全部' : `${n}性`}
                  </View>
                )
              })}
            </View>
            <ScrollView scrollX className="whitespace-nowrap" style={{ width: '100%' }}>
              <View style={{ display: 'inline-flex', alignItems: 'center', gap: '12rpx', paddingBottom: '4rpx' }}>
                <Text style={{ fontSize: '22rpx', color: 'hsl(var(--muted-foreground))' }}>功效</Text>
                <View key="t-all" onClick={() => setTagFilter('')}
                  style={{
                    flex: '0 0 auto', padding: '6rpx 20rpx', borderRadius: '999rpx', fontSize: '24rpx', lineHeight: 1.3,
                    backgroundColor: tagFilter === '' ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                    color: tagFilter === '' ? '#fff' : 'hsl(var(--muted-foreground))',
                    borderWidth: 1, borderColor: tagFilter === '' ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  }}>
                  全部
                </View>
                {TAG_FILTERS.map((t) => {
                  const on = tagFilter === t
                  return (
                    <View key={`t-${t}`} onClick={() => setTagFilter(t)}
                      style={{
                        flex: '0 0 auto', padding: '6rpx 20rpx', borderRadius: '999rpx', fontSize: '24rpx', lineHeight: 1.3,
                        backgroundColor: on ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                        color: on ? '#fff' : 'hsl(var(--muted-foreground))',
                        borderWidth: 1, borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      }}>
                      {t}
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          {/* 商品区：ScrollView 触底自动加载下一页（替代原「加载更多」按钮） */}
          <ScrollView scrollY className="flex-1 px-3 py-3" style={{ height: '100%' }} onScrollToLower={handleLoadMore}>
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
            ) : products.length === 0 ? (
              <View className="flex flex-col items-center justify-center" style={{ paddingTop: '160rpx' }}>
                <Icon name="bag" size={48} style={{ color: 'hsl(var(--muted-foreground))', opacity: 0.4 }} />
                <Text className="text-base text-foreground" style={{ marginTop: '16rpx' }}>这一类暂时没有好物</Text>
                <Text className="text-sm text-muted-foreground" style={{ marginTop: '8rpx' }}>换个场景看看，或切换城市 / 门店</Text>
              </View>
            ) : displayed.length === 0 ? (
              <View className="flex flex-col items-center justify-center" style={{ paddingTop: '160rpx' }}>
                <Icon name="bag" size={48} style={{ color: 'hsl(var(--muted-foreground))', opacity: 0.4 }} />
                <Text className="text-base text-foreground" style={{ marginTop: '16rpx' }}>没有符合筛选的好物</Text>
                <Text className="text-sm text-muted-foreground" style={{ marginTop: '8rpx' }}>试试放宽「性味 / 功效」筛选条件</Text>
              </View>
            ) : (
              <View className="flex flex-wrap justify-between">
                {displayed.map(p => (
                  <ProductGridCard
                    key={p.product_id}
                    id={p.product_id}
                    name={p.product_name}
                    price={p.product_price}
                    spec={p.raw?.spec}
                    imageRatio="4:3"
                    imageSlot={<GoodsProductImage src={p.product_image_url} name={p.product_name} />}
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
      </View>

      <FloatingActionBar />
      <CustomTabBar />
    </View>
  )
}
