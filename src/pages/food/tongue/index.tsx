// 舌象自检 · 非 AI（纯规则引导对照）
// ------------------------------------------------------------
// 入口：食养首页「舌象自检」卡片
// 流程：intro(说明 + 免责) → quiz(5 项望舌引导对照) → result(体质倾向 + 宜忌 + 拍照给真人顾问)
// 逻辑层：src/utils/food-therapy/tongue-rules.ts（TONGUE_QUESTIONS / calculateTongueResult）
// 合规：全程「食养参考 / 倾向」，不出现诊断/辨证/医疗词；结果页必展示 FOOD_THERAPY_DISCLAIMER。
// 拍照：仅用于「发给食养顾问真人研判」，绝不经 AI 识图（去 AI 铁律）。

import { useState, useRef, useEffect } from 'react'
import { View, Text, Button, ScrollView, Image } from '@tarojs/components'
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro'
import {
  TONGUE_QUESTIONS,
  calculateTongueResult,
  type TongueResult,
} from '@/utils/food-therapy/tongue-rules'
import { CONSTITUTION_TYPES } from '@/utils/constitution-test'
import { filterProductsByConstitution } from '@/utils/constitution-test'
import { getProducts } from '@/db/api'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { Product } from '@/db/types'
import './index.scss'

type Step = 'intro' | 'quiz' | 'result'

export default function TonguePage() {
  const [step, setStep] = useState<Step>('intro')
  const stepRef = useRef<Step>('intro')
  useEffect(() => {
    stepRef.current = step
  }, [step])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>(() => TONGUE_QUESTIONS.map(() => -1))
  const [result, setResult] = useState<TongueResult | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [good, setGood] = useState<Product[]>([])
  const [caution, setCaution] = useState<Product[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)

  // 拍照留档：仅本地预览，用于发给食养顾问真人研判，不经 AI
  const [photoPath, setPhotoPath] = useState('')

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

    const res = calculateTongueResult(next)
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
    setStep('intro')
  }

  // 打开拍摄引导页（虚线舌形对齐 + 前后置切换 + 拍照/相册/示例）
  // 该页只负责「拍得更好」，照片仅本地留档，不经 AI
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
    // 从拍摄引导页返回：回填照片（仅本地留档，不经 AI）；并按衔接标志顺滑接续勾选 → 自动辨证
    try {
      const p = Taro.getStorageSync('tongue:photo')
      if (p) {
        setPhotoPath(p)
        Taro.removeStorageSync('tongue:photo')
      }
      const after = Taro.getStorageSync('tongue:afterPhoto')
      if (after === 'quiz') {
        Taro.removeStorageSync('tongue:afterPhoto')
        // 尚未完成辨证（intro）时直接进勾选，拍照后顺滑接续自动辨证；已完成（result）则仅留档照片
        if (stepRef.current === 'intro') {
          setAnswers(TONGUE_QUESTIONS.map(() => -1))
          setCurrentQ(0)
          setResult(null)
          setGood([])
          setCaution([])
          setStep('quiz')
        }
      }
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
          照着引导对照舌象，了解你的食养倾向，挑好物更对路
        </Text>
      </View>

      {/* 说明 */}
      {step === 'intro' && (
        <View>
          <View className="rounded-2xl bg-white p-5 shadow-sm">
            <Text className="text-base font-bold text-[#2A2A2A]">怎么用</Text>
            <Text className="text-sm text-[#3F3A34] mt-2 block" style={{ lineHeight: 1.8 }}>
              在自然光下，照着 5 个引导问题观察自己的舌头（颜色、苔色、厚薄、齿痕、润燥），
              逐项勾选即可。系统按传统饮食常识给出你的「食养倾向」，帮你挑更对味的吃食。
            </Text>
            <View className="mt-3 flex flex-wrap gap-2">
              {['约 1 分钟', '无需登录', '纯本地规则'].map((t) => (
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
            onClick={() => { setCurrentQ(0); setStep('quiz') }}
            className="mt-5 rounded-full"
            style={{ background: 'hsl(var(--primary))', color: '#fff' }}
          >
            开始自检
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

          {/* 为什么这样提示 */}
          <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#2A2A2A]">为什么这样提示</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block">你勾选的舌象特征，指向了以上倾向</Text>

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
                <View className="rounded-full bg-[#ECFDF3] px-3 py-1">
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

          {/* 拍照给真人顾问（非 AI） */}
          <View className="mt-4 rounded-2xl bg-[#FBF7EF] p-4" style={{ borderWidth: 1, borderColor: '#ECE6DD' }}>
            <Text className="text-sm font-bold text-[#2A2A2A]">想让真人看看？</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block" style={{ lineHeight: 1.6 }}>
              本功能不靠 AI 识图。你可拍一张舌部照片留档，再把照片发给「食养顾问」真人，由人工帮你研判参考。
            </Text>
            {photoPath ? (
              <Image src={photoPath} className="mt-3 h-28 w-28 rounded-xl" mode="aspectFill" />
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
                  {good.map((p) => (
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
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* 慎选提示 */}
          {caution.length > 0 && (
            <View className="mt-4 rounded-2xl bg-[#FFF7ED] p-4" style={{ borderWidth: 1, borderColor: '#FED7AA' }}>
              <Text className="text-sm font-bold text-[#B45309]">少量慎选 · {caution.length} 件</Text>
              <Text className="text-xs text-[#B45309] mt-1 block">以下商品性味偏「慎」，按你的倾向建议少量或偶尔食用。</Text>
              <View className="mt-2 flex flex-col gap-1">
                {caution.map((p) => (
                  <Text key={p.id} className="text-xs text-[#B45309]">· {p.name}</Text>
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
