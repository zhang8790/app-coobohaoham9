// @title 犒赏铺
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getStores, getCartCount } from '@/db/api'
import type { Store } from '@/db/types'

const CATEGORIES = ['全部', '餐饮', '购物', '娱乐', '美容', '家政', '教育']

export default function RewardShopPage() {
  const [activeCat, setActiveCat] = useState('全部')
  const [stores, setStores] = useState<Store[]>([])
  const [cartCount, setCartCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const page = useRef(0)
  const hasMore = useRef(true)

  const loadStores = useCallback(async (cat: string, reset = true) => {
    const p = reset ? 0 : page.current
    setLoading(true)
    const data = await getStores(cat, p, 20)
    if (reset) { setStores(data); page.current = 1 }
    else { setStores(prev => [...prev, ...data]); page.current = p + 1 }
    hasMore.current = data.length === 20
    setLoading(false)
  }, [])

  const refreshCart = useCallback(async () => { setCartCount(await getCartCount()) }, [])

  useEffect(() => { loadStores('全部'); refreshCart() }, [refreshCart])
  useDidShow(() => { refreshCart() })

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部 */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <div className="i-mdi-magnify text-xl text-muted-foreground" />
          <span className="text-xl text-muted-foreground">搜索门店...</span>
        </div>
        <div className="relative" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <div className="i-mdi-shopping-outline text-2xl text-foreground" />
          {cartCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white text-xs">{cartCount > 99 ? '99' : cartCount}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧分类 */}
        <div className="w-24 flex flex-col bg-muted overflow-y-auto">
          {CATEGORIES.map(cat => (
            <div key={cat}
              className={`py-4 flex items-center justify-center text-xl font-bold transition ${activeCat === cat ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
              onClick={() => { setActiveCat(cat); loadStores(cat, true) }}>
              {cat}
            </div>
          ))}
        </div>

        {/* 右侧商家列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && stores.length === 0 ? (
            <div className="flex items-center justify-center pt-20">
              <div className="i-mdi-loading text-3xl text-primary animate-spin" />
            </div>
          ) : (
            stores.map(store => (
              <div key={store.id} className="bg-card rounded-2xl overflow-hidden border border-border mb-3 flex gap-0"
                onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${store.id}` })}>
                <Image src={store.image_url || ''} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }} />
                <div className="flex-1 p-3 flex flex-col justify-between">
                  <div>
                    <p className="text-xl font-bold text-foreground">{store.name}</p>
                    <p className="text-base text-muted-foreground mt-1 line-clamp-2">{store.description}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="i-mdi-star text-base text-yellow-500" />
                    <span className="text-xl text-foreground font-bold">{store.rating}</span>
                    <span className="text-base text-muted-foreground">{store.category}</span>
                  </div>
                </div>
                <div className="flex items-center pr-3">
                  <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
                </div>
              </div>
            ))
          )}
          {hasMore.current && stores.length > 0 && (
            <div className="flex justify-center pt-2 pb-2">
              <button type="button" className="px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={() => loadStores(activeCat, false)}>
                {loading ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
