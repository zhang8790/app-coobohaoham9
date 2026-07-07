// @title 我的情绪徽章
import { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import {
  getEmotionBadgeDefs,
  getUserEmotionBadges,
  getEmotionTongbaoBalance,
} from '@/db/api'
import type { EmotionBadgeDef, EmotionBadgeGrant } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import './index.scss'

const RARITY_LABEL: Record<string, string> = {
  common: '普通',
  rare:   '稀有',
  epic:   '史诗',
  legend: '传说',
}
const RARITY_COLOR: Record<string, string> = {
  common: '#78716C',
  rare:   '#2563EB',
  epic:   '#9333EA',
  legend: '#DC2626',
}

function fmtDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function EmotionBadgesPage() {
  const { user } = useAuth()
  const [defs, setDefs] = useState<EmotionBadgeDef[]>([])
  const [grants, setGrants] = useState<EmotionBadgeGrant[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const [d, g, b] = await Promise.all([
        getEmotionBadgeDefs().catch(() => [] as EmotionBadgeDef[]),
        getUserEmotionBadges(user.id).catch(() => [] as EmotionBadgeGrant[]),
        getEmotionTongbaoBalance(user.id).catch(() => 0),
      ])
      setDefs(d || [])
      setGrants(g || [])
      setBalance(b)
    } catch (e) {
      console.error('[EmotionBadges] load', e)
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
          <View className="i-mdi-medal-outline text-6xl text-muted-foreground mx-auto" />
          <Text className="text-xl text-muted-foreground mt-3" style={{ display: 'block' }}>请先登录查看徽章</Text>
        </View>
      </View>
    )
  }

  const ownedCodes = new Set(grants.map(g => g.badge_code))
  const grantedMap = new Map(grants.map(g => [g.badge_code, g]))
  const ownedCount = ownedCodes.size

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* 顶部头图 */}
      <View className="emotion-badges-header px-4 pt-8 pb-6">
        <Text className="text-3xl font-bold text-foreground" style={{ display: 'block' }}>情绪徽章</Text>
        <Text className="text-xl text-muted-foreground mt-1" style={{ display: 'block' }}>每一次确权，都可能是一枚勋章</Text>
        <View className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: '已获徽章', value: `${ownedCount}`, sub: `/ ${defs.length}` },
            { label: '通宝余额', value: `${balance}`, sub: '可用' },
            { label: '获取进度', value: defs.length ? `${Math.round((ownedCount / defs.length) * 100)}%` : '0%', sub: '完成度' },
          ].map(s => (
            <View key={s.label} className="emotion-badges-stat">
              <Text className="text-2xl font-bold text-foreground">{s.value}</Text>
              <Text className="text-base text-foreground mt-1" style={{ display: 'block', fontWeight: 'bold' }}>{s.label}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5" style={{ display: 'block' }}>{s.sub}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 徽章列表 */}
      <View className="px-4 mt-4">
        {loading ? (
          <View className="flex items-center justify-center py-10">
            <View className="i-mdi-loading text-3xl text-primary animate-spin" />
          </View>
        ) : defs.length === 0 ? (
          <View className="emotion-empty">
            <View className="i-mdi-medal-outline text-6xl text-muted-foreground" />
            <Text className="text-xl text-muted-foreground mt-3" style={{ display: 'block' }}>徽章字典待加载</Text>
          </View>
        ) : (
          defs.map(def => {
            const owned = ownedCodes.has(def.code)
            const grant = grantedMap.get(def.code)
            const rarityColor = RARITY_COLOR[def.rarity] || '#78716C'
            return (
              <View key={def.code}
                className={`emotion-badge-row ${owned ? 'is-owned' : 'is-locked'}`}>
                {/* 圆盘 */}
                <View className="emotion-badge-medal" style={{ background: owned ? rarityColor : '#A8A29E' }}>
                  <Text className="emotion-badge-medal-icon">{def.icon}</Text>
                </View>
                {/* 文字 */}
                <View className="flex-1 ml-4">
                  <View className="flex items-center gap-2">
                    <Text className="text-xl font-bold text-foreground" style={{ display: 'block' }}>{def.name}</Text>
                    <View className="emotion-badge-rarity" style={{ color: rarityColor, borderColor: rarityColor }}>
                      {RARITY_LABEL[def.rarity] || def.rarity}
                    </View>
                  </View>
                  <Text className="text-base text-muted-foreground mt-1" style={{ display: 'block' }}>{def.description}</Text>
                  <Text className="text-sm text-muted-foreground mt-1" style={{ display: 'block' }}>
                    🔓 {def.unlock_hint}
                  </Text>
                  {owned && grant && (
                    <Text className="text-xs text-primary mt-1" style={{ display: 'block' }}>
                      ✓ 已于 {fmtDate(grant.granted_at)} 获得
                    </Text>
                  )}
                </View>
                {/* 状态 */}
                <View className="emotion-badge-status">
                  {owned
                    ? <Text className="i-mdi-check-circle text-3xl" style={{ color: rarityColor }} />
                    : <Text className="i-mdi-lock-outline text-3xl text-muted-foreground" />}
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}

export default EmotionBadgesPage
