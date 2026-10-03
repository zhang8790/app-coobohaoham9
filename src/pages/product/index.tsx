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
import SectionTitle from '@/components/SectionTitle'
import TrustChip from '@/components/TrustChip'
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
import { shieldCopy, cleanAudienceTags } from '@/utils/compliance/shield'
import { buildTherapyReport, buildTherapyHeadline, isFoodProduct, NATURE_FEELING, deriveFitConstitution, deriveFitConstitutionTypes, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'

// 模块级缓存：食材字典（食养引擎基础数据）仅拉一次，跨商品跳转不再重复请求（PRD 4.1）
let ingredientDictPromise: Promise<FoodIngredientRow[]> | null = null

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
 const [open, setOpen] = useState(defaultOpen)
 return (
 <View className="mb-3">
 <View
 onClick={() => setOpen((v) => !v)}
 style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: '4px', paddingHorizontal: '2px', background: open ? 'var(--color-herb-50)' : 'transparent', borderRadius: '8px' }}
 >
 <Text className="text-base font-bold text-foreground" style={{ display: 'block' }}>{title}</Text>
 <Text style={{ fontSize: '26rpx', color: 'var(--muted-foreground)' }}>{open ? '收起 ' : '展开 '}</Text>
 </View>
 {open && <View style={{ marginTop: 6 }}>{children}</View>}
 </View>
 )
}

/** 食养适配行：标签 + 药丸；无标签整行不渲染（不展示空壳） */
function TagRow({ label, tags }: { label: string; tags: string[] }) {
 if (!tags || tags.length === 0) return null
 return (
  <View style={{ marginTop: 12 }}>
   <Text className="text-base font-bold text-foreground" style={{ display: 'block' }}>{label}</Text>
   <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
    {tags.map((c, i) => (
     <Text key={label + i} style={{ fontSize: '24rpx', color: 'var(--color-herb-600)', background: 'var(--color-herb-200)', paddingVertical: '3px', paddingHorizontal: '8px', borderRadius: '999px', marginRight: 6, marginBottom: 6 }}>{c}</Text>
    ))}
   </View>
  </View>
 )
}

// 首屏信任锚点：每条都对应真实能力，绝不夸大（更信任的底层是「可验证」）
// 已抽离为共享组件 src/components/TrustChip（全站复用，详见该组件）

export default function ProductPage() {
 const { user } = useAuth()
 const { classifyProduct, familyMembers, selectedMemberId } = useFoodTherapy()
 const { id, expiryEp, expiryBatch, referralCode } = useMemo(() => {
 const params = Taro.getCurrentInstance().router?.params
 const rawId = params?.id ? decodeURIComponent(params.id) : ''
 // 临期价参数（ep=单价 / batch=批次）：早期「临期特惠」入口页已移除，但临期价透传路径保留——
 // 实际成交价由 createOrderV2 按 batch_id 在服务端从 v_near_expiry_products 校验套用（防资损，前端无法伪造）。
 const ep = params?.ep ? Number(decodeURIComponent(params.ep)) : 0
 const batch = params?.batch ? decodeURIComponent(params.batch) : ''
 // 推广来源（分享/邀请码）：分享卡片进商品详情时携带 ref/inviter，收藏时记录以还原锁客（审计修复 B）
 const ref = params?.ref ? String(params.ref) : params?.inviter ? String(params.inviter) : ''
 return { id: rawId, expiryEp: ep, expiryBatch: batch, referralCode: ref }
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
  // 媒体图加载淡入：消除「先纯色占位、图到位才切换」的突兀闪跳
  const [imgLoaded, setImgLoaded] = useState<Record<number, boolean>>({})
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
 // 传入商品食疗标签(health_tag)，让「适合人群」按中医体质/证型辨证生成
 return buildTherapyReport(product.name, inputs, (product as any)?.health_tag)
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
 // 性能：三请求互相独立 → 并行（原先件数后两连 = 多两次串行往返）
 const [, favStatus, { data }] = await Promise.all([
 refreshCartCount(),
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
 // 商品详情页文本仅为「名称+描述」，并非完整标签：不能按完整标签口径做合规判定，
 // 否则会把「平台标签录入完整度」误当「商品合规性」（误报 9% + 缺失 SC 许可证），并错误倒扣安全分。
 isFullLabel: false,
 })
 }, [product, foodAdditives])

// 菜品级食养作用：原材料食材组合的现代营养 + 中医食疗（演示用，按 id/名称匹配）
const foodBenefit = useMemo(() => getFoodBenefit(product), [product])

// 商品卡分享：一定是产品（商品主图 + 商品详情路径），并注入食疗分档
 useShareAppMessage(() => {
 if (!product) return { title: '来店有喜', path: '/pages/product/index' }
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
 if (!product) return { title: '来店有喜', query: '', imageUrl: '' }
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
 const { isFav: newFav } = await toggleFavorite(product.id, referralCode)
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
 // 统一走商品类型闸门（与首页/好物页/门店页同源），避免多处各写一份判断导致漂移
 const isFood = isFoodProduct(product)
 const isGift = !isFood

 return (
 <View className="min-h-screen bg-background" style={{ paddingBottom: barH }} aria-label="商品详情">
 {/* 商品媒体轮播 + 顶部返回 + 购物车角标 */}
 <View className="relative">
 {/* 主图 + 副图轮播 */}
 {mediaList.length > 0 && (
 <Swiper
 current={currentMediaIndex}
 onChange={e => setCurrentMediaIndex(e.detail.current)}
 className="w-full"
 style={{ height: '560rpx', background: 'hsl(var(--muted))' }}
 indicatorDots={mediaList.length > 1}
 indicatorColor="rgba(255,255,255,0.4)"
 indicatorActiveColor="#ffffff"
 circular={mediaList.length > 1}
 autoplay={mediaList.length > 1 && mediaList.every((m) => m.type === 'image')}
 >
 {mediaList.map((m, i) => (
 <SwiperItem key={i}>
 {m.type === 'video' ? (
 <Video src={m.url} className="w-full h-full" style={{ display: 'block' }} controls showCenterPlayBtn enableProgressGesture objectFit="contain" />
 ) : (
 <Image src={m.url} mode="aspectFill" className="w-full h-full" style={{ display: 'block', opacity: imgLoaded[i] ? 1 : 0, transition: 'opacity 0.3s ease' }} lazyLoad={i !== 0} onLoad={() => setImgLoaded(s => ({ ...s, [i]: true }))} />
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
 <View className="flex items-center gap-3">
 <Text className="text-3xl font-bold text-primary">¥{displayPrice}</Text>
 {/* 临期特惠：仅保留防损类临期价提示（价值主义战略：C 端不展示普通折扣/划线/社会证明） */}
 {expiryEp > 0 && expiryEp < Number(product.price || 0) && (
 <Text className="text-xl text-muted-foreground line-through">¥{product.price}</Text>
 )}
 {expiryEp > 0 && expiryEp < Number(product.price || 0) && (
 <Text className="px-2 py-0.5 rounded-full bg-destructive/10 text-xl font-bold text-destructive">
 临期省¥{(Number(product.price || 0) - expiryEp).toFixed(2)}
 </Text>
 )}
 </View>
 <View className="text-2xl font-bold text-foreground mt-3 leading-tight">{product.name}</View>
 {/* 首屏信任锚点：每条都对应真实能力，不夸大（更信任的底层是「可验证」） */}
 <View className="mt-2 flex flex-wrap gap-2">
{(safetyReport || foodAdditives.length > 0 || therapyReport) && (<TrustChip icon="" label="已检配料" />)}
{batchDisplay && (<TrustChip icon="" label="批次可溯" />)}
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

 </View>

 {/* 购买数量：紧随价格/门店，属于下单前的配置区（与底部结算栏呼应） */}
 <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border flex items-center justify-between">
 <View>
 <Text className="text-xl font-bold text-foreground block">购买数量</Text>
 <Text className="text-xs text-muted-foreground block mt-0.5">小计 ¥{totalPrice}</Text>
 </View>
 <View className="flex items-center gap-4">
 <View
 className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 ${quantity <= 1 ? 'border-muted' : 'border-border bg-card'}`}
 style={quantity <= 1 ? { backgroundColor: 'hsl(var(--muted) / 0.5)' } : undefined}
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


      {/* 分区②+③ 合并：食安与食养（配方安全 + 食养参考，同属「吃进去什么 / 安不安全」，合并为单卡减少顶层分区标题） */}
      {isFood && (
        <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
          <SectionTitle iconName="shield" title="食养与食安" />

          {/* 食养适配三轴：人群 / 场景 / 体质 —— 有数据才渲染对应行，避免空壳 */}
          {product && (() => {
            const input = toFoodTherapyInput(product)
            // ① 适用人群：由商品功效标签(health_tag)经 HEALTH_TAG_FIT_MAP 推导，独立于食材；
            // 引擎 buildTherapyReport 仅在商品有匹配食材时才跑，没配食材的商品此前人群全空。
            // 这里复用同一映射 + 「适合X」受众透传，有 health_tag 即可生成（体虚怕冷/脾胃虚寒…）。
            const { crowdTags: healthCrowd } = deriveFitConstitution((product as any)?.health_tag)
            const FIT_LABEL_MAP: Record<string, string> = {
              '适合儿童': '儿童',
              '适合银发': '银发长辈',
              '适合孕产': '孕产女性',
              '适合熬夜': '熬夜人群',
              '适合睡前': '睡眠不佳',
              '适合体虚': '体虚人群',
              '适合肠胃虚弱': '肠胃虚弱',
            }
            const healthTagCrowd = ((product as any)?.health_tag || [])
              .map((t: string) => FIT_LABEL_MAP[t] || (t.startsWith('适合') ? t.slice(2) : ''))
              .filter(Boolean)
            const crowdRec = cleanAudienceTags([
              ...((product as any)?.fit_crowd_tags || []),
              ...(therapyReport?.fit_crowd_tags || []),
              ...healthCrowd,
              ...healthTagCrowd,
              ...(foodBenefit?.suitableFor || []),
              ...(input.rec_crowds || []),
            ]).slice(0, 6)
            // ② 适用场景：商家填的 scene_tags（已回填真实食品）；无则整行不渲染
            const sceneRec = cleanAudienceTags((product as any)?.scene_tags || []).slice(0, 6)
            // ③ 适配体质：由 health_tag 经 HEALTH_TAG_CONSTITUTION_MAP 推导九体质（阳虚质/阴虚质…）
            const constitutionRec = deriveFitConstitutionTypes((product as any)?.health_tag).slice(0, 6)
            // 三轴全空 → 整块不渲染（不展示标题 + 暂未提供 空壳）
            if (crowdRec.length === 0 && sceneRec.length === 0 && constitutionRec.length === 0) return null
            return (
              <View style={{ marginTop: 12 }}>
                <TagRow label="适用人群" tags={crowdRec} />
                <TagRow label="适用场景" tags={sceneRec} />
                <TagRow label="适配体质" tags={constitutionRec} />
              </View>
            )
          })()}

          {/* 食安块已移至食养参考之后（食养拍第一位） */}

          {/* —— 食养参考（原③）：无实质食养数据时整块不渲染，避免空壳「温和食养·日常参考」占位 —— */}
            {product && (() => {
              const p = product
              const input = toFoodTherapyInput(p)
              const stageMod = buildShiyangStageModule(p.ingredients, p.food_stage)
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
              // 辨证结论文案：商家手填覆盖优先，回退引擎辨证结果（迁移 00237）
              const fitText = String((p as any)?.fit_people_override || '').trim()
                || (therapyReport?.fit_people || '')
              // 人群标签栏：只展示推荐人群（合规过滤疾病定向/恢复期待词）
              const crowdRec = cleanAudienceTags([
                ...((p as any)?.fit_crowd_tags || []),
                ...(therapyReport?.fit_crowd_tags || []),
                ...(foodBenefit?.suitableFor || []),
                ...(input.rec_crowds || []),
              ]).slice(0, 4)
              // 三个折叠模块：仅在确有内容时渲染，空态整块隐藏（不再显示「暂无说明/暂无搭配推荐」）
              const hasIngredients = stageMod.ingredients.length > 0 || (foodBenefit?.ingredients?.length || 0) > 0
              const hasBenefit = !!foodBenefit || !!input.positive_effect
              const hasCombo = !!stageMod.comboNarrative || comboProducts.length > 0 || (input.match_goods?.length || 0) > 0

              // 是否有实质食养数据：商家辨证 / 食养阶段 / 食材 / 人群 / 搭配 / 分类 / 引导语 任一存在才展示，避免空壳「温和食养·日常参考」占位
              const hasShiyang =
                !!therapyReport || !!foodBenefit || !!stageMod.stage ||
                stageMod.ingredients.length > 0 || crowdRec.length > 0 || !!fitText ||
                !!stageMod.comboNarrative || comboProducts.length > 0 ||
                (input.match_goods?.length || 0) > 0 || !!input.positive_effect ||
                !!input.food_category || !!input.guide_sentence
              if (!hasShiyang) return null

              return (
                <View>
                  <Text className="text-base font-bold text-foreground mb-2" style={{ display: 'block' }}>食养参考</Text>
                <View className="mt-3">
                  {/* 食养特点栏（顶部结论，plain 表达；安心结论合并于此，不再二次套卡） */}
                  <View style={{ padding: '10px 12px', borderRadius: '12px', background: 'var(--color-herb-50)', border: '1px solid var(--color-herb-100)' }}>
                    <Text style={{ fontSize: '30rpx', fontWeight: '700', color: 'var(--color-herb-600)', display: 'block' }}>
                      {stageMod.stage ? `食养特点：${stageMod.label} · ${stageMod.coreTag}` : '温和食养 · 日常参考'}
                    </Text>
                    <Text style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6', marginTop: 2 }}>{stageMod.oneLiner}</Text>
                    {input.food_category && (
                      <Text style={{ fontSize: '24rpx', color: 'var(--color-herb-600)', display: 'block', marginTop: 2 }}>
                        分类：{input.food_category}{input.overall_nature ? ` · 食性${input.overall_nature}` : ''}
                      </Text>
                    )}
                    {therapyReport && (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-herb-100)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: '28rpx', fontWeight: '700', color: 'hsl(var(--primary-deep))', display: 'block' }}>这口吃得安心吗</Text>
                          {NATURE_FEELING[therapyReport.overall_nature_code] ? (
                            <Text style={{ fontSize: '24rpx', color: 'hsl(var(--primary-deep))', background: 'hsl(var(--primary-soft-deep))', paddingVertical: '2px', paddingHorizontal: '8px', borderRadius: '999px' }}>食用体感 · {NATURE_FEELING[therapyReport.overall_nature_code]}</Text>
                          ) : null}
                        </View>
                        <Text style={{ fontSize: '34rpx', fontWeight: '700', color: 'hsl(var(--primary-deep))', display: 'block', lineHeight: '1.4', marginTop: 6 }}>{buildTherapyHeadline(therapyReport).main}</Text>
                        <Text style={{ fontSize: '24rpx', color: '#5B7A6A', display: 'block', marginTop: 2 }}>{buildTherapyHeadline(therapyReport).sub}</Text>
                      </View>
                    )}
                  </View>

                  {/* 适用人群已提升为卡内常驻区块（卡标题下方），此处不再重复渲染标签栏；仅保留引导语兜底 */}
                  {crowdRec.length === 0 && input.guide_sentence && (
                    <Text style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6', marginTop: 10 }}>{input.guide_sentence}</Text>
                  )}
                  {/* 辨证结论：商家手填优先，否则展示引擎按中医体质/证型生成的结论（迁移 00237） */}
                  {fitText ? (
                    <Text style={{ fontSize: '24rpx', color: '#4A443D', display: 'block', lineHeight: '1.6', marginTop: 6 }}>适合：{fitText}</Text>
                  ) : null}

                  {/* 模块1：核心食材食养属性（折叠；无内容则整块不渲染） */}
                  {hasIngredients && (
                    <CollapsibleSection title="核心食材食养属性" defaultOpen>
                      {stageMod.ingredients.length > 0 ? (
                        <View style={{ border: '1px solid var(--color-herb-100)', borderRadius: '10px', overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', background: 'var(--color-herb-50)', padding: '6px 8px' }}>
                            <Text style={{ flex: 2, fontSize: '22rpx', color: 'var(--color-herb-600)', fontWeight: '700' }}>食材</Text>
                            <Text style={{ flex: 1, fontSize: '22rpx', color: 'var(--color-herb-600)', fontWeight: '700' }}>性味</Text>
                            <Text style={{ flex: 3, fontSize: '22rpx', color: 'var(--color-herb-600)', fontWeight: '700' }}>传统食用参考</Text>
                            <Text style={{ flex: 2, fontSize: '22rpx', color: 'var(--color-herb-600)', fontWeight: '700' }}>适配场景</Text>
                          </View>
                          {stageMod.ingredients.map((ing, i) => (
                            <View key={ing.key + i} style={{ flexDirection: 'row', padding: '6px 8px', borderTop: i === 0 ? '0' : '1px solid #EFF6F0' }}>
                              <Text style={{ flex: 2, fontSize: '24rpx', color: '#2A2A2A' }}>{ing.icon} {ing.name}</Text>
                              <Text style={{ flex: 1, fontSize: '24rpx', color: '#6F675C' }}>{ing.nature}</Text>
                              <Text style={{ flex: 3, fontSize: '24rpx', color: '#4A443D', lineHeight: '1.5' }}>{ing.benefits.join('、')}</Text>
                              <Text style={{ flex: 2, fontSize: '24rpx', color: '#4A443D', lineHeight: '1.5' }}>{ing.scenarios.join('、')}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View>
                          {(foodBenefit?.ingredients || []).map((ing, i) => (
                            <Text key={i} style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6' }}>
                              {ing.icon ? `${ing.icon} ` : ''}{ing.name}：{shieldCopy(ing.role).safe}
                            </Text>
                          ))}
                        </View>
                      )}
                    </CollapsibleSection>
                  )}

                  {/* 模块2：食养作用（折叠；无内容则整块不渲染） */}
                  {hasBenefit && (
                    <CollapsibleSection title="食养作用">
                      {foodBenefit ? (
                        <View>
                          <Text style={{ fontSize: '26rpx', fontWeight: 'bold', color: '#B45309', display: 'block', marginTop: 4 }}>现代营养</Text>
                          {foodBenefit.modernNutrition.map((it, i) => (
                            <Text key={i} style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6' }}>· {it.title}：{it.desc}</Text>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6' }}>{input.positive_effect}</Text>
                      )}
                    </CollapsibleSection>
                  )}

                  {/* 模块3：食养搭配建议（折叠；无内容则整块不渲染） */}
                  {hasCombo && (
                    <CollapsibleSection title="食养搭配建议">
                      {stageMod.comboNarrative ? (
                        <Text style={{ fontSize: '26rpx', color: 'var(--color-herb-600)', display: 'block', lineHeight: '1.6' }}>{stageMod.comboNarrative}</Text>
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
                      ) : (
                        <Text style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6', marginTop: 2 }}>推荐搭配：{(input.match_goods || []).join('、')}</Text>
                      )}
                    </CollapsibleSection>
                  )}

                  {/* 食用小贴士（建议食用量 + 适宜状态） */}
                  <View style={{ padding: '8px 10px', borderRadius: '12px', background: '#FFFDF7', border: '1px solid #F0E6CF', marginTop: 4 }}>
                    <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>食用小贴士</Text>
                    <Text style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6' }}>建议食用量：{eatAmount}</Text>
                    {tipAudiences.length > 0 && (
                      <Text style={{ fontSize: '26rpx', color: '#4A443D', display: 'block', lineHeight: '1.6' }}>更适合这些日常状态：{tipAudiences.join('、')}</Text>
                    )}
                  </View>
                </View>
              </View>
            )
          })()}

          {/* —— 配方安全（原② 配料表，置于食养之后） —— */}
          <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ECE6DD' }}>
          <FoodSafetyPanel foodAdditives={foodAdditives} shiyangEntries={shiyangEntries} showShiyang={false} />
          {safetyReport && <ComprehensiveSafetyReport report={safetyReport} bare showDisclaimer={false} />}
          <View className="mt-3 flex items-center justify-end" style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ECE6DD' }}>
            <Text style={{ fontSize: '24rpx', color: 'hsl(var(--primary))', fontWeight: '600', borderBottomWidth: 1, borderBottomColor: 'hsl(var(--primary))' }}
              onClick={() => Taro.navigateTo({ url: `/pages/food/analysis-result/index?product_id=${encodeURIComponent(product.id)}` })}>
              查看检测报告 ›
            </Text>
          </View>
          </View>
        </View>
      )}

      {/* 礼品模块：药膳手串 / 工艺礼品专属（仅当 product_kind !== 'food' 渲染，与食养模块互斥） */}
      {isGift && <GiftSections product={product} />}

 {/* 分区④ 商品详情（图文长图）：电商惯例——图文详情沉底，读完卖点再看细节图 */}
 {product.detail_images && product.detail_images.length > 0 && (
 <View className="mx-4 mt-4">
 <View className="flex items-center justify-center mb-3">
 <Text className="text-base font-bold text-muted-foreground px-3" style={{ display: 'block' }}>商品详情</Text>
 </View>
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
