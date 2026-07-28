// @title 节气食盒订阅
import { useState, useEffect, useMemo } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, Image, Button, ScrollView } from '@tarojs/components'
import {
  SEASONAL_TERMS_2026,
  getCurrentTerm,
  getNextTerm,
  getDaysLeftInTerm,
  getTermNatureTags,
  isIngredientGoodForTerm,
  type SeasonalTerm,
} from '@/utils/seasonal-box'
import { INGREDIENT_DICT } from '@/utils/shiyang-dictionary'
import { getProducts } from '@/db/api'
import type { Product } from '@/db/types'

// 节气emoji大图映射
const TERM_ICONS: Record<string, string> = {
  xiaohan: '🫚', dahan: '🔥', lichun: '🌱', yushui: '🌧️',
  jingzhe: '⚡', chunfen: '🍃', qingming: '🌸', guyu: '🌾',
  xiaoman: '🌾', mangzhong: '☀️', xiazhi: '🌻', xiaoshu: '🌤️',
  dashu: '🌡️', liqiu: '🍂', chushu: '🍁', bailu: '💧',
  qiufen: '🍃', hanlu: '🍂', shuangjiang: '🌫️',
  lidong: '❄️', xiaoxue: '🌨️', daxue: '🏔️',
}

// 推荐食材小卡片
function IngredientChip({ name, nature, icon, color }: { name: string; nature: string; icon: string; color: string }) {
  const natureColor: Record<string, string> = {
    '温': '#DC2626', '微温': '#EA580C', '平': '#16A34A',
    '凉': '#0891B2', '微寒': '#0891B2', '寒': '#0284C7',
  }
  const nc = natureColor[nature] || '#6B7280'
  return (
    <View className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: nc + '14' }}>
      <Text className="text-base">{icon}</Text>
      <View>
        <Text className="text-xs font-medium" style={{ color: '#1A1A1A' }}>{name}</Text>
        <Text className="text-[10px]" style={{ color: nc }}>{nature}性</Text>
      </View>
    </View>
  )
}

// 推荐商品卡片
function ProductCard({ product, term }: { product: Product; term: SeasonalTerm }) {
  const natureColor: Record<string, string> = {
    '温': '#DC2626', '微温': '#EA580C', '平': '#16A34A',
    '凉': '#0891B2', '微寒': '#0891B2', '寒': '#0284C7',
  }
  const nature = product.overall_nature || '平'
  const nc = natureColor[nature] || '#6B7280'
  const savings = product.original_price && product.price < product.original_price
    ? (product.original_price - product.price).toFixed(0)
    : null

  return (
    <View
      className="bg-white rounded-2xl overflow-hidden flex-shrink-0"
      style={{ width: 150, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })}
    >
      <View className="relative">
        <Image
          src={product.image_url || ''}
          style={{ width: 150, height: 110, display: 'block' }}
          mode="aspectFill"
        />
        <View
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full"
          style={{ background: nc + '22', fontSize: 10 }}
        >
          <Text className="text-[10px] font-medium" style={{ color: nc }}>{nature}性</Text>
        </View>
        {savings && (
          <View className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-full" style={{ background: '#DC2626' }}>
            <Text className="text-[10px] text-white font-medium">省¥{savings}</Text>
          </View>
        )}
      </View>
      <View className="p-2.5">
        <Text className="text-xs font-medium text-[#1A1A1A] leading-snug" numberOfLines={2}>
          {product.name}
        </Text>
        <View className="flex items-baseline gap-1 mt-1.5">
          <Text className="text-sm font-bold text-[#DC2626]">¥{product.price.toFixed(1)}</Text>
          {product.original_price && product.original_price > product.price && (
            <Text className="text-[10px] text-[#BFBFBF] line-through">¥{product.original_price.toFixed(1)}</Text>
          )}
        </View>
      </View>
    </View>
  )
}

// 已订阅状态栏
function SubscriptionBanner({ term, daysLeft }: { term: SeasonalTerm; daysLeft: number }) {
  return (
    <View
      className="mx-4 rounded-2xl p-4 flex items-center justify-between"
      style={{ background: 'linear-gradient(135deg, ' + term.color + ' 0%, ' + term.colorEnd + ' 100%)' }}
    >
      <View className="flex-1">
        <Text className="text-sm font-bold text-[#1A1A1A]">您已订阅食盒上新提醒</Text>
        <Text className="text-xs text-[#6B7280] mt-1">
          {term.name}食盒 · 节气更替时优先通知上新
        </Text>
      </View>
      <View className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center">
        <Text className="text-xl">{TERM_ICONS[term.key] || term.emoji}</Text>
      </View>
    </View>
  )
}

// 食盒组成预览
function BoxComposition({ term, products }: { term: SeasonalTerm; products: Product[] }) {
  return (
    <View className="mt-4 px-4">
      <View className="flex items-center justify-between mb-3">
        <Text className="text-sm font-bold text-[#1A1A1A]">本节气食盒 · 推荐搭配</Text>
        <Text className="text-xs text-[#9A8070]">{products.length}款精选</Text>
      </View>
      <ScrollView scrollX className="whitespace-nowrap" style={{ paddingBottom: 4 }}>
        {products.slice(0, 6).map((p) => (
          <View key={p.id} className="inline-block mr-3">
            <ProductCard product={p} term={term} />
          </View>
        ))}
      </ScrollView>
      {products.length > 6 && (
        <Text className="text-xs text-[#9A8070] text-center mt-2">
          还有 {products.length - 6} 款可选
        </Text>
      )}
    </View>
  )
}

// 节气知识卡
function TermKnowledgeCard({ term }: { term: SeasonalTerm }) {
  return (
    <View
      className="mx-4 mt-4 rounded-2xl p-4"
      style={{ background: 'linear-gradient(135deg, #FAFAF9 0%, #F5F3EF 100%)' }}
    >
      <View className="flex items-center gap-2 mb-2">
        <Text className="text-lg">{TERM_ICONS[term.key] || term.emoji}</Text>
        <View>
          <Text className="text-sm font-bold text-[#1A1A1A]">{term.name}</Text>
          <Text className="text-xs text-[#9A8070]">{term.pinyin} · {term.weatherDesc}</Text>
        </View>
      </View>
      <View className="mt-2">
        <View className="flex items-start gap-1.5 mb-1.5">
          <Text className="text-[10px] text-[#16A34A] font-bold mt-0.5">宜</Text>
          <Text className="text-xs text-[#374151] flex-1 leading-relaxed">{term.principle}</Text>
        </View>
        <View className="flex items-start gap-1.5">
          <Text className="text-[10px] text-[#D97706] font-bold mt-0.5">俗</Text>
          <Text className="text-xs text-[#9A8070] flex-1 leading-relaxed italic">{term.folkWisdom}</Text>
        </View>
      </View>
    </View>
  )
}

// 应季食材清单
function SeasonIngredients({ term }: { term: SeasonalTerm }) {
  const goods = term.recommendIngredients
    .map((key) => INGREDIENT_DICT[key])
    .filter(Boolean)

  return (
    <View className="mt-4 px-4">
      <View className="flex items-center justify-between mb-3">
        <Text className="text-sm font-bold text-[#1A1A1A]">应季食材</Text>
        <View className="flex items-center gap-1">
          <View className="w-2 h-2 rounded-full" style={{ background: '#DC2626' }} />
          <Text className="text-xs text-[#9A8070]">{term.nature} · {goods.length}种</Text>
        </View>
      </View>
      <View className="flex flex-wrap gap-2">
        {goods.map((ing) =>
          ing ? (
            <IngredientChip
              key={ing.zh}
              name={ing.zh}
              nature={ing.nature}
              icon={ing.icon}
              color={ing.color}
            />
          ) : null
        )}
      </View>
    </View>
  )
}

// 下一个节气预告
function NextTermCard({ term, daysLeft }: { term: SeasonalTerm; daysLeft: number }) {
  return (
    <View
      className="mx-4 mt-4 rounded-2xl p-4 border border-dashed"
      style={{ borderColor: '#E5E7EB' }}
      onClick={() => Taro.navigateTo({ url: `/pages/food/seasonal-box/index?term=${term.key}` })}
    >
      <View className="flex items-center justify-between">
        <View>
          <Text className="text-xs text-[#9A8070]">下一个节气</Text>
          <View className="flex items-center gap-2 mt-1">
            <Text className="text-xl">{TERM_ICONS[term.key] || term.emoji}</Text>
            <View>
              <Text className="text-sm font-bold text-[#1A1A1A]">{term.name}</Text>
              <Text className="text-xs text-[#9A8070]">{daysLeft}天后开始 · {term.nature}</Text>
            </View>
          </View>
        </View>
        <Text className="text-[#BFBFBF] text-sm">→</Text>
      </View>
    </View>
  )
}

export default function SeasonalBoxPage() {
  const router = useRouter()
  const [currentTerm, setCurrentTerm] = useState<SeasonalTerm | null>(null)
  const [nextTerm, setNextTerm] = useState<SeasonalTerm | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subscribedTermKey, setSubscribedTermKey] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [detailTerm, setDetailTerm] = useState<SeasonalTerm | null>(null)

  // 从 URL 参数读取特定节气
  const paramTermKey = router.params.term

  useEffect(() => {
    const now = new Date()
    const current = paramTermKey
      ? SEASONAL_TERMS_2026.find((t) => t.key === paramTermKey) || getCurrentTerm(now)
      : getCurrentTerm(now)
    const next = getNextTerm(now)

    setCurrentTerm(current)
    setNextTerm(next)
    setDetailTerm(current)

    // 读取订阅状态
    const sub = Taro.getStorageSync('__seasonal_box_subscription')
    if (sub) {
      setSubscribed(true)
      setSubscribedTermKey(sub.termKey)
    }

    // 加载推荐商品
    loadProducts(current)
  }, [])

  const loadProducts = async (term: SeasonalTerm | null) => {
    if (!term) return
    setLoadingProducts(true)
    try {
      const natureTags = getTermNatureTags(term)
      const all = await getProducts({ limit: 40 })
      // 过滤出适合当前节气的商品（按性味匹配）
      const filtered = all.filter((p) => {
        const nature = p.overall_nature || '平'
        const verdict = isIngredientGoodForTerm(nature, term)
        return verdict === 'good' || verdict === 'neutral'
      })
      setProducts(filtered.length > 0 ? filtered : all.slice(0, 12))
    } catch (e) {
      console.error('[SeasonalBox] 加载商品失败', e)
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }

  const daysLeft = currentTerm ? getDaysLeftInTerm(currentTerm) : 0

  const handleSubscribe = () => {
    if (!currentTerm) return
    Taro.setStorageSync('__seasonal_box_subscription', {
      termKey: currentTerm.key,
      subscribedAt: new Date().toISOString(),
    })
    setSubscribed(true)
    setSubscribedTermKey(currentTerm.key)
    Taro.showToast({ title: `已订阅${currentTerm.name}食盒上新提醒`, icon: 'success' })
  }

  const handleCancelSubscribe = () => {
    Taro.removeStorageSync('__seasonal_box_subscription')
    setSubscribed(false)
    setSubscribedTermKey(null)
    Taro.showToast({ title: '已取消订阅', icon: 'none' })
  }

  if (!currentTerm) {
    return (
      <View className="min-h-screen bg-[#FFFBF7] flex items-center justify-center">
        <Text className="text-sm text-[#9A8070]">加载中...</Text>
      </View>
    )
  }

  const displayTerm = detailTerm || currentTerm

  return (
    <View className="min-h-screen bg-[#F9F7F4] pb-8">
      {/* 顶部 Hero */}
      <View
        className="px-5 pt-6 pb-8"
        style={{
          background: 'linear-gradient(180deg, ' + displayTerm.color + ' 0%, ' + displayTerm.colorEnd + ' 100%)',
          borderBottomLeftRadius: '24px',
          borderBottomRightRadius: '24px',
        }}
      >
        {/* 日期区间 */}
        <Text className="text-xs text-white/80">
          {displayTerm.startDate} — {displayTerm.endDate}
        </Text>

        {/* 节气主标题 */}
        <View className="flex items-center gap-3 mt-3 mb-2">
          <Text className="text-5xl">{TERM_ICONS[displayTerm.key] || displayTerm.emoji}</Text>
          <View>
            <Text className="text-3xl font-bold text-white">{displayTerm.name}</Text>
            <Text className="text-sm text-white/80 mt-0.5">{displayTerm.pinyin}</Text>
          </View>
        </View>

        {/* 食养主方向 */}
        <View className="flex items-center gap-2 mt-3">
          <View className="px-3 py-1 rounded-full bg-white/20">
            <Text className="text-xs text-white font-medium">{displayTerm.nature}</Text>
          </View>
          <Text className="text-xs text-white/80">{displayTerm.natureDesc}</Text>
        </View>

        {/* 剩余天数 */}
        <View className="flex items-center gap-2 mt-4">
          <View className="px-3 py-1.5 rounded-xl bg-white/15">
            <Text className="text-xs text-white">
              节气内剩余 <Text className="font-bold text-white">{daysLeft}</Text> 天
            </Text>
          </View>
          {nextTerm && (
            <Text className="text-xs text-white/70">
              下个节气：{nextTerm.name}
            </Text>
          )}
        </View>
      </View>

      {/* 订阅状态栏 */}
      {subscribed && subscribedTermKey === currentTerm?.key && (
        <View className="-mt-4 mx-4">
          <SubscriptionBanner term={currentTerm} daysLeft={daysLeft} />
        </View>
      )}

      <ScrollView scrollY className="flex-1 mt-4">
        {/* 订阅按钮（未订阅时显示） */}
        {!subscribed && (
          <View className="px-4 mt-1">
            <View
              className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)' }}
            >
              <View className="flex items-center justify-between">
                <View>
                  <Text className="text-sm font-bold text-[#16A34A]">🌿 {displayTerm.boxTheme}</Text>
                  <Text className="text-xs text-[#16A34A]/70 mt-1">{displayTerm.boxCopy}</Text>
                  <Text className="text-[10px] text-[#16A34A]/50 mt-0.5">
                    {displayTerm.recommendIngredients.length}种应季食材精选搭配
                  </Text>
                </View>
                <Button
                  className="rounded-full py-2 px-4 text-xs font-medium text-white"
                  style={{ background: '#16A34A', fontSize: 12 }}
                  onClick={handleSubscribe}
                >
                  订阅上新提醒
                </Button>
              </View>
            </View>
          </View>
        )}

        {/* 已订阅 → 取消订阅入口 */}
        {subscribed && subscribedTermKey === currentTerm?.key && (
          <View className="px-4 mt-2">
            <Button
              className="text-xs text-[#9A8070]"
              style={{ background: 'transparent', fontSize: 12, lineHeight: 1 }}
              onClick={handleCancelSubscribe}
            >
              取消订阅
            </Button>
          </View>
        )}

        {/* 节气知识卡 */}
        <TermKnowledgeCard term={displayTerm} />

        {/* 应季食材 */}
        <SeasonIngredients term={displayTerm} />

        {/* 食盒推荐商品 */}
        <View className="mt-5 px-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="text-sm font-bold text-[#1A1A1A]">节气推荐好物</Text>
            <Text className="text-xs text-[#9A8070]">
              {loadingProducts ? '加载中...' : `${products.length}款可选`}
            </Text>
          </View>
          <ScrollView scrollX className="whitespace-nowrap" style={{ paddingBottom: 4 }}>
            {products.length === 0 && !loadingProducts ? (
              <View className="py-6 text-center">
                <Text className="text-xs text-[#BFBFBF]">暂无推荐商品，请先添加商品</Text>
              </View>
            ) : (
              products.map((p) => (
                <View key={p.id} className="inline-block mr-3">
                  <ProductCard product={p} term={displayTerm} />
                </View>
              ))
            )}
          </ScrollView>
        </View>

        {/* 下个节气预告 */}
        {nextTerm && (
          <NextTermCard
            term={nextTerm}
            daysLeft={getDaysLeftInTerm(nextTerm)}
          />
        )}

        {/* 免责声明 */}
        <View className="px-4 mt-6">
          <Text className="text-[10px] text-[#BFBFBF] leading-relaxed">
            * 本页面食养建议仅供参考，不替代医疗诊断。节气体质判定基于传统食养经验，个体差异请以医嘱为准。如有特殊健康状况，请咨询专业医师后选择食材。
          </Text>
        </View>

        <View className="h-6" />
      </ScrollView>
    </View>
  )
}
