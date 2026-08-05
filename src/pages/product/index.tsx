// @title 商品详情
import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect, type ReactNode } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image, Button, Swiper, SwiperItem, Video, View, Text } from '@tarojs/components'
import { getProductById, getProductBatchInfo, addToCart, isFavorited, toggleFavorite, recordFootprint, trackFoodTherapyEvent, bindStoreReferrer } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import { getProductFoodAdditives } from '@/db/food-api'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { setPendingCheckout } from '@/utils/checkoutCache'
import { buildProductShare } from '@/utils/share'
import Icon from '@/components/Icon'
import type { Product, FoodAdditive } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { toFoodTherapyInput, TIER_LABEL, buildShiyangStageModule } from '@/utils/food-therapy'
import { resolveIngredientEntries } from '@/utils/ingredient-analysis'
import FoodSafetyPanel from '@/components/FoodSafetyPanel'
import ComprehensiveSafetyReport from '@/components/ComprehensiveSafetyReport'
import GiftSections from '@/pages/product/GiftSections'
import { getFoodBenefit } from '@/data/foodBenefits'
import { analyzeFoodLabel, type ComprehensiveSafetyReport as ReportType } from '@/utils/safety-analysis'
import { PRODUCT_DISCLAIMER, FOOD_THERAPY_DISCLAIMER, FOOD_REFERENCE_DISCLAIMER, shieldCopy, cleanAudienceTags } from '@/utils/compliance/shield'
import { buildTherapyReport, buildTherapyHeadline, NATURE_FEELING, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { analyzeForProfile, describeCohort } from '@/utils/food-therapy/profile-analysis'
import { getFoodIngredients, callIngredientAnalyze, type FoodIngredientRow, type CatalogInsight } from '@/db/food-safety'

// 模块级缓存：食材字典（食养引擎基础数据）仅拉一次，跨商品跳转不再重复请求（PRD 4.1）
let ingredientDictPromise: Promise<FoodIngredientRow[]> | null = null

function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <View className="mb-3">
      <View
        onClick={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: '4px', paddingHorizontal: '2px', background: open ? '#F0F7F1' : 'transparent', borderRadius: '8px' }}
      >
        <Text className="text-base font-bold text-foreground" style={{ display: 'block' }}>{title}</Text>
        <Text style={{ fontSize: '13px', color: '#9CA3AF' }}>{open ? '收起 ▲' : '展开 ▼'}</Text>
      </View>
      {open && <View style={{ marginTop: 6 }}>{children}</View>}
    </View>
  )
}

// 🛡️ 首屏信任锚点：每条都对应真实能力，绝不夸大（更信任的底层是「可验证」）
function TrustChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, background: '#F0F7F1', border: '1px solid #D6EFD8' }}>
      <Text style={{ fontSize: 13 }}>{icon}</Text>
      <Text style={{ fontSize: 12, color: '#2F5D3A', fontWeight: 600 }}>{label}</Text>
    </View>
  )
}

export default function ProductPage() {
  const { user } = useAuth()
  const { selectedCrowds, selectedScene, classifyProduct, hasHealthProfile, getSuitability, activeProfile, familyMembers, selectedMemberId, setSelectedMemberId } = useFoodTherapy()
  const { id, expiryEp, expiryBatch } = useMemo(() => {
    const params = Taro.getCurrentInstance().router?.params
    const rawId = params?.id ? decodeURIComponent(params.id) : ''
    // 临期特惠入口（/pages/expiry/index）带入的折扣单价与批次：仅用于展示与下单透传，
    // 实际成交价由 createOrderV2 按 batch_id 在服务端从 v_near_expiry_products 套用，前端无法伪造。
    const ep = params?.ep ? Number(decodeURIComponent(params.ep)) : 0
    const batch = params?.batch ? decodeURIComponent(params.batch) : ''
    return { id: rawId, expiryEp: ep, expiryBatch: batch }
  }, [])
  const [product, setProduct] = useState<Product | null>(null)
  const [foodAdditives, setFoodAdditives] = useState<FoodAdditive[]>([])
  const [loading, setLoading] = useState(true)
const [adding, setAdding] = useState(false)
  const cartCount = useCartCount()
  const [myCode, setMyCode] = useState('')
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  // 底部悬浮栏高度测量：内容区 paddingBottom 动态等于栏高（含安全区），杜绝遮挡（PRD 2.5）
  const barRef = useRef<{ uid?: string } | null>(null)
  const [barH, setBarH] = useState(76)
  useLayoutEffect(() => {
    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select('#bottomBar')
        .boundingClientRect((rect: any) => {
          if (rect && rect.height) setBarH(Math.ceil(rect.height))
        })
        .exec()
    })
  }, [])
  // 临期特惠入口带入的折扣单价（仅用于展示与透传；实际成交价由 createOrderV2 按 batch_id 服务端套用）
  const displayPrice = useMemo(() => {
    const base = Number(product?.price || 0)
    if (expiryEp > 0 && expiryEp < base) return expiryEp
    return base
  }, [product?.price, expiryEp])

  const totalPrice = useMemo(() => {
    const price = displayPrice
    return Math.round(price * quantity * 100) / 100
  }, [displayPrice, quantity])
  // 门店推荐套餐：根据 combo_product_ids 拉取关联商品
  const [comboProducts, setComboProducts] = useState<Product[]>([])
  // 在售批次的生产日期 / 保质期（来自商家端批次入库 stock_batches，与商家端同步）
  const [batchInfo, setBatchInfo] = useState<{ produced_at: string | null; expire_at: string | null; shelf_life_days: number | null } | null>(null)

  // 构建媒体列表：视频置首帧 + 主图 + 副图（抖音电商习惯：视频即第一眼，更易建立信任）
  const mediaList = useMemo(() => {
    if (!product) return []
    const list: { type: 'image' | 'video'; url: string }[] = []
    const v = product.video_url
    if (v) list.push({ type: 'video', url: v })
    const main = product.main_image || product.image_url
    if (main) list.push({ type: 'image', url: main })
    ;(product.sub_images || []).forEach(url => {
      if (url && !list.some(m => m.url === url)) list.push({ type: 'image', url })
    })
    return list
  }, [product])

  // 统一食疗引擎：拉取食材字典 + 实时计算三色预警（C 端详情页复用商家端同一套算法）
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  // 资产化①闭环：EF 私有目录表层「药食同源专属洞察」（服务端匹配，客户端读不到，竞品抄不到）
  const [catalogInsight, setCatalogInsight] = useState<CatalogInsight | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  useEffect(() => {
    if (!ingredientDictPromise) {
      ingredientDictPromise = getFoodIngredients().catch(() => [] as FoodIngredientRow[])
    }
    ingredientDictPromise.then(setIngredientDict).catch(() => setIngredientDict([]))
  }, [])

  // 生产日期 / 保质期展示计算（来自在售批次）
  const batchDisplay = useMemo(() => {
    if (!batchInfo) return null
    const fmt = (s?: string | null) => {
      if (!s) return ''
      const d = new Date(s)
      if (isNaN(d.getTime())) return ''
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const produced = fmt(batchInfo.produced_at)
    const expire = fmt(batchInfo.expire_at)
    let daysLeft: number | null = null
    if (batchInfo.expire_at) {
      const diff = new Date(batchInfo.expire_at).getTime() - Date.now()
      daysLeft = Math.ceil(diff / 86400000)
    }
    if (!produced && !expire) return null
    return { produced, expire, daysLeft }
  }, [batchInfo])

  // 统一引擎实时报告：把商品 ingredients（食材名）映射回食材字典，复用 buildTherapyReport
  // 输出整体性味 / 三色预警 / 引擎商家寄语 / 合规声明，与商家编辑页算法完全一致。
  const therapyReport = useMemo<ProductTherapyReport | null>(() => {
    if (!product || !ingredientDict.length) return null
    const dictMap = new Map(ingredientDict.map((r) => [r.name, r]))
    const inputs: ProductIngredientInput[] = (product.ingredients || [])
      .map((name: string) => {
        const row = dictMap.get(name)
        if (!row) return null
        const ing: FoodIngredient = {
          name: row.name,
          nature: row.nature,
          base_effect: row.base_effect,
          caution_crowds: row.caution_crowds,
          allergens: row.allergens || [],
          chronic_tags: row.chronic_tags || [],
          neutralize: row.neutralize,
        }
        return { ingredient: ing }
      })
      .filter((x): x is ProductIngredientInput => x !== null)
    if (!inputs.length) return null
    return buildTherapyReport(product.name, inputs)
  }, [product, ingredientDict])


  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      Taro.showToast({ title: '商品参数缺失', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      // 10s 超时兜底：网络/查询挂起时也能解除 loading，避免一直转圈
      const data = await Promise.race<Product | null>([
        getProductById(id),
        new Promise<Product | null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ])
      setProduct(data)
      // 在售批次的生产日期 / 保质期（天然来自商家端批次入库，与商家端同步）
      getProductBatchInfo(id).then(setBatchInfo).catch(() => {})
      // 强引导门店自推码：进商品详情即绑所属门店 owner 推广码（让利佣金回流门店）
      if (data?.store_id) bindStoreReferrer(data.store_id).catch(() => {})
      // 记录浏览足迹
      if (data) recordFootprint(data.id).catch(() => {})
      // 导购反馈回流：记录浏览事件（个性化权重学习）
      if (data) trackFoodTherapyEvent({ productId: data.id, eventType: 'view', healthTag: (data as any).health_tag ?? [], emotionTag: (data as any).emotion_tag ?? [] }).catch(() => {})
      if (!data) Taro.showToast({ title: '商品不存在或加载超时', icon: 'none' })
    } catch (e) {
      console.error('[product] load failed', e)
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [id])

  const refreshCart = useCallback(async () => {
    if (!user) return
    await refreshCartCount()
    const [favStatus, { data }] = await Promise.all([
      isFavorited(id),
      supabase.from('profiles').select('referral_code').maybeSingle(),
    ])
    setIsFav(favStatus)
    if (data?.referral_code) setMyCode(data.referral_code)
  }, [user, id])

  // load 仅依赖商品 id；登录态变化只重跑 refreshCart，不再连带整页重新拉取商品（避免重复加载=慢）
  useEffect(() => { load() }, [load])
  useEffect(() => { refreshCart() }, [refreshCart])
  useDidShow(() => { refreshCart() })

  // 拉取「门店推荐套餐」关联商品（combo_product_ids），失败静默降级
  useEffect(() => {
    const ids = (product as any)?.combo_product_ids as string[] | undefined
    if (!ids || ids.length === 0) { setComboProducts([]); return }
    let alive = true
    supabase
      .from('products')
      .select('id, name, price, image_url')
      .in('id', ids)
      .then(({ data, error }: any) => {
        if (!alive) return
        if (!error && Array.isArray(data)) setComboProducts(data as Product[])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [product])

  // 拉取本商品挂载的配料安全条目（product_food_additives → food_additives）
  useEffect(() => {
    if (!id) return
    let alive = true
    getProductFoodAdditives(id)
      .then((links) => {
        if (!alive) return
        if (!links.length) { setFoodAdditives([]); return }
        const ids = links.map((l) => l.additive_id)
        supabase
          .from('food_additives')
          .select('*')
          .in('id', ids)
          .then(({ data }: { data: any }) => { if (alive) setFoodAdditives((data as FoodAdditive[]) || []) })
          .catch(() => { if (alive) setFoodAdditives([]) })
      })
      .catch(() => { if (alive) setFoodAdditives([]) })
    return () => { alive = false }
  }, [id])

  // 食养成分分析：优先用持久化 ingredients，回退商品名匹配
  const shiyangEntries = useMemo(
    () => (product ? resolveIngredientEntries(product) : []),
    [product],
  )

  // 全面安全分析：聚合添加剂(已挂载) + 商品标签字段(过敏原/营养) + 商品名/描述扫描
  const safetyReport = useMemo<ReportType | null>(() => {
    if (!product) return null
    return analyzeFoodLabel({
      text: [product.name, product.description].filter(Boolean).join(' '),
      additives: foodAdditives.map((a) => ({ name: a.name, risk_level: a.risk_level })),
      allergensDeclared: product.allergens,
      nutrition: product.nutrition,
      isFullLabel: true,
    })
  }, [product, foodAdditives])

  // 菜品级食养作用：原材料食材组合的现代营养 + 中医食疗（演示用，按 id/名称匹配）
  const foodBenefit = useMemo(() => getFoodBenefit(product), [product])

  // 资产化①升级：千人千面专属报告（核心壁垒·升首屏）
  // 基于用户完整结构化画像（含 age_group 分群维度），本品对「你个人」的食养参考。
  // 差异由过敏原 + 性味宜忌 + 人群标签自然产生，走中性食养话术，规避医疗宣称。
  const personalReport = useMemo<ReturnType<typeof analyzeForProfile> | null>(() => {
    if (!product || !activeProfile) return null
    return analyzeForProfile(product, activeProfile)
  }, [product, activeProfile])
  const cohortLabel = useMemo(() => describeCohort(activeProfile), [activeProfile])

  // 战略②：当前选购对象展示名（本人 / 家庭成员）
  const subjectLabel = useMemo(() => {
    if (selectedMemberId === 'self') return '你'
    const m = familyMembers.find((x) => x.id === selectedMemberId)
    return m ? m.name : '你'
  }, [selectedMemberId, familyMembers])

  // 资产化①闭环：调 ingredient-analyze EF 拿「药食同源专属洞察」
  // EF 用 service_role 读 medicinal_food_catalog（客户端 RLS 拒绝），按用户年龄段做差异化；
  // 仅回传衍生洞察，竞品无法复刻。persist:false 避免商品页内联调用刷 food_analysis_reports。
  useEffect(() => {
    let cancelled = false
    const ageGroup = activeProfile?.age_group
    const ingredients = (product?.ingredients || []) as string[]
    if (!product || !ageGroup || !ingredients.length) {
      setCatalogInsight(null)
      return
    }
    setCatalogLoading(true)
    callIngredientAnalyze({
      text: ingredients.join('，'),
      age_group: ageGroup,
      product_id: product.id,
      persist: false,
      source: 'manual',
    })
      .then((r) => {
        if (cancelled) return
        setCatalogInsight(r.success ? (r.catalog_insight ?? null) : null)
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [product, activeProfile])

  // 资产化②：同体质适配食材（复用搭配候选池，按用户画像筛出适配项）
  const matchedProducts = useMemo(() => {
    if (!hasHealthProfile) return []
    return comboProducts.filter((c) => getSuitability(c) === 'recommend').slice(0, 4)
  }, [hasHealthProfile, comboProducts, getSuitability])

  // 商品卡分享：一定是产品（商品主图 + 商品详情路径），并注入食疗分档
  useShareAppMessage(() => {
    if (!product) return { title: '来电有喜', path: '/pages/product/index' }
    const s = buildProductShare(product, myCode)
    const tier = classifyProduct(product)
    if (tier) {
      return {
        title: `${product.name}｜${TIER_LABEL[tier]}`,
        path: s.path,
        imageUrl: s.imageUrl,
      }
    }
    return { title: s.title, path: s.path, imageUrl: s.imageUrl }
  })
  useShareTimeline(() => {
    if (!product) return { title: '来电有喜', query: '', imageUrl: '' }
    const s = buildProductShare(product, myCode)
    return { title: s.timelineTitle, query: s.query, imageUrl: s.imageUrl }
  })

  const requireLogin = () => {
    if (!user) { Taro.navigateTo({ url: '/pages/login/index' }); return false }
    return true
  }

  const handleToggleFav = async () => {
    if (!requireLogin() || !product) return
    setFavLoading(true)
    const { isFav: newFav } = await toggleFavorite(product.id)
    setIsFav(newFav)
    setFavLoading(false)
    // 导购反馈回流：收藏=点赞偏好，取消=点踩
    trackFoodTherapyEvent({ productId: product.id, eventType: newFav ? 'like' : 'dislike', healthTag: product.health_tag ?? [], emotionTag: product.emotion_tag ?? [] }).catch(() => {})
    Taro.showToast({ title: newFav ? '已收藏' : '已取消收藏', icon: 'none' })
  }

  const handleAddCart = async () => {
    if (!requireLogin() || !product) return
    setAdding(true)
    await addToCart(product.id, product.store_id, quantity, expiryBatch || null)
    setAdding(false)
    // 导购反馈回流：加购=强偏好
    trackFoodTherapyEvent({ productId: product.id, eventType: 'add_cart', healthTag: product.health_tag ?? [], emotionTag: product.emotion_tag ?? [] }).catch(() => {})
    showCartToast()
  }

  const handleBuyNow = async () => {
    if (!requireLogin() || !product) return
    setAdding(true)
    setAdding(false)
    // 立即支付 = 直接下单，不写入购物车（避免付完款购物车残留该商品）
    const isExpiry = expiryEp > 0 && expiryEp < Number(product.price || 0)
    setPendingCheckout({
      productId: product.id,
      total: totalPrice,
      quantity,
      effectivePrice: isExpiry ? displayPrice : undefined,
      batchId: expiryBatch || undefined,
    })
    const q = `productId=${encodeURIComponent(product.id)}&total=${totalPrice}&quantity=${quantity}`
    const extra = expiryBatch ? `&ep=${displayPrice}&batch=${encodeURIComponent(expiryBatch)}` : ''
    Taro.navigateTo({ url: `/pages/payment/index?${q}${extra}` })
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )
  if (!product) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Text className="text-xl text-muted-foreground">商品不存在</Text>
    </View>
  )

  // 商品类型分流：food=食养走食疗模块；gift/craft/care=走礼品模块（互斥，绝不共用食疗话术）
  const isFood = !product.product_kind || product.product_kind === 'food'
  const isGift = !isFood

  return (
    <View className="min-h-screen bg-background" style={{ paddingBottom: barH }}>
      {/* 商品媒体轮播 + 顶部返回 + 购物车角标 */}
      <View className="relative">
        {/* 主图 + 副图轮播 */}
        {mediaList.length > 0 && (
          <Swiper
            current={currentMediaIndex}
            onChange={e => setCurrentMediaIndex(e.detail.current)}
            className="w-full"
            style={{ height: '280px' }}
            indicatorDots={mediaList.length > 1}
            indicatorColor="rgba(255,255,255,0.4)"
            indicatorActiveColor="#ffffff"
            circular={mediaList.length > 1}
            autoplay={mediaList.length > 1}
          >
            {mediaList.map((m, i) => (
              <SwiperItem key={i}>
                {m.type === 'video' ? (
                  <Video src={m.url} className="w-full h-full" style={{ display: 'block' }} controls showCenterPlayBtn enableProgressGesture objectFit="contain" />
                ) : (
                  <Image src={m.url} mode="aspectFill" className="w-full h-full" style={{ display: 'block' }} lazyLoad />
                )}
              </SwiperItem>
            ))}
          </Swiper>
        )}

        {/* 媒体计数指示 */}
        {mediaList.length > 1 && (
          <View className="absolute bottom-3 right-4 px-2 py-0.5 rounded-full text-white text-xs" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            {currentMediaIndex + 1}/{mediaList.length}
          </View>
        )}

      </View>

      {/* 价格信息卡 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        {/* 分享赚佣提示 */}
        {myCode && (
          <View className="mb-3 py-2 px-3 rounded-xl bg-primary/10 flex items-center gap-2">
            <Icon name="share-variant" size={20} className="text-primary" />
            <Text className="text-sm text-primary font-medium">分享给好友，好友下单你可得健康豆奖励</Text>
          </View>
        )}
        <View className="flex items-center gap-3">
          <Text className="text-3xl font-bold text-primary">¥{displayPrice}</Text>
          {/* 原价划线：普通商品用 original_price；临期特惠用目录价 product.price 作原价 */}
          {(product.original_price || expiryEp > 0) && (
            <Text className="text-xl text-muted-foreground line-through">¥{product.original_price || product.price}</Text>
          )}
          {/* 临期特惠折扣徽标 */}
          {expiryEp > 0 && expiryEp < Number(product.price || 0) && (
            <Text className="px-2 py-0.5 rounded-full bg-destructive/10 text-xl font-bold text-destructive">
              临期省¥{(Number(product.price || 0) - expiryEp).toFixed(2)}
            </Text>
          )}
          {/* 普通原价折扣徽标 */}
          {product.original_price && expiryEp <= 0 && (
            <Text className="px-2 py-0.5 rounded-full bg-primary/10 text-xl font-bold text-primary">
              省¥{(product.original_price - product.price).toFixed(2)}
            </Text>
          )}
          {/* 让利标签 */}
          {product.discount_rate != null && product.discount_rate > 0 && (
            <Text className="px-2 py-0.5 rounded-full bg-primary/10 text-base font-bold text-primary">
              立减{product.discount_rate}%
            </Text>
          )}
        </View>
        <View className="text-2xl font-bold text-foreground mt-3 leading-tight">{product.name}</View>
        {product.sales_count != null && (
          <Text className="text-sm text-muted-foreground mt-1">已售 {product.sales_count >= 10000 ? `${(Math.floor(product.sales_count / 1000) / 10).toFixed(1)}万` : product.sales_count} 件</Text>
        )}
        {/* 🛡️ 首屏信任锚点：每条都对应真实能力，不夸大（更信任的底层是「可验证」） */}
        <View className="mt-2 flex flex-wrap gap-2">
          {(safetyReport || foodAdditives.length > 0 || therapyReport) && (<TrustChip icon="🔬" label="已检配料" />)}
          {personalReport && (<TrustChip icon="🌟" label="已为你适配" />)}
          {batchDisplay && (<TrustChip icon="📦" label="批次可溯" />)}
          {catalogInsight && (<TrustChip icon="🌿" label="药食同源" />)}
        </View>
        {/* 生产日期 / 保质期（来自在售批次，与商家端批次入库同步，仅食养食品） */}
        {isFood && batchDisplay && (
          <View className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {batchDisplay.produced && (
              <Text className="text-xs text-muted-foreground">生产日期：{batchDisplay.produced}</Text>
            )}
            {batchDisplay.expire && (
              <Text className="text-xs text-muted-foreground">
                保质期至：{batchDisplay.expire}
                {batchDisplay.daysLeft != null && batchDisplay.daysLeft >= 0 ? `（剩 ${batchDisplay.daysLeft} 天）` : ''}
              </Text>
            )}
          </View>
        )}
        {/* 战略②：为谁选购 —— 家庭成员>0 时切换千人千面报告对象（inline 横滑，无浮层） */}
        {isFood && familyMembers.length > 0 && (
          <View className="mt-3">
            <Text className="text-xs text-muted-foreground mb-2 block">为谁选购（切换专属食养参考）</Text>
            <View className="flex gap-2 overflow-x-auto">
              <View
                onClick={() => setSelectedMemberId('self')}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs"
                style={{ background: selectedMemberId === 'self' ? '#0F4C81' : '#EEF6FF', color: selectedMemberId === 'self' ? '#fff' : '#0F4C81' }}
              >
                我自己
              </View>
              {familyMembers.map((m) => (
                <View
                  key={m.id}
                  onClick={() => setSelectedMemberId(m.id)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs"
                  style={{ background: selectedMemberId === m.id ? '#0F4C81' : '#EEF6FF', color: selectedMemberId === m.id ? '#fff' : '#0F4C81' }}
                >
                  {m.name}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 🌟 千人千面专属报告（核心壁垒·升首屏）：基于家庭食养画像，本品对当前选购对象的食养参考 */}
        {isFood && personalReport && (
          <View className="mt-3" style={{ padding: '14px 16px', borderRadius: '16px', background: 'linear-gradient(135deg,#EEF6FF,#E3F0FF)', border: '1px solid #BBD4F5' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: '15px', fontWeight: '800', color: '#0F4C81', display: 'block' }}>🌟 为{subjectLabel}定制的食养参考</Text>
              {cohortLabel ? (
                <Text style={{ fontSize: '11px', color: '#0F4C81', background: '#D6E6FB', paddingVertical: '2px', paddingHorizontal: '8px', borderRadius: '999px' }}>{cohortLabel}</Text>
              ) : null}
            </View>
            {cohortLabel ? (
              <Text style={{ fontSize: '12px', color: '#5B7CA6', display: 'block', marginTop: 4 }}>基于你的家庭食养画像，同一款零食不同体质看到的参考不同</Text>
            ) : null}

            {/* 过敏原强预警（最高优先级） */}
            {personalReport.allergenHits.length > 0 && (
              <View style={{ marginTop: 10, padding: '8px 10px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <Text style={{ fontSize: '12px', color: '#DC2626', fontWeight: '700', display: 'block', marginBottom: 4 }}>⚠️ 过敏原提醒</Text>
                {personalReport.allergenHits.map((a) => (
                  <Text key={a.key} style={{ fontSize: '13px', color: '#7F1D1D', display: 'block', lineHeight: '1.6' }}>· 您对{a.name}过敏{a.severity ? `（${a.severity}）` : ''}，本品含相关成分，请谨慎</Text>
                ))}
              </View>
            )}

            {/* 体质 / 慢病参考留意（中性食养话术） */}
            {personalReport.contraindications.length > 0 && (
              <View style={{ marginTop: 8, padding: '8px 10px', borderRadius: '10px', background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <Text style={{ fontSize: '12px', color: '#C2410C', fontWeight: '700', display: 'block', marginBottom: 4 }}>🍂 参考留意</Text>
                {personalReport.contraindications.map((c, i) => (
                  <Text key={i} style={{ fontSize: '13px', color: '#7C2D12', display: 'block', lineHeight: '1.6' }}>· {c}</Text>
                ))}
              </View>
            )}

            {/* 🌿 药食同源专属参考（依你的年龄段）· 核心壁垒：私有目录表服务端匹配，竞品抄不到 */}
            {catalogInsight && (
              <View style={{ marginTop: 10, padding: '10px 12px', borderRadius: '12px', background: '#F0FBF4', border: '1px solid #BBE9CC' }}>
                <Text style={{ fontSize: '13px', color: '#15803D', fontWeight: '800', display: 'block', marginBottom: 6 }}>🌿 药食同源专属参考 · 依你的年龄段</Text>
                {catalogInsight.age_caution_hits.length > 0 && (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={{ fontSize: '12px', color: '#B91C1C', fontWeight: '700', display: 'block', marginBottom: 3 }}>⚠️ 年龄段留意</Text>
                    {catalogInsight.age_caution_hits.map((h) => (
                      <Text key={h.ingredient} style={{ fontSize: '13px', color: '#7F1D1D', display: 'block', lineHeight: '1.6' }}>
                        · {h.ingredient}：{h.cautions.join('、')}
                      </Text>
                    ))}
                  </View>
                )}
                {catalogInsight.nature_summary ? (
                  <Text style={{ fontSize: '13px', color: '#166534', display: 'block', lineHeight: '1.6', marginBottom: 6 }}>{catalogInsight.nature_summary}</Text>
                ) : null}
                {catalogInsight.compatibility_notes.length > 0 && (
                  <View>
                    <Text style={{ fontSize: '12px', color: '#15803D', fontWeight: '700', display: 'block', marginBottom: 3 }}>🤝 性味配伍</Text>
                    {catalogInsight.compatibility_notes.map((n, i) => (
                      <Text key={i} style={{ fontSize: '12px', color: '#166534', display: 'block', lineHeight: '1.6' }}>· {n}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
            {catalogLoading ? (
              <Text style={{ fontSize: '12px', color: '#5B7CA6', display: 'block', marginTop: 10 }}>药食同源参考分析中…</Text>
            ) : null}

            {/* 契合度 + 一句话个性化点评 */}
            <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ alignItems: 'center', flexShrink: 0, marginRight: 12 }}>
                <Text style={{ fontSize: '24px', fontWeight: '800', color: '#0F4C81', display: 'block', lineHeight: '1.1' }}>{personalReport.profileFit}</Text>
                <Text style={{ fontSize: '10px', color: '#5B7CA6', display: 'block', marginTop: 2 }}>契合度</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '14px', color: '#0F4C81', fontWeight: '600', display: 'block', lineHeight: '1.5' }}>{personalReport.comment}</Text>
              </View>
            </View>

            {/* CTA：完善档案让建议更准（承接原底部档案匹配度入口） */}
            <View
              className="mt-3 flex items-center justify-center rounded-xl"
              style={{ paddingVertical: 8, background: '#0F4C81' }}
              onClick={() => Taro.navigateTo({ url: '/pages/food/family/index' })}>
              <Text style={{ fontSize: '14px', color: '#fff', fontWeight: '700' }}>完善家庭食养档案，让建议更准 →</Text>
            </View>

            <Text style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginTop: 8, lineHeight: '1.5' }}>{personalReport.disclaimer}</Text>
          </View>
        )}

        {/* 配料安全：挂载的添加剂安全分级 + 食养成分分析（仅食养食品） */}
        {isFood && <FoodSafetyPanel foodAdditives={foodAdditives} shiyangEntries={shiyangEntries} />}
        {/* 全面安全分析：致敏原 / 营养成分 / 标签合规 / 适宜人群（仅食养食品） */}
        {isFood && safetyReport && <ComprehensiveSafetyReport report={safetyReport} fullLabel />}
        {/* 📣 商家寄语（醒目卡片：暖白底 + 品牌色边条，与配料安全/食疗导购区隔） */}
        {product.description && (
          <View className="mt-3" style={{ padding: '12px 14px', borderRadius: '14px', background: '#FFFAF5', border: '1px solid #F0D9C0', borderLeftWidth: '4px', borderLeftColor: 'hsl(var(--primary))' }}>
            <Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '4px', display: 'block' }}>📣 门店寄语</Text>
            <Text className="text-foreground leading-relaxed" style={{ fontSize: '15px', display: 'block' }}>{shieldCopy(product.description).safe}</Text>
          </View>
        )}
        {/* 礼品模块：药膳手串 / 工艺礼品专属（仅当 product_kind !== 'food' 渲染，与食养模块互斥） */}
        {isGift && <GiftSections product={product} />}
        {/* 🔍 食疗安全分析（统一引擎实时计算，三色预警 + 整体性味 + 引擎商家寄语） */}
        {isFood && therapyReport && (
          <View className="mt-3" style={{ padding: '12px 14px', borderRadius: '16px', background: '#F7F9FF', border: '1px solid #D9E2F3' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: '15px', fontWeight: '700', color: '#1E3A8A', display: 'block' }}>🍃 这口吃得安心吗</Text>
              {NATURE_FEELING[therapyReport.overall_nature_code] ? (
                <Text style={{ fontSize: '12px', color: '#1E3A8A', background: '#E0E7FF', paddingVertical: '2px', paddingHorizontal: '8px', borderRadius: '999px' }}>食用体感 · {NATURE_FEELING[therapyReport.overall_nature_code]}</Text>
              ) : null}
            </View>
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: '18px', fontWeight: '800', color: '#1E3A8A', display: 'block', lineHeight: '1.4' }}>{buildTherapyHeadline(therapyReport).main}</Text>
              <Text style={{ fontSize: '12px', color: '#64748B', display: 'block', marginTop: 2 }}>{buildTherapyHeadline(therapyReport).sub}</Text>
            </View>
            {therapyReport.fit_people ? (
              <View style={{ marginTop: 8, padding: '8px 10px', borderRadius: '10px', background: '#ECFDF3', border: '1px solid #BBF7D0' }}>
                <Text style={{ fontSize: '12px', color: '#16A34A', fontWeight: '700', display: 'block', marginBottom: 2 }}>适合谁</Text>
                <Text style={{ fontSize: '13px', color: '#14532D', display: 'block', lineHeight: '1.6' }}>{therapyReport.fit_people.split('、').slice(0, 3).join('、')}{therapyReport.fit_people.split('、').length > 3 ? ' 等' : ''}</Text>
              </View>
            ) : null}
            {therapyReport.merchant_note ? (
              <View style={{ marginTop: 8, padding: '8px 10px', borderRadius: '10px', background: '#FFFDF7', border: '1px solid #F0E6CF' }}>
                <Text style={{ fontSize: '12px', color: '#C2410C', fontWeight: '700', display: 'block', marginBottom: 2 }}>📣 门店食养寄语（系统生成）</Text>
                <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>{therapyReport.merchant_note}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginTop: 8, lineHeight: '1.5' }}>{therapyReport.disclaimer}</Text>
          </View>
        )}
        {/* 食材食疗智能导购 · 五模块纯展示（读取商家预存成品内容，仅食养食品） */}
        {isFood && product && (() => {
          const input = toFoodTherapyInput(product)
          const tier = classifyProduct(product)
          const tierLabel = tier ? TIER_LABEL[tier] : ''
          const tierColor = tier === 'recommend' ? '#16A34A' : tier === 'caution' ? '#A8552E' : tier === 'avoid' ? '#DC2626' : '#6B7280'
          const stageMod = buildShiyangStageModule(product.ingredients, product.food_stage)
          // 食用小贴士：适宜状态（食材受众 + 适配人群去重）
          const tipAudiences = cleanAudienceTags([
            ...shiyangEntries.flatMap((e) => e.audiences || []),
            ...(foodBenefit?.suitableFor || []),
            ...(input.rec_crowds || []),
          ]).slice(0, 4)
          const eatAmount = stageMod.stage === '补'
            ? '建议每日 1–2 份，作为日常饮食搭配参考，不宜过量。'
            : stageMod.stage === '清' || stageMod.stage === '通'
            ? '建议每日 1–2 份，肠胃敏感者可从小量开始。'
            : '建议每日 1–2 份，随餐或两餐之间食用，细嚼慢咽更舒服。'

          // 人群标签栏：只展示推荐人群（合规过滤疾病定向/恢复期待词）
          const crowdRec = cleanAudienceTags([...(foodBenefit?.suitableFor || []), ...(input.rec_crowds || [])]).slice(0, 4)
          return (
            <View className="mt-3" style={{ padding: '12px 14px', borderRadius: '16px', background: '#F6FBF7', border: '1px solid #D6EFD8' }}>
              <Text className="text-base font-bold text-foreground mb-2" style={{ display: 'block' }}>🍵 日常食养参考</Text>

              {/* 食养特点栏（顶部，plain 表达） */}
              <View className="mb-3" style={{ padding: '8px 10px', borderRadius: '12px', background: '#FFFFFF', border: '1px solid #E3F2E5' }}>
                <Text style={{ fontSize: '15px', fontWeight: '700', color: '#2F5D3A', display: 'block' }}>
                  🍵 食养特点：{stageMod.label}（{stageMod.coreTag}）
                </Text>
                <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6', marginTop: 2 }}>{stageMod.oneLiner}</Text>
                {input.food_category && (
                  <Text style={{ fontSize: '12px', color: '#16A34A', display: 'block', marginTop: 2 }}>
                    分类：{input.food_category}{input.overall_nature ? ` · 食性${input.overall_nature}` : ''}
                  </Text>
                )}
              </View>

              {/* 人群标签栏：3 秒决策 */}
              {crowdRec.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {crowdRec.map((c, i) => (
                    <Text key={'r' + i} style={{ fontSize: '12px', color: '#16A34A', background: '#DCFCE7', paddingVertical: '3px', paddingHorizontal: '8px', borderRadius: '999px', marginRight: 6, marginBottom: 6 }}>✅ {c}</Text>
                  ))}
                </View>
              )}

              {/* 模块1：核心食材食养属性（折叠，默认收起） */}
              {/* 合规提示：PRD 2.1 强制置顶免责声明（浅灰底 + 字号放大），强化普通食品无医疗功效的合规边界 */}
              <View style={{ padding: '12px 14px', borderRadius: '12px', background: '#F3F4F6', border: '1px solid #E5E7EB', marginBottom: 10 }}>
                <Text style={{ fontSize: '14px', fontWeight: '800', color: '#374151', display: 'block', lineHeight: '1.6' }}>⚠️ {FOOD_REFERENCE_DISCLAIMER}</Text>
              </View>
              <CollapsibleSection title="① 核心食材食养属性">
                {stageMod.ingredients.length > 0 ? (
                  <View style={{ border: '1px solid #E3F2E5', borderRadius: '10px', overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', background: '#EAF6EC', padding: '6px 8px' }}>
                      <Text style={{ flex: 2, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>食材</Text>
                      <Text style={{ flex: 1, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>性味</Text>
                      <Text style={{ flex: 3, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>传统食用参考</Text>
                      <Text style={{ flex: 2, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>适配场景</Text>
                    </View>
                    {stageMod.ingredients.map((ing, i) => (
                      <View key={ing.key + i} style={{ flexDirection: 'row', padding: '6px 8px', borderTop: i === 0 ? '0' : '1px solid #EFF6F0' }}>
                        <Text style={{ flex: 2, fontSize: '12px', color: '#1F2937' }}>{ing.icon} {ing.name}</Text>
                        <Text style={{ flex: 1, fontSize: '12px', color: '#6B7280' }}>{ing.nature}</Text>
                        <Text style={{ flex: 3, fontSize: '12px', color: '#4B5563', lineHeight: '1.5' }}>{ing.benefits.join('、')}</Text>
                        <Text style={{ flex: 2, fontSize: '12px', color: '#4B5563', lineHeight: '1.5' }}>{ing.scenarios.join('、')}</Text>
                      </View>
                    ))}
                  </View>
                ) : foodBenefit?.ingredients?.length ? (
                  <View>
                    {foodBenefit.ingredients.map((ing, i) => (
                      <Text key={i} style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>
                        {ing.icon ? `${ing.icon} ` : ''}{ing.name}：{shieldCopy(ing.role).safe}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无说明</Text>
                )}
              </CollapsibleSection>

              {/* 模块2：食养作用（折叠，默认收起） */}
              <CollapsibleSection title="② 食养作用">
                {foodBenefit ? (
                  <View>
                    <Text style={{ fontSize: '13px', fontWeight: 'bold', color: '#D97706', display: 'block', marginTop: 4 }}>🥗 现代营养</Text>
                    {foodBenefit.modernNutrition.map((it, i) => (
                      <Text key={i} style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>· {it.title}：{it.desc}</Text>
                    ))}
                  </View>
                ) : input.positive_effect ? (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>✅ {input.positive_effect}</Text>
                ) : (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无说明</Text>
                )}
              </CollapsibleSection>

              {/* 模块3：人群适配提示（折叠，默认收起） */}
              <CollapsibleSection title="③ 人群适配提示">
                {foodBenefit?.suitableFor?.length ? (
                  <Text style={{ fontSize: '13px', color: '#16A34A', display: 'block', lineHeight: '1.6' }}>🌟 适配人群：{cleanAudienceTags(foodBenefit.suitableFor).join('、')}</Text>
                ) : null}
                {cleanAudienceTags(input.rec_crowds).length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#16A34A', display: 'block', lineHeight: '1.6' }}>🌟 适配人群：{cleanAudienceTags(input.rec_crowds).join('、')}{input.guide_sentence ? `（${input.guide_sentence}）` : ''}</Text>
                )}
                {(!foodBenefit?.suitableFor?.length && !input.rec_crowds?.length) && (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无特定人群标注</Text>
                )}
              </CollapsibleSection>

              {/* 模块4：食养搭配建议（折叠，含同款搭配入口） */}
              <CollapsibleSection title="④ 食养搭配建议">
                {stageMod.comboNarrative ? (
                  <Text style={{ fontSize: '13px', color: '#2F5D3A', display: 'block', lineHeight: '1.6' }}>{stageMod.comboNarrative}</Text>
                ) : null}
                {comboProducts.length > 0 ? (
                  <View className="flex gap-2 flex-wrap" style={{ marginTop: 4 }}>
                    {comboProducts.map((c) => (
                      <View key={c.id}
                        className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-base"
                        onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${c.id}` })}>
                        <Text>{c.name} ¥{c.price}</Text>
                      </View>
                    ))}
                  </View>
                ) : input.match_goods && input.match_goods.length > 0 ? (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6', marginTop: 2 }}>推荐搭配：{input.match_goods.join('、')}</Text>
                ) : (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginTop: 2 }}>暂无搭配推荐</Text>
                )}
                {input.moments_copy && (
                  <Text style={{ fontSize: '12px', color: '#6B7280', display: 'block', lineHeight: '1.6', marginTop: 4 }}>📣 门店分享：{input.moments_copy}</Text>
                )}
              </CollapsibleSection>

              {/* 食用小贴士（建议食用量 + 适宜状态 + 注意事项） */}
              <View className="mb-2" style={{ padding: '8px 10px', borderRadius: '12px', background: '#FFFDF7', border: '1px solid #F0E6CF' }}>
                <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>⑤ 食用小贴士</Text>
                <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>🍽️ 建议食用量：{eatAmount}</Text>
                {tipAudiences.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>🌿 更适合这些日常状态：{tipAudiences.join('、')}</Text>
                )}
                </View>

              {/* 当前勾选状态的分档提示（可选，基于首页筛选器） */}
              {tier && (
                <View className="mb-2 px-2 py-1.5 rounded-xl" style={{ background: tier === 'avoid' ? '#FEE2E2' : tier === 'caution' ? '#FEF3C7' : '#DCFCE7' }}>
                  <Text className="text-base font-bold" style={{ color: tierColor, display: 'block' }}>本单判定：{tierLabel}</Text>
                  {selectedCrowds.length > 0 && (
                    <Text style={{ fontSize: '12px', color: '#4B5563', display: 'block', marginTop: 2, lineHeight: '1.5' }}>
                      依据你勾选的「{selectedCrowds.join('、')}」{selectedScene ? ` · ${selectedScene}` : ''}
                    </Text>
                  )}
                </View>
              )}


              <Text style={{ fontSize: '10px', color: '#9CA3AF', display: 'block', lineHeight: '1.5', marginTop: 6 }}>
                {stageMod.disclaimer}
              </Text>
            </View>
          )
        })()}

        {/* 进入门店 */}
        {product.stores && (
          <View className="mt-4 flex items-center gap-3 py-3 border-t border-border"
            onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${product.store_id}` })}>
            <Icon name="store" size={24} className="text-primary flex-shrink-0" />
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{(product.stores as any)?.name}</Text>
              <Text className="text-base text-muted-foreground">点击进入门店</Text>
            </View>
            <Icon name="chevron-right" size={20} className="text-muted-foreground" />
          </View>
        )}
      </View>

      {/* 数量选择器 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border flex items-center justify-between">
        <Text className="text-xl font-bold text-foreground">购买数量</Text>
        <View className="flex items-center gap-4">
          <View
            className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 ${quantity <= 1 ? 'border-muted bg-muted/50' : 'border-border bg-card'}`}
            hoverClass="none"
            onClick={() => { if (quantity > 1) setQuantity(q => q - 1) }}
          >
            <Text className={`text-2xl font-bold ${quantity <= 1 ? 'text-muted-foreground' : 'text-foreground'}`}>−</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground min-w-8 text-center">{quantity}</Text>
          <View
            className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-border bg-card"
            hoverClass="none"
            onClick={() => {
              const maxStock = (product as any)?.stock || 99
              if (quantity < maxStock) setQuantity(q => q + 1)
            }}
          >
            <Text className="text-2xl font-bold text-foreground">+</Text>
          </View>
        </View>
      </View>

      {/* 详情图片展示 */}
      {product.detail_images && product.detail_images.length > 0 && (
        <View className="mx-4 mt-3">
          <Text className="text-xl font-bold text-foreground mb-2">商品详情</Text>
          <View className="flex flex-col gap-3">
            {product.detail_images.map((img, i) => (
              <Image
                key={i}
                src={img}
                mode="widthFix"
                className="w-full rounded-2xl"
                style={{ display: 'block' }}
                lazyLoad />
            ))}
          </View>
        </View>
      )}

      {/* 安全保障模块（对标秋田满满信任区，仅食养食品） */}
      {isFood && product && (
        <View className="mx-4 mt-3 mb-2 px-4 py-4 rounded-2xl" style={{ background: 'linear-gradient(135deg,#f0fdf4,#fef9e7)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 18 }}>🛡️</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>安全保障</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 13, color: '#16a34a' }}>✓ 智能配料分析</Text>
            </View>
            <View style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 13, color: '#16a34a' }}>✓ 无添加认证</Text>
            </View>
            <View style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 13, color: '#16a34a' }}>✓ 过敏原筛查</Text>
            </View>
            <View style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 13, color: '#16a34a' }}>✓ 食养适配</Text>
            </View>
          </View>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: '#64748b' }}>已通过配料安全引擎分析，可查看完整检测报告</Text>
            <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600', borderBottomWidth: 1, borderBottomColor: '#16a34a' }}
              onClick={() => Taro.navigateTo({ url: `/pages/food/analysis-result/index?product_id=${encodeURIComponent(product.id)}` })}>
              查看检测报告 ›
            </Text>
          </View>
        </View>
      )}

      {/* ============ 资产化②：同体质适配食材（基于用户食养画像精选，提升复购，仅食养食品） ============ */}
      {isFood && matchedProducts.length > 0 && (
        <View className="mx-4 mt-4">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: '15px', fontWeight: '800', color: '#1F2937', display: 'block' }}>🥗 同体质适配食材</Text>
            <Text style={{ fontSize: '11px', color: '#9CA3AF', display: 'block' }}>基于你的食养画像</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {matchedProducts.map((c) => (
              <View key={c.id}
                className="bg-card rounded-2xl border border-border"
                style={{ width: '48%', padding: 10, marginBottom: 8, marginRight: '4%' }}
                onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${c.id}` })}>
                {c.image_url ? (
                  <Image src={c.image_url} style={{ width: '100%', height: 90, borderRadius: 12, marginBottom: 6 }} mode="aspectFill" lazyLoad />
                ) : null}
                <Text style={{ fontSize: '13px', fontWeight: '700', color: '#1F2937', display: 'block', lineHeight: '1.3' }} numberOfLines={1}>{c.name}</Text>
                <Text style={{ fontSize: '13px', color: '#EA580C', fontWeight: '700', display: 'block', marginTop: 2 }}>¥{c.price}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 食养食品通用食用温馨提示（普通食品，无医疗调理作用；礼品不展示） */}
      {isFood && (
      <View className="mx-4 mt-3 mb-2 px-3 py-3 rounded-xl" style={{ background: '#F8FAF9', border: '1px solid #E3EDEC' }}>
        <Text style={{ fontSize: '11px', color: '#6B7280', display: 'block', lineHeight: '1.6' }}>{PRODUCT_DISCLAIMER}</Text>
      </View>
      )}

      {/* 问问食养师：商品详情页最高转化咨询入口（食养智能化主线落点，下沉替代首页 FAB） */}
      <View className="mx-4 mt-3 mb-2 px-4 py-3 rounded-xl flex items-center justify-between active:scale-[0.99]"
        style={{ background: 'linear-gradient(135deg,#EAF3DE 0%,#F8FAF9 100%)', border: '1px solid #C0DD97' }}
        hoverClass="none"
        onClick={() => Taro.navigateTo({ url: `/pages/food/consult/index?product_name=${encodeURIComponent(product.name)}${product.store_id ? `&store_id=${encodeURIComponent(product.store_id)}` : ''}` })}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#27500A', display: 'block' }}>🌿 问问食养师</Text>
          <Text style={{ fontSize: 12, color: '#3B6D11', display: 'block', marginTop: 2, lineHeight: 1.4 }}>这件「{product.name}」孩子 / 老人 / 孕妈能不能吃？一键问</Text>
        </View>
        <View className="px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: '#639922' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>去问问</Text>
        </View>
      </View>

      {/* 底部操作栏：左 3 个工具图标（缩小去边框）+ 右侧双主操作；移除「合计」（主图区已显示），主操作「立即支付」加阴影 + 不截断。
          PRD 2.5：容器 pointerEvents:none 实现下层穿透，按钮/工具区 pointerEvents:auto 保证可交互；内容区 paddingBottom 动态等于栏高（含安全区） */}
      <View id="bottomBar" className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-3 flex items-center gap-2"
        style={{ paddingTop: '10px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)', pointerEvents: 'none' }}>
        {/* 左侧：工具（购物车 / 收藏 / 分享）— 缩小到 40×40，弱化边框，主色 Icon 提示 */}
        <View className="flex items-center gap-1.5" style={{ pointerEvents: 'auto' }}>
          {/* 购物车图标入口 */}
          <View className="relative flex-shrink-0" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
            <View className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center">
              <View className="text-foreground"><Icon name="bag" size={20} /></View>
            </View>
            {cartCount > 0 && (
              <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary flex items-center justify-center px-1">
                <Text className="text-white text-[10px] font-bold leading-none">{cartCount > 99 ? '99+' : cartCount}</Text>
              </View>
            )}
          </View>
          {/* 收藏按钮 */}
          <View className="w-10 h-10 rounded-xl bg-muted/60 flex-shrink-0 flex items-center justify-center"
            onClick={handleToggleFav}>
            {favLoading
              ? <Icon name="loading" size={20} className="text-primary animate-spin" />
              : <Icon name="heart" size={20} className={isFav ? 'text-red-400' : 'text-foreground'} />}
          </View>
          {/* 分享按钮 */}
          <Button openType="share"
            className="w-10 h-10 rounded-xl bg-muted/60 flex-shrink-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.04)', padding: 0, lineHeight: 0 }}>
            <Icon name="share-variant" size={20} className="text-foreground" />
          </Button>
        </View>
        {/* 主操作区：双按钮均 flex-1，"立即支付"略宽作主操作，加阴影；文字 whiteSpace:nowrap 彻底解决截断 */}
        {/* 加入购物车：白底品牌色描边 */}
        <Button type="default"
          className="flex-1 flex items-center justify-center leading-none rounded-xl bg-card"
          style={{ border: '1.5px solid hsl(var(--primary))', pointerEvents: 'auto' }}
          onClick={handleAddCart}>
          <View className="py-2.5 text-[15px] font-bold text-primary" style={{ whiteSpace: 'nowrap' }}>
            {adding ? '加入中...' : '加入购物车'}
          </View>
        </Button>
        {/* 立即支付：白底 + 红字 + 红边框 + 红阴影，突出主操作（用户要求红色字体标注） */}
        <Button type="default"
          className="flex-[1.2] flex items-center justify-center leading-none rounded-xl bg-card"
          style={{ border: '1.5px solid hsl(var(--destructive))', boxShadow: '0 4px 12px hsl(var(--destructive) / 0.30)', pointerEvents: 'auto' }}
          onClick={handleBuyNow}>
          <View className="py-2.5 text-[15px] font-bold text-destructive" style={{ whiteSpace: 'nowrap' }}>立即支付</View>
        </Button>
      </View>


    </View>
  )
}
