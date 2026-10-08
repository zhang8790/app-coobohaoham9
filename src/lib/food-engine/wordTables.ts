// 食养标签词表 · 单一权威源（消除双端 EMOTION_TAGS / SCENE_OPTIONS 漂移）
// 枚举取双端并集，保证已持久化的 products.scenes / emotion_tag 旧值仍有效。
// 纯函数、确定性，输出严格落在固定枚举内。零「AI」字样。

import type { IngredientEntry } from './dictionary'

// 固定食疗标签库（9 项）
export const HEALTH_TAGS = [
  '温中散寒', '健脾养胃', '滋阴润燥', '清热降火', '补气养血',
  '舒缓安适', '消食化积', '润养舒喉', '利水消肿',
] as const
export type HealthTag = typeof HEALTH_TAGS[number]

// 固定情绪标签库（取双端并集：小程序 8 + 后台「治愈放松」= 9）
export const EMOTION_TAGS = [
  '舒心放松', '治愈放松', '元气满满', '温暖陪伴', '清爽解压',
  '怀旧慰藉', '仪式感', '小确幸', '社交分享',
] as const
export type EmotionTag = typeof EMOTION_TAGS[number]

// 商品整体性味 6 档（由凉到热）
export const NATURE_SCALE = ['大寒', '寒凉', '平性', '微温', '温热', '大热'] as const
export type NatureLevel = typeof NATURE_SCALE[number]

// 身体人群分类（与 products.rec/cautious/forbidden_crowds 取值一致）
export const BODY_CROWD_OPTIONS = [
  '宫寒量少', '经期量大', '喉咙肿痛', '易上火', '体虚怕冷', '痛风', '脾胃虚寒',
] as const
export const HEALTH_CROWD_OPTIONS = [
  '高血压', '高血糖', '高血脂', '肠胃虚弱', '失眠', '免疫力低',
] as const
export const CROWD_OPTIONS = [...BODY_CROWD_OPTIONS, ...HEALTH_CROWD_OPTIONS] as const
export type Crowd = typeof CROWD_OPTIONS[number]

// 适配消费场景（取双端并集：小程序 6 + 后台 5 个差异化标签 = 11，保留全部历史值）
export const SCENE_OPTIONS = [
  '熬夜工作', '熬夜加班', '秋冬降温', '秋冬御寒', '经期调理', '经期前后',
  '术后恢复', '术后体虚', '单人简餐', '饭后解腻', '换季易感冒',
] as const
export type Scene = typeof SCENE_OPTIONS[number]

// 商品分类（餐饮二级品类，对应 products.food_category）
export const FOOD_CATEGORIES = ['粉面', '炖汤', '热饮', '小菜'] as const
export type FoodCategory = typeof FOOD_CATEGORIES[number]

// 食材原始性味 → NATURE_SCALE 6 档分值
const RAW_NATURE_SCORE: Record<string, number> = {
  寒: 1, 凉: 1, 微寒: 1, 平: 2, 微温: 3, 温: 4, 大热: 5,
}

// benefit 关键词 → HEALTH_TAGS
const BENEFIT_TO_HEALTH_TAG: { kw: string[]; tag: HealthTag }[] = [
  { kw: ['温中', '驱寒', '暖身', '温补'], tag: '温中散寒' },
  { kw: ['健脾', '养胃', '补中', '补虚'], tag: '健脾养胃' },
  { kw: ['滋阴', '润燥', '生津', '润肠', '润肺'], tag: '滋阴润燥' },
  { kw: ['清热', '降火', '解暑', '凉血'], tag: '清热降火' },
  { kw: ['养血', '补血', '补气', '心脾'], tag: '补气养血' },
  { kw: ['安神', '养心', '清心'], tag: '舒缓安适' },
  { kw: ['消食', '化积', '理气', '开胃'], tag: '消食化积' },
  { kw: ['化痰', '软坚'], tag: '润养舒喉' },
  { kw: ['利水', '消肿'], tag: '利水消肿' },
]

// benefit 关键词 → EMOTION_TAGS（最多取 3）
const BENEFIT_TO_EMOTION: { kw: string[]; tag: EmotionTag }[] = [
  { kw: ['安神', '养心', '清心', '宁神', '宁心', '舒缓'], tag: '舒心放松' },
  { kw: ['温中', '驱寒', '暖身', '温补', '补益', '补中'], tag: '温暖陪伴' },
  { kw: ['清热', '降火', '解暑', '生津', '润燥', '润肠', '利水', '消肿'], tag: '清爽解压' },
  { kw: ['消食', '化积', '理气', '开胃'], tag: '小确幸' },
  { kw: ['健脾', '养胃', '补虚', '补气', '养血'], tag: '元气满满' },
]

// scenario 关键词 → SCENE_OPTIONS（映射到并集标签）
const SCENARIO_TO_SCENE: { kw: string[]; scene: Scene }[] = [
  { kw: ['换季', '感冒'], scene: '换季易感冒' },
  { kw: ['秋冬', '冬季', '御寒'], scene: '秋冬御寒' },
  { kw: ['经期'], scene: '经期前后' },
  { kw: ['术后', '恢复', '调养'], scene: '术后体虚' },
  { kw: ['油腻', '饭后', '解腻', '吃多', '不消化'], scene: '饭后解腻' },
  { kw: ['熬夜', '用眼'], scene: '熬夜加班' },
  { kw: ['单人', '简餐', '主食', '日常'], scene: '单人简餐' },
]

// audience 关键词 → 推荐人群
const AUDIENCE_TO_CROWD: { kw: string[]; crowd: string }[] = [
  { kw: ['畏寒', '怕冷'], crowd: '体虚怕冷' },
  { kw: ['上火'], crowd: '易上火' },
  { kw: ['喉咙', '咽喉'], crowd: '喉咙肿痛' },
  { kw: ['脾胃', '胃弱'], crowd: '脾胃虚寒' },
  { kw: ['失眠', '睡眠浅', '睡'], crowd: '失眠' },
  { kw: ['痛风'], crowd: '痛风' },
  { kw: ['肠胃', '积食', '食滞'], crowd: '肠胃虚弱' },
]

// 食材 key → 常见过敏原（基于 GB 7718 八大类 + 芝麻/坚果等扩展）
const INGREDIENT_ALLERGENS: Record<string, string[]> = {
  niunai: ['乳制品'],
  jidan: ['蛋类'],
  xia: ['甲壳类水产'],
  haidai: ['海产品'],
  zhizi: ['海产品'],
  hetao: ['坚果(核桃)'],
  xingren: ['坚果(杏仁)'],
  heizhima: ['芝麻'],
  miantiao: ['麸质(小麦)'],
}

export const NATURE_RANK: Record<string, number> = RAW_NATURE_SCORE
export { INGREDIENT_ALLERGENS }

// ── 引擎内部聚合工具（双端统一调用）──
export function aggregateNature(entries: IngredientEntry[]): string {
  if (entries.length === 0) return ''
  let sum = 0
  for (const e of entries) sum += RAW_NATURE_SCORE[e.nature] ?? 2
  const avg = sum / entries.length
  const idx = Math.max(0, Math.min(NATURE_SCALE.length - 1, Math.round(avg)))
  return NATURE_SCALE[idx]
}

export function mapBenefitsToHealthTags(entries: IngredientEntry[]): HealthTag[] {
  const tags = new Set<string>()
  const all = entries.flatMap((e) => e.benefits)
  for (const b of all) {
    for (const r of BENEFIT_TO_HEALTH_TAG) {
      if (r.kw.some((k) => b.includes(k))) { tags.add(r.tag); break }
    }
  }
  return [...tags].filter((t) => (HEALTH_TAGS as readonly string[]).includes(t)) as HealthTag[]
}

export function mapBenefitsToEmotionTags(entries: IngredientEntry[]): string[] {
  const tags = new Set<string>()
  const all = entries.flatMap((e) => e.benefits)
  for (const b of all) {
    for (const r of BENEFIT_TO_EMOTION) {
      if (r.kw.some((k) => b.includes(k))) { tags.add(r.tag); break }
    }
  }
  return [...tags].filter((t) => (EMOTION_TAGS as readonly string[]).includes(t)).slice(0, 3)
}

export function mapScenariosToScenes(entries: IngredientEntry[]): Scene[] {
  const scenes = new Set<string>()
  const all = entries.flatMap((e) => e.scenarios)
  for (const s of all) {
    for (const r of SCENARIO_TO_SCENE) {
      if (r.kw.some((k) => s.includes(k))) { scenes.add(r.scene); break }
    }
  }
  return [...scenes].filter((s) => (SCENE_OPTIONS as readonly string[]).includes(s)) as Scene[]
}

export function mapAudiencesToCrowds(entries: IngredientEntry[]): string[] {
  const crowds = new Set<string>()
  const all = entries.flatMap((e) => e.audiences)
  for (const a of all) {
    for (const r of AUDIENCE_TO_CROWD) {
      if (r.kw.some((k) => a.includes(k))) { crowds.add(r.crowd); break }
    }
  }
  return [...crowds]
}

// 基于整体温凉倾向推导谨慎人群 + 风险文案
export function deriveRisks(entries: IngredientEntry[]): { cautious: string[]; risk: string } {
  const cautious = new Set<string>()
  const parts: string[] = []
  const hasWarm = entries.some((e) => ['温', '微温', '大热'].includes(e.nature))
  const hasCool = entries.some((e) => ['寒', '凉', '微寒'].includes(e.nature))
  if (hasWarm) {
    cautious.add('易上火')
    cautious.add('喉咙肿痛')
    parts.push('含温补食材，易上火及咽喉肿痛者宜少量')
  }
  if (hasCool) {
    cautious.add('体虚怕冷')
    cautious.add('宫寒量少')
    cautious.add('经期量大')
    parts.push('含寒凉食材，宫寒、经期量大及体虚怕冷者宜温热搭配后少量食用')
  }
  return { cautious: [...cautious], risk: parts.join('；') }
}

export function predictAllergens(keys: string[]): string[] {
  const set = new Set<string>()
  for (const k of keys) {
    const a = INGREDIENT_ALLERGENS[k]
    if (a) a.forEach((x) => set.add(x))
  }
  return [...set]
}

// 从菜名推断合法 food_category
export function inferCategory(name: string): FoodCategory | '' {
  const t = name || ''
  if (/面|粉|米线|河粉|肠粉|凉皮/.test(t)) return '粉面'
  if (/汤|羹|煲|炖/.test(t)) return '炖汤'
  if (/茶|奶茶|饮|露|汁|咖啡/.test(t)) return '热饮'
  if (/菜|拌|卤|凉|小炒|泡菜/.test(t)) return '小菜'
  return ''
}
