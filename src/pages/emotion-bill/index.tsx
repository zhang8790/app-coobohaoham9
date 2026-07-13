// @title 我的情绪账单
import { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import {
  getUserEmotionClaims,
  getUserEmotionBadges,
  getEmotionBadgeDefs,
  getMyProfile,
  getEquitySummary,
} from '@/db/api'
import type { EquitySummary } from '@/db/api'
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
function sharePct(r: number): string {
  const p = r * 100
  return (p < 0.01 ? p.toFixed(4) : p.toFixed(2)) + '%'
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
  const [tbBalance, setTbBalance] = useState(0)
  const [cvTotal, setCvTotal] = useState(0)
  const [equity, setEquity] = useState<EquitySummary | null>(null)
  const [badges, setBadges] = useState<EmotionBadgeGrant[]>([])
  const [badgeDefs, setBadgeDefs] = useState<EmotionBadgeDef[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const [cls, prof, bg, bd, eq] = await Promise.all([
        getUserEmotionClaims(user.id).catch(() => [] as EmotionClaim[]),
        getMyProfile().catch(() => null),
        getUserEmotionBadges(user.id).catch(() => [] as EmotionBadgeGrant[]),
        getEmotionBadgeDefs().catch(() => [] as EmotionBadgeDef[]),
        getEquitySummary().catch(() => null),
      ])
      setClaims(cls || [])
      setTbBalance((prof as any)?.tb_balance || 0)
      setCvTotal((prof as any)?.cv_total || 0)
      setBadges(bg || [])
      setBadgeDefs(bd || [])
      if (eq) setEquity(eq)
      const ids = (cls || []).map(c => c.product_id).filter(Boolean) as string[]
      if (ids.length) {
        const { data: prods } = await supabase
          .from('products')
          .select('id,name,price,main_image,image_url')
          .in('id', ids)
        const map: Record<string, Product> = {}
        ;(prods || []).forEach((pd: Product) => { map[pd.id] = pd })
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

  const goShop = useCallback(() => {
    // 确权已改为「支付成功自动发放」，不再需要手动跳转确权页。
    // 该入口引导用户去逛逛，下单后即自动确权、累积成长值。
    Taro.switchTab({ url: '/pages/index/index' }).catch(() => {})
  }, [])
  const scrollTo = useCallback((sel: string) => {
    Taro.pageScrollTo({ selector: sel, offsetTop: 64 }).catch(() => {})
  }, [])

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

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* 顶部统计 */}
      <View className="emotion-bill-header px-4 pt-8 pb-6">
        <View className="flex items-center justify-between">
          <View>
            <Text className="text-3xl font-bold text-foreground" style={{ display: 'block' }}>情绪账单</Text>
            <Text className="text-xl text-muted-foreground mt-1" style={{ display: 'block' }}>每一次确权，都是被接住的时刻</Text>
          </View>
          <View className="emotion-cta" onClick={goShop} hoverClass="emotion-cta--active">
            <Text className="emotion-cta-text">去逛逛 ›</Text>
          </View>
        </View>
        <View className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: '情绪豆', value: `${tbBalance}`, sub: '可用' },
            { label: '会员贡献值', value: `${cvTotal}`, sub: '会员权益依据' },
            { label: '确权次数', value: `${claims.length}`, sub: '累计确权' },
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
        {/* 会员权益区块 */}
        {equity && (
          <View id="sec-equity" className="emotion-equity-block mt-5">
            <View className="flex items-center justify-between">
              <Text className="text-lg font-bold text-foreground" style={{ display: 'block' }}>我的会员权益</Text>
              <View className="emotion-equity-cta" onClick={goShop} hoverClass="emotion-equity-cta--active">
                <Text className="emotion-equity-cta-text">去逛逛提成长值 ›</Text>
              </View>
            </View>
            <View style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#DC2626' }}>{sharePct(equity.shareRatio)}</Text>
                <Text style={{ fontSize: '12px', color: '#999', display: 'block' }}>全平台成长占比</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#DC2626' }}>{(equity.dividendEstimate || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</Text>
                <Text style={{ fontSize: '12px', color: '#999', display: 'block' }}>年度成长回馈(情绪豆)</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>{(equity.newUsersThisMonth || 0).toLocaleString('zh-CN')}</Text>
                <Text style={{ fontSize: '12px', color: '#999', display: 'block' }}>本月新增用户</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* 子导航：快速跳转各区块 */}
      <View className="emotion-subnav">
        <View className="emotion-subnav-btn" onClick={() => scrollTo('#sec-claims')} hoverClass="emotion-subnav-btn--active">确权集</View>
        <View className="emotion-subnav-btn" onClick={() => Taro.navigateTo({ url: '/pages/emotion-badges/index' }).catch(() => {})} hoverClass="emotion-subnav-btn--active">我的徽章</View>
        <View className="emotion-subnav-btn" onClick={() => equity ? scrollTo('#sec-equity') : Taro.navigateTo({ url: '/pages/user/index' }).catch(() => {})} hoverClass="emotion-subnav-btn--active">会员权益</View>
      </View>

      {/* 确权卡集 */}
      <View className="px-4 mt-4">
        <Text id="sec-claims" className="text-lg font-bold text-foreground mb-3" style={{ display: 'block' }}>确权时刻</Text>
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
                  <Text className="text-base text-muted-foreground">+{c.tb_amount || 0} 情绪豆 · {fmtDate(c.created_at)}</Text>
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
