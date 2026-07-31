// @title 节气食盒
// 入口：食养健康分组 → 节气食盒
// 展示：当前节气 + 食盒主题 + 推荐/慎用食材 + 下个节气倒计时
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import {
  SEASONAL_TERMS_2026,
  getCurrentTerm,
  getNextTerm,
  getDaysLeftInTerm,
  type SeasonalTerm,
} from '@/utils/seasonal-box'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/sensitive-words'

// ── 常量 ───────────────────────────────────────────────────────────────────

const NATURE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '温补': { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  '清热': { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  '平润': { bg: '#EFF6FF', text: '#3B82F6', border: '#BFDBFE' },
  '滋阴': { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  '健脾': { bg: '#FDF4FF', text: '#9333EA', border: '#E9D5FF' },
  '润燥': { bg: '#F0FDF4', text: '#15803D', border: '#86EFAC' },
}

// ── 进度环（倒计时）───────────────────────────────────────────────────────

function TermCountdown({ term }: { term: SeasonalTerm }) {
  const daysLeft = getDaysLeftInTerm(term)
  const start = new Date(term.startDate)
  const end = new Date(term.endDate)
  const now = new Date()
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const elapsed = Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const pct = Math.min(100, Math.round((elapsed / totalDays) * 100))

  return (
    <View className="flex items-center gap-3">
      <View style={{ position: 'relative', width: 56, height: 56 }}>
        <View
          style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: `conic-gradient(#78350F ${pct}%, #E5E7EB 0%)`,
          }}
        />
        <View
          style={{
            position: 'absolute', inset: '20%',
            borderRadius: '50%',
            background: '#FFFBF7',
          }}
        />
        <View
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text className="text-[10px] font-bold" style={{ color: '#78350F' }}>{daysLeft}天</Text>
        </View>
      </View>
      <View>
        <Text className="text-xs font-medium" style={{ color: '#374151' }}>剩余天数</Text>
        <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>节气临近结束</Text>
      </View>
    </View>
  )
}

// ── 食材标签 ──────────────────────────────────────────────────────────────

function IngredientTag({ name, type }: { name: string; type: 'good' | 'avoid' }) {
  return (
    <View
      className="px-2.5 py-1 rounded-full"
      style={{
        background: type === 'good' ? '#DCFCE7' : '#FEE2E2',
        color: type === 'good' ? '#16A34A' : '#DC2626',
      }}
    >
      <Text className="text-xs">{name}</Text>
    </View>
  )
}

// ── 节气详情卡 ────────────────────────────────────────────────────────────

function TermCard({ term, onBuy }: { term: SeasonalTerm; onBuy: () => void }) {
  const natureStyle = NATURE_COLORS[term.nature] || NATURE_COLORS['平润']
  const daysLeft = getDaysLeftInTerm(term)

  return (
    <View>
      {/* 主视觉区 */}
      <View
        className="px-5 pt-6 pb-5"
        style={{ background: `linear-gradient(135deg, ${term.color} 0%, ${term.colorEnd} 100%)` }}
      >
        <View className="flex items-start justify-between mb-3">
          <View>
            <View className="flex items-center gap-2 mb-1">
              <Text className="text-3xl">{term.emoji}</Text>
              <Text className="text-2xl font-bold" style={{ color: '#78350F' }}>{term.name}</Text>
            </View>
            <Text className="text-xs" style={{ color: '#92400E' }}>{term.pinyin}</Text>
          </View>
          <View
            className="px-3 py-1 rounded-full"
            style={{ background: natureStyle.bg, border: `1px solid ${natureStyle.border}` }}
          >
            <Text className="text-xs font-medium" style={{ color: natureStyle.text }}>{term.nature}</Text>
          </View>
        </View>

        <Text className="text-sm leading-relaxed mb-4" style={{ color: '#78350F' }}>
          {term.principle}
        </Text>

        {/* 倒计时 */}
        <TermCountdown term={term} />

        {/* 食盒 CTA */}
        <View
          className="mt-4 rounded-xl py-3 text-center"
          style={{ background: '#78350F' }}
          onClick={onBuy}
        >
          <Text className="text-sm font-semibold text-white">🫁 订阅 {term.name}食盒</Text>
        </View>
      </View>

      <View className="px-5 py-5">
        {/* 气候与民俗 */}
        <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#F9FAFB' }}>
          <Text className="text-xs font-medium mb-1 block" style={{ color: '#9CA3AF' }}>节气气候</Text>
          <Text className="text-sm leading-relaxed" style={{ color: '#374151' }}>{term.weatherDesc}</Text>
        </View>

        {term.folkWisdom && (
          <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#FFFBEB' }}>
            <Text className="text-xs font-medium mb-1 block" style={{ color: '#92400E' }}>民间食俗</Text>
            <Text className="text-sm leading-relaxed" style={{ color: '#78350F' }}>{term.folkWisdom}</Text>
          </View>
        )}

        {/* 推荐食材 */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2 block" style={{ color: '#374151' }}>
            🥗 推荐食材
          </Text>
          <View className="flex flex-wrap gap-2">
            {term.recommendIngredients.map((ing, i) => (
              <IngredientTag key={i} name={ing} type="good" />
            ))}
          </View>
        </View>

        {/* 慎用食材 */}
        {term.avoidIngredients.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-bold mb-2 block" style={{ color: '#374151' }}>
              ⚠️ 慎用食材
            </Text>
            <View className="flex flex-wrap gap-2">
              {term.avoidIngredients.map((ing, i) => (
                <IngredientTag key={i} name={ing} type="avoid" />
              ))}
            </View>
          </View>
        )}

        {/* 兜底提示 */}
        <View className="px-4 py-3 rounded-xl" style={{ background: '#F3F4F6' }}>
          <Text className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>{FOOD_THERAPY_DISCLAIMER}</Text>
        </View>
      </View>
    </View>
  )
}

// ── 节气列表（全部24节气）───────────────────────────────────────────────

function TermListItem({ term, isCurrent }: { term: SeasonalTerm; isCurrent: boolean }) {
  const natureStyle = NATURE_COLORS[term.nature] || NATURE_COLORS['平润']

  return (
    <View
      className="flex items-center gap-3 px-5 py-3"
      style={{
        background: isCurrent ? term.color : '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
      }}
    >
      <Text className="text-2xl">{term.emoji}</Text>
      <View className="flex-1">
        <View className="flex items-center gap-2">
          <Text className="text-sm font-medium" style={{ color: isCurrent ? '#78350F' : '#374151' }}>
            {term.name}
          </Text>
          {isCurrent && <Text className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#78350F', color: '#FFF' }}>当前</Text>}
        </View>
        <Text className="text-[10px]" style={{ color: isCurrent ? '#92400E' : '#9CA3AF' }}>
          {term.startDate} ~ {term.endDate}
        </Text>
      </View>
      <View
        className="px-2 py-0.5 rounded-full"
        style={{ background: natureStyle.bg }}
      >
        <Text className="text-[10px]" style={{ color: natureStyle.text }}>{term.nature}</Text>
      </View>
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────

type Tab = 'current' | 'all'

export default function SeasonalBoxPage() {
  const [tab, setTab] = useState<Tab>('current')
  const [currentTerm, setCurrentTerm] = useState<SeasonalTerm | null>(null)
  const [nextTerm, setNextTerm] = useState<SeasonalTerm | null>(null)
  const [daysLeft, setDaysLeft] = useState(0)

  useEffect(() => {
    const term = getCurrentTerm()
    const next = getNextTerm()
    setCurrentTerm(term)
    setNextTerm(next)
    if (term) setDaysLeft(getDaysLeftInTerm(term))
  }, [])

  const handleBuy = () => {
    Taro.showToast({ title: '食盒订阅功能即将上线', icon: 'none' })
  }

  return (
    <View className="min-h-screen" style={{ background: '#FFFBF7' }}>
      {/* Tab 切换 */}
      <View className="px-5 pt-4 pb-3 flex gap-3">
        {([['current', '当前节气'], ['all', '全部节气']] as const).map(([t, label]) => (
          <View
            key={t}
            className="px-4 py-2 rounded-full"
            style={{ background: tab === t ? '#78350F' : '#F3F4F6' }}
            onClick={() => setTab(t as Tab)}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: tab === t ? '#FFFFFF' : '#6B7280' }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* 当前节气 */}
      {tab === 'current' && currentTerm && (
        <ScrollView scrollY style={{ height: 'calc(100vh - 52px)' }}>
          <TermCard term={currentTerm} onBuy={handleBuy} />

          {/* 下个节气预告 */}
          {nextTerm && (
            <View className="px-5 pb-5">
              <View className="px-4 py-3 rounded-xl" style={{ background: '#F9FAFB' }}>
                <Text className="text-xs font-medium mb-2 block" style={{ color: '#9CA3AF' }}>下个节气预告</Text>
                <View className="flex items-center gap-3">
                  <Text className="text-2xl">{nextTerm.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-medium" style={{ color: '#374151' }}>{nextTerm.name}</Text>
                    <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>{nextTerm.startDate} 开始</Text>
                  </View>
                  <View className="px-2 py-1 rounded-full" style={{ background: NATURE_COLORS[nextTerm.nature]?.bg }}>
                    <Text className="text-[10px]" style={{ color: NATURE_COLORS[nextTerm.nature]?.text }}>{nextTerm.nature}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* 全部节气列表 */}
      {tab === 'all' && (
        <ScrollView scrollY style={{ height: 'calc(100vh - 52px)' }}>
          {SEASONAL_TERMS_2026.map((term) => (
            <View
              key={term.key}
              onClick={() => setTab('current')}
            >
              <TermListItem term={term} isCurrent={currentTerm?.key === term.key} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
