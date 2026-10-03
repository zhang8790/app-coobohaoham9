// 我的食养画像（本地聚合，不回写数据库、不存个人可识别信息）
// ----------------------------------------------------------------------------
// 把「问卷 → 舌象维度 → 体质 → 食养」闭环的最近一次结果沉淀为本地画像：
//   · 体质画像（主 / 兼 + 宜慎性味）
//   · 健康指数 + 复测趋势（Canvas 趋势图，与食养分析报告同源）
//   · 舌象维度画像（最近一次 8 维对照答案）
//   · 食养方向（基于体质 healthGoals / bodyStates 的生活化建议）
//   · 适配好物 / 慎选（用保存的 answers 重算 analysis → buildProductMatch，与结果页同源）
// 合规：零「AI」、零诊断词；明确标注「本地参考画像，不存个人信息」。
import { useState } from 'react'
import { View, Text, ScrollView, Image, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { CONSTITUTION_TYPES } from '@/utils/constitution-test'
import { TONGUE_QUESTIONS } from '@/utils/food-therapy/tongue-rules'
import { analyzeTongue } from '@/utils/food-therapy/tongue-engine-v2'
import { BAND_META } from '@/utils/food-therapy/tongue-report'
import {
  loadTongueProfile,
  readTongueHistory,
  type TongueProfile,
  type TongueHistoryPoint,
} from '@/utils/food-therapy/tongue-history'
import { buildProductMatch, type MatchedProduct } from '@/utils/food-therapy/product-match'
import { getProducts } from '@/db/api'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { Product } from '@/db/types'
import TrendChart from '@/components/food/TrendChart'
import './index.scss'

// 维度 id → 中文短名（与结果页「望舌识别明细」一致）
const DIM_LABELS: Record<string, string> = {
  area: '舌体形态',
  color: '舌质颜色',
  coat_color: '舌苔颜色',
  coat_texture: '舌苔厚薄',
  teeth: '齿痕',
  crack: '裂纹',
  moist: '润燥',
  sublingual: '舌下络脉',
}

export default function FoodProfilePage() {
  const [profile, setProfile] = useState<TongueProfile | null>(null)
  const [history, setHistory] = useState<TongueHistoryPoint[]>([])
  const [good, setGood] = useState<MatchedProduct[]>([])
  const [caution, setCaution] = useState<MatchedProduct[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)

  useDidShow(() => {
    const p = loadTongueProfile()
    setProfile(p)
    setHistory(readTongueHistory())
    if (!p) return
    // 用保存的 answers 重算 analysis（确定性）→ 复用与结果页同源的商品匹配
    setLoadingRecs(true)
    const analysis = analyzeTongue(p.answers, { source: 'manual' })
    getProducts({ limit: 40 })
      .then((all: Product[]) => {
        const { good: g, caution: c } = buildProductMatch(all, analysis)
        setGood(g.slice(0, 6))
        setCaution(c.slice(0, 3))
      })
      .catch(() => {
        setGood([])
        setCaution([])
      })
      .finally(() => setLoadingRecs(false))
  })

  // ── 空态：尚未做过舌象自检 ──
  if (!profile) {
    return (
      <View className="min-h-screen bg-[#F7F3E9] px-4 pt-5 pb-16">
        <Text className="text-2xl font-bold text-[#2A2A2A]">我的食养画像</Text>
        <Text className="text-xs text-[#6F675C] mt-1 block">
          做一次舌象自检，就能生成属于你的食养画像
        </Text>
        <View className="mt-6 rounded-2xl bg-white p-6 shadow-sm flex flex-col items-center">
          <Text className="text-4xl">🍃</Text>
          <Text className="text-sm text-[#3F3A34] mt-3 text-center" style={{ lineHeight: 1.7 }}>
            你还没有食养画像。完成一次舌象自检后，这里会沉淀你的体质倾向、健康指数与适配好物。
          </Text>
          <Button
            onClick={() => Taro.navigateTo({ url: '/pages/food/tongue/index' })}
            className="mt-5 rounded-full"
            style={{ background: 'hsl(var(--primary))', color: '#fff' }}
          >
            去做舌象自检
          </Button>
        </View>
      </View>
    )
  }

  const primary = CONSTITUTION_TYPES[profile.primaryKey]
  const secondary = profile.secondaryKey ? CONSTITUTION_TYPES[profile.secondaryKey] : null
  const band = BAND_META[profile.band]
  const updated = new Date(profile.updatedAt)
  const updatedStr = `${updated.getMonth() + 1}.${String(updated.getDate()).padStart(2, '0')} ${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}`

  // 食养方向：体质健康目标 + 身体状态，去重合并
  const directionSet = new Set<string>([
    ...(primary.healthGoals || []),
    ...(primary.bodyStates || []),
    ...(secondary?.healthGoals || []),
    ...(secondary?.bodyStates || []),
  ])

  // 舌象维度画像：遍历 8 维，informative（>0）与 neutral（=0）分组
  const dims = TONGUE_QUESTIONS.map((q, i) => ({
    id: q.id,
    name: DIM_LABELS[q.id] || q.id,
    idx: i,
    ans: profile.answers[i] ?? -1,
    label: q.options[profile.answers[i]]?.label || '',
  }))
  const informativeDims = dims.filter((d) => d.ans > 0)
  const neutralDims = dims.filter((d) => d.ans === 0)

  return (
    <View className="min-h-screen bg-[#F7F3E9] px-4 pt-5 pb-16">
      {/* 顶部 */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-[#2A2A2A]">我的食养画像</Text>
        <Text className="text-xs text-[#6F675C] mt-1 block">
          最近更新 {updatedStr} · 本地参考画像，不存个人信息
        </Text>
      </View>

      {/* 体质画像 */}
      <View className="rounded-3xl p-5" style={{ background: profile.primaryColor + '1A' }}>
        <Text className="text-xs text-[#6F675C]">你的体质倾向</Text>
        <View className="mt-1 flex items-center gap-2">
          <Text className="text-3xl">{profile.primaryEmoji}</Text>
          <Text className="text-2xl font-bold" style={{ color: profile.primaryColor }}>
            {profile.primaryName}
          </Text>
        </View>
        {profile.secondaryName ? (
          <View className="mt-2 flex items-center gap-1.5">
            <Text className="text-xs text-muted-foreground">兼顾倾向</Text>
            <Text className="text-sm font-semibold" style={{ color: profile.secondaryKey ? CONSTITUTION_TYPES[profile.secondaryKey].color : '#6F675C' }}>
              {profile.secondaryName}
            </Text>
          </View>
        ) : null}
        <Text className="text-sm text-[#3F3A34] mt-2 block" style={{ lineHeight: 1.7 }}>
          {primary.description}
        </Text>
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

      {/* 健康指数 + 复测趋势 */}
      <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <Text className="text-sm font-bold text-[#2A2A2A]">食养健康指数</Text>
        <View className="mt-2 flex items-baseline" style={{ gap: 6 }}>
          <Text className="text-3xl font-bold" style={{ color: band.color }}>
            {profile.healthIndex.toFixed(1)}
          </Text>
          <Text className="text-xs text-[#6F675C]">分</Text>
          <View className="rounded-full px-2 py-0.5 ml-1" style={{ background: `${band.color}1A` }}>
            <Text className="text-[10px] font-semibold" style={{ color: band.color }}>
              {band.label}
            </Text>
          </View>
        </View>
        <Text className="text-xs text-[#3F3A34] mt-1.5 block" style={{ lineHeight: 1.7 }}>
          {band.retestText}（{band.retestDays} 天复测建议）
        </Text>
        {history.length > 0 ? <TrendChart points={history} color={band.color} /> : null}
      </View>

      {/* 舌象维度画像 */}
      <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <Text className="text-sm font-bold text-[#2A2A2A]">舌象维度画像</Text>
        <Text className="text-xs text-[#6F675C] mt-1 block">
          最近一次自检的 {informativeDims.length} 项有指向、{neutralDims.length} 项偏中性
        </Text>
        <View className="mt-3 flex flex-col gap-2">
          {informativeDims.map((d) => (
            <View key={d.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: '#F7F3E9' }}>
              <Text className="text-xs text-[#6F675C]">{d.name}</Text>
              <Text className="text-sm text-[#2A2A2A] font-semibold">{d.label}</Text>
            </View>
          ))}
          {neutralDims.map((d) => (
            <View key={d.id} className="flex items-center justify-between px-3 py-1.5">
              <Text className="text-xs text-[#9A9388]">{d.name}</Text>
              <Text className="text-xs text-[#9A9388]">偏中性</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 食养方向 */}
      {directionSet.size > 0 ? (
        <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <Text className="text-sm font-bold text-[#2A2A2A]">日常可以这样吃</Text>
          <View className="mt-3 flex flex-wrap gap-2">
            {Array.from(directionSet).map((t) => (
              <View key={t} className="rounded-full bg-[hsl(var(--primary) / 0.08)] px-3 py-1">
                <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

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
          onClick={() => Taro.navigateTo({ url: '/pages/food/tongue/index' })}
          className="rounded-full"
          style={{ background: 'hsl(var(--primary))', color: '#fff' }}
        >
          重新自检更新画像
        </Button>
        <Button
          onClick={() => Taro.navigateTo({ url: '/pages/food/constitution-test/index' })}
          className="rounded-full"
          style={{ background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
        >
          去完善食养偏好设置
        </Button>
      </View>
    </View>
  )
}
