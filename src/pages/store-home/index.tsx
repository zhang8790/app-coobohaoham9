// @title 门店详情
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import './index.scss'
import LazyImage from '@/components/LazyImage'

// 关键：必须从 common.js 导入至少一项，否则 Rollup 会 tree-sh掉 common.js 和 vendors.js
// 导致小程序运行时缺少必要代码 → 页面空白崩溃
import { getStoreById, getCategories, getProducts, addToCart, bindStoreReferrer, getMyAddresses } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import type { Store, StoreCategory, Product, UserAddress } from '@/db/types'
import { supabase, getLocalUser } from '@/client/supabase'
import Icon from '@/components/Icon'
import { BRAND_LINE_ICONS } from '@/components/brandIcons'
import AddToCartButton from '@/components/AddToCartButton'
import { buildTherapyReport, isFoodProduct, NATURE_FEELING, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import { haversineKm } from '@/utils/coord-convert'
import { sceneLabel } from '@/utils/scene-alias'

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
  const [catTops, setCatTops] = useState<StoreCategory[]>([]) // 全局一级场景（真源）
  const [subsByParent, setSubsByParent] = useState<Record<string, StoreCategory[]>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [activeTopId, setActiveTopId] = useState<string>('all')
  const [activeSubId, setActiveSubId] = useState<string>('')
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

  // 加载门店数据。
  // ⚠️ 分类真源 = store_categories 的【全局场景】(scope='global')，不再读 getStoreCategories(storeId)：
  //    线上该表里 store_id 非空的行数为 0（所有分类都是平台建的总部类目），
  //    按门店查必然返回空数组 → 左栏永远只剩「全部」、二级子类整块消失。
  // ⚠️ 商品 limit 提到 200：默认 20 会只显示 1/3 的店内商品，且二级 Tab 会误判「该子类无货」。
  useEffect(() => {
    if (!storeId) return
    setLoading(true)

    Promise.all([
      getStoreById(storeId),
      getCategories({ includeGlobal: true, isActive: true }),
      getProducts({ storeId, limit: 200 }),
    ]).then(([s, cats, prods]) => {
      if (s) {
        setStore(s)
        // 强引导门店自推码：进店即绑门店 owner 推广码（让利佣金回流门店）
        bindStoreReferrer(storeId).catch(() => {})
        // 动态设置导航栏标题为商家名字
        Taro.setNavigationBarTitle({ title: s.name })
      }
      // 本地建两级分类树（一次取回，前端切分类不再发请求）
      const globals = cats
        .filter((c) => c.scope === 'global')
        .sort((a, b) => a.sort_order - b.sort_order)
      const subs: Record<string, StoreCategory[]> = {}
      globals.forEach((c) => {
        if (!c.parent_id) return
        if (!subs[c.parent_id]) subs[c.parent_id] = []
        subs[c.parent_id].push(c)
      })
      setSubsByParent(subs)
      setCatTops(globals.filter((c) => !c.parent_id))
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

  // 左栏只展示【本店确有商品的场景】：没有货的场景点进去只会是一次空逛
  const topCats = useMemo(() => {
    return catTops.filter((top) => {
      const kids = (subsByParent[top.id] || []).map((s) => s.id)
      return products.some((p) => p.category_id === top.id || (!!p.sub_category_id && kids.includes(p.sub_category_id)))
    })
  }, [catTops, subsByParent, products])

  // 当前场景下的二级子类（同样只保留本店有货的，避免空 Tab）
  const subCats = useMemo(() => {
    if (activeTopId === 'all') return []
    return (subsByParent[activeTopId] || []).filter((s) => products.some((p) => p.sub_category_id === s.id))
  }, [activeTopId, subsByParent, products])

  // 两级筛选：
  //   全部 → 本店全部
  //   选中二级 → 只看该子类
  //   选中一级 → 一级自身 + 其全部二级子类（兼容只挂一级的历史商品）
  const filteredProducts = useMemo(() => {
    if (activeTopId === 'all') return products
    const kids = (subsByParent[activeTopId] || []).map((s) => s.id)
    if (activeSubId) return products.filter((p) => p.sub_category_id === activeSubId)
    return products.filter((p) => p.category_id === activeTopId || (!!p.sub_category_id && kids.includes(p.sub_category_id)))
  }, [products, activeTopId, activeSubId, subsByParent])

  // 选一级场景：重置二级（避免串场景）
  const handleTopSelect = (topId: string) => {
    if (topId === activeTopId && !activeSubId) return
    setActiveTopId(topId)
    setActiveSubId('')
  }

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
    <View style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#F7F3E9' }}>

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
                <Icon name="home" size={64} className="text-white" />
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
          <Icon name="alert-circle-outline" size={17} />
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
            <Image src={BRAND_LINE_ICONS['map-pin']} style={{ width: 15, height: 15, flexShrink: 0 }} />
            <Text style={{ fontSize: '24rpx', color: '#475569' }}>{store.address || '查看地图'}</Text>
          </View>
          <View style={storeInfoTag}>
            <View style={{ width: '16rpx', height: '16rpx', borderRadius: '8rpx', backgroundColor: bizStatus?.state === 'open' ? '#22C55E' : '#9CA3AF' }} />
            <Text style={{ fontSize: '24rpx', color: '#475569' }}>{bizStatus?.text}{bizStatus?.closingSoon ? ` · 今日营业至 ${bizStatus.closeText}` : ''}</Text>
          </View>
          <View style={storeInfoTag}>
            <Icon name="phone" size={15} />
            <Text style={{ fontSize: '24rpx', color: '#475569' }}>{store.phone || '联系方式待更新'}</Text>
          </View>
        </View>
        {fulfillmentText && (
          <View style={{ marginTop: '20rpx', paddingTop: '20rpx', borderTopWidth: '2rpx', borderTopColor: 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
            <Icon name="truck" size={16} />
            <Text style={{ fontSize: '26rpx', color: '#666666' }}>{fulfillmentText}</Text>
          </View>
        )}
      </View>

      {/* ========== 门店公告 ========== */}
      {store.announcement && (
        <View style={{ margin: '0 32rpx', marginTop: '24rpx', backgroundColor: '#FFF7ED', borderRadius: '24rpx', padding: '20rpx 28rpx', borderWidth: '2rpx', borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
          <Icon name="bullhorn" size={17} />
          <Text style={{ fontSize: '26rpx', color: '#666666', flex: 1 }}>{store.announcement}</Text>
        </View>
      )}

      {/* 履约方式已收敛进上方「门店信息」卡（自营门店克制展示，去掉外卖式 pill 切换） */}

      {/* ========== 分类 + 商品列表 ========== */}
      <View style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>

        {/* 左侧一级场景栏（本店有货才显示；无任何分类货时整条隐藏，商品区占满整宽）。
            与好物页左栏同一套视觉语言：米白底 + 选中白卡 + 左侧绿条 + 绿色加粗字。 */}
        {topCats.length > 0 && (
          <ScrollView scrollY style={{ width: '176rpx', height: '100%', flexShrink: 0, backgroundColor: '#F7F3E9' }}>
            {[{ id: 'all', label: '全部' }, ...topCats.map((c) => ({ id: c.id, label: sceneLabel(c.name) }))].map((cat) => {
              const on = activeTopId === cat.id
              return (
                <View
                  key={cat.id}
                  onClick={() => handleTopSelect(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '28rpx 8rpx',
                    backgroundColor: on ? '#FFF' : 'transparent',
                    borderLeftWidth: '6rpx',
                    borderLeftColor: on ? 'hsl(var(--primary))' : 'transparent',
                  }}>
                  <Text style={{
                    fontSize: '28rpx',
                    fontWeight: on ? '600' : '400',
                    color: on ? 'hsl(var(--primary-strong))' : '#5A5A5A',
                    textAlign: 'center',
                  }}>{cat.label}</Text>
                </View>
              )
            })}
          </ScrollView>
        )}

        {/* 右侧：二级分类 Tab（固定不滚动）+ 商品网格（唯一滚动容器） */}
        <View style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* 二级子类：该场景下本店有货的子类才渲染；无子类整块隐藏 */}
          {subCats.length > 0 && (
            <ScrollView scrollX style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              <View style={{ display: 'inline-flex', gap: '16rpx', padding: '24rpx 24rpx 8rpx' }}>
                {[{ id: '', label: '全部' }, ...subCats.map((s) => ({ id: s.id, label: sceneLabel(s.name) }))].map((s) => {
                  const on = activeSubId === s.id
                  return (
                    <View
                      key={s.id || 'all-sub'}
                      onClick={() => setActiveSubId(s.id)}
                      style={{
                        flex: '0 0 auto',
                        padding: '10rpx 28rpx',
                        borderRadius: '999rpx',
                        fontSize: '26rpx',
                        lineHeight: 1.4,
                        backgroundColor: on ? 'hsl(var(--primary))' : '#FFF',
                        color: on ? '#FFFFFF' : '#5A5A5A',
                        borderWidth: 1,
                        borderColor: on ? 'hsl(var(--primary))' : '#EAE3DA',
                      }}>
                      {s.label}
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          )}

          {/* 商品网格。
              ⚠️ 不要再用 width:calc(50% - 10rpx) + gap:20rpx —— 两者相加恰好等于 100%，
              亚像素取整后每行只放得下一张卡（真机表现为「一行一张、右侧大片空白」）。
              改用 48.8% + space-between：天生留出 2.4% 余量，任何机型都稳定两列。 */}
          <ScrollView scrollY style={{ flex: 1, minHeight: 0, padding: '24rpx' }}>
            {filteredProducts.length === 0 ? (
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '160rpx' }}>
                <Text style={{ fontSize: '30rpx', color: 'var(--muted-foreground)' }}>暂无商品</Text>
              </View>
            ) : (
              <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {filteredProducts.map((p) => {
                  const tr = therapyMap[p.id]
                  return (
                    <View
                      key={p.id}
                      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                      style={{
                        width: '48.8%',
                        marginBottom: '20rpx',
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
                          // 缺图：轻量占位（柔和米底 + 线性 bag 图标 + 品名），替代大灰块
                          return (
                            <View style={{ width: '100%', aspectRatio: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F3EF' }}>
                              <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                                <Icon name="bag" size={34} className="text-muted-foreground" />
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
    </View>
  )
}

const storeInfoTag: React.CSSProperties = {
  flexDirection: 'row', alignItems: 'center', gap: '8rpx',
  background: '#f8fafc', borderRadius: '16rpx', paddingVertical: '12rpx', paddingHorizontal: '20rpx',
  flexShrink: 0,
} as any
