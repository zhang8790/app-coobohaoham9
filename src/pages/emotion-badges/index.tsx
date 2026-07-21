// @title 我的情绪徽章
import { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import {
  getEmotionBadgeDefs,
  getUserEmotionBadges,
  getMyProfile,
} from '@/db/api'
import type { EmotionBadgeDef, EmotionBadgeGrant } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import './index.scss'
import Icon from '@/components/Icon'

const RARITY_LABEL: Record<string, string> = {
  common: '普通',
  rare:   '稀有',
  epic:   '史诗',
  legend: '传说',
}
const RARITY_COLOR: Record<string, string> = {
  common: '#78716C',
  rare:   '#2563EB',
  epic:   '#9A8070',
  legend: '#DC2626',
}
// 图鉴分组顺序（高 → 低，突出收藏梯度）
const RARITY_ORDER = ['legend', 'epic', 'rare', 'common']

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
      const [d, g, prof] = await Promise.all([
        getEmotionBadgeDefs().catch(() => [] as EmotionBadgeDef[]),
        getUserEmotionBadges(user.id).catch(() => [] as EmotionBadgeGrant[]),
        getMyProfile().catch(() => null),
      ])
      setDefs(d || [])
      setGrants(g || [])
      setBalance((prof as any)?.tb_balance || 0)
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
          <Icon name="medal-outline" size={60} className="text-muted-foreground mx-auto" />
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
            { label: '金豆', value: `${balance}`, sub: '可用' },
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

      {/* 徽章列表（按稀有度分组 + 集齐解锁流光） */}
      <View className="px-4 mt-4">
        {loading ? (
          <View className="flex items-center justify-center py-10">
            <Icon name="loading" size={30} className="text-primary animate-spin" />
          </View>
        ) : defs.length === 0 ? (
          <View className="emotion-empty">
            <Icon name="medal-outline" size={60} className="text-muted-foreground" />
            <Text className="text-xl text-muted-foreground mt-3" style={{ display: 'block' }}>徽章字典待加载</Text>
          </View>
        ) : (
          RARITY_ORDER.map((rarity, gi) => {
            const group = defs.filter(d => (d.rarity || 'common') === rarity)
            if (!group.length) return null
            const ownedInGroup = group.filter(d => ownedCodes.has(d.code)).length
            const allDone = ownedInGroup === group.length
            const rColor = RARITY_COLOR[rarity] || '#78716C'
            return (
              <View key={rarity}>
                <View className="emotion-badge-group-head">
                  <View className="emotion-badge-group-title">
                    <View className="rounded-full" style={{ width: 10, height: 10, background: rColor }} />
                    <Text style={{ fontSize: 15, fontWeight: 700, color: '#1c1917' }}>{RARITY_LABEL[rarity]}</Text>
                    <Text className="emotion-badge-group-count">{ownedInGroup}/{group.length}</Text>
                  </View>
                  {allDone && <Text className="emotion-badge-complete">✦ 已集齐 ✦</Text>}
                </View>
                {group.map((def, i) => {
                  const owned = ownedCodes.has(def.code)
                  const grant = grantedMap.get(def.code)
                  const rarityColor = RARITY_COLOR[def.rarity] || '#78716C'
                  const medalClass = `emotion-badge-medal ${owned ? `medal-owned medal-${def.rarity || 'common'}` : ''}`
                  return (
                    <View key={def.code}
                      className={`emotion-badge-row badge-row-in ${owned ? 'is-owned' : 'is-locked'}`}
                      style={{ animationDelay: `${(gi * 0.06) + i * 0.04}s` }}>
                      {/* 圆盘 */}
                      <View className={medalClass} style={{ background: owned ? rarityColor : '#A8A29E', ['--rc']: rarityColor } as any}>
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
                          ? <Icon name="check-circle" size={30} />
                          : <Icon name="lock-outline" size={30} className="text-muted-foreground" />}
                      </View>
                    </View>
                  )
                })}
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}

export default EmotionBadgesPage
