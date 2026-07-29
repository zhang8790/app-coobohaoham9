// @title 食材配对探索器
// 输入一种食材 → 告诉适合什么季节、适合什么体质、跟什么搭配更好
// 教育型功能，适合社群 / 小红书分享裂变
import { useState } from 'react'
import { getCurrentInstance } from '@tarojs/taro'
import Taro, { useShareAppMessage } from '@tarojs/taro'
import { View, Text, ScrollView, Input, Button } from '@tarojs/components'
import {
  INGREDIENT_LIST,
  searchIngredients,
  getIngredientPairing,
  type IngredientPairingResult,
} from '@/utils/food-therapy/ingredient-pairing'

// 性味 → 标签配色
const NATURE_COLOR: Record<string, string> = {
  '温': '#B45309',
  '微温': '#C2772E',
  '平': '#6B7280',
  '凉': '#0E7490',
  '微寒': '#0891B2',
  '寒': '#1D4ED8',
}

// 热门速选（挑常用、好讲搭配故事的食材）
const HOT_KEYS = [
  'shanzha', 'jiang', 'hongzao', 'yiner', 'lvdou', 'chenpi',
  'hetao', 'shanyao', 'yangrou', 'huangqi', 'hongtang', 'niunai',
]

function NatureBadge({ nature }: { nature: string }) {
  const color = NATURE_COLOR[nature] || '#6B7280'
  return (
    <View className="px-2.5 py-1 rounded-full" style={{ background: color + '1A' }}>
      <Text className="text-xs font-medium" style={{ color }}>{nature}性</Text>
    </View>
  )
}

function Chip({ label, color = '#78350F', bg }: { label: string; color?: string; bg?: string }) {
  return (
    <View
      className="px-3 py-1.5 rounded-full mr-2 mb-2"
      style={{ background: bg || color + '14' }}
    >
      <Text className="text-xs font-medium" style={{ color }}>{label}</Text>
    </View>
  )
}

// ── 搜索 / 速选区 ─────────────────────────────────────────────────────
function Picker({
  query,
  onQuery,
  onPick,
}: {
  query: string
  onQuery: (v: string) => void
  onPick: (key: string) => void
}) {
  const results = query ? searchIngredients(query) : []
  const hotItems = HOT_KEYS.map((k) => INGREDIENT_LIST.find((i) => i.key === k)).filter(Boolean) as typeof INGREDIENT_LIST

  return (
    <View className="mb-4">
      {/* 搜索框 */}
      <View
        className="flex items-center px-4 py-3 rounded-2xl bg-white mb-3"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <Text className="text-base mr-2">🔍</Text>
        <Input
          className="flex-1 text-sm text-[#374151]"
          placeholder="搜一种食材，如：山楂 / 红糖 / 羊肉"
          placeholderStyle="color:#BFBFBF"
          value={query}
          onInput={(e) => onQuery(e.detail.value as string)}
        />
        {query ? (
          <Text className="text-xs text-[#9CA3AF]" onClick={() => onQuery('')}>清除</Text>
        ) : null}
      </View>

      {/* 搜索结果下拉 */}
      {query ? (
        <View className="rounded-2xl bg-white p-2 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {results.length === 0 ? (
            <View className="py-4 text-center">
              <Text className="text-xs text-[#9CA3AF]">没找到「{query}」，换个词试试～</Text>
            </View>
          ) : (
            results.slice(0, 8).map(({ key, entry }) => (
              <View
                key={key}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ borderBottom: '1px solid #F3F4F6' }}
                onClick={() => onPick(key)}
              >
                <Text className="text-xl">{entry.icon}</Text>
                <Text className="text-sm font-medium text-[#374151] flex-1">{entry.zh}</Text>
                <Text className="text-xs" style={{ color: NATURE_COLOR[entry.nature] || '#6B7280' }}>{entry.nature}</Text>
              </View>
            ))
          )}
        </View>
      ) : (
        // 热门速选
        <View>
          <Text className="text-xs text-[#9CA3AF] mb-2">热门食材，点一点试试</Text>
          <View className="flex flex-wrap">
            {hotItems.map(({ key, entry }) => (
              <View
                key={key}
                className="flex items-center gap-1 px-3 py-2 rounded-full mr-2 mb-2 bg-white"
                style={{ border: '1px solid #E5E7EB' }}
                onClick={() => onPick(key)}
              >
                <Text className="text-sm">{entry.icon}</Text>
                <Text className="text-xs font-medium text-[#374151]">{entry.zh}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

// ── 结果卡 ────────────────────────────────────────────────────────────
function ResultCard({ result, onShare }: { result: IngredientPairingResult; onShare: () => void }) {
  const { ingredient, suitableSeasons, suitableConstitutions, pairings, copy } = result

  const handleCopy = () => {
    Taro.setClipboardData({
      data: copy,
      success: () => Taro.showToast({ title: '食养文案已复制', icon: 'success', duration: 1500 }),
    })
  }

  return (
    <View>
      {/* 食材概览 */}
      <View className="rounded-2xl p-5 mb-4 bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <View className="flex items-center gap-3 mb-3">
          <View
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: ingredient.color + '1A' }}
          >
            <Text className="text-3xl">{ingredient.icon}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-[#374151]">{ingredient.zh}</Text>
            <View className="flex items-center gap-2 mt-1">
              <NatureBadge nature={ingredient.nature} />
            </View>
          </View>
        </View>

        {/* 功效 */}
        <View className="flex flex-wrap gap-2 mb-3">
          {ingredient.benefits.map((b, i) => (
            <Chip key={i} label={b} color="#B45309" bg="#FEF3C7" />
          ))}
        </View>

        {/* 适合季节 */}
        <View className="mb-3">
          <Text className="text-xs font-medium text-[#9CA3AF] mb-2">🌤 适合的季节</Text>
          <View className="flex flex-wrap">
            {suitableSeasons.map((s, i) => (
              <Chip key={i} label={s} color="#0E7490" bg="#ECFEFF" />
            ))}
          </View>
        </View>

        {/* 适合体质 */}
        <View className="mb-1">
          <Text className="text-xs font-medium text-[#9CA3AF] mb-2">🧬 适合的人群 / 体质</Text>
          <View className="flex flex-wrap">
            {suitableConstitutions.length === 0 ? (
              <Text className="text-xs text-[#9CA3AF]">大多数人都适合，适量即可</Text>
            ) : (
              suitableConstitutions.map((c, i) => (
                <Chip key={i} label={c} color="#78350F" />
              ))
            )}
          </View>
        </View>
      </View>

      {/* 推荐搭配 */}
      <Text className="text-base font-bold text-[#374151] mb-3">🤝 跟它这样搭更好</Text>
      {pairings.length === 0 ? (
        <View className="rounded-2xl p-4 mb-4 bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Text className="text-sm text-[#9CA3AF]">
            暂时还没收录{ingredient.zh}的经典搭配，换个食材看看，或关注我们后续更新～
          </Text>
        </View>
      ) : (
        pairings.map((p, i) => (
          <View key={i} className="rounded-2xl p-4 mb-3 bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {/* 搭配对象 */}
            <View className="flex items-center gap-2 mb-2 flex-wrap">
              {p.partners.map((pt, j) => (
                <View
                  key={j}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full"
                  style={{ background: pt.color + '1A' }}
                >
                  <Text className="text-base">{pt.icon}</Text>
                  <Text className="text-xs font-medium text-[#374151]">{pt.zh}</Text>
                </View>
              ))}
              <Text className="text-xs text-[#9CA3AF]">＋ {ingredient.zh}</Text>
            </View>

            {/* 为什么这样搭 */}
            <Text className="text-sm leading-relaxed text-[#4B5563] mb-2.5">{p.reason}</Text>

            {/* 适合谁 */}
            {p.goodFor.length > 0 && (
              <View className="flex flex-wrap">
                {p.goodFor.map((g, j) => (
                  <Chip key={j} label={g} color="#92400E" bg="#FEF3C7" />
                ))}
              </View>
            )}
          </View>
        ))
      )}

      {/* 分享 / 复制 */}
      <View className="flex gap-3 mt-2 mb-6">
        <View
          className="flex-1 rounded-xl py-3 flex items-center justify-center"
          style={{ background: '#F3F4F6' }}
          onClick={handleCopy}
        >
          <Text className="text-sm font-medium text-[#6B7280]">📋 复制文案</Text>
        </View>
        <Button
          className="flex-1 rounded-xl py-3 m-0 border-0"
          style={{
            background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)',
            lineHeight: 'normal',
          }}
          openType="share"
        >
          <Text className="text-sm font-semibold text-white">📤 分享给朋友</Text>
        </Button>
      </View>

      {/* 免责声明 */}
      <View className="px-3 py-2.5 rounded-lg mb-6" style={{ background: '#F9FAFB' }}>
        <Text className="text-[10px] leading-relaxed text-[#9CA3AF]">
          以上为传统食养文化参考，个体差异较大，不能替代专业医疗建议。如有不适请及时就医。
        </Text>
      </View>
    </View>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────
export default function IngredientPairingPage() {
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const result = selectedKey ? getIngredientPairing(selectedKey) : null

  // 分享链接带 ?key= 时直接定位食材
  if (selectedKey === null) {
    const paramKey = getCurrentInstance().router?.params?.key
    if (paramKey && getIngredientPairing(paramKey)) {
      // 延迟到首次渲染后再设置，避免 React 警告
      setTimeout(() => setSelectedKey(paramKey), 0)
    }
  }

  const handlePick = (key: string) => {
    setSelectedKey(key)
    setQuery('')
    Taro.pageScrollTo({ scrollTop: 0, duration: 200 }).catch(() => {})
  }

  // 分享给朋友（微信转发）
  useShareAppMessage(() => {
    const name = selectedKey ? (getIngredientPairing(selectedKey)?.ingredient.zh ?? '食养') : '食养'
    return {
      title: selectedKey
        ? `${name}怎么吃更好？来「来电有喜」看食材配对 →`
        : '食材配对探索器 · 来电有喜',
      path: '/pages/food/ingredient-pairing/index' + (selectedKey ? `?key=${selectedKey}` : ''),
    }
  })

  return (
    <View className="min-h-screen bg-[#FFFBF7]">
      <ScrollView scrollY className="px-4 pt-2 pb-12" style={{ height: '100vh' }}>
        {/* 头部 */}
        <View className="mb-4">
          <Text className="text-xl font-bold text-[#374151]">🤝 食材配对探索器</Text>
          <Text className="text-xs text-[#9CA3AF] mt-1 block">
            输入一种食材，看看适合什么季节、什么体质，跟什么搭更好
          </Text>
        </View>

        {/* 搜索 / 速选 */}
        <Picker query={query} onQuery={setQuery} onPick={handlePick} />

        {/* 结果 */}
        {result ? (
          <ResultCard result={result} onShare={() => {}} />
        ) : (
          <View className="rounded-2xl p-6 bg-white text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <Text className="text-3xl mb-2">🥢</Text>
            <Text className="text-sm text-[#9CA3AF]">选一种食材，开始你的食养探索</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
