// @title 门店详情
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import './index.scss'
import LazyImage from '@/components/LazyImage'

// 关键：必须从 common.js 导入至少一项，否则 Rollup 会 tree-sh掉 common.js 和 vendors.js
// 导致小程序运行时缺少必要代码 → 页面空白崩溃
import { getStoreById, getStoreCategories, getProducts, addToCart, bindStoreReferrer, getMyAddresses } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import type { Store, StoreCategory, Product, UserAddress } from '@/db/types'
import { supabase, getLocalUser } from '@/client/supabase'
import Icon from '@/components/Icon'
import AddToCartButton from '@/components/AddToCartButton'
import { buildTherapyReport, isFoodProduct, NATURE_FEELING, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { haversineKm } from '@/utils/coord-convert'

// 解析 "09:00" / "9:00" / "09:00:00" 为分钟数
function parseHHMM(s: string | null): { h: number; m: number } | null {
 if (!s) return null
 const m = s.match(/(\d{1,2}):(\d{2})/)
 if (!m) return null
 return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) }
}

export default function StoreHomePage() {
 const [storeId, setStoreId] = useState('')
 const [store, setStore] = useState<Store | null>(null)
 const [categories, setCategories] = useState<StoreCategory[]>([])
 const [products, setProducts] = useState<Product[]>([])
 const [activeCat, setActiveCat] = useState<string>('all')
 const [loading, setLoading] = useState(true)
 const [addingId, setAddingId] = useState<string | null>(null)
 const [now, setNow] = useState(() => Date.now())
 const [userAddr, setUserAddr] = useState<UserAddress | null>(null)
 // 食疗食材字典：驱动门店商品卡实时三色预警 / 整体性味（与详情页同源引擎）
 const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
 useEffect(() => {
 getFoodIngredients().then(setIngredientDict).catch(() => {})
 }, [])

 // 获取路由参数（支持 id 直接传参 + scene 扫码参数）
 useEffect(() => {
 try {
 const instance = Taro.getCurrentInstance()
 const params = instance?.router?.params as any || {}
 const id = params.id

 // 方式1：直接 ?id=xxx 跳转
 if (id) {
 setStoreId(decodeURIComponent(id))
 return
 }

 // 方式2：扫码进入，scene 参数格式 s=短码&r=推广码
 const scene = params.scene
 if (scene) {
 try {
 const decodedScene = decodeURIComponent(scene)

 // 匹配 s=门店短码（8位字母数字）
 const storeMatch = decodedScene.match(/s=([A-Za-z0-9]{4,12})/i)
 if (storeMatch) {
 const shortCode = storeMatch[1].toUpperCase()

 // 通过短码查询门店 ID
 supabase.from('stores').select('id').eq('short_code', shortCode).maybeSingle()
 .then(({ data }: { data: any }) => {
 if (data?.id) {
 setStoreId(data.id)
 } else {
 Taro.showToast({ title: '门店不存在', icon: 'none' })
 }
 })
 .catch((err: any) => {
 console.error('[StoreHome] 查询门店失败:', err)
 })
 }
 } catch (e) {
 console.error('[StoreHome] scene 解析失败:', e)
 }
 }
 } catch (e) {
 console.error('[StoreHome] params error:', e)
 }
 }, [])

 // 加载门店数据
 useEffect(() => {
 if (!storeId) return
 setLoading(true)

 Promise.all([
 getStoreById(storeId),
 getStoreCategories(storeId),
 getProducts({ storeId }),
 ]).then(([s, cats, prods]) => {
 if (s) {
 setStore(s)
 // 强引导门店自推码：进店即绑门店 owner 推广码（让利佣金回流门店）
 bindStoreReferrer(storeId).catch(() => {})
 // 动态设置导航栏标题为商家名字
 Taro.setNavigationBarTitle({ title: s.name })
 }
 setCategories(cats)
 setProducts(prods)
 getMyAddresses().then((list) => {
 const withCoords = list.filter((a) => a.lat != null && a.lng != null)
 setUserAddr(withCoords[0] || list[0] || null)
 }).catch(() => {})
 }).catch(err => {
 console.error('[StoreHome] load error:', err)
 }).finally(() => {
 setLoading(false)
 })
 }, [storeId])

 // 营业状态每分钟刷新一次
 useEffect(() => {
 const t = setInterval(() => setNow(Date.now()), 60000)
 return () => clearInterval(t)
 }, [])

 // 筛选商品
 const filteredProducts = activeCat === 'all'
 ? products
 : products.filter(p => p.category_id === activeCat)

 // 食疗引擎：与首页同源——优先读 therapy_json 单一数据源（服务端回算 / 上传回写），
 // 回退才按 ingredients + 食材字典现算。即使门店商品未填 ingredients，只要已系统化写入
 // therapy_json（上传回写 / backfill），门店卡也稳定有食养，不再「进了门店就没食养」。
 const therapyMap = useMemo<Record<string, ProductTherapyReport | null>>(() => {
 const map: Record<string, ProductTherapyReport | null> = {}
 const dictMap = new Map(ingredientDict.map((r) => [r.name, r]))
 for (const p of filteredProducts) {
 // 类型闸门：非食养商品不参与食疗计算（工艺品/日用品不应出现「适合人群 / 食性」）
 if (!isFoodProduct(p)) { map[p.id] = null; continue }
 // 优先读 therapy_json 单一数据源
 const tj = p.therapy_json as Partial<ProductTherapyReport> | null | undefined
 if (tj && tj.overall_nature_code) { map[p.id] = tj as ProductTherapyReport; continue }
 // 回退：客户端按 ingredients + 食材字典现算
 const names = (p.ingredients as string[] | undefined) || []
 if (!names.length) { map[p.id] = null; continue }
 const inputs: ProductIngredientInput[] = names
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
 map[p.id] = inputs.length ? buildTherapyReport(p.name, inputs) : null
 }
 return map
 }, [filteredProducts, ingredientDict])

 // 履约方式统一在 fulfillmentText 中生成（自营门店：克制展示，不用外卖式 pill 切换）

 // 营业状态智能提示（每分钟刷新）
 const bizStatus = useMemo(() => {
 if (!store) return null
 if (store.is_open === false) return { state: 'closed' as const, text: '休息中' }
 const o = parseHHMM(store.open_time)
 const c = parseHHMM(store.close_time)
 if (!o || !c) return { state: 'unknown' as const, text: '营业时间待更新' }
 const d = new Date(now)
 const cur = d.getHours() * 60 + d.getMinutes()
 const open = o.h * 60 + o.m
 const close = c.h * 60 + c.m
 if (cur < open || cur >= close) return { state: 'closed' as const, text: '休息中' }
 const minsToClose = close - cur
 return { state: 'open' as const, text: '营业中', closingSoon: minsToClose <= 60, closeText: store.close_time! }
 }, [store, now])

 // 履约方式文案（自营门店 · 克制展示：不渲染起送价/配送费/满减等外卖式交易信息）
 const fulfillmentText = useMemo<string | null>(() => {
 if (!store) return null
 const parts: string[] = []
 if (store.delivery_enabled) {
 const km = store.delivery_radius != null ? store.delivery_radius : 3
 parts.push(`${km} 公里内配送`)
 }
 return parts.length ? parts.join(' · ') : null
 }, [store])

 // 配送范围前端提示：用默认收货地址坐标算距离（无坐标则跳过，不报错）
 const deliveryDistance = useMemo<number | null>(() => {
 if (!store?.delivery_enabled || store.delivery_radius == null) return null
 const slat = store.lat, slng = store.lng
 if (slat == null || slng == null || !userAddr?.lat || !userAddr?.lng) return null
 return haversineKm(userAddr.lat, userAddr.lng, slat, slng)
 }, [store, userAddr])
 const outOfRange = deliveryDistance != null && store?.delivery_radius != null && deliveryDistance > store.delivery_radius

 // 加入购物车（门店详情页商品）
 const handleAddCart = async (product: Product) => {
 const uid = (await getLocalUser()).data.user
 if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
 setAddingId(product.id)
 await addToCart(product.id, product.store_id || storeId)
 setAddingId(null)
 showCartToast()
 }

 // 加载中
 if (loading && !store) {
 return (
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '1000rpx' }}>
 <Text style={{ fontSize: '32rpx', color: 'var(--muted-foreground)' }}>加载中...</Text>
 </View>
 )
 }

 // 无数据
 if (!store) {
 return (
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '1000rpx' }}>
 <Text style={{ fontSize: '32rpx', color: 'var(--muted-foreground)' }}>暂无门店信息</Text>
 </View>
 )
 }

 // 获取店铺展示图片（优先 banner_url → image_url，因为 banner_url 是用户最新上传的）
 const getStoreImage = (s: Store | null): string | null => {
 if (!s) return null
 const url = s.banner_url || s.image_url || ''
 // 过滤无效值
 if (!url || url === 'null' || url === 'undefined') return null
 if (url.startsWith('wxfile://') || url.startsWith('http://tmp') || url.startsWith('data:')) return null
 // Supabase Storage URL 格式检查
 if (url.startsWith('http://') || url.startsWith('https://')) return url
 return null
 }

 return (
 <View style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#F8F8F8' }}>

 {/* ========== 门店头部 Banner ========== */}
 <View style={{ position: 'relative', height: '360rpx', flexShrink: 0 }}>
 {(() => {
 const img = getStoreImage(store)
 return img ? (
 <Image
 src={img}
 mode="aspectFill"
 style={{ width: '100%', height: '360rpx', display: 'block' }} />
 ) : (
 // 无图片时：显示品牌色背景 + 店铺图标
 // 使用 CSS class 实现渐变（微信小程序不支持 inline linear-gradient）
 <View className="brand-gradient-bg"
 style={{
 width: '100%',
 height: '360rpx',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 }}>
 <View style={{
 width: '128rpx',
 height: '128rpx',
 borderRadius: '32rpx',
 backgroundColor: 'rgba(255,255,255,0.15)',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 }}>
 <Text style={{ fontSize: '64rpx' }}></Text>
 </View>
 </View>
 )
 })()}
 {/* 渐变遮罩 — 使用 CSS class 实现 */}
 <View className="banner-overlay" />
 {/* 返回按钮 */}
 <View
 onClick={() => Taro.navigateBack()}
 style={{
 position: 'absolute',
 top: '24rpx',
 left: '24rpx',
 width: '72rpx',
 height: '72rpx',
 borderRadius: '36rpx',
 backgroundColor: 'rgba(0,0,0,0.35)',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 }}>
 <Text style={{ color: '#FFF', fontSize: '36rpx' }}>←</Text>
 </View>
 {/* 门店名称 + 评分 */}
 <View style={{ position: 'absolute', bottom: '32rpx', left: '32rpx', right: '32rpx' }}>
 <Text style={{ color: '#FFF', fontSize: '44rpx', fontWeight: 'bold' }}>{store.name}</Text>
 <View style={{ display: 'flex', alignItems: 'center', marginTop: '8rpx' }}>
 {store.rating && store.rating > 0 ? (
 <>
 <Text style={{ color: '#FCD34D', fontSize: '28rpx' }}>★</Text>
 <Text style={{ color: '#FFF', fontSize: '32rpx', marginLeft: '8rpx' }}>{store.rating}</Text>
 </>
 ) : (
 <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: '26rpx' }}>暂无评分</Text>
 )}
 {store.category && (
 <Text style={{ color: '#FFF', fontSize: '28rpx', opacity: 0.8, marginLeft: '12rpx' }}>· {store.category}</Text>
 )}
 </View>
 </View>
 </View>

 {/* ========== 配送范围提示 ========== */}
 {outOfRange && deliveryDistance != null && (
 <View style={{ margin: '0 32rpx', marginTop: '24rpx', backgroundColor: '#FEF3C7', borderRadius: '24rpx', padding: '20rpx 28rpx', borderWidth: '2rpx', borderColor: '#FCD34D', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
 <Text style={{ fontSize: '28rpx' }}></Text>
 <Text style={{ fontSize: '26rpx', color: '#B45309', flex: 1 }}>您当前收货地址距本店约 {deliveryDistance.toFixed(1)} km，超出配送范围（{store?.delivery_radius} km），请重选配送范围内的收货地址</Text>
 </View>
 )}

 {/* ========== 门店详情信息卡 ========== */}
 <View style={{ margin: '0 32rpx', marginTop: '24rpx', background: '#FFF', borderRadius: '28rpx', padding: '32rpx', borderWidth: '2rpx', borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: '12rpx', marginBottom: '16rpx' }}>
 <Text style={{ fontSize: '28rpx', fontWeight: '700', color: '#1e293b' }}> 门店信息</Text>
 </View>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12rpx' }}>
 {store.description && (
 <Text style={{ fontSize: '26rpx', color: '#475569', lineHeight: '40rpx', width: '100%', display: 'block' }}>{store.description}</Text>
 )}
 <View style={storeInfoTag}>
 <Text style={{ fontSize: '24rpx' }}></Text>
 <Text style={{ fontSize: '24rpx', color: '#475569' }}>{store.address || '查看地图'}</Text>
 </View>
 <View style={storeInfoTag}>
 <View style={{ width: '16rpx', height: '16rpx', borderRadius: '8rpx', backgroundColor: bizStatus?.state === 'open' ? '#22C55E' : '#9CA3AF' }} />
 <Text style={{ fontSize: '24rpx', color: '#475569' }}>{bizStatus?.text}{bizStatus?.closingSoon ? ` · 今日营业至 ${bizStatus.closeText}` : ''}</Text>
 </View>
 <View style={storeInfoTag}>
 <Text style={{ fontSize: '24rpx' }}></Text>
 <Text style={{ fontSize: '24rpx', color: '#475569' }}>{store.phone || '联系方式待更新'}</Text>
 </View>
 </View>
 {fulfillmentText && (
 <View style={{ marginTop: '20rpx', paddingTop: '20rpx', borderTopWidth: '2rpx', borderTopColor: 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
 <Text style={{ fontSize: '26rpx' }}></Text>
 <Text style={{ fontSize: '26rpx', color: '#666666' }}>{fulfillmentText}</Text>
 </View>
 )}
 </View>

 {/* ========== 门店公告 ========== */}
 {store.announcement && (
 <View style={{ margin: '0 32rpx', marginTop: '24rpx', backgroundColor: '#FFF7ED', borderRadius: '24rpx', padding: '20rpx 28rpx', borderWidth: '2rpx', borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
 <Text style={{ fontSize: '28rpx' }}></Text>
 <Text style={{ fontSize: '26rpx', color: '#666666', flex: 1 }}>{store.announcement}</Text>
 </View>
 )}

 {/* 履约方式已收敛进上方「门店信息」卡（自营门店克制展示，去掉外卖式 pill 切换） */}

 {/* ========== 分类 + 商品列表 ========== */}
 <View style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>

 {/* 左侧分类栏 */}
 <ScrollView scrollY style={{ width: '176rpx', height: '100%', backgroundColor: '#F8F8F8' }}>
 <View
 onClick={() => setActiveCat('all')}
 style={{
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 padding: '32rpx 0',
 backgroundColor: activeCat === 'all' ? '#FFF' : 'transparent',
 borderLeftWidth: activeCat === 'all' ? '6rpx' : '0',
 borderLeftColor: 'hsl(var(--primary))',
 }}>
 <Text style={{ fontSize: '30rpx', fontWeight: 'bold', color: activeCat === 'all' ? 'hsl(var(--primary))' : '#1A1A1A' }}>全部</Text>
 </View>
 {categories.map((cat) => (
 <View
 key={cat.id}
 onClick={() => setActiveCat(cat.id)}
 style={{
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 padding: '32rpx 0',
 backgroundColor: activeCat === cat.id ? '#FFF' : 'transparent',
 borderLeftWidth: activeCat === cat.id ? '6rpx' : '0',
 borderLeftColor: 'hsl(var(--primary))',
 }}>
 <Text style={{ fontSize: '30rpx', fontWeight: 'bold', color: activeCat === cat.id ? 'hsl(var(--primary))' : '#1A1A1A' }}>{cat.name}</Text>
 </View>
 ))}
 </ScrollView>

 {/* 右侧商品列表 */}
 <ScrollView scrollY style={{ flex: 1, height: '100%', padding: '24rpx' }}>
 {filteredProducts.length === 0 ? (
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '160rpx' }}>
 <Text style={{ fontSize: '30rpx', color: 'var(--muted-foreground)' }}>暂无商品</Text>
 </View>
 ) : (
 <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '20rpx' }}>
 {filteredProducts.map((p) => {
 const tr = therapyMap[p.id]
 return (
 <View
 key={p.id}
 onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
 style={{
 width: 'calc(50% - 10rpx)',
 backgroundColor: '#FFF',
 borderRadius: '24rpx',
 overflow: 'hidden',
 borderWidth: '2rpx',
 borderColor: '#EAE3DA',
 display: 'flex',
 flexDirection: 'column',
 }}>
 {(() => {
 const img = p.main_image || p.image_url || ''
 if (!img) {
 // 缺图：轻量占位（柔和米底 + emoji + 品名），替代大灰块
 return (
 <View style={{ width: '100%', aspectRatio: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F3EF' }}>
 <View style={{ flexDirection: 'column', alignItems: 'center' }}>
 <Text style={{ fontSize: '68rpx' }}></Text>
 <Text style={{ fontSize: '22rpx', color: '#B08D7A', marginTop: '8rpx' }} numberOfLines={1}>{p.name}</Text>
 </View>
 </View>
 )
 }
 // 有图：1:1 标准方图，比例统一、视觉规整
 return (
 <View style={{ width: '100%', aspectRatio: 1, position: 'relative' }}>
 <LazyImage src={img} mode="aspectFill" width="100%" height="100%" className="block" />
 </View>
 )
 })()}
 <View style={{ padding: '20rpx', display: 'flex', flexDirection: 'column', flex: 1 }}>
 {/* 食疗引擎结果：体感 · 适宜（与详情页/卡片同源，不含警示色） */}
 {tr && (
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8rpx', marginBottom: '12rpx' }}>
 {tr.overall_nature_code ? (
 <View style={{ backgroundColor: '#F1ECE4', borderRadius: '12rpx', paddingVertical: '2rpx', paddingHorizontal: '12rpx' }}>
 <Text style={{ fontSize: '20rpx', color: '#666666' }}>{NATURE_FEELING[tr.overall_nature_code] || tr.overall_nature_code}</Text>
 </View>
 ) : null}
 {tr.fit_people ? (
 <View style={{ backgroundColor: '#DCFCE7', borderRadius: '12rpx', paddingVertical: '2rpx', paddingHorizontal: '12rpx' }}>
 <Text style={{ fontSize: '20rpx', color: '#15803D' }} numberOfLines={1}>{tr.fit_people.split(/[、,，]/)[0]}</Text>
 </View>
 ) : null}
 </View>
 )}
 <Text style={{ fontSize: '30rpx', fontWeight: 'bold', color: '#1A1A1A' }} numberOfLines={2}>{p.name}</Text>

 {/* 价格 + 加入购物车 */}
 <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '16rpx' }}>
 <Text style={{ fontSize: '34rpx', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>¥{p.price}</Text>
 <AddToCartButton onAdd={() => handleAddCart(p)} adding={addingId === p.id} size={36} />
 </View>
 </View>
 </View>
 )
 })}
 </View>
 )}
 <View style={{ height: '40rpx' }} />
 </ScrollView>
 </View>
 </View>
 )
}

const storeInfoTag: React.CSSProperties = {
 flexDirection: 'row', alignItems: 'center', gap: '8rpx',
 background: '#f8fafc', borderRadius: '16rpx', paddingVertical: '12rpx', paddingHorizontal: '20rpx',
 flexShrink: 0,
} as any
