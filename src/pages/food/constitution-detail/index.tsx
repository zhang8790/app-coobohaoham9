// @title 体质详情（九种体质一级类目 · 点选了解）
import { useMemo } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { CONSTITUTION_TYPES, type ConstitutionType } from '@/utils/constitution-test'
import { safeGoal } from '@/utils/compliance/shield'

// 调理阶段 → 友好文案（与「清通调补固」路径对齐）
const STAGE_LABEL: Record<string, string> = {
  '补': '温补增益',
  '清': '清润舒缓',
  '通': '通利化湿',
  '调': '疏调气机',
  '固': '固护本元',
}

export default function ConstitutionDetailPage() {
  const router = useRouter()
  const key = (router.params.key as string) || ''
  const t = CONSTITUTION_TYPES[key] as ConstitutionType | undefined

  const stageLabel = useMemo(
    () => (t ? STAGE_LABEL[t.recommendStage] ?? t.recommendStage : ''),
    [t],
  )

  const go = (page: string) => Taro.navigateTo({ url: page })

  if (!t) {
    return (
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <Text className="text-sm text-muted-foreground text-center">未找到该体质信息</Text>
      </View>
    )
  }

  return (
    <ScrollView className="min-h-screen bg-background" scrollY>
      <View className="px-4 pt-4 pb-10">
        {/* 头部：emoji + 名称 + 描述 */}
        <View className="rounded-2xl p-5 bg-card border border-border flex flex-col items-center text-center">
          <Text style={{ fontSize: '64rpx', lineHeight: '72rpx' }}>{t.emoji}</Text>
          <Text className="text-xl font-bold text-foreground mt-2">{t.name}</Text>
          <Text className="text-xs text-muted-foreground mt-2 leading-relaxed px-2">{t.description}</Text>
        </View>

        {/* 体质特征 */}
        <View className="mt-4 rounded-2xl p-4 bg-card border border-border">
          <Text className="text-base font-bold text-foreground block mb-3">体质特征</Text>
          <View className="flex flex-wrap gap-2">
            {t.characteristics.map((c, i) => (
              <View key={i} className="px-3 py-1.5 rounded-full" style={{ background: 'hsl(var(--primary) / 0.08)' }}>
                <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 宜食 / 少食 性味 */}
        <View className="mt-4 rounded-2xl p-4 bg-card border border-border">
          <Text className="text-base font-bold text-foreground block mb-3">宜食 · 少食性味</Text>
          <View className="flex flex-wrap gap-2 mb-3">
            {t.recommendNature.map((n, i) => (
              <View key={i} className="px-3 py-1.5 rounded-full" style={{ background: 'hsl(145 60% 45% / 0.12)' }}>
                <Text className="text-xs" style={{ color: 'hsl(145 60% 35%)' }}>宜 {n}</Text>
              </View>
            ))}
          </View>
          <View className="flex flex-wrap gap-2">
            {t.avoidNature.length > 0 ? (
              t.avoidNature.map((n, i) => (
                <View key={i} className="px-3 py-1.5 rounded-full" style={{ background: 'hsl(0 60% 50% / 0.1)' }}>
                  <Text className="text-xs" style={{ color: 'hsl(0 60% 45%)' }}>少 {n}</Text>
                </View>
              ))
            ) : (
              <Text className="text-xs text-muted-foreground">无明显忌口</Text>
            )}
          </View>
        </View>

        {/* 食养方向（健康目标经 safeGoal 净化，零违禁词） */}
        <View className="mt-4 rounded-2xl p-4 bg-card border border-border">
          <Text className="text-base font-bold text-foreground block mb-3">食养方向</Text>
          <View className="flex flex-wrap gap-2">
            {t.healthGoals.length > 0 ? (
              t.healthGoals.map((g, i) => (
                <View key={i} className="px-3 py-1.5 rounded-full" style={{ background: 'hsl(var(--primary) / 0.12)' }}>
                  <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>{safeGoal(g)}</Text>
                </View>
              ))
            ) : (
              <Text className="text-xs text-muted-foreground">日常平补即可</Text>
            )}
          </View>
        </View>

        {/* 调理侧重 */}
        <View className="mt-4 rounded-2xl p-4 bg-card border border-border flex items-center justify-between">
          <Text className="text-base font-bold text-foreground">调理侧重</Text>
          <Text className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }}>{stageLabel}</Text>
        </View>

        {/* CTA：去自测 */}
        <View
          className="mt-5 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
          style={{ background: 'hsl(var(--primary))' }}
          hoverClass="none"
          onClick={() => go('/pages/food/tongue/index')}
        >
          <View className="min-w-0">
            <Text className="text-base font-bold text-white">想确认自己偏向这类体质？</Text>
            <Text className="text-xs text-white" style={{ opacity: 0.9, marginTop: '2rpx' }}>做一次食养评估，看九体质得分排序</Text>
          </View>
          <Text className="text-sm font-bold text-white flex-shrink-0 ml-2">去测 ›</Text>
        </View>

        <Text className="text-[10px] text-muted-foreground text-center block mt-6 px-6 leading-relaxed">
          以上为食养参考，依据传统体质分类整理，不替代专业诊断与医嘱。
        </Text>
      </View>
    </ScrollView>
  )
}
