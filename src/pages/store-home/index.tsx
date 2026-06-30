// @title 门店
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getStoreById, getStoreCategories, getProducts, addToCart, getCartCount, generateQrcode } from '@/db/api'
import { updateCartBadge } from '@/utils/cartBadge'
import type { Store, StoreCategory, Product } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'

type ServiceMode = 'dine_in' | 'self_pickup' | 'delivery'
const SERVICE_MODES: { key: ServiceMode; label: string; icon: string }[] = [
  { key: 'dine_in', label: '堂食', icon: 'i-mdi-silverware-fork-knife' },
  { key: 'self_pickup', label: '自取', icon: 'i-mdi-walk' },
  { key: 'delivery', label: '外卖', icon: 'i-mdi-moped' },
]

export default function StoreHomePage() {
  const { user } = useAuth()
  const id = useMemo(() => {
    const params = Taro.getCurrentInstance().router?.params
    return params?.id ? decodeURIComponent(params.id) : ''
  }, [])
  const [store, setStore] = useState<Store | null>(null)
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeCatId, setActiveCatId] = useState<string>('all')
  const [addingId, setAddingId] = useState<string | null>(null)
  const [cartCount, setCartCount] = useState(0)
  const [serviceMode, setServiceMode] = useState<ServiceMode>('dine_in')
  const [showStoreQr, setShowStoreQr] = useState(false)
  const [storeQrUrl, setStoreQrUrl] = useState<string>('')
  const [storeQrLoading, setStoreQrLoading] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [s, cats] = await Promise.all([getStoreById(id), getStoreCategories(id)])
    setStore(s)
    setCategories(cats)
    const prods = await getProducts({ storeId: id })
    setProducts(prods)
  }, [id])

  const refreshCart = useCallback(async () => {
    if (!user) return
    setCartCount(await getCartCount())
  }, [user])

  useEffect(() => { load(); refreshCart() }, [load, refreshCart])
  useDidShow(() => { refreshCart() })

  const filteredProducts = useMemo(() => {
    if (activeCatId === 'all') return products
    return products.filter(p => p.category_id === activeCatId)
  }, [products, activeCatId])

  const handleAddCart = async (product: Product) => {
    if (!user) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.id)
    await addToCart(product.id, product.store_id)
    setAddingId(null)
    setCartCount(prev => prev + 1)
    updateCartBadge()
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  const goCart = () => Taro.switchTab({ url: '/pages/cart/index' })

  const handleShowStoreQr = async () => {
    if (!store?.short_code) { Taro.showToast({ title: '门店码暂未生成', icon: 'none' }); return }
    setShowStoreQr(true)
    if (storeQrUrl) return
    setStoreQrLoading(true)
    // 获取当前用户推广码（非必须，作为推广链）
    const { data: profileData } = await (await import('@/client/supabase')).supabase
      .from('profiles').select('referral_code').maybeSingle()
    const refCode = profileData?.referral_code || ''
    const url = await generateQrcode({ type: 'store', store_short_code: store.short_code, referral_code: refCode })
    setStoreQrLoading(false)
    if (url) setStoreQrUrl(url)
    else Taro.showToast({ title: '二维码生成失败', icon: 'none' })
  }

  const handleSaveStoreQr = () => {
    if (!storeQrUrl) return
    const isWeapp = Taro.getEnv() === 'WEAPP'
    if (!isWeapp) { Taro.showToast({ title: '保存功能仅在微信小程序中可用', icon: 'none' }); return }
    Taro.downloadFile({ url: storeQrUrl, success: (res) => {
      Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath,
        success: () => Taro.showToast({ title: '门店码已保存到相册', icon: 'success' }),
        fail: () => Taro.showToast({ title: '请授权相册权限', icon: 'none' }),
      })
    }})
  }

  if (!store) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 门店头部 */}
      <div className="relative" style={{ height: '160px' }}>
        <Image src={store.image_url || ''} mode="aspectFill" style={{ width: '100%', height: '160px', display: 'block' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6))' }} />
        {/* 顶部：返回 + 购物车角标 */}
        <div className="absolute top-3 left-4 right-4 flex items-center justify-between">
          <button type="button"
            className="w-9 h-9 rounded-full bg-black/30 flex items-center justify-center"
            onClick={() => Taro.navigateBack()}>
            <div className="i-mdi-arrow-left text-xl text-white" />
          </button>
          <div className="relative" onClick={goCart}>
            <div className="w-9 h-9 rounded-full bg-black/30 flex items-center justify-center">
              <div className="i-mdi-shopping-outline text-xl text-white" />
            </div>
            {cartCount > 0 && (
              <div className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-primary flex items-center justify-center px-1">
                <span className="text-white text-xs">{cartCount > 99 ? '99+' : cartCount}</span>
              </div>
            )}
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{store.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="i-mdi-star text-base" style={{ color: '#FCD34D' }} />
              <span className="text-xl text-white">{store.rating}</span>
              <span className="text-xl text-white/80">{store.category}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {store.phone && (
              <button type="button"
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
                onClick={() => Taro.makePhoneCall({ phoneNumber: store.phone! }).catch(() => {})}>
                <div className="i-mdi-phone text-xl text-white" />
              </button>
            )}
            <button type="button"
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
              onClick={() => Taro.openLocation({ latitude: 39.9, longitude: 116.4, name: store.name }).catch(() => {})}>
              <div className="i-mdi-navigation text-xl text-white" />
            </button>
            <button type="button"
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
              onClick={handleShowStoreQr}>
              <div className="i-mdi-qrcode text-xl text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* 服务模式选择 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        {SERVICE_MODES.map(m => (
          <div key={m.key}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border-2 transition ${serviceMode === m.key ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
            onClick={() => setServiceMode(m.key)}>
            <div className={`${m.icon} text-xl ${serviceMode === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-xl font-bold ${serviceMode === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* 分类 + 商品（底部留出购物车悬浮条高度）*/}
      <div className="flex overflow-hidden" style={{ flex: 1, paddingBottom: cartCount > 0 ? '64px' : '0' }}>
        <div className="w-24 flex flex-col bg-muted overflow-y-auto">
          <div className={`py-4 flex items-center justify-center text-xl font-bold ${activeCatId === 'all' ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
            onClick={() => setActiveCatId('all')}>全部</div>
          {categories.map(cat => (
            <div key={cat.id}
              className={`py-4 flex items-center justify-center text-xl font-bold ${activeCatId === cat.id ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
              onClick={() => setActiveCatId(cat.id)}>{cat.name}</div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map(p => (
              <div key={p.id} className="bg-card rounded-2xl overflow-hidden border border-border relative"
                onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                <Image src={p.image_url || ''} mode="aspectFill" className="w-full" style={{ height: '120px' }} />
                <div className="p-3">
                  <p className="text-xl font-bold text-foreground line-clamp-2 leading-tight">{p.name}</p>
                  <span className="text-xl font-bold text-primary mt-1">¥{p.price}</span>
                </div>
                <button type="button"
                  className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-primary flex items-center justify-center"
                  onClick={e => { e.stopPropagation(); handleAddCart(p) }}>
                  {addingId === p.id
                    ? <div className="i-mdi-loading text-white text-base animate-spin" />
                    : <div className="i-mdi-plus text-white text-base" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 门店二维码弹窗 */}
      {showStoreQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowStoreQr(false)}>
          <div className="mx-6 bg-card rounded-3xl p-6 flex flex-col items-center gap-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="i-mdi-qrcode text-2xl text-primary" />
              <span className="text-2xl font-bold text-foreground">{store?.name}</span>
            </div>
            <p className="text-xl text-muted-foreground text-center">扫码进入门店 · 自动锁定推广关系</p>

            {/* 二维码展示区 */}
            <div className="w-48 h-48 rounded-2xl border-2 border-primary/30 bg-background flex items-center justify-center overflow-hidden">
              {storeQrLoading ? (
                <div className="i-mdi-loading text-4xl text-primary animate-spin" />
              ) : storeQrUrl ? (
                <Image src={storeQrUrl} mode="aspectFit" style={{ width: '192px', height: '192px' }} />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="i-mdi-qrcode-scan text-4xl text-muted-foreground" />
                  <span className="text-xl text-muted-foreground">生成中...</span>
                </div>
              )}
            </div>

            <p className="text-base text-muted-foreground text-center px-2">
              顾客扫码即直达本店，同时锁定为你的推广下线
            </p>

            {/* 操作按钮 */}
            <div className="flex gap-3 w-full">
              {storeQrUrl && (
                <button type="button"
                  className="flex-1 flex items-center justify-center leading-none rounded-2xl bg-primary"
                  onClick={handleSaveStoreQr}>
                  <div className="py-3 flex items-center gap-2">
                    <div className="i-mdi-download text-white text-xl" />
                    <span className="text-xl font-bold text-white">保存图片</span>
                  </div>
                </button>
              )}
              <button type="button"
                className="flex-1 flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
                onClick={() => setShowStoreQr(false)}>
                <div className="py-3 text-xl text-muted-foreground">关闭</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部悬浮购物车条 —— 有商品时显示 */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-card border-t-2 border-border flex items-center gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <div className="relative" onClick={goCart}>
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center"
              style={{ boxShadow: '0 4px 12px rgba(194,65,12,0.35)' }}>
              <div className="i-mdi-shopping text-2xl text-white" />
            </div>
            <div className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-red-500 flex items-center justify-center px-1">
              <span className="text-white text-xs font-bold">{cartCount > 99 ? '99+' : cartCount}</span>
            </div>
          </div>
          <div className="flex-1">
            <span className="text-xl text-muted-foreground">行囊已装 </span>
            <span className="text-2xl font-bold text-primary">{cartCount} 件</span>
            <span className="text-xl text-muted-foreground"> 好物</span>
          </div>
          <button type="button"
            className="flex items-center justify-center leading-none rounded-2xl bg-primary"
            onClick={goCart}>
            <div className="py-3 px-6 text-xl text-white font-bold">去行囊</div>
          </button>
        </div>
      )}
    </div>
  )
}
