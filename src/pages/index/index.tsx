// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline, useRouter } from '@tarojs/taro'
import { Image, Input, View, Text, ScrollView } from '@tarojs/components'
import { getProducts, getAnnouncements, getOrderFeed, getOrders, getProductsByIds } from '@/db/api'
import { getUserHealthProfile } from '@/db/food-api'
import type { Product, Announcement, OrderFeedItem, UserHealthProfile } from '@/db/types'
import StoreStrip from '@/components/StoreStrip'
import { type ScoredProduct } from '@/utils/emotionEngine'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { parseCrowdsFromText, classifyProduct as classifyOne, toFoodTherapyInput, QUICK_BODY_PRESETS, profileToCrowds, FOOD_CATEGORIES, type Crowd, type FitTier } from '@/utils/food-therapy'
import { analyzeConsumption, recommendByConsumption, type ConsumptionProfile } from '@/utils/consumption-profile'
import CustomTabBar from '@/components/custom-tabbar'
import Icon from '@/components/Icon'
import ProductGridCard from '@/components/ProductGridCard'
import { getProductCareInfo } from '@/utils/product-care'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import { useFoodKnowledgeStore } from '@/store/foodKnowledgeStore'
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

export default function IndexPage() {
  const { profile } = useAuth()
  const { currentCity, currentStore, nearbyStores, setStore, loading: locationLoading, detectLocation } = useLocation()
  const { selectedCrowds, toggleCrowd, clearFilters } = useFoodTherapy()
  const myRef = profile?.referral_code || ''
  // 记录当前要分享的商品，供 useShareAppMessage 闭包读取
  const shareProductRef = useRef<{ id: string; name: string; imageUrl: string } | null>(null)

  const [mood, setMood] = useState('')
  // 首页分类金刚区：本地筛选主商品流（不影响画像/即时匹配区块）
  const [catFilter, setCatFilter] = useState<string | null>(null)
  // 状态卡「你关注的食养偏好」默认折叠，降低首屏高度
  const [showBodyStates, setShowBodyStates] = useState(false)
  // 状态卡默认收起为「一行胶囊」，点击才展开输入（去头重脚轻）
  const [inputExpanded, setInputExpanded] = useState(false)
  const [feedItems, setFeedItems] = useState<ScoredProduct<Product>[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [orderFeed, setOrderFeed] = useState<OrderFeedItem[]>([])
  const [annIdx, setAnnIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 首页食养工具入口：知识图谱已收录成分数 + 当前节气名
  const knowledgeCount = useFoodKnowledgeStore((s) => Object.keys(s.collected).length)
  const seasonalTerm = getCurrentTerm()
  const termName = seasonalTerm?.name || '当季'

  // 自然语言 → 身体状态人群：自动识别后高亮对应 chip（与手动选择并存）
  const [detectedCrowds, setDetectedCrowds] = useState<Crowd[]>([])
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
  
  // 新增：首页弹窗状态
  const [showCampaignPopup, setShowCampaignPopup] = useState(false)
  const [campaignList, setCampaignList] = useState<any[]>([])
  // 同会话仅弹一次，避免反复打扰；结合下面「可发放库存」过滤，无福利绝不弹出
  const campaignPopupShownRef = useRef(false)
  const [loadingCampaign, setLoadingCampaign] = useState(false)
  // 门店红包对应的门店名（用于在首页弹窗标注「XX店专享」）
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({})

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

  // 首页启动时自动获取定位；若附近门店尚未解析（如城市已缓存但首次无附近列表），一并定位解析
  useEffect(() => {
    if (!currentCity || nearbyStores.length === 0) {
      detectLocation()
    }
  }, [currentCity, nearbyStores.length, detectLocation])

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

  // 加载 Feed（默认展示全量商品；食养分档由前端 classifyProductList 处理，情绪不再参与前台）
  // 防重入：并发的 loadFeed（useEffect 挂载 + useDidShow 切回 tab）只跑一次网络请求，
  // 避免首页 Feed 双拉取导致的列表重渲染/重影（与购物车页同源修复）
  const feedInflightRef = useRef<Promise<void> | null>(null)
  const loadFeed = useCallback(async () => {
    if (feedInflightRef.current) return feedInflightRef.current
    feedInflightRef.current = (async () => {
      try {
        setLoading(true)
        const raw = await getProducts({ limit: 30, platformFilter: 'only' })
        setFeedItems(raw.map(p => ({ product: p, matchScore: 1, matchLabel: null })))
      } finally {
        setLoading(false)
        feedInflightRef.current = null
      }
    })()
    return feedInflightRef.current
  }, [])

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
      const orders = await getOrders(undefined, 0, 50)
      const ids: string[] = []
      for (const o of orders) {
        for (const it of (o.order_items || [])) {
          if (it.product_id) ids.push(it.product_id)
        }
      }
      const uniq = Array.from(new Set(ids))
      if (uniq.length === 0) {
        setConsumptionProfile({ hasData: false, boughtCount: 0, topHealthTags: [], naturePref: null })
        return
      }
      const bought = await getProductsByIds(uniq)
      const prof = analyzeConsumption(bought)
      setBoughtIds(new Set(uniq))
      setConsumptionProfile(prof)
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

  // 底部 Feed 展示列表：有查询时直接展示「即时匹配」结果；无查询时展示默认推荐，并排除已出现在个性化插卡里的好物（去重）+ 叠加分类金刚区筛选
  const displayFeed = useMemo<ScoredProduct<Product>[]>(() => {
    if (hasQuery && matchItems.length > 0) {
      return matchItems.map(m => ({
        product: m.product,
        matchScore: m.tier === 'recommend' ? 9 : m.tier === 'caution' ? 4 : 1,
        matchLabel: m.tier === 'recommend' ? '五星推荐' : m.tier === 'caution' ? '谨慎食用' : null,
      }))
    }
    const hideIds = new Set(personalizedItems.map((p) => p.id))
    return feedItems.filter((f) => {
      if (hideIds.has(f.product.id)) return false
      if (catFilter && (f.product.food_category || '') !== catFilter) return false
      return true
    })
  }, [hasQuery, matchItems, feedItems, personalizedItems, catFilter])

  // 安全取商品关怀层（食养注解），避免单条异常影响整页渲染
  const careOf = (p: Product) => {
    try { return getProductCareInfo(p) } catch { return null }
  }
  
  const checkCampaign = useCallback(async () => {
    if (!currentCity?.id) return

    setLoadingCampaign(true)
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
        setLoadingCampaign(false)
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
        // 红包不再进首页自动强弹：改为内容流常驻入口卡片，用户主动点击才展开（campaignPopupShownRef 保留无害）
      }
    } catch (err) {
      console.error('[Index] 检查活动失败', err)
    }
    setLoadingCampaign(false)
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
    setDetectedCrowds(detected)
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
    <View className="min-h-screen bg-background tabbar-pad">

      {/* ===== 新版 Hero：品牌锚点 + 定位弱化 + 搜索/扫码合一 ===== */}
      <View className="mx-4 mt-4 pg-hero p-4 rounded-2xl">
        <View className="flex items-center justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-foreground leading-tight">来电有喜</Text>
            <Text className="text-sm text-muted-foreground block mt-0.5">懂身体的好物</Text>
          </View>
          <View
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-card border border-border flex-shrink-0 active:scale-95 transition-transform"
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: '/pages/mine/city-select/index' })}
          >
            <Icon name="crosshairs-gps" size={16} className="text-primary" />
            {locationLoading && <Icon name="loading" size={14} className="text-primary animate-spin" />}
            <Text className="text-xs text-foreground truncate" style={{ maxWidth: 72 }}>{locationLoading ? '定位中' : (currentCity?.city_name || '选择城市')}</Text>
          </View>
        </View>

      {/* 唯一扫码入口：扫码查安全（合并原“搜索/扫码合一”+ 悬浮FAB 两处重复为单一核心主张） */}
      <View
        className="mx-4 mt-3 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
        style={{ background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, #F59E0B 100%)' }}
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
      {/* hero 容器闭合：扫码入口卡位于 hero 内，下方食养工具区为独立模块 */}
      </View>

      {/* 食养工具 · 首页统一入口（知识图谱 + 节气食盒，原仅置于扫码页底部，现提至首页） */}
      <View className="mx-4 mt-4 flex items-center justify-between">
        <Text className="text-sm font-bold text-foreground">食养工具</Text>
        <Text className="text-xs text-muted-foreground">扫码自动收录 · 顺时而食</Text>
      </View>
      <View className="mx-4 mt-2 grid grid-cols-2 gap-3">
        {/* 知识图谱 */}
        <View
          className="rounded-2xl p-3 active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', boxShadow: '0 2px 12px rgba(22,163,74,0.12)' }}
          hoverClass="none"
          onClick={() => Taro.navigateTo({ url: '/pages/food/knowledge-atlas/index' })}
        >
          <Text className="text-lg">🧭</Text>
          <Text className="text-sm font-bold text-[#16A34A] block mt-1">食安知识图谱</Text>
          <Text className="text-[11px] text-[#16A34A] mt-1 opacity-70" style={{ lineHeight: 1.4 }}>
            {knowledgeCount === 0 ? '扫配料发现新成分' : `已收录 ${knowledgeCount} 种`}
          </Text>
        </View>
        {/* 节气食盒 */}
        <View
          className="rounded-2xl p-3 active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', boxShadow: '0 2px 12px rgba(217,119,6,0.12)' }}
          hoverClass="none"
          onClick={() => Taro.navigateTo({ url: '/pages/food/seasonal-box/index' })}
        >
          <Text className="text-lg">🌾</Text>
          <Text className="text-sm font-bold text-[#B45309] block mt-1">节气食盒</Text>
          <Text className="text-[11px] text-[#B45309] mt-1 opacity-70" style={{ lineHeight: 1.4 }}>
            当前{termName} · 顺时而食
          </Text>
        </View>
      </View>

      {/* ===== 附近门店推荐：基于定位推荐最近自营门店，可一键切换 ===== */}
      {nearbyStores.length > 0 ? (
        <View className="mx-4 mt-4 pg-card p-4">
          <View className="flex items-center justify-between mb-3">
            <View className="flex items-center gap-2">
              <View className="section-accent" />
              <Text className="text-xl font-bold text-foreground">附近的门店</Text>
            </View>
          </View>
          <ScrollView scrollX showScrollbar={false}>
            <View className="flex flex-row gap-2 pr-3" style={{ display: 'flex', flexDirection: 'row' }}>
              {nearbyStores.slice(0, 6).map((s) => {
                const active = currentStore?.id === s.id
                return (
                  <View
                    key={s.id}
                    hoverClass="none"
                    onClick={() => {
                      setStore(s)
                      Taro.showToast({ title: `已切换到${s.store_name}`, icon: 'none' })
                    }}
                    style={{
                      width: 140,
                      flexShrink: 0,
                      borderRadius: 16,
                      padding: 12,
                      background: active ? 'hsl(var(--primary) / 0.10)' : 'hsl(var(--card))',
                      borderWidth: 1,
                      borderColor: active ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border))',
                    }}
                  >
                    <View className="flex items-center justify-between">
                      <Text className="text-base font-bold text-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 92 }}>{s.store_name}</Text>
                      {active && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, background: 'hsl(var(--primary))', flexShrink: 0 }}>
                          <Text className="text-xs text-white font-bold">当前</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-xs text-muted-foreground mt-1 block">{s.distance_km} km · {s.is_open === false ? '休息中' : '营业中'}</Text>
                  </View>
                )
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* 金刚区已迁移至商品流顶部 sticky 分类条（见下方「为你精选」区块） */}

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
          <View className="flex items-center justify-between mb-2">
            <Text className="text-xl font-bold text-foreground flex-1 min-w-0" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              为「{matchLabel}」匹配到 {matchItems.length} 件好物 🔥
            </Text>
            <View className="flex items-center gap-1 text-primary text-xl ml-2 flex-shrink-0" onClick={() => Taro.pageScrollTo({ scrollTop: 99999, duration: 300 })} hoverClass="none">
              <Text>看全部</Text>
              <Icon name="arrow-down" size={20} />
            </View>
          </View>

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
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })} />
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

      {/* 个性化插卡：有画像→体质挑好物，否则→常买好物；仅 1 条，且已与主 Feed 去重 */}
      {!hasQuery && personalizedItems.length > 0 && (
        <View className="mt-4 px-4">
          <View className="flex items-center gap-2 mb-1">
            <View className="section-accent" />
            <Text className="text-2xl font-bold text-foreground">{personalizedTitle}</Text>
          </View>
          <Text className="text-base text-muted-foreground block mb-3">
            {profileItems.length > 0
              ? `按你关注的食养偏好食养适配 · ${FOOD_THERAPY_DISCLAIMER}`
              : '读懂你的口味，挑出同样懂身体的好物'}
          </Text>
          <View style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {personalizedItems.slice(0, 6).map((product) => (
              <ProductGridCard key={product.id} id={product.id} name={product.name} price={product.price}
                imageUrl={product.main_image || product.image_url || ''} storeName={product.store_name}
                care={careOf(product)}
                onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })} />
            ))}
          </View>
        </View>
      )}

      {/* 公告栏 / 好物动态：官方公告 + 全站实时下单（脱敏）合并轮播 */}
      {homeFeed.length > 0 && (
        <View id="home-feed" className="mx-4 mt-4 notice-pill">
          <Text className="text-base">{homeFeed[annIdx]?.type === 'order' ? '🛒' : '📢'}</Text>
          <Text className="text-sm text-foreground flex-1 truncate">{homeFeed[annIdx]?.text}</Text>
        </View>
      )}

      {/* 限时福利入口：常驻可见，用户主动点击才展开，不再进首页 3s 强弹打断 */}
      {campaignList.length > 0 && !showCampaignPopup && (
        <View
          className="mx-4 mt-4 p-4 rounded-2xl pg-card flex items-center justify-between"
          hoverClass="none"
          onClick={() => setShowCampaignPopup(true)}
        >
          <View className="flex items-center gap-2 flex-1 min-w-0">
            <Text className="text-2xl">🎁</Text>
            <View className="flex-1 min-w-0">
              <Text className="text-base font-bold text-foreground block" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                限时福利 · {campaignList[0]?.campaign_name}
              </Text>
              <Text className="text-xs text-muted-foreground block truncate">
                {(campaignList[0]?.store_id && storeNameMap[campaignList[0].store_id])
                  ? `${storeNameMap[campaignList[0].store_id]} 专享`
                  : '领取红包/实物，绑定专属门店优惠'}
              </Text>
            </View>
          </View>
          <View className="ml-3 px-3 py-1.5 rounded-full bg-primary text-white text-sm font-bold flex-shrink-0">领取</View>
        </View>
      )}

      {/* 默认商品流：非查询态展示主池（已排除个性化插卡 + 叠加分类筛选）；两列网格瀑布 */}
      {!hasQuery && (
        <View className="mt-4 px-4">
          <View className="flex items-center gap-2 mb-1">
            <View className="section-accent" />
            <Text className="text-2xl font-bold text-foreground">为你精选{catFilter ? ` · ${catFilter}` : ''}</Text>
          </View>
          <Text className="text-base text-muted-foreground block mb-2">
            懂身体的好物，挑挑看
          </Text>
          <Text className="text-xs text-muted-foreground block mb-2">{FOOD_THERAPY_DISCLAIMER}</Text>

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
                  imageUrl={f.product.main_image || f.product.image_url || ''} storeName={f.product.store_name}
                  care={careOf(f.product)}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${f.product.id}` })} />
              ))}
            </View>
          ) : (
            <Text className="text-base text-muted-foreground">该分类暂无好物，换个分类看看～</Text>
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
      {/* 自定义底部导航：独立渲染（贴底全宽），不可嵌套在 FAB 容器内，否则购物车徽标在真机渲染异常 */}
      <CustomTabBar />
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
function FitCard({ product, onTap, tier }: { product: Product; onTap: () => void; tier?: FitTier }) {
  const [imgFailed, setImgFailed] = useState(false)
  const care = useMemo(() => {
    try { return getProductCareInfo(product) } catch { return null }
  }, [product])
  const tierBadge = tier === 'recommend'
    ? { text: '五星推荐', bg: '#16A34A', fg: '#FFFFFF' }
    : tier === 'caution'
      ? { text: '谨慎食用', bg: '#C77B47', fg: '#FFFFFF' }
      : null
  const dot = natureDotColor(care?.nature)
  const healthTag = care?.healthTags?.[0]
  const hasCare = !!dot || !!healthTag || (care?.conflictCount ?? 0) > 0
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
        </View>
        {hasCare && (
          <View className="flex items-center gap-1 mt-1.5 flex-wrap">
            {dot && (
              <View style={{ width: 6, height: 6, borderRadius: 9999, background: dot, flexShrink: 0 }} />
            )}
            {healthTag && (
              <Text style={{ fontSize: 10, lineHeight: '14px', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, background: 'rgba(194,65,12,0.12)', color: '#C2410C' }}>{healthTag}</Text>
            )}
            {care && care.conflictCount > 0 && (
              <Text style={{ fontSize: 10, lineHeight: '14px', fontWeight: 'bold', color: '#C77B47' }}>⚠{care.conflictCount}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  )
}
