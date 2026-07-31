// @title 我的徽章墙
// 入口：用户中心 → 珍宝库 → 我的徽章
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import {
  getEmotionBadgeDefs,
  getUserEmotionBadges,
  checkAndGrantEmotionBadges,
  grantEmotionBadge,
} from '@/db/api'
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
  legendary: { label: '传说', color: '#DC2626', border: '#FCA5A5', bg: '#FEF2F2' },
  epic:      { label: '史诗', color: '#9333EA', border: '#C4B5FD', bg: '#F5F3FF' },
  rare:      { label: '稀有', color: '#3B82F6', border: '#93C5FD', bg: '#EFF6FF' },
  common:    { label: '普通', color: '#6B7280', border: '#D1D5DB', bg: '#F9FAFB' },
}

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'] as const
const TOTAL_CASES = 6 // 与 detective-cases 保持同步

// ── BadgeCard ────────────────────────────────────────────────────────────────

function BadgeCard({
  def,
  grant,
  onClick,
}: {
  def: BadgeDisplay
  grant?: EmotionBadgeGrant
  onClick: () => void
}) {
  const style = RARITY_STYLES[def.rarity] || RARITY_STYLES.common
  const isObtained = !!grant

  return (
    <View
      className="flex flex-col items-center p-3 rounded-2xl"
      style={{
        background: isObtained ? '#FFFFFF' : '#F9FAFB',
        boxShadow: isObtained ? `0 2px 8px ${style.border}44` : 'none',
        border: `1.5px solid ${isObtained ? style.border : '#E5E7EB'}`,
        opacity: isObtained ? 1 : 0.45,
      }}
      onClick={onClick}
    >
      <View
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
        style={{
          background: isObtained ? style.bg : '#F3F4F6',
          border: `1.5px solid ${isObtained ? style.border : '#E5E7EB'}`,
        }}
      >
        <Text className="text-2xl" style={{ opacity: isObtained ? 1 : 0.3 }}>
          {def.icon}
        </Text>
      </View>
      <Text
        className="text-xs font-medium text-center leading-tight"
        style={{ color: isObtained ? '#374151' : '#9CA3AF' }}
      >
        {def.name}
      </Text>
      <View className="mt-1 px-1.5 py-0.5 rounded-full">
        <Text className="text-[10px]" style={{ color: style.color }}>{style.label}</Text>
      </View>
    </View>
  )
}

// ── BadgeDetailModal ─────────────────────────────────────────────────────────

function BadgeDetailModal({
  def,
  grant,
  onClose,
}: {
  def: BadgeDisplay
  grant?: EmotionBadgeGrant
  onClose: () => void
}) {
  const style = RARITY_STYLES[def.rarity] || RARITY_STYLES.common
  const isObtained = !!grant

  return (
    <View
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <View
        className="w-full rounded-t-3xl p-6"
        style={{
          background: '#FFFBF7',
          paddingBottom: (Taro.getStorageSync('safeAreaBottom') || 20) + 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <View className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#E5E7EB' }} />

        {/* 徽章大图标 */}
        <View className="flex items-center justify-center mb-4">
          <View
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{
              background: style.bg,
              border: `2px solid ${style.border}`,
              boxShadow: `0 4px 16px ${style.border}66`,
            }}
          >
            <Text className="text-4xl">{def.icon}</Text>
          </View>
        </View>

        <View className="text-center mb-4">
          <Text className="text-lg font-bold" style={{ color: '#374151' }}>{def.name}</Text>
          <View
            className="mt-1 px-3 py-0.5 rounded-full inline-block"
            style={{ background: style.bg }}
          >
            <Text className="text-xs" style={{ color: style.color }}>{style.label}</Text>
          </View>
        </View>

        {/* 解锁条件 */}
        <View className="px-4 py-3 rounded-xl mb-3" style={{ background: '#F9FAFB' }}>
          <Text className="text-xs font-medium mb-1 block" style={{ color: '#9CA3AF' }}>解锁条件</Text>
          <Text className="text-sm leading-relaxed" style={{ color: '#374151' }}>{def.condition}</Text>
        </View>

        {/* 解锁提示 */}
        <View
          className="px-4 py-3 rounded-xl mb-4"
          style={{ background: isObtained ? '#F0FDF4' : '#FEF3C7' }}
        >
          <Text
            className="text-xs leading-relaxed"
            style={{ color: isObtained ? '#16A34A' : '#92400E' }}
          >
            {isObtained
              ? `✅ 已解锁！${def.hint}`
              : `🔒 ${def.hint}`
            }
          </Text>
        </View>

        {/* 解锁时间 */}
        {isObtained && grant?.grantedAt && (
          <View className="px-4 py-2 rounded-xl mb-5" style={{ background: '#F3F4F6' }}>
            <Text className="text-xs" style={{ color: '#9CA3AF' }}>
              解锁于：{new Date(grant.grantedAt).toLocaleDateString('zh-CN')}
            </Text>
          </View>
        )}

        <View
          className="rounded-xl py-3 text-center"
          style={{ background: '#78350F' }}
          onClick={onClose}
        >
          <Text className="text-sm font-semibold text-white">关闭</Text>
        </View>
      </View>
    </View>
  )
}

// ── 统计头卡 ────────────────────────────────────────────────────────────────

function StatsHeader({ obtained, total }: { obtained: number; total: number }) {
  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0

  return (
    <View
      className="mx-5 mt-4 rounded-2xl p-5"
      style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}
    >
      <View className="flex items-center justify-between">
        <View>
          <Text className="text-white/60 text-xs">已获徽章</Text>
          <Text className="text-3xl font-bold text-white mt-1">
            {obtained}
            <Text className="text-lg font-normal text-white/60"> / {total}</Text>
          </Text>
          <View className="mt-2 h-1.5 w-36 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <View className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </View>
          <Text className="text-white/40 text-[10px] mt-1">{pct}% 收集度</Text>
        </View>
        <Text className="text-5xl">🏆</Text>
      </View>
    </View>
  )
}

// ── 主页面 ──────────────────────────────────────────────────────────────────

type Tab = 'all' | 'legendary' | 'epic' | 'rare' | 'common'

export default function MyBadgesPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [defs, setDefs] = useState<BadgeDisplay[]>([])
  const [grants, setGrants] = useState<Record<string, EmotionBadgeGrant>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDef, setSelectedDef] = useState<BadgeDisplay | null>(null)

  const { profile } = useAuth()
  const getStats = useDetectiveStore((s) => s.getStats)
  const getSolvedCount = useDetectiveStore((s) => s.getSolvedCount)
  const totalPoints = useDetectiveStore((s) => s.totalPoints)
  const solved = useDetectiveStore((s) => s.solved)

  // 构建侦探徽章动态定义（基于本地 store）
  const detectiveDynamicDefs: Record<string, { hint: string; condition: string }> = {
    detective_1: {
      condition: `破获 ≥1 个食安案件（当前 ${getSolvedCount()}）`,
      hint: '恭喜成为食安侦探，守护配料表安全！',
    },
    detective_5: {
      condition: `破获 ≥5 个食安案件（当前 ${getSolvedCount()}）`,
      hint: '火眼金睛！普通添加剂已逃不过你的眼睛！',
    },
    detective_all: {
      condition: `破获全部 ${TOTAL_CASES} 个食安案件（当前 ${getSolvedCount()}）`,
      hint: '食安神探！全案件侦破，实至名归！',
    },
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 加载静态徽章定义
        const allDefs = Object.values(BADGE_DEFINITIONS)

        // 加载后端已授予的徽章
        let backendGrants: Record<string, EmotionBadgeGrant> = {}
        if (profile?.id) {
          const raw = await getUserEmotionBadges(profile.id).catch(() => [])
          if (!alive) return
          backendGrants = Object.fromEntries((raw as EmotionBadgeGrant[]).map((g) => [g.badgeCode, g]))
        }

        // 合并后端数据 + 侦探本地动态数据
        const grantMap: Record<string, EmotionBadgeGrant> = { ...backendGrants }

        // 侦探徽章本地覆盖（优先用最新的本地状态）
        if (getSolvedCount() >= 1) {
          grantMap['detective_1'] = {
            id: 'local_detective_1',
            userId: profile?.id || '',
            badgeCode: 'detective_1',
            grantedAt: solved['case_01']?.passedAt || new Date().toISOString(),
            source: 'auto',
          }
        }
        if (getSolvedCount() >= 5) {
          grantMap['detective_5'] = {
            id: 'local_detective_5',
            userId: profile?.id || '',
            badgeCode: 'detective_5',
            grantedAt: solved['case_05']?.passedAt || new Date().toISOString(),
            source: 'auto',
          }
        }
        if (getSolvedCount() >= TOTAL_CASES) {
          grantMap['detective_all'] = {
            id: 'local_detective_all',
            userId: profile?.id || '',
            badgeCode: 'detective_all',
            grantedAt: new Date().toISOString(),
            source: 'auto',
          }
        }

        if (!alive) return
        setDefs(allDefs)
        setGrants(grantMap)

        // 触发行为徽章同步检查
        if (profile?.id) {
          checkAndGrantEmotionBadges(profile.id).catch(() => {})
          if (getSolvedCount() >= 1) grantEmotionBadge(profile.id, 'detective_1', 'auto').catch(() => {})
          if (getSolvedCount() >= 5) grantEmotionBadge(profile.id, 'detective_5', 'auto').catch(() => {})
          if (getSolvedCount() >= TOTAL_CASES) grantEmotionBadge(profile.id, 'detective_all', 'auto').catch(() => {})
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const obtained = Object.keys(grants).length
  const total = defs.length

  // Tab 过滤
  const filteredDefs = tab === 'all'
    ? [...defs].sort((a, b) => getBadgeSortOrder(a.code) - getBadgeSortOrder(b.code))
    : defs.filter((d) => d.rarity === tab).sort((a, b) => getBadgeSortOrder(a.code) - getBadgeSortOrder(b.code))

  return (
    <View className="min-h-screen" style={{ background: '#FFFBF7' }}>
      {/* 统计头 */}
      <StatsHeader obtained={obtained} total={total} />

      {/* Tab 栏 */}
      <ScrollView scrollX className="mt-4 mb-3" showScrollbar={false}>
        <View className="px-5 flex gap-2">
          {([['all', '全部'], ...RARITY_ORDER.map((r) => [r, RARITY_STYLES[r].label])] as const).map(([t, label]) => (
            <View
              key={t}
              className="px-4 py-2 rounded-full flex-shrink-0"
              style={{ background: tab === t ? '#78350F' : '#F3F4F6' }}
              onClick={() => setTab(t as Tab)}
            >
              <Text
                className="text-xs font-medium whitespace-nowrap"
                style={{ color: tab === t ? '#FFFFFF' : '#6B7280' }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 徽章网格 */}
      {loading ? (
        <View className="flex items-center justify-center py-20">
          <Text className="text-sm" style={{ color: '#9CA3AF' }}>徽章加载中…</Text>
        </View>
      ) : filteredDefs.length === 0 ? (
        <View className="flex flex-col items-center justify-center py-16">
          <Text className="text-4xl mb-3">🏅</Text>
          <Text className="text-sm" style={{ color: '#9CA3AF' }}>暂无此类徽章</Text>
        </View>
      ) : (
        <View className="px-5 pb-8">
          <View className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {filteredDefs.map((def) => (
              <BadgeCard
                key={def.code}
                def={def}
                grant={grants[def.code]}
                onClick={() => setSelectedDef(def)}
              />
            ))}
          </View>
        </View>
      )}

      {/* 详情弹窗 */}
      {selectedDef && (
        <BadgeDetailModal
          def={selectedDef}
          grant={grants[selectedDef.code]}
          onClose={() => setSelectedDef(null)}
        />
      )}
    </View>
  )
}
