// 食养偏好自测 —— 页面层
// 流程：intro(说明+免责) → quiz(5题逐题) → result(结果卡 + 推荐商品)
// 逻辑层复用 src/utils/constitution-test.ts：TEST_QUESTIONS / calculateResult / filterProductsByConstitution
// 存档：结果写回 profiles.constitution_tags，由 FoodTherapyContext 自动注入全站个性化推荐。
//
// 合规框架：本页是「食养偏好参考」而非医疗诊断。用户可见文案统一为「偏好/倾向」，
// 全程展示 FOOD_THERAPY_DISCLAIMER，符合项目 P2 去医疗化红线。

import { useState } from 'react'
import { View, Text, Button, ScrollView, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  TEST_QUESTIONS,
  calculateResult,
  filterProductsByConstitution,
  constitutionToCrowds,
  type TestResult,
  type ConstitutionType,
} from '@/utils/constitution-test'
import { getProducts, updateProfile } from '@/db/api'
import { upsertUserHealthProfile } from '@/db/food-api'
import { ALLERGY_OPTIONS } from '@/utils/food-therapy/profile-map'
import { useAuth } from '@/contexts/AuthContext'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { Product } from '@/db/types'

type Step = 'intro' | 'quiz' | 'result'

export default function ConstitutionTestPage() {
  const { profile } = useAuth()

  const [step, setStep] = useState<Step>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>(() => TEST_QUESTIONS.map(() => -1))
  const [result, setResult] = useState<TestResult | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [good, setGood] = useState<Product[]>([])
  const [caution, setCaution] = useState<Product[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // 安全偏好：过敏成分（选填，用于扫码时个性化强预警；覆盖原「我的体质档案」的过敏原采集）
  const [allergies, setAllergies] = useState<string[]>([])

  const total = TEST_QUESTIONS.length
  const q = TEST_QUESTIONS[currentQ]
  const selected = answers[currentQ]

  // 选答：到达最后一题则计算并进入结果，否则下一题
  const handleSelect = async (optIdx: number) => {
    const next = [...answers]
    next[currentQ] = optIdx
    setAnswers(next)

    if (currentQ < total - 1) {
      setCurrentQ(currentQ + 1)
      return
    }

    // 最后一题：计算 + 拉商品 + 匹配
    const res = calculateResult(next)
    setResult(res)
    setStep('result')
    setLoadingRecs(true)
    try {
      const all = await getProducts({ limit: 40 })
      const { good: g, caution: c } = filterProductsByConstitution(all, res.primary)
      setProducts(all)
      setGood(g.slice(0, 6))
      setCaution(c.slice(0, 3))
    } catch (e) {
      console.error('[constitution-test] 商品匹配失败', e)
    } finally {
      setLoadingRecs(false)
    }
  }

  const goPrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1)
  }

  const restart = () => {
    setAnswers(TEST_QUESTIONS.map(() => -1))
    setCurrentQ(0)
    setResult(null)
    setGood([])
    setCaution([])
    setSaved(false)
    setStep('intro')
  }

  const handleSave = async () => {
    if (!profile?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!result) return
    setSaving(true)
    try {
      const tags = constitutionToCrowds(result.primary)
      await updateProfile({ constitution_tags: tags })
      // 覆盖原「我的体质档案」：若用户选了过敏原，写入结构化画像，保留扫码个性化强预警
      if (allergies.length > 0) {
        await upsertUserHealthProfile({ user_id: profile.id, allergies })
      }
      setSaved(true)
      Taro.showToast({ title: '已保存到我的偏好', icon: 'success' })
    } catch (e) {
      console.error('[constitution-test] 存档失败', e)
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  // ── 结果卡配色 ─────────────────────────────────────────────
  const primary: ConstitutionType | null = result?.primary ?? null

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5 pb-16">
      {/* ===== 顶部标题 ===== */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-[#1A1A1A]">🧪 食养偏好自测</Text>
        <Text className="text-xs text-[#6B7280] mt-1 block">
          5 道题，了解你的口味与食性偏好，挑好物更对味
        </Text>
      </View>

      {/* ===== 步骤一：说明 ===== */}
      {step === 'intro' && (
        <View>
          <View className="rounded-2xl bg-white p-5 shadow-sm">
            <Text className="text-base font-bold text-[#1A1A1A]">这是什么</Text>
            <Text className="text-sm text-[#374151] mt-2 block" style={{ lineHeight: 1.8 }}>
              根据你近期的身体感受，用 5 道简单选择题，给出你的「食养偏好倾向」——
              偏温还是偏凉、适合哪些性味的好物。结果仅作食养参考，帮你更快挑到合适的吃食。
            </Text>
            <View className="mt-3 flex flex-wrap gap-2">
              {['约 1 分钟', '无需登录也能测', '可保存到偏好'].map((t) => (
                <View key={t} className="rounded-full bg-[#FDF2F8] px-3 py-1">
                  <Text className="text-xs text-[#DB2777]">{t}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="mt-4 rounded-2xl bg-[#FFFBF7] p-4" style={{ borderWidth: 1, borderColor: '#F3D9E6' }}>
            <Text className="text-[11px] text-[#9CA3AF] leading-relaxed block">
              {FOOD_THERAPY_DISCLAIMER}
            </Text>
          </View>

          <Button
            onClick={() => { setCurrentQ(0); setStep('quiz') }}
            className="mt-5 rounded-full"
            style={{ background: '#DB2777', color: '#fff' }}
          >
            开始测试
          </Button>
        </View>
      )}

      {/* ===== 步骤二：逐题 ===== */}
      {step === 'quiz' && q && (
        <View>
          {/* 进度 */}
          <View className="mb-4 flex items-center gap-2">
            {TEST_QUESTIONS.map((_, i) => (
              <View
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: i <= currentQ ? '#DB2777' : '#F3D9E6' }}
              />
            ))}
          </View>
          <Text className="text-xs text-[#9CA3AF]">
            第 {currentQ + 1} / {total} 题
          </Text>
          <Text className="text-lg font-bold text-[#1A1A1A] mt-1 block">{q.question}</Text>
          <Text className="text-xs text-[#6B7280] mt-1 block">{q.hint}</Text>

          <View className="mt-5 flex flex-col gap-3">
            {q.options.map((opt, idx) => {
              const active = selected === idx
              return (
                <View
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className="rounded-2xl px-4 py-3.5"
                  style={{
                    background: active ? '#DB2777' : '#fff',
                    borderWidth: 1,
                    borderColor: active ? '#DB2777' : '#F0E4EA',
                  }}
                >
                  <Text className="text-sm" style={{ color: active ? '#fff' : '#374151' }}>
                    {opt.label}
                  </Text>
                </View>
              )
            })}
          </View>

          {currentQ > 0 && (
            <Button onClick={goPrev} className="mt-5 rounded-full" style={{ background: '#fff', color: '#DB2777', borderWidth: 1, borderColor: '#F3D9E6' }}>
              上一题
            </Button>
          )}
        </View>
      )}

      {/* ===== 步骤三：结果 + 推荐 ===== */}
      {step === 'result' && primary && (
        <View>
          {/* 结果卡 */}
          <View className="rounded-3xl p-5" style={{ background: primary.colorLight }}>
            <Text className="text-xs text-[#6B7280]">你的食养偏好倾向</Text>
            <View className="mt-1 flex items-center gap-2">
              <Text className="text-3xl">{primary.emoji}</Text>
              <Text className="text-2xl font-bold" style={{ color: primary.color }}>
                {primary.name}
              </Text>
            </View>
            <Text className="text-sm text-[#374151] mt-2 block" style={{ lineHeight: 1.7 }}>
              {primary.description}
            </Text>

            <View className="mt-3 flex flex-wrap gap-2">
              {primary.characteristics.map((c) => (
                <View key={c} className="rounded-full bg-white/70 px-3 py-1">
                  <Text className="text-xs text-[#4B5563]">{c}</Text>
                </View>
              ))}
            </View>

            {result?.secondary && (
              <View className="mt-3">
                <Text className="text-xs text-[#9CA3AF]">兼顾倾向</Text>
                <View className="mt-1 flex items-center gap-1.5">
                  <Text className="text-lg">{result.secondary.emoji}</Text>
                  <Text className="text-sm font-semibold" style={{ color: result.secondary.color }}>
                    {result.secondary.name}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* 宜忌性味 */}
          <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#1A1A1A]">食性宜忌参考</Text>
            <View className="mt-2 flex flex-wrap gap-2">
              {primary.recommendNature.length > 0 && (
                <View className="rounded-full bg-[#ECFDF3] px-3 py-1">
                  <Text className="text-xs text-[#16A34A]">宜 · {primary.recommendNature.join(' / ')}</Text>
                </View>
              )}
              {primary.avoidNature.length > 0 && (
                <View className="rounded-full bg-[#FEF2F2] px-3 py-1">
                  <Text className="text-xs text-[#DC2626]">慎 · {primary.avoidNature.join(' / ')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* 推荐商品 */}
          <View className="mt-5">
            <Text className="text-base font-bold text-[#1A1A1A]">为你挑的 · 适配好物</Text>
            {loadingRecs ? (
              <Text className="text-sm text-[#9CA3AF] mt-3 block">匹配中…</Text>
            ) : good.length === 0 ? (
              <Text className="text-sm text-[#9CA3AF] mt-3 block">暂无匹配商品，换个时间再来看看</Text>
            ) : (
              <ScrollView scrollX className="mt-3 whitespace-nowrap">
                <View className="flex flex-row gap-3">
                  {good.map((p) => (
                    <View
                      key={p.id}
                      className="inline-flex w-32 flex-col rounded-2xl bg-white p-2.5 shadow-sm"
                      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                    >
                      {p.image_url ? (
                        <Image src={p.image_url} className="h-20 w-full rounded-xl" mode="aspectFill" />
                      ) : (
                        <View className="h-20 w-full rounded-xl bg-[#F3F4F6]" />
                      )}
                      <Text className="text-xs text-[#1A1A1A] mt-1.5 line-clamp-1" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <View className="mt-1 flex items-center justify-between">
                        <Text className="text-sm font-bold text-[#DB2777]">¥{p.price}</Text>
                        {p.overall_nature ? (
                          <Text className="text-[10px] text-[#9CA3AF]">{p.overall_nature}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* 谨慎提示 */}
          {caution.length > 0 && (
            <View className="mt-4 rounded-2xl bg-[#FFF7ED] p-4" style={{ borderWidth: 1, borderColor: '#FED7AA' }}>
              <Text className="text-sm font-bold text-[#C2410C]">少量慎选 · {caution.length} 件</Text>
              <Text className="text-xs text-[#9A3412] mt-1 block">
                以下商品性味偏「慎」，按你的偏好建议少量或偶尔食用。
              </Text>
              <View className="mt-2 flex flex-col gap-1">
                {caution.map((p) => (
                  <Text key={p.id} className="text-xs text-[#7C2D12]">· {p.name}</Text>
                ))}
              </View>
            </View>
          )}

          {/* 免责 */}
          <View className="mt-4 rounded-2xl bg-[#FFFBF7] p-4" style={{ borderWidth: 1, borderColor: '#F3D9E6' }}>
            <Text className="text-[11px] text-[#9CA3AF] leading-relaxed block">
              {FOOD_THERAPY_DISCLAIMER}
            </Text>
          </View>

          {/* 安全偏好：过敏成分（选填，覆盖原「我的体质档案」的过敏原采集，保留扫码强预警） */}
          <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#1A1A1A]">安全偏好 · 过敏成分</Text>
            <Text className="text-xs text-[#6B7280] mt-1 block" style={{ lineHeight: 1.6 }}>
              选填。设置后扫配料表时，命中你过敏的成分会强提醒，帮你避开风险。
            </Text>
            <View className="mt-3 flex flex-row flex-wrap" style={{ gap: 8 }}>
              {ALLERGY_OPTIONS.map((a) => {
                const active = allergies.includes(a.key)
                const high = a.severity === 'high'
                return (
                  <View
                    key={a.key}
                    onClick={() =>
                      setAllergies((prev) =>
                        prev.includes(a.key) ? prev.filter((x) => x !== a.key) : [...prev, a.key],
                      )
                    }
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      background: active ? (high ? '#FEE2E2' : '#DB2777') : '#F3F4F6',
                      borderWidth: 1,
                      borderColor: active ? (high ? '#DC2626' : '#DB2777') : '#E5E7EB',
                    }}
                  >
                    <Text
                      className="text-xs"
                      style={{ color: active ? (high ? '#DC2626' : '#fff') : '#374151' }}
                    >
                      {a.name}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

          {/* 操作 */}
          <View className="mt-5 flex flex-col gap-3">
            <Button
              onClick={handleSave}
              loading={saving}
              className="rounded-full"
              style={{ background: saved ? '#9CA3AF' : '#DB2777', color: '#fff' }}
            >
              {saved ? '✓ 已保存到我的偏好' : '保存到我的偏好'}
            </Button>
            <Button
              onClick={restart}
              className="rounded-full"
              style={{ background: '#fff', color: '#DB2777', borderWidth: 1, borderColor: '#F3D9E6' }}
            >
              重新测试
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
