// @title 扫码购物结果
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image, View, Text, Button } from '@tarojs/components'
import Icon from '@/components/Icon'
import {
  getProductByBarcode,
  getProductById,
  addToCart,
  trackFoodTherapyEvent,
} from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { setPendingCheckout } from '@/utils/checkoutCache'
import type { Product } from '@/db/types'
import { scanToProduct } from '@/utils/scan'

export default function ScanResultPage() {
  const { user } = useAuth()
  const cartCount = useCartCount()
  const code = decodeURIComponent(Taro.getCurrentInstance().router?.params?.code || '')
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  const storeName = (product as any)?.stores?.name as string | undefined
  const storeId = (product as any)?.stores?.id || (product as any)?.store_id

  const load = useCallback(async () => {
    if (!code) { setNotFound(true); setLoading(false); return }
    setLoading(true); setNotFound(false); setAdded(false)
    const trimmed = code.trim()
    let prod: Product | null = null
    // 1) 主路径：扫码购物 = 扫商品条码
    prod = await getProductByBarcode(trimmed)
    // 2) 兜底：扫码内容可能是商品 id，或带 ?id= 的链接 / 小程序码路径
    if (!prod) {
      const m = trimmed.match(/[?&]id=([^&]+)/)
      const idVal = m ? decodeURIComponent(m[1]) : trimmed
      prod = await getProductById(idVal)
    }
    setProduct(prod)
    setNotFound(!prod)
    setLoading(false)
  }, [code])

  useEffect(() => { load() }, [load])
  useEffect(() => { Taro.setNavigationBarTitle({ title: '扫码购物' }) }, [])

  const requireLogin = () => {
    if (!user) { Taro.navigateTo({ url: '/pages/login/index' }); return false }
    return true
  }

  const handleAddCart = async () => {
    if (!requireLogin() || !product) return
    if (!storeId) { Taro.showToast({ title: '商品门店信息缺失', icon: 'none' }); return }
    setAdding(true)
    await addToCart(product.id, storeId, 1)
    setAdded(true)
    await refreshCartCount()
    trackFoodTherapyEvent({ productId: product.id, eventType: 'add_cart', healthTag: (product as any).health_tag ?? [], emotionTag: (product as any).emotion_tag ?? [] }).catch(() => {})
    setAdding(false)
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  const handleBuyNow = async () => {
    if (!requireLogin() || !product) return
    if (!storeId) { Taro.showToast({ title: '商品门店信息缺失', icon: 'none' }); return }
    setAdding(true)
    await addToCart(product.id, storeId, 1)
    setPendingCheckout({ productId: product.id, total: product.price, quantity: 1 })
    setAdding(false)
    Taro.navigateTo({ url: `/pages/payment/index?productId=${encodeURIComponent(product.id)}&total=${product.price}&quantity=1` })
  }

  const rescan = () => { scanToProduct({ redirect: true }) }

  // 加载中
  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  // 未识别到商品
  if (notFound || !product) return (
    <View className="flex flex-col items-center justify-center min-h-screen bg-background px-8 gap-4">
      <Icon name="barcode-off" size={60} className="text-muted-foreground/40" />
      <Text className="text-2xl font-bold text-foreground">未识别到商品</Text>
      <Text className="text-base text-muted-foreground text-center break-all">扫码内容：{code || '（空）'}</Text>
      <Button type="button"
        className="mt-2 px-10 py-3 rounded-2xl bg-primary flex items-center justify-center"
        onClick={rescan}>
        <Text className="text-xl font-bold text-white">重新扫码</Text>
      </Button>
      <Button type="button"
        className="px-10 py-3 rounded-2xl bg-card border-2 border-border flex items-center justify-center"
        onClick={() => Taro.navigateBack().catch(() => Taro.switchTab({ url: '/pages/index/index' }))}>
        <Text className="text-xl font-bold text-foreground">返回</Text>
      </Button>
    </View>
  )

  const main = product.main_image || product.image_url
  const inactive = product.is_active === false

  return (
    <View className="min-h-screen bg-background pb-28">
      {/* 顶部提示 */}
      <View className="px-4 pt-4">
        <Text className="text-base text-muted-foreground">扫码购物 · 已为你找到商品</Text>
      </View>

      {/* 商品主图 */}
      <View className="px-4 mt-3">
        <View className="rounded-3xl overflow-hidden bg-card border border-border">
          {main ? (
            <Image src={main} mode="aspectFill" className="w-full" style={{ height: '360px' }} />
          ) : (
            <View className="w-full flex items-center justify-center" style={{ height: '360px' }}>
              <Icon name="image-off" size={60} className="text-muted-foreground/30" />
            </View>
          )}
        </View>
      </View>

      {/* 商品信息卡 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        <View className="flex items-center gap-3 flex-wrap">
          <Text className="text-4xl font-bold text-primary">¥{product.price}</Text>
          {product.original_price ? (
            <Text className="text-xl text-muted-foreground line-through">¥{product.original_price}</Text>
          ) : null}
          {product.original_price ? (
            <Text className="px-2 py-0.5 rounded-full bg-primary/10 text-base font-bold text-primary">
              省¥{(product.original_price - product.price).toFixed(2)}
            </Text>
          ) : null}
          {product.discount_rate != null && product.discount_rate > 0 ? (
            <Text className="px-2 py-0.5 rounded-full bg-primary/10 text-base font-bold text-primary">
              立减{product.discount_rate}%
            </Text>
          ) : null}
        </View>
        <View className="text-2xl font-bold text-foreground mt-3 leading-tight">{product.name}</View>
        {storeName ? (
          <View className="mt-2 flex items-center gap-1 text-muted-foreground">
            <Icon name="store" size={18} />
            <Text className="text-base">{storeName}</Text>
          </View>
        ) : null}
        {product.description ? (
          <Text className="text-base text-muted-foreground mt-3 leading-relaxed">{product.description}</Text>
        ) : null}
      </View>

      {/* 已下架提示 */}
      {inactive ? (
        <View className="mx-4 mt-4 py-3 px-4 rounded-2xl bg-muted flex items-center gap-2">
          <View className="text-muted-foreground"><Icon name="box" size={20} /></View>
          <Text className="text-base text-muted-foreground">该商品已下架，暂不可购买</Text>
        </View>
      ) : null}

      {/* 底部操作栏 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3 flex gap-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <View className="relative flex-shrink-0" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <View className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center border-2 border-border">
            <View className="text-foreground"><Icon name="bag" size={24} /></View>
          </View>
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-primary flex items-center justify-center px-1">
              <Text className="text-white text-xs font-bold">{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          )}
        </View>
        <Button type="button"
          className="flex-1 flex items-center justify-center leading-none rounded-2xl border-2 border-primary bg-card"
          onClick={handleAddCart} disabled={inactive}>
          <View className="py-4 text-xl font-bold text-primary">
            {added ? '已加入 ✓' : (adding ? '加入中...' : '收入行囊')}
          </View>
        </Button>
        <Button type="button"
          className="flex-1 flex items-center justify-center leading-none rounded-2xl bg-primary"
          onClick={handleBuyNow} disabled={inactive}>
          <View className="py-4 text-xl font-bold text-white">立即购买</View>
        </Button>
      </View>
    </View>
  )
}
