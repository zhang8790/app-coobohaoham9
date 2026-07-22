// @title 门店详情
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import './index.scss'
import LazyImage from '@/components/LazyImage'

// 关键：必须从 common.js 导入至少一项，否则 Rollup 会 tree-sh掉 common.js 和 vendors.js
// 导致小程序运行时缺少必要代码 → 页面空白崩溃
import { getStoreById, getStoreCategories, getProducts, addToCart, bindStoreReferrer } from '@/db/api'
import type { Store, StoreCategory, Product } from '@/db/types'
import { supabase } from '@/client/supabase'
import Icon from '@/components/Icon'
import AddToCartButton from '@/components/AddToCartButton'

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
          console.log('[StoreHome] scene:', decodedScene)

          // 匹配 s=门店短码（8位字母数字）
          const storeMatch = decodedScene.match(/s=([A-Za-z0-9]{4,12})/i)
          if (storeMatch) {
            const shortCode = storeMatch[1].toUpperCase()
            console.log('[StoreHome] 查找门店 short_code:', shortCode)

            // 通过短码查询门店 ID
            supabase.from('stores').select('id').eq('short_code', shortCode).maybeSingle()
              .then(({ data }) => {
                if (data?.id) {
                  console.log('[StoreHome] 找到门店 ID:', data.id)
                  setStoreId(data.id)
                } else {
                  Taro.showToast({ title: '门店不存在', icon: 'none' })
                }
              })
              .catch((err) => {
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

  // 加入购物车（门店详情页商品）
  const handleAddCart = async (product: Product) => {
    const uid = (await supabase.auth.getUser()).data.user
    if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.id)
    await addToCart(product.id, product.store_id || storeId)
    setAddingId(null)
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  // 加载中
  if (loading && !store) {
    return (
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '500px' }}>
        <Text style={{ fontSize: '16px', color: '#999' }}>加载中...</Text>
      </View>
    )
  }

  // 无数据
  if (!store) {
    return (
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '500px' }}>
        <Text style={{ fontSize: '16px', color: '#999' }}>暂无门店信息</Text>
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
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#F5F5F5' }}>

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

      {/* ========== 门店专属红包横幅（进店领→归属） ========== */}
      {storeCampaign && (
        <View
          className="store-redpacket-banner"
          onClick={() => Taro.navigateTo({ url: `/pages/campaign-claim/index?campaignId=${storeCampaign.id}` })}
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
        borderBottomColor: '#E5E5E5',
        flexShrink: 0,
      }}>
        {['堂食', '配送'].map(label => (
          <View
            key={label}
            style={{
              padding: '6px 18px',
              borderRadius: '999px',
              borderWidth: '2px',
              borderColor: '#A8552E',
              backgroundColor: 'rgba(194,65,12,0.08)',
              marginRight: '10px',
            }}>
            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#A8552E' }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ========== 分类 + 商品列表 ========== */}
      <View style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>

        {/* 左侧分类栏 */}
        <ScrollView scrollY style={{ width: '88px', height: '100%', backgroundColor: '#F5F5F5' }}>
          <View
            onClick={() => setActiveCat('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 0',
              backgroundColor: activeCat === 'all' ? '#FFF' : 'transparent',
              borderLeftWidth: activeCat === 'all' ? '3px' : '0',
              borderLeftColor: '#A8552E',
            }}>
            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: activeCat === 'all' ? '#A8552E' : '#333' }}>全部</Text>
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
                borderLeftColor: '#A8552E',
              }}>
              <Text style={{ fontSize: '15px', fontWeight: 'bold', color: activeCat === cat.id ? '#A8552E' : '#333' }}>{cat.name}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 右侧商品列表 */}
        <ScrollView scrollY style={{ flex: 1, height: '100%', padding: '12px' }}>
          {filteredProducts.length === 0 ? (
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '80px' }}>
              <Text style={{ fontSize: '15px', color: '#999' }}>暂无商品</Text>
            </View>
          ) : (
            <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px' }}>
              {filteredProducts.map((p) => (
                <View
                  key={p.id}
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                  style={{
                    width: 'calc(50% - 5px)',
                    backgroundColor: '#FFF',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    borderWidth: '1px',
                    borderColor: '#EDEDED',
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
                    <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#333' }} numberOfLines={2}>{p.name}</Text>

                    {/* 情绪标签 */}
                    {p.mood_tags && p.mood_tags.length > 0 && (
                      <View style={{ display: 'flex', flexDirection: 'row', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {p.mood_tags.slice(0, 2).map((tag) => (
                          <View
                            key={tag}
                            style={{
                              borderRadius: '999px',
                              padding: '2px 8px',
                              backgroundColor: 'rgba(194,65,12,0.1)',
                            }}>
                            <Text style={{ fontSize: '11px', color: '#A8552E' }}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 价格 + 加入购物车 */}
                    <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px' }}>
                      <Text style={{ fontSize: '17px', fontWeight: 'bold', color: '#A8552E' }}>¥{p.price}</Text>
                      <AddToCartButton onAdd={() => handleAddCart(p)} adding={addingId === p.id} size={36} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: '20px' }} />
        </ScrollView>
      </View>
    </View>
  )
}
