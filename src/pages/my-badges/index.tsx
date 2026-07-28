// @title 我的徽章墙
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { getEmotionBadgeDefs, getUserEmotionBadges, getBadgeStats } from '@/db/api'
import { checkAndGrantEmotionBadges } from '@/db/api'
import type { EmotionBadgeDef, EmotionBadgeGrant } from '@/db/types'
import {
  BADGE_DEFINITIONS,
  BADGE_CODES_BY_RARITY,
  getBadgeSortOrder,
  type BadgeDisplay,
} from '@/utils/badge-definitions'

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function mergeBadgeDisplay(
  def: EmotionBadgeDef | undefined,
  code: string,
): BadgeDisplay {
  if (def) {
    return {
      code,
      name: def.name || BADGE_DEFINITIONS[code]?.name || code,
      icon: def.icon || BADGE_DEFINITIONS[code]?.icon || '🏅',
      rarity: (def.rarity as BadgeDisplay['rarity']) || BADGE_DEFINITIONS[code]?.rarity || 'common',
      rarityLabel: BADGE_DEFINITIONS[code]?.rarityLabel || def.rarity || '普通',
      rarityColor: BADGE_DEFINITIONS[code]?.rarityColor || '#9CA3AF',
      condition: BADGE_DEFINITIONS[code]?.condition || '',
      hint: def.description || BADGE_DEFINITIONS[code]?.hint || '',
      borderColor: BADGE_DEFINITIONS[code]?.borderColor || '#D1D5DB',
      bgGradient: BADGE_DEFINITIONS[code]?.bgGradient || 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)',
    }
  }
  return BADGE_DEFINITIONS[code] || {
    code, name: code, icon: '🏅',
    rarity: 'common', rarityLabel: '普通', rarityColor: '#9CA3AF',
    condition: '', hint: '', borderColor: '#D1D5DB', bgGradient: 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)',
  }
}

function isEarned(grant: EmotionBadgeGrant | undefined, code: string, earnedSet: Set<string>): boolean {
  return !!grant || earnedSet.has(code)
}

// ── 徽章卡片 ─────────────────────────────────────────────────────────────────

function BadgeCard({
  badge,
  earned,
  grantedAt,
  onTap,
}: {
  badge: BadgeDisplay
  earned: boolean
  grantedAt?: string
  onTap: () => void
}) {
  const formatDate = (d: string) => {
    const date = new Date(d)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <View
      className="relative rounded-2xl overflow-hidden"
      style={{
        width: '31%',
        aspectRatio: '0.85',
        background: earned ? badge.bgGradient : '#F9FAFB',
        border: `1.5px solid ${earned ? badge.borderColor : '#E5E7EB'}`,
        boxShadow: earned ? `0 2px 8px ${badge.borderColor}33` : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onClick={onTap}
    >
      {/* 稀有度角标 */}
      {earned && (
        <View
          className="absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5"
          style={{ background: badge.rarityColor + '22' }}
        >
          <Text className="text-[9px] font-medium" style={{ color: badge.rarityColor }}>
            {badge.rarityLabel}
          </Text>
        </View>
      )}

      {/* 未解锁遮罩 */}
      {!earned && (
        <View className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(249,250,251,0.7)' }}>
          <Text className="text-xl opacity-20">🔒</Text>
        </View>
      )}

      <View className="flex flex-col items-center justify-center h-full px-2 py-3">
        {/* 图标 */}
        <Text
          className="text-4xl"
          style={{ opacity: earned ? 1 : 0.3, filter: earned ? 'none' : 'grayscale(1)' }}
        >
          {badge.icon}
        </Text>

        {/* 名称 */}
        <Text
          className="text-xs font-medium mt-2 text-center leading-snug"
          style={{ color: earned ? '#374151' : '#D1D5DB' }}
          numberOfLines={1}
        >
          {badge.name}
        </Text>

        {/* 获取日期 */}
        {earned && grantedAt && (
          <Text className="text-[9px] mt-1" style={{ color: '#9CA3AF' }}>
            {formatDate(grantedAt)}
          </Text>
        )}
      </View>
    </View>
  )
}

// ── 徽章详情弹窗 ─────────────────────────────────────────────────────────────

function BadgeDetailSheet({
  badge,
  earned,
  grantedAt,
  onClose,
  onShare,
}: {
  badge: BadgeDisplay
  earned: boolean
  grantedAt?: string
  onClose: () => void
  onShare: () => void
}) {
  return (
    <View className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* 半透明遮罩 */}
      <View className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />

      {/* 弹窗内容 */}
      <View
        className="relative w-full rounded-t-3xl p-5 pb-8"
        style={{ background: earned ? badge.bgGradient : '#F9FAFB', animation: 'slideUp 0.3s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭把手 */}
        <View className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: '#E5E7EB' }} />

        {/* 徽章大图 */}
        <View className="flex flex-col items-center">
          <View
            className="rounded-full flex items-center justify-center mb-3"
            style={{
              width: 80, height: 80,
              background: earned ? badge.borderColor + '33' : '#E5E7EB',
              border: `2px solid ${earned ? badge.borderColor : '#D1D5DB'}`,
            }}
          >
            <Text className="text-5xl" style={{ opacity: earned ? 1 : 0.4 }}>
              {badge.icon}
            </Text>
          </View>

          <Text className="text-xl font-bold" style={{ color: earned ? badge.rarityColor : '#9CA3AF' }}>
            {badge.name}
          </Text>

          {earned && (
            <View className="mt-1 px-3 py-1 rounded-full" style={{ background: badge.rarityColor + '22' }}>
              <Text className="text-xs font-medium" style={{ color: badge.rarityColor }}>
                {badge.rarityLabel} · 已获得
              </Text>
            </View>
          )}

          {/* 徽章描述 */}
          <View className="mt-4 px-4 py-3 rounded-xl w-full" style={{ background: 'rgba(255,255,255,0.7)' }}>
            <Text className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>
              {earned ? badge.hint : `解锁条件：${badge.condition}`}
            </Text>
          </View>

          {/* 获取时间 */}
          {earned && grantedAt && (
            <Text className="text-xs mt-3" style={{ color: '#9CA3AF' }}>
              获得于 {new Date(grantedAt).toLocaleDateString('zh-CN')}
            </Text>
          )}

          {/* 操作按钮 */}
          <View className="flex gap-3 mt-5 w-full" style={{ paddingHorizontal: 0 }}>
            <View
              className="flex-1 rounded-xl py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.8)' }}
              onClick={onClose}
            >
              <Text className="text-sm font-medium" style={{ color: '#6B7280' }}>关闭</Text>
            </View>
            {earned && (
              <View
                className="flex-1 rounded-xl py-3 text-center"
                style={{ background: badge.rarityColor }}
                onClick={onShare}
              >
                <Text className="text-sm font-medium text-white">炫耀一下</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

// ── 成就卡（分享用） ─────────────────────────────────────────────────────────

function AchievementCard({
  badge,
  nickname,
}: {
  badge: BadgeDisplay
  nickname: string
}) {
  return (
    <View
      className="mx-auto rounded-3xl overflow-hidden"
      style={{ width: 300, background: badge.bgGradient }}
    >
      {/* 顶部 */}
      <View className="pt-6 pb-4 px-6 text-center">
        <Text className="text-xs" style={{ color: badge.rarityColor }}>来店有喜 · 食养徽章</Text>
      </View>

      {/* 徽章图标 */}
      <View className="flex items-center justify-center py-4">
        <View
          className="rounded-full flex items-center justify-center"
          style={{
            width: 100, height: 100,
            background: badge.borderColor + '33',
            border: `3px solid ${badge.borderColor}`,
          }}
        >
          <Text className="text-6xl">{badge.icon}</Text>
        </View>
      </View>

      {/* 徽章名 */}
      <View className="text-center pb-4 px-6">
        <Text className="text-xl font-bold" style={{ color: badge.rarityColor }}>{badge.name}</Text>
        <Text className="text-sm mt-2 leading-relaxed" style={{ color: '#6B7280' }}>
          {badge.hint}
        </Text>
      </View>

      {/* 用户名 */}
      <View className="px-6 pb-6 text-center">
        <View className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <Text className="text-xs" style={{ color: '#9CA3AF' }}>来自</Text>
          <Text className="text-xs font-medium text-[#374151]">{nickname || '食伴'}</Text>
        </View>
      </View>

      {/* 底部装饰 */}
      <View className="h-2" style={{ background: badge.rarityColor + '44' }} />
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────

type Tab = 'all' | 'earned'

export default function MyBadgesPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('all')
  const [defs, setDefs] = useState<EmotionBadgeDef[]>([])
  const [grants, setGrants] = useState<EmotionBadgeGrant[]>([])
  const [stats, setStats] = useState<{ count: number; rareCount: number }>({ count: 0, rareCount: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedBadge, setSelectedBadge] = useState<BadgeDisplay | null>(null)
  const [selectedEarned, setSelectedEarned] = useState(false)
  const [selectedGrantedAt, setSelectedGrantedAt] = useState<string | undefined>()
  const [showShareCard, setShowShareCard] = useState(false)
  const [shareBadge, setShareBadge] = useState<BadgeDisplay | null>(null)

  // 加载数据
  useEffect(() => {
    if (!profile?.id) { setLoading(false); return }
    let alive = true

    // 先触发一次徽章同步检查（best-effort）
    checkAndGrantEmotionBadges(profile.id).catch(() => null)

    Promise.all([
      getEmotionBadgeDefs(),
      getUserEmotionBadges(profile.id),
      getBadgeStats(profile.id),
    ])
      .then(([defsData, grantsData, statsData]) => {
        if (!alive) return
        setDefs(defsData)
        setGrants(grantsData)
        setStats(statsData)
      })
      .catch(() => null)
      .finally(() => alive && setLoading(false))

    return () => { alive = false }
  }, [profile?.id])

  // 构建 grant map
  const grantMap = new Map<string, EmotionBadgeGrant>()
  for (const g of grants) {
    grantMap.set(g.badge_code, g)
  }

  // 已获得的 code 集合
  const earnedSet = new Set(grants.map((g) => g.badge_code))

  // 合并所有徽章（含数据库未定义的静态徽章）
  const allCodes = Object.keys(BADGE_DEFINITIONS)
  const mergedBadges: Array<{ code: string; display: BadgeDisplay; earned: boolean; grantedAt?: string }> = allCodes
    .map((code) => {
      const def = defs.find((d) => d.code === code)
      const display = mergeBadgeDisplay(def, code)
      const grant = grantMap.get(code)
      return {
        code,
        display,
        earned: !!grant || earnedSet.has(code),
        grantedAt: grant?.granted_at,
      }
    })
    .sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1
      return getBadgeSortOrder(a.code) - getBadgeSortOrder(b.code)
    })

  const earnedBadges = mergedBadges.filter((b) => b.earned)
  const displayList = tab === 'all' ? mergedBadges : earnedBadges

  const handleBadgeTap = (code: string, earned: boolean, grantedAt?: string) => {
    const def = defs.find((d) => d.code === code)
    const display = mergeBadgeDisplay(def, code)
    setSelectedBadge(display)
    setSelectedEarned(earned)
    setSelectedGrantedAt(grantedAt)
  }

  const handleCloseSheet = () => setSelectedBadge(null)

  const handleShare = () => {
    if (!selectedBadge) return
    setSelectedBadge(null)
    setShareBadge(selectedBadge)
    setShowShareCard(true)
  }

  const handleSaveShareCard = () => {
    // 生成临时截图
    const query = Taro.createSelectorQuery()
    query.select('#share-card').boundingClientRect((rect) => {
      if (!rect) return
      // 小程序不支持直接截取非 canvas 元素，这里提示用户截图
      Taro.showToast({ title: '长按上方卡片保存', icon: 'none', duration: 2000 })
    }).exec()
  }

  const rarityTabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: '全部徽章' },
    { key: 'earned', label: '已获得', count: stats.count },
  ]

  return (
    <View className="min-h-screen bg-[#FFFBF7]">
      {/* 头部统计卡 */}
      <View className="px-5 pt-5 pb-4">
        <View className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}>
          <View className="flex items-center justify-between">
            <View>
              <Text className="text-white text-3xl font-bold">{stats.count}</Text>
              <Text className="text-xs text-white/70 mt-1">已获得徽章</Text>
            </View>
            <View className="text-right">
              <Text className="text-white text-2xl font-bold">{stats.rareCount}</Text>
              <Text className="text-xs text-white/70 mt-1">稀有及以上</Text>
            </View>
          </View>

          {/* 进度条：稀有进度 */}
          <View className="mt-3">
            <View className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (stats.count / allCodes.length) * 100)}%`,
                  background: '#FCD34D',
                }}
              />
            </View>
            <Text className="text-xs text-white/60 mt-1">
              {stats.count}/{allCodes.length} 收集进度
            </Text>
          </View>
        </View>
      </View>

      {/* Tab切换 */}
      <View className="px-5 mb-3 flex gap-2">
        {rarityTabs.map((t) => (
          <View
            key={t.key}
            className="px-4 py-2 rounded-full transition-all"
            style={{
              background: tab === t.key ? '#78350F' : '#FFFFFF',
              border: `1px solid ${tab === t.key ? '#78350F' : '#E5E7EB'}`,
            }}
            onClick={() => setTab(t.key)}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: tab === t.key ? '#FFFFFF' : '#6B7280' }}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </Text>
          </View>
        ))}
      </View>

      {/* 加载状态 */}
      {loading ? (
        <View className="py-20 text-center">
          <Text className="text-sm text-[#BFBFBF]">加载中...</Text>
        </View>
      ) : displayList.length === 0 ? (
        <View className="py-20 text-center px-5">
          <Text className="text-4xl mb-3">🏅</Text>
          <Text className="text-sm text-[#9CA3AF]">
            {tab === 'earned' ? '还没有获得任何徽章' : '暂无徽章'}
          </Text>
          {tab === 'earned' && (
            <View className="mt-4 inline-block" onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
              <Text className="text-sm font-medium" style={{ color: '#78350F' }}>去体验 →</Text>
            </View>
          )}
        </View>
      ) : (
        <ScrollView scrollY className="px-5 pb-8" style={{ height: 'calc(100vh - 220px)' }}>
          {/* 徽章网格：3列 */}
          <View className="flex flex-wrap" style={{ gap: '2.5%' }}>
            {displayList.map(({ code, display, earned, grantedAt }) => (
              <BadgeCard
                key={code}
                badge={display}
                earned={earned}
                grantedAt={grantedAt}
                onTap={() => handleBadgeTap(code, earned, grantedAt)}
              />
            ))}
          </View>

          {/* 空状态提示 */}
          {tab === 'all' && earnedBadges.length === 0 && (
            <View className="mt-6 py-4 text-center">
              <Text className="text-xs text-[#D1CBC3]">
                完成食养行为，解锁更多徽章
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* 徽章详情弹窗 */}
      {selectedBadge && (
        <BadgeDetailSheet
          badge={selectedBadge}
          earned={selectedEarned}
          grantedAt={selectedGrantedAt}
          onClose={handleCloseSheet}
          onShare={handleShare}
        />
      )}

      {/* 炫耀卡片 */}
      {showShareCard && shareBadge && (
        <View className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <View id="share-card">
            <AchievementCard badge={shareBadge} nickname={profile?.nickname || ''} />
          </View>

          <View className="mt-4 flex gap-3 px-4">
            <View
              className="rounded-full px-6 py-3"
              style={{ background: 'rgba(255,255,255,0.9)' }}
              onClick={() => setShowShareCard(false)}
            >
              <Text className="text-sm text-[#6B7280]">关闭</Text>
            </View>
            <View
              className="rounded-full px-6 py-3"
              style={{ background: '#78350F' }}
              onClick={handleSaveShareCard}
            >
              <Text className="text-sm text-white">保存/分享</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
