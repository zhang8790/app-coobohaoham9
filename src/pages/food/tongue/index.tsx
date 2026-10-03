// 舌象自检 · 望舌辨证引擎（本地规则算法，界面不出现「AI」二字）
// ------------------------------------------------------------
// 入口：食养首页「舌象自检」卡片 / 首页「舌象自检」入口
// 纯本地主流程（零云、离线可用）：intro(说明 + 免责)
//   → 拍照留档（舌面 + 舌下，仅本地）或 直接逐项对照
//   → quiz（8 维舌象特征逐项对照，看自己的照片勾选即可）
//   → result（本地 v2 规则引擎出体质倾向 + 宜忌 + 好物）
// 拍照仅本地留档 + 供「食养顾问」真人研判，不参与任何云端视觉识别。
// 逻辑层：src/utils/food-therapy/tongue-rules.ts（TONGUE_QUESTIONS）
//          + 进阶辨证 v2：src/utils/food-therapy/tongue-engine-v2.ts（analyzeTongue，证据链+交互项+置信度）
//          体质↔商品：src/utils/constitution-test.ts（recommendNature/avoidNature/bodyStates/healthGoals）
// 合规：全程「食养参考 / 倾向」，不出现诊断/辨证/医疗词，亦不出现「AI」字样；结果页必展示 FOOD_THERAPY_DISCLAIMER。

import { useState } from 'react'
import { View, Text, Button, ScrollView, Image } from '@tarojs/components'
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro'
import {
  TONGUE_QUESTIONS,
  type TongueResult,
} from '@/utils/food-therapy/tongue-rules'
import {
  CONSTITUTION_TYPES,
  type ConstitutionType,
} from '@/utils/constitution-test'
import { analyzeTongue } from '@/utils/food-therapy/tongue-engine-v2'
import { buildProductMatch, type MatchedProduct } from '@/utils/food-therapy/product-match'
import TongueReport from '@/components/food/TongueReport'
import { getProducts } from '@/db/api'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { Product } from '@/db/types'
import './index.scss'

type Step = 'intro' | 'quiz' | 'result'

// 商品匹配（维度 ↔ 体质）已抽到 @/utils/food-therapy/product-match.ts（与「食养画像」页共用）

/** 食养闭环串联条：把 问卷 → 维度 → 舌诊 → 体质 → 商品 一屏可视化 */
function ChainStrip({ answers, primary }: { answers: number[]; primary: ConstitutionType }) {
  const answered = answers.filter((a) => a >= 0).length
  const informative = answers.filter((a) => a > 0).length
  const steps: { t: string; s: string; hot?: boolean }[] = [
    { t: '问卷对照', s: `${answered} 维填写` },
    { t: '舌象维度', s: `${informative} 维有指向` },
    { t: '舌诊辨证', s: 'v2 进阶引擎' },
    { t: primary.name, s: '你的体质', hot: true },
    { t: '适配好物', s: '性味/人群' },
  ]
  return (
    <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <Text className="text-sm font-bold text-[#2A2A2A]">食养闭环 · 一键串联</Text>
      <Text className="text-xs text-[#6F675C] mt-1 block">
        问卷（8 维）→ 舌象分析 → 体质判定 → 为你匹配的商品
      </Text>
      <View className="mt-3 flex flex-row items-stretch">
        {steps.flatMap((s, i) => {
          const node = (
            <View
              key={`n${i}`}
              className="flex-1 rounded-xl px-1.5 py-2"
              style={{ background: s.hot ? primary.colorLight : '#F7F3E9' }}
            >
              <Text
                className="text-xs font-bold text-center block"
                style={{ color: s.hot ? primary.color : '#3F3A34' }}
              >
                {s.t}
              </Text>
              <Text className="text-[10px] text-[#9A9388] text-center block mt-0.5">{s.s}</Text>
            </View>
          )
          const arrow = i < steps.length - 1 ? (
            <Text key={`a${i}`} style={{ alignSelf: 'center', color: '#C9C0B4', fontSize: 14, paddingHorizontal: 2 }}>
              ›
            </Text>
          ) : null
          return arrow ? [node, arrow] : [node]
        })}
      </View>
    </View>
  )
}

export default function TonguePage() {
  const [step, setStep] = useState<Step>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>(() => TONGUE_QUESTIONS.map(() => -1))
  const [result, setResult] = useState<TongueResult | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [good, setGood] = useState<MatchedProduct[]>([])
  const [caution, setCaution] = useState<MatchedProduct[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)

  // 拍照留档：本地预览用于对照自检 + 发给食养顾问真人研判（仅本地，不联网识别）
  // photoPath = 舌面（正面），photoBack = 舌下（反面）
  const [photoPath, setPhotoPath] = useState('')
  const [photoBack, setPhotoBack] = useState('')
  // 是否依据照片做逐项对照（界面标注用，不出现「AI」）
  const [photoBased, setPhotoBased] = useState(false)

  const total = TONGUE_QUESTIONS.length
  const q = TONGUE_QUESTIONS[currentQ]
  const selected = answers[currentQ]

  const handleSelect = async (optIdx: number) => {
    const next = [...answers]
    next[currentQ] = optIdx
    setAnswers(next)

    if (currentQ < total - 1) {
      setCurrentQ(currentQ + 1)
      return
    }

    const res = analyzeTongue(next, { source: 'manual' })
    setResult(res)
    setStep('result')
    setLoadingRecs(true)
    try {
      const all = await getProducts({ limit: 40 })
      const { good: g, caution: c } = buildProductMatch(all, res)
      setProducts(all)
      setGood(g.slice(0, 6))
      setCaution(c.slice(0, 3))
    } catch (e) {
      console.error('[tongue] 商品匹配失败', e)
    } finally {
      setLoadingRecs(false)
    }
  }

  const goPrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1)
  }

  const restart = () => {
    setAnswers(TONGUE_QUESTIONS.map(() => -1))
    setCurrentQ(0)
    setResult(null)
    setGood([])
    setCaution([])
    setPhotoPath('')
    setPhotoBack('')
    setPhotoBased(false)
    setStep('intro')
  }

  // 打开拍摄引导页（虚线舌形对齐 + 前后置切换 + 拍照/相册/示例）
  // 拍照仅本地留档（舌面 + 舌下），返回后逐项对照自检，不联网识别
  const openCameraGuide = () => {
    Taro.navigateTo({ url: '/pages/food/tongue-camera/index' }).catch(() => {
      // 兜底：直接调系统相机
      Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['camera'] })
        .then((res: any) => {
          if (res?.tempFilePaths?.length) setPhotoPath(res.tempFilePaths[0])
        })
        .catch(() => {/* 用户取消，忽略 */})
    })
  }

  const primary = result?.primary ?? null
  const scoreEntries: [string, number][] = result
    ? Object.entries(result.scores)
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : []
  const maxScore = scoreEntries.length > 0 ? scoreEntries[0][1] : 0

  useShareAppMessage(() => ({
    title: '舌象自检 · 看看你的食养倾向',
    path: '/pages/food/tongue/index',
  }))
  useShareTimeline(() => ({ title: '舌象自检 · 看看你的食养倾向' }))
  useDidShow(() => {
    Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
    try {
      // 拍照留档返回：本地读取舌面（正面）+ 舌下（反面）两张，跳到逐项对照自检。
      // 纯本地、不联网、不经任何视觉识别 —— 用户看自己的照片逐项勾选 8 维舌象特征。
      const captured = Taro.getStorageSync('tongue:captured')
      if (captured) {
        try {
          const { front, back } = JSON.parse(captured)
          // 解析成功后再删除留档，避免异常数据静默丢失照片
          Taro.removeStorageSync('tongue:captured')
          if (typeof front === 'string') setPhotoPath(front)
          if (typeof back === 'string') setPhotoBack(back)
          setPhotoBased(true)
          // 进入逐项对照（清空旧答案，从第一题开始）
          setAnswers(TONGUE_QUESTIONS.map(() => -1))
          setCurrentQ(0)
          setResult(null)
          setGood([])
          setCaution([])
          setStep('quiz')
          return
        } catch (e) {
          /* 解析异常忽略 */
        }
      }

      // 兜底：历史遗留的拍照留档本地路径（结果页预览 / 发给真人顾问）
      const p = Taro.getStorageSync('tongue:photo')
      if (p) {
        setPhotoPath(p)
        Taro.removeStorageSync('tongue:photo')
      }
      Taro.removeStorageSync('tongue:afterPhoto')
    } catch (e) {
      /* ignore */
    }
  })

  return (
    <View className="min-h-screen bg-[#F7F3E9] px-4 pt-5 pb-16">
      {/* 顶部标题 */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-[#2A2A2A]"> 舌象自检</Text>
        <Text className="text-xs text-[#6F675C] mt-1 block">
          先拍舌面（正面）与舌下（反面）两张留档，再逐项对照 8 项舌象特征，本地算法即时给出你的食养倾向
        </Text>
      </View>

      {/* 说明 */}
      {step === 'intro' && (
        <View>
          <View className="rounded-2xl bg-white p-5 shadow-sm">
            <Text className="text-base font-bold text-[#2A2A2A]">怎么用</Text>
            <Text className="text-sm text-[#3F3A34] mt-2 block" style={{ lineHeight: 1.8 }}>
              在自然光下依次拍舌面（正面）与舌下（反面）两张照片留档，然后逐项对照 8 项舌象特征
              （看着自己的照片勾选即可），本地算法即时给出你的「食养倾向」，帮你挑更对味的吃食。
            </Text>
            <Text className="text-xs text-[#9A9388] mt-2 block" style={{ lineHeight: 1.6 }}>
              照片仅本地留档，不经任何网络识别，不对外公开展示。
            </Text>
            <View className="mt-3 flex flex-wrap gap-2">
              {['约 1 分钟', '无需登录', '仅作食养参考'].map((t) => (
                <View key={t} className="rounded-full bg-[hsl(var(--primary) / 0.08)] px-3 py-1">
                  <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>{t}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="mt-4 rounded-2xl bg-[#FBF7EF] p-4" style={{ borderWidth: 1, borderColor: '#ECE6DD' }}>
            <Text className="text-[11px] text-muted-foreground leading-relaxed block">
              {FOOD_THERAPY_DISCLAIMER}
            </Text>
          </View>

          <Button
            onClick={openCameraGuide}
            className="mt-5 rounded-full"
            style={{ background: 'hsl(var(--primary))', color: '#fff' }}
          >
            拍照 + 对照自检
          </Button>

          <Button
            onClick={() => {
              setPhotoBased(false)
              setAnswers(TONGUE_QUESTIONS.map(() => -1))
              setCurrentQ(0)
              setResult(null)
              setGood([])
              setCaution([])
              setStep('quiz')
            }}
            className="mt-3 rounded-full"
            style={{ background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
          >
            不拍照，直接逐项对照
          </Button>
        </View>
      )}

      {/* 逐题对照 */}
      {step === 'quiz' && q && (
        <View>
          <View className="mb-4 flex items-center gap-2">
            {TONGUE_QUESTIONS.map((_, i) => (
              <View
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: i <= currentQ ? 'hsl(var(--primary))' : '#ECE6DD' }}
              />
            ))}
          </View>
          <Text className="text-xs text-muted-foreground">第 {currentQ + 1} / {total} 步</Text>
          <Text className="text-lg font-bold text-[#2A2A2A] mt-1 block">{q.question}</Text>
          <Text className="text-xs text-[#6F675C] mt-1 block">{q.tip}</Text>

          <View className="mt-5 flex flex-col gap-3">
            {q.options.map((opt, idx) => {
              const active = selected === idx
              return (
                <View
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className="rounded-2xl px-4 py-3.5"
                  style={{
                    background: active ? 'hsl(var(--primary))' : '#fff',
                    borderWidth: 1,
                    borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.35)',
                  }}
                >
                  <Text className="text-sm" style={{ color: active ? '#fff' : '#3F3A34' }}>
                    {opt.label}
                  </Text>
                  {opt.hint ? (
                    <Text
                      className="text-[11px] mt-0.5 block"
                      style={{ color: active ? 'rgba(255,255,255,0.85)' : '#9A9388' }}
                    >
                      {opt.hint}
                    </Text>
                  ) : null}
                </View>
              )
            })}
          </View>

          {currentQ > 0 && (
            <Button
              onClick={goPrev}
              className="mt-5 rounded-full"
              style={{ background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
            >
              上一步
            </Button>
          )}
        </View>
      )}

      {/* 结果 */}
      {step === 'result' && primary && result && (
        <View>
          {/* 揭晓 */}
          <View className="rounded-3xl p-5" style={{ background: primary.colorLight }}>
            <Text className="text-xs text-[#6F675C]">你的舌象食养倾向</Text>
            <View className="mt-1 flex items-center gap-2">
              <Text className="text-3xl">{primary.emoji}</Text>
              <Text className="text-2xl font-bold" style={{ color: primary.color }}>
                {primary.name}
              </Text>
            </View>
            {photoBased ? (
              <View className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5" style={{ background: 'rgba(22,163,74,0.12)' }}>
                <Text className="text-[10px]" style={{ color: '#15803D' }}>拍照对照 · 本地算法</Text>
              </View>
            ) : null}
            <Text className="text-sm text-[#3F3A34] mt-2 block" style={{ lineHeight: 1.7 }}>
              {primary.description}
            </Text>
            {result.secondary && (
              <View className="mt-3">
                <Text className="text-xs text-muted-foreground">兼顾倾向</Text>
                <View className="mt-1 flex items-center gap-1.5">
                  <Text className="text-lg">{result.secondary.emoji}</Text>
                  <Text className="text-sm font-semibold" style={{ color: result.secondary.color }}>
                    {result.secondary.name}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* 食养闭环 · 一键串联：问卷 → 维度 → 舌象 → 体质 → 商品 */}
          <ChainStrip answers={answers} primary={primary} />

          {/* 食养分析报告：健康状态 / 发生机制 / 关键依据 / 健康指数（v2 进阶算法） */}
          <TongueReport answers={answers} photoBased={photoBased} />

          {/* 为什么这样提示 */}
          <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#2A2A2A]">为什么这样提示</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block">
              你逐项对照填出的舌象特征，经本地算法指向了以上倾向
            </Text>

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
                            style={{ color: isPrimary ? primary.color : '#6F675C', fontWeight: isPrimary ? '700' : '400' }}
                          >
                            {t.name}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted-foreground">{score} 分</Text>
                      </View>
                      <View className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#F4EFE8]">
                        <View className="h-2 rounded-full" style={{ width: `${pct}%`, background: isPrimary ? primary.color : '#ECE6DD' }} />
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' }}>
                <Text className="text-xs text-[#15803D]" style={{ lineHeight: 1.6 }}>
                  你的各项舌象特征都偏中性、整体状态均衡 —— 这恰恰是「{primary.name}」的样子。
                </Text>
              </View>
            )}

            <View className="mt-4 flex flex-col gap-2">
              {result.picked.map((p, i) => (
                <View
                  key={i}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: '#FBF7EF', borderWidth: 1, borderColor: '#ECE6DD' }}
                >
                  <Text className="text-[11px] text-muted-foreground">第 {i + 1} 项 · {p.question}</Text>
                  <Text className="text-sm text-[#2A2A2A] mt-1 block font-semibold">{p.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 宜忌性味 */}
          <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#2A2A2A]">口味上可以这样挑</Text>
            <View className="mt-3 flex flex-wrap gap-2">
              {primary.recommendNature.length > 0 && (
                <View className="rounded-full bg-[#DCFCE7] px-3 py-1">
                  <Text className="text-xs text-[#15803D]">宜 · {primary.recommendNature.join(' / ')}</Text>
                </View>
              )}
              {primary.avoidNature.length > 0 && (
                <View className="rounded-full bg-[#FEF2F2] px-3 py-1">
                  <Text className="text-xs text-[#DC2626]">慎 · {primary.avoidNature.join(' / ')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* 拍照给真人顾问（识别引擎 + 真人双轨） */}
          <View className="mt-4 rounded-2xl bg-[#FBF7EF] p-4" style={{ borderWidth: 1, borderColor: '#ECE6DD' }}>
            <Text className="text-sm font-bold text-[#2A2A2A]">想让真人看看？</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block" style={{ lineHeight: 1.6 }}>
              上方倾向由你逐项对照填出的舌象特征、经本地算法得出，仅供食养参考；如需更细致的人工研判，可把照片发给「食养顾问」真人确认。
            </Text>
            {photoPath ? (
              <View className="mt-3 flex items-center gap-3">
                <View className="flex flex-col items-center">
                  <Image src={photoPath} className="h-24 w-24 rounded-xl" mode="aspectFill" />
                  <Text className="text-[10px] text-[#9A9388] mt-1">舌面（正面）</Text>
                </View>
                {photoBack ? (
                  <View className="flex flex-col items-center">
                    <Image src={photoBack} className="h-24 w-24 rounded-xl" mode="aspectFill" />
                    <Text className="text-[10px] text-[#9A9388] mt-1">舌下（反面）</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View className="mt-3 flex flex-col gap-2">
              <Button
                onClick={openCameraGuide}
                className="rounded-full"
                style={{ background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
              >
                {photoPath ? '重新拍照' : '去拍照留档'}
              </Button>
              <Button openType="contact" className="rounded-full" style={{ background: 'hsl(var(--primary))', color: '#fff' }}>
                发给食养顾问真人研判
              </Button>
            </View>
          </View>

          {/* 适配好物 */}
          <View className="mt-5">
            <Text className="text-base font-bold text-[#2A2A2A]">为你挑的 · 适配好物</Text>
            {loadingRecs ? (
              <Text className="text-sm text-muted-foreground mt-3 block">匹配中…</Text>
            ) : good.length === 0 ? (
              <Text className="text-sm text-muted-foreground mt-3 block">暂无匹配商品，换个时间再来看看</Text>
            ) : (
              <ScrollView scrollX className="mt-3 whitespace-nowrap">
                <View className="flex flex-row gap-3">
                  {good.map(({ p, reasons }) => (
                    <View
                      key={p.id}
                      className="inline-flex w-32 flex-col rounded-2xl bg-white p-2.5 shadow-sm"
                      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                    >
                      {p.image_url ? (
                        <Image src={p.image_url} className="h-20 w-full rounded-xl" mode="aspectFill" />
                      ) : (
                        <View className="h-20 w-full rounded-xl bg-[#F4EFE8]" />
                      )}
                      <Text className="text-xs text-[#2A2A2A] mt-1.5 line-clamp-1" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-sm font-bold text-[hsl(var(--primary))]">¥{p.price}</Text>
                      {reasons[0] ? (
                        <Text className="text-[10px] text-[#9A9388] mt-0.5 line-clamp-2" numberOfLines={2} style={{ lineHeight: 1.4 }}>
                          {reasons[0]}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* 慎选提示 */}
          {caution.length > 0 && (
            <View className="mt-4 rounded-2xl bg-[#FEF3C7] p-4" style={{ borderWidth: 1, borderColor: '#FEF3C7' }}>
              <Text className="text-sm font-bold text-[#B45309]">少量慎选 · {caution.length} 件</Text>
              <Text className="text-xs text-[#B45309] mt-1 block">以下商品性味偏「慎」，按你的倾向建议少量或偶尔食用。</Text>
              <View className="mt-2 flex flex-col gap-1">
                {caution.map(({ p, reasons }) => (
                  <Text key={p.id} className="text-xs text-[#B45309]">
                    · {p.name}{reasons[0] ? `（${reasons[0]}）` : ''}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* 免责 */}
          <View className="mt-4 rounded-2xl bg-[#FBF7EF] p-4" style={{ borderWidth: 1, borderColor: '#ECE6DD' }}>
            <Text className="text-[11px] text-muted-foreground leading-relaxed block">
              {FOOD_THERAPY_DISCLAIMER}
            </Text>
          </View>

          {/* 操作 */}
          <View className="mt-5 flex flex-col gap-3">
            <Button
              onClick={() => Taro.navigateTo({ url: '/pages/food/constitution-test/index' })}
              className="rounded-full"
              style={{ background: 'hsl(var(--primary))', color: '#fff' }}
            >
              去完善食养偏好设置
            </Button>
            <Button
              onClick={restart}
              className="rounded-full"
              style={{ background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
            >
              重新自检
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
