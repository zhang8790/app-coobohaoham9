// 食养评估 · 望舌辨证引擎（本地规则算法，界面不出现「AI」二字）
// ------------------------------------------------------------
// 合并入口：把「食养偏好设置（身体感受·深度 9 题）」与「舌象自检（舌象对照 8 维）」
// 合并为一次评估，先答身体感受，再对照舌象（可拍照留档），双通道各自辨证后交叉校验，
// 合成综合食养倾向 + 宜忌 + 好物。
// 纯本地主流程（零云、离线可用）：intro(说明 + 免责 + 英雄引导)
//   → 拍照留档（舌面 + 舌下，仅本地，可选）或 直接对照
//   → quiz（身体感受·深度 9 题 + 舌象对照 8 维，逐项勾选，自动顺滑推进）
//   → 段落过渡门卡（身体→舌象仪式化切换）
//   → result（双通道交叉校验 → 综合体质倾向 + 宜忌 + 好物，错落揭晓）
// 拍照仅本地留档 + 供「食养顾问」真人研判，不参与任何云端视觉识别。
// 合规：全程「食养参考 / 倾向」，不出现诊断/辨证/医疗词，亦不出现「AI」字样；结果页必展示 FOOD_THERAPY_DISCLAIMER。

import { useState, useEffect } from 'react'
import { View, Text, Button, ScrollView, Image } from '@tarojs/components'
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro'
import {
  DEEP_BODY_QUESTIONS,
  calculateResult,
  constitutionToCrowds,
  CONSTITUTION_TYPES,
  type TestResult,
} from '@/utils/constitution-test'
import {
  TONGUE_QUESTIONS,
} from '@/utils/food-therapy/tongue-rules'
import {
  analyzeTongue,
  combineAssessment,
  buildBodyDimensionNotes,
  type CombinedAssessment,
} from '@/utils/food-therapy/tongue-engine-v2'
import { buildProductMatch, type MatchedProduct } from '@/utils/food-therapy/product-match'
import TongueReport from '@/components/food/TongueReport'
import { getProducts, updateProfile } from '@/db/api'
import { getLocalUser } from '@/client/supabase'
import { saveConstitutionResult } from '@/db/food-api'
import { saveTongueProfile } from '@/utils/food-therapy/tongue-history'
import { computeHealthIndex } from '@/utils/food-therapy/tongue-report'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { Product } from '@/db/types'
import Icon from '@/components/Icon'
import './index.scss'

// 复用内联样式常量（重复字面量提取，行为不变）
const S = {
  cardPrimary: { background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' },
  primaryText: { color: 'hsl(var(--primary))' },
  cardPlain: { background: '#fff', borderWidth: 1, borderColor: '#ECE6DD' },
  primaryFill: { background: 'hsl(var(--primary))', color: '#fff' },
  bgBase: { background: '#F7F3E9' },
  lh16: { lineHeight: 1.6 },
  lh175: { lineHeight: 1.75 },
  greenText: { color: '#15803D' },
  lh17: { lineHeight: 1.7 },
  fs16: { fontSize: 16 },
  borderPlain: { borderWidth: 1, borderColor: '#ECE6DD' },
} as const


type Step = 'intro' | 'quiz' | 'result'

// ── 合并问卷：身体感受 · 深度问诊（9 题）+ 舌象对照（8 维）──
type QSection = 'body' | 'tongue'
interface NormQ {
  section: QSection
  idx: number
  question: string
  sub: string
  options: { label: string; hint?: string }[]
}
const BODY_NORM: NormQ[] = DEEP_BODY_QUESTIONS.map((q, i) => ({
  section: 'body',
  idx: i,
  question: q.question,
  sub: q.hint,
  options: q.options.map((o) => ({ label: o.label, hint: o.hint })),
}))
const TONGUE_NORM: NormQ[] = TONGUE_QUESTIONS.map((q, i) => ({
  section: 'tongue',
  idx: i,
  question: q.question,
  sub: q.tip,
  options: q.options.map((o) => ({ label: o.label, hint: o.hint })),
}))
const MERGED: NormQ[] = [...BODY_NORM, ...TONGUE_NORM]
const BODY_LEN = BODY_NORM.length

// 海报一句洞察（与 constitution-test 同源，统一品牌语气）
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

// 商品匹配（维度 ↔ 体质）已抽到 @/utils/food-therapy/product-match.ts（与「食养画像」页共用）

/** 食养闭环串联条：把 身体感受 → 舌象对照 → 双通道辨证 → 综合体质 → 商品 一屏可视化 */
function ChainStrip({ combined }: { combined: CombinedAssessment }) {
  const steps: { t: string; s: string; hot?: boolean }[] = [
    { t: '身体感受', s: '9 题填写' },
    { t: '舌象对照', s: '8 维填写' },
    { t: '双通道辨证', s: '交叉校验' },
    { t: combined.primary.name, s: '综合体质', hot: true },
    { t: '适配好物', s: '性味/人群' },
  ]
  return (
    <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <Text className="text-sm font-bold text-[#2A2A2A]">食养闭环 · 一键串联</Text>
      <Text className="text-xs text-[#6F675C] mt-1 block">
        身体感受 → 舌象对照 → 双通道辨证 → 综合体质 → 为你匹配的商品
      </Text>
      <View className="mt-3 flex flex-row items-stretch">
        {steps.flatMap((s, i) => {
          const node = (
            <View
              key={`n${i}`}
              className="flex-1 rounded-xl px-1.5 py-2"
              style={{ background: s.hot ? combined.primary.colorLight : '#F7F3E9' }}
            >
              <Text
                className="text-xs font-bold text-center block"
                style={{ color: s.hot ? combined.primary.color : '#3F3A34' }}
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
  const [bodyAnswers, setBodyAnswers] = useState<number[]>(() => DEEP_BODY_QUESTIONS.map(() => -1))
  const [answers, setAnswers] = useState<number[]>(() => TONGUE_QUESTIONS.map(() => -1))
  const [bodyResult, setBodyResult] = useState<TestResult | null>(null)
  const [combined, setCombined] = useState<CombinedAssessment | null>(null)

  // 体验增强：选项轻弹 + 自动顺滑推进 + 段落过渡门卡
  const [justSelected, setJustSelected] = useState<number | null>(null)
  const [sectionGate, setSectionGate] = useState(false)

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

  const total = MERGED.length
  const q = MERGED[currentQ]
  const selected = q ? (q.section === 'body' ? bodyAnswers[q.idx] : answers[q.idx]) : -1
  const locked = justSelected !== null

  // 选答：记录选项 → 轻弹反馈 → 短暂停顿后顺滑推进（末题则双通道计算并进入结果）
  const handleSelect = (optIdx: number) => {
    if (locked) return
    const cur = MERGED[currentQ]
    const isBody = cur.section === 'body'
    const next = isBody ? [...bodyAnswers] : [...answers]
    next[cur.idx] = optIdx
    if (isBody) setBodyAnswers(next)
    else setAnswers(next)
    setJustSelected(optIdx)

    setTimeout(async () => {
      setJustSelected(null)
      const isLastBody = isBody && cur.idx === BODY_LEN - 1
      if (isLastBody) {
        setSectionGate(true)
        return
      }
      if (currentQ < total - 1) {
        setCurrentQ(currentQ + 1)
        return
      }
      // 末题（最后一题舌象）：用更新后的本地数组计算（setState 异步，必须用 next）
      const finalBody = isBody ? next : bodyAnswers
      const finalTongue = isBody ? answers : next
      const bodyRes = calculateResult(finalBody, DEEP_BODY_QUESTIONS)
      const tongueRes = analyzeTongue(finalTongue, { source: 'manual' })
      const comb = combineAssessment(finalBody, finalTongue, DEEP_BODY_QUESTIONS)
      setBodyResult(bodyRes)
      setCombined(comb)
      setStep('result')
      setLoadingRecs(true)
      try {
        const all = await getProducts({ limit: 40 })
        const { good: g, caution: c } = buildProductMatch(all, comb)
        setProducts(all)
        setGood(g.slice(0, 6))
        setCaution(c.slice(0, 3))
      } catch (e) {
        console.error('[assess] 商品匹配失败', e)
      } finally {
        setLoadingRecs(false)
      }
    }, 300)
  }

  const goPrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1)
  }

  const enterTongue = () => {
    setSectionGate(false)
    setCurrentQ(BODY_LEN)
  }
  const backToBody = () => {
    setSectionGate(false)
    setCurrentQ(BODY_LEN - 1)
  }

  const startDirect = () => {
    setPhotoBased(false)
    setBodyAnswers(DEEP_BODY_QUESTIONS.map(() => -1))
    setAnswers(TONGUE_QUESTIONS.map(() => -1))
    setCurrentQ(0)
    setBodyResult(null)
    setCombined(null)
    setGood([])
    setCaution([])
    setJustSelected(null)
    setSectionGate(false)
    setStep('quiz')
  }

  const restart = () => {
    setBodyAnswers(DEEP_BODY_QUESTIONS.map(() => -1))
    setAnswers(TONGUE_QUESTIONS.map(() => -1))
    setCurrentQ(0)
    setBodyResult(null)
    setCombined(null)
    setGood([])
    setCaution([])
    setJustSelected(null)
    setSectionGate(false)
    setPhotoPath('')
    setPhotoBack('')
    setPhotoBased(false)
    setStep('intro')
  }

  // 打开拍摄引导页（虚线舌形对齐 + 前后置切换 + 拍照/相册/示例）
  // 拍照仅本地留档（舌面 + 舌下），返回后逐项对照自检，不联网识别
  // photoOnly=true：结果页「重新拍照」专用 —— 仅更新照片，返回后保留当前评估结果与答案
  const openCameraGuide = (photoOnlyFlag = false) => {
    if (photoOnlyFlag) Taro.setStorageSync('tongue:photoOnly', '1')
    Taro.navigateTo({ url: '/pages/food/tongue-camera/index' }).catch(() => {
      // 兜底：直接调系统相机 / 相册（最多 2 张：舌面 + 舌下）
      Taro.chooseImage({ count: 2, sizeType: ['compressed'], sourceType: ['camera', 'album'] })
        .then((res: any) => {
          const paths = res?.tempFilePaths || []
          if (paths[0]) setPhotoPath(paths[0])
          if (paths[1]) setPhotoBack(paths[1])
          setPhotoBased(true)
          if (!photoOnlyFlag) {
            // 兜底入口：拍照后直接进对照（保留已拍照片）
            setBodyAnswers(DEEP_BODY_QUESTIONS.map(() => -1))
            setAnswers(TONGUE_QUESTIONS.map(() => -1))
            setCurrentQ(0)
            setBodyResult(null)
            setCombined(null)
            setGood([])
            setCaution([])
            setJustSelected(null)
            setSectionGate(false)
            setStep('quiz')
          }
        })
        .catch(() => {/* 用户取消，忽略 */})
    })
  }

  // 综合结果落库（食养偏好标签 + 全量结果），支撑首页千人千面与复测；未登录静默跳过
  useEffect(() => {
    if (step !== 'result' || !combined) return
    let alive = true
    ;(async () => {
      try {
        const { data: { user } } = await getLocalUser()
        if (!user?.id) return
        const tags = [combined.primary.key, ...constitutionToCrowds(combined.primary)]
        await updateProfile({ constitution_tags: tags })
        await saveConstitutionResult({
          primaryKey: combined.primary.key,
          secondaryKey: combined.secondary?.key ?? null,
          scores: combined.scores,
          answers: [...bodyAnswers, ...answers],
        })
        // 沉淀最近一次「食养画像」本地快照（综合：身体深度 9 题 + 舌象 8 维，17 项答案；旧版 5+8=13 项）
        const tongueAnalysis = combined.tongue
        const idx = computeHealthIndex(tongueAnalysis, tongueAnalysis.confidence)
        saveTongueProfile({
          updatedAt: Date.now(),
          primaryKey: combined.primary.key,
          primaryName: combined.primary.name,
          primaryColor: combined.primary.color,
          primaryEmoji: combined.primary.emoji,
          secondaryKey: combined.secondary?.key,
          secondaryName: combined.secondary?.name,
          healthIndex: idx.score,
          band: idx.band,
          bandLabel: idx.bandLabel,
          confidence: tongueAnalysis.confidence,
          answers: [...bodyAnswers, ...answers],
          bodyCount: DEEP_BODY_QUESTIONS.length,
        })
      } catch (e) {
        console.error('[assess] 偏好落库失败（不阻断）', e)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, combined])

  // 身体感受 · 分维度专业点评（结果页「辨证依据」用；仅含非中性维度）
  const bodyNotes = buildBodyDimensionNotes(bodyAnswers, DEEP_BODY_QUESTIONS)

  // 身体感受得分排行（仅取有分的偏颇质，降序取前 4）
  const bodyScoreEntries: [string, number][] = bodyResult
    ? Object.entries(bodyResult.scores)
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : []
  const bodyMax = bodyScoreEntries.length > 0 ? bodyScoreEntries[0][1] : 0

  const shareTitle = combined
    ? `我是${combined.primary.emoji}${combined.primary.name}，身体感受+舌象对照双印证，你呢？`
    : '食养评估 · 身体感受 + 舌象对照'

  useShareAppMessage(() => ({
    title: shareTitle,
    path: '/pages/food/tongue/index',
  }))
  useShareTimeline(() => ({ title: shareTitle }))
  useDidShow(() => {
    Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
    try {
      // 拍照留档返回：本地读取舌面（正面）+ 舌下（反面）两张，跳到逐项对照自检。
      // 纯本地、不联网、不经任何视觉识别 —— 用户看自己的照片逐项勾选特征。
      const captured = Taro.getStorageSync('tongue:captured')
      const photoOnly = Taro.getStorageSync('tongue:photoOnly')
      if (captured) {
        try {
          const { front, back } = JSON.parse(captured)
          // 解析成功后再删除留档，避免异常数据静默丢失照片
          Taro.removeStorageSync('tongue:captured')
          if (typeof front === 'string') setPhotoPath(front)
          if (typeof back === 'string') setPhotoBack(back)
          setPhotoBased(true)
          if (!photoOnly) {
            // 正常入口（intro → 拍照 → 对照）：清空旧答案，从第一题开始
            setBodyAnswers(DEEP_BODY_QUESTIONS.map(() => -1))
            setAnswers(TONGUE_QUESTIONS.map(() => -1))
            setCurrentQ(0)
            setBodyResult(null)
            setCombined(null)
            setGood([])
            setCaution([])
            setJustSelected(null)
            setSectionGate(false)
            setStep('quiz')
          } else {
            // 结果页「重新拍照」：仅更新照片，保留当前评估结果与答案（不跳回对照）
            Taro.removeStorageSync('tongue:photoOnly')
          }
          return
        } catch (e) {
          /* 解析异常忽略 */
        }
      }
      // 取消拍照 / 未成功留档：清除可能残留的 photoOnly 标记，避免污染后续正常入口
      Taro.removeStorageSync('tongue:photoOnly')

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

  // 顶部标题
  const Header = (
    <View className="mb-4">
      <Text className="text-2xl font-bold text-[#2A2A2A]"> 食养评估</Text>
      <Text className="text-xs text-[#6F675C] mt-1 block">
        身体感受 9 题 + 舌象对照 8 维，本地算法综合给出你的食养倾向（约 3 分钟）
      </Text>
    </View>
  )

  return (
    <View className="min-h-screen bg-[#F7F3E9] px-4 pt-5 pb-16">
      {Header}

      {/* 说明 / 英雄引导 */}
      {step === 'intro' && (
        <View>
          <View
            className="rounded-3xl p-6 shadow-sm"
            style={{
              background: 'linear-gradient(160deg, #FFFDF8 0%, #FBF7EF 100%)',
              borderWidth: 1,
              borderColor: '#ECE6DD',
            }}
          >
            <Text className="text-[11px] font-semibold" style={S.primaryText}>
              身体感受 × 舌象对照
            </Text>
            <Text className="text-2xl font-bold text-[#2A2A2A] mt-1 block">读懂你的食养倾向</Text>
            <Text className="text-sm text-[#6F675C] mt-2 block" style={S.lh175}>
              两步细测：先聊 9 个身体专项感受（寒热 / 汗出 / 精力 / 睡眠 / 情绪等），再在自然光下看自己的舌头、对照 8 项特征。本地算法交叉印证，给你一份专属食养参考。
            </Text>

            {/* 两大部分可视化 */}
            <View className="mt-4 flex flex-row gap-3">
              <View className="flex-1 rounded-2xl p-3" style={S.cardPlain}>
                <Icon name="emoticon-happy" size={24} className="text-primary" />
                <Text className="text-sm font-semibold text-[#2A2A2A] mt-1 block">身体感受</Text>
                <Text className="text-[11px] text-[#9A9388] mt-0.5 block">9 个专项细问</Text>
              </View>
              <View className="flex-1 rounded-2xl p-3" style={S.cardPlain}>
                <Icon name="tongue" size={24} className="text-primary" />
                <Text className="text-sm font-semibold text-[#2A2A2A] mt-1 block">舌象对照</Text>
                <Text className="text-[11px] text-[#9A9388] mt-0.5 block">8 维望舌特征</Text>
              </View>
            </View>

            <View className="mt-3 flex flex-wrap gap-2">
              {['约 3 分钟', '无需登录', '本地算法·不联网'].map((t) => (
                <View key={t} className="rounded-full px-3 py-1" style={{ background: 'hsl(var(--primary) / 0.08)' }}>
                  <Text className="text-xs" style={S.primaryText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>

          <Button
            onClick={openCameraGuide}
            className="mt-5 rounded-full"
            style={S.primaryFill}
          >
            拍照 + 开始评估
          </Button>

          <Button
            onClick={startDirect}
            className="mt-3 rounded-full"
            style={S.cardPrimary}
          >
            不拍照，直接开始
          </Button>

          <Text className="text-[10px] text-[#9A9388] mt-4 block text-center leading-relaxed">
            {FOOD_THERAPY_DISCLAIMER}
          </Text>
        </View>
      )}

      {/* 逐题对照 */}
      {step === 'quiz' && q && !sectionGate && (
        <View>
          {/* 分段进度：身体感受（鼠尾草绿）/ 舌象对照（草本绿）两色分段 + 当前段落标签 */}
          <View className="mb-4">
            <View className="flex items-center justify-between mb-2">
              <Text className="text-xs text-[#6F675C]">第 {currentQ + 1} / {total} 步</Text>
              <View
                className="rounded-full px-2.5 py-0.5"
                style={{
                  background: q.section === 'body' ? 'hsl(var(--primary) / 0.1)' : 'rgba(22,163,74,0.1)',
                }}
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: q.section === 'body' ? 'hsl(var(--primary))' : '#15803D' }}
                >
                  {q.section === 'body' ? '身体感受' : '舌象对照'}
                </Text>
              </View>
            </View>
            <View className="flex items-center">
              {MERGED.map((m, i) => (
                <View
                  key={i}
                  className="h-1.5 flex-1 rounded-full"
                  style={{
                    background: i <= currentQ
                      ? (m.section === 'body' ? 'hsl(var(--primary))' : '#15803D')
                      : '#ECE6DD',
                    marginLeft: i === BODY_LEN ? 8 : i === 0 ? 0 : 2,
                  }}
                />
              ))}
            </View>
          </View>

          {/* 题目内容：每次换题重新挂载触发滑入动画 */}
          <View key={currentQ} className="qa-fade-in">
            <Text className="text-lg font-bold text-[#2A2A2A] block">{q.question}</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block">{q.sub}</Text>

            <View className="mt-5 flex flex-col gap-3">
              {q.options.map((opt, idx) => {
                const active = selected === idx
                const justTapped = justSelected === idx
                return (
                  <View
                    key={idx}
                    onClick={() => !locked && handleSelect(idx)}
                    className={`rounded-2xl px-4 py-3.5 ${justTapped ? 'qa-tap' : ''}`}
                    style={{
                      background: active ? 'hsl(var(--primary))' : '#fff',
                      borderWidth: 1,
                      borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.35)',
                    }}
                  >
                    <View className="flex items-center justify-between">
                      <Text className="text-sm" style={{ color: active ? '#fff' : '#3F3A34' }}>
                        {opt.label}
                      </Text>
                      {active ? <Icon name="check" size={16} className="text-white" /> : null}
                    </View>
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
                style={S.cardPrimary}
              >
                上一步
              </Button>
            )}
          </View>
        </View>
      )}

      {/* 段落过渡门卡：身体感受 → 舌象对照 仪式化切换 */}
      {step === 'quiz' && sectionGate && (
        <View className="gate-pop">
          <View
            className="rounded-3xl p-6 shadow-sm"
            style={{
              background: 'linear-gradient(160deg, #FFFDF8 0%, #FBF7EF 100%)',
              borderWidth: 1,
              borderColor: '#ECE6DD',
            }}
          >
            <Text className="text-[11px] font-semibold" style={S.greenText}>第一部分完成</Text>
            <Text className="text-2xl font-bold text-[#2A2A2A] mt-1 block">进入舌象对照</Text>
            <Text className="text-sm text-[#6F675C] mt-2 block" style={S.lh175}>
              在自然光下伸出舌头，对照下面 8 项特征勾选。{photoBased ? '可参考刚拍的舌面 / 舌下照片，对着看更准。' : '若还没拍，可在结果页补拍留档给食养顾问真人研判。'}
            </Text>
            <View
              className="mt-4 rounded-2xl p-3 flex items-center gap-2"
              style={S.cardPlain}
            >
              <Icon name="tongue" size={20} className="text-primary" />
              <Text className="text-xs text-[#6F675C]" style={{ lineHeight: 1.5 }}>
                提示：自然光最好，别刚吃完带色食物或刷完牙就拍，颜色才准。
              </Text>
            </View>
            <Button
              onClick={enterTongue}
              className="mt-5 rounded-full"
              style={{ background: '#15803D', color: '#fff' }}
            >
              开始对照 →
            </Button>
            <Button
              onClick={backToBody}
              className="mt-3 rounded-full"
              style={S.cardPrimary}
            >
              返回修改身体感受
            </Button>
          </View>
        </View>
      )}

      {/* 结果 */}
      {step === 'result' && combined && (
        <View>
          {/* 综合体质倾向 banner：揭晓 + emoji 呼吸 */}
          <View className="qa-reveal rounded-3xl p-5" style={{ background: combined.primary.colorLight }}>
            <Text className="text-xs text-[#6F675C]">综合食养倾向（身体感受 + 舌象对照）</Text>
            <View className="mt-1 flex items-center gap-2">
              <Text className="qa-emoji-breathe text-3xl">{combined.primary.emoji}</Text>
              <Text className="text-2xl font-bold" style={{ color: combined.primary.color }}>
                {combined.primary.name}
              </Text>
            </View>
            {photoBased ? (
              <View className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5" style={{ background: 'rgba(22,163,74,0.12)' }}>
                <Text className="text-[10px]" style={S.greenText}>拍照对照 · 本地算法</Text>
              </View>
            ) : null}
            <Text className="text-sm text-[#3F3A34] mt-2 block" style={S.lh17}>
              {combined.primary.description}
            </Text>
            {combined.secondary ? (
              <View className="mt-3">
                <Text className="text-xs text-muted-foreground">兼顾倾向</Text>
                <View className="mt-1 flex items-center gap-1.5">
                  <Text className="text-lg">{combined.secondary.emoji}</Text>
                  <Text className="text-sm font-semibold" style={{ color: combined.secondary.color }}>
                    {combined.secondary.name}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* 双通道交叉校验 */}
          <View className="qa-reveal qa-stagger-1 mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#2A2A2A]">两项互相印证</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block">{combined.note}</Text>
            <View className="mt-3 flex items-center gap-2">
              <View className="flex-1 rounded-xl px-2 py-2" style={S.bgBase}>
                <Text className="text-[10px] text-[#9A9388]">身体感受</Text>
                <View className="mt-0.5 flex items-center gap-1">
                  <Text style={S.fs16}>{combined.body.primary.emoji}</Text>
                  <Text className="text-xs font-semibold" style={{ color: combined.body.primary.color }}>
                    {combined.body.primary.name}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#C9C0B4', fontSize: 14 }}>×</Text>
              <View className="flex-1 rounded-xl px-2 py-2" style={S.bgBase}>
                <Text className="text-[10px] text-[#9A9388]">舌象对照</Text>
                <View className="mt-0.5 flex items-center gap-1">
                  <Text style={S.fs16}>{combined.tongue.primary.emoji}</Text>
                  <Text className="text-xs font-semibold" style={{ color: combined.tongue.primary.color }}>
                    {combined.tongue.primary.name}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 辨证依据 · 逐项专业解读（身体感受侧，可追溯） */}
          {bodyNotes.length > 0 ? (
            <View className="qa-reveal qa-stagger-2 mt-4 rounded-2xl bg-white p-4 shadow-sm">
              <Text className="text-sm font-bold text-[#2A2A2A]">辨证依据 · 逐项解读</Text>
              <Text className="text-xs text-[#6F675C] mt-1 block">
                你的每项身体感受，指向的体质倾向（共 {bodyNotes.length} 项有指向）
              </Text>
              <View className="mt-3 flex flex-col gap-2.5">
                {bodyNotes.map((n, i) => (
                  <View key={i} className="rounded-xl px-3 py-2.5" style={S.bgBase}>
                    <View className="flex items-center justify-between">
                      <Text className="text-xs font-bold text-[#3F3A34]">{n.dimLabel}</Text>
                      {n.toward ? (
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{ background: 'hsl(var(--primary) / 0.1)' }}
                        >
                          <Text className="text-[10px]" style={S.primaryText}>
                            {n.toward}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-[11px] text-[#6F675C] mt-1 block" style={S.lh16}>
                      {n.label}
                      {n.detail ? ` · ${n.detail}` : ''}
                    </Text>
                    {n.reading ? (
                      <Text className="text-[11px] mt-0.5 block" style={{ color: '#15803D', lineHeight: 1.6 }}>
                        {n.reading}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* 食养闭环 · 一键串联：身体感受 → 舌象 → 双通道辨证 → 综合体质 → 商品 */}
          <View className="qa-reveal qa-stagger-2">
            <ChainStrip combined={combined} />
          </View>

          {/* 食养分析报告（舌象深度 · v2 进阶算法） */}
          <View className="qa-reveal qa-stagger-3">
            <TongueReport answers={answers} photoBased={photoBased} />
          </View>

          {/* 身体感受分析 */}
          {bodyResult ? (
            <View className="qa-reveal qa-stagger-3 mt-4 rounded-2xl bg-white p-4 shadow-sm">
              <Text className="text-sm font-bold text-[#2A2A2A]">身体感受 · 倾向汇总</Text>
              <Text className="text-xs text-[#6F675C] mt-1 block">
                9 项专项身体感受的倾向汇总（按匹配强度排序，与上方逐项解读互为印证）
              </Text>
              {bodyScoreEntries.length > 0 ? (
                <View className="mt-3 flex flex-col gap-2.5">
                  {bodyScoreEntries.map(([key, score]) => {
                    const t = CONSTITUTION_TYPES[key]
                    const pct = bodyMax > 0 ? Math.max(8, Math.round((score / bodyMax) * 100)) : 0
                    const isPrimary = key === combined.body.primary.key
                    return (
                      <View key={key}>
                        <View className="flex items-center justify-between">
                          <View className="flex items-center gap-1">
                            <Text className="text-sm">{t.emoji}</Text>
                            <Text
                              className="text-xs"
                              style={{ color: isPrimary ? combined.body.primary.color : '#6F675C', fontWeight: isPrimary ? '700' : '400' }}
                            >
                              {t.name}
                            </Text>
                          </View>
                          <Text className="text-xs text-muted-foreground">{score} 分</Text>
                        </View>
                        <View className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#F4EFE8]">
                          <View className="qa-bar-grow h-2 rounded-full" style={{ width: `${pct}%`, background: isPrimary ? combined.body.primary.color : '#ECE6DD' }} />
                        </View>
                      </View>
                    )
                  })}
                </View>
              ) : (
                <View className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' }}>
                  <Text className="text-xs text-[#15803D]" style={S.lh16}>
                    你的各项身体感受都偏中性、整体状态均衡 —— 这恰恰是「{combined.body.primary.name}」的样子。
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* 宜忌性味（综合体质） */}
          <View className="qa-reveal qa-stagger-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-sm font-bold text-[#2A2A2A]">口味上可以这样挑</Text>
            <View className="mt-3 flex flex-wrap gap-2">
              {combined.primary.recommendNature.length > 0 && (
                <View className="rounded-full bg-[#DCFCE7] px-3 py-1">
                  <Text className="text-xs text-[#15803D]">宜 · {combined.primary.recommendNature.join(' / ')}</Text>
                </View>
              )}
              {combined.primary.avoidNature.length > 0 && (
                <View className="rounded-full bg-[#FEF2F2] px-3 py-1">
                  <Text className="text-xs text-[#DC2626]">慎 · {combined.primary.avoidNature.join(' / ')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* 拍照给真人顾问（识别引擎 + 真人双轨） */}
          <View className="qa-reveal qa-stagger-4 mt-4 rounded-2xl bg-[#FBF7EF] p-4" style={S.borderPlain}>
            <Text className="text-sm font-bold text-[#2A2A2A]">想让真人看看？</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block" style={S.lh16}>
              以上倾向由你填写的身体感受与舌象特征、经本地算法交叉校验得出，仅供食养参考。
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
                onClick={() => openCameraGuide(true)}
                className="rounded-full"
                style={S.cardPrimary}
              >
                {photoPath ? '重新拍照' : '去拍照留档'}
              </Button>
              <Button openType="contact" className="rounded-full" style={S.primaryFill}>
                发给食养顾问真人研判
              </Button>
            </View>
          </View>

          {/* 适配好物 */}
          <View className="qa-reveal qa-stagger-5 mt-5">
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
            <View className="qa-reveal qa-stagger-5 mt-4 rounded-2xl bg-[#FEF3C7] p-4" style={{ borderWidth: 1, borderColor: '#FEF3C7' }}>
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

          {/* 可分享海报卡 */}
          <View className="qa-reveal qa-stagger-6 mt-5">
            <View
              className="qa-poster rounded-3xl p-5"
              style={{ background: `linear-gradient(135deg, ${combined.primary.colorLight}, #ffffff)` }}
            >
              <View className="flex items-center justify-between">
                <Text className="text-[11px] text-muted-foreground">我的食养评估</Text>
                <Text className="text-[11px] text-muted-foreground">来店有喜</Text>
              </View>
              <View className="mt-3 flex items-center gap-3">
                <Text className="text-5xl">{combined.primary.emoji}</Text>
                <View>
                  <Text className="text-2xl font-bold" style={{ color: combined.primary.color }}>{combined.primary.name}</Text>
                  <Text className="text-xs text-[#6F675C] mt-0.5 block">
                    {combined.primary.recommendNature.join(' / ')} 性味更合适
                  </Text>
                </View>
              </View>
              <Text className="text-sm text-[#3F3A34] mt-3 block" style={S.lh17}>
                {POSTER_INSIGHT[combined.primary.key] ?? combined.primary.description}
              </Text>
              <View className="mt-3 flex items-center gap-1.5">
                <Text className="text-xs text-[#6F675C]">身体感受 × 舌象对照 双印证</Text>
              </View>
            </View>
            <Button openType="share" className="mt-3 rounded-full" style={{ background: combined.primary.color, color: '#fff' }}>
              分享给好友 · 一起测测食养倾向
            </Button>
          </View>

          {/* 免责 */}
          <View className="qa-reveal qa-stagger-6 mt-4 rounded-2xl bg-[#FBF7EF] p-4" style={S.borderPlain}>
            <Text className="text-[11px] text-muted-foreground leading-relaxed block">
              {FOOD_THERAPY_DISCLAIMER}
            </Text>
          </View>

          {/* 操作 */}
          <View className="qa-reveal qa-stagger-6 mt-5 flex flex-col gap-3">
            <Button
              onClick={() => Taro.navigateTo({ url: '/pages/food/profile/index' })}
              className="rounded-full"
              style={S.primaryFill}
            >
              查看我的食养画像
            </Button>
            <Button
              onClick={restart}
              className="rounded-full"
              style={S.cardPrimary}
            >
              重新评估
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
