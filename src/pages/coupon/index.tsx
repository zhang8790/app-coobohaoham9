// @title 我的优惠券
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getMyCoupons } from '@/db/api'
import type { Coupon } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

type Tab = 'available' | 'used' | 'expired'

function CouponPage() {
  const [tab, setTab] = useState<Tab>('available')
  const [all, setAll] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setAll(await getMyCoupons())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const now = new Date()
  const filtered = all.filter(c => {
    const expired = c.expired_at ? new Date(c.expired_at) < now : false
    if (tab === 'available') return !c.is_used && !expired
    if (tab === 'used') return c.is_used
    return expired && !c.is_used
  })

  const formatExpire = (date: string | null) => {
    if (!date) return '永久有效'
    return `${new Date(date).toLocaleDateString('zh-CN')} 到期`
  }

  const discountText = (c: Coupon) => {
    if (c.discount_type === 'amount') return `¥${c.discount_value}`
    return `${c.discount_value}折`
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">我的优惠券</span>
      </div>

      {/* Tab */}
      <div className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([['available', '可使用'], ['used', '已使用'], ['expired', '已过期']] as const).map(([key, label]) => (
          <div key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </div>
        ))}
      </div>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="i-mdi-loading text-4xl text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="i-mdi-ticket-percent-outline text-7xl text-muted-foreground/30" />
            <p className="text-xl text-muted-foreground">
              {tab === 'available' ? '暂无可用优惠券' : tab === 'used' ? '暂无已使用的优惠券' : '暂无已过期的优惠券'}
            </p>
            {tab === 'available' && (
              <button type="button"
                className="flex items-center justify-center leading-none rounded-2xl bg-primary"
                onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
                <div className="py-3 px-8 text-xl font-bold text-white">去逛逛赚券</div>
              </button>
            )}
          </div>
        ) : (
          filtered.map(c => {
            const isUsed = c.is_used
            const isExpired = c.expired_at ? new Date(c.expired_at) < now : false
            const dim = isUsed || isExpired
            return (
              <div key={c.id} className={`mb-3 rounded-2xl overflow-hidden border ${dim ? 'border-border opacity-60' : 'border-primary/30'}`}>
                <div className="flex">
                  {/* 左侧金额 */}
                  <div className={`w-28 flex flex-col items-center justify-center py-5 flex-shrink-0 ${dim ? 'bg-muted' : 'bg-primary'}`}>
                    <span className={`text-4xl font-black ${dim ? 'text-muted-foreground' : 'text-white'}`}>{discountText(c)}</span>
                    {c.min_amount > 0 && (
                      <span className={`text-base mt-1 ${dim ? 'text-muted-foreground' : 'text-white/80'}`}>满{c.min_amount}可用</span>
                    )}
                  </div>
                  {/* 右侧信息 */}
                  <div className="flex-1 px-4 py-4 bg-card flex flex-col justify-between">
                    <p className="text-xl font-bold text-foreground line-clamp-1">{c.title}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-base text-muted-foreground">{formatExpire(c.expired_at)}</span>
                      {!dim && (
                        <button type="button"
                          className="flex items-center justify-center leading-none rounded-xl bg-primary/10"
                          onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
                          <div className="py-1 px-3 text-xl text-primary font-bold">去使用</div>
                        </button>
                      )}
                      {isUsed && <span className="text-xl text-muted-foreground font-bold">已使用</span>}
                      {isExpired && !isUsed && <span className="text-xl text-muted-foreground font-bold">已过期</span>}
                    </div>
                  </div>
                </div>
                {/* 锯齿分隔线 */}
                <div className="h-px" style={{ background: 'repeating-linear-gradient(90deg, var(--border) 0 8px, transparent 8px 12px)' }} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(CouponPage)
