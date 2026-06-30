// @title 我的收藏
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getMyFavorites, toggleFavorite } from '@/db/api'
import type { Favorite } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

function FavoritesPage() {
  const [items, setItems] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await getMyFavorites())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const handleRemove = async (fav: Favorite) => {
    setRemovingId(fav.id)
    await toggleFavorite(fav.product_id)
    setItems(prev => prev.filter(f => f.id !== fav.id))
    setRemovingId(null)
    Taro.showToast({ title: '已取消收藏', icon: 'none' })
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">我的收藏</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="i-mdi-loading text-4xl text-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-4">
          <div className="i-mdi-heart-off-outline text-7xl text-muted-foreground/30" />
          <p className="text-xl text-muted-foreground">暂无收藏，去逛逛吧</p>
          <button type="button"
            className="flex items-center justify-center leading-none rounded-2xl bg-primary"
            onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
            <div className="py-3 px-8 text-xl font-bold text-white">去逛逛</div>
          </button>
        </div>
      ) : (
        <div className="px-4 mt-2">
          <p className="text-base text-muted-foreground mb-3">共 {items.length} 件收藏</p>
          <div className="grid grid-cols-2 gap-3">
            {items.map(fav => {
              const p = fav.products
              if (!p) return null
              return (
                <div key={fav.id} className="bg-card rounded-2xl border border-border overflow-hidden"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(p.id)}` })}>
                  <div className="relative" style={{ height: '160px' }}>
                    {p.image_url
                      ? <Image src={p.image_url} mode="aspectFill" style={{ width: '100%', height: '160px' }} />
                      : <div className="w-full h-full bg-muted flex items-center justify-center">
                          <div className="i-mdi-image text-4xl text-muted-foreground/30" />
                        </div>}
                    <button type="button"
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center"
                      onClick={e => { e.stopPropagation(); handleRemove(fav) }}>
                      {removingId === fav.id
                        ? <div className="i-mdi-loading text-xl text-primary animate-spin" />
                        : <div className="i-mdi-heart text-xl text-red-400" />}
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-xl font-bold text-foreground line-clamp-2">{p.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xl font-bold text-primary">¥{p.price}</span>
                      {p.stores && <span className="text-base text-muted-foreground line-clamp-1">{p.stores.name}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(FavoritesPage)
