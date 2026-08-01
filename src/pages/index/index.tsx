// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline, useRouter } from '@tarojs/taro'
import { Image, Input, View, Text, ScrollView, Button } from '@tarojs/components'
import { getProducts, getAnnouncements, getOrderFeed, getOrders, getProductsByIds, addToCart } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import { getUserHealthProfile } from '@/db/food-api'
import type { Product, Announcement, OrderFeedItem, UserHealthProfile } from '@/db/types'
import StoreStrip from '@/components/StoreStrip'
import { type ScoredProduct } from '@/utils/emotionEngine'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { parseCrowdsFromText, classifyProduct as classifyOne, toFoodTherapyInput, QUICK_BODY_PRESETS, profileToCrowds, FOOD_CATEGORIES, type Crowd, type FitTier } from '@/utils/food-therapy'
import { buildTherapyReport, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { getTodayFoodTherapy, resolveConstitution, type TodayFoodTherapyResult } from '@/utils/today-food-therapy'
import { analyzeConsumption, recommendByConsumption, type ConsumptionProfile } from '@/utils/consumption-profile'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import Icon from '@/components/Icon'
import ProductGridCard from '@/components/ProductGridCard'
import AddToCartButton from '@/components/AddToCartButton'
import { getProductCareInfo } from '@/utils/product-care'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import { getCurrentTerm } from '@/utils/seasonal-box'

// 纯函数：把商品列表按"身体人群"分三档（直接吃 Product，零网络）
function classifyProductList(products: Product[], crowds: Crowd[]) {
  const res: { recommend: Product[]; caution: Product[]; avoid: Product[] } = { recommend: [], caution: [], avoid: [] }
  for (const p of products) {
    const tier = classifyOne(toFoodTherapyInput(p), crowds, null)
    if (tier === 'recommend') res.recommend.push(p)
    else if (tier === 'caution') res.caution.push(p)
    else if (tier === 'avoid') res.avoid.push(p)
  }
  return res
}

// 组合"识别到的身体人群"作为即时匹配标题（情绪不再参与）
function buildMatchLabel(crowds: Crowd[]): string {
  return crowds.join(' · ') || '好物'
}

// ============ 首页本地缓存：打开即渲染缓存内容，后台静默刷新 ============
// 根治「反应速度慢 / 缓存慢」：原每次切回首页都重新拉全量 Feed + 50 笔订单，
// 现改为先用 storage 缓存秒出，再后台刷新，用户感知不到网络等待。
const FEED_CACHE_KEY = 'home_feed_cache_v1'
const FEED_CACHE_TTL = 5 * 60 * 1000
const CONSUME_CACHE_KEY = 'home_consume_cache_v1'
const CONSUME_CACHE_TTL = 10 * 60 * 1000

function readFeedCache(): ScoredProduct<Product>[] | null {
  try {
    const raw = Taro.getStorageSync(FEED_CACHE_KEY) as { t: number; items: ScoredProduct<Product>[] } | null
    if (!raw?.items?.length) return null
    if (Date.now() - raw.t > FEED_CACHE_TTL) return null
    return raw.items
  } catch { return null }
}
function writeFeedCache(items: ScoredProduct<Product>[]) {
  try { Taro.setStorageSync(FEED_CACHE_KEY, { t: Date.now(), items }) } catch { /* ignore */ }
}
function readConsumeCache(uid: string): { profile: ConsumptionProfile; boughtIds: string[] } | null {
  try {
    const raw = Taro.getStorageSync(CONSUME_CACHE_KEY) as { uid: string; t: number; profile: ConsumptionProfile; boughtIds: string[] } | null
    if (!raw || raw.uid !== uid) return null
    if (Date.now() - raw.t > CONSUME_CACHE_TTL) return null
    return raw
  } catch { return null }
}
function writeConsumeCache(uid: string, data: { profile: ConsumptionProfile; boughtIds: string[] }) {
  try { Taro.setStorageSync(CONSUME_CACHE_KEY, { uid, t: Date.now(), ...data }) } catch { /* ignore */ }
}

export default function IndexPage() {
  const { profile } = useAuth()
  const { currentCity, currentLocation, currentStore, nearbyStores, loading: locationLoading, error: locationError, detectLocation } = useLocation()
  const { selectedCrowds, toggleCrowd, clearFilters, getSuitability, hasHealthProfile } = useFoodTherapy()
  // 定位自动触发：用 ref 持有 detectLocation（函数已稳定化，不放入 effect 依赖以免触发重跑），
  // 并用 locatingRef 在首批定位完成前锁住后续触发，根治「定位一直在闪烁」的回流循环
  const detectLocationRef = useRef(detectLocation)
  detectLocationRef.current = detectLocation
  const locatingRef = useRef(false)
  const myRef = profile?.referral_code || ''
  // 记录当前要分享的商品，供 useShareAppMessage 闭包读取
  const shareProductRef = useRef<{ id: string; name: string; imageUrl: string } | null>(null)

  // 首页商品卡「加入购物车」：未登录由 addToCart 内部引导登录；加购成功内部 bumpCartCount 实时刷新角标
  const [addingId, setAddingId] = useState<string | null>(null)
  const handleAddCart = useCallback(async (productId: string, storeId?: string) => {
    if (addingId === productId) return // 防快速连点并发，避免加购竞态丢失增量（「不能叠加」根因）
    setAddingId(productId)
    try {
      const ok = await addToCart(productId, storeId || '')
      if (ok) showCartToast()
    } finally {
      setAddingId(null)
    }
  }, [addingId])

  const [mood, setMood] = useState('')
  // 首页分类金刚区：本地筛选主商品流（不影响画像/即时匹配区块）
  const [catFilter, setCatFilter] = useState<string | null>(null)
  // 「适合我」个性化筛选：仅看适合我的好物
  const [fitOnly, setFitOnly] = useState(false)
  // 状态卡「你关注的食养偏好」默认折叠，降低首屏高度
  const [showBodyStates, setShowBodyStates] = useState(false)
  // 状态卡默认收起为「一行胶囊」，点击才展开输入（去头重脚轻）
  const [inputExpanded, setInputExpanded] = useState(false)
  const [feedItems, setFeedItems] = useState<ScoredProduct<Product>[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  // 门店隔离：首页只展示「当前选中门店」的商品；默认=定位到的最近门店，可切换附近门店
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  // 用户是否手动选过门店：一旦手动选过，定位异步完成 / 切回首页自动定位都不应再覆盖选择
  const manualStoreRef = useRef(false)
  const [orderFeed, setOrderFeed] = useState<OrderFeedItem[]>([])
  const [annIdx, setAnnIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当前节气名（驱动首页「节气食盒」入口与今日食养副标题）
  const seasonalTerm = getCurrentTerm()
  const termName = seasonalTerm?.name || '当季'

  // 自然语言 → 身体状态人群：自动识别后高亮对应 chip（与手动选择并存）
  const autoCrowdsRef = useRef<Crowd[]>([])

  // 消费偏好画像：登录后回溯历史订单 → 聚合食养偏好 → 推荐相似好物
  const [consumptionProfile, setConsumptionProfile] = useState<ConsumptionProfile | null>(null)
  const [boughtIds, setBoughtIds] = useState<Set<string>>(new Set())

  // 即时匹配结果：输入身体状态词后，直接配对出的商品（零额外操作，情绪不进前台）
  const [matchItems, setMatchItems] = useState<Array<{ product: Product; tier: FitTier | null }>>([])
  const [matchAvoid, setMatchAvoid] = useState(0)
  const [matchLabel, setMatchLabel] = useState('')
  const [matchedLoading, setMatchedLoading] = useState(false)
  const hasQuery = mood.trim().length > 0

  // V1 体质档案：登录后读取，驱动首页个性化（呈现"你关注的食养偏好"，非"今日"）
  const [userProfile, setUserProfile] = useState<UserHealthProfile | null>(null)

  // 首页「限时福利」弹窗状态（仅在有可领取活动、且用户主动点击入口卡片时才展开）
  const [showCampaignPopup, setShowCampaignPopup] = useState(false)
  const [campaignList, setCampaignList] = useState<any[]>([])
  // 门店红包对应的门店名（用于在首页弹窗标注「XX店专享」）
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({})
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  useEffect(() => {
    getFoodIngredients().then(setIngredientDict).catch(() => {})
  }, [])

  // 修复：用 useRouter() 取响应式 params，原 useMemo(..., []) 冻结首屏快照，
  // 导致冷启动/首渲染时 router 尚未就绪则永久丢失 scene/ref/s 推广参数。
  // 改为响应式后，参数就绪时 useEffect([routeParams]) 会自动重跑捕获推广码。
  const routeParams = useRouter().params as any || {}
  useEffect(() => {
    // 直接 URL 参数（H5 / 普通跳转）
    const refDirect = routeParams.ref as string || ''
    const storeShortDirect = routeParams.s as string || ''

    // scene 参数（小程序码扫码进入）
    let refFromScene = ''
    let storeShortFromScene = ''
    if (routeParams.scene) {
      try {
        const scene = decodeURIComponent(routeParams.scene as string)
        const refMatch = scene.match(/ref=([A-Z0-9]{6})/i)
        const sMatch = scene.match(/[?&]?r=([A-Z0-9]{6})/i) || scene.match(/^r=([A-Z0-9]{6})/i)
        const storeMatch = scene.match(/s=([A-Z0-9]{8})/i)
        if (refMatch) refFromScene = refMatch[1].toUpperCase()
        if (sMatch) refFromScene = sMatch[1].toUpperCase()
        if (storeMatch) storeShortFromScene = storeMatch[1].toUpperCase()
      } catch { /* ignore */ }
    }

    const finalRef = (refDirect || refFromScene).toUpperCase()
    const finalStore = (storeShortDirect || storeShortFromScene).toUpperCase()

    // 保存推广码到 Storage，登录后自动绑定
    if (finalRef) Taro.setStorageSync('pendingReferralCode', finalRef)

    // 若有门店短码，查询门店 ID 并跳转
    if (finalStore) {
      import('@/client/supabase').then(({ supabase }) => {
        supabase.from('stores').select('id').eq('short_code', finalStore).maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data?.id) {
              Taro.navigateTo({ url: `/pages/store-home/index?id=${data.id}` })
            }
          })
      })
    }
  }, [routeParams])

  // 首页启动 / 切回时，始终用【当前真实 GPS】重新解析最近门店。
  // 修复（定位“几公里”偏差根因）：
  //   原逻辑 `if (currentCity && nearbyStores.length > 0) return` 一旦本地缓存过任意门店
  //   （哪怕是兜底到杭州中心、或上次在别处定位的残留），就跳过定位 —— 首页永远显示旧位置的
  //   门店与距离，人已移动/站在店门口却仍显示「几公里外」的旧门店。
  //   现改为：先秒显缓存保证不白屏，再后台用当前 GPS 刷新（detectLocation 内部有并发去重，不会重复拉）。
  useEffect(() => {
    if (locatingRef.current) return
    locatingRef.current = true
    detectLocationRef.current()
      .catch(() => {})
      .finally(() => { locatingRef.current = false })
  }, [])

  // 切回首页 tab 时同样用当前 GPS 刷新（用户可能已移动位置）
  useDidShow(() => {
    if (locatingRef.current) return
    locatingRef.current = true
    detectLocationRef.current()
      .catch(() => {})
      .finally(() => { locatingRef.current = false })
  })

  // 首页分享：若用户点击了某商品的分享按钮则分享该商品，否则分享首页（均携带推广码）
  useShareAppMessage(() => {
    const p = shareProductRef.current
    if (p) return {
      title: `${p.name} · 来电有喜好物`,
      path: `/pages/product/index?id=${encodeURIComponent(p.id)}${myRef ? `&ref=${myRef}` : ''}`,
      imageUrl: p.imageUrl || undefined,
    }
    return {
      title: '来电有喜，好物相候！',
      path: `/pages/index/index${myRef ? `?ref=${myRef}` : ''}`,
    }
  })
  useShareTimeline(() => ({ title: '来电有喜，有喜相逢' }))

  // 加载首页「好物动态」：全站实时下单脱敏聚合
  const loadOrderFeed = useCallback(async () => {
    const data = await getOrderFeed(20)
    setOrderFeed(data)
  }, [])

  // 加载公告
  const loadAnnouncements = useCallback(async () => {
    const data = await getAnnouncements()
    setAnnouncements(data)
  }, [])

  // 加载 Feed（首页推荐：定位就绪时按最近门店聚合附近多店商品；食养分档由前端 classifyProductList 处理，情绪不再参与前台）
  // 防重入：并发的 loadFeed（useEffect 挂载 + useDidShow 切回 tab）只跑一次网络请求，
  // 避免首页 Feed 双拉取导致的列表重渲染/重影（与购物车页同源修复）
  const feedInflightRef = useRef<Promise<void> | null>(null)
  const loadFeed = useCallback(async () => {
    if (feedInflightRef.current) return feedInflightRef.current
    feedInflightRef.current = (async () => {
      try {
        // ① 先用缓存秒出，避免每次打开白屏等网络（下拉刷新仍会强制走下面网络）
        const cached = readFeedCache()
        if (cached && cached.length) {
          setFeedItems(cached)
          setLoading(false)
        } else {
          setLoading(true)
        }
        let raw: Product[] = []
        // 门店隔离：只拉「当前选中门店」的商品，别的店不混进（可按距离切换附近门店）。
        // 重要：选中门店后不降级到全平台——每个门店只看自己的商品，空的就显示空状态
        const storeId = selectedStoreId
        if (storeId) {
          raw = await getProducts({ storeId, limit: 40 })
        } else {
          // 未选中任何门店时才降级到全平台自营商品（保证首页有内容）
          raw = await getProducts({ limit: 30, platformFilter: 'only' })
        }
        const next = raw.map(p => ({ product: p, matchScore: 1, matchLabel: null }))
        setFeedItems(next)
        writeFeedCache(next)
      } finally {
        setLoading(false)
        feedInflightRef.current = null
      }
    })()
    return feedInflightRef.current
  }, [currentLocation, nearbyStores, selectedStoreId])

  // 定位到最近门店 / 切城市重算后，自动把首页 feed 锁定到该门店（门店隔离默认态）
  // 守卫：用户一旦手动切换过门店，自动定位不再覆盖（否则定位异步完成会把选择弹回最近门店）
  useEffect(() => {
    if (currentStore?.id && !manualStoreRef.current) setSelectedStoreId(currentStore.id)
  }, [currentStore])

  // 下拉刷新（注：loadOrderFeed/loadAnnouncements/loadFeed 已在上文声明，避免依赖数组 TDZ）
  useEffect(() => {
    const handler = () => {
      loadFeed()
      loadAnnouncements()
      loadOrderFeed()
      Taro.stopPullDownRefresh()
    }
    // Taro 小程序下拉刷新回调
    ;(Taro as any).onPullDownRefresh = handler
    return () => { ;(Taro as any).onPullDownRefresh = null }
  }, [loadOrderFeed, loadAnnouncements])

  useEffect(() => { loadAnnouncements(); loadOrderFeed(); loadFeed() }, [loadAnnouncements, loadOrderFeed, loadFeed])
  useDidShow(() => { loadFeed() })

  // 消费偏好画像：登录后回溯历史订单 → 聚合食养偏好（health_tag 频次 / nature 众数）
  const loadConsumptionProfile = useCallback(async () => {
    if (!profile?.id) return
    try {
      // 命中缓存直接秒出，省去 50 笔订单 + 商品详情两次网络往返
      const cached = readConsumeCache(profile.id)
      if (cached) {
        setBoughtIds(new Set(cached.boughtIds))
        setConsumptionProfile(cached.profile)
        return
      }
      const orders = await getOrders(undefined, 0, 50)
      const ids: string[] = []
      for (const o of orders) {
        for (const it of (o.order_items || [])) {
          if (it.product_id) ids.push(it.product_id)
        }
      }
      const uniq = Array.from(new Set(ids))
      if (uniq.length === 0) {
        const empty = { hasData: false, boughtCount: 0, topHealthTags: [], naturePref: null }
        setConsumptionProfile(empty)
        writeConsumeCache(profile.id, { profile: empty, boughtIds: [] })
        return
      }
      const bought = await getProductsByIds(uniq)
      const prof = analyzeConsumption(bought)
      setBoughtIds(new Set(uniq))
      setConsumptionProfile(prof)
      writeConsumeCache(profile.id, { profile: prof, boughtIds: uniq })
    } catch (err) {
      console.error('[Index] 消费画像聚合失败', err)
    }
  }, [profile?.id])

  useEffect(() => {
    if (profile?.id) loadConsumptionProfile()
  }, [loadConsumptionProfile])

  // 读取用户结构化体质档案（V1）：驱动首页"你关注的食养偏好"标签 + 个性化推荐
  useEffect(() => {
    if (!profile?.id) return
    let alive = true
    getUserHealthProfile(profile.id)
      .then((p) => { if (alive && p) setUserProfile(p) })
      .catch((e: unknown) => console.error('[Index] 读取体质档案失败', e))
    return () => { alive = false }
  }, [profile?.id])

  // 由体质档案推导人群（body_states + chronic_conditions），供个性化推荐分档
  const profileCrowds = useMemo(() => (userProfile ? profileToCrowds(userProfile) : []), [userProfile])

  // 体质档案个性化推荐：无手动查询时，按画像从 Feed 池挑适配好物（推荐+谨慎）
  const profileItems = useMemo(() => {
    if (!profileCrowds.length || hasQuery) return []
    const tr = classifyProductList(feedItems.map((f) => f.product), profileCrowds)
    return [...tr.recommend, ...tr.caution].slice(0, 12)
  }, [profileCrowds, feedItems, hasQuery])

  // 新增：首页加载时检查是否有可领取的红包/实物活动
  useEffect(() => {
    checkCampaign()
  }, [currentCity])

  // 商品「关怀层」信息：复用既有食养引擎，依用户体质/人群个性化适配分档 + 关怀度
  // （displayFeed 已移至 consumptionItems 之后定义，以复用 personalizedItems 做去重）

  // 消费偏好推荐：基于历史订单聚合的食养画像，从当前 Feed 候选池推荐相似好物（排除已购）
  const consumptionItems = useMemo(() => {
    if (!consumptionProfile?.hasData) return []
    return recommendByConsumption(feedItems.map((f) => f.product), consumptionProfile, boughtIds, 12)
  }, [consumptionProfile, feedItems, boughtIds])

  // 个性化插卡：有画像优先展示「体质挑好物」，否则回退「常买好物」；仅展示 1 条，避免多条雷同 rail 叠加
  const personalizedItems = useMemo(
    () => (profileItems.length > 0 ? profileItems : consumptionItems),
    [profileItems, consumptionItems],
  )
  const personalizedTitle = profileItems.length > 0 ? '按你的食养偏好挑好物' : '根据你的常买好物'

  // 今日食养推荐：复用 getTodayFoodTherapy 纯函数（无网络），从首页商品池 + 画像算预览
  const todayResult = useMemo<TodayFoodTherapyResult>(() => {
    const constitution = resolveConstitution(profile ?? null)
    const products = feedItems.map((f) => f.product)
    return getTodayFoodTherapy(constitution, consumptionProfile, products, boughtIds)
  }, [profile, feedItems, consumptionProfile, boughtIds])

  // 底部 Feed 展示列表：有查询时直接展示「即时匹配」结果；无查询时展示默认推荐，并排除已出现在个性化插卡里的好物（去重）+ 叠加分类金刚区筛选 + 「适合我」个性化筛选
  const displayFeed = useMemo<ScoredProduct<Product>[]>(() => {
    if (hasQuery && matchItems.length > 0) {
      return matchItems.map(m => ({
        product: m.product,
        matchScore: m.tier === 'recommend' ? 9 : m.tier === 'caution' ? 4 : 1,
        matchLabel: m.tier === 'recommend' ? '五星推荐' : null,
      }))
    }
    const hideIds = new Set(personalizedItems.map((p) => p.id))
    return feedItems.filter((f) => {
      if (hideIds.has(f.product.id)) return false
      if (catFilter && (f.product.food_category || '') !== catFilter) return false
      if (fitOnly && getSuitability(f.product) !== 'recommend') return false
      return true
    })
  }, [hasQuery, matchItems, feedItems, personalizedItems, catFilter, fitOnly, getSuitability])

  // 食疗引擎报告映射（与详情页/门店卡同源）：首页商品池一次性算好，卡片直接取用
  const therapyMap = useMemo<Record<string, ProductTherapyReport | null>>(() => {
    const map: Record<string, ProductTherapyReport | null> = {}
    const dictMap = new Map(ingredientDict.map((d) => [d.name, d]))
    const calc = (p?: Product | null) => {
      if (!p) return null
      // 优先读 therapy_json 单一数据源（服务端回算 / 上传回写），保证首页与门店卡一致
      const tj = p.therapy_json as Partial<ProductTherapyReport> | null | undefined
      if (tj && tj.overall_nature_code) return tj as ProductTherapyReport
      // 回退：客户端按 ingredients + 食材字典现算（兼容尚未回写的商品）
      if (!p.ingredients || (p.ingredients as string[]).length === 0) return null
      const inputs: ProductIngredientInput[] = (p.ingredients as string[]).map((name) => {
        const row = dictMap.get(name)
        if (!row) return null
        const fi: FoodIngredient = {
          name: row.name, nature: row.nature, base_effect: row.base_effect ?? null,
          fit_scenes: row.fit_scenes ?? null, caution_crowds: row.caution_crowds ?? null,
          allergens: row.allergens ?? null, chronic_tags: row.chronic_tags ?? null, neutralize: row.neutralize ?? null,
        }
        return { ingredient: fi }
      }).filter(Boolean) as ProductIngredientInput[]
      return buildTherapyReport(p.name, inputs)
    }
    personalizedItems.forEach((p) => { map[p.id] = calc(p) })
    displayFeed.forEach((f) => { map[f.product.id] = calc(f.product) })
    return map
  }, [personalizedItems, displayFeed, ingredientDict])

  // 安全取商品关怀层（食养注解），避免单条异常影响整页渲染
  const careOf = (p: Product) => {
    try { return getProductCareInfo(p) } catch { return null }
  }

  const checkCampaign = useCallback(async () => {
    if (!currentCity?.id) return

    try {
      const { supabase } = await import('@/client/supabase')
      const now = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('[Index] 查询活动失败', error)
        return
      }

      // 前端过滤：开始日期 / 结束日期 / 领取上限（仅保留「仍有可发放库存」的活动）
      const today = new Date()
      const activeList = (data || []).filter((c: any) => {
        if (c.start_date && new Date(c.start_date) > today) return false
        if (c.end_date && new Date(c.end_date) < today) return false
        // total_limit 缺失视为不限量；claimed_count 缺失按 0 计。仅当剩余库存 > 0 才展示
        const remaining = (c.total_limit ?? Infinity) - (c.claimed_count ?? 0)
        if (remaining <= 0) return false
        return true
      })

      if (activeList.length > 0) {
        setCampaignList(activeList)
        // 解析门店专享红包的门店名
        const storeIds = activeList.map((c: any) => c.store_id).filter(Boolean)
        if (storeIds.length > 0) {
          const { data: stores } = await supabase
            .from('stores')
            .select('id, name')
            .in('id', storeIds)
          const map: Record<string, string> = {}
          ;(stores || []).forEach((s: any) => { map[s.id] = s.name })
          setStoreNameMap(map)
        }
        // 红包不再进首页自动强弹：改为内容流常驻入口卡片，用户主动点击才展开
      }
    } catch (err) {
      console.error('[Index] 检查活动失败', err)
    }
  }, [currentCity])

  // 首页「消息公告」合并流：官方公告 + 全站实时下单动态（脱敏）
  const homeFeed = useMemo<Array<{ type: 'announcement' | 'order'; text: string }>>(() => {
    const list: Array<{ type: 'announcement' | 'order'; text: string }> = []
    for (const a of announcements) list.push({ type: 'announcement', text: a.content })
    for (const o of orderFeed) {
      list.push({
        type: 'order',
        text: `${o.masked_name} 在 ${o.store_name || '本平台'} 下单 ¥${o.amount} 的 ${o.product_name}`,
      })
    }
    return list
  }, [announcements, orderFeed])

  // 公告/动态轮播
  useEffect(() => {
    if (homeFeed.length <= 1) return
    const t = setInterval(() => setAnnIdx(i => (i + 1) % homeFeed.length), 3000)
    return () => clearInterval(t)
  }, [homeFeed.length])

  // 自然语言识别身体状态人群后，自动高亮对应 chip（与手动选择并存，差异合并）
  const syncAutoCrowds = useCallback((detected: Crowd[]) => {
    const prev = autoCrowdsRef.current
    const prevSet = new Set(prev)
    const nextSet = new Set(detected)
    // 移除不再命中的旧自动人群（仅当当前仍被选中时，避免误删手动选择）
    for (const c of prev) {
      if (!nextSet.has(c) && selectedCrowds.includes(c)) toggleCrowd(c)
    }
    // 新增刚命中的人群（仅当当前未选中时，避免误删手动选择）
    for (const c of detected) {
      if (!prevSet.has(c) && !selectedCrowds.includes(c)) toggleCrowd(c)
    }
    autoCrowdsRef.current = detected
  }, [selectedCrowds, toggleCrowd])

  // 即时匹配：输入身体状态词（或点快捷标签）→ 直接配对商品，全程零额外操作
  // 食养驱动：仅按身体人群分档，情绪不再参与前台交互（已转后台算法维度）
  const runMatch = useCallback(async (text: string, explicitCrowds?: Crowd[]) => {
    const crowds = explicitCrowds && explicitCrowds.length ? explicitCrowds : parseCrowdsFromText(text)
    const hasBody = crowds.length > 0

    // 同步全局人群（供详情页等复用 + 清空重置）
    syncAutoCrowds(crowds)

    setMatchedLoading(true)
    // 性能优化：优先复用已加载的首页主池，避免每次输入都重复请求（省 ~1 RTT）
    let pool: Product[] = feedItems.map(f => f.product)
    if (pool.length === 0) {
      try {
        pool = await getProducts({ limit: 40, platformFilter: 'only' })
      } catch (e) {
        console.error('[Index] 匹配查询失败', e)
      }
    }

    let matched: Array<{ product: Product; tier: FitTier | null }> = []
    let avoidCount = 0
    if (hasBody) {
      const tr = classifyProductList(pool, crowds)
      avoidCount = tr.avoid.length
      matched = [
        ...tr.recommend.map(p => ({ product: p, tier: 'recommend' as FitTier })),
        ...tr.caution.map(p => ({ product: p, tier: 'caution' as FitTier })),
      ]
      if (matched.length === 0) {
        matched = pool.map(p => ({ product: p, tier: null }))
      }
    } else {
      matched = pool.slice(0, 12).map(p => ({ product: p, tier: null }))
    }

    setMatchItems(matched)
    setMatchAvoid(avoidCount)
    setMatchLabel(buildMatchLabel(crowds))
    setMatchedLoading(false)
  }, [syncAutoCrowds, feedItems])

  // 身体状态输入实时防抖（300ms，更跟手）→ 直接触发食养配对
  const handleMoodInput = (value: string) => {
    setMood(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!value.trim()) {
      setMatchItems([])
      setMatchAvoid(0)
      setMatchLabel('')
      syncAutoCrowds([])
      loadFeed()
      return
    }
    debounceTimer.current = setTimeout(() => {
      // 仅做食养配对，情绪不进前台
      runMatch(value)
    }, 300)
  }

  // 点击身体状态快捷词 → 即时配对（零额外操作，食养推荐核心入口）
  const handleQuickBody = (preset: typeof QUICK_BODY_PRESETS[number]) => {
    setMood(preset.label)
    Taro.showToast({ title: `${preset.emoji} ${preset.label}`, icon: 'none', duration: 700 })
    runMatch(preset.label, preset.crowds)
  }

  // 清空（仅清空前台输入态；情绪信号转后台算法维度，不在前台出现）
  const clearStateInput = () => {
    setMood('')
    setMatchItems([])
    setMatchAvoid(0)
    setMatchLabel('')
    syncAutoCrowds([])
    loadFeed()
  }

  return (
    <View className="min-h-screen bg-background tabbar-pad index-page">

      {/* ===================== L0 主视觉：品牌 + 定位 + 唯一核心动作 ===================== */}
      <View className="mx-4 mt-4 pg-hero p-4 rounded-2xl">
        {/* 国潮装饰层（印章圆环 + 松绿柔光，纯视觉不挡操作） */}
        <View className="pg-hero-seal" />
        <View className="pg-hero-glow" />
        <View className="flex items-center justify-between relative" style={{ zIndex: 1 }}>
          <View className="flex items-center gap-3">
            <View className="pg-hero-badge">
              <Text className="text-xl">🍃</Text>
            </View>
            <View>
              <Text className="text-2xl font-extrabold text-foreground leading-tight">来电有喜</Text>
              <Text className="text-sm text-muted-foreground block mt-0.5">懂身体的好物</Text>
            </View>
          </View>
          {/* 右上角定位块：门店 + 城市（点击切城市）。定位信息统一在右上角，不占中间 C 位 */}
          <View
            className="flex flex-col items-end gap-0.5 px-3 py-1.5 rounded-2xl bg-card border border-border flex-shrink-0 active:scale-95 transition-transform text-right"
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: '/pages/mine/city-select/index' })}
          >
            <View className="flex items-center gap-1">
              <Icon name="crosshairs-gps" size={14} className="text-primary" />
              {locationLoading && <Icon name="loading" size={12} className="text-primary animate-spin" />}
              <Text className="text-xs font-semibold text-foreground truncate" style={{ maxWidth: 96 }}>
                {locationLoading ? '定位中' : (currentStore?.store_name || currentCity?.city_name || '选择城市')}
              </Text>
            </View>
            {!locationLoading && (
              <Text className="text-[10px] text-muted-foreground truncate" style={{ maxWidth: 110 }}>
                {currentStore && typeof currentStore.distance_km === 'number'
                  ? (locationError
                      ? `${currentStore.store_name} · 定位未开启`
                      : `${currentCity?.city_name || '杭州'} · 约${currentStore.distance_km}km`)
                  : (currentCity?.city_name || '')}
              </Text>
            )}
          </View>
        </View>

        {/* 唯一核心动作：扫码查安全（渐变实心块 = 全站唯一主角，其余皆退为米纸卡） */}
        <View
          className="mx-4 mt-3 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform relative"
          style={{ zIndex: 1, background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--brand-gold)) 100%)' }}
          hoverClass="none"
          onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index' })}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text className="text-lg font-extrabold text-white block">📷 扫码查安全</Text>
            <Text className="text-xs text-white/90 block mt-1" style={{ lineHeight: 1.5 }}>
              扫一下配料表，立刻知道这包食品安不安全、能不能给孩子吃
            </Text>
          </View>
          <View className="px-4 py-2 rounded-full bg-white text-xs font-bold flex-shrink-0" style={{ color: 'hsl(var(--primary))' }}>
            立即扫码
          </View>
        </View>
      </View>

      {/* ===================== 附近门店切换器：门店隔离后切换附近自营/平台店 ===================== */}
      {nearbyStores.length > 0 && (
        <View className="mx-4 mt-3">
          <View className="flex items-center gap-1.5 mb-2">
            <View className="section-accent" />
            <Text className="text-base font-bold text-foreground">附近门店</Text>
            <Text className="text-[10px] text-muted-foreground">切换查看不同门店商品</Text>
          </View>
          <ScrollView scrollX showScrollbar={false} className="nearby-store-scroll">
            <View className="flex flex-row gap-2 pr-3" style={{ display: 'flex', flexDirection: 'row' }}>
              {nearbyStores.map((s) => {
                const active = selectedStoreId === s.id
                const isLocated = currentStore?.id === s.id
                return (
                  <View
                    key={s.id}
                    onClick={() => {
                      manualStoreRef.current = true
                      setSelectedStoreId(s.id)
                    }}
                    hoverClass="none"
                    className={`flex-shrink-0 rounded-full px-3 py-1.5 border flex items-center gap-1 ${active ? 'bg-primary text-white border-primary' : 'bg-card text-foreground border-border'}`}
                  >
                    {isLocated && (
                      <Icon name="crosshairs-gps" size={12} className={active ? 'text-white' : 'text-primary'} />
                    )}
                    <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-foreground'}`}>{s.store_name}</Text>
                    <Text className={`text-[10px] ${active ? 'text-white/80' : 'text-muted-foreground'}`}>约{s.distance_km}km</Text>
                  </View>
                )
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ===================== L1 个性食养层：懂你的推荐 ===================== */}
      {/* 今日食养推荐 + 为你优选：合并节气/画像双维度为单一卡片，消除首页两张雷同食品 rail */}
      {todayResult && (
        <View
          className="mx-4 mt-5 rounded-2xl p-4 pg-card active:scale-[0.99] transition-transform"
          hoverClass="none"
        >
          <SectionHeader
            emoji="🌿"
            title="今日食养"
            subtitle={todayResult.term ? `${todayResult.term.name} · ${todayResult.term.nature}` : '顺时而食'}
            action={{ label: '看完整 ›', onClick: () => Taro.navigateTo({ url: '/pages/food/today-food-therapy/index' }) }}
          />

          {/* 每日建议（截断 2 行） */}
          {todayResult.dailyAdvice && (
            <Text
              className="text-xs text-muted-foreground block mb-2"
              style={{ lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {todayResult.dailyAdvice}
            </Text>
          )}

          {/* top3 推荐 */}
          {todayResult.recommendations.length > 0 && (
            <View className="flex gap-2 overflow-x-auto pb-1">
              {todayResult.recommendations.slice(0, 3).map((item, i) => (
                <View
                  key={i}
                  className="flex-shrink-0 rounded-xl px-3 py-2 bg-background border border-border flex items-center gap-2"
                  style={{ minWidth: 96 }}
                >
                  <Text className="text-lg flex-shrink-0">{item.emoji}</Text>
                  <View className="min-w-0">
                    <Text
                      className="text-xs font-bold text-foreground block"
                      style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {item.name}
                    </Text>
                    <Text className="text-[10px] text-primary">匹配 {item.score}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 为你优选：个性化商品网格（体质/常买），与今日推荐互补，去重展示 */}
          {!hasQuery && personalizedItems.length > 0 && (
            <View className="mt-3 pt-3 border-t border-border">
              <View className="flex items-center gap-2 mb-2">
                <View className="section-accent" />
                <Text className="text-base font-bold text-foreground">{personalizedTitle}</Text>
              </View>
              <View style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {personalizedItems.slice(0, 6).map((product) => (
                  <ProductGridCard key={product.id} id={product.id} name={product.name} price={product.price}
                    imageUrl={product.main_image || product.image_url || ''} storeName={product.store_name || ''}
                  care={careOf(product)}
                  suitability={getSuitability(product)}
                  therapyReport={therapyMap[product.id] ?? null}
                    onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })}
                    onAddCart={(id) => handleAddCart(id, (product as any).store_id)} sales={product.sales_count} adding={addingId === product.id}
                    compact />
                ))}
              </View>
              {profileItems.length > 0 && (
                <Text className="text-[10px] text-muted-foreground mt-2">{FOOD_THERAPY_DISCLAIMER}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* 状态卡：默认收起为一行胶囊，点开才展开输入（去头重脚轻）；情绪不进前台 */}
      <View id="state-card" className="pg-card mx-4 mt-4 p-4">
        {!inputExpanded ? (
          <View className="flex items-center justify-between" hoverClass="none" onClick={() => setInputExpanded(true)}>
            <Text className="text-base font-bold text-foreground">今天身体怎样？</Text>
            <View className="flex items-center gap-1.5 flex-shrink-0">
              {QUICK_BODY_PRESETS.slice(0, 3).map((preset) => (
                <View key={preset.label} hoverClass="none"
                  className="symptom-tag"
                  onClick={(e) => { e.stopPropagation(); handleQuickBody(preset) }}>
                  <Text className="text-sm text-foreground">{preset.label}</Text>
                </View>
              ))}
              <Text className="text-xs text-muted-foreground ml-1">展开 ›</Text>
            </View>
          </View>
        ) : (
          <View>
            <View className="flex items-center justify-between mb-3">
              <View>
                <Text className="text-lg font-bold text-foreground">今天想吃点什么</Text>
                <Text className="text-sm text-muted-foreground">选体质 / 说状态，看食养推荐</Text>
              </View>
              <View className="flex items-center gap-2">
                {selectedCrowds.length > 0 && (
                  <View className="flex items-center gap-1 text-primary text-sm" onClick={() => { clearStateInput(); clearFilters() }} hoverClass="none">
                    <Icon name="close-circle" size={18} />
                    <Text>清空</Text>
                  </View>
                )}
                <View className="flex items-center gap-1 text-muted-foreground text-sm" onClick={() => setInputExpanded(false)} hoverClass="none">
                  <Text>收起</Text>
                </View>
              </View>
            </View>

            {profileCrowds.length > 0 && (
              <View className="mb-3">
                <View className="flex items-center justify-between" hoverClass="none" onClick={() => setShowBodyStates(v => !v)}>
                  <Text className="text-sm text-muted-foreground">
                    {showBodyStates ? '你关注的食养偏好' : `你关注的食养偏好 · ${profileCrowds.length} 项 ›`}
                  </Text>
                </View>
                {showBodyStates && (
                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 8 }}>
                    {[...(userProfile?.body_states ?? []), ...(userProfile?.chronic_conditions ?? [])].map((s) => (
                      <View key={s} className="symptom-tag symptom-tag-active">
                        <Text className="text-sm text-white font-bold">{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View className="mt-3">
              <Text className="text-sm text-muted-foreground mb-2 block">食养偏好（点一下，直接配对）</Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {QUICK_BODY_PRESETS.map((preset) => {
                  const isActive = mood === preset.label
                  return (
                    <View key={preset.label} hoverClass="none" onClick={() => handleQuickBody(preset)}
                      className={`symptom-tag ${isActive ? 'symptom-tag-active' : ''}`}>
                      <Text className="text-base">{preset.emoji}</Text>
                      <Text className={`text-sm ${isActive ? 'text-white font-bold' : 'text-foreground'}`}>{preset.label}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View className="flex items-center gap-2">
              <View className="flex-1 border-2 rounded-2xl px-4 py-3 bg-white transition"
                style={{ borderColor: 'hsl(var(--border))' }}>
                <Input className="w-full text-base text-foreground bg-transparent outline-none"
                  placeholder="说说身体状态，自动为你配对食养好物…"
                  value={mood}
                  onInput={(e) => { const ev = e as any; handleMoodInput(ev.detail?.value ?? ev.target?.value ?? '') }} />
              </View>
              {loading && <Icon name="loading" size={24} className="text-primary animate-spin flex-shrink-0" />}
            </View>

            <Text className="text-xs text-muted-foreground mt-3">{FOOD_THERAPY_DISCLAIMER}</Text>
          </View>
        )}
      </View>

      {/* 即时匹配：输入/选择后直接展示配对好物，零额外操作（紧跟输入框，无需滚动） */}
      {hasQuery && (
        <View className="pg-card mx-4 mt-4 p-4 rounded-2xl">
          <SectionHeader
            emoji="🔥"
            title={`为「${matchLabel}」匹配好物`}
            action={{ label: '看全部 ›', onClick: () => Taro.pageScrollTo({ scrollTop: 99999, duration: 300 }) }}
          />
          <Text className="text-sm text-muted-foreground mb-2 block">共 {matchItems.length} 件 · 按食养适配度排序</Text>

          {matchedLoading && matchItems.length === 0 && (
            <View className="flex gap-3 overflow-x-auto pb-1">
              {[0, 1, 2, 3].map(i => (
                <View key={i} className="flex-shrink-0 bg-card rounded-xl border border-border animate-pulse" style={{ width: 160, height: 160 }} />
              ))}
            </View>
          )}

          {!matchedLoading && matchItems.length === 0 && (
            <Text className="text-base text-muted-foreground">暂未找到直接匹配的好物，换个词试试～</Text>
          )}

          {matchItems.length > 0 && (
            <View className="flex gap-3 overflow-x-auto pb-1">
              {matchItems.slice(0, 10).map(({ product, tier }) => (
                <FitCard key={product.id} product={product} tier={tier ?? undefined}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })}
                  onAddCart={(id) => handleAddCart(id, product.store_id)} adding={addingId === product.id} />
              ))}
            </View>
          )}

          {matchAvoid > 0 && (
            <View>
              <Text className="text-xs text-muted-foreground mt-1">另有 {matchAvoid} 件建议避开</Text>
              <Text className="text-xs text-muted-foreground mt-1">{FOOD_THERAPY_DISCLAIMER}</Text>
            </View>
          )}
        </View>
      )}

      {/* ===================== L2 工具与附近：效率型轻量模块 ===================== */}
      <SectionHeader className="mx-4 mt-6" emoji="🧰" title="食养工具" subtitle="扫码自动收录 · 健康管理" />
      <View className="mx-4 mt-2 grid grid-cols-4 gap-2">
        {[
          { label: '知识图谱', icon: '🧭', url: '/pages/food/knowledge-atlas/index', bg: 'hsl(var(--brand-jade) / 0.10)' },
          { label: '节气食盒', icon: '🌾', url: '/pages/food/seasonal-box/index', bg: 'hsl(var(--brand-gold) / 0.14)' },
          { label: 'BMI计算', icon: '⚖️', url: '/pages/food/bmi/index', bg: 'rgba(99,102,241,0.10)' },
          { label: '体质测试', icon: '🧪', url: '/pages/food/constitution-test/index', bg: 'rgba(14,165,233,0.10)' },
        ].map((item) => (
          <View
            key={item.label}
            className="pg-card rounded-xl py-2.5 flex flex-col items-center gap-1 active:scale-[0.97]"
            style={{ background: item.bg }}
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: item.url })}
          >
            <Text style={{ fontSize: 22 }}>{item.icon}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#475569' }}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* ===================== L2.5 按需求找：场景化食养导航 ===================== */}
      <SectionHeader className="mx-4 mt-5" emoji="🎯" title="按需求找" subtitle="无论什么体质，都能找到适合的好物" />
      <View className="mx-4 mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {[
          { label: '过敏体质', icon: '🛡️', url: '/pages/food/consult/index?scene=allergy' },
          { label: '增强免疫', icon: '💪', url: '/pages/food/consult/index?scene=immunity' },
          { label: '儿童成长', icon: '👶', url: '/pages/food/consult/index?scene=children' },
          { label: '控糖饮食', icon: '🍬', url: '/pages/food/consult/index?scene=sugar' },
          { label: '孕产营养', icon: '🤰', url: '/pages/food/consult/index?scene=pregnant' },
          { label: '助眠安神', icon: '😴', url: '/pages/food/consult/index?scene=sleep' },
          { label: '消化调理', icon: '🫗', url: '/pages/food/consult/index?scene=digestion' },
          { label: '老年养生', icon: '🧓', url: '/pages/food/consult/index?scene=elderly' },
        ].map((item) => (
          <View
            key={item.label}
            className="pg-card rounded-xl py-2 px-3 flex items-center gap-1.5 active:scale-[0.97]"
            style={{ minWidth: '30%', flex: 1 }}
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: item.url })}
          >
            <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: 'hsl(var(--foreground))' }}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* ===================== L3 运营惠专区：福利 + 临期双列并排 ===================== */}
      <View className="mx-4 mt-5 grid grid-cols-2 gap-3">
        {/* 限时福利：常驻可见，用户主动点击才展开，不再进首页强弹打断 */}
        {campaignList.length > 0 && !showCampaignPopup && (
          <View
            className="p-3 rounded-2xl pg-card flex flex-col"
            hoverClass="none"
            onClick={() => setShowCampaignPopup(true)}
          >
            <View className="flex items-center gap-2 min-w-0">
              <Text className="text-2xl">🎁</Text>
              <Text className="text-sm font-bold text-foreground block" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                限时福利 · {campaignList[0]?.campaign_name}
              </Text>
            </View>
            <Text className="text-[11px] text-muted-foreground mt-1 block" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {(campaignList[0]?.store_id && storeNameMap[campaignList[0].store_id])
                ? `${storeNameMap[campaignList[0].store_id]} 专享`
                : '领取红包/实物，绑定专属门店优惠'}
            </Text>
            <View className="mt-auto pt-2 self-start px-3 py-1.5 rounded-full bg-primary text-white text-sm font-bold flex-shrink-0">领取</View>
          </View>
        )}
        {/* 临期特惠入口：跳转 C 端专属频道页（自动折扣，临近保质期商品超值购） */}
        <View
          className="p-3 rounded-2xl flex flex-col"
          style={{ background: 'linear-gradient(135deg, #FFF4E6, #FFE3CC)', border: '1px solid #F6C99B' }}
          hoverClass="none"
          onClick={() => Taro.navigateTo({ url: '/pages/expiry/index' })}
        >
          <View className="flex items-center gap-2 min-w-0">
            <Text className="text-2xl">⏰</Text>
            <Text className="text-sm font-bold block" style={{ color: '#9A3324', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              临期特惠
            </Text>
          </View>
          <Text className="text-[11px] mt-1 block" style={{ color: '#B26A3C', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            临近保质期超值购
          </Text>
          <View className="mt-auto pt-2 self-start px-3 py-1.5 rounded-full text-sm font-bold flex-shrink-0" style={{ background: '#9A3324', color: '#FFF' }}>去逛逛</View>
        </View>
      </View>

      {/* ===================== 公告 / 好物动态 ===================== */}
      {homeFeed.length > 0 && (
        <View id="home-feed" className="mx-4 mt-5 notice-pill">
          <Text className="text-base">{homeFeed[annIdx]?.type === 'order' ? '🛒' : '📢'}</Text>
          <Text className="text-sm text-foreground flex-1 truncate">{homeFeed[annIdx]?.text}</Text>
        </View>
      )}

      {/* ===================== L4 发现：分类金刚区 + 商品流（主力内容） ===================== */}
      {!hasQuery && (
        <View className="mt-5 px-4">
          <SectionHeader emoji="🍱" title="为你精选" subtitle="懂身体的好物，挑挑看" />

          {/* 顶部分类筛选 sticky 条：统一筛选心智（替代原首屏金刚区），吸顶常驻 */}
          <View
            className="flex items-center gap-2 py-2 home-cat-sticky"
            style={{ position: 'sticky', top: 0, zIndex: 20, background: 'hsl(var(--background))' }}
          >
            {[
              { key: 'all', label: '全部', emoji: '🍱' },
              { key: '粉面', label: '粉面', emoji: '🍜' },
              { key: '炖汤', label: '炖汤', emoji: '🍲' },
              { key: '热饮', label: '热饮', emoji: '🍵' },
              { key: '小菜', label: '小菜', emoji: '🥗' },
              { key: 'children', label: '👶儿童', emoji: '' },
              { key: 'sugar', label: '🍬控糖', emoji: '' },
              { key: 'pregnant', label: '🤰孕妈', emoji: '' },
            ].map((cat) => {
              const active = catFilter === (cat.key === 'all' ? null : cat.key)
              return (
                <View
                  key={cat.key}
                  hoverClass="none"
                  onClick={() => setCatFilter(active ? null : (cat.key === 'all' ? null : cat.key))}
                  className="px-3 py-1.5 rounded-full text-sm flex-shrink-0"
                  style={{
                    background: active ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--card))',
                    color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    borderWidth: 1,
                    borderColor: active ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border))',
                    fontWeight: active ? 'bold' : 'normal',
                  }}
                >
                  {cat.label}
                </View>
              )
            })}

            {/* 「适合我」个性化筛选：仅对已完成健康画像的用户展示，无画像时免打扰 */}
            {hasHealthProfile && (
              <>
                {/* 适合我：仅看画像推荐(recommend)的好物 */}
                <View
                  hoverClass="none"
                  onClick={() => setFitOnly((v) => !v)}
                  className="px-3 py-1.5 rounded-full text-sm flex-shrink-0 flex items-center gap-1"
                  style={{
                    background: fitOnly ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--card))',
                    color: fitOnly ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    borderWidth: 1,
                    borderColor: fitOnly ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border))',
                    fontWeight: fitOnly ? 'bold' : 'normal',
                  }}
                >
                  <Text>✅ 适合我</Text>
                </View>
              </>
            )}
          </View>

          {loading && feedItems.length === 0 ? (
            <View style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} className="bg-card rounded-xl border border-border animate-pulse" style={{ width: '48%', height: 200, marginBottom: 12 }} />
              ))}
            </View>
          ) : displayFeed.length > 0 ? (
            <View style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {displayFeed.map((f) => (
                <ProductGridCard key={f.product.id} id={f.product.id} name={f.product.name} price={f.product.price}
                  imageUrl={f.product.main_image || f.product.image_url || ''} storeName={f.product.store_name || ''}
                  care={careOf(f.product)}
                  suitability={getSuitability(f.product)}
                  therapyReport={therapyMap[f.product.id] ?? null}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${f.product.id}` })}
                  onAddCart={(id) => handleAddCart(id, (f.product as any).store_id)} sales={f.product.sales_count} adding={addingId === f.product.id}
                  compact />
              ))}
            </View>
          ) : (
            <View className="flex flex-col items-center justify-center py-10 gap-3">
              <Icon name="storefront-outline" size={48} className="text-muted-foreground/40" />
              <Text className="text-base text-muted-foreground text-center">
                {selectedStoreId ? '该门店暂无商品，店主正在上架中…' : '暂无推荐好物，切换门店看看～'}
              </Text>
              {selectedStoreId && (
                <Button type="button" className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-base"
                  onClick={() => { setSelectedStoreId(null); loadFeed() }}>
                  查看全平台商品
                </Button>
              )}
            </View>
          )}
        </View>
      )}

      {/* 红包/实物领取弹窗 */}
      {showCampaignPopup && campaignList.length > 0 && (
        <View className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <View className="w-10/12 max-h-4/5 bg-card rounded-3xl p-6 overflow-y-auto">
            <Text className="text-2xl font-bold text-foreground text-center block mb-4">
              🎁 限时福利
            </Text>
            <Text className="text-base text-muted-foreground text-center block mb-6">
              领取红包/实物，绑定专属门店优惠
            </Text>

            {/* 活动列表 */}
            <View className="gap-4 mb-6">
              {campaignList.map((campaign, index) => (
                <View key={campaign.id} className="p-4 rounded-2xl bg-background border border-border">
                  <View className="flex items-center gap-3 mb-3">
                    <Text className="text-3xl">
                      {campaign.campaign_type === 'red_packet' ? '🧧' : '🎁'}
                    </Text>
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-foreground block">
                        {campaign.campaign_name}
                      </Text>
                      <Text className="text-base text-muted-foreground">
                        {campaign.campaign_type === 'red_packet'
                          ? `¥${campaign.gift_value} 现金红包`
                          : campaign.gift_name}
                      </Text>
                      {campaign.store_id && storeNameMap[campaign.store_id] && (
                        <View className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-destructive/10">
                          <Text className="text-xs text-red-600 font-bold">
                            {storeNameMap[campaign.store_id]} 专享
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View
                    className="w-full py-3 rounded-2xl bg-primary text-white text-center text-xl font-bold"
                    onClick={() => {
                      Taro.navigateTo({
                        url: `/pages/marketing/campaign-claim/index?campaignId=${campaign.id}`
                      })
                      setShowCampaignPopup(false)
                    }}
                  >
                    立即领取
                  </View>
                </View>
              ))}
            </View>

            {/* 关闭按钮 */}
            <View
              className="w-full py-3 rounded-2xl bg-muted text-muted-foreground text-center text-xl font-bold"
              onClick={() => setShowCampaignPopup(false)}
            >
              暂时不要
            </View>
          </View>
        </View>
      )}

      {/* 悬浮扫码按钮已合并至首屏「扫码查安全」唯一入口，避免首页扫码重复 */}

      {/* 全局悬浮操作栏：客服 / 食疗咨询 两个独立常驻按钮（去结算已内嵌咨询页，不再出现在悬浮栏） */}
      <FloatingActionBar />

      {/* 自定义底部导航：独立渲染（贴底全宽），不可嵌套在 FAB 容器内，否则购物车徽标在真机渲染异常 */}
      <CustomTabBar />
    </View>
  )
}

// 首页统一区块标题：emoji 圆标 + 主标题 + 副标题 + 可选操作，建立目录式标题语言让层级分明
function SectionHeader({ emoji, title, subtitle, action, className }: {
  emoji?: string
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
  className?: string
}) {
  return (
    <View className={`flex items-center justify-between mb-3 ${className || ''}`}>
      <View className="flex items-center gap-2 min-w-0">
        {emoji && <View className="section-emoji">{emoji}</View>}
        <View className="min-w-0">
          <Text className="text-lg font-extrabold text-foreground leading-tight block truncate">{title}</Text>
          {subtitle && <Text className="text-xs text-muted-foreground block truncate mt-0.5">{subtitle}</Text>}
        </View>
      </View>
      {action && (
        <Text
          className="text-xs text-primary font-bold flex-shrink-0 ml-2"
          hoverClass="none"
          onClick={action.onClick}
        >{action.label}</Text>
      )}
    </View>
  )
}

// 首页紧凑商品卡（横滑 160px）与自营页 ProductGridCard 分工：
//   FitCard      = 横滑轻卡，承载「即时匹配 / 消费推荐」流；
//   ProductGridCard = 两列网格卡，承载自营页完整注解。
// 两者复用同一套食养引擎 getProductCareInfo，保证注解口径一致。

// 性味 → 色点（与 merchant-products 的 NATURE_COLOR 同源口径）
function natureDotColor(n: string | null | undefined): string | null {
  if (!n) return null
  if (n.includes('平')) return '#16A34A'
  if (n.includes('微温') || n.includes('温热')) return '#C77B47'
  if (n.includes('大热')) return '#DC2626'
  if (n.includes('寒')) return '#3B82F6'
  return '#9CA3AF'
}

// ====== 智能推荐商品卡（支持身体状态分档角标 + 轻量关怀注解） ======
function FitCard({ product, onTap, tier, onAddCart }: { product: Product; onTap: () => void; tier?: FitTier; onAddCart?: (id: string) => void }) {
  const [imgFailed, setImgFailed] = useState(false)
  const care = useMemo(() => {
    try { return getProductCareInfo(product) } catch { return null }
  }, [product])
  // 适合我专区：卡片只展示正向「五星推荐」，负向「谨慎食用」不呈现（不展示不适合人群）
  const tierBadge = tier === 'recommend'
    ? { text: '五星推荐', bg: '#16A34A', fg: '#FFFFFF' }
    : null
  const dot = natureDotColor(care?.nature)
  const healthTag = care?.healthTags?.[0]
  const hasCare = !!dot || !!healthTag
  return (
    <View onClick={onTap}
      className="pg-card flex-shrink-0 w-40 relative overflow-hidden"
      style={{ minWidth: 160 }}
      hoverClass="pg-hover">
      <View className="relative w-full overflow-hidden" style={{ height: 104 }}>
        {imgFailed ? (
          <View className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">商品图</View>
        ) : (
          <Image src={product.image_url || ''} mode="aspectFill" className="pg-img" onError={() => setImgFailed(true)} />
        )}
        {tierBadge && (
          <View className="pg-badge absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-xs font-bold"
            style={{ background: tierBadge.bg, color: tierBadge.fg }}>
            {tierBadge.text}
          </View>
        )}
      </View>
      <View className="p-2.5">
        <Text className="text-base font-bold text-foreground leading-tight"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {product.name}
        </Text>
        <View className="flex items-center justify-between mt-1.5">
          <View className="flex items-baseline gap-0.5">
            <Text className="text-xs text-primary font-bold leading-none">¥</Text>
            <Text className="text-lg font-extrabold text-primary leading-none">{product.price}</Text>
          </View>
          {onAddCart && <AddToCartButton size={28} onAdd={() => onAddCart(product.id)} />}
        </View>
        {hasCare && (
          <View className="flex items-center gap-1 mt-1.5 flex-wrap">
            {dot && (
              <View style={{ width: 6, height: 6, borderRadius: 9999, background: dot, flexShrink: 0 }} />
            )}
            {healthTag && (
              <Text style={{ fontSize: 10, lineHeight: '14px', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, background: 'rgba(194,65,12,0.12)', color: '#C2410C' }}>{healthTag}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  )
}
