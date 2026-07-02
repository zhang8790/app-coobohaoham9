// @title 门店详情
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'

// 关键：必须从 common.js 导入至少一项，否则 Rollup 会 tree-sh掉 common.js 和 vendors.js
// 导致小程序运行时缺少必要代码 → 页面空白崩溃
import { getStoreById, getStoreCategories, getProducts } from '@/db/api'
import type { Store, StoreCategory, Product } from '@/db/types'

export default function StoreHomePage() {
  const [storeId, setStoreId] = useState('')
  const [store, setStore] = useState<Store | null>(null)
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeCat, setActiveCat] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // 获取路由参数
  useEffect(() => {
    try {
      const instance = Taro.getCurrentInstance()
      const id = instance?.router?.params?.id
      if (id) {
        setStoreId(decodeURIComponent(id))
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
        // 动态设置导航栏标题为商家名字
        Taro.setNavigationBarTitle({ title: s.name })
      }
      setCategories(cats)
      setProducts(prods)
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

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#F5F5F5' }}>

      {/* ========== 门店头部 Banner ========== */}
      <View style={{ position: 'relative', height: '180px', flexShrink: 0 }}>
        <Image
          src={store.image_url || ''}
          mode="aspectFill"
          style={{ width: '100%', height: '180px', display: 'block' }}
        />
        {/* 渐变遮罩 */}
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 100%)',
        }} />
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
        {['堂食', '自取', '外卖'].map(label => (
          <View
            key={label}
            style={{
              padding: '6px 18px',
              borderRadius: '999px',
              borderWidth: '2px',
              borderColor: '#C2410C',
              backgroundColor: 'rgba(194,65,12,0.08)',
              marginRight: '10px',
            }}>
            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#C2410C' }}>{label}</Text>
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
              borderLeftColor: '#C2410C',
            }}>
            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: activeCat === 'all' ? '#C2410C' : '#333' }}>全部</Text>
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
                borderLeftColor: '#C2410C',
              }}>
              <Text style={{ fontSize: '15px', fontWeight: 'bold', color: activeCat === cat.id ? '#C2410C' : '#333' }}>{cat.name}</Text>
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
                  }}>
                  <Image
                    src={p.main_image || p.image_url || ''}
                    mode="aspectFill"
                    style={{ width: '100%', height: '120px', display: 'block' }}
                  />
                  <View style={{ padding: '10px' }}>
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
                            <Text style={{ fontSize: '11px', color: '#C2410C' }}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text style={{ fontSize: '17px', fontWeight: 'bold', color: '#C2410C', marginTop: '6px' }}>¥{p.price}</Text>
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
