// @title 商品详情
import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
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
import { getFoodBenefit } from '@/data/foodBenefits'
import { analyzeFoodLabel, type ComprehensiveSafetyReport as ReportType } from '@/utils/safety-analysis'
import { PRODUCT_DISCLAIMER } from '@/utils/compliance/shield'
import { buildTherapyReport, buildTherapyHeadline, NATURE_FEELING, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'

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

export default function ProductPage() {
  const { user } = useAuth()
  const { selectedCrowds, selectedScene, classifyProduct } = useFoodTherapy()
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
  const [expandCautions, setExpandCautions] = useState(false)
  const [adding, setAdding] = useState(false)
  const cartCount = useCartCount()
  const [myCode, setMyCode] = useState('')
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
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

  // 构建媒体列表：主图 + 副图 + 视频（视频放最后）
  const mediaList = useMemo(() => {
    if (!product) return []
    const list: { type: 'image'; url: string }[] = []
    const main = product.main_image || product.image_url
    if (main) list.push({ type: 'image', url: main })
    ;(product.sub_images || []).forEach(url => {
      if (url && !list.some(m => m.url === url)) list.push({ type: 'image', url })
    })
    return list
  }, [product])

  const videoUrl = useMemo(() => product?.video_url || '', [product])

  // 统一食疗引擎：拉取食材字典 + 实时计算三色预警（C 端详情页复用商家端同一套算法）
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  const [showCrowdPopup, setShowCrowdPopup] = useState(false)
  const crowdPopupShownForRef = useRef<string | null>(null)
  useEffect(() => {
    getFoodIngredients().then(setIngredientDict).catch(() => setIngredientDict([]))
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

  // 特殊人群自动弹窗：进店即按三色预警提示，每个商品仅弹一次
  useEffect(() => {
    if (therapyReport && therapyReport.warnings.length > 0 && crowdPopupShownForRef.current !== id) {
      crowdPopupShownForRef.current = id
      setShowCrowdPopup(true)
    }
  }, [therapyReport, id])

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

  return (
    <View className="min-h-screen bg-background pb-28">
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
                <Image src={m.url} mode="aspectFill" className="w-full h-full" style={{ display: 'block' }} />
              </SwiperItem>
            ))}
          </Swiper>
        )}

        {/* 媒体计数指示 */}
        {mediaList.length > 1 && (
          <View className="absolute bottom-3 right-4 px-2 py-0.5 rounded-full bg-black/50 text-white text-xs">
            {currentMediaIndex + 1}/{mediaList.length}
          </View>
        )}

        {/* 有视频标识 */}
        {videoUrl && (
          <View className="absolute bottom-3 left-4 px-2 py-0.5 rounded-full bg-red-500/80 text-white text-xs flex items-center gap-1">
            <Icon name="video" size={14} />
            <Text>含视频</Text>
          </View>
        )}
      </View>

      {/* 视频播放区域 */}
      {videoUrl && (
        <View className="mx-4 mt-3 rounded-2xl overflow-hidden bg-black">
          <Video
            src={videoUrl}
            className="w-full"
            style={{ height: '200px' }}
            controls
            showCenterPlayBtn
            enableProgressGesture
            objectFit="contain" />
        </View>
      )}

      {/* 价格信息卡 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        {/* 分享赚佣提示 */}
        {myCode && (
          <View className="mb-3 py-2 px-3 rounded-xl bg-primary/10 flex items-center gap-2">
            <Icon name="share-variant" size={20} className="text-primary" />
            <Text className="text-xl text-primary font-bold">分享此商品，好友购买你可获佣金</Text>
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
        {/* 生产日期 / 保质期（来自在售批次，与商家端批次入库同步） */}
        {batchDisplay && (
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
        {/* 配料安全：挂载的添加剂安全分级 + 食养成分分析 */}
        <FoodSafetyPanel foodAdditives={foodAdditives} shiyangEntries={shiyangEntries} />
        {/* 全面安全分析：致敏原 / 营养成分 / 标签合规 / 适宜人群 */}
        {safetyReport && <ComprehensiveSafetyReport report={safetyReport} fullLabel />}
        {/* 📣 商家寄语（醒目卡片：暖白底 + 品牌色边条，与配料安全/食疗导购区隔） */}
        {product.description && (
          <View className="mt-3" style={{ padding: '12px 14px', borderRadius: '14px', background: '#FFFAF5', border: '1px solid #F0D9C0', borderLeftWidth: '4px', borderLeftColor: 'hsl(var(--primary))' }}>
            <Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '4px', display: 'block' }}>📣 商家寄语</Text>
            <Text className="text-foreground leading-relaxed" style={{ fontSize: '15px', display: 'block' }}>{product.description}</Text>
          </View>
        )}
        {/* 🔍 食疗安全分析（统一引擎实时计算，三色预警 + 整体性味 + 引擎商家寄语） */}
        {therapyReport && (
          <View className="mt-3" style={{ padding: '12px 14px', borderRadius: '16px', background: '#F7F9FF', border: '1px solid #D9E2F3' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: '15px', fontWeight: '700', color: '#1E3A8A', display: 'block' }}>🍃 这口吃得安心吗</Text>
              {NATURE_FEELING[therapyReport.overall_nature_code] ? (
                <Text style={{ fontSize: '12px', color: '#1E3A8A', background: '#E0E7FF', paddingVertical: '2px', paddingHorizontal: '8px', borderRadius: '999px' }}>体感 · {NATURE_FEELING[therapyReport.overall_nature_code]}</Text>
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
            {/* 过敏原警示：强制常驻显著（满足消法第18条警示义务 + GB7718 过敏原标示 + 微信平台要求，不得隐藏/弱化） */}
            {therapyReport.warnings.filter((w) => w.level === 'red').length > 0 && (
              <View style={{ marginTop: 8 }}>
                {therapyReport.warnings.filter((w) => w.level === 'red').map((w, i) => (
                  <View key={w.code + i} style={{ flexDirection: 'row', alignItems: 'flex-start', background: '#FEE2E2', borderRadius: '10px', padding: '8px 10px', marginTop: i === 0 ? 0 : 6, border: '1px solid #FCA5A5' }}>
                    <Text style={{ fontSize: '13px', marginRight: 4, lineHeight: '1.5' }}>🔴</Text>
                    <Text style={{ fontSize: '13px', color: '#B91C1C', flex: 1, lineHeight: '1.5' }}>
                      <Text style={{ fontWeight: '700' }}>{w.label}：</Text>{w.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {/* 食用注意（慎食/慢病）：建议性质，默认折叠，用户主动展开——信息可获取不隐藏，亦不靠排版误导 */}
            {(() => {
              const cautions = therapyReport.warnings.filter((w) => w.level !== 'red')
              if (cautions.length === 0) return null
              return (
                <View style={{ marginTop: 8 }}>
                  <View onClick={() => setExpandCautions((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <Text style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>小提醒（{cautions.length}）</Text>
                    <Text style={{ fontSize: '12px', color: '#94A3B8' }}>{expandCautions ? '收起 ▲' : '查看详情 ›'}</Text>
                  </View>
                  {expandCautions && (
                    <View style={{ marginTop: 6 }}>
                      {cautions.map((w, i) => {
                        const c = w.level === 'orange' ? { bg: '#FEF3C7', fg: '#A8552E', icon: '🟠' } : { bg: '#DBEAFE', fg: '#2563EB', icon: '🔵' }
                        return (
                          <View key={w.code + i} style={{ flexDirection: 'row', alignItems: 'flex-start', background: c.bg, borderRadius: '10px', padding: '6px 8px', marginTop: i === 0 ? 0 : 6 }}>
                            <Text style={{ fontSize: '13px', marginRight: 4, lineHeight: '1.5' }}>{c.icon}</Text>
                            <Text style={{ fontSize: '13px', color: c.fg, flex: 1, lineHeight: '1.5' }}>
                              <Text style={{ fontWeight: '700' }}>{w.label}：</Text>{w.text}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })()}
            {therapyReport.merchant_note ? (
              <View style={{ marginTop: 8, padding: '8px 10px', borderRadius: '10px', background: '#FFFDF7', border: '1px solid #F0E6CF' }}>
                <Text style={{ fontSize: '12px', color: '#C2410C', fontWeight: '700', display: 'block', marginBottom: 2 }}>📣 商家食养寄语（系统生成）</Text>
                <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>{therapyReport.merchant_note}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginTop: 8, lineHeight: '1.5' }}>{therapyReport.disclaimer}</Text>
          </View>
        )}
        {/* 食材食疗智能导购 · 五模块纯展示（读取商家预存成品内容） */}
        {product && (() => {
          const input = toFoodTherapyInput(product)
          const tier = classifyProduct(product)
          const tierLabel = tier ? TIER_LABEL[tier] : ''
          const tierColor = tier === 'recommend' ? '#16A34A' : tier === 'caution' ? '#A8552E' : tier === 'avoid' ? '#DC2626' : '#6B7280'
          const stageMod = buildShiyangStageModule(product.ingredients, product.food_stage)
          // 食用小贴士：适宜状态（食材受众 + 适配人群去重）
          const tipAudiences = Array.from(new Set([
            ...shiyangEntries.flatMap((e) => e.audiences || []),
            ...(foodBenefit?.suitableFor || []),
            ...(input.rec_crowds || []),
          ])).slice(0, 4)
          const eatAmount = stageMod.stage === '补'
            ? '建议每日 1–2 份，作为日常营养补充，不宜过量。'
            : stageMod.stage === '清' || stageMod.stage === '通'
            ? '建议每日 1–2 份，适量为宜；肠胃敏感者可从小量开始。'
            : '建议每日 1–2 份，随餐或两餐之间食用，细嚼慢咽更舒服。'

          // 人群决策标签（推荐 / 适量 / 不推荐）
          const crowdRec = Array.from(new Set([...(foodBenefit?.suitableFor || []), ...(input.rec_crowds || [])])).slice(0, 4)
          const crowdCautious = Array.from(new Set(input.cautious_crowds || [])).slice(0, 4)
          const crowdForbidden = Array.from(new Set(input.forbidden_crowds || [])).slice(0, 4)
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
                    分类：{input.food_category}{input.overall_nature ? ` · 整体食性偏${input.overall_nature}（温和食养，适量为宜）` : ''}
                  </Text>
                )}
              </View>

              {/* 人群标签栏：3 秒决策 */}
              {(crowdRec.length > 0 || crowdCautious.length > 0 || crowdForbidden.length > 0) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {crowdRec.map((c, i) => (
                    <Text key={'r' + i} style={{ fontSize: '12px', color: '#16A34A', background: '#DCFCE7', paddingVertical: '3px', paddingHorizontal: '8px', borderRadius: '999px', marginRight: 6, marginBottom: 6 }}>✅ {c}</Text>
                  ))}
                  {crowdCautious.map((c, i) => (
                    <Text key={'c' + i} style={{ fontSize: '12px', color: '#A8552E', background: '#FEF3C7', paddingVertical: '3px', paddingHorizontal: '8px', borderRadius: '999px', marginRight: 6, marginBottom: 6 }}>⚠️ 适量 {c}</Text>
                  ))}
                  {crowdForbidden.map((c, i) => (
                    <Text key={'f' + i} style={{ fontSize: '12px', color: '#DC2626', background: '#FEE2E2', paddingVertical: '3px', paddingHorizontal: '8px', borderRadius: '999px', marginRight: 6, marginBottom: 6 }}>❌ 不推荐 {c}</Text>
                  ))}
                </View>
              )}

              {/* 模块1：核心食材食养属性（折叠，默认收起） */}
              <CollapsibleSection title="① 核心食材食养属性">
                {stageMod.ingredients.length > 0 ? (
                  <View style={{ border: '1px solid #E3F2E5', borderRadius: '10px', overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', background: '#EAF6EC', padding: '6px 8px' }}>
                      <Text style={{ flex: 2, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>食材</Text>
                      <Text style={{ flex: 1, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>性味</Text>
                      <Text style={{ flex: 3, fontSize: '11px', color: '#2F5D3A', fontWeight: '700' }}>传统食养作用</Text>
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
                        {ing.icon ? `${ing.icon} ` : ''}{ing.name}：{ing.role}
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
                    <Text style={{ fontSize: '13px', fontWeight: 'bold', color: '#16A34A', display: 'block', marginTop: 8 }}>🌿 中医食疗</Text>
                    {foodBenefit.tcmTherapy.map((it, i) => (
                      <Text key={i} style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>· {it.title}：{it.desc}</Text>
                    ))}
                  </View>
                ) : input.positive_effect ? (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>✅ {input.positive_effect}</Text>
                ) : (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无说明</Text>
                )}
                {!foodBenefit && input.risk_warning && (
                  <Text style={{ fontSize: '13px', color: '#A8552E', display: 'block', lineHeight: '1.6', marginTop: 4 }}>⚠️ 风险提示：{input.risk_warning}</Text>
                )}
              </CollapsibleSection>

              {/* 模块3：人群适配提示（折叠，默认收起） */}
              <CollapsibleSection title="③ 人群适配提示">
                {foodBenefit?.suitableFor?.length ? (
                  <Text style={{ fontSize: '13px', color: '#16A34A', display: 'block', lineHeight: '1.6' }}>🌟 适配人群：{foodBenefit.suitableFor.join('、')}</Text>
                ) : null}
                {input.rec_crowds && input.rec_crowds.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#16A34A', display: 'block', lineHeight: '1.6' }}>🌟 适配人群：{input.rec_crowds.join('、')}{input.guide_sentence ? `（${input.guide_sentence}）` : ''}</Text>
                )}
                {input.cautious_crowds && input.cautious_crowds.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#A8552E', display: 'block', lineHeight: '1.6', marginTop: 2 }}>🟡 慎食人群：{input.cautious_crowds.join('、')}{input.cautious_notes ? `（${input.cautious_notes}）` : ''}</Text>
                )}
                {input.forbidden_crowds && input.forbidden_crowds.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#DC2626', display: 'block', lineHeight: '1.6', marginTop: 2 }}>🔴 不建议人群：{input.forbidden_crowds.join('、')}{input.forbidden_reasons ? `（${input.forbidden_reasons}）` : ''}</Text>
                )}
                {(!foodBenefit?.suitableFor?.length && !input.rec_crowds?.length && !input.cautious_crowds?.length && !input.forbidden_crowds?.length) && (
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

              {/* P2 闭环联动：体质自测入口 + 会员引导 */}
              <View style={{ marginTop: 10, gap: 8 }}>
                <View
                  className="flex items-center justify-center"
                  style={{ paddingVertical: 10, borderRadius: 12, background: 'hsl(var(--primary))' }}
                  onClick={() => Taro.navigateTo({ url: '/pages/food/constitution-test/index' })}
                >
                  <Text style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>🧪 测一测是否适合我的体质</Text>
                </View>
                <View
                  className="flex items-center justify-center"
                  style={{ paddingVertical: 8, borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA' }}
                  onClick={() => Taro.navigateTo({ url: '/pages/user/index' })}
                >
                  <Text style={{ color: '#C2410C', fontSize: '13px' }}>👑 会员可查看专属个人食养方案</Text>
                </View>
              </View>

              {/* 食用小贴士（建议食用量 + 适宜状态 + 注意事项） */}
              <View className="mb-2" style={{ padding: '8px 10px', borderRadius: '12px', background: '#FFFDF7', border: '1px solid #F0E6CF' }}>
                <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>⑤ 食用小贴士</Text>
                <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>🍽️ 建议食用量：{eatAmount}</Text>
                {tipAudiences.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>🌿 更适合这些日常状态：{tipAudiences.join('、')}</Text>
                )}
                <Text style={{ fontSize: '13px', color: '#A8552E', display: 'block', lineHeight: '1.6' }}>
                  ⚠️ 注意事项：如对坚果、乳制品、蛋类等过敏，请先查看配料表；3 岁以下幼儿及咀嚼能力较弱者，请在家长看护下食用。
                </Text>
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

              {/* 模块5：底部忌口警示 */}
              {input.taboo_warning && (
                <View className="mt-1 px-2 py-2 rounded-xl" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
                  <Text className="text-base font-bold" style={{ color: '#B91C1C', display: 'block' }}>⚠️ 忌口警示</Text>
                  <Text style={{ fontSize: '12px', color: '#7F1D1D', display: 'block', marginTop: 2, lineHeight: '1.5' }}>{input.taboo_warning}</Text>
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
                style={{ display: 'block' }} />
            ))}
          </View>
        </View>
      )}

      {/* 所有商品通用食用温馨提示（普通食品，无医疗调理作用） */}
      <View className="mx-4 mt-3 mb-2 px-3 py-3 rounded-xl" style={{ background: '#F8FAF9', border: '1px solid #E3EDEC' }}>
        <Text style={{ fontSize: '11px', color: '#6B7280', display: 'block', lineHeight: '1.6' }}>{PRODUCT_DISCLAIMER}</Text>
      </View>

      {/* 底部操作栏：左 3 个工具图标（缩小去边框）+ 右侧双主操作；移除「合计」（主图区已显示），主操作「立即支付」加阴影 + 不截断 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-3 flex items-center gap-2"
        style={{ paddingTop: '10px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}>
        {/* 左侧：工具（购物车 / 收藏 / 分享）— 缩小到 40×40，弱化边框，主色 Icon 提示 */}
        <View className="flex items-center gap-1.5">
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
          style={{ border: '1.5px solid hsl(var(--primary))' }}
          onClick={handleAddCart}>
          <View className="py-2.5 text-[15px] font-bold text-primary" style={{ whiteSpace: 'nowrap' }}>
            {adding ? '加入中...' : '加入购物车'}
          </View>
        </Button>
        {/* 立即支付：白底 + 红字 + 红边框 + 红阴影，突出主操作（用户要求红色字体标注） */}
        <Button type="default"
          className="flex-[1.2] flex items-center justify-center leading-none rounded-xl bg-card"
          style={{ border: '1.5px solid hsl(var(--destructive))', boxShadow: '0 4px 12px hsl(var(--destructive) / 0.30)' }}
          onClick={handleBuyNow}>
          <View className="py-2.5 text-[15px] font-bold text-destructive" style={{ whiteSpace: 'nowrap' }}>立即支付</View>
        </Button>
      </View>

      {/* 特殊人群自动弹窗：三色预警重点提示，可一键关闭（每个商品仅弹一次） */}
      {showCrowdPopup && therapyReport && (
        <View style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <View style={{ width: '100%', maxWidth: '320px', background: '#fff', borderRadius: '16px', padding: '18px 16px' }}>
            <Text style={{ fontSize: '17px', fontWeight: '700', color: '#1E3A8A', display: 'block', marginBottom: 4 }}>🔍 食疗安全提示</Text>
            <Text style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: 10, lineHeight: '1.5' }}>{product?.name} 的食养安全要点，请按需查看</Text>
            {therapyReport.fit_people ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', background: '#ECFDF3', borderRadius: '10px', padding: '7px 9px', marginBottom: 8 }}>
                <Text style={{ fontSize: '13px', marginRight: 5, lineHeight: '1.5' }}>✅</Text>
                <Text style={{ fontSize: '13px', color: '#14532D', flex: 1, lineHeight: '1.5' }}>{therapyReport.fit_people}</Text>
              </View>
            ) : null}
            {therapyReport.warnings.map((w, i) => {
              const c = w.level === 'red' ? { bg: '#FEE2E2', fg: '#DC2626', icon: '🔴' } : w.level === 'orange' ? { bg: '#FEF3C7', fg: '#A8552E', icon: '🟠' } : { bg: '#DBEAFE', fg: '#2563EB', icon: '🔵' }
              return (
                <View key={w.code + i} style={{ flexDirection: 'row', alignItems: 'flex-start', background: c.bg, borderRadius: '10px', padding: '7px 9px', marginTop: i === 0 ? 0 : 6 }}>
                  <Text style={{ fontSize: '14px', marginRight: 5, lineHeight: '1.5' }}>{c.icon}</Text>
                  <Text style={{ fontSize: '13px', color: c.fg, flex: 1, lineHeight: '1.5' }}>
                    <Text style={{ fontWeight: '700' }}>{w.label}：</Text>{w.text}
                  </Text>
                </View>
              )
            })}
            <View
              onClick={() => setShowCrowdPopup(false)}
              style={{ marginTop: 14, paddingVertical: 10, borderRadius: 12, background: 'hsl(var(--primary))', alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: '15px', fontWeight: '700' }}>我知道了</Text>
            </View>
          </View>
        </View>
      )}

    </View>
  )
}
