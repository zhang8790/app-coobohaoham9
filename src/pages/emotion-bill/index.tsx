// @title 我的情绪账单
import { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import {
  getUserEmotionClaims,
  getEmotionTongbaoStats,
  getUserEmotionBadges,
  getEmotionBadgeDefs,
} from '@/db/api'
import type { EmotionClaim, Product, EmotionBadgeDef, EmotionBadgeGrant } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import './index.scss'

function fmtDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const RARITY_COLORS: Record<string, string> = {
  common: '#78716C',
  rare:   '#2563EB',
  epic:   '#9333EA',
  legend: '#DC2626',
}

function EmotionBillPage() {
  const { user } = useAuth()
  const [claims, setClaims] = useState<EmotionClaim[]>([])
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [stats, setStats] = useState({ balance: 0, total_earned: 0, total_spent: 0 })
  const [badges, setBadges] = useState<EmotionBadgeGrant[]>([])
  const [badgeDefs, setBadgeDefs] = useState<EmotionBadgeDef[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const [cls, st, bg, bd] = await Promise.all([
        getUserEmotionClaims(user.id).catch(() => [] as EmotionClaim[]),
        getEmotionTongbaoStats(user.id).catch(() => ({ balance: 0, total_earned: 0, total_spent: 0 })),
        getUserEmotionBadges(user.id).catch(() => [] as EmotionBadgeGrant[]),
        getEmotionBadgeDefs().catch(() => [] as EmotionBadgeDef[]),
      ])
      setClaims(cls || [])
      setStats(st)
      setBadges(bg || [])
      setBadgeDefs(bd || [])
      const ids = (cls || []).map(c => c.product_id).filter(Boolean) as string[]
      if (ids.length) {
        const { data: prods } = await supabase
          .from('products')
          .select('id,name,price,main_image,image_url')
          .in('id', ids)
        const map: Record<string, Product> = {}
        ;(prods || []).forEach(pd => { map[pd.id] = pd as Product })
        setProducts(map)
      }
    } catch (e) {
      console.error('[EmotionBill] load', e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])
  useDidShow(() => { load() })

  if (!user) {
    return (
      <View className="min-h-screen bg-background flex items-center justify-center">
        <View className="text-center" onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
          <View className="i-mdi-emoticon-sad-outline text-6xl text-muted-foreground mx-auto" />
          <Text className="text-xl text-muted-foreground mt-3" style={{ display: 'block' }}>请先登录查看情绪账单</Text>
        </View>
      </View>
    )
  }

  // 徽章已获集合
  const ownedCodes = new Set(badges.map(b => b.badge_code))
  const badgesToShow = badgeDefs.slice(0, 5)  // 顶部条带最多展示 5 枚
  const totalTongbao = claims.reduce((s, c) => s + (c.tongbao_amount || 0), 0)

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* 顶部统计 */}
      <View className="emotion-bill-header px-4 pt-8 pb-6">
        <Text className="text-3xl font-bold text-foreground" style={{ display: 'block' }}>情绪账单</Text>
        <Text className="text-xl text-muted-foreground mt-1" style={{ display: 'block' }}>每一次确权，都是被接住的时刻</Text>
        <View className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: '通宝余额', value: `${stats.balance}`, sub: '可用通宝' },
            { label: '累计获得', value: `${stats.total_earned}`, sub: '总入账' },
            { label: '累计消耗', value: `${stats.total_spent}`, sub: '总支出' },
          ].map(s => (
            <View key={s.label} className="emotion-stat-card">
              <Text className="text-2xl font-bold text-foreground">{s.value}</Text>
              <Text className="text-base text-foreground mt-1" style={{ display: 'block', fontWeight: 'bold' }}>{s.label}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5" style={{ display: 'block' }}>{s.sub}</Text>
            </View>
          ))}
        </View>
        {/* 徽章条带（横滑） */}
        {badgeDefs.length > 0 && (
          <View className="mt-5">
            <View className="flex items-center justify-between">
              <Text className="text-lg text-foreground font-bold" style={{ display: 'block' }}>我的徽章</Text>
              <Text className="text-sm text-primary" style={{ display: 'block' }}
                onClick={() => Taro.navigateTo({ url: '/pages/emotion-badges/index' })}>
                查看全部 ({ownedCodes.size}/{badgeDefs.length}) ›
              </Text>
            </View>
            <View className="emotion-badge-strip mt-3">
              {badgesToShow.map(def => {
                const owned = ownedCodes.has(def.code)
                return (
                  <View key={def.code} className={`emotion-badge-chip ${owned ? '' : 'is-locked'}`}>
                    <Text className="emotion-badge-icon">{def.icon}</Text>
                    <Text className="emotion-badge-name" style={{ display: 'block' }}>{def.name}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}
      </View>

      {/* 确权卡集 */}
      <View className="px-4 mt-4">
        <Text className="text-lg font-bold text-foreground mb-3" style={{ display: 'block' }}>确权时刻</Text>
        {loading ? (
          <View className="flex items-center justify-center py-10">
            <View className="i-mdi-loading text-3xl text-primary animate-spin" />
          </View>
        ) : claims.length === 0 ? (
          <View className="emotion-empty">
            <View className="i-mdi-card-heart-outline text-6xl text-muted-foreground" />
            <Text className="text-xl text-muted-foreground mt-3" style={{ display: 'block' }}>还没有情绪确权记录</Text>
            <Text className="text-base text-muted-foreground mt-1" style={{ display: 'block' }}>去逛逛，下单后给商品一个情绪确认吧</Text>
            <View className="emotion-empty-btn" onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
              <Text className="text-white text-xl">去逛逛</Text>
            </View>
          </View>
        ) : (
          claims.map(c => {
            const prod = c.product_id ? products[c.product_id] : undefined
            const img = prod?.main_image || prod?.image_url
            const emotions = c.selected_emotion || []
            return (
              <View key={c.id} className="emotion-claim-card"
                onClick={() => c.product_id && Taro.navigateTo({ url: `/pages/product/index?id=${c.product_id}` })}>
                <View className="emotion-claim-badge">{c.badge_text || '情绪确权'}</View>
                <View className="flex gap-3 mt-3">
                  {img ? (
                    <Image src={img} mode="aspectFill" className="emotion-claim-img" />
                  ) : (
                    <View className="emotion-claim-img emotion-claim-img--ph">
                      <View className="i-mdi-image text-3xl text-muted-foreground" />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-xl font-bold text-foreground" style={{ display: 'block' }}>{prod?.name || '商品已下架'}</Text>
                    {prod && <Text className="text-lg text-primary mt-1" style={{ display: 'block' }}>¥{prod.price}</Text>}
                    <View className="flex flex-wrap gap-1.5 mt-2">
                      {emotions.map(e => (
                        <Text key={e} className="emotion-chip">{e}</Text>
                      ))}
                    </View>
                  </View>
                </View>
                <View className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <Text className="text-base text-muted-foreground">+{c.tongbao_amount || 0} 通宝 · {fmtDate(c.created_at)}</Text>
                  <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}

export default EmotionBillPage
