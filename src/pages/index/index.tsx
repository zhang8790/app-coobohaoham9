// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline, useRouter } from '@tarojs/taro'
import { Image, Input, View, Text, ScrollView, Button, Video } from '@tarojs/components'
import { getProducts, getRankedFeed, getAnnouncements, getOrderFeed, getOrders, getProductsByIds, getMyFootprints, getUserFoodTherapyWeights, addToCart, getSiteConfig } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import { getUserHealthProfile, getLatestConstitutionResult, getScanHistory } from '@/db/food-api'
import type { Product, Announcement, OrderFeedItem, Order, UserHealthProfile, UserScanHistory } from '@/db/types'
import StoreStrip from '@/components/StoreStrip'
import { type ScoredProduct } from '@/utils/emotionEngine'
import { scanAndRoute } from '@/utils/scan'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { parseCrowdsFromText, classifyProduct as classifyOne, toFoodTherapyInput, QUICK_BODY_PRESETS, profileToCrowds, FOOD_CATEGORIES, HEALTH_TAGS, type Crowd, type FitTier, type HealthTag } from '@/utils/food-therapy'
import { buildTherapyReport, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { getTodayFoodTherapy, resolveConstitution, type TodayFoodTherapyResult } from '@/utils/today-food-therapy'
import { analyzeConsumption, recommendByConsumption, type ConsumptionProfile } from '@/utils/consumption-profile'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import Icon from '@/components/Icon'
import IconZone from '@/components/home/IconZone'
import AdBanner from '@/components/home/AdBanner'
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

// 画像人群 → 首页动态场景胶囊映射（千人千面核心入口：按画像自动浮现高相关食养场景）
const SCENE_BY_CROWD: Array<{ kw: string[]; scene: string; label: string; emoji: string }> = [
  { kw: ['儿童', '成长', '宝'], scene: 'children', label: '宝宝零食', emoji: '👶' },
  { kw: ['糖', '血糖'], scene: 'sugar', label: '控糖专场', emoji: '🍬' },
  { kw: ['眠', '安神', '失眠'], scene: 'sleep', label: '晚安助眠', emoji: '😴' },
  { kw: ['老年', '三高', '血压'], scene: 'elderly', label: '老年养生', emoji: '🧓' },
  { kw: ['免疫', '体虚'], scene: 'immunity', label: '增强免疫', emoji: '💪' },
  { kw: ['过敏'], scene: 'allergy', label: '敏感防护', emoji: '🛡️' },
  { kw: ['消化', '脾胃', '胃'], scene: 'digestion', label: '消化调理', emoji: '🫗' },
  { kw: ['孕', '产'], scene: 'pregnant', label: '孕产营养', emoji: '🤰' },
]

// 行为标签复利：把用户显式反馈权重（点赞+1 / 点踩-1 / 加购+1 / 购买+1，view 记 0）叠加进消费画像的标签权重，
// 让「浏览 / 购买 / 互动」共同沉淀为食养偏好，反哺首页推荐与今日食养。
function mergeFeedbackIntoProfile(prof: ConsumptionProfile, weights: Record<string, number>): ConsumptionProfile {
  const entries = weights && Object.keys(weights).length > 0 ? weights : {}
  const counts = new Map<string, number>()
  for (const ht of prof.topHealthTags) counts.set(ht.tag, ht.count)
  for (const [tag, w] of Object.entries(entries)) {
    if (!w) continue
    if (!(HEALTH_TAGS as readonly string[]).includes(tag)) continue
    counts.set(tag, (counts.get(tag) ?? 0) + w)
  }
  const topHealthTags = [...counts.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => ({ tag: tag as HealthTag, count }))
  return { ...prof, hasData: topHealthTags.length > 0, topHealthTags }
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

function readFeedCache(storeId: string | null): ScoredProduct<Product>[] | null {
  try {
    const key = `${FEED_CACHE_KEY}:${storeId ?? 'none'}`
    const raw = Taro.getStorageSync(key) as { t: number; items: ScoredProduct<Product>[] } | null
    if (!raw?.items?.length) return null
    if (Date.now() - raw.t > FEED_CACHE_TTL) return null
    return raw.items
  } catch { return null }
}
function writeFeedCache(storeId: string | null, items: ScoredProduct<Product>[]) {
  try { Taro.setStorageSync(`${FEED_CACHE_KEY}:${storeId ?? 'none'}`, { t: Date.now(), items }) } catch { /* ignore */ }
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
  const { user, profile } = useAuth()
  const { currentCity, currentLocation, currentStore, nearbyStores, loading: locationLoading, error: locationError, detectLocation } = useLocation()
  // 最近扫码：扫码购物的「学习闭环」沉淀，首页食养区可见（只读、不阻断主流程）
  // 首页品牌区背景：运营在「首页品牌配置」上传的图/视频，写 site_configs.home_brand_hero_bg。
  // 兼容旧结构 image_url 与新结构 media_url/media_type。
  const [brandMedia, setBrandMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null)
  useEffect(() => {
    let alive = true
    getSiteConfig<{ image_url?: string; media_url?: string; media_type?: string }>('home_brand_hero_bg')
      .then(v => {
        if (!alive || !v) return
        const url = v.media_url || v.image_url || ''
        if (!url) return
        const isVideo = v.media_type === 'video' ||
          (v.media_type !== 'image' && /\.(mp4|webm|ogg|mov)$/i.test(url))
        setBrandMedia({ url, type: isVideo ? 'video' : 'image' })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const [scanChips, setScanChips] = useState<UserScanHistory[]>([])
  useEffect(() => {
    if (!user?.id) { setScanChips([]); return }
    let alive = true
    getScanHistory(user.id, { limit: 6 })
      .then(list => { if (alive) setScanChips(list.filter(h => h.input_type === 'barcode')) })
      .catch(() => {})
    return () => { alive = false }
  }, [user?.id])
  const { selectedCrowds, toggleCrowd, clearFilters, getSuitability, hasHealthProfile, userAllergens } = useFoodTherapy()
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
  const [feedSort, setFeedSort] = useState<'latest' | 'hot'>('latest')
  // 「适合我」个性化筛选：仅看适合我的好物
  const [fitOnly, setFitOnly] = useState(false)
  // 状态卡「你关注的食养偏好」默认折叠，降低首屏高度
  const [showBodyStates, setShowBodyStates] = useState(false)
  // 状态卡默认收起为「一行胶囊」，点击才展开输入（去头重脚轻）
  const [inputExpanded, setInputExpanded] = useState(false)
  const [feedItems, setFeedItems] = useState<ScoredProduct<Product>[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  // 个人订单（仅登录后拉取）：用于首页「订单通知」强提醒
  const [myOrders, setMyOrders] = useState<Order[]>([])
  // 门店筛选：未选=全城聚合流；用户点门店切换器才收窄到该店（下钻）
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  // 用户是否手动选过门店：一旦手动选过，定位异步完成 / 切回首页自动定位都不应再覆盖选择
  const manualStoreRef = useRef(false)
  // 首页顶部右上角门店切换：把"附近门店"收敛进右上角，移除独立横滑条（首页改版 2026-08-04）。
  // 当前生效门店 = 用户手动选中的门店（selectedStoreId）或 GPS 定位到的当前门店。
  // 注意：必须放在 selectedStoreId / manualStoreRef 声明之后，否则函数体内先引用后声明触发 TDZ。
  const activeStore = nearbyStores.find((s) => s.id === selectedStoreId) || currentStore
  const openStoreSheet = () => {
    if (!nearbyStores.length) {
      // 无附近门店时，退化为切城市
      Taro.navigateTo({ url: '/pages/mine/city-select/index' })
      return
    }
    Taro.showActionSheet({
      itemList: nearbyStores.map((s) => `${s.store_name}（约${s.distance_km}km）`),
    }).then((res) => {
      const s = nearbyStores[res.tapIndex]
      if (!s) return
      manualStoreRef.current = true
      setSelectedStoreId(s.id)
    }).catch(() => {})
  }
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
  // 首页扫码配料识别 · 技术壁垒弹窗（突出自研数据库区别于通用 AI）
  const [showScanMoat, setShowScanMoat] = useState(false)
  const [campaignList, setCampaignList] = useState<any[]>([])
  // 门店红包对应的门店名（用于在首页弹窗标注「XX店专享」）
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({})
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  // P2 复测提醒：最近一次体质测试距今天数（null = 游客态/无记录，不提示）
  const [retestDays, setRetestDays] = useState<number | null>(null)
  useEffect(() => {
    getFoodIngredients().then(setIngredientDict).catch(() => {})
  }, [])
  // 读取最近一次体质结果并算天数（零网络 user 解析，游客态静默返回 null）
  useEffect(() => {
    let alive = true
    getLatestConstitutionResult()
      .then((row) => {
        if (!row || !alive) return
        const diff = Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 86400000)
        setRetestDays(diff >= 0 ? diff : null)
      })
      .catch(() => {})
    return () => { alive = false }
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

  // 加载个人订单（仅登录后）；用于首页「订单通知」强提醒与右上角铃铛红点
  const loadMyOrders = useCallback(async () => {
    if (!profile?.id) { setMyOrders([]); return }
    const data = await getOrders(undefined, 0, 10)
    setMyOrders(Array.isArray(data) ? data : [])
  }, [profile?.id])

  // 加载 Feed（首页推荐：定位就绪时按最近门店聚合附近多店商品；食养分档由前端 classifyProductList 处理，情绪不再参与前台）
  // 防重入：并发的 loadFeed（useEffect 挂载 + useDidShow 切回 tab）只跑一次网络请求，
  // 避免首页 Feed 双拉取导致的列表重渲染/重影（与购物车页同源修复）
  const feedInflightRef = useRef<Promise<void> | null>(null)
  const loadFeed = useCallback(async () => {
    if (feedInflightRef.current) return feedInflightRef.current
    feedInflightRef.current = (async () => {
      try {
        // 默认全城聚合：未显式选店时拉「全城好物」（原'自营'总仓聚合流）；仅当用户在门店切换器
        // 手动点选某门店时才按该店过滤（下钻）。既保留门店隔离（选店只看该店），又守住
        // 「先逛全城、再进店」的人类浏览习惯，避免小店首页空白。
        const storeId = selectedStoreId
        // ① 先用缓存秒出（按门店隔离缓存，避免切店串味），下拉刷新仍会强制走网络
        const cached = readFeedCache(storeId)
        if (cached && cached.length) {
          setFeedItems(cached)
          setLoading(false)
        } else {
          setLoading(true)
        }
        let raw: Product[] = []
        if (storeId) {
          // 已显式选定门店：只拉该店商品（下钻），别的店不混进
          raw = feedSort === 'hot'
            ? await getRankedFeed({ storeId, limit: 40 })
            : await getProducts({ storeId, limit: 40 })
        } else {
          // 默认全城聚合流：推荐=热度榜（storeId 不传=全城）；最新=全城好物
          raw = feedSort === 'hot'
            ? await getRankedFeed({ storeId: undefined, limit: 40 })
            : await getProducts({ limit: 30, platformFilter: 'only' })
        }
        const next = raw.map(p => ({ product: p, matchScore: 1, matchLabel: null }))
        setFeedItems(next)
        writeFeedCache(storeId, next)
      } finally {
        setLoading(false)
        feedInflightRef.current = null
      }
    })()
    return feedInflightRef.current
  }, [currentLocation, nearbyStores, selectedStoreId, currentStore, feedSort])

  // 注意：不再自动把首页 feed 锁到最近门店——默认全城聚合流，用户手动点门店切换器才下钻。
  // （旧逻辑会在定位完成后自动 setSelectedStoreId(currentStore.id)，强制单店、小店首页空白，
  // 违背「先逛全城」的人类习惯，已撤销。）

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

  useEffect(() => { loadAnnouncements(); loadOrderFeed(); loadFeed(); loadMyOrders() }, [loadAnnouncements, loadOrderFeed, loadFeed, loadMyOrders])
  useDidShow(() => { loadFeed() })
  // 推荐/最新切换时重拉 feed
  useEffect(() => { loadFeed() }, [feedSort])

  // 消费偏好画像：登录后回溯历史订单 + 浏览足迹 → 聚合食养偏好（health_tag 频次 / nature 众数）
  // 行为标签复利：购买(强信号×3) + 浏览(弱信号×1) 共同沉淀；并叠加显式反馈权重(点赞/点踩/加购/购买)。
  const loadConsumptionProfile = useCallback(async () => {
    if (!profile?.id) return
    const empty = { hasData: false, boughtCount: 0, topHealthTags: [], naturePref: null }
    // 隐私闸：用户已退出「个性化行为分析」则不构建食养偏好画像（合规尊重用户选择）
    if ((profile as any).allow_behavior_analysis === false) {
      setBoughtIds(new Set())
      setConsumptionProfile(empty)
      writeConsumeCache(profile.id, { profile: empty, boughtIds: [] })
      return
    }
    try {
      // 命中缓存直接秒出，省去多次网络往返
      const cached = readConsumeCache(profile.id)
      if (cached) {
        setBoughtIds(new Set(cached.boughtIds))
        setConsumptionProfile(cached.profile)
        return
      }
      // 1) 购买行为（强信号）
      const orders = await getOrders(undefined, 0, 50)
      const purchaseIds: string[] = []
      for (const o of orders) {
        for (const it of (o.order_items || [])) {
          if (it.product_id) purchaseIds.push(it.product_id)
        }
      }
      const uniqPurchase = Array.from(new Set(purchaseIds))
      // 2) 浏览行为（弱信号，按当前用户精确取自己的足迹，避免 RLS 关闭时越权）
      const fps = await getMyFootprints(0, 120, profile.id)
      const viewProducts = (fps || [])
        .map((f: any) => (f.products ?? f.product) as Product | undefined)
        .filter((p): p is Product => !!p && !!p.id)
      const viewIds = Array.from(new Set(viewProducts.map((p) => p.id)))
      // 合并去重商品 id（购买 + 浏览）
      const uniq = Array.from(new Set([...uniqPurchase, ...viewIds]))
      if (uniq.length === 0) {
        setConsumptionProfile(empty)
        writeConsumeCache(profile.id, { profile: empty, boughtIds: [] })
        return
      }
      const bought = await getProductsByIds(uniq)
      // 加权入列：购买 ×3（强信号）、浏览 ×1；重复入列实现频次权重，喂给 analyzeConsumption
      const weighted: Product[] = []
      for (const p of bought) {
        const repeat = uniqPurchase.includes(p.id) ? 3 : 1
        for (let i = 0; i < repeat; i++) weighted.push(p)
      }
      const prof = analyzeConsumption(weighted)
      // 3) 叠加显式反馈权重（点赞 +1 / 点踩 -1 / 加购 +1 / 购买 +1；view 记 0 不计）
      const weights = await getUserFoodTherapyWeights()
      const merged = mergeFeedbackIntoProfile(prof, weights)
      setBoughtIds(new Set(uniq))
      setConsumptionProfile(merged)
      writeConsumeCache(profile.id, { profile: merged, boughtIds: uniq })
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

  // 千人千面个性化文案：基于本人画像(派生人群) + 过敏原红线，一行说明为你定制
  const personalLine = (() => {
    const bits: string[] = []
    if (profileCrowds.length) bits.push(`关注 ${profileCrowds.slice(0, 2).join('、')}`)
    if (userAllergens.length) bits.push(`已规避 ${userAllergens.length} 类过敏原`)
    return bits.length ? `为你 · ${bits.join(' · ')}` : ''
  })()

  // 动态场景胶囊：画像人群 → 高相关食养场景（千人千面入口，2-4 个）
  const sceneCaps = useMemo(() => {
    const out: Array<{ scene: string; label: string; emoji: string }> = []
    for (const rule of SCENE_BY_CROWD) {
      if (profileCrowds.some((c) => rule.kw.some((k) => c.includes(k)))) {
        out.push({ scene: rule.scene, label: rule.label, emoji: rule.emoji })
      }
    }
    return out.slice(0, 4)
  }, [profileCrowds])

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
  const personalizedTitle = profileItems.length > 0 ? '按你的食养偏好挑好物' : '根据你的浏览与常买好物'

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

  // 千人千面排序：有画像且无查询、非热度模式时，把商品流按食养适配度(recommend→caution→avoid)前置
  const sortedFeed = useMemo<ScoredProduct<Product>[]>(() => {
    if (hasQuery || feedSort === 'hot' || selectedCrowds.length === 0) return displayFeed
    const rank: Record<string, number> = { recommend: 0, caution: 1, avoid: 2 }
    return [...displayFeed].sort((a, b) => {
      const ra = rank[getSuitability(a.product)] ?? 3
      const rb = rank[getSuitability(b.product)] ?? 3
      return ra - rb
    })
  }, [displayFeed, hasQuery, feedSort, selectedCrowds, getSuitability])

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

  // 首页「限时福利」入口（统一收口至 L2 金刚区）：有活动弹出领取，无活动轻提示
  const openCampaign = useCallback(() => {
    if (campaignList.length > 0) setShowCampaignPopup(true)
    else Taro.showToast({ title: '暂无进行中的活动', icon: 'none' })
  }, [campaignList])

  // 首页「好物动态」：仅全站实时下单脱敏聚合（社会证明）。
  // 注：官方公告在右上角铃铛（消息中心）聚合展示，此处仅保留「好物动态」社会证明，不再重复展示公告。
  const homeFeed = useMemo<Array<{ type: 'order'; text: string }>>(() => {
    return orderFeed.map((o) => ({
      type: 'order' as const,
      text: `${o.masked_name} 在 ${o.store_name || '本品牌门店'} 下单 ¥${o.amount} 的 ${o.product_name}`,
    }))
  }, [orderFeed])

  // 公告/动态轮播
  useEffect(() => {
    if (homeFeed.length <= 1) return
    const t = setInterval(() => setAnnIdx(i => (i + 1) % homeFeed.length), 3000)
    return () => clearInterval(t)
  }, [homeFeed.length])

  // ===================== 首页通知：右上角铃铛（公告/订单分层，红点提醒） =====================
  // 进行中订单状态（排除已取消/已完成）
  const ACTIVE_ORDER_STATUSES = ['pending_pay', 'pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'after_sale']
  const ORDER_STATUS_LABEL: Record<string, string> = {
    pending_pay: '待付款', pending_ship: '待发货', pending_receive: '待收货',
    pending_pickup: '待取货', pending_review: '待评价', after_sale: '售后中',
    completed: '已完成', cancelled: '已取消',
  }
  // 进行中个人订单（最新的排前面）
  const activeOrders = useMemo(
    () => myOrders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)),
    [myOrders],
  )
  // 右上角铃铛红点：有进行中订单，或存在未读公告（以本地已读最新公告 id 比对）
  const annSeenId = (Taro.getStorageSync('ann_seen') as string | undefined) ?? ''
  const bellUnread = activeOrders.length > 0 || (announcements.length > 0 && announcements[0].id !== annSeenId)
  // 进入消息中心：标记最新公告为已读
  const goMessageCenter = () => {
    if (announcements[0]) Taro.setStorageSync('ann_seen', announcements[0].id)
    Taro.navigateTo({ url: '/pages/message-center/index' })
  }

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
        // 复用首页主池失败时的兜底：优先按当前锁定门店，无门店才退全平台（保持一致）
        const sid = selectedStoreId ?? currentStore?.id ?? null
        pool = sid
          ? await getProducts({ storeId: sid, limit: 40 })
          : await getProducts({ limit: 40, platformFilter: 'only' })
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
  }, [syncAutoCrowds, feedItems, selectedStoreId, currentStore])

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

  // 日常饮食偏好：已从独立卡片并入「优惠福利」卡内（IconZone extraBottom），交互逻辑保持不变
  const dailyPrefBlock = (
    <View>
      {!inputExpanded ? (
        <View className="flex items-center justify-between" hoverClass="none" onClick={() => setInputExpanded(true)}>
          <Text className="text-base font-bold text-foreground">日常饮食偏好</Text>
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
              <Text className="text-sm text-muted-foreground">选偏好 / 说习惯，看食养推荐</Text>
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
                placeholder="说说饮食偏好，自动为你配对食养好物…"
                value={mood}
                onInput={(e) => { const ev = e as any; handleMoodInput(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </View>
            {loading && <Icon name="loading" size={24} className="text-primary animate-spin flex-shrink-0" />}
          </View>

          <Text className="text-xs text-muted-foreground mt-3">{FOOD_THERAPY_DISCLAIMER}</Text>
        </View>
      )}
    </View>
  )

  return (
    <View className="min-h-screen bg-background tabbar-pad index-page">

      {/* ===================== L0 主视觉：品牌标题置顶 + 搜索/定位一行 ===================== */}
      <View className="mx-4 mt-4 pg-hero p-4 rounded-2xl" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* 品牌背景图/视频（运营在「首页品牌配置」上传；无配置则回退 CSS 渐变） */}
        {brandMedia?.type === 'image' && (
          <Image
            src={brandMedia.url}
            mode="aspectFill"
            className="absolute left-0 top-0 w-full h-full"
            style={{ zIndex: 0 }}
          />
        )}
        {brandMedia?.type === 'video' && (
          <Video
            src={brandMedia.url}
            autoplay
            muted
            loop
            className="absolute left-0 top-0 w-full h-full"
            style={{ zIndex: 0 }}
          />
        )}
        {/* 国潮装饰层（印章圆环 + 松绿柔光，纯视觉不挡操作） */}
        <View className="pg-hero-seal" style={{ zIndex: 1 }} />
        <View className="pg-hero-glow" style={{ zIndex: 1 }} />

        {/* 品牌标题行：来电有喜 · 懂身体的好物（最顶部） */}
        <View className="flex items-center gap-2.5 relative" style={{ zIndex: 1 }}>
          <View className="pg-hero-badge">
            <Text className="text-xl">🍃</Text>
          </View>
          <Text className="text-xl font-extrabold text-foreground leading-tight">来电有喜，懂身体的好物</Text>
        </View>

        {/* 搜索 / 扫码 / 定位 合一行：搜索在左，门店切换在右 */}
        <View
          className="mt-3 rounded-2xl bg-card border border-border flex items-center gap-2 px-3 py-2.5 relative"
          style={{ zIndex: 1 }}
          hoverClass="none"
        >
          {/* 搜索区：点击进入搜索页 */}
          <View
            className="flex items-center gap-2 flex-1 active:opacity-70 transition-opacity"
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}
          >
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <Text className="text-sm text-muted-foreground flex-1">搜索好物</Text>
          </View>
          {/* 门店切换（右侧） */}
          <View
            className="flex flex-col items-end gap-0.5 pl-2.5 ml-0.5 border-l border-border flex-shrink-0 active:scale-95 transition-transform text-right"
            hoverClass="none"
            onClick={openStoreSheet}
          >
            <View className="flex items-center gap-1">
              <Icon name="storefront-outline" size={14} className="text-primary" />
              {locationLoading && <Icon name="loading" size={12} className="text-primary animate-spin" />}
              <Text className="text-xs font-semibold text-foreground truncate" style={{ maxWidth: 80 }}>
                {locationLoading ? '定位中' : (activeStore?.store_name || currentCity?.city_name || '选择门店')}
              </Text>
              <Text className="text-[10px] text-muted-foreground">▾</Text>
            </View>
            {!locationLoading && (
              <Text className="text-[10px] text-muted-foreground truncate" style={{ maxWidth: 96 }}>
                {activeStore && typeof activeStore.distance_km === 'number'
                  ? (locationError
                      ? '定位未开启'
                      : `${currentCity?.city_name || '杭州'} · 约${activeStore.distance_km}km`)
                  : (currentCity?.city_name || '')}
              </Text>
            )}
          </View>
        </View>

      </View>

      {/* 扫码配料识别 CTA：项目最强壁垒，首页首屏强曝光（区别于通用 AI） */}
      <View
        className="mx-4 mt-3 rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
        style={{ background: 'hsl(var(--primary))' }}
        hoverClass="none"
        onClick={() => setShowScanMoat(true)}
      >
        <View className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>📷</View>
        <View className="flex-1 min-w-0">
          <Text className="text-white text-sm font-bold block">扫码解析配料｜添加剂风险评级｜体质适配度检测</Text>
          <Text className="text-white/80 text-[11px] block mt-0.5">区别于通用 AI · 自研十万级零食配料数据库</Text>
        </View>
        <Text className="text-white text-xs font-bold flex-shrink-0">去识别 ›</Text>
      </View>

      {/* ===================== 广告位：纯图片 / 视频（无文字广告、无家庭档案） ===================== */}
      <AdBanner />

      <IconZone onCampaign={openCampaign} extraBottom={dailyPrefBlock} />

      {/* 最近扫码：扫码购物的「学习闭环」在首页食养区可见，点按跳回商品详情 */}
      {scanChips.length > 0 && (
        <View className="pg-card mx-4 mt-4 p-4 rounded-2xl">
          <SectionHeader
            emoji="📷"
            title="最近扫码"
            action={{ label: '去扫码 ›', onClick: () => scanAndRoute() }}
          />
          <ScrollView scrollX className="whitespace-nowrap mt-2">
            {scanChips.map((h) => {
              const pid = (h.parsed?.product_id as string) || ''
              const pname = (h.parsed?.product_name as string) || h.raw_text || '扫码商品'
              return (
                <View
                  key={h.id}
                  hoverClass="none"
                  onClick={() => pid && Taro.navigateTo({ url: `/pages/product/index?id=${pid}` })}
                  className="rounded-xl border border-border bg-card px-3 py-2"
                  style={{ display: 'inline-block', maxWidth: 160, marginRight: 12, verticalAlign: 'top' }}
                >
                  <Text className="text-sm text-foreground" numberOfLines={2}>{pname}</Text>
                </View>
              )
            })}
          </ScrollView>
        </View>
      )}

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

      {/* ===================== L4（续）千人千面场景层：懂你和家人的需求 ===================== */}
      {(personalLine || sceneCaps.length > 0) && (
        <View className="mx-4 mt-5">
          {/* 个性化 banner：基于食养画像 / 过敏原红线，一行说明为你定制 */}
          {personalLine && (
            <View className="rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2" style={{ background: 'hsl(var(--primary) / 0.08)' }}>
              <Text style={{ fontSize: 15 }}>🌿</Text>
              <Text className="text-sm font-medium text-foreground" style={{ lineHeight: 1.4 }}>{personalLine}</Text>
            </View>
          )}
          {/* 动态场景胶囊：按画像自动浮现 2-4 个高相关场景，点按直达对应食养频道 */}
          {sceneCaps.length > 0 && (
            <View className="flex items-center gap-2 overflow-x-auto pb-1">
              {sceneCaps.map((cap) => (
                <View
                  key={cap.scene}
                  className="flex-shrink-0 rounded-full px-3.5 py-2 bg-card border border-border flex items-center gap-1.5 active:scale-95 transition-transform"
                  hoverClass="none"
                  onClick={() => Taro.navigateTo({ url: `/pages/food/need-find/index?scene=${cap.scene}` })}
                >
                  <Text style={{ fontSize: 15 }}>{cap.emoji}</Text>
                  <Text className="text-sm font-semibold text-foreground">{cap.label}</Text>
                </View>
              ))}
              {/* 食养中心总入口已收口至下方 L4 大卡片（唯一入口），L2 金刚区不再放食养中心，避免与 L4 重复 */}
            </View>
          )}
        </View>
      )}

      {/* ===================== 好物动态（社会证明：全站脱敏实时下单，公告已上移至顶部条+铃铛） ===================== */}
      {homeFeed.length > 0 && (
        <View id="home-feed" className="mx-4 mt-5 notice-pill">
          <Text className="text-base">🛒</Text>
          <Text className="text-sm text-foreground flex-1 truncate">{homeFeed[annIdx]?.text}</Text>
        </View>
      )}

      {/* ===================== L5 为你精选：分类金刚区 + 商品流（主力内容） ===================== */}
      {!hasQuery && (
        <View className="mt-5 px-4">
          <SectionHeader emoji="🍱" title="为你精选" subtitle="懂身体的好物，挑挑看" />

          {/* 顶部分类筛选 sticky 条：统一筛选心智（替代原首屏金刚区），吸顶常驻 */}
          <View
            className="home-cat-sticky"
            style={{ position: 'sticky', top: 0, zIndex: 20, background: 'hsl(var(--background))' }}
          >
            <ScrollView scrollX showScrollbar={false}>
              <View className="flex items-center gap-2 py-2">
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

            {/* 推荐/最新 排序切换：推荐=均衡热度榜（服务端综合分），最新=上架时间倒序 */}
            <View
              className="flex items-center rounded-full flex-shrink-0 overflow-hidden"
              style={{ borderWidth: 1, borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
            >
              {(['latest', 'hot'] as const).map((s) => {
                const active = feedSort === s
                return (
                  <View
                    key={s}
                    hoverClass="none"
                    onClick={() => setFeedSort(s)}
                    className="px-3 py-1.5 text-sm"
                    style={{
                      background: active ? 'hsl(var(--primary))' : 'transparent',
                      color: active ? '#fff' : 'hsl(var(--muted-foreground))',
                      fontWeight: active ? 'bold' : 'normal',
                    }}
                  >
                    <Text>{s === 'hot' ? '🔥 推荐' : '🆕 最新'}</Text>
                  </View>
                )
              })}
            </View>

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
            </ScrollView>
          </View>

          {loading && feedItems.length === 0 ? (
            <View style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} className="bg-card rounded-xl border border-border animate-pulse" style={{ width: '48%', height: 200, marginBottom: 12 }} />
              ))}
            </View>
          ) : sortedFeed.length > 0 ? (
            <View style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {sortedFeed.map((f) => (
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
                  查看全部商品
                </Button>
              )}
            </View>
          )}
        </View>
      )}

      {/* 红包/实物领取弹窗 */}
      {showCampaignPopup && campaignList.length > 0 && (
        <View className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
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
                          ? `¥${campaign.gift_value} 门店福利金`
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

      {/* 扫码识别 · 技术壁垒弹窗：突出自研数据库区别于通用 AI */}
      {showScanMoat && (
        <View className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View className="w-10/12 max-h-4/5 bg-card rounded-3xl p-6 overflow-y-auto">
            <Text className="text-2xl font-bold text-foreground block mb-4">🔬 配料识别 · 你的私人食养安全官</Text>
            <Text className="text-base text-muted-foreground leading-relaxed block mb-3">自建十万级零食配料数据库，区别通用 AI。</Text>
            <Text className="text-base text-muted-foreground leading-relaxed block mb-3">数据库持续迭代食疗搭配算法，扫码即知配料风险与体质适配度。</Text>
            <Text className="text-base text-muted-foreground leading-relaxed block mb-6">可保存个人饮食档案，越用越懂你。</Text>
            <View
              className="w-full py-3 rounded-2xl text-center text-white text-xl font-bold"
              style={{ background: 'hsl(var(--primary))' }}
              hoverClass="none"
              onClick={() => { setShowScanMoat(false); Taro.navigateTo({ url: '/pages/food/food-scan/index' }) }}
            >
              开始扫描
            </View>
            <View
              className="w-full py-3 rounded-2xl text-center text-muted-foreground text-base mt-3"
              hoverClass="none"
              onClick={() => setShowScanMoat(false)}
            >
              暂不需要
            </View>
          </View>
        </View>
      )}

      {/* 扫码入口已合并为上方首屏强曝光 CTA 带（📷扫码），避免首页多处扫码重复 */}

      {/* 首页：右下角停靠咨询入口（食养咨询（主）/ 客服），全站统一 bottom-right */}
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
  if (n.includes('微温') || n.includes('温热')) return '#6B4423'
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
