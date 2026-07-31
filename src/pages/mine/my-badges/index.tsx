// @title 我的徽章墙
// 入口：用户中心 → 珍宝库 → 我的徽章
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { getEmotionBadgeDefs, getUserEmotionBadges, checkAndGrantEmotionBadges, grantEmotionBadge } from '@/db/api'
import type { EmotionBadgeDef, EmotionBadgeGrant } from '@/db/types'
import {
  BADGE_DEFINITIONS,
  BADGE_CODES_BY_RARITY,
  getBadgeSortOrder,
  type BadgeDisplay,
} from '@/utils/badge-definitions'
import { useDetectiveStore } from '@/store/detectiveStore'

// ── 稀有度色阶 ──────────────────────────────────────────────────────────────

const RARITY_STYLES: Record<string, { label: string; color: string; border: string; bg: string }> = {
  legendary: { label: '传说', color: '#DC2626', border: '#FCA5A5', bg: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)' },
  epic:     { label: '史诗', color: '#F59E0B', border: '#FCD34D', bg: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' },
  rare:     { label: '稀有', color: '#3B82F6', border: '#93C5FD', bg: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' },
  common:   { label: '普通', color: '#9CA3AF', border: '#D1D5DB', bg: 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)' },
}

// ── 合并徽章展示数据 ────────────────────────────────────────────────────────

function mergeBadgeDisplay(
  def: EmotionBadgeDef | undefined,
  code: string,
): BadgeDisplay {
  const fallback = BADGE_DEFINITIONS[code] || {
    code, name: code, icon: '🏅',
    rarity: 'common' as const, rarityLabel: '普通', rarityColor: '#9CA3AF',
    condition: '', hint: '', borderColor: '#D1D5DB', bgGradient: 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)',
  }
  if (!def) return fallback
  return {
    code,
    name: def.name || fallback.name,
    icon: def.icon || fallback.icon,
    rarity: (def.rarity as BadgeDisplay['rarity']) || fallback.rarity,
    rarityLabel: fallback.rarityLabel,
    rarityColor: fallback.rarityColor,
    condition: fallback.condition,
    hint: def.description || fallback.hint,
    borderColor: fallback.borderColor,
    bgGradient: fallback.bgGradient,
  }
}

// ── 分享卡组件 ─────────────────────────────────────────────────────────────

function ShareBadgeCard({ badge }: { badge: BadgeDisplay }) {
  const rs = RARITY_STYLES[badge.rarity] || RARITY_STYLES.common
  const { profile } = useAuth()
  const nickname = profile?.nickname || '神秘食客'

  return (
    <View
      className="rounded-3xl overflow-hidden"
      style={{ width: 280, background: badge.bgGradient }}
    >
      {/* 顶栏 */}
      <View className="px-5 pt-5 pb-3 text-center">
        <Text className="text-5xl mb-2 block">{badge.icon}</Text>
        <Text className="text-base font-bold" style={{ color: badge.rarityColor }}>
          {badge.name}
        </Text>
        <View className="inline-block mt-1 px-3 py-0.5 rounded-full" style={{ background: badge.rarityColor + '22' }}>
          <Text className="text-[10px] font-medium" style={{ color: badge.rarityColor }}>
            {rs.label}
          </Text>
        </View>
      </View>
      {/* 故事 */}
      <View className="px-5 pb-3">
        <Text className="text-xs text-center leading-relaxed block" style={{ color: '#6B7280' }}>
          {badge.hint}
        </Text>
      </View>
      {/* 底栏 */}
      <View className="px-5 pb-4 pt-2 border-t" style={{ borderColor: badge.rarityColor + '33' }}>
        <Text className="text-[10px] text-center block" style={{ color: '#D1D5DB' }}>
          {nickname} · 来店有喜 · 食安侦探局
        </Text>
      </View>
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────

export default function MyBadgesPage() {
  const { profile } = useAuth()
  const [defs, setDefs] = useState<EmotionBadgeDef[]>([])
  const [grants, setGrants] = useState<EmotionBadgeGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'earned'>('all')
  const [detailBadge, setDetailBadge] = useState<BadgeDisplay | null>(null)
  const [shareBadge, setShareBadge] = useState<BadgeDisplay | null>(null)

  const solvedCount = useDetectiveStore((s) => s.getSolvedCount())
  const totalCases = useDetectiveStore((s) => s.getStats().total)

  // ── 加载 ──
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [defData, grantData] = await Promise.all([
          getEmotionBadgeDefs().catch(() => []),
          profile?.id ? getUserEmotionBadges(profile.id).catch(() => []) : [],
        ])
        if (!alive) return
        setDefs(defData as EmotionBadgeDef[])
        setGrants(grantData as EmotionBadgeGrant[])

        // 触发行为徽章同步检查
        if (profile?.id) {
          checkAndGrantEmotionBadges(profile.id).catch(() => {})
          // 侦探徽章同步到后端
          if (solvedCount >= 1) grantEmotionBadge(profile.id, 'detective_1', 'auto').catch(() => {})
          if (solvedCount >= 5) grantEmotionBadge(profile.id, 'detective_5', 'auto').catch(() => {})
          if (solvedCount >= totalCases) grantEmotionBadge(profile.id, 'detective_all', 'auto').catch(() => {})
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // ── 计算已获得集合（含侦探徽章） ──
  const earnedSet = new Set(grants.map((g) => g.badge_code))
  if (solvedCount >= 1) earnedSet.add('detective_1')
  if (solvedCount >= 5) earnedSet.add('detective_5')
  if (solvedCount >= totalCases) earnedSet.add('detective_all')

  // ── 合并所有徽章 ──
  const allCodes = Object.keys(BADGE_DEFINITIONS)
  const mergedBadges: Array<{ code: string; display: BadgeDisplay; earned: boolean; grantedAt?: string }> = allCodes
    .map((code) => {
      const def = defs.find((d) => d.code === code)
      const display = mergeBadgeDisplay(def, code)
      const grant = grants.find((g) => g.badge_code === code)
      return { code, display, earned: earnedSet.has(code), grantedAt: grant?.granted_at }
    })
    .sort((a, b) => {
      // 未获得排后面
      if (a.earned !== b.earned) return a.earned ? -1 : 1
      // 按稀有度排序
      return getBadgeSortOrder(a.code) - getBadgeSortOrder(b.code)
    })

  const displayed = tab === 'earned'
    ? mergedBadges.filter((b) => b.earned)
    : mergedBadges

  const earnedCount = mergedBadges.filter((b) => b.earned).length

  // ── 稀有徽章数 ──
  const rareEarned = mergedBadges.filter((b) => b.earned && ['epic', 'legendary'].includes(b.display.rarity)).length

  // ── 加载态 ──
  if (loading) {
    return (
      <View className="min-h-screen bg-[#FFFBF7] flex items-center justify-center">
        <View className="text-center">
          <Text className="text-4xl mb-3">🏅</Text>
          <Text className="text-sm text-[#BFBFBF]">加载中...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7]">
      {/* 顶部统计卡 */}
      <View className="px-5 pt-5 pb-4">
        <View
          className="rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}
        >
          <View className="flex items-center justify-between mb-3">
            <View>
              <Text className="text-white text-xl font-bold">{earnedCount} / {allCodes.length}</Text>
              <Text className="text-white/60 text-xs mt-0.5">徽章收集进度</Text>
            </View>
            <View className="text-right">
              <Text className="text-yellow-300 text-xl font-bold">{rareEarned}</Text>
              <Text className="text-white/60 text-xs">稀有徽章</Text>
            </View>
          </View>
          {/* 进度条 */}
          <View className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.round((earnedCount / allCodes.length) * 100)}%`,
                background: '#FCD34D',
                transition: 'width 0.5s ease',
              }}
            />
          </View>
          <Text className="text-white/50 text-[10px] mt-1">
            {Math.round((earnedCount / allCodes.length) * 100)}% 收集度 · 食安侦探 {solvedCount}/{totalCases} 案
          </Text>
        </View>
      </View>

      {/* 食安侦探局常驻入口 */}
      <View
        className="mx-5 mb-3 rounded-2xl p-4 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #1F2937 0%, #374151 100%)' }}
        onClick={() => Taro.navigateTo({ url: '/pages/food-detective/index' })}
      >
        <View className="flex items-center">
          <Text className="text-3xl mr-3">🔍</Text>
          <View>
            <Text className="text-white text-sm font-bold">食安侦探局</Text>
            <Text className="text-white/60 text-[11px] mt-0.5">破案解锁知识碎片，边玩边收录</Text>
          </View>
        </View>
        <Text className="text-white/80 text-xs">进入 ›</Text>
      </View>

      {/* Tab切换 */}
      <View className="px-5 mb-3 flex gap-3">
        {(['all', 'earned'] as const).map((t) => (
          <View
            key={t}
            className="px-4 py-2 rounded-full"
            style={{ background: tab === t ? '#78350F' : '#F3F4F6' }}
            onClick={() => setTab(t)}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: tab === t ? '#FFFFFF' : '#6B7280' }}
            >
              {t === 'all' ? `全部 (${allCodes.length})` : `已获得 (${earnedCount})`}
            </Text>
          </View>
        ))}
      </View>

      {/* 徽章网格 */}
      <ScrollView scrollY className="px-5 pb-8" style={{ height: 'calc(100vh - 320px)' }}>
        {displayed.length === 0 ? (
          <View className="py-16 text-center">
            <Text className="text-3xl mb-2">🔍</Text>
            <Text className="text-sm text-[#9CA3AF]">还没有获得任何徽章</Text>
            <Text
              className="text-xs text-[#D1D5DB] mt-1 underline"
              onClick={() => Taro.navigateTo({ url: '/pages/food-detective/index' })}
            >去食安侦探局试试身手吧</Text>
          </View>
        ) : (
          <View className="flex flex-wrap" style={{ marginRight: -8 }}>
            {displayed.map(({ code, display, earned, grantedAt }) => {
              const rs = RARITY_STYLES[display.rarity] || RARITY_STYLES.common
              return (
                <View
                  key={code}
                  className="mb-3"
                  style={{ width: '33.33%', paddingRight: 8, boxSizing: 'border-box' }}
                  onClick={() => earned && setDetailBadge(display)}
                >
                  <View
                    className="rounded-2xl p-3 flex flex-col items-center"
                    style={{
                      background: earned ? display.bgGradient : '#F9FAFB',
                      borderWidth: earned ? 1.5 : 1,
                      borderStyle: 'solid',
                      borderColor: earned ? display.borderColor : '#E5E7EB',
                      opacity: earned ? 1 : 0.5,
                    }}
                  >
                    <Text
                      className="text-2xl mb-1"
                      style={{ filter: earned ? 'none' : 'grayscale(100%)' }}
                    >
                      {earned ? display.icon : '🔒'}
                    </Text>
                    <Text
                      className="text-[10px] font-medium text-center leading-tight"
                      style={{ color: earned ? '#374151' : '#9CA3AF' }}
                    >
                      {display.name}
                    </Text>
                    {earned && (
                      <View
                        className="mt-1 px-1.5 py-0.5 rounded-full"
                        style={{ background: rs.color + '22' }}
                      >
                        <Text className="text-[8px] font-medium" style={{ color: rs.color }}>
                          {rs.label}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* 底部徽章详情弹窗 */}
      {detailBadge && (
        <View
          className="fixed inset-0 z-50 flex flex-col items-center justify-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDetailBadge(null)}
        >
          <View
            className="w-full rounded-t-3xl p-6 pb-8"
            style={{
              background: '#FFFBF7',
              paddingBottom: (Taro.getStorageSync('safeAreaBottom') || 20) + 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭线 */}
            <View className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: '#E5E7EB' }} />

            {/* 徽章大图 */}
            <View className="flex flex-col items-center mb-4">
              <View
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: detailBadge.bgGradient, borderWidth: 2, borderStyle: 'solid', borderColor: detailBadge.borderColor }}
              >
                <Text className="text-4xl">{detailBadge.icon}</Text>
              </View>
              <Text className="text-lg font-bold" style={{ color: '#374151' }}>{detailBadge.name}</Text>
              <View
                className="mt-1 px-3 py-0.5 rounded-full"
                style={{ background: RARITY_STYLES[detailBadge.rarity]?.color + '22' }}
              >
                <Text className="text-xs font-medium" style={{ color: RARITY_STYLES[detailBadge.rarity]?.color }}>
                  {RARITY_STYLES[detailBadge.rarity]?.label}
                </Text>
              </View>
            </View>

            {/* 解锁条件 */}
            <View className="mb-3 px-4 py-3 rounded-xl" style={{ background: '#F9FAFB' }}>
              <Text className="text-xs font-medium mb-1 block" style={{ color: '#9CA3AF' }}>解锁条件</Text>
              <Text className="text-sm" style={{ color: '#374151' }}>{detailBadge.condition}</Text>
            </View>

            {/* 解锁故事 */}
            <View className="mb-5 px-4 py-3 rounded-xl" style={{ background: '#FEF3C7' }}>
              <Text className="text-xs font-medium mb-1 block" style={{ color: '#92400E' }}>解锁故事</Text>
              <Text className="text-sm leading-relaxed" style={{ color: '#78350F' }}>{detailBadge.hint}</Text>
            </View>

            {/* 操作按钮 */}
            <View className="flex gap-3">
              <View
                className="flex-1 py-3 rounded-xl flex items-center justify-center"
                style={{ background: '#F3F4F6' }}
                onClick={() => setDetailBadge(null)}
              >
                <Text className="text-sm font-medium" style={{ color: '#6B7280' }}>关闭</Text>
              </View>
              <View
                className="flex-1 py-3 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}
                onClick={() => {
                  setShareBadge(detailBadge)
                  setDetailBadge(null)
                }}
              >
                <Text className="text-sm font-semibold text-white">炫耀一下</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 炫耀分享卡弹窗 */}
      {shareBadge && (
        <View
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShareBadge(null)}
        >
          <View onClick={(e) => e.stopPropagation()}>
            <ShareBadgeCard badge={shareBadge} />
          </View>
          <Text className="text-white/80 text-xs mt-4 mb-2">长按上方卡片可保存图片</Text>
          <View
            className="px-6 py-2 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onClick={() => setShareBadge(null)}
          >
            <Text className="text-sm text-white">关闭</Text>
          </View>
        </View>
      )}
    </View>
  )
}
