// @title 门店详情
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import './index.scss'
import LazyImage from '@/components/LazyImage'

// 关键：必须从 common.js 导入至少一项，否则 Rollup 会 tree-sh掉 common.js 和 vendors.js
// 导致小程序运行时缺少必要代码 → 页面空白崩溃
import { getStoreById, getStoreCategories, getProducts, addToCart, bindStoreReferrer } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import type { Store, StoreCategory, Product } from '@/db/types'
import { supabase, getLocalUser } from '@/client/supabase'
import Icon from '@/components/Icon'
import AddToCartButton from '@/components/AddToCartButton'
import { buildTherapyReport, NATURE_FEELING, type ProductIngredientInput, type FoodIngredient, type ProductTherapyReport } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'

export default function StoreHomePage() {
  const [storeId, setStoreId] = useState('')
  const [store, setStore] = useState<Store | null>(null)
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeCat, setActiveCat] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  // 门店专属红包（进店领→归属）
  const [storeCampaign, setStoreCampaign] = useState<any | null>(null)
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
      // 查询该门店的专属进行中红包（用于进店领→归属）
      supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'active')
        .eq('campaign_type', 'red_packet')
        .limit(5),
    ]).then(([s, cats, prods, campRes]) => {
      if (s) {
        setStore(s)
        // 强引导门店自推码：进店即绑门店 owner 推广码（让利佣金回流门店）
        bindStoreReferrer(storeId).catch(() => {})
        // 动态设置导航栏标题为商家名字
        Taro.setNavigationBarTitle({ title: s.name })
      }
      setCategories(cats)
      setProducts(prods)
      // 过滤有效门店红包（日期区间 + 发放未达上限）
      const now = new Date()
      const valid = (campRes.data || []).filter((c: any) => {
        if (c.start_date && new Date(c.start_date) > now) return false
        if (c.end_date && new Date(c.end_date) < now) return false
        if ((c.claimed_count || 0) >= (c.total_limit || 0)) return false
        return true
      })
      setStoreCampaign(valid[0] || null)
    }).catch(err => {
      console.error('[StoreHome] load error:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [storeId])

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
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '500px' }}>
        <Text style={{ fontSize: '16px', color: '#9A8C7A' }}>加载中...</Text>
      </View>
    )
  }

  // 无数据
  if (!store) {
    return (
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '500px' }}>
        <Text style={{ fontSize: '16px', color: '#9A8C7A' }}>暂无门店信息</Text>
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
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#FFFBF7' }}>

      {/* ========== 门店头部 Banner ========== */}
      <View style={{ position: 'relative', height: '180px', flexShrink: 0 }}>
        {(() => {
          const img = getStoreImage(store)
          return img ? (
            <Image
              src={img}
              mode="aspectFill"
              style={{ width: '100%', height: '180px', display: 'block' }} />
          ) : (
            // 无图片时：显示品牌色背景 + 店铺图标
            // 使用 CSS class 实现渐变（微信小程序不支持 inline linear-gradient）
            <View className="brand-gradient-bg"
              style={{
              width: '100%',
              height: '180px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <View style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: '32px' }}>🏪</Text>
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
            top: '12px',
            left: '12px',
            width: '36px',
            height: '36px',
            borderRadius: '18px',
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: '#FFF', fontSize: '18px' }}>←</Text>
        </View>
        {/* 门店名称 + 评分 */}
        <View style={{ position: 'absolute', bottom: '16px', left: '16px', right: '16px' }}>
          <Text style={{ color: '#FFF', fontSize: '22px', fontWeight: 'bold' }}>{store.name}</Text>
          <View style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
            <Text style={{ color: '#FCD34D', fontSize: '14px' }}>★</Text>
            <Text style={{ color: '#FFF', fontSize: '16px', marginLeft: '4px' }}>{store.rating || '5.0'}</Text>
            {store.category && (
              <Text style={{ color: '#FFF', fontSize: '14px', opacity: 0.8, marginLeft: '6px' }}>· {store.category}</Text>
            )}
          </View>
        </View>
      </View>

      {/* ========== 门店详情信息卡 ========== */}
      <View style={{ margin: '0 16px', marginTop: 12, background: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>🏪 门店信息</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {store.description && (
            <Text style={{ fontSize: 13, color: '#475569', lineHeight: '20px', width: '100%', display: 'block' }}>{store.description}</Text>
          )}
          <View style={storeInfoTag}>
            <Text style={{ fontSize: 12 }}>📍</Text>
            <Text style={{ fontSize: 12, color: '#475569' }}>{store.address || '查看地图'}</Text>
          </View>
          <View style={storeInfoTag}>
            <Text style={{ fontSize: 12 }}>🕐</Text>
            <Text style={{ fontSize: 12, color: '#475569' }}>{store.open_time ? `${store.open_time}-${store.close_time || ''}` : '营业时间待更新'}</Text>
          </View>
          <View style={storeInfoTag}>
            <Text style={{ fontSize: 12 }}>📞</Text>
            <Text style={{ fontSize: 12, color: '#475569' }}>{store.phone || '联系方式待更新'}</Text>
          </View>
        </View>
      </View>

      {/* ========== 门店专属红包横幅（进店领→归属） ========== */}
      {storeCampaign && (
        <View
          className="store-redpacket-banner"
          onClick={() => Taro.navigateTo({ url: `/pages/marketing/campaign-claim/index?campaignId=${storeCampaign.id}` })}
          style={{
            margin: '10px 16px 0',
            padding: '12px 16px',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <View style={{ display: 'flex', flexDirection: 'column' }}>
            <Text style={{ color: '#FFF', fontSize: '16px', fontWeight: 'bold' }}>🧧 进店领红包</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', marginTop: '2px' }}>
              {storeCampaign.campaign_name}
            </Text>
          </View>
          <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Text style={{ color: '#FFF', fontSize: '22px', fontWeight: 'bold' }}>¥{storeCampaign.gift_value}</Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: '999px', padding: '6px 14px' }}>
              <Text style={{ color: '#FFF', fontSize: '14px', fontWeight: 'bold' }}>立即领</Text>
            </View>
          </View>
        </View>
      )}

      {/* ========== 服务模式切换 ========== */}
      <View style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '10px 16px',
        backgroundColor: '#FFF',
        borderBottomWidth: '1px',
        borderBottomColor: '#EAE3DA',
        flexShrink: 0,
      }}>
        {['堂食', '配送'].map(label => (
          <View
            key={label}
            style={{
              padding: '6px 18px',
              borderRadius: '999px',
              borderWidth: '2px',
              borderColor: 'hsl(var(--primary))',
              backgroundColor: 'rgba(194,65,12,0.08)',
              marginRight: '10px',
            }}>
            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ========== 分类 + 商品列表 ========== */}
      <View style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>

        {/* 左侧分类栏 */}
        <ScrollView scrollY style={{ width: '88px', height: '100%', backgroundColor: '#FFFBF7' }}>
          <View
            onClick={() => setActiveCat('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 0',
              backgroundColor: activeCat === 'all' ? '#FFF' : 'transparent',
              borderLeftWidth: activeCat === 'all' ? '3px' : '0',
              borderLeftColor: 'hsl(var(--primary))',
            }}>
            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: activeCat === 'all' ? 'hsl(var(--primary))' : '#1A1A1A' }}>全部</Text>
          </View>
          {categories.map((cat) => (
            <View
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 0',
                backgroundColor: activeCat === cat.id ? '#FFF' : 'transparent',
                borderLeftWidth: activeCat === cat.id ? '3px' : '0',
                borderLeftColor: 'hsl(var(--primary))',
              }}>
              <Text style={{ fontSize: '15px', fontWeight: 'bold', color: activeCat === cat.id ? 'hsl(var(--primary))' : '#1A1A1A' }}>{cat.name}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 右侧商品列表 */}
        <ScrollView scrollY style={{ flex: 1, height: '100%', padding: '12px' }}>
          {filteredProducts.length === 0 ? (
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '80px' }}>
              <Text style={{ fontSize: '15px', color: '#9A8C7A' }}>暂无商品</Text>
            </View>
          ) : (
            <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px' }}>
              {filteredProducts.map((p) => {
                const tr = therapyMap[p.id]
                return (
                <View
                  key={p.id}
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                  style={{
                    width: 'calc(50% - 5px)',
                    backgroundColor: '#FFF',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    borderWidth: '1px',
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
                            <Text style={{ fontSize: '34px' }}>🛍️</Text>
                            <Text style={{ fontSize: '11px', color: '#B08D7A', marginTop: '4px' }} numberOfLines={1}>{p.name}</Text>
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
                  <View style={{ padding: '10px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    {/* 食疗引擎结果：体感 · 适宜（与详情页/卡片同源，不含警示色） */}
                    {tr && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                        {tr.overall_nature_code ? (
                          <View style={{ backgroundColor: '#F1ECE4', borderRadius: '6px', paddingVertical: '1px', paddingHorizontal: '6px' }}>
                            <Text style={{ fontSize: '10px', color: '#7A6A55' }}>{NATURE_FEELING[tr.overall_nature_code] || tr.overall_nature_code}</Text>
                          </View>
                        ) : null}
                        {tr.fit_people ? (
                          <View style={{ backgroundColor: '#DCFCE7', borderRadius: '6px', paddingVertical: '1px', paddingHorizontal: '6px' }}>
                            <Text style={{ fontSize: '10px', color: '#16A34A' }} numberOfLines={1}>✅{tr.fit_people.split(/[、,，]/)[0]}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                    <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#1A1A1A' }} numberOfLines={2}>{p.name}</Text>

                    {/* 价格 + 加入购物车 */}
                    <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px' }}>
                      <Text style={{ fontSize: '17px', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>¥{p.price}</Text>
                      <AddToCartButton onAdd={() => handleAddCart(p)} adding={addingId === p.id} size={36} />
                    </View>
                  </View>
                </View>
                )
              })}
            </View>
          )}
          <View style={{ height: '20px' }} />
        </ScrollView>
      </View>
    </View>
  )
}

const storeInfoTag: React.CSSProperties = {
  flexDirection: 'row', alignItems: 'center', gap: 4,
  background: '#f8fafc', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
  flexShrink: 0,
} as any
