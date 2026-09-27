// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline, useRouter } from '@tarojs/taro'
import { Image, Input, View, Text, ScrollView, Button, Video } from '@tarojs/components'
import { getProducts, getAnnouncements, getOrders, getProductsByIds, getMyFootprints, getUserFoodTherapyWeights, addToCart, getSiteConfig } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import { getUserHealthProfile, getLatestConstitutionResult } from '@/db/food-api'
import type { Product, Announcement, OrderFeedItem, Order, UserHealthProfile, UserScanHistory } from '@/db/types'
import StorePickerSheet from '@/components/StorePickerSheet'
import { type ScoredProduct } from '@/utils/emotionEngine'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { profileToCrowds } from '@/utils/food-therapy'
import { buildTherapyReport, isFoodProduct, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { getTodayFoodTherapy, resolveConstitution, type TodayFoodTherapyResult } from '@/utils/today-food-therapy'
import { analyzeConsumption, recommendByConsumption, scoreByConsumption, type ConsumptionProfile } from '@/utils/consumption-profile'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import Icon from '@/components/Icon'
import SectionTitle from '@/components/SectionTitle'
import ProductGridCard from '@/components/ProductGridCard'
import { getProductCareInfo } from '@/utils/product-care'
import { getCurrentTerm } from '@/utils/seasonal-box'
import CategoryGrid from './CategoryGrid'
import HomeBanner from './HomeBanner'

// 首页 Banner 轮播 = 全站唯一广告位：由总后台「首页广告位」配置驱动（见 HomeBanner.tsx），
// 未配置时回退内置的品牌价值主张三张。首页不再另设独立的「广告占位」块，避免重复曝光位。

// 为你而定横滑卡片的马卡龙渐变底（绿/紫/棕轮换），呼应截图差异卖点的轻快观感
const MACARON = [
  'linear-gradient(150deg,hsl(var(--primary-soft)),hsl(var(--primary-soft-deep)))',
  'linear-gradient(150deg,#F6E9D8,#EAD7BC)',
  'linear-gradient(150deg,#E9EDE2,#D6E0CC)',
]

import { readFeedCache, writeFeedCache, readConsumeCache, writeConsumeCache, mergeFeedbackIntoProfile, classifyProductList } from './home-utils'


export default function IndexPage() {
 const { user, profile } = useAuth()
 const { currentCity, currentLocation, currentStore, nearbyStores, loading: locationLoading, error: locationError, detectLocation, setStore, followLocation } = useLocation()
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
 const { selectedCrowds, clearFilters, getSuitability, userAllergens } = useFoodTherapy()
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
  // 卡片主图加载淡入：图未下载完时露底层马卡龙占位，加载后淡入，消除「先纯色后图」闪跳
  const [cardImgLoaded, setCardImgLoaded] = useState<Record<string, boolean>>({})
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
 // 「适合我」个性化筛选：仅看适合我的好物
 const [fitOnly, setFitOnly] = useState(false)
 const [feedItems, setFeedItems] = useState<ScoredProduct<Product>[]>([])
 const [announcements, setAnnouncements] = useState<Announcement[]>([])
 // 个人订单（仅登录后拉取）：用于首页「订单通知」强提醒
 const [myOrders, setMyOrders] = useState<Order[]>([])
 // 门店筛选：未选=全城聚合流；用户点门店切换器才收窄到该店（下钻）
 const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
 const [showStoreSheet, setShowStoreSheet] = useState(false)
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
 setShowStoreSheet(true)
 }
 const [loading, setLoading] = useState(false)
 // 沉浸式顶栏：按真实状态栏高度下压品牌区，避免被刘海/状态栏遮挡（默认 20 兜底）
 const [statusBarH, setStatusBarH] = useState(20)
 useEffect(() => {
 try {
 const info = (Taro as any).getWindowInfo?.() ?? (Taro as any).getSystemInfoSync?.()
 if (info?.statusBarHeight) setStatusBarH(info.statusBarHeight)
 } catch { /* 取不到则用默认值 20 */ }
 }, [])

 // 当前节气名（驱动首页「节气食盒」入口与今日食养副标题）
 const seasonalTerm = getCurrentTerm()
 const termName = seasonalTerm?.name || '当季'

 // 消费偏好画像：登录后回溯历史订单 → 聚合食养偏好 → 推荐相似好物
 const [consumptionProfile, setConsumptionProfile] = useState<ConsumptionProfile | null>(null)
 const [boughtIds, setBoughtIds] = useState<Set<string>>(new Set())

 const hasQuery = mood.trim().length > 0

 // V1 体质档案：登录后读取，驱动首页个性化（呈现"你关注的食养偏好"，非"今日"）
 const [userProfile, setUserProfile] = useState<UserHealthProfile | null>(null)

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
 // 原逻辑 `if (currentCity && nearbyStores.length > 0) return` 一旦本地缓存过任意门店
 // （哪怕是兜底到杭州中心、或上次在别处定位的残留），就跳过定位 —— 首页永远显示旧位置的
 // 门店与距离，人已移动/站在店门口却仍显示「几公里外」的旧门店。
 // 现改为：先秒显缓存保证不白屏，再后台用当前 GPS 刷新（detectLocation 内部有并发去重，不会重复拉）。
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
 title: `${p.name} · 来店有喜好物`,
 path: `/pages/product/index?id=${encodeURIComponent(p.id)}${myRef ? `&ref=${myRef}` : ''}`,
 imageUrl: p.imageUrl || undefined,
 }
 return {
 title: '来店有喜，好物相候！',
 path: `/pages/index/index${myRef ? `?ref=${myRef}` : ''}`,
 }
 })
 useShareTimeline(() => ({ title: '来店有喜，有喜相逢' }))

 // 加载公告（性能：公告低频变更 → 5min storage 缓存先显后刷，冷启动不再白等）
 const loadAnnouncements = useCallback(async () => {
 try {
 const cached = Taro.getStorageSync('home_ann_cache_v1')
 if (Array.isArray(cached) && cached.length) setAnnouncements(cached)
 } catch { /* 缓存不可用则静默直拉 */ }
 const data = await getAnnouncements()
 setAnnouncements(data)
 try { Taro.setStorageSync('home_ann_cache_v1', data) } catch { /* 忽略存储失败 */ }
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
 // 城市维度优先（Phase 3）：用户未手动选门店时，按当前城市聚合（市内各门店商品 + 全国通用商品）；
 // 仅在门店切换器手动点选某门店时才按该店过滤（下钻）。无城市/无门店时兜底全平台聚合。
 const useStoreId = selectedStoreId || null
 // 城市 id 为真实 integer（>0）才传 cityId；DEFAULT_CITY 兜底 id=0 视为无城市，避免 .eq('0') 退化过滤
 const useCityId = useStoreId ? null : (currentCity?.id ? Number(currentCity.id) : null)
 const scope = useStoreId
 ? `store:${useStoreId}`
 : useCityId
 ? `city:${useCityId}`
 : (currentStore?.id ? `store:${currentStore.id}` : 'nation')
 // ① 先用缓存秒出（按 scope 隔离缓存，避免切城/切店串味），下拉刷新仍会强制走网络
 const cached = readFeedCache(scope)
 if (cached && cached.length) {
 setFeedItems(cached)
 setLoading(false)
 } else {
 setLoading(true)
 }
 let raw: Product[] = []
 if (useStoreId) {
 // 已选定门店（手动下钻）：只拉该店商品，别的店不混进
 raw = await getProducts({ storeId: useStoreId, limit: 40 })
 } else if (useCityId) {
 // 城市聚合：市内门店商品 + 全国通用（city_id=null）商品，真正「城市维度」
 raw = await getProducts({ cityId: String(useCityId), limit: 40 })
 } else if (currentStore?.id) {
 // 兜底：有 GPS 最近门店但无城市维度时，按该店展示
 raw = await getProducts({ storeId: currentStore.id, limit: 40 })
 } else {
 // 最终兜底：全平台聚合流（平台好物）
 raw = await getProducts({ limit: 30, platformFilter: 'only' })
 }
 const next = raw.map(p => ({ product: p, matchScore: 1, matchLabel: null }))
 setFeedItems(next)
 writeFeedCache(scope, next)
 } finally {
 setLoading(false)
 feedInflightRef.current = null
 }
 })()
 return feedInflightRef.current
 }, [currentLocation, nearbyStores, selectedStoreId, currentStore, currentCity])

 // 注意（Phase 3）：默认 feed 跟随当前城市聚合（currentCity），不写入 selectedStoreId（避免强制单店/单城锁定）；
 // 用户仍可在门店切换器自由下钻到具体门店。仅当城市与门店均不可用时才兜底全平台聚合。

 // 下拉刷新（注：loadAnnouncements/loadFeed 已在上文声明，避免依赖数组 TDZ）
 useEffect(() => {
 const handler = () => {
 loadFeed()
 loadAnnouncements()
 Taro.stopPullDownRefresh()
 }
 // Taro 小程序下拉刷新回调
 ;(Taro as any).onPullDownRefresh = handler
 return () => { ;(Taro as any).onPullDownRefresh = null }
 }, [loadAnnouncements, loadFeed])

 useEffect(() => { loadAnnouncements(); loadFeed(); loadMyOrders() }, [loadAnnouncements, loadFeed, loadMyOrders])
 useDidShow(() => { loadFeed() })

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


 // 体质档案个性化推荐：无手动查询时，按画像从 Feed 池挑适配好物（推荐+谨慎）
 const profileItems = useMemo(() => {
 if (!profileCrowds.length || hasQuery) return []
 const tr = classifyProductList(feedItems.map((f) => f.product), profileCrowds)
 return [...tr.recommend, ...tr.caution].slice(0, 12)
 }, [profileCrowds, feedItems, hasQuery])

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

 // 「为你而定」楼层的数据兜底：新用户（无体质档案、无购买/浏览记录）时 personalizedItems 为空。
 // 若直接把整块隐藏，首页会缺一层、且用户永远看不到这个栏目（这正是首页「少一块」的原因）。
 // 故回退展示 Feed 前 8 款，并把标题从「为你而定」换成「甄选好物」——不谎称个性化，
 // 副标题引导补全体质档案（真实业务目标：档案越全，推荐越准）。
 const railPersonalized = personalizedItems.length > 0
 const railItems = useMemo(
 () => (railPersonalized ? personalizedItems : feedItems.map((f) => f.product).slice(0, 8)),
 [railPersonalized, personalizedItems, feedItems],
 )

 // 今日食养推荐：复用 getTodayFoodTherapy 纯函数（无网络），从首页商品池 + 画像算预览
 const todayResult = useMemo<TodayFoodTherapyResult>(() => {
 const constitution = resolveConstitution(profile ?? null)
 const products = feedItems.map((f) => f.product)
 return getTodayFoodTherapy(constitution, consumptionProfile, products, boughtIds)
 }, [profile, feedItems, consumptionProfile, boughtIds])

// 底部 Feed 展示列表：默认推荐流 +「适合我」个性化筛选。
// 注：个性化好物（personalizedItems）由 therapyMap 计算关怀层、直接并入下方 Feed 展示，
// 不再单独隐藏去重——此前隐藏却无对应插卡渲染，会导致这些商品从首页整体消失。
const displayFeed = useMemo<ScoredProduct<Product>[]>(() => {
 if (!fitOnly) return feedItems
 return feedItems.filter((f) => {
 const tier = getSuitability(f.product)
 // 画像分档明确时以其为准（过敏原忌口优先级最高，已含在 tier 的 avoid 里）
 if (tier === 'recommend') return true
 if (tier === 'caution' || tier === 'avoid') return false
 // tier === null 分两种情形，必须区别对待：
 // ① 有画像人群、但该商品不命中任何档 → 确实不适配，排除（与旧版行为一致）；
 // ② 压根没有画像人群可判定（档案未填「身体状态 / 慢病」时 profileToCrowds 推导为空，
 //    classifyProduct 因 selectedCrowds 为空直接 return null）→ 旧逻辑把 null 也当「不适合」，
 //    于是一点「适合我」整个列表被滤空。此时退回消费画像（购买记录）打分兜底，
 //    让「买过什么 → 推同方向」在无画像时同样成立。
 if (selectedCrowds.length > 0) return false
 return scoreByConsumption(f.product, consumptionProfile) > 0
 })
}, [feedItems, fitOnly, getSuitability, consumptionProfile, selectedCrowds])

// 「适合我」入口的可用条件：有画像人群（按适配度分档）或有购买记录（按消费画像兜底）。
// 两者皆无时不渲染入口——避免出现「点了必然空」的死按钮。
const canUseFitFilter = selectedCrowds.length > 0 || !!consumptionProfile?.hasData

 // 千人千面排序：有画像且无查询、非热度模式时，把商品流按食养适配度(recommend→caution→avoid)前置
 const sortedFeed = useMemo<ScoredProduct<Product>[]>(() => {
 if (hasQuery || selectedCrowds.length === 0) return displayFeed
 const rank: Record<string, number> = { recommend: 0, caution: 1, avoid: 2 }
 return [...displayFeed].sort((a, b) => {
 const ra = rank[getSuitability(a.product) ?? ''] ?? 3
 const rb = rank[getSuitability(b.product) ?? ''] ?? 3
 return ra - rb
 })
 }, [displayFeed, hasQuery, selectedCrowds, getSuitability])

 // 食疗引擎报告映射（与详情页/门店卡同源）：首页商品池一次性算好，卡片直接取用
 const therapyMap = useMemo<Record<string, ProductTherapyReport | null>>(() => {
 const map: Record<string, ProductTherapyReport | null> = {}
 const dictMap = new Map(ingredientDict.map((d) => [d.name, d]))
 const calc = (p?: Product | null) => {
 if (!p) return null
 // 类型闸门：非食养商品（礼品/手作/护理/日用品）不参与食疗计算，
 // 避免工艺品/日用品被解析出「适合人群 / 食性」这类食品专属结论
 if (!isFoodProduct(p)) return null
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


 return (
 <View className="min-h-screen bg-background tabbar-pad index-page" aria-label="首页">

 {/* ===================== L0 主视觉：品牌标题置顶 + 搜索/定位一行 ===================== */}
 <View className="pg-hero" style={{ position: 'relative', overflow: 'hidden', marginTop: 0, marginLeft: 0, marginRight: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderWidth: 0, boxShadow: '0 8px 22px rgba(0,0,0,0.06)', background: 'hsl(var(--background))', paddingTop: statusBarH + 14, paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
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
{/* 顶栏柔光叠加：右上暖白光晕 + 左下深绿暗角，纯视觉不挡操作（内联，避免依赖未 import 的 scss） */}
<View style={{ position: 'absolute', top: -40, right: -30, width: 200, height: 200, borderRadius: 100, background: 'radial-gradient(circle, rgba(255,255,255,0.32), rgba(255,255,255,0) 70%)', zIndex: 0, pointerEvents: 'none' }} />
<View style={{ position: 'absolute', bottom: -50, left: -40, width: 220, height: 220, borderRadius: 110, background: 'radial-gradient(circle, rgba(0,0,0,0.12), rgba(0,0,0,0) 70%)', zIndex: 0, pointerEvents: 'none' }} />

 {/* 品牌标题行：来店有喜 · 药食同源食疗零食（最顶部，5秒懂你定位） */}
 <View className="flex items-center gap-2.5 relative" style={{ zIndex: 1 }}>
 <View className="flex flex-col">
      <Text className="text-xs font-medium tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>药食同源原料｜日常轻养零食</Text>
      <Text className="text-xl font-bold leading-tight" style={{ color: 'hsl(var(--foreground))' }}>来店有喜·本草食养小食</Text>
 </View>
 </View>

{/* 定位行：点击切换门店 / 城市（首屏优先入口；无附近门店时 openStoreSheet 自动退化为切城市） */}
<View
className="mt-3.5 flex items-center gap-1.5 relative active:opacity-70 transition-opacity"
style={{ zIndex: 1 }}
hoverClass="none"
onClick={openStoreSheet}
>
<Text style={{ fontSize: '28rpx', color: 'hsl(var(--foreground))' }}>📍</Text>
<Text className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
{locationLoading ? '定位中…' : (activeStore?.store_name || currentCity?.city_name || '选择门店')}
</Text>
<Text style={{ fontSize: '22rpx', color: 'hsl(var(--muted-foreground))' }}>∨</Text>
</View>

{/* 白底搜索框 + 扫码配料（嵌于绿区内）：搜索与扫码并列，扫码入口固定曝光于首屏搜索区 */}
<View
className="mt-2.5 rounded-2xl bg-card flex items-center gap-2 px-3 py-2.5 relative"
style={{ zIndex: 1, boxShadow: '0 4px 14px rgba(0,0,0,0.06)', border: '1px solid hsl(var(--border))' }}
hoverClass="none"
>
{/* 左侧搜索（点击进搜索页） */}
<View
className="flex items-center gap-2 flex-1 min-w-0 active:opacity-80 transition-opacity"
style={{ paddingLeft: 4 }}
hoverClass="none"
onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}
>
<Text style={{ fontSize: '30rpx' }}>🔍</Text>
<Text className="text-sm text-muted-foreground">搜食养好物</Text>
</View>
{/* 分隔线 */}
<View style={{ width: 1, height: 18, background: 'hsl(var(--border))', flexShrink: 0 }} />
{/* 右侧扫码配料（点击进识别页，自动调起拍照） */}
<View
className="flex items-center gap-1.5 flex-shrink-0 active:opacity-70 transition-opacity"
style={{ paddingRight: 4 }}
hoverClass="none"
onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index?auto=1' })}
>
<Text style={{ fontSize: '32rpx' }}>📷</Text>
<Text className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>扫码配料</Text>
</View>
</View>

 </View>

{/* 轮播位 = 全站唯一广告位：总后台「首页广告位」配置驱动，热更新；
 未配置广告时回退内置品牌卡，永远不留白。 */}
<HomeBanner />

<CategoryGrid storeId={selectedStoreId || undefined} />

{/* 为你而定 横滑楼层：来电有喜差异卖点（小象无此模块）。有画像/消费记录用个性化结果，
 否则回退 Feed 前若干款并换标题「甄选好物」，保证楼层结构完整、新用户也能看到。 */}
{(!hasQuery && railItems.length > 0) && (
  <View className="mt-5 px-4">
    <SectionTitle
      title={railPersonalized ? '为你而定' : '甄选好物'}
      subtitle={railPersonalized ? '基于你的体质与购买偏好' : '先挑几款 · 补全体质档案后更懂你'}
    />
    <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginTop: 4 }} showScrollbar={false}>
      {railItems.slice(0, 8).map((p, idx) => {
        const fit = profileItems.some((x) => x.id === p.id)
        const c = careOf(p)
        const chipTxt = c?.healthTags?.length ? c.healthTags.slice(0, 2).join(' · ') : (c?.shiyang || '')
        return (
          <View
            key={p.id}
            style={{ display: 'inline-block', width: 150, marginRight: 10, verticalAlign: 'top', background: 'hsl(var(--card))', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}
            hoverClass="none"
            className="active:opacity-70"
            onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
          >
            <View style={{ height: 112, position: 'relative', background: MACARON[idx % MACARON.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(p.main_image || p.image_url) && (
                <Image src={p.main_image || p.image_url} mode="aspectFill" style={{ width: '100%', height: '100%', opacity: cardImgLoaded[p.id] ? 1 : 0, transition: 'opacity 0.3s ease' }} onLoad={() => setCardImgLoaded(s => ({ ...s, [p.id]: true }))} />
              )}
              {fit && (
                <View style={{ position: 'absolute', top: 8, left: 8, background: 'hsl(var(--primary-soft))', color: 'hsl(var(--primary))', fontSize: '20rpx', fontWeight: 700, borderRadius: 5, padding: '2px 6px' }}>适合你</View>
              )}
            </View>
            <View style={{ padding: '8px 9px 11px' }}>
              <Text style={{ fontSize: '28rpx', fontWeight: 700, color: 'hsl(var(--foreground))', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</Text>
              {chipTxt ? (
                <Text style={{ fontSize: '22rpx', color: 'hsl(var(--primary))', background: 'hsl(var(--primary-soft))', borderRadius: 8, padding: '2px 7px', marginTop: 6, display: 'inline-block' }}>{chipTxt}</Text>
              ) : null}
            </View>
          </View>
        )
      })}
    </ScrollView>
  </View>
)}

 {/* 扫码入口已并入首屏搜索区（左侧搜索 / 右侧扫码配料），见上方 hero 白卡。
 原「扫码配料识别 CTA」整块移除，避免首页扫码入口重复曝光。 */}
{/* 已移除（2026-09-24 拍板）：
 ① 「已识别 10万+ 零食配料 · 全家吃得明白」信任行；
 ② 独立的「广告位 · 虚位以待」占位块 —— 广告统一走上方轮播位，首页不再重复设曝光位。 */}

{/* ===================== L5 为你精选：严选食疗零食商品流（主力内容，已去类目筛选） ===================== */}
 {!hasQuery && (
 <View className="mt-5 px-4">
 <SectionTitle emoji="" title="食养好物" subtitle="懂身体的好物，挑挑看" />

 {/* 顶部分类筛选条（全部/粉面/炖汤/热饮/小菜）已移除：价值主义，不做类目内卷，
 商品流改为直接按食养适配度个性化呈现，减少一层决策成本 */}
 {/* 「适合我」个性化筛选：有画像人群（按适配度分档）或有购买记录（按消费画像兜底）时才展示，
 两者皆无时免打扰——避免出现「点了必然空」的死入口 */}
 {canUseFitFilter && (
 <View className="flex items-center gap-2 py-2">
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
 <Text> 适合我</Text>
 </View>
 </View>
 )}

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
 spec={f.product.spec}
 imageUrl={f.product.main_image || f.product.image_url || ''} storeName={f.product.store_name || ''}
 care={careOf(f.product)}
 suitability={getSuitability(f.product)}
 therapyReport={therapyMap[f.product.id] ?? null}
 onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${f.product.id}` })}
 onAddCart={(id) => handleAddCart(id, (f.product as any).store_id)} adding={addingId === f.product.id}
 compact />
 ))}
 </View>
 ) : (
 <View className="flex flex-col items-center justify-center py-10 gap-3">
 <Icon name="storefront-outline" size={48} className="text-muted-foreground/40" />
 <Text className="text-base text-muted-foreground text-center">
 {fitOnly
 ? '暂无更贴合你的好物，取消筛选看看全部～'
 : activeStore ? '该门店暂无商品，店主正在上架中…' : (currentCity?.city_name ? `「${currentCity.city_name}」暂无可售好物，切换门店或城市看看～` : '暂无推荐好物，切换门店看看～')}
 </Text>
 {fitOnly && (
 <Button className="px-4 py-2 rounded-xl bg-primary_f10 text-primary text-base"
 onClick={() => setFitOnly(false)}>
 取消筛选
 </Button>
 )}
 {activeStore && (
 <Button className="px-4 py-2 rounded-xl bg-primary_f10 text-primary text-base"
 onClick={() => openStoreSheet()}>
 切换其他门店
 </Button>
 )}
 </View>
 )}
 </View>
 )}

 {/* 扫码入口已合并为上方首屏强曝光 CTA 带（扫码），避免首页多处扫码重复。
 原「技术壁垒弹窗」已移除：点击 CTA 直接进 food-scan 并自动调起拍照，省去中间一步。 */}

 {/* 首页：右下角停靠咨询入口（食养咨询（主）/ 客服），全站统一 bottom-right */}
 <FloatingActionBar />

 {/* 自定义底部导航：独立渲染（贴底全宽），不可嵌套在 FAB 容器内，否则购物车徽标在真机渲染异常 */}
 <CustomTabBar />

 {/* 门店选择底部弹层（Phase 1：多门店发现/切换，替换原生 showActionSheet） */}
 <StorePickerSheet
 open={showStoreSheet}
 onClose={() => setShowStoreSheet(false)}
 stores={nearbyStores}
 currentStoreId={activeStore?.id}
 locating={locationLoading}
 locationError={locationError}
 onSelect={(s) => {
 manualStoreRef.current = true
 setSelectedStoreId(s.id)
 setStore(s)
 setShowStoreSheet(false)
 }}
 onFollowLocation={() => {
 setSelectedStoreId(null)
 setShowStoreSheet(false)
 followLocation()
 }}
 onViewAll={() => {
 setSelectedStoreId(null)
 setShowStoreSheet(false)
 loadFeed()
 }}
 onFallbackCity={() => Taro.navigateTo({ url: '/pages/mine/city-select/index' })}
 />
 </View>
 )
}

// 首页商品卡统一复用 ProductGridCard（两列网格，含食养关怀层），
// 与自营页同一套食养引擎 getProductCareInfo，保证注解口径一致。


