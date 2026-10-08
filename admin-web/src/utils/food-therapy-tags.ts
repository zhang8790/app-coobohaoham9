// 食材食疗智能导购 —— 标签库（单一权威源：枚举来自 @food-engine/wordTables，消除双端 C2 漂移）
// 与小程序端 src/utils/food-therapy/types.ts 共用同一套词表（取双端并集，保证历史持久化值仍有效）。

import {
  HEALTH_TAGS, EMOTION_TAGS, NATURE_SCALE, BODY_CROWD_OPTIONS, HEALTH_CROWD_OPTIONS,
  CROWD_OPTIONS, SCENE_OPTIONS, FOOD_CATEGORIES,
} from '@food-engine/wordTables'
import type {
  HealthTag, EmotionTag, NatureLevel, Crowd, Scene, FoodCategory,
} from '@food-engine/wordTables'

// 固定食疗标签库（9 项，与迁移 00100 health_tag 注释一致）
export { HEALTH_TAGS, EMOTION_TAGS, NATURE_SCALE, BODY_CROWD_OPTIONS, HEALTH_CROWD_OPTIONS, CROWD_OPTIONS, SCENE_OPTIONS, FOOD_CATEGORIES }
export type { HealthTag, EmotionTag, NatureLevel, Crowd, Scene, FoodCategory }

// 将逗号/顿号/空格分隔的文本解析为字符串数组
export function parseList(text: string): string[] {
  return text
    .split(/[，,、\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

// 将字符串数组渲染为展示文本
export function joinList(arr?: string[] | null): string {
  return (arr ?? []).join('、')
}

// ── 症状/人群规则库（运营可配置，对应 symptom_rules 表 + 小程序端 symptom-rules.ts）──
export type SymptomCategory = 'throat' | 'menstruation' | 'constitution' | 'scene'

export const SYMPTOM_CATEGORIES: { value: SymptomCategory; label: string }[] = [
  { value: 'throat', label: '咽喉类' },
  { value: 'menstruation', label: '经期类' },
  { value: 'constitution', label: '长期体质类' },
  { value: 'scene', label: '临时场景类' },
]

export interface SymptomRule {
  id: string
  category: SymptomCategory
  label: string
  keywords: string[]
  priority_health_tags: string[]
  ban_natures: string[]
  ban_health_tags: string[]
  remind_text: string
  is_active: boolean
  sort_order: number
}

export function categoryLabel(c: SymptomCategory): string {
  return SYMPTOM_CATEGORIES.find(x => x.value === c)?.label ?? c
}
