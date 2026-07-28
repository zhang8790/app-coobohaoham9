// @title 体质快速测试
import { useState, useEffect } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import {
  TEST_QUESTIONS,
  calculateResult,
  CONSTITUTION_TYPES,
  filterProductsByConstitution,
  constitutionToGoals,
  type ConstitutionType,
  type TestResult,
} from '@/utils/constitution-test'
import { getProducts } from '@/db/api'
import { upsertUserHealthProfile } from '@/db/food-api'
import { useAuth } from '@/contexts/AuthContext'
import { INGREDIENT_DICT } from '@/utils/shiyang-dictionary'
import type { Product } from '@/db/types'

// ── 引导页 ─────────────────────────────────────────────────────────────────

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <View className="min-h-screen bg-[#FFFBF7] px-5 pt-10 flex flex-col items-center">
      <View className="text-center">
        <Text className="text-5xl">🔍</Text>
        <Text className="block text-3xl font-bold text-[#1A1A1A] mt-4">体质快速测试</Text>
        <Text className="block text-sm text-[#9A8070] mt-2 leading-relaxed">
          3分钟 · 5道题 · 读懂你的身体
        </Text>
      </View>

      <View className="mt-8 w-full space-y-3">
        {[
          { icon: '⏱', title: '只要3分钟', desc: '回答5道简单问题' },
          { icon: '📋', title: '生成专属标签', desc: '了解自己的食养体质' },
          { icon: '🍎', title: '匹配应季好物', desc: '按体质推荐适合的商品' },
          { icon: '📍', title: '摊位话术支持', desc: '扫码即出体质推荐话术' },
        ].map((item) => (
          <View key={item.title} className="flex items-center gap-3 bg-white rounded-xl p-4" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
            <Text className="text-2xl">{item.icon}</Text>
            <View>
              <Text className="text-sm font-medium text-[#1A1A1A]">{item.title}</Text>
              <Text className="text-xs text-[#9A8070] mt-0.5">{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-6 px-4 py-3 rounded-xl" style={{ background: '#F5F3EF' }}>
        <Text className="text-xs text-[#9A8070] leading-relaxed">
          本测试基于中医体质分类参考，结果仅供食养参考，不替代专业医学诊断。如有特殊健康状况，请咨询医师。
        </Text>
      </View>

      <View className="mt-auto mb-8 w-full">
        <Button
          className="rounded-2xl py-3 text-white font-medium"
          style={{ background: '#78350F', fontSize: 16 }}
          onClick={onStart}
        >
          开始测试 →
        </Button>
      </View>
    </View>
  )
}

// ── 题目页 ─────────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
}: {
  question: (typeof TEST_QUESTIONS)[number]
  index: number
  total: number
  selected: number | null
  onSelect: (v: number) => void
}) {
  return (
    <View className="min-h-screen bg-[#FFFBF7] px-5 pt-8 pb-6 flex flex-col">
      {/* 进度 */}
      <View className="flex items-center justify-between mb-6">
        <Text className="text-xs text-[#9A8070]">{index + 1} / {total}</Text>
        <View className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i < index ? 16 : i === index ? 24 : 8,
                background: i <= index ? '#78350F' : '#E5E0D8',
              }}
            />
          ))}
        </View>
      </View>

      {/* 题目标题 */}
      <View className="mb-6">
        <Text className="block text-xl font-bold text-[#1A1A1A]">{question.question}</Text>
        <Text className="block text-xs text-[#9A8070] mt-1">{question.hint}</Text>
      </View>

      {/* 选项列表 */}
      <View className="space-y-3 flex-1">
        {question.options.map((opt, i) => (
          <View
            key={i}
            className="rounded-xl p-4 border-2 transition-all"
            style={{
              borderColor: selected === i ? '#78350F' : '#E5E0D8',
              background: selected === i ? '#FDF8F3' : '#FFFFFF',
            }}
            onClick={() => onSelect(i)}
          >
            <View className="flex items-start gap-3">
              <View
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  borderColor: selected === i ? '#78350F' : '#D1CBC3',
                  background: selected === i ? '#78350F' : 'transparent',
                }}
              >
                {selected === i && <Text className="text-white text-xs">✓</Text>}
              </View>
              <Text
                className="text-sm flex-1 leading-relaxed"
                style={{ color: selected === i ? '#1A1A1A' : '#6B7280' }}
              >
                {opt.label}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* 底部确认 */}
      <View className="mt-4">
        {selected !== null ? (
          <View className="text-xs text-[#9A8070] text-center mb-2">
            已选择，第{index + 1}题
          </View>
        ) : (
          <View className="text-xs text-[#D1CBC3] text-center mb-2">
            请选择一项
          </View>
        )}
      </View>
    </View>
  )
}

// ── 结果页 ─────────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: TestResult }) {
  const c = result.primary
  const [saved, setSaved] = useState(false)
  const { profile } = useAuth()

  const handleSave = async () => {
    if (!profile?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const goals = constitutionToGoals(c)
    const ok = await upsertUserHealthProfile({
      user_id: profile.id,
      constitution_type: c.key,
      health_goals: goals,
    })
    if (ok) {
      setSaved(true)
      Taro.showToast({ title: '已保存到体质档案', icon: 'success' })
    } else {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
  }

  const recommendIngredients = c.recommendFoods
    .map((k) => INGREDIENT_DICT[k])
    .filter(Boolean)
    .slice(0, 6)

  return (
    <ScrollView scrollY className="flex-1">
      <View className="px-5 pt-8 pb-6">
        {/* 体质主卡片 */}
        <View
          className="rounded-3xl p-5 mb-4"
          style={{ background: `linear-gradient(135deg, ${c.colorLight} 0%, ${c.colorLight} 100%)` }}
        >
          <View className="text-center">
            <Text className="text-6xl">{c.emoji}</Text>
            <Text className="block text-2xl font-bold mt-3" style={{ color: c.color }}>{c.name}</Text>
            <Text className="block text-sm text-[#6B7280] mt-1">{c.description}</Text>
          </View>

          {/* 典型表现 */}
          <View className="mt-4">
            <Text className="text-xs font-medium text-[#9A8070] mb-2">典型表现</Text>
            <View className="flex flex-wrap gap-1.5">
              {c.characteristics.map((char) => (
                <View key={char} className="px-2.5 py-1 rounded-full" style={{ background: c.color + '20' }}>
                  <Text className="text-xs" style={{ color: c.color }}>{char}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 推荐性味 */}
          <View className="mt-3">
            <Text className="text-xs font-medium text-[#9A8070] mb-2">宜食性味</Text>
            <View className="flex gap-1.5">
              {c.recommendNature.map((n) => (
                <View key={n} className="px-2.5 py-1 rounded-full bg-white/70">
                  <Text className="text-xs font-medium text-[#16A34A]">{n}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 次体质提示 */}
        {result.secondary && (
          <View className="mb-4 px-4 py-3 rounded-xl border border-dashed" style={{ borderColor: '#E5E0D8' }}>
            <Text className="text-xs text-[#9A8070]">
              兼有倾向：<Text className="font-medium" style={{ color: result.secondary.color }}>{result.secondary.name}</Text>
              （{result.secondary.description}）
            </Text>
          </View>
        )}

        {/* 推荐食材 */}
        {recommendIngredients.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-bold text-[#1A1A1A] mb-2">宜食食材</Text>
            <View className="flex flex-wrap gap-2">
              {recommendIngredients.map((ing) =>
                ing ? (
                  <View key={ing.zh} className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <Text className="text-base">{ing.icon}</Text>
                    <View>
                      <Text className="text-xs font-medium text-[#1A1A1A]">{ing.zh}</Text>
                      <Text className="text-[10px]" style={{ color: c.color }}>{ing.nature}性</Text>
                    </View>
                  </View>
                ) : null
              )}
            </View>
          </View>
        )}

        {/* 保存按钮 */}
        <Button
          className="rounded-2xl py-3 text-white font-medium mb-3"
          style={{ background: saved ? '#9CA3AF' : '#78350F', fontSize: 15 }}
          onClick={handleSave}
          disabled={saved}
        >
          {saved ? '已保存到体质档案 ✓' : '保存到我的体质档案'}
        </Button>

        <Button
          className="rounded-2xl py-3 text-sm"
          style={{ background: '#FFFFFF', color: '#78350F', fontSize: 14, border: '1px solid #E5E0D8' }}
          onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
        >
          去看看适合我的商品 →
        </Button>
      </View>
    </ScrollView>
  )
}

// ── 商品推荐列表 ───────────────────────────────────────────────────────────

function ProductList({ constitution }: { constitution: ConstitutionType }) {
  const [products, setProducts] = useState<Product[]>([])
  const [caution, setCaution] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProducts({ isActive: true, limit: 40 })
      .then((all) => {
        const { good, caution: c } = filterProductsByConstitution(all, constitution)
        setProducts(good.slice(0, 8))
        setCaution(c.slice(0, 3))
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [constitution.key])

  if (loading) return (
    <View className="py-6 text-center">
      <Text className="text-xs text-[#BFBFBF]">加载推荐中...</Text>
    </View>
  )

  if (products.length === 0 && caution.length === 0) return (
    <View className="py-6 text-center">
      <Text className="text-xs text-[#BFBFBF]">暂无匹配商品，请先添加商品</Text>
    </View>
  )

  return (
    <View className="px-5 pb-6">
      {products.length > 0 && (
        <>
          <Text className="text-sm font-bold text-[#1A1A1A] mb-3">
            ✅ 推荐给你
          </Text>
          <ScrollView scrollX className="whitespace-nowrap" style={{ paddingBottom: 4 }}>
            {products.map((p) => (
              <View
                key={p.id}
                className="inline-block mr-3 bg-white rounded-2xl overflow-hidden"
                style={{ width: 140, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
              >
                <View style={{ height: 100, overflow: 'hidden' }}>
                  {p.image_url && (
                    <Image src={p.image_url} style={{ width: 140, height: 100 }} mode="aspectFill" />
                  )}
                </View>
                <View className="p-2.5">
                  <Text className="text-xs text-[#1A1A1A] font-medium leading-snug" numberOfLines={2}>{p.name}</Text>
                  <Text className="text-sm font-bold text-[#DC2626] mt-1">¥{p.price.toFixed(1)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {caution.length > 0 && (
        <>
          <Text className="text-sm font-bold text-[#1A1A1A] mt-4 mb-3">
            ⚠️ 注意
          </Text>
          <View className="space-y-2">
            {caution.map((p) => (
              <View key={p.id} className="flex items-center gap-3 bg-white rounded-xl p-3" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-[#1A1A1A]">{p.name}</Text>
                  <Text className="text-xs text-[#9A8070] mt-0.5">{p.overall_nature || '平性'} · {constitution.avoidNature.includes(p.overall_nature || '') ? '宜少吃' : '按需食用'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────

type Phase = 'intro' | 'testing' | 'result'

export default function ConstitutionTestPage() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null, null, null])
  const [result, setResult] = useState<TestResult | null>(null)

  const handleStart = () => setPhase('testing')

  const handleSelect = (value: number) => {
    const newAnswers = [...answers]
    newAnswers[currentQ] = value
    setAnswers(newAnswers)

    // 自动进入下一题
    if (currentQ < TEST_QUESTIONS.length - 1) {
      setTimeout(() => setCurrentQ(currentQ + 1), 300)
    } else {
      // 最后一题 → 计算结果
      const computed = calculateResult(newAnswers as number[])
      setResult(computed)
      setPhase('result')
    }
  }

  const handlePrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1)
    else setPhase('intro')
  }

  const handleRetake = () => {
    setAnswers([null, null, null, null, null])
    setCurrentQ(0)
    setResult(null)
    setPhase('intro')
  }

  if (phase === 'intro') {
    return <IntroScreen onStart={handleStart} />
  }

  if (phase === 'testing') {
    return (
      <View className="min-h-screen bg-[#FFFBF7]">
        {/* 顶部返回 */}
        <View className="px-4 pt-3 pb-1 flex items-center justify-between">
          <View onClick={handlePrev}>
            <Text className="text-sm text-[#9A8070]">← {currentQ > 0 ? '上一题' : '返回'}</Text>
          </View>
          <Text className="text-xs text-[#BFBFBF]">{currentQ + 1}/5</Text>
        </View>
        <QuestionCard
          key={currentQ}
          question={TEST_QUESTIONS[currentQ]}
          index={currentQ}
          total={5}
          selected={answers[currentQ]}
          onSelect={handleSelect}
        />
      </View>
    )
  }

  // result
  if (!result) return null

  return (
    <View className="min-h-screen bg-[#FFFBF7]">
      <ResultCard result={result} />
      <ProductList constitution={result.primary} />
      <View className="px-5 pb-8">
        <Button
          className="rounded-2xl py-3 text-sm"
          style={{ background: 'transparent', color: '#9A8070', fontSize: 13 }}
          onClick={handleRetake}
        >
          重新测试
        </Button>
      </View>
    </View>
  )
}
