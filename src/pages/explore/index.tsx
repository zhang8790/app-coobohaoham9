// @title 探索
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getProducts, getCartCount, addToCart } from '@/db/api'
import type { Product } from '@/db/types'

const CATEGORIES = ['全部', '图书', '美食', '饮品', '零食', '日用', '礼品']

const STORE_CATEGORY_MAP: Record<string, string> = {
  '图书': '图书', '美食': '美食', '饮品': '饮品', '零食': '零食', '日用': '日用', '礼品': '礼品'
}

export default function ExplorePage() {
  const [activeCat, setActiveCat] = useState('全部')
  const [products, setProducts] = useState<Product[]>([])
  const [cartCount, setCartCount] = useState(0)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const page = useRef(0)
  const hasMore = useRef(true)

  const loadProducts = useCallback(async (cat: string, reset = true) => {
    if (loading && !reset) return
    const p = reset ? 0 : page.current
    setLoading(true)
    const data = await getProducts({
      page: p, limit: 20,
      ...(cat !== '全部' ? { search: STORE_CATEGORY_MAP[cat] } : {})
    })
    if (reset) {
      setProducts(data)
      page.current = 1
    } else {
      setProducts(prev => [...prev, ...data])
      page.current = p + 1
    }
    hasMore.current = data.length === 20
    setLoading(false)
  }, [loading])

  const refreshCart = useCallback(async () => {
    const c = await getCartCount()
    setCartCount(c)
  }, [])

  useEffect(() => { loadProducts('全部'); refreshCart() }, [refreshCart])
  useDidShow(() => { refreshCart() })

  const handleCatSelect = (cat: string) => {
    setActiveCat(cat)
    loadProducts(cat, true)
  }

  const handleAddCart = async (product: Product) => {
    const { supabase } = await import('@/client/supabase')
    const uid = (await supabase.auth.getUser()).data.user
    if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.id)
    await addToCart(product.id, product.store_id)
    setAddingId(null)
    setCartCount(c => c + 1)
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  const handleLoadMore = () => {
    if (!loading && hasMore.current) loadProducts(activeCat, false)
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部搜索栏 */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <div className="i-mdi-magnify text-xl text-muted-foreground" />
          <span className="text-xl text-muted-foreground">搜索商品...</span>
        </div>
        <button type="button" className="w-10 h-10 flex items-center justify-center"
          onClick={() => Taro.scanCode({ onlyFromCamera: false }).catch(() => {})}>
          <div className="i-mdi-qrcode-scan text-2xl text-foreground" />
        </button>
        <div className="relative" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <div className="i-mdi-shopping-outline text-2xl text-foreground" />
          {cartCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white text-xs">{cartCount > 99 ? '99' : cartCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* 主体：左导航+右列表 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧分类 */}
        <div className="w-24 flex flex-col bg-muted overflow-y-auto">
          {CATEGORIES.map(cat => (
            <div key={cat}
              className={`py-4 flex items-center justify-center text-xl font-bold transition ${activeCat === cat ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
              onClick={() => handleCatSelect(cat)}>
              {cat}
            </div>
          ))}
        </div>

        {/* 右侧商品网格 */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && products.length === 0 ? (
            <div className="flex items-center justify-center pt-20">
              <div className="i-mdi-loading text-3xl text-primary animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map(p => (
                <div key={p.id} className="bg-card rounded-2xl overflow-hidden border border-border relative"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                  <Image src={p.image_url || ''} mode="aspectFill" className="w-full" style={{ height: '120px' }} />
                  <div className="p-3">
                    <p className="text-xl font-bold text-foreground leading-tight line-clamp-2">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xl font-bold text-primary">¥{p.price}</span>
                      {p.original_price && <span className="text-base text-muted-foreground line-through">¥{p.original_price}</span>}
                    </div>
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
          )}
          {hasMore.current && products.length > 0 && (
            <div className="flex justify-center pt-4 pb-2">
              <button type="button" className="px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={handleLoadMore}>
                {loading ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
