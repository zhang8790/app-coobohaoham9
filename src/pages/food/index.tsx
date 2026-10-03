// @title 食养中心
import { useMemo, useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import { useAuth } from '@/contexts/AuthContext'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import { getUserHealthProfile } from '@/db/food-api'
import { profileToCrowds, type Crowd } from '@/utils/food-therapy'

// 食养中心收敛为「千人千面」单一价值：商品由自研食疗算法按食养档案自动推荐（千人千面，看的产品不同）。
// 已删除（入口重复 / 不加分，2026-09-19）：今日食养推荐、顺时节气食盒(订阅)、食材配对探索、
// 家庭食养档案、食安侦探局；仅保留「食养偏好设置」——档案是匹配算法的输入，二者构成闭环。
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
 // 展示标签已合规化（原「控糖专场/晚安助眠/增强免疫」偏促销 / 功能宣称，有《广告法》风险）；
 // kw 为内部匹配关键字（不渲染），保持不变以免影响千人千面命中。
const SCENE_BY_CROWD: Array<{ kw: string[]; scene: string; label: string }> = [
 { kw: ['儿童', '成长', '宝'], scene: 'children', label: '宝宝零食' },
 { kw: ['糖', '血糖'], scene: 'sugar', label: '低糖食养' },
 { kw: ['眠', '安神', '失眠'], scene: 'sleep', label: '舒心食养' },
 { kw: ['老年', '三高', '血压'], scene: 'elderly', label: '老年养生' },
 { kw: ['免疫', '体虚'], scene: 'immunity', label: '温润食养' },
 { kw: ['过敏'], scene: 'allergy', label: '敏感防护' },
 { kw: ['消化', '脾胃', '胃'], scene: 'digestion', label: '肠胃食养' },
 { kw: ['孕', '产'], scene: 'pregnant', label: '孕产营养' },
]
 const matchedScenes = useMemo(() => {
 const out: Array<{ scene: string; label: string }> = []
 for (const rule of SCENE_BY_CROWD) {
 if (profileCrowds.some((c) => rule.kw.some((k) => c.includes(k)))) out.push({ scene: rule.scene, label: rule.label })
 }
 return out
 }, [profileCrowds])

 const go = (page: string) => Taro.navigateTo({ url: page })

 return (
 <View className="min-h-screen bg-background pb-10" aria-label="食养中心">
 {/* Hero */}
 <View className="px-4 pt-6 pb-2">
 <Text className="text-2xl font-bold text-foreground">你的专属食养清单</Text>
 <Text className="text-sm text-muted-foreground block mt-1">体质调养 · 按你的食养档案自动推荐，看的产品不同</Text>
 </View>

 {/* 自研食疗算法 · 按档案智能匹配零食类目（千人千面，点按直达对应零食类目） */}
 <View className="mx-4 mt-3 rounded-2xl p-4 bg-card border border-border">
 <View className="flex items-center gap-2 mb-3">
 <View className="min-w-0">
 <Text className="text-base font-bold text-foreground block">根据你的食养档案匹配</Text>
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
 <Text className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }}>{s.label}</Text>
 <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>›</Text>
 </View>
 ))}
 </View>
 ) : (
 <View
 className="rounded-xl mb-3 px-3 py-2.5 active:scale-[0.99] transition-transform"
 style={{ background: 'hsl(var(--primary) / 0.08)' }}
 hoverClass="none"
  onClick={() => go('/pages/food/tongue/index')}
 >
 <Text className="text-xs" style={{ color: 'hsl(var(--primary))' }}>完成「食养评估」（身体感受 + 舌象对照）后，这里会出现为你定制的零食类目 · 去评估 ›</Text>
 </View>
 )}
 </View>

{/* 食养评估：身体感受 + 舌象对照 合并入口（千人千面匹配的唯一输入端） */}
<View
 className="mx-4 mt-4 rounded-2xl p-4 bg-card border border-border flex items-center justify-between active:scale-[0.99] transition-transform"
 aria-role="button" aria-label="食养评估"
 hoverClass="none"
 onClick={() => go('/pages/food/tongue/index')}
>
 <View className="flex items-center gap-3 min-w-0">
 <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
 <Icon name="pencil" size={20} className="text-primary" />
 </View>
 <View className="min-w-0">
 <Text className="text-base font-bold text-foreground">食养评估</Text>
 <Text className="text-xs text-muted-foreground">身体感受 + 舌象对照 · 本地算法辨倾向挑好物</Text>
 </View>
 </View>
 <Text className="text-xs text-primary font-bold flex-shrink-0 ml-2">前往 ›</Text>
</View>

 <Text className="text-[10px] text-muted-foreground text-center block mt-6 px-6 leading-relaxed">
 {FOOD_THERAPY_DISCLAIMER}
 </Text>
 </View>
 )
}
