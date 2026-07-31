// @title 今日食养推荐
// 入口：食养健康分组 → 今日食养 / 体质测试结果页CTA
// 融合：当前节气 + 用户体质 + 消费偏好 → 个性化推荐
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { useFoodKnowledgeStore } from '@/store/foodKnowledgeStore'
import { getTodayFoodTherapy, type TodayFoodTherapyResult } from '@/utils/today-food-therapy'
import { FOOD_DISCLAIMER } from '@/utils/sensitive-words'

// ── 常量 ───────────────────────────────────────────────────────────────────

const MATCH_COLOR: Record<string, string> = {
  season: '#3B82F6',
  constitution: '#22C55E',
  preference: '#F97316',
}

const MATCH_LABEL: Record<string, string> = {
  season: '节气应季',
  constitution: '体质适配',
  preference: '口味偏好',
}

// ── 推荐条目卡 ────────────────────────────────────────────────────────────

function RecItemCard({ item }: { item: TodayFoodTherapyResult['recommendations'][number] }) {
  const matchSources = item.sourceMatch || []

  return (
    <View
      className="rounded-xl p-4 mb-3"
      style={{ background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <View className="flex items-start gap-3">
        <View
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#FEF3C7' }}
        >
          <Text className="text-xl">{item.emoji}</Text>
        </View>
        <View className="flex-1">
          <View className="flex items-center justify-between mb-1">
            <Text className="text-sm font-bold" style={{ color: '#374151' }}>{item.name}</Text>
            <View className="flex items-center gap-1">
              <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>匹配度</Text>
              <Text className="text-xs font-bold" style={{ color: '#78350F' }}>{item.score * 10}%</Text>
            </View>
          </View>

          {/* 匹配来源 */}
          <View className="flex flex-wrap gap-1 mb-2">
            {matchSources.map((src) => (
              <View
                key={src}
                className="px-1.5 py-0.5 rounded-full"
                style={{ background: MATCH_COLOR[src] + '22' }}
              >
                <Text className="text-[10px]" style={{ color: MATCH_COLOR[src] }}>
                  {MATCH_LABEL[src]}
                </Text>
              </View>
            ))}
          </View>

          {/* 推荐理由 */}
          <Text className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>{item.reason}</Text>

          {/* 性味标签 */}
          {item.nature && (
            <View className="mt-2 flex items-center gap-2">
              <View className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6' }}>
                <Text className="text-[10px]" style={{ color: '#6B7280' }}>性味：{item.nature}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

// ── 空状态（无数据）───────────────────────────────────────────────────────

function EmptyState({ onTest }: { onTest: () => void }) {
  return (
    <View className="px-5 py-10 text-center">
      <Text className="text-4xl block mb-3">📋</Text>
      <Text className="text-sm font-medium mb-2" style={{ color: '#374151' }}>还没有你的食养偏好</Text>
      <Text className="text-xs leading-relaxed mb-5" style={{ color: '#9CA3AF' }}>
        完成体质测试后，可以获得更精准的今日食养推荐哦
      </Text>
      <View
        className="rounded-xl py-3"
        style={{ background: '#78350F' }}
        onClick={onTest}
      >
        <Text className="text-sm font-semibold text-white">做体质测试 →</Text>
      </View>
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────

export default function TodayFoodTherapyPage() {
  const [data, setData] = useState<TodayFoodTherapyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const { profile } = useAuth()
  const collected = useFoodKnowledgeStore((s) => s.collected)

  useEffect(() => {
    const result = getTodayFoodTherapy(profile ?? null)
    setData(result)
    setLoading(false)
  }, [profile])

  const handleTest = () => {
    Taro.navigateTo({ url: '/pages/food/constitution-test/index' })
  }

  const handleShare = () => {
    if (!data) return
    Taro.setClipboardData({
      data: data.shareCopy,
      success: () => Taro.showToast({ title: '已复制分享文案', icon: 'success' }),
    })
  }

  if (loading) {
    return (
      <View className="min-h-screen flex items-center justify-center" style={{ background: '#FFFBF7' }}>
        <Text className="text-sm" style={{ color: '#9CA3AF' }}>食养引擎启动中…</Text>
      </View>
    )
  }

  if (!data) {
    return (
      <View className="min-h-screen" style={{ background: '#FFFBF7' }}>
        <EmptyState onTest={handleTest} />
      </View>
    )
  }

  return (
    <View className="min-h-screen" style={{ background: '#FFFBF7' }}>
      <ScrollView scrollY style={{ height: '100vh' }}>
        {/* 顶部信息卡 */}
        <View className="px-5 pt-5 pb-4">
          <View
            className="rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}
          >
            <View className="flex items-center justify-between mb-3">
              <View>
                <Text className="text-white/60 text-xs">今日食养</Text>
                {data.term && (
                  <View className="flex items-center gap-2 mt-1">
                    <Text className="text-xl">{data.term.emoji}</Text>
                    <Text className="text-white font-bold">{data.term.name}</Text>
                  </View>
                )}
              </View>
              <View
                className="px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={handleShare}
              >
                <Text className="text-xs text-white">📋 分享今日</Text>
              </View>
            </View>

            {data.constitution && (
              <View className="flex items-center gap-2">
                <Text className="text-white/60 text-xs">你的体质</Text>
                <View className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <Text className="text-xs text-white">
                    {data.constitution.emoji} {data.constitution.name}
                  </Text>
                </View>
              </View>
            )}

            {/* 一句话建议 */}
            {data.dailyAdvice && (
              <View className="mt-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <Text className="text-xs text-white leading-relaxed">💡 {data.dailyAdvice}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 已收录食材 */}
        {Object.keys(collected).length > 0 && (
          <View className="px-5 mb-3">
            <View className="flex items-center justify-between mb-2">
              <Text className="text-sm font-medium" style={{ color: '#374151' }}>🏷️ 已收录配料</Text>
              <Text className="text-xs" style={{ color: '#9CA3AF' }}>{Object.keys(collected).length}个</Text>
            </View>
            <View className="flex flex-wrap gap-1.5">
              {Object.values(collected).slice(0, 12).map((frag) => (
                <View
                  key={frag.additiveKey}
                  className="px-2 py-1 rounded-full"
                  style={{ background: frag.riskLevel === 'white' ? '#DCFCE7' : frag.riskLevel === 'yellow' ? '#FEF3C7' : '#FEE2E2' }}
                >
                  <Text className="text-[10px]" style={{ color: frag.riskLevel === 'white' ? '#16A34A' : frag.riskLevel === 'yellow' ? '#D97706' : '#DC2626' }}>
                    {frag.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 推荐列表 */}
        <View className="px-5 pb-5">
          <View className="flex items-center justify-between mb-3">
            <Text className="text-sm font-bold" style={{ color: '#374151' }}>
              📖 今日推荐
            </Text>
            <View className="flex items-center gap-2">
              {(['season', 'constitution', 'preference'] as const).map((s) => (
                <View key={s} className="flex items-center gap-1">
                  <View className="w-2 h-2 rounded-full" style={{ background: MATCH_COLOR[s] }} />
                  <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>{MATCH_LABEL[s]}</Text>
                </View>
              ))}
            </View>
          </View>

          {data.recommendations.length === 0 ? (
            <View className="py-8 text-center">
              <Text className="text-3xl mb-2 block">🌿</Text>
              <Text className="text-xs" style={{ color: '#9CA3AF' }}>暂无推荐，请先完善体质信息</Text>
            </View>
          ) : (
            data.recommendations.map((item, idx) => (
              <RecItemCard key={idx} item={item} />
            ))
          )}

          {/* 兜底提示 */}
          <View className="mt-4 px-4 py-3 rounded-xl" style={{ background: '#F3F4F6' }}>
            <Text className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>{FOOD_DISCLAIMER}</Text>
          </View>

          {/* 相关功能入口 */}
          <View className="mt-4 flex gap-3">
            <View
              className="flex-1 rounded-xl py-3 text-center"
              style={{ background: '#FEF3C7' }}
              onClick={() => Taro.navigateTo({ url: '/pages/food/constitution-test/index' })}
            >
              <Text className="text-xs font-medium" style={{ color: '#92400E' }}>🔮 体质测试</Text>
            </View>
            <View
              className="flex-1 rounded-xl py-3 text-center"
              style={{ background: '#F3F4F6' }}
              onClick={() => Taro.navigateTo({ url: '/pages/food/seasonal-box/index' })}
            >
              <Text className="text-xs font-medium" style={{ color: '#6B7280' }}>🫁 节气食盒</Text>
            </View>
            <View
              className="flex-1 rounded-xl py-3 text-center"
              style={{ background: '#EFF6FF' }}
              onClick={() => Taro.navigateTo({ url: '/pages/food/food-detective/index' })}
            >
              <Text className="text-xs font-medium" style={{ color: '#3B82F6' }}>🕵️ 食安侦探</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
