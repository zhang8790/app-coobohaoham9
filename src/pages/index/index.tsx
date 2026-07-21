// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline, useRouter } from '@tarojs/taro'
import { Image, Input, View, Text, ScrollView } from '@tarojs/components'
import { getProductsByEmotion, getProducts, getAnnouncements, getOrderFeed, addToCart, getOrders, getProductsByIds } from '@/db/api'
import type { Product, Announcement, OrderFeedItem } from '@/db/types'
import StoreStrip from '@/components/StoreStrip'
import {
  analyzeEmotion, rankProductsByEmotion, getEmotionPoetry,
  QUICK_MOOD_PRESETS, type ScoredProduct, type EmotionAnalysisResult
} from '@/utils/emotionEngine'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { parseCrowdsFromText, classifyProduct as classifyOne, toFoodTherapyInput, QUICK_BODY_PRESETS, type Crowd, type FitTier } from '@/utils/food-therapy'
import { analyzeConsumption, recommendByConsumption, type ConsumptionProfile } from '@/utils/consumption-profile'
import ProductGridCard from '@/components/ProductGridCard'
import CustomTabBar from '@/components/custom-tabbar'
import Icon from '@/components/Icon'
import RankProgress from '@/components/RankProgress'
import BeanHud from '@/components/BeanHud'
import { getProductCareInfo, type ProductCareInfo } from '@/utils/product-care'

// 关怀导览 · 子菜单（均跳真实 tab 页，鼓励多逛多看）
const CARE_NAV = [
  { label: '自营甄选', emoji: '🛒', to: '/pages/explore/index' },
  { label: '品牌馆', emoji: '🏯', to: '/pages/reward-shop/index' },
  { label: '行囊好物', emoji: '🎒', to: '/pages/cart/index' },
  { label: '我的关怀', emoji: '🌿', to: '/pages/user/index' },
]

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

// 组合"识别到的标签"作为即时匹配标题
function buildMatchLabel(emotionTags: string[], crowds: Crowd[]): string {
  const parts: string[] = []
  if (crowds.length) parts.push(...crowds)
  if (emotionTags.length) parts.push(...emotionTags.slice(0, 3))
  return parts.join(' · ') || '好物'
}

export default function IndexPage() {
  const { profile } = useAuth()
  const { currentCity, loading: locationLoading, detectLocation } = useLocation()
  const { selectedCrowds, toggleCrowd, clearFilters } = useFoodTherapy()
  const myRef = profile?.referral_code || ''
  // 记录当前要分享的商品，供 useShareAppMessage 闭包读取
  const shareProductRef = useRef<{ id: string; name: string; imageUrl: string } | null>(null)

  const [mood, setMood] = useState('')
  const [analysis, setAnalysis] = useState<EmotionAnalysisResult | null>(null)
  const [ipBubble, setIpBubble] = useState('侠客，今日有喜，好物相候！')
  const [poetry, setPoetry] = useState('')
  const [feedItems, setFeedItems] = useState<ScoredProduct<Product>[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [orderFeed, setOrderFeed] = useState<OrderFeedItem[]>([])
  const [annIdx, setAnnIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [emotionActive, setEmotionActive] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自然语言 → 身体状态人群：自动识别后高亮对应 chip（与手动选择并存）
  const [detectedCrowds, setDetectedCrowds] = useState<Crowd[]>([])
  const autoCrowdsRef = useRef<Crowd[]>([])

  // 消费偏好画像：登录后回溯历史订单 → 聚合食养偏好 → 推荐相似好物
  const [consumptionProfile, setConsumptionProfile] = useState<ConsumptionProfile | null>(null)
  const [boughtIds, setBoughtIds] = useState<Set<string>>(new Set())

  // 即时匹配结果：输入心情/身体状态词后，直接配对出的商品（零额外操作）
  const [matchItems, setMatchItems] = useState<Array<{ product: Product; tier: FitTier | null }>>([])
  const [matchAvoid, setMatchAvoid] = useState(0)
  const [matchLabel, setMatchLabel] = useState('')
  const [matchedLoading, setMatchedLoading] = useState(false)
  const hasQuery = mood.trim().length > 0
  
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
          .then(({ data }) => {
            if (data?.id) {
              Taro.navigateTo({ url: `/pages/store-home/index?id=${data.id}` })
            }
          })
      })
    }
  }, [routeParams])

  // 首页启动时自动获取定位
  useEffect(() => {
    // 如果还没有城市信息，自动获取定位
    if (!currentCity) {
      detectLocation()
    }
  }, [currentCity, detectLocation])

  // 首页分享：若用户点击了某商品的分享按钮则分享该商品，否则分享首页（均携带推广码）
  useShareAppMessage(() => {
    const p = shareProductRef.current
    if (p) return {
      title: `${p.name} · 来电有喜江湖好物`,
      path: `/pages/product/index?id=${encodeURIComponent(p.id)}${myRef ? `&ref=${myRef}` : ''}`,
      imageUrl: p.imageUrl || undefined,
    }
    return {
      title: '来电有喜 · 武侠生活平台，好物相候！',
      path: `/pages/index/index${myRef ? `?ref=${myRef}` : ''}`,
    }
  })
  useShareTimeline(() => ({ title: '来电有喜 · 武侠江湖，有喜相逢' }))

  // 加载首页「江湖动态」：全站实时下单脱敏聚合
  const loadOrderFeed = useCallback(async () => {
    const data = await getOrderFeed(20)
    setOrderFeed(data)
  }, [])

  // 加载公告
  const loadAnnouncements = useCallback(async () => {
    const data = await getAnnouncements()
    setAnnouncements(data)
  }, [])

  // 加载 Feed（默认无情绪时展示全量，有情绪时用情绪查询）
  const loadFeed = useCallback(async (emotionResult?: EmotionAnalysisResult) => {
    setLoading(true)
    let raw: Product[]
    if (emotionResult && emotionResult.detectedTags.length > 0) {
      raw = await getProductsByEmotion(emotionResult.detectedTags, 40, 'only')
    } else {
      raw = await getProducts({ limit: 30, platformFilter: 'only' })
    }
    const scored = rankProductsByEmotion(raw, emotionResult?.tagScores ?? {})
    setFeedItems(scored)
    setLoading(false)
  }, [])

  // 下拉刷新（注：loadOrderFeed/loadAnnouncements/loadFeed 已在上文声明，避免依赖数组 TDZ）
  useEffect(() => {
    const handler = () => {
      loadFeed(analysis)
      loadAnnouncements()
      loadOrderFeed()
      Taro.stopPullDownRefresh()
    }
    // Taro 小程序下拉刷新回调
    ;(Taro as any).onPullDownRefresh = handler
    return () => { ;(Taro as any).onPullDownRefresh = null }
  }, [analysis, loadOrderFeed, loadAnnouncements])

  useEffect(() => { loadAnnouncements(); loadOrderFeed(); loadFeed() }, [loadAnnouncements, loadOrderFeed, loadFeed])
  useDidShow(() => { loadFeed(analysis ?? undefined) })

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
  
  // 新增：首页加载时检查是否有可领取的红包/实物活动
  useEffect(() => {
    checkCampaign()
  }, [currentCity])

  // 底部 Feed 展示列表：有查询时直接展示"即时匹配"结果，无查询时展示默认推荐
  const displayFeed = useMemo<ScoredProduct<Product>[]>(() => {
    if (hasQuery && matchItems.length > 0) {
      return matchItems.map(m => ({
        product: m.product,
        matchScore: m.tier === 'recommend' ? 9 : m.tier === 'caution' ? 4 : 1,
        matchLabel: m.tier === 'recommend' ? '五星推荐' : m.tier === 'caution' ? '谨慎食用' : null,
      }))
    }
    return feedItems
  }, [hasQuery, matchItems, feedItems])

  // 商品「关怀层」信息：复用既有食养引擎，依用户体质/人群个性化适配分档 + 关怀度
  const careCrowds = useMemo<Crowd[]>(
    () => Array.from(new Set<Crowd>([...selectedCrowds, ...detectedCrowds])),
    [selectedCrowds, detectedCrowds],
  )
  const careOf = useMemo(() => {
    const m = new Map<string, ProductCareInfo>()
    for (const f of displayFeed) m.set(f.product.id, getProductCareInfo(f.product, careCrowds))
    return m
  }, [displayFeed, careCrowds])

  // 情绪好物推荐 · 自营甄选（替换原「选个场景」）：优先自营商品，不足则补默认 Feed
  const selfCareProducts = useMemo(() => {
    const self = displayFeed.filter(f => f.product.stores?.is_platform === true)
    const pool = self.length >= 4 ? self : displayFeed
    return pool.slice(0, 6)
  }, [displayFeed])

  // 消费偏好推荐：基于历史订单聚合的食养画像，从当前 Feed 候选池推荐相似好物（排除已购）
  const consumptionItems = useMemo(() => {
    if (!consumptionProfile?.hasData) return []
    return recommendByConsumption(feedItems.map((f) => f.product), consumptionProfile, boughtIds, 12)
  }, [consumptionProfile, feedItems, boughtIds])
  
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
      const activeList = (data || []).filter(c => {
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
        // 同会话仅自动弹一次；若已弹过则不重复打扰
        if (!campaignPopupShownRef.current) {
          campaignPopupShownRef.current = true
          setTimeout(() => setShowCampaignPopup(true), 3000)
        }
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

  // 即时匹配：输入心情文字或身体状态词（或点快捷标签）→ 直接配对商品，全程零额外操作
  // 同时识别「情绪标签」与「身体人群」，两者其一命中即产出配对结果。
  const runMatch = useCallback(async (text: string, explicitCrowds?: Crowd[]) => {
    const emotionResult = analyzeEmotion(text)
    const crowds = explicitCrowds && explicitCrowds.length ? explicitCrowds : parseCrowdsFromText(text)
    const hasEmotion = emotionResult.detectedTags.length > 0
    const hasBody = crowds.length > 0

    // 同步全局人群（供详情页等复用 + 清空重置）
    syncAutoCrowds(crowds)

    setMatchedLoading(true)
    let pool: Product[] = []
    try {
      if (hasEmotion) pool = await getProductsByEmotion(emotionResult.detectedTags, 40, 'only')
      else pool = await getProducts({ limit: 40, platformFilter: 'only' })
    } catch (e) {
      console.error('[Index] 匹配查询失败', e)
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
        // 该身体状态无录入导购字段的商品时，回退到情绪/全量候选
        if (hasEmotion) {
          matched = rankProductsByEmotion(pool, emotionResult.tagScores).filter(s => s.matchScore > 0).map(s => ({ product: s.product, tier: null }))
        } else {
          matched = pool.map(p => ({ product: p, tier: null }))
        }
      }
    } else if (hasEmotion) {
      const scored = rankProductsByEmotion(pool, emotionResult.tagScores)
      matched = scored.filter(s => s.matchScore > 0).map(s => ({ product: s.product, tier: null }))
      if (matched.length === 0) matched = pool.slice(0, 12).map(p => ({ product: p, tier: null }))
    } else {
      matched = pool.slice(0, 12).map(p => ({ product: p, tier: null }))
    }

    setMatchItems(matched)
    setMatchAvoid(avoidCount)
    setMatchLabel(buildMatchLabel(emotionResult.detectedTags, crowds))
    setMatchedLoading(false)
  }, [syncAutoCrowds])

  // 情绪输入实时防抖分析（300ms，更跟手）
  const handleMoodInput = (value: string) => {
    setMood(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!value.trim()) {
      setAnalysis(null)
      setEmotionActive(false)
      setPoetry('')
      setIpBubble('侠客，今日有喜，好物相候！')
      setMatchItems([])
      setMatchAvoid(0)
      setMatchLabel('')
      syncAutoCrowds([])
      loadFeed()
      return
    }
    debounceTimer.current = setTimeout(() => {
      const result = analyzeEmotion(value)
      setAnalysis(result)
      setIpBubble(result.ipBubble)
      setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
      setEmotionActive(result.detectedTags.length > 0)
      // 直接配对商品：心情 + 身体状态词一并识别
      runMatch(value)
    }, 300)
  }

  // 点击快捷情绪词 → 即时配对
  const handleQuickMood = (preset: typeof QUICK_MOOD_PRESETS[number]) => {
    setMood(preset.label)
    const result = analyzeEmotion(preset.label)
    setAnalysis(result)
    setIpBubble(result.ipBubble)
    setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
    setEmotionActive(true)
    Taro.showToast({ title: `${preset.emoji} ${preset.label}`, icon: 'none', duration: 700 })
    runMatch(preset.label)
  }

  // 点击身体状态快捷词 → 即时配对（零额外操作）
  const handleQuickBody = (preset: typeof QUICK_BODY_PRESETS[number]) => {
    setMood(preset.label)
    Taro.showToast({ title: `${preset.emoji} ${preset.label}`, icon: 'none', duration: 700 })
    runMatch(preset.label, preset.crowds)
  }

  // 清空情绪
  const clearEmotion = () => {
    setMood('')
    setAnalysis(null)
    setEmotionActive(false)
    setPoetry('')
    setIpBubble('侠客，今日有喜，好物相候！')
    setMatchItems([])
    setMatchAvoid(0)
    setMatchLabel('')
    syncAutoCrowds([])
    loadFeed()
  }

  const handleAddCart = async (product: Product) => {
    const uid = (await import('@/client/supabase').then(m => m.supabase.auth.getUser())).data.user
    if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.id)
    await addToCart(product.id, product.store_id)
    setAddingId(null)
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  // 有查询时的匹配商品数
  const matchedCount = displayFeed.filter(f => f.matchScore > 0).length

  return (
    <View className="min-h-screen bg-background tabbar-pad">
      {/* 顶部导航：墨韵国潮标题栏 */}
      <View className="sticky top-0 z-10 bg-background px-4 pt-3 pb-2">
        <View className="flex items-center gap-3">
          <View className="flex items-center gap-2 flex-shrink-0">
            <View className="w-9 h-9 rounded-full bg-card border border-primary flex items-center justify-center">
              <Text className="text-primary font-bold text-lg">喜</Text>
            </View>
            <Text className="text-xl font-bold text-foreground">来电有喜</Text>
          </View>
          <View className="flex-1 flex items-center gap-2 bg-card rounded-full px-3 py-2 border border-border"
            onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
            <Icon name="magnify" size={18} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">搜一搜情绪好物</Text>
          </View>
          <View
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-card border border-border flex-shrink-0"
            onClick={() => Taro.navigateTo({ url: '/pages/city-select/index' })}
          >
            <Icon name="location" size={14} color="hsl(var(--primary))" />
            <Text className="text-sm text-foreground">{currentCity?.city_name || '选择'}</Text>
            <Icon name="chevron-down" size={12} className="text-muted-foreground" />
          </View>
        </View>
      </View>

      {/* 会员资产条：金豆 / 佣金（统一货币为金豆，积分已并入金豆，零新增功能） */}
      <BeanHud
        beans={profile?.tb_balance ?? 0}
        commission={profile?.commission_balance ?? 0}
      />

      {/* 段位成长卡：读取现有 member_rank / cv_total，零新增功能 */}
      <RankProgress cvTotal={profile?.cv_total ?? 0} memberRank={profile?.member_rank} />

      {/* IP伴侣气泡 —— 随情绪动态变化 */}
      <View className={`mx-4 mt-4 p-4 rounded-2xl flex items-start gap-3 transition ink-card ${emotionActive ? 'border-primary' : ''}`}>
        <View className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: emotionActive ? '0 0 0 4px rgba(194,65,12,0.15)' : 'none' }}>
          {/* 武侠印章风头像：白字「侠」+ 赭红底，呼应武侠调性，区别于左上角「喜」logo */}
          <Text className="text-white font-bold" style={{ fontSize: '22px', fontFamily: 'KaiTi, STKaiti, serif', lineHeight: '28px' }}>侠</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base text-foreground leading-relaxed">{ipBubble}</Text>
          {/* 情绪强度指示 */}
          {analysis && analysis.intensity !== 'low' && (
            <View className="flex items-center gap-1 mt-1">
              <Text className="text-sm text-muted-foreground">情绪强度</Text>
              {[1, 2, 3].map(i => (
                <View key={i} className="w-3 h-3 rounded-full"
                  style={{ background: i <= (analysis.intensity === 'high' ? 3 : 2) ? 'hsl(var(--primary))' : 'hsl(var(--border))' }} />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* 今日状态卡：情绪 + 体质状况 统一输入，共同驱动下方推荐 */}
      <View className="ink-card mx-4 mt-4 p-4">
        <View className="flex items-center justify-between mb-3">
          <View>
            <Text className="text-lg font-bold text-foreground">今天的状态</Text>
            <Text className="text-sm text-muted-foreground">说说心情，为你智能推荐</Text>
          </View>
          {(emotionActive || selectedCrowds.length > 0) && (
            <View className="flex items-center gap-1 text-primary text-sm" onClick={() => { clearEmotion(); clearFilters() }} hoverClass="none">
              <Icon name="close-circle" size={18} />
              <Text>清空</Text>
            </View>
          )}
        </View>

        {/* 快捷情绪词 —— 使用 Taro 原生 View + 内联样式，确保微信小程序 100% 可点击 */}
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '8px', marginBottom: '12px' }}>
          {QUICK_MOOD_PRESETS.map((preset) => {
            const isActive = mood === preset.label
            return (
              <View
                key={preset.label}
                hoverClass="none"
                onClick={() => {
                  // 立即反馈
                  Taro.showToast({ title: `${preset.emoji} ${preset.label}`, icon: 'none', duration: 800 })
                  console.log('[Mood] handleQuickMood start:', preset.label)
                  try {
                    setMood(preset.label)
                    const result = analyzeEmotion(preset.label)
                    console.log('[Mood] analyzeEmotion result:', result)
                    setAnalysis(result)
                    setIpBubble(result.ipBubble)
                    setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
                    setEmotionActive(true)
                    loadFeed(result)
                    console.log('[Mood] handleQuickMood done')
                  } catch (err) {
                    console.error('[Mood] error:', err)
                    Taro.showToast({ title: `错误: ${String(err)}`, icon: 'none', duration: 3000 })
                  }
                }}
                className={`symptom-tag ${isActive ? 'symptom-tag-active' : ''}`}
              >
                <Text className="text-base">{preset.emoji}</Text>
                <Text className={`text-sm ${isActive ? 'text-white font-bold' : 'text-foreground'}`}>{preset.label}</Text>
              </View>
            )
          })}
        </View>

        {/* 身体状态快捷词 —— 一键直接配对商品（零额外操作） */}
        <View className="mt-3">
          <Text className="text-sm text-muted-foreground mb-2 block">身体状态（点一下，直接配对）</Text>
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

        {/* 输入框 */}
        <View className="flex items-center gap-2">
          <View className="flex-1 border-2 rounded-2xl px-4 py-3 bg-white transition"
            style={{ borderColor: emotionActive ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}>
            <Input className="w-full text-base text-foreground bg-transparent outline-none"
              placeholder="说说心情，自动为你配对好物…"
              value={mood}
              onInput={(e) => { const ev = e as any; handleMoodInput(ev.detail?.value ?? ev.target?.value ?? '') }} />
          </View>
          {loading && <Icon name="loading" size={24} className="text-primary animate-spin flex-shrink-0" />}
        </View>

        {/* 情绪分析结果 —— 识别到的标签 */}
        {analysis && analysis.detectedTags.length > 0 && (
          <View className="mt-3">
            <View className="flex items-center gap-2 mb-2">
              <Icon name="tag-multiple" size={18} className="text-primary" />
              <Text className="text-sm text-muted-foreground">识别到情绪：</Text>
            </View>
            <View className="flex flex-wrap gap-2">
              {analysis.detectedTags.map(tag => (
                <Text key={tag} className="px-3 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20">
                  #{tag}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* 武侠诗意翻译 */}
        {poetry && (
          <View className="mt-3 p-3 bg-white rounded-xl border border-border">
            <Text className="text-base text-secondary leading-relaxed italic">「{poetry}」</Text>
            <View className="flex items-center justify-between mt-2">
              {emotionActive && matchedCount > 0 && (
                <Text className="text-sm text-primary font-bold">已为你筛选 {matchedCount} 件好物 ↓</Text>
              )}
              <View onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
                className="flex items-center gap-1 text-primary text-sm ml-auto">
                <Text>去自营</Text>
                <Icon name="arrow-right" size={18} />
              </View>
            </View>
          </View>
        )}

        <Text className="text-xs text-muted-foreground mt-3">食养参考 · 不替代医嘱</Text>
      </View>

      {/* 即时匹配：输入/选择后直接展示配对好物，零额外操作（紧跟输入框，无需滚动） */}
      {hasQuery && (
        <View className="ink-card mx-4 mt-4 p-4 rounded-2xl">
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
            <Text className="text-xs text-muted-foreground mt-1">另有 {matchAvoid} 件建议避开（食养参考 · 不替代医嘱）</Text>
          )}
        </View>
      )}

      {/* 公告栏 / 江湖动态：官方公告 + 全站实时下单（脱敏）合并轮播 */}
      {homeFeed.length > 0 && (
        <View className="mx-4 mt-4 notice-pill">
          <Text className="text-base">{homeFeed[annIdx]?.type === 'order' ? '🛒' : '📢'}</Text>
          <Text className="text-sm text-foreground flex-1 truncate">{homeFeed[annIdx]?.text}</Text>
        </View>
      )}

      {/* 关怀导览 · 子菜单：让人多逛多看，处处是「在关心你」的入口 */}
      <View className="mt-4 px-4">
        <View className="flex items-center gap-2 mb-2">
          <View className="section-accent" />
          <Text className="text-base font-bold text-foreground">关怀导览</Text>
          <Text className="text-xs text-muted-foreground">替你读懂食材，照看身体</Text>
        </View>
        <View className="flex gap-2 overflow-x-auto pb-1">
          {CARE_NAV.map(n => (
            <View key={n.label}
              className="care-nav flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-card border border-border"
              hoverClass="care-nav-hover"
              onClick={() => Taro.switchTab({ url: n.to })}>
              <Text className="text-lg leading-none">{n.emoji}</Text>
              <Text className="text-sm text-foreground font-medium">{n.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 注：体质状况 / 场景 输入已并入上方「今天的状态」卡片，匹配结果由上方「即时匹配」条 + 底部 Feed 直接呈现 */}

      {/* 消费偏好推荐：基于历史订单聚合的食养画像，为你精选相似方向好物 */}
      {consumptionItems.length > 0 && (
        <View className="mt-4 px-4">
          <View className="flex items-center gap-2 mb-1">
            <View className="section-accent" />
            <Text className="text-2xl font-bold text-foreground">根据你的常买好物</Text>
          </View>
          <Text className="text-base text-muted-foreground block mb-3">
            读懂你的口味，挑出同样懂身体的好物 · 食养参考不替代医嘱
          </Text>
          {consumptionProfile && consumptionProfile.topHealthTags.length > 0 && (
            <View className="flex gap-2 flex-wrap mb-3">
              {consumptionProfile.topHealthTags.map((ht) => (
                <Text key={ht.tag}
                  className="px-2.5 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20">
                  {ht.tag}
                </Text>
              ))}
            </View>
          )}
          <View className="flex gap-3 overflow-x-auto pb-1">
            {consumptionItems.map((product) => (
              <FitCard key={product.id} product={product}
                onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })} />
            ))}
            </View>
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
                        url: `/pages/campaign-claim/index?campaignId=${campaign.id}`
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

      {/* 情绪好物推荐 · 自营甄选（替换原「选个场景」） */}
      <View className="mt-4 px-4">
        <View className="flex items-center justify-between mb-3">
          <View className="flex items-center gap-2">
            <View className="section-accent" />
            <View>
              <Text className="text-xl font-bold text-foreground">情绪好物推荐</Text>
              <Text className="text-xs text-muted-foreground block mt-0.5">自营甄选 · 替你读懂食材，照看身体</Text>
            </View>
          </View>
          <Text className="text-sm text-primary" onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}>查看全部</Text>
        </View>

        {selfCareProducts.length > 0 ? (
          <View className="flex flex-wrap justify-between">
            {selfCareProducts.map(item => (
              <View
                key={item.product.id}
                style={{ width: '31.5%', flexShrink: 0 }}
              >
                <ProductGridCard
                  width="100%"
                  imageRatio="4:3"
                  id={item.product.id}
                  name={item.product.name}
                  price={item.product.price}
                  imageUrl={item.product.image_url}
                  originalPrice={item.product.original_price}
                  moodTags={item.product.mood_tags}
                  care={careOf.get(item.product.id) ?? null}
                  onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${item.product.id}` })}
                  onAddCart={() => handleAddCart(item.product)}
                  adding={addingId === item.product.id}
                  onShare={() => { shareProductRef.current = { id: item.product.id, name: item.product.name, imageUrl: item.product.image_url || '' } }}
                />
              </View>
            ))}
          </View>
        ) : (
          <View className="flex items-center justify-center py-8">
            <Text className="text-base text-muted-foreground">自营甄选筹备中，更多好物即将上架～</Text>
          </View>
        )}
      </View>


      {/* 悬浮按钮组：右下角 FAB，扫码为主行动（赭红大圆），创作/游记为次级胶囊 */}
      <View className="fixed bottom-24 right-3 flex flex-col items-end gap-2.5 z-50">
        {/* 创作（次级） */}
        <View className="flex items-center gap-2" onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })} hoverClass="none">
          <View className="px-3 py-1.5 rounded-full bg-card/95 text-foreground text-sm font-medium border border-border"
            style={{ boxShadow: '0 4px 14px rgba(44,36,32,0.10)' }}>
            <Text className="text-sm text-foreground">创作</Text>
          </View>
          <View className="w-9 h-9 rounded-full bg-card flex items-center justify-center border border-border"
            style={{ boxShadow: '0 4px 14px rgba(44,36,32,0.10)' }}>
            <Icon name="pencil" size={18} className="text-foreground" />
          </View>
        </View>
        {/* UGC 游记（次级） */}
        <View className="flex items-center gap-2" onClick={() => Taro.navigateTo({ url: '/pages/ugc-publish/index' })} hoverClass="none">
          <View className="px-3 py-1.5 rounded-full bg-card/95 text-foreground text-sm font-medium border border-border"
            style={{ boxShadow: '0 4px 14px rgba(44,36,32,0.10)' }}>
            <Text className="text-sm text-foreground">游记</Text>
          </View>
          <View className="w-9 h-9 rounded-full bg-card flex items-center justify-center border border-border"
            style={{ boxShadow: '0 4px 14px rgba(44,36,32,0.10)' }}>
            <Icon name="camera" size={18} className="text-foreground" />
          </View>
        </View>
        {/* 扫码购物（主行动，赭红大圆 + 强光晕） */}
        <View className="flex items-center gap-2" onClick={() => {
            Taro.scanCode({
              scanType: ['barCode', 'qrCode'],
              success: (res) => {
                Taro.navigateTo({ url: `/pages/scan-result/index?code=${encodeURIComponent(res.result)}` })
              },
              fail: () => {},
            })
          }} hoverClass="none">
          <View className="px-3 py-1.5 rounded-full bg-primary text-white text-sm font-semibold"
            style={{ boxShadow: '0 4px 14px rgba(194,65,12,0.30)' }}>
            <Text className="text-sm text-white">扫码</Text>
          </View>
          <View className="w-12 h-12 rounded-full bg-primary flex items-center justify-center"
            style={{ boxShadow: '0 6px 20px rgba(194,65,12,0.45)' }}>
            <Icon name="barcode-scan" size={24} className="text-white" />
          </View>
        </View>
      </View>
      {/* 自定义底部导航：独立渲染（贴底全宽），不可嵌套在 FAB 容器内，否则行囊徽标在真机渲染异常 */}
      <CustomTabBar />
    </View>
  )
}

// FeedCard 已迁移至共享组件 @/components/ProductGridCard（两列网格，首页/自营页统一）

// ====== 智能推荐商品卡（支持身体状态分档角标） ======
function FitCard({ product, onTap, tier }: { product: Product; onTap: () => void; tier?: FitTier }) {
  const [imgFailed, setImgFailed] = useState(false)
  const tierBadge = tier === 'recommend'
    ? { text: '五星推荐', bg: '#16A34A', fg: '#FFFFFF' }
    : tier === 'caution'
      ? { text: '谨慎食用', bg: '#C77B47', fg: '#FFFFFF' }
      : null
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
      </View>
    </View>
  )
}
