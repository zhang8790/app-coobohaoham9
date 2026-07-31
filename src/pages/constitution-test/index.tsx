// @title 体质快速测试
// 入口：食养健康分组 → 体质测试
// 流程：5道题 → 判定体质 → 推荐/慎用食材 + 性味建议
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import {
  TEST_QUESTIONS,
  CONSTITUTION_TYPES,
  calculateResult,
  filterProductsByConstitution,
  type TestResult,
  type ConstitutionType,
} from '@/utils/constitution-test'
import { FOOD_DISCLAIMER, CONSTITUTION_DISCLAIMER } from '@/utils/sensitive-words'

// ── 常量 ───────────────────────────────────────────────────────────────────

const ANSWER_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6']

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100)
  return (
    <View className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(120,53,15,0.1)' }}>
      <View
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: '#78350F' }}
      />
    </View>
  )
}

function NatureChip({ label, type }: { label: string; type: 'good' | 'avoid' }) {
  return (
    <View
      className="px-3 py-1 rounded-full"
      style={{
        background: type === 'good' ? '#DCFCE7' : '#FEE2E2',
        color: type === 'good' ? '#16A34A' : '#DC2626',
      }}
    >
      <Text className="text-xs font-medium">{type === 'good' ? '宜 ' : '忌 '}{label}</Text>
    </View>
  )
}

function ResultCard({ result, onRetest }: { result: TestResult; onRetest: () => void }) {
  const main = CONSTITUTION_TYPES[result.primary]
  const secondKeys = result.secondary.slice(0, 2)
  const secondConstitutions = secondKeys.map((k) => CONSTITUTION_TYPES[k]).filter(Boolean)

  return (
    <ScrollView scrollY className="flex-1">
      <View className="px-5 py-6">
        {/* 标题 */}
        <View className="text-center mb-6">
          <Text className="text-sm" style={{ color: '#9CA3AF' }}>测试完成 · 你的体质是</Text>
        </View>

        {/* 主体质卡 */}
        <View
          className="rounded-2xl p-5 mb-4 text-center"
          style={{ background: `linear-gradient(135deg, ${main.color} 0%, ${main.colorLight} 100%)` }}
        >
          <Text className="text-5xl block mb-2">{main.emoji}</Text>
          <Text className="text-xl font-bold" style={{ color: main.color }}>{main.name}</Text>
          <Text className="text-xs mt-1" style={{ color: '#6B7280' }}>{main.description}</Text>
        </View>

        {/* 兼夹体质 */}
        {secondConstitutions.length > 0 && (
          <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#F9FAFB' }}>
            <Text className="text-xs font-medium mb-2 block" style={{ color: '#9CA3AF' }}>兼夹体质</Text>
            <View className="flex flex-wrap gap-2">
              {secondConstitutions.map((c) => (
                <View
                  key={c.key}
                  className="px-3 py-1.5 rounded-full flex items-center gap-1.5"
                  style={{ background: c.colorLight }}
                >
                  <Text className="text-base">{c.emoji}</Text>
                  <Text className="text-xs font-medium" style={{ color: c.color }}>{c.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 典型表现 */}
        <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#FEF3C7' }}>
          <Text className="text-xs font-medium mb-2 block" style={{ color: '#92400E' }}>典型表现</Text>
          <Text className="text-xs leading-relaxed" style={{ color: '#78350F' }}>
            {main.characteristics.join('、')}
          </Text>
        </View>

        {/* 宜忌性味 */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2 block" style={{ color: '#374151' }}>食养建议</Text>
          <View className="flex flex-wrap gap-2 mb-2">
            {main.recommendNature.map((n) => (
              <NatureChip key={n} label={n} type="good" />
            ))}
          </View>
          <View className="flex flex-wrap gap-2">
            {main.avoidNature.map((n) => (
              <NatureChip key={n} label={n} type="avoid" />
            ))}
          </View>
        </View>

        {/* 推荐 / 慎用食材 */}
        <View className="mb-4">
          <View className="flex items-center gap-2 mb-2">
            <Text className="text-base">🥗</Text>
            <Text className="text-sm font-medium" style={{ color: '#16A34A' }}>推荐食材</Text>
          </View>
          <View className="flex flex-wrap gap-1.5">
            {main.recommendFoods.slice(0, 8).map((f, i) => (
              <View key={i} className="px-2.5 py-1 rounded-full" style={{ background: '#DCFCE7' }}>
                <Text className="text-xs" style={{ color: '#16A34A' }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mb-4">
          <View className="flex items-center gap-2 mb-2">
            <Text className="text-base">⚠️</Text>
            <Text className="text-sm font-medium" style={{ color: '#DC2626' }}>慎用食材</Text>
          </View>
          <View className="flex flex-wrap gap-1.5">
            {main.avoidFoods.slice(0, 6).map((f, i) => (
              <View key={i} className="px-2.5 py-1 rounded-full" style={{ background: '#FEE2E2' }}>
                <Text className="text-xs" style={{ color: '#DC2626' }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 兜底提示 */}
        <View className="px-4 py-3 rounded-xl mb-5" style={{ background: '#F3F4F6' }}>
          <Text className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>{CONSTITUTION_DISCLAIMER}</Text>
        </View>

        {/* 操作按钮 */}
        <View
          className="rounded-xl py-3 text-center mb-3"
          style={{ background: '#78350F' }}
          onClick={() => Taro.navigateTo({ url: '/pages/food/today-food-therapy/index' })}
        >
          <Text className="text-sm font-semibold text-white">🍵 今日食养推荐</Text>
        </View>

        <View
          className="rounded-xl py-3 text-center"
          style={{ background: '#F3F4F6' }}
          onClick={onRetest}
        >
          <Text className="text-sm font-medium" style={{ color: '#6B7280' }}>🔄 重新测试</Text>
        </View>
      </View>
    </ScrollView>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────

type Screen = 'intro' | 'test' | 'result'

export default function ConstitutionTestPage() {
  const [screen, setScreen] = useState<Screen>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<TestResult | null>(null)

  const total = TEST_QUESTIONS.length
  const q = TEST_QUESTIONS[currentQ]

  const handleAnswer = (score: number) => {
    const newAnswers = [...answers, score]
    setAnswers(newAnswers)

    if (currentQ + 1 < total) {
      setCurrentQ((q) => q + 1)
    } else {
      const res = calculateResult(newAnswers)
      setResult(res)
      setScreen('result')
    }
  }

  const handleRetest = () => {
    setAnswers([])
    setCurrentQ(0)
    setResult(null)
    setScreen('intro')
  }

  return (
    <View className="min-h-screen" style={{ background: '#FFFBF7' }}>
      {/* 顶部进度 */}
      {screen === 'test' && (
        <View className="px-5 pt-4 pb-3">
          <View className="flex items-center justify-between mb-2">
            <Text className="text-xs font-medium" style={{ color: '#78350F' }}>
              第 {currentQ + 1} / {total} 题
            </Text>
            <Text className="text-xs" style={{ color: '#9CA3AF' }}>{q?.category}</Text>
          </View>
          <ProgressBar current={currentQ + 1} total={total} />
        </View>
      )}

      {/* 引导页 */}
      {screen === 'intro' && (
        <View className="px-5 pt-12 pb-8 text-center">
          <Text className="text-6xl block mb-4">🔮</Text>
          <Text className="text-xl font-bold mb-2" style={{ color: '#78350F' }}>体质快速测试</Text>
          <Text className="text-sm leading-relaxed mb-8" style={{ color: '#6B7280' }}>
            通过5道简单选择题，快速判断你的中医体质类型，获得个性化的食养建议。测试结果仅供参考，不作为诊疗依据。
          </Text>

          {/* 体质类型预览 */}
          <View className="flex flex-wrap gap-2 justify-center mb-8">
            {Object.values(CONSTITUTION_TYPES).map((c) => (
              <View
                key={c.key}
                className="px-2 py-1 rounded-full flex items-center gap-1"
                style={{ background: c.colorLight }}
              >
                <Text className="text-xs">{c.emoji}</Text>
                <Text className="text-xs font-medium" style={{ color: c.color }}>{c.name}</Text>
              </View>
            ))}
          </View>

          <View
            className="rounded-xl py-3"
            style={{ background: '#78350F' }}
            onClick={() => setScreen('test')}
          >
            <Text className="text-sm font-semibold text-white">开始测试 →</Text>
          </View>
        </View>
      )}

      {/* 测试题目 */}
      {screen === 'test' && q && (
        <View className="px-5 pb-8">
          {/* 题目 */}
          <View className="mb-6">
            <View className="px-3 py-1 rounded-full inline-block mb-3" style={{ background: '#FEF3C7' }}>
              <Text className="text-xs" style={{ color: '#92400E' }}>{q.category}</Text>
            </View>
            <Text className="text-lg font-bold leading-relaxed" style={{ color: '#374151' }}>
              {q.question}
            </Text>
          </View>

          {/* 选项 */}
          <View className="gap-3">
            {q.options.map((opt, idx) => (
              <View
                key={idx}
                className="rounded-xl px-4 py-4"
                style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                onClick={() => handleAnswer(opt.score)}
              >
                <View className="flex items-center gap-3">
                  <View
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: ANSWER_COLORS[idx] + '22' }}
                  >
                    <Text className="text-xs font-bold" style={{ color: ANSWER_COLORS[idx] }}>
                      {String.fromCharCode(65 + idx)}
                    </Text>
                  </View>
                  <Text className="text-sm flex-1" style={{ color: '#374151' }}>{opt.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 结果页 */}
      {screen === 'result' && result && (
        <ResultCard result={result} onRetest={handleRetest} />
      )}
    </View>
  )
}
