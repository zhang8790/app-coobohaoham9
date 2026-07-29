// @title 今日食养智能推荐
// 融合节气 × 体质 × 消费偏好 → 个性化每日食养建议
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { getMyProfile, getOrders, getProductsByIds } from '@/db/api'
import { getProducts } from '@/db/api'
import type { Product, Profile, Order } from '@/db/types'
import { getCurrentTerm, getDaysLeftInTerm, getNextTerm } from '@/utils/seasonal-box'
import { CONSTITUTION_TYPES, type ConstitutionType } from '@/utils/constitution-test'
import { analyzeConsumption, type ConsumptionProfile } from '@/utils/consumption-profile'
import {
  getTodayFoodTherapy,
  isSeasonTransition,
  type TodayFoodTherapyResult,
  type RecommendedItem,
} from '@/utils/today-food-therapy'

// ── 子组件：节气卡片 ─────────────────────────────────────────────────────

function SeasonHero({ result }: { result: TodayFoodTherapyResult }) {
  const term = result.term
  if (!term) return null
  const daysLeft = getDaysLeftInTerm(term)
  const transition = isSeasonTransition(term)

  return (
    <View
      className="rounded-2xl p-5 mb-4"
      style={{
        background: `linear-gradient(135deg, ${term.color} 0%, ${term.colorEnd} 100%)`,
      }}
    >
      {/* 节气头部 */}
      <View className="flex items-center justify-between mb-3">
        <View className="flex items-center gap-2">
          <Text className="text-3xl">{term.emoji}</Text>
          <View>
            <Text className="text-xl font-bold" style={{ color: '#374151' }}>{term.name}</Text>
            <Text className="text-xs" style={{ color: '#6B7280' }}>{term.pinyin} · {term.nature}</Text>
          </View>
        </View>
        <View className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <Text className="text-xs font-medium" style={{ color: '#78350F' }}>
            剩余 {daysLeft} 天
          </Text>
        </View>
      </View>

      {/* 季节描述 */}
      <Text className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>
        {term.principle}
      </Text>

      {/* 民俗/天气 */}
      <View className="flex items-start gap-2 mt-3">
        <Text className="text-sm" style={{ color: '#6B7280' }}>🌤</Text>
        <Text className="text-xs leading-relaxed flex-1" style={{ color: '#6B7280' }}>
          {term.weatherDesc}
        </Text>
      </View>
      <View className="flex items-start gap-2 mt-1">
        <Text className="text-sm" style={{ color: '#6B7280' }}>📜</Text>
        <Text className="text-xs leading-relaxed flex-1" style={{ color: '#6B7280' }}>
          {term.folkWisdom}
        </Text>
      </View>

      {/* 换季提示 */}
      {transition && (
        <View className="mt-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
          <Text className="text-xs font-medium" style={{ color: '#DC2626' }}>
            🌱 节气交替期，饮食宜调整过渡
          </Text>
        </View>
      )}
    </View>
  )
}

// ── 子组件：体质卡 + 每日建议 ───────────────────────────────────────────

function ConstitutionCard({ result }: { result: TodayFoodTherapyResult }) {
  const { constitution, dailyAdvice } = result

  if (!constitution) {
    return (
      <View className="rounded-2xl p-4 mb-4" style={{ background: '#FEF3C7' }}>
        <View className="flex items-center justify-between">
          <View className="flex items-center gap-2">
            <Text className="text-lg">🧪</Text>
            <Text className="text-sm font-medium" style={{ color: '#92400E' }}>
              还未完整体质测试
            </Text>
          </View>
          <View
            className="px-3 py-1.5 rounded-full bg-white"
            onClick={() => Taro.navigateTo({ url: '/pages/food/constitution-test/index' })}
          >
            <Text className="text-xs font-medium" style={{ color: '#78350F' }}>
              立即测试 →
            </Text>
          </View>
        </View>
        <Text className="text-xs mt-2" style={{ color: '#92400E' }}>
          完成测试后，推荐会更贴合你的体质
        </Text>
      </View>
    )
  }

  return (
    <View className="rounded-2xl p-4 mb-4" style={{ background: constitution.colorLight }}>
      <View className="flex items-center gap-2 mb-2">
        <Text className="text-2xl">{constitution.emoji}</Text>
        <View>
          <Text className="text-base font-bold" style={{ color: constitution.color }}>
            {constitution.name}
          </Text>
          <Text className="text-xs" style={{ color: '#6B7280' }}>
            {constitution.description}
          </Text>
        </View>
      </View>

      {/* 健康目标标签 */}
      {constitution.healthGoals.length > 0 && (
        <View className="flex flex-wrap gap-1.5 mt-2">
          {constitution.healthGoals.map((goal, i) => (
            <View key={i} className="px-2.5 py-1 rounded-full" style={{ background: constitution.color + '22' }}>
              <Text className="text-xs" style={{ color: constitution.color }}>
                {goal}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* 每日建议 */}
      <View className="mt-3 px-3 py-2.5 rounded-lg bg-white/60">
        <Text className="text-xs leading-relaxed" style={{ color: '#374151' }}>
          {dailyAdvice}
        </Text>
      </View>
    </View>
  )
}

// ── 子组件：推荐排序 Tab ─────────────────────────────────────────────────

type FilterKey = 'all' | 'season' | 'constitution' | 'preference'

const FILTER_OPTIONS: { key: FilterKey; label: string; emoji: string }[] = [
  { key: 'all', label: '全部推荐', emoji: '🌟' },
  { key: 'season', label: '当季', emoji: '🌤' },
  { key: 'constitution', label: '对体质', emoji: '🧬' },
  { key: 'preference', label: '你的偏好', emoji: '💚' },
]

// ── 子组件：单项推荐卡片 ─────────────────────────────────────────────────

function RecommendationCard({
  item,
  rank,
}: {
  item: RecommendedItem
  rank: number
}) {
  const scoreColor =
    item.score >= 8 ? '#78350F' : item.score >= 5 ? '#B45309' : '#D97706'

  return (
    <View className="rounded-xl p-4 mb-3 bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <View className="flex items-center gap-3">
        {/* 排名 */}
        <View className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: scoreColor + '15' }}>
          <Text className="text-xs font-bold" style={{ color: scoreColor }}>
            {rank + 1}
          </Text>
        </View>

        {/* 图标 + 名称 */}
        <Text className="text-2xl">{item.emoji}</Text>
        <View className="flex-1">
          <Text className="text-base font-bold" style={{ color: '#374151' }}>
            {item.name}
          </Text>
          <View className="flex flex-wrap gap-1 mt-1">
            {item.sourceMatch.map((s, i) => {
              const labelMap: Record<string, string> = {
                season: '🌤 当季',
                constitution: '🧬 适体',
                preference: '💚 偏好',
              }
              const bgMap: Record<string, string> = {
                season: '#F0FDF4',
                constitution: '#EFF6FF',
                preference: '#FDF2F8',
              }
              const colorMap: Record<string, string> = {
                season: '#16A34A',
                constitution: '#2563EB',
                preference: '#DB2777',
              }
              return (
                <View key={i} className="px-2 py-0.5 rounded" style={{ background: bgMap[s] }}>
                  <Text className="text-[9px]" style={{ color: colorMap[s] }}>
                    {labelMap[s]}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* 匹配度 */}
        <View className="flex flex-col items-center">
          <Text
            className="text-lg font-bold"
            style={{ color: scoreColor }}
          >
            {item.score}
          </Text>
          <Text className="text-[9px]" style={{ color: '#9CA3AF' }}>
            匹配度
          </Text>
        </View>
      </View>

      {/* 性味 */}
      <View className="mt-2 flex items-center gap-2">
        <Text className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>
          性味：{item.nature}
        </Text>
        <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>
          {item.reason}
        </Text>
      </View>
    </View>
  )
}

// ── 子组件：推荐类型标签 ─────────────────────────────────────────────────

function IngredientTag({ name, emoji }: { name: string; emoji: string }) {
  return (
    <View className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full mr-2 mb-2 bg-white" style={{ border: '1px solid #E5E7EB' }}>
      <Text className="text-sm">{emoji}</Text>
      <Text className="text-xs font-medium text-[#374151]">{name}</Text>
    </View>
  )
}

// ── 分享卡预览 ─────────────────────────────────────────────────────────

function ShareCard({ result }: { result: TodayFoodTherapyResult }) {
  const term = result.term
  if (!term) return null
  const top3 = result.recommendations.slice(0, 3)

  return (
    <View
      className="rounded-3xl overflow-hidden mx-auto"
      style={{
        width: 280,
        background: `linear-gradient(135deg, ${term.color} 0%, ${term.colorEnd} 100%)`,
      }}
    >
      {/* 头部 */}
      <View className="pt-5 px-5 pb-2 text-center">
        <Text className="text-4xl mb-1">{term.emoji}</Text>
        <Text className="text-lg font-bold text-[#374151]">{term.name}食养推荐</Text>
        {result.constitution && (
          <Text className="text-xs text-[#6B7280] mt-1">{result.constitution.emoji} {result.constitution.name}专属</Text>
        )}
      </View>

      {/* 推荐列表 */}
      <View className="px-4 pb-3">
        {top3.map((item, i) => (
          <View key={i} className="flex items-center gap-2 py-2 border-b border-white/30 last:border-0">
            <Text className="text-lg">{item.emoji}</Text>
            <Text className="text-sm font-medium text-[#374151] flex-1">{item.name}</Text>
            <Text className="text-[10px] text-[#6B7280]">{'⭐'.repeat(Math.ceil(item.score / 3))}</Text>
          </View>
        ))}
      </View>

      {/* 底部 */}
      <View className="px-5 pb-4 text-center">
        <Text className="text-[9px] text-[#9CA3AF]">来店有喜 · 今日食养推荐</Text>
      </View>
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────

/** 由 profiles.constitution_tags（body_state 标签 / 体质 key / 体质名）解析出体质类型
 *  与食养短板引擎 resolveConstitutionKeys 同逻辑：依次尝试 key → 名 → bodyState 匹配。 */
async function getConstitution(profile: Profile | null): Promise<ConstitutionType | null> {
  const tags = profile?.constitution_tags ?? []
  for (const tag of tags) {
    if (CONSTITUTION_TYPES[tag]) return CONSTITUTION_TYPES[tag]
    const byName = Object.keys(CONSTITUTION_TYPES).find((k) => CONSTITUTION_TYPES[k].name === tag)
    if (byName) return CONSTITUTION_TYPES[byName]
    const byBody = Object.keys(CONSTITUTION_TYPES).find((k) => CONSTITUTION_TYPES[k].bodyStates.includes(tag))
    if (byBody) return CONSTITUTION_TYPES[byBody]
  }
  return null
}

export default function TodayFoodTherapyPage() {
  const { profile: authProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<TodayFoodTherapyResult | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [showShareCard, setShowShareCard] = useState(false)
  const [profileData, setProfileData] = useState<ConsumptionProfile | null>(null)
  const [constitutionData, setConstitutionData] = useState<any>(null)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        // 并行加载数据
        const [profile, products] = await Promise.all([
          getMyProfile().catch(() => null),
          getProducts().catch(() => [] as Product[]),
        ])

        if (!alive) return

        // 体质数据
        const constitution = await getConstitution(profile)

        // 消费偏好
        let consumptionProfile: ConsumptionProfile | null = null
        if (profile?.id) {
          const orders = await getOrders().catch(() => [] as Order[])
          const productIds = orders
            .flatMap((o) => (o.order_items || []).map((it) => it.product_id))
            .filter((id): id is string => id != null)
          const boughtProducts = productIds.length ? await getProductsByIds(productIds) : []
          if (boughtProducts.length > 0) {
            consumptionProfile = analyzeConsumption(boughtProducts)
          }
        }

        setConstitutionData(constitution)
        setProfileData(consumptionProfile)

        // 生成推荐
        const todayResult = getTodayFoodTherapy(
          constitution,
          consumptionProfile,
          products || [],
          new Set(),
        )

        setResult(todayResult)
      } catch (err) {
        console.error('[TodayFood] load error:', err)
        // 降级：无用户数据也能展示节气信息
        const fallback = getTodayFoodTherapy(null, null)
        setResult(fallback)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => { alive = false }
  }, [])

  // 过滤
  const filtered = result
    ? filter === 'all'
      ? result.recommendations
      : result.recommendations.filter((r) => r.sourceMatch.includes(filter as any))
    : []

  // 换一批（随机打乱）
  const handleShuffle = () => {
    if (!result) return
    const shuffled = [...result.recommendations].sort(() => Math.random() - 0.5)
    setResult({ ...result, recommendations: shuffled })
  }

  // 生成分享卡
  const handleShare = () => {
    setShowShareCard(true)
  }

  const handleSaveShareCard = () => {
    Taro.showToast({ title: '长按上方卡片可保存', icon: 'none', duration: 2000 })
  }

  // ── 加载态 ──
  if (loading) {
    return (
      <View className="min-h-screen bg-[#FFFBF7] flex items-center justify-center">
        <View className="text-center">
          <Text className="text-4xl mb-3">🌿</Text>
          <Text className="text-sm text-[#BFBFBF]">正在为你分析今日食养...</Text>
          <View className="mt-4 w-32 h-1.5 rounded-full overflow-hidden mx-auto" style={{ background: '#E5E7EB' }}>
            <View
              className="h-full rounded-full"
              style={{
                width: '60%',
                background: 'linear-gradient(90deg, #78350F, #D97706)',
                animation: 'pulse 1.5s infinite',
              }}
            />
          </View>
        </View>
      </View>
    )
  }

  if (!result) {
    return (
      <View className="min-h-screen bg-[#FFFBF7] flex items-center justify-center">
        <Text className="text-sm text-[#BFBFBF]">暂无数据，请稍后再试</Text>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7]">
      <ScrollView scrollY className="px-4 pt-1 pb-24" style={{ height: '100vh' }}>
        {/* 今日节气 */}
        <SeasonHero result={result} />

        {/* 体质 + 每日建议 */}
        <ConstitutionCard result={result} />

        {/* 食材配对探索器入口 */}
        <View
          className="flex items-center justify-between rounded-2xl p-4 mb-4"
          style={{ background: 'linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%)' }}
          onClick={() => Taro.navigateTo({ url: '/pages/food/ingredient-pairing/index' })}
        >
          <View className="flex items-center gap-2">
            <Text className="text-2xl">🤝</Text>
            <View>
              <Text className="text-sm font-bold text-[#831843]">食材配对探索器</Text>
              <Text className="text-xs text-[#9D174D]">一种食材，告诉你能跟谁搭、适合谁</Text>
            </View>
          </View>
          <Text className="text-xs font-medium text-[#831843]">去探索 →</Text>
        </View>

        {/* 季节推荐食材 */}
        {result.seasonalIngredients.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-bold text-[#374151] mb-2">
              🌾 今日应季食材
            </Text>
            <View className="flex flex-wrap">
              {result.seasonalIngredients.map((key) => {
                const DISPLAY: Record<string, { name: string; emoji: string }> = {
                  jiang: { name: '生姜', emoji: '🫚' }, yangrou: { name: '羊肉', emoji: '🐑' },
                  jirou: { name: '鸡肉', emoji: '🐔' }, paigu: { name: '排骨', emoji: '🍖' },
                  dasuan: { name: '大蒜', emoji: '🧄' }, hetao: { name: '核桃', emoji: '🥜' },
                  nangua: { name: '南瓜', emoji: '🎃' }, hongzao: { name: '红枣', emoji: '🫘' },
                  guiyuan: { name: '桂圆', emoji: '🟤' }, shanzha: { name: '山楂', emoji: '🔴' },
                  cong: { name: '葱白', emoji: '🌿' }, lianou: { name: '莲藕', emoji: '🪷' },
                  fanqie: { name: '番茄', emoji: '🍅' }, bailuobo: { name: '白萝卜', emoji: '🥬' },
                  doufu: { name: '豆腐', emoji: '🍞' }, baicai: { name: '白菜', emoji: '🥬' },
                  bocai: { name: '菠菜', emoji: '🌿' }, muer: { name: '木耳', emoji: '🍄' },
                  lvdou: { name: '绿豆', emoji: '🫘' }, yinmi: { name: '薏米', emoji: '🌾' },
                  kugua: { name: '苦瓜', emoji: '🥒' }, donggua: { name: '冬瓜', emoji: '🟢' },
                  huanggua: { name: '黄瓜', emoji: '🥒' }, jinyinhua: { name: '金银花', emoji: '🌸' },
                  chenpi: { name: '陈皮', emoji: '🟠' }, xiangjiao: { name: '香蕉', emoji: '🍌' },
                }
                const info = DISPLAY[key] || { name: key, emoji: '🍽️' }
                return <IngredientTag key={key} name={info.name} emoji={info.emoji} />
              })}
            </View>
          </View>
        )}

        {/* 推荐排序 Tab */}
        <View className="mb-3">
          <View className="flex items-center justify-between">
            <Text className="text-sm font-bold text-[#374151]">
              💡 今日推荐匹配度排行
            </Text>
            <View
              className="px-2 py-1 rounded"
              style={{ background: '#F3F4F6' }}
              onClick={handleShuffle}
            >
              <Text className="text-xs text-[#6B7280]">🔄 换一批</Text>
            </View>
          </View>

          {/* 筛选 Tags */}
          <View className="flex gap-2 mt-2">
            {FILTER_OPTIONS.map((opt) => (
              <View
                key={opt.key}
                className="px-3 py-1.5 rounded-full"
                style={{
                  background: filter === opt.key ? '#78350F' : '#FFFFFF',
                  border: `1px solid ${filter === opt.key ? '#78350F' : '#E5E7EB'}`,
                }}
                onClick={() => setFilter(opt.key)}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: filter === opt.key ? '#FFFFFF' : '#6B7280' }}
                >
                  {opt.emoji} {opt.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 推荐列表 */}
        {filtered.length === 0 ? (
          <View className="py-10 text-center">
            <Text className="text-lg mb-2">🧐</Text>
            <Text className="text-sm text-[#9CA3AF]">当前筛选条件下暂无推荐</Text>
            <Text
              className="text-xs mt-2 font-medium"
              style={{ color: '#78350F' }}
              onClick={() => setFilter('all')}
            >
              查看全部推荐 →
            </Text>
          </View>
        ) : (
          <View>
            {filtered.map((item, i) => (
              <RecommendationCard key={`${item.type}-${item.name}`} item={item} rank={i} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* 底部固定分享/返回 */}
      <View
        className="fixed bottom-0 left-0 right-0 px-4 py-3"
        style={{
          background: 'linear-gradient(0deg, #FFFBF7 60%, transparent)',
          paddingBottom: Taro.getStorageSync('safeAreaBottom') || 20,
        }}
      >
        <View
          className="rounded-xl py-3 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}
          onClick={handleShare}
        >
          <Text className="text-sm font-semibold text-white">📸 分享今日食养</Text>
        </View>
      </View>

      {/* 分享卡弹窗 */}
      {showShareCard && (
        <View
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowShareCard(false)}
        >
          <View onClick={(e) => e.stopPropagation()} className="mb-4">
            <ShareCard result={result} />
          </View>
          <View className="flex gap-3">
            <View
              className="rounded-full px-8 py-3"
              style={{ background: 'rgba(255,255,255,0.9)' }}
              onClick={() => setShowShareCard(false)}
            >
              <Text className="text-sm text-[#6B7280]">关闭</Text>
            </View>
            <View
              className="rounded-full px-8 py-3"
              style={{ background: '#78350F' }}
              onClick={handleSaveShareCard}
            >
              <Text className="text-sm text-white">保存图片</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
