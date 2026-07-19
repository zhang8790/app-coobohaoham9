// 食材食疗智能导购 —— 标签库（admin-web 本地镜像）
// 与小程序端 src/utils/food-therapy/types.ts 保持一致，避免跨工程耦合。
// 修改任一侧时请同步另一侧，确保商家录入与小程序引擎判定使用同一套词表。

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

// 商品整体性味 6 档（由凉到热）
export const NATURE_SCALE = ['大寒', '寒凉', '平性', '微温', '温热', '大热'] as const
export type NatureLevel = typeof NATURE_SCALE[number]

// ── 「商品食疗智能系统」录入词表（与小程序端 types.ts 对齐）──
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

// 适配消费场景（与 products.scenes 取值一致；含 spec 预设库 + 可自定义）
export const SCENE_OPTIONS = [
  '熬夜加班', '秋冬御寒', '经期前后', '术后体虚', '单人简餐', '饭后解腻', '换季易感冒',
] as const
export type Scene = typeof SCENE_OPTIONS[number]

// 商品分类（spec 基础信息区）
export const FOOD_CATEGORIES = ['粉面', '炖汤', '热饮', '小菜'] as const
export type FoodCategory = typeof FOOD_CATEGORIES[number]

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
