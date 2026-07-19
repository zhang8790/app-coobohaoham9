// 食材食疗智能导购 —— 共享类型与固定标签库
// 纯函数引擎，不依赖网络；被小程序导购页 / 收银后台 / 营销生成复用。

import type { Product } from '../db/types'

// 固定食疗标签库（9 项，与迁移 00100 health_tag 注释一致）
export const HEALTH_TAGS = [
  '温中散寒', '健脾养胃', '滋阴润燥', '清热降火', '补气养血',
  '安神助眠', '消食化积', '润肺止咳', '利水消肿',
] as const
export type HealthTag = typeof HEALTH_TAGS[number]

// 固定情绪标签库（8 项，与迁移 00100 emotion_tag 注释一致）
export const EMOTION_TAGS = [
  '治愈放松', '元气满满', '温暖陪伴', '清爽解压',
  '怀旧慰藉', '仪式感', '小确幸', '社交分享',
] as const
export type EmotionTag = typeof EMOTION_TAGS[number]

// 商品整体性味 6 档（与迁移 00100 overall_nature 一致，由凉到热）
export const NATURE_SCALE = ['大寒', '寒凉', '平性', '微温', '温热', '大热'] as const
export type NatureLevel = typeof NATURE_SCALE[number]

// 适配分档（对应首页三栏：五星推荐 / 谨慎食用 / 不建议点）
export type FitTier = 'recommend' | 'caution' | 'avoid'

export const TIER_LABEL: Record<FitTier, string> = {
  recommend: '五星推荐',
  caution: '谨慎食用',
  avoid: '不建议点',
}

// 身体人群分类（前端筛选器勾选项，与 products.rec/cautious/forbidden_crowds 取值一致）
// 分两组：身体状态（体质类，长期） + 健康状况（疾病/慢病类，按食养参考匹配，附免责声明）
export const BODY_CROWD_OPTIONS = [
  '宫寒量少', '经期量大', '喉咙肿痛', '易上火', '体虚怕冷', '痛风', '脾胃虚寒',
] as const
// 健康状况（疾病/慢病人群）：仅作食养参考匹配维度，严禁"治疗/降血压"等医疗宣称
export const HEALTH_CROWD_OPTIONS = [
  '高血压', '高血糖', '高血脂', '肠胃虚弱', '失眠', '免疫力低',
] as const
export const CROWD_OPTIONS = [...BODY_CROWD_OPTIONS, ...HEALTH_CROWD_OPTIONS] as const
export type Crowd = typeof CROWD_OPTIONS[number]

// 当前就餐场景（前端筛选器单选，与 products.scenes 取值一致）
export const SCENE_OPTIONS = [
  '熬夜工作', '秋冬降温', '经期调理', '术后恢复', '单人简餐', '饭后解腻',
] as const
export type Scene = typeof SCENE_OPTIONS[number]

// 商品分类（spec 基础信息区）
export const FOOD_CATEGORIES = ['粉面', '炖汤', '热饮', '小菜'] as const
export type FoodCategory = typeof FOOD_CATEGORIES[number]

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
  risk_tip: string // 风险提醒（合规）
  poster_template: string // 海报模板占位
}

// 引擎输入：从 Product 中抽取导购所需字段（raw_material = ingredients）
export interface FoodTherapyInput {
  id: string
  name: string
  ingredients?: string[] | null
  overall_nature?: string | null
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
  combo_product_ids?: string[] | null
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
    combo_product_ids: (p as any).combo_product_ids ?? null,
    guide_sentence: (p as any).guide_sentence ?? null,
    moments_copy: (p as any).moments_copy ?? null,
    taboo_warning: (p as any).taboo_warning ?? null,
  }
}
