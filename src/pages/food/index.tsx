// @title 食养中心
import { useMemo, useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import {
  getTodayFoodTherapy,
  resolveConstitution,
  type TodayFoodTherapyResult,
} from '@/utils/today-food-therapy'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import { getUserHealthProfile } from '@/db/food-api'
import { profileToCrowds, type Crowd } from '@/utils/food-therapy'

// 食养功能聚合：将分散在首页/用户中心/各独立页的食养入口收敛到单一 hub，避免重复入口
const FEATURES = [
  { key: 'today', icon: '🌟', label: '今日食养推荐', desc: '按节气与你体质挑好物', page: '/pages/food/today-food-therapy/index', color: '#9A3324' },
  { key: 'constitution', icon: '🧪', label: '食养偏好设置', desc: '读懂你的体质与口味', page: '/pages/food/constitution-test/index', color: '#C8A45C' },
  { key: 'pairing', icon: '🥘', label: '食材配对探索', desc: '什么食材更适合你', page: '/pages/food/ingredient-pairing/index', color: '#B5651D' },
  { key: 'family', icon: '👨‍👩‍👧', label: '家庭食养档案', desc: '全家人的食养参考', page: '/pages/food/family/index', color: '#9A3324' },
]

export default function FoodHubPage() {
  const { profile } = useAuth()

  // 读取用户结构化食养档案（V1），驱动「按档案智能匹配零食类目」
  const [userProfile, setUserProfile] = useState<{ body_states?: string[]; chronic_conditions?: string[] } | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    let alive = true
    getUserHealthProfile(profile.id)
      .then((p) => { if (alive && p) setUserProfile(p as any) })
      .catch(() => {})
    return () => { alive = false }
  }, [profile?.id])

  // 由结构化档案推导人群（body_states + chronic_conditions），供智能匹配分档
  const profileCrowds = useMemo<Crowd[]>(() => (userProfile ? profileToCrowds(userProfile as any) : []), [userProfile])

  // 自研食疗算法：画像人群 → 高相关零食类目（千人千面匹配，点按直达对应需求筛选页）
  const SCENE_BY_CROWD: Array<{ kw: string[]; scene: string; label: string; emoji: string }> = [
    { kw: ['儿童', '成长', '宝'], scene: 'children', label: '宝宝零食', emoji: '👶' },
    { kw: ['糖', '血糖'], scene: 'sugar', label: '控糖专场', emoji: '🍬' },
    { kw: ['眠', '安神', '失眠'], scene: 'sleep', label: '晚安助眠', emoji: '😴' },
    { kw: ['老年', '三高', '血压'], scene: 'elderly', label: '老年养生', emoji: '🧓' },
    { kw: ['免疫', '体虚'], scene: 'immunity', label: '增强免疫', emoji: '💪' },
    { kw: ['过敏'], scene: 'allergy', label: '敏感防护', emoji: '🛡️' },
    { kw: ['消化', '脾胃', '胃'], scene: 'digestion', label: '消化调理', emoji: '🫗' },
    { kw: ['孕', '产'], scene: 'pregnant', label: '孕产营养', emoji: '🤰' },
  ]
  const matchedScenes = useMemo(() => {
    const out: Array<{ scene: string; label: string; emoji: string }> = []
    for (const rule of SCENE_BY_CROWD) {
      if (profileCrowds.some((c) => rule.kw.some((k) => c.includes(k)))) out.push({ scene: rule.scene, label: rule.label, emoji: rule.emoji })
    }
    return out
  }, [profileCrowds])

  // 复用 getTodayFoodTherapy 纯函数（零网络）：hub 无商品池，仅展示节气/体质维度的今日食养预览
  const today = useMemo<TodayFoodTherapyResult>(() => {
    return getTodayFoodTherapy(resolveConstitution(profile ?? null), null, [], new Set<string>())
  }, [profile])

  const go = (page: string) => Taro.navigateTo({ url: page })

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* Hero */}
      <View className="px-4 pt-6 pb-2">
        <Text className="text-2xl font-bold text-foreground">药食同源食养方案库</Text>
        <Text className="text-sm text-muted-foreground block mt-1">四季食疗 · 慢病忌口 · 食材搭配禁忌 · 定制零食清单</Text>
      </View>

      {/* 自研食疗算法 · 按档案智能匹配零食类目（千人千面，点按直达对应零食类目） */}
      <View className="mx-4 mt-3 rounded-2xl p-4 bg-card border border-border">
        <View className="flex items-center gap-2 mb-3">
          <Text className="text-xl">🤖</Text>
          <View className="min-w-0">
            <Text className="text-base font-bold text-foreground block">根据你的食养档案智能匹配</Text>
            <Text className="text-xs text-muted-foreground block mt-0.5">内嵌自研食疗算法 · 自动挑对零食类目</Text>
          </View>
        </View>

        {matchedScenes.length > 0 ? (
          <View className="flex flex-wrap gap-2 mb-3">
            {matchedScenes.map((s) => (
              <View
                key={s.scene}
                className="flex items-center gap-1 px-3 py-2 rounded-full active:scale-95 transition-transform"
                style={{ background: 'hsl(var(--primary) / 0.12)' }}
                hoverClass="none"
                onClick={() => go(`/pages/food/need-find/index?scene=${s.scene}`)}
              >
                <Text style={{ fontSize: 15 }}>{s.emoji}</Text>
                <Text className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }}>{s.label}</Text>
                <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>›</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-muted-foreground block mb-3">完善「食养偏好设置」后，这里会出现为你定制的零食类目</Text>
        )}

        {/* 全部零食类目：点按直达对应需求筛选 */}
        <View className="flex flex-wrap gap-2">
          {SCENE_BY_CROWD.map((s) => (
            <View
              key={s.scene}
              className="flex items-center gap-1 px-3 py-2 rounded-full bg-background border border-border active:scale-95 transition-transform"
              hoverClass="none"
              onClick={() => go(`/pages/food/need-find/index?scene=${s.scene}`)}
            >
              <Text style={{ fontSize: 14 }}>{s.emoji}</Text>
              <Text className="text-xs text-foreground">{s.label}</Text>
            </View>
          ))}
        </View>
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
