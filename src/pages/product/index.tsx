// @title 商品详情
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getProductById, addToCart, getCartCount, isFavorited, toggleFavorite, recordFootprint } from '@/db/api'
import { updateCartBadge } from '@/utils/cartBadge'
import type { Product } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'

export default function ProductPage() {
  const { user } = useAuth()
  const id = useMemo(() => {
    const params = Taro.getCurrentInstance().router?.params
    return params?.id ? decodeURIComponent(params.id) : ''
  }, [])
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [myCode, setMyCode] = useState('')
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const data = await getProductById(id)
    setProduct(data)
    setLoading(false)
    // 记录浏览足迹
    if (data) recordFootprint(data.id).catch(() => {})
  }, [id])

  const refreshCart = useCallback(async () => {
    if (!user) return
    setCartCount(await getCartCount())
    const [favStatus, { data }] = await Promise.all([
      isFavorited(id),
      supabase.from('profiles').select('referral_code').maybeSingle(),
    ])
    setIsFav(favStatus)
    if (data?.referral_code) setMyCode(data.referral_code)
  }, [user, id])

  useEffect(() => { load(); refreshCart() }, [load, refreshCart])
  useDidShow(() => { refreshCart() })

  // 商品分享携带推广码，好友扫码→锁定为下线
  useShareAppMessage(() => ({
    title: product ? `${product.name} · 来店有喜江湖好物` : '来店有喜 · 武侠生活平台',
    path: `/pages/product/index?id=${encodeURIComponent(id)}${myCode ? `&ref=${myCode}` : ''}`,
  }))
  useShareTimeline(() => ({
    title: product ? `${product.name} · 来店有喜` : '来店有喜',
  }))

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
    Taro.showToast({ title: newFav ? '已收藏' : '已取消收藏', icon: 'none' })
  }

  const handleAddCart = async () => {
    if (!requireLogin() || !product) return
    setAdding(true)
    await addToCart(product.id, product.store_id)
    setAdding(false)
    setCartCount(prev => prev + 1)
    updateCartBadge()
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  const handleBuyNow = async () => {
    if (!requireLogin() || !product) return
    setAdding(true)
    await addToCart(product.id, product.store_id)
    setAdding(false)
    updateCartBadge()
    Taro.navigateTo({ url: `/pages/payment/index?productId=${encodeURIComponent(product.id)}&total=${product.price}` })
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )
  if (!product) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <p className="text-xl text-muted-foreground">商品不存在</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* 商品图 + 顶部返回 + 购物车角标 */}
      <div className="relative">
        <Image src={product.image_url || ''} mode="aspectFill" className="w-full" style={{ height: '280px', display: 'block' }} />
        <button type="button"
          className="absolute top-3 left-4 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-white" />
        </button>
        {cartCount > 0 && (
          <div className="absolute top-3 right-4" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
            <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
              <div className="i-mdi-shopping-outline text-2xl text-white" />
            </div>
            <div className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-primary flex items-center justify-center px-1">
              <span className="text-white text-xs font-bold">{cartCount > 99 ? '99+' : cartCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* 价格信息卡 */}
      <div className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-primary">¥{product.price}</span>
          {product.original_price && (
            <span className="text-xl text-muted-foreground line-through">¥{product.original_price}</span>
          )}
          {product.original_price && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-xl font-bold text-primary">
              省¥{(product.original_price - product.price).toFixed(2)}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground mt-3 leading-tight">{product.name}</h1>
        {product.description && (
          <p className="text-xl text-muted-foreground mt-2 leading-relaxed">{product.description}</p>
        )}
        {product.mood_tags && product.mood_tags.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {product.mood_tags.map(t => (
              <span key={t} className="px-3 py-1 rounded-full bg-muted text-xl text-secondary">{t}</span>
            ))}
          </div>
        )}
        {/* 进入门店 */}
        {product.stores && (
          <div className="mt-4 flex items-center gap-3 py-3 border-t border-border"
            onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${product.store_id}` })}>
            <div className="i-mdi-store text-2xl text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xl font-bold text-foreground">{(product.stores as any)?.name}</p>
              <p className="text-base text-muted-foreground">点击进入门店</p>
            </div>
            <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3 flex gap-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {/* 购物车图标入口 */}
        <div className="relative flex-shrink-0" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center border-2 border-border">
            <div className="i-mdi-shopping-outline text-2xl text-foreground" />
          </div>
          {cartCount > 0 && (
            <div className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-primary flex items-center justify-center px-1">
              <span className="text-white text-xs font-bold">{cartCount > 99 ? '99+' : cartCount}</span>
            </div>
          )}
        </div>
        {/* 收藏按钮 */}
        <div className="w-14 h-14 rounded-2xl bg-muted flex-shrink-0 flex items-center justify-center border-2 border-border"
          onClick={handleToggleFav}>
          {favLoading
            ? <div className="i-mdi-loading text-2xl text-primary animate-spin" />
            : <div className={`text-2xl ${isFav ? 'i-mdi-heart text-red-400' : 'i-mdi-heart-outline text-foreground'}`} />}
        </div>
        <button type="button"
          className="flex-1 flex items-center justify-center leading-none rounded-2xl border-2 border-primary bg-card"
          onClick={handleAddCart}>
          <div className="py-4 text-xl font-bold text-primary">
            {adding ? '加入中...' : '收入行囊'}
          </div>
        </button>
        <button type="button"
          className="flex-1 flex items-center justify-center leading-none rounded-2xl bg-primary"
          onClick={handleBuyNow}>
          <div className="py-4 text-xl font-bold text-white">立即购买</div>
        </button>
      </div>
    </div>
  )
}
