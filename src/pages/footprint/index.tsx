// @title 浏览足迹
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getMyFootprints, deleteFootprint } from '@/db/api'
import type { Footprint } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

function FootprintPage() {
  const [items, setItems] = useState<Footprint[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await getMyFootprints(0, 50))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const handleClearAll = () => {
    Taro.showModal({
      title: '清空足迹', content: '确认清空全部浏览记录？',
      confirmText: '清空', confirmColor: '#ef4444',
      success: async (r) => {
        if (r.confirm) {
          await Promise.all(items.map(i => deleteFootprint(i.id)))
          setItems([])
          Taro.showToast({ title: '已清空', icon: 'success' })
        }
      },
    })
  }

  // 按日期分组
  const grouped = items.reduce<Record<string, Footprint[]>>((acc, fp) => {
    const date = new Date(fp.viewed_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    if (!acc[date]) acc[date] = []
    acc[date].push(fp)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground">浏览足迹</span>
        {items.length > 0 && (
          <button type="button"
            className="flex items-center justify-center leading-none rounded-lg"
            onClick={handleClearAll}>
            <div className="px-3 py-1 text-xl text-muted-foreground">清空</div>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="i-mdi-loading text-4xl text-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-4">
          <div className="i-mdi-history text-7xl text-muted-foreground/30" />
          <p className="text-xl text-muted-foreground">暂无浏览记录</p>
        </div>
      ) : (
        <div className="px-4 mt-2">
          {Object.entries(grouped).map(([date, fps]) => (
            <div key={date} className="mb-4">
              <p className="text-base text-muted-foreground mb-2 px-1">{date}</p>
              <div className="flex flex-col gap-2">
                {fps.map(fp => {
                  const p = fp.products
                  if (!p) return null
                  return (
                    <div key={fp.id} className="bg-card rounded-2xl border border-border flex items-center gap-3 p-3"
                      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(p.id)}` })}>
                      <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                        {p.image_url
                          ? <Image src={p.image_url} mode="aspectFill" style={{ width: '64px', height: '64px' }} />
                          : <div className="w-full h-full flex items-center justify-center">
                              <div className="i-mdi-image text-2xl text-muted-foreground/30" />
                            </div>}
                      </div>
                      <div className="flex-1">
                        <p className="text-xl font-bold text-foreground line-clamp-1">{p.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xl font-bold text-primary">¥{p.price}</span>
                          {p.stores && <span className="text-base text-muted-foreground">{p.stores.name}</span>}
                        </div>
                      </div>
                      <button type="button"
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-muted flex-shrink-0"
                        onClick={e => { e.stopPropagation(); deleteFootprint(fp.id).then(() => setItems(prev => prev.filter(f => f.id !== fp.id))) }}>
                        <div className="i-mdi-close text-xl text-muted-foreground" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(FootprintPage)
