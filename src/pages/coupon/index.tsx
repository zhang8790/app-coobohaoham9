// @title 我的优惠券
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { getMyCoupons, getClaimableCoupons, claimCoupon } from '@/db/api'
import type { Coupon } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

type Tab = 'claim' | 'available' | 'used' | 'expired'

function CouponPage() {
  const [tab, setTab] = useState<Tab>('claim')
  const [all, setAll] = useState<Coupon[]>([])
  const [claimable, setClaimable] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [mine, claim] = await Promise.all([getMyCoupons(), getClaimableCoupons()])
    setAll(mine)
    setClaimable(claim)
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

  const handleClaim = async (tpl: Coupon) => {
    setClaimingId(tpl.id)
    const res = await claimCoupon(tpl.id)
    setClaimingId(null)
    if (res.ok) {
      Taro.showToast({ title: '领取成功', icon: 'success' })
      load()
    } else {
      Taro.showToast({ title: res.error || '领取失败', icon: 'none' })
    }
  }

  const handleUse = (c: Coupon) => {
    Taro.showModal({
      title: '到店核销',
      content: `券码：${c.code}\n请到店出示此码给商家核销`,
      showCancel: false,
      confirmText: '知道了',
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {/* Tab */}
      <View className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([
          ['claim', '领券'],
          ['available', '可使用'],
          ['used', '已使用'],
          ['expired', '已过期'],
        ] as const).map(([key, label]) => (
          <View key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </View>
        ))}
      </View>

      <View className="px-4 mt-4">
        {loading ? (
          <View className="flex justify-center py-16">
            <Icon name="loading" size={36} className="text-primary animate-spin" />
          </View>
        ) : tab === 'claim' ? (
          claimable.length === 0 ? (
            <View className="flex flex-col items-center py-20 gap-4">
              <View className="text-7xl text-muted-foreground/30">🎫</View>
              <Text className="text-xl text-muted-foreground">暂无可领取的优惠券</Text>
            </View>
          ) : claimable.map(c => {
            const expired = c.end_date ? new Date(c.end_date) < now : false
            return (
              <View key={c.id} className="mb-3 rounded-2xl overflow-hidden border border-primary/30">
                <View className="flex">
                  <View className="w-28 flex flex-col items-center justify-center py-5 flex-shrink-0 bg-primary">
                    <Text className="text-4xl font-black text-white">{discountText(c)}</Text>
                    {c.min_amount > 0 && (
                      <Text className="text-base mt-1 text-white/80">满{c.min_amount}可用</Text>
                    )}
                  </View>
                  <View className="flex-1 px-4 py-4 bg-card flex flex-col justify-between">
                    <Text className="text-xl font-bold text-foreground line-clamp-1">{c.title}</Text>
                    <View className="flex items-center justify-between mt-2">
                      <Text className="text-base text-muted-foreground">{formatExpire(c.end_date)}</Text>
                      <View
                        className="flex items-center justify-center leading-none rounded-xl bg-primary"
                        onClick={() => handleClaim(c)}>
                        <View className="py-1 px-3 text-xl text-white font-bold">
                          {claimingId === c.id ? '领取中...' : '领取'}
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="h-px" style={{ background: 'repeating-linear-gradient(90deg, var(--border) 0 8px, transparent 8px 12px)' }} />
              </View>
            )
          })
        ) : filtered.length === 0 ? (
          <View className="flex flex-col items-center py-20 gap-4">
            <Icon name="ticket-percent-outline" size={28} className="text-7xl text-muted-foreground/30" />
            <Text className="text-xl text-muted-foreground">
              {tab === 'available' ? '暂无可用优惠券' : tab === 'used' ? '暂无已使用的优惠券' : '暂无已过期的优惠券'}
            </Text>
            {tab === 'available' && (
              <View
                className="flex items-center justify-center leading-none rounded-2xl bg-primary"
                onClick={() => setTab('claim')}>
                <View className="py-3 px-8 text-xl font-bold text-white">去领券</View>
              </View>
            )}
          </View>
        ) : (
          filtered.map(c => {
            const isUsed = c.is_used
            const isExpired = c.expired_at ? new Date(c.expired_at) < now : false
            const dim = isUsed || isExpired
            return (
              <View key={c.id} className={`mb-3 rounded-2xl overflow-hidden border ${dim ? 'border-border opacity-60' : 'border-primary/30'}`}>
                <View className="flex">
                  <View className={`w-28 flex flex-col items-center justify-center py-5 flex-shrink-0 ${dim ? 'bg-muted' : 'bg-primary'}`}>
                    <Text className={`text-4xl font-black ${dim ? 'text-muted-foreground' : 'text-white'}`}>{discountText(c)}</Text>
                    {c.min_amount > 0 && (
                      <Text className={`text-base mt-1 ${dim ? 'text-muted-foreground' : 'text-white/80'}`}>满{c.min_amount}可用</Text>
                    )}
                  </View>
                  <View className="flex-1 px-4 py-4 bg-card flex flex-col justify-between">
                    <Text className="text-xl font-bold text-foreground line-clamp-1">{c.title}</Text>
                    <View className="flex items-center justify-between mt-2">
                      <Text className="text-base text-muted-foreground">{formatExpire(c.expired_at)}</Text>
                      {!dim && (
                        <View
                          className="flex items-center justify-center leading-none rounded-xl bg-primary/10"
                          onClick={() => handleUse(c)}>
                          <View className="py-1 px-3 text-xl text-primary font-bold">去使用</View>
                        </View>
                      )}
                      {isUsed && <Text className="text-xl text-muted-foreground font-bold">已使用</Text>}
                      {isExpired && !isUsed && <Text className="text-xl text-muted-foreground font-bold">已过期</Text>}
                    </View>
                  </View>
                </View>
                <View className="h-px" style={{ background: 'repeating-linear-gradient(90deg, var(--border) 0 8px, transparent 8px 12px)' }} />
              </View>
            )
          })
        )}
      </View>
    </View>
  </RouteGuard>)
}

export default CouponPage
