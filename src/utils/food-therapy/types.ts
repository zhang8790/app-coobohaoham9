// 食材食疗智能导购 —— 共享类型与固定标签库（枚举单一权威源：来自 @/lib/food-engine/wordTables，消除 C2 漂移）
// 纯函数引擎，不依赖网络；被小程序导购页 / 收银后台 / 营销生成复用。

import type { Product } from '../../db/types'
import {
  HEALTH_TAGS, EMOTION_TAGS, NATURE_SCALE, BODY_CROWD_OPTIONS, HEALTH_CROWD_OPTIONS,
  CROWD_OPTIONS, SCENE_OPTIONS, FOOD_CATEGORIES,
} from '@/lib/food-engine/wordTables'
import type {
  HealthTag, EmotionTag, NatureLevel, Crowd, Scene, FoodCategory,
} from '@/lib/food-engine/wordTables'

// 固定食疗标签库（9 项，与迁移 00100 health_tag 注释一致）
export { HEALTH_TAGS, EMOTION_TAGS, NATURE_SCALE, BODY_CROWD_OPTIONS, HEALTH_CROWD_OPTIONS, CROWD_OPTIONS, SCENE_OPTIONS, FOOD_CATEGORIES }
export type { HealthTag, EmotionTag, NatureLevel, Crowd, Scene, FoodCategory }

// 适配分档（对应首页三栏：五星推荐 / 谨慎食用 / 不建议点）
export type FitTier = 'recommend' | 'caution' | 'avoid'

export const TIER_LABEL: Record<FitTier, string> = {
  recommend: '五星推荐',
  caution: '谨慎食用',
  avoid: '不建议点',
}

// 人群症状规则（4 大类：咽喉 / 经期 / 长期体质 / 临时场景）
export interface FitRule {
  id: string
  category: 'throat' | 'menstruation' | 'constitution' | 'scene'
  label: string
  keywords: string[]
  priorityHealthTags: HealthTag[]
  banNatures: NatureLevel[]
  banHealthTags: HealthTag[]
  remindText: string
}

// 营销素材产出（销售话术 / 详情 / 朋友圈 / 风险 / 海报）
export interface MarketingCopy {
  short_sales_word: string // 一句话销售话术（店员话术库 / 商品卡副标题）
  detail_desc: string // 详情卖点文案
  circle_copy: string // 朋友圈 / 社群分享文案
  risk_tip: string // 风险提醒
  poster_template: string // 海报模板占位
}

// 引擎输入：从 Product 中抽取导购所需字段（raw_material = ingredients）
export interface FoodTherapyInput {
  id: string
  name: string
  ingredients?: string[] | null
  overall_nature?: string | null
  food_stage?: string | null
  health_tag?: string[] | null
  emotion_tag?: string[] | null
  match_goods?: string[] | null
  conflict_goods?: string[] | null
  aux_remind?: string | null
  // 00104 扩展字段（完整录入架构）
  food_category?: string | null
  positive_effect?: string | null
  risk_warning?: string | null
  emotion_copy?: string | null
  scenes?: string[] | null
  rec_crowds?: string[] | null
  cautious_crowds?: string[] | null
  cautious_notes?: string | null
  forbidden_crowds?: string[] | null
  forbidden_reasons?: string | null
  guide_sentence?: string | null
  moments_copy?: string | null
  taboo_warning?: string | null
}

// 将完整 Product 转为导购输入（兼容未迁移新列的情况）
export function toFoodTherapyInput(p: Product): FoodTherapyInput {
  return {
    id: p.id,
    name: p.name,
    ingredients: p.ingredients ?? null,
    overall_nature: p.overall_nature ?? null,
    food_stage: (p as any).food_stage ?? null,
    health_tag: p.health_tag ?? null,
    emotion_tag: p.emotion_tag ?? null,
    match_goods: p.match_goods ?? null,
    conflict_goods: p.conflict_goods ?? null,
    aux_remind: p.aux_remind ?? null,
    food_category: (p as any).food_category ?? null,
    positive_effect: (p as any).positive_effect ?? null,
    risk_warning: (p as any).risk_warning ?? null,
    emotion_copy: (p as any).emotion_copy ?? null,
    scenes: (p as any).scenes ?? null,
    rec_crowds: (p as any).rec_crowds ?? null,
    cautious_crowds: (p as any).cautious_crowds ?? null,
    cautious_notes: (p as any).cautious_notes ?? null,
    forbidden_crowds: (p as any).forbidden_crowds ?? null,
    forbidden_reasons: (p as any).forbidden_reasons ?? null,
    guide_sentence: (p as any).guide_sentence ?? null,
    moments_copy: (p as any).moments_copy ?? null,
    taboo_warning: (p as any).taboo_warning ?? null,
  }
}
