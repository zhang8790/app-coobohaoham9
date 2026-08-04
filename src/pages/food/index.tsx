// @title 食养中心
import { useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import {
  getTodayFoodTherapy,
  resolveConstitution,
  type TodayFoodTherapyResult,
} from '@/utils/today-food-therapy'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'

// 食养功能聚合：将分散在首页/用户中心/各独立页的食养入口收敛到单一 hub，避免重复入口
const FEATURES = [
  { key: 'today', icon: '🌟', label: '今日食养推荐', desc: '按节气与你体质挑好物', page: '/pages/food/today-food-therapy/index', color: '#9A3324' },
  { key: 'constitution', icon: '🧪', label: '食养偏好设置', desc: '读懂你的体质与口味', page: '/pages/food/constitution-test/index', color: '#C8A45C' },
  { key: 'pairing', icon: '🥘', label: '食材配对探索', desc: '什么食材更适合你', page: '/pages/food/ingredient-pairing/index', color: '#B5651D' },
  { key: 'family', icon: '👨‍👩‍👧', label: '家庭食养档案', desc: '全家人的食养参考', page: '/pages/food/family/index', color: '#9A3324' },
]

export default function FoodHubPage() {
  const { profile } = useAuth()

  // 复用 getTodayFoodTherapy 纯函数（零网络）：hub 无商品池，仅展示节气/体质维度的今日食养预览
  const today = useMemo<TodayFoodTherapyResult>(() => {
    return getTodayFoodTherapy(resolveConstitution(profile ?? null), null, [], new Set<string>())
  }, [profile])

  const go = (page: string) => Taro.navigateTo({ url: page })

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* Hero */}
      <View className="px-4 pt-6 pb-2">
        <Text className="text-2xl font-bold text-foreground">食养中心</Text>
        <Text className="text-sm text-muted-foreground block mt-1">顺时养生 · 一人一方 · 吃得明白</Text>
      </View>

      {/* 今日食养快捷预览（点看完整 → 今日食养推荐页） */}
      {today && (
        <View
          className="mx-4 rounded-2xl p-4 bg-card border border-border active:scale-[0.99] transition-transform"
          hoverClass="none"
          onClick={() => go('/pages/food/today-food-therapy/index')}
        >
          <View className="flex items-center justify-between mb-2">
            <View className="flex items-center gap-2 min-w-0">
              <Text className="text-2xl flex-shrink-0">{today.term?.emoji || '🌿'}</Text>
              <View className="min-w-0">
                <Text className="text-sm font-bold text-foreground">今日食养推荐</Text>
                {today.term && (
                  <Text className="text-xs text-muted-foreground block truncate">{today.term.name} · {today.term.natureLabel}</Text>
                )}
              </View>
            </View>
            <Text className="text-xs text-primary font-bold flex-shrink-0 ml-2">看完整 ›</Text>
          </View>

          {today.dailyAdvice && (
            <Text
              className="text-xs text-muted-foreground block"
              style={{ lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {today.dailyAdvice}
            </Text>
          )}

          {today.recommendations.length > 0 && (
            <View className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {today.recommendations.slice(0, 3).map((item, i) => (
                <View
                  key={i}
                  className="flex-shrink-0 rounded-xl px-3 py-2 bg-background border border-border flex items-center gap-2"
                  style={{ minWidth: 96 }}
                >
                  <Text className="text-lg flex-shrink-0">{item.emoji}</Text>
                  <View className="min-w-0">
                    <Text
                      className="text-xs font-bold text-foreground block"
                      style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {item.name}
                    </Text>
                    <Text className="text-[10px] text-primary">匹配 {item.score}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 顺时节气食盒：原独立「节气食盒」入口已并入食养中心，统一出口（保留订阅/一键加购能力） */}
      <View
        className="mx-4 mt-4 rounded-2xl p-4 bg-card border border-border flex items-center justify-between active:scale-[0.99] transition-transform"
        hoverClass="none"
        onClick={() => go('/pages/food/seasonal-box/index')}
      >
        <View className="flex items-center gap-3 min-w-0">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#9A33241a' }}>🍱</View>
          <View className="min-w-0">
            <Text className="text-base font-bold text-foreground">顺时节气食盒</Text>
            <Text className="text-xs text-muted-foreground">当季限定好物 · 订阅节气上新</Text>
          </View>
        </View>
        <Text className="text-xs text-primary font-bold flex-shrink-0 ml-2">前往 ›</Text>
      </View>

      {/* 食养功能九宫格 */}
      <View className="mx-4 mt-4 grid grid-cols-2 gap-3">
        {FEATURES.map((f) => (
          <View
            key={f.key}
            className="rounded-2xl p-4 bg-card border border-border flex flex-col gap-2 active:scale-[0.98] transition-transform"
            hoverClass="none"
            onClick={() => go(f.page)}
          >
            <View
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: `${f.color}1a` }}
            >
              {f.icon}
            </View>
            <Text className="text-base font-bold text-foreground">{f.label}</Text>
            <Text className="text-xs text-muted-foreground leading-snug">{f.desc}</Text>
          </View>
        ))}
      </View>

      <Text className="text-[10px] text-muted-foreground text-center block mt-6 px-6 leading-relaxed">
        {FOOD_THERAPY_DISCLAIMER}
      </Text>
    </View>
  )
}
