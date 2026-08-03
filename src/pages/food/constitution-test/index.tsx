// 食养偏好设置 —— 页面层
// 流程：intro(说明+免责) → quiz(5题逐题) → result(结果卡 + 推荐商品)
// 逻辑层复用 src/utils/constitution-test.ts：TEST_QUESTIONS / calculateResult / filterProductsByConstitution
// 存档：结果写回 profiles.constitution_tags，由 FoodTherapyContext 自动注入全站个性化推荐。
//
// 合规框架：本页是「食养偏好参考」而非医疗诊断。用户可见文案统一为「偏好/倾向」，
// 全程展示 FOOD_THERAPY_DISCLAIMER，符合项目 P2 去医疗化红线。

import { useState } from 'react'
import { View, Text, Button, ScrollView, Image } from '@tarojs/components'
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro'
import {
  TEST_QUESTIONS,
  calculateResult,
  filterProductsByConstitution,
  constitutionToCrowds,
  recommendStageProducts,
  CONSTITUTION_TYPES,
  type TestResult,
  type ConstitutionType,
} from '@/utils/constitution-test'
import { buildHealthShortfalls } from '@/utils/food-therapy/health-shortfall'
import { STAGE_META, type ShiyangStage } from '@/utils/food-therapy/shiyang-stage'
import { getProducts, updateProfile } from '@/db/api'
import { getLocalUser } from '@/client/supabase'
import { upsertUserHealthProfile, saveConstitutionResult } from '@/db/food-api'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { Product } from '@/db/types'
import './index.scss'

type Step = 'intro' | 'quiz' | 'result'

/** 海报一句洞察：让分享更有「人味」，而非冷冰冰的体质名 */
const POSTER_INSIGHT: Record<string, string> = {
  yangxu: '怕冷不是娇气，是身体在提醒你：该暖一点了。',
  yinxu: '容易上火，是因为身体想要一点润泽。',
  qixu: '总觉乏力，是「气」在提醒你该补一补了。',
  tanshi: '身子沉重，是湿悄悄住下了，该清一清。',
  shire: '油光痘痘，是热在身体里待得太久。',
  xueyu: '瘀青易留，是血在说它流得有点慢了。',
  qiyu: '情绪起伏，是气在身体里打了个结。',
  pinghe: '状态不错，好好吃饭就是对身体最好的照顾。',
}

export default function ConstitutionTestPage() {
  const [step, setStep] = useState<Step>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>(() => TEST_QUESTIONS.map(() => -1))
  const [result, setResult] = useState<TestResult | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [good, setGood] = useState<Product[]>([])
  const [caution, setCaution] = useState<Product[]>([])
  const [stageRecs, setStageRecs] = useState<Product[]>([])
  const [stage, setStage] = useState<ShiyangStage | null>(null)
  const [loadingRecs, setLoadingRecs] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
      const st = res.primary.recommendStage
      const goodIds = new Set(g.map((p) => p.id))
      // 按「清通调补固」调理路径深一层配对，排除已入选性味适配的，避免撞车
      const stageR = recommendStageProducts(all, st, 6, goodIds)
      setProducts(all)
      setGood(g.slice(0, 6))
      setCaution(c.slice(0, 3))
      setStage(st)
      setStageRecs(stageR)
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
    setStageRecs([])
    setStage(null)
    setSaved(false)
    setStep('intro')
  }

  const handleSave = async () => {
    const { data: { user } } = await getLocalUser()
    if (!user?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!result) return
    setSaving(true)
    try {
      // 偏好标签：体质 key + 身体状态标签（首页/食疗引擎按 key 直接命中，更精准）
      const tags = [result.primary.key, ...constitutionToCrowds(result.primary)]
      await updateProfile({ constitution_tags: tags })
      // 全量结果落库（分数+答案+主/次体质），支撑「为什么是你」回放与复测
      const saved = await saveConstitutionResult({
        primaryKey: result.primary.key,
        secondaryKey: result.secondary?.key ?? null,
        scores: result.scores,
        answers,
      })
      if (!saved) console.warn('[constitution-test] 全量结果落库失败（不阻断）')
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
  const shortfalls = result ? buildHealthShortfalls([result.primary.key], []) : []

  // 体质得分排行（仅取有分的偏颇质，降序取前 4）
  const scoreEntries: [string, number][] = result
    ? Object.entries(result.scores)
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : []
  const maxScore = scoreEntries.length > 0 ? scoreEntries[0][1] : 0

  // 原生分享：标题带出「我是 XX 质」，引导好友也来测（hook 注册即启用右上「转发」）
  const shareTitle = result
    ? `我是${result.primary.emoji}${result.primary.name}，你呢？来测测你的食养偏好～`
    : '测测你的食养偏好，挑好物更对味～'
  useShareAppMessage(() => ({ title: shareTitle, path: '/pages/food/constitution-test/index' }))
  useShareTimeline(() => ({ title: shareTitle }))
  useDidShow(() => {
    Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
  })

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5 pb-16">
      {/* ===== 顶部标题 ===== */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-[#1A1A1A]">🧪 食养偏好设置</Text>
        <Text className="text-xs text-[#6B7280] mt-1 block">
          几步选择，了解你的口味与食性偏好，挑好物更对味
        </Text>
      </View>

      {/* ===== 步骤一：说明 ===== */}
      {step === 'intro' && (
        <View>
          <View className="rounded-2xl bg-white p-5 shadow-sm">
            <Text className="text-base font-bold text-[#1A1A1A]">这是什么</Text>
            <Text className="text-sm text-[#374151] mt-2 block" style={{ lineHeight: 1.8 }}>
              根据你近期的身体感受，用几步简单选择，给出你的「食养偏好倾向」——
              偏温还是偏凉、适合哪些性味的好物。结果仅作食养参考，帮你更快挑到合适的吃食。
            </Text>
            <View className="mt-3 flex flex-wrap gap-2">
              {['约 1 分钟', '无需登录也能设', '可保存到偏好'].map((t) => (
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
            开始设置
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
            第 {currentQ + 1} / {total} 步
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
              上一步
            </Button>
          )}
        </View>
      )}

      {/* ===== 步骤三：结果（揭晓 → 为什么是你 → 今天做） ===== */}
      {step === 'result' && primary && (
        <View>
          {/* —— 揭晓 —— */}
          <View className="ct-reveal rounded-3xl p-5" style={{ background: primary.colorLight }}>
            <Text className="text-xs text-[#6B7280]">你的食养偏好倾向</Text>
            <View className="mt-1 flex items-center gap-2">
              <Text className="ct-emoji-breathe text-3xl">{primary.emoji}</Text>
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

          {/* —— 为什么是你 —— */}
          <View className="ct-reveal ct-stagger-1 mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#1A1A1A]">为什么是你</Text>
            <Text className="text-xs text-[#6B7280] mt-1 block">
              你的 5 个选择，是这样指向「{primary.name}」的
            </Text>

            {/* 得分条 */}
            {scoreEntries.length > 0 ? (
              <View className="mt-3 flex flex-col gap-2.5">
                {scoreEntries.map(([key, score]) => {
                  const t = CONSTITUTION_TYPES[key]
                  const pct = maxScore > 0 ? Math.max(8, Math.round((score / maxScore) * 100)) : 0
                  const isPrimary = key === primary.key
                  return (
                    <View key={key}>
                      <View className="flex items-center justify-between">
                        <View className="flex items-center gap-1">
                          <Text className="text-sm">{t.emoji}</Text>
                          <Text
                            className="text-xs"
                            style={{ color: isPrimary ? primary.color : '#6B7280', fontWeight: isPrimary ? '700' : '400' }}
                          >
                            {t.name}
                          </Text>
                        </View>
                        <Text className="text-xs text-[#9CA3AF]">{score} 分</Text>
                      </View>
                      <View className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
                        <View
                          className="ct-score-bar h-2 rounded-full"
                          style={{ width: `${pct}%`, background: isPrimary ? primary.color : '#E5E7EB' }}
                        />
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' }}>
                <Text className="text-xs text-[#16A34A]" style={{ lineHeight: 1.6 }}>
                  你的各项偏颇信号都很弱、整体状态均衡 —— 这恰恰是「{primary.name}」的样子。
                </Text>
              </View>
            )}

            {/* 答案回放 */}
            <View className="mt-4 flex flex-col gap-2.5">
              {TEST_QUESTIONS.map((qq, qi) => {
                const opt = qq.options[answers[qi]]
                const effectEntries = Object.entries(opt?.effect ?? {})
                return (
                  <View
                    key={qq.id}
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: '#FFFBF7', borderWidth: 1, borderColor: '#F3D9E6' }}
                  >
                    <Text className="text-[11px] text-[#9CA3AF]">第 {qi + 1} 题 · {qq.question}</Text>
                    <Text className="text-sm text-[#1A1A1A] mt-1 block font-semibold">{opt?.label}</Text>
                    {effectEntries.length > 0 ? (
                      <View className="mt-1.5 flex flex-wrap gap-1.5">
                        {effectEntries.map(([k, pts]) => {
                          const ct = CONSTITUTION_TYPES[k]
                          return (
                            <View key={k} className="rounded-full px-2 py-0.5" style={{ background: ct.colorLight }}>
                              <Text className="text-[10px]" style={{ color: ct.color }}>
                                {ct.emoji} {ct.name} +{pts}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    ) : (
                      <Text className="text-[11px] text-[#9CA3AF] mt-1 block">· 中性状态，不偏向特定体质</Text>
                    )}
                  </View>
                )
              })}
            </View>
          </View>

          {/* —— 今天做 —— */}
          <View className="ct-reveal ct-stagger-2 mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#1A1A1A]">今天可以做</Text>
            <Text className="text-xs text-[#6B7280] mt-1 block">顺着你的偏好，今天就这么吃</Text>

            {/* 宜忌性味 */}
            <View className="mt-3 flex flex-wrap gap-2">
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

            {/* 你的健康短板 */}
            {shortfalls.length > 0 && (
              <View className="mt-3 flex flex-col gap-2">
                {shortfalls.map((s) => (
                  <View
                    key={s.key}
                    className="rounded-xl px-3 py-2"
                    style={{ background: s.severity === 'low' ? '#F0FDF4' : '#FFFBF7', borderWidth: 1, borderColor: '#F3D9E6' }}
                  >
                    <View className="flex items-center gap-1.5">
                      <Text className="text-base">{s.emoji}</Text>
                      <Text className="text-sm font-semibold text-[#1A1A1A]">{s.label}</Text>
                    </View>
                    <Text className="text-xs text-[#6B7280] mt-1 block" style={{ lineHeight: 1.6 }}>{s.desc}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 推荐商品 */}
          <View className="ct-reveal ct-stagger-3 mt-5">
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

          {/* 按调理路径：清通调补固阶段配对（复用详情页阶段引擎，与性味适配互补） */}
          {stage && stageRecs.length > 0 && (
            <View className="ct-reveal ct-stagger-3 mt-5">
              <Text className="text-base font-bold text-[#1A1A1A]">
                按调理路径 · 你的「{STAGE_META[stage].label}」好物
              </Text>
              <Text className="text-xs text-[#6B7280] mt-1 block" style={{ lineHeight: 1.6 }}>
                你的食养偏好偏「{primary.name}」，适合从「{STAGE_META[stage].label}·{STAGE_META[stage].coreTag}」入手调理。以下为契合该路径的专属好物。
              </Text>
              <ScrollView scrollX className="mt-3 whitespace-nowrap">
                <View className="flex flex-row gap-3">
                  {stageRecs.map((p) => (
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
                        {p.food_stage ? (
                          <Text className="text-[10px] text-[#9CA3AF]">{p.food_stage}阶</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* 谨慎提示 */}
          {caution.length > 0 && (
            <View className="ct-reveal ct-stagger-4 mt-4 rounded-2xl bg-[#FFF7ED] p-4" style={{ borderWidth: 1, borderColor: '#FED7AA' }}>
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

          {/* —— 分享海报卡 —— */}
          <View className="ct-reveal ct-stagger-4 mt-5">
            <View className="ct-poster rounded-3xl p-5" style={{ background: `linear-gradient(135deg, ${primary.colorLight}, #ffffff)` }}>
              <View className="flex items-center justify-between">
                <Text className="text-[11px] text-[#9CA3AF]">我的食养偏好</Text>
                <Text className="text-[11px] text-[#9CA3AF]">来电有喜</Text>
              </View>
              <View className="mt-3 flex items-center gap-3">
                <Text className="text-5xl">{primary.emoji}</Text>
                <View>
                  <Text className="text-2xl font-bold" style={{ color: primary.color }}>{primary.name}</Text>
                  <Text className="text-xs text-[#6B7280] mt-0.5 block">{primary.recommendNature.join(' / ')} 性味更合适</Text>
                </View>
              </View>
              <Text className="text-sm text-[#374151] mt-3 block" style={{ lineHeight: 1.7 }}>
                {POSTER_INSIGHT[primary.key] ?? primary.description}
              </Text>
              <View className="mt-3 flex flex-wrap gap-1.5">
                {primary.characteristics.slice(0, 3).map((c) => (
                  <View key={c} className="rounded-full bg-white/70 px-2.5 py-0.5">
                    <Text className="text-[11px] text-[#4B5563]">{c}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Button openType="share" className="mt-3 rounded-full" style={{ background: primary.color, color: '#fff' }}>
              分享给好友 · 测测你的偏好
            </Button>
          </View>

          {/* 免责 */}
          <View className="ct-reveal ct-stagger-5 mt-4 rounded-2xl bg-[#FFFBF7] p-4" style={{ borderWidth: 1, borderColor: '#F3D9E6' }}>
            <Text className="text-[11px] text-[#9CA3AF] leading-relaxed block">
              {FOOD_THERAPY_DISCLAIMER}
            </Text>
          </View>

          {/* 操作 */}
          <View className="ct-reveal ct-stagger-5 mt-5 flex flex-col gap-3">
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
              重新设置
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
