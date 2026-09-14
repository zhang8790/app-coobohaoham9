// 食疗/安全系统 · 本地智能识别引擎（小程序端纯函数，零后端依赖）
// ----------------------------------------------------------------------------
// 输入：商品/菜名（可选 + 已手动勾选的食材 key）
// 输出：拆分食材 → 聚合整体性味 → 组合食疗标签 → 推导情绪标签 → 预测过敏原
//        → 推导风险人群/提示 → 产出安全摘要。
//
// 设计原则（与 admin-web dish-analyzer 同源，复用小程序端现有词典）：
//   - 纯函数、确定性（同一菜名永远得到同一结果）
//   - 复用 INGREDIENT_DICT（59 味）+ matchIngredientKeys，与商家录入同源
//   - 输出严格落在固定枚举内，绝不出现枚举外的值（否则表单无法选中）
//   - 合规：所有文案为传统食养文化参考，不含医疗宣称
//
// 这是「结合现有 API 基础」的本地兜底层：即使未配置 LLM / 视觉密钥，
// 输菜名也能立即给出结构化食养属性；配置密钥后由 product-analyze Edge Function 做增强。

import { matchIngredientKeys, getIngredientEntries } from '@/utils/ingredient-analysis'
import { type IngredientEntry } from '@/utils/shiyang-dictionary'
import {
  NATURE_SCALE,
  HEALTH_TAGS,
  EMOTION_TAGS,
  SCENE_OPTIONS,
  type HealthTag,
  type EmotionTag,
  type Scene,
} from '@/utils/food-therapy/types'

// 食材原始性味（温/凉/平/寒/微温/微寒）映射到 NATURE_SCALE 6 档分值
const RAW_NATURE_SCORE: Record<string, number> = {
  寒: 1,
  凉: 1,
  微寒: 1,
  平: 2,
  微温: 3,
  温: 4,
  大热: 5,
}

// benefit 关键词 → HEALTH_TAGS（精确优先，避免「补」这类宽词误命中）
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

// benefit 关键词 → EMOTION_TAGS（情绪配对，最多取 3）
const BENEFIT_TO_EMOTION: { kw: string[]; tag: EmotionTag }[] = [
  { kw: ['安神', '养心', '清心', '宁神', '宁心', '舒缓'], tag: '舒心放松' },
  { kw: ['温中', '驱寒', '暖身', '温补', '补益', '补中'], tag: '温暖陪伴' },
  { kw: ['清热', '降火', '解暑', '生津', '润燥', '润肠', '利水', '消肿'], tag: '清爽解压' },
  { kw: ['消食', '化积', '理气', '开胃'], tag: '小确幸' },
  { kw: ['健脾', '养胃', '补虚', '补气', '养血'], tag: '元气满满' },
]

// scenario 关键词 → SCENE_OPTIONS
const SCENARIO_TO_SCENE: { kw: string[]; scene: Scene }[] = [
  { kw: ['换季', '感冒'], scene: '秋冬降温' },
  { kw: ['秋冬', '冬季', '御寒'], scene: '秋冬降温' },
  { kw: ['经期'], scene: '经期调理' },
  { kw: ['术后', '恢复', '调养'], scene: '术后恢复' },
  { kw: ['油腻', '饭后', '解腻', '吃多', '不消化'], scene: '饭后解腻' },
  { kw: ['熬夜', '用眼'], scene: '熬夜工作' },
  { kw: ['单人', '简餐', '主食', '日常'], scene: '单人简餐' },
]

// audience 关键词 → 推荐人群（CROWD_OPTIONS 子集）
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

export interface ProductAnalysis {
  /** 命中的食材 key（已去重，含手动勾选） */
  ingredients: string[]
  /** 聚合整体性味（NATURE_SCALE 6 档之一，空串=无法判断） */
  overall_nature: string
  /** 组合食疗标签（HEALTH_TAGS 枚举） */
  health_tag: string[]
  /** 情绪配对标签（EMOTION_TAGS 枚举，最多 3） */
  emotion_tag: string[]
  /** 辅料/过敏提醒文案 */
  aux_remind: string
  /** 预测过敏原（GB 7718 类目） */
  allergens: string[]
  /** 营养（结构化，文本识别无法精确给出，本地规则置 null，由 LLM/视觉增强补充） */
  nutrition: {
    energy_kj?: number
    protein_g?: number
    fat_g?: number
    carb_g?: number
    sugar_g?: number
    sodium_mg?: number
  } | null
  /** 安全评级 S/A/C/D（本地规则无法判定，置 null，由 LLM/视觉增强补充） */
  safety_grade: string | null
  /** 安全摘要文案（食养参考口径，含免责） */
  safety_summary: string
  /** 正向调理作用文案 */
  positive_effect: string
  /** 食用风险提示 */
  risk_warning: string
  /** 适配场景（SCENE_OPTIONS 枚举） */
  scenes: string[]
  /** 推荐人群 */
  rec_crowds: string[]
  /** 谨慎人群 */
  cautious_crowds: string[]
  /** 不建议人群 */
  forbidden_crowds: string[]
}

function aggregateNature(entries: IngredientEntry[]): string {
  if (entries.length === 0) return ''
  let sum = 0
  for (const e of entries) sum += RAW_NATURE_SCORE[e.nature] ?? 2
  const avg = sum / entries.length
  const idx = Math.max(0, Math.min(NATURE_SCALE.length - 1, Math.round(avg)))
  return NATURE_SCALE[idx]
}

function mapBenefitsToHealthTags(entries: IngredientEntry[]): string[] {
  const tags = new Set<string>()
  const all = entries.flatMap((e) => e.benefits)
  for (const b of all) {
    for (const r of BENEFIT_TO_HEALTH_TAG) {
      if (r.kw.some((k) => b.includes(k))) {
        tags.add(r.tag)
        break
      }
    }
  }
  return [...tags]
}

function mapBenefitsToEmotionTags(entries: IngredientEntry[]): string[] {
  const tags = new Set<string>()
  const all = entries.flatMap((e) => e.benefits)
  for (const b of all) {
    for (const r of BENEFIT_TO_EMOTION) {
      if (r.kw.some((k) => b.includes(k))) {
        tags.add(r.tag)
        break
      }
    }
  }
  return [...tags].slice(0, 3)
}

function mapScenariosToScenes(entries: IngredientEntry[]): string[] {
  const scenes = new Set<string>()
  const all = entries.flatMap((e) => e.scenarios)
  for (const s of all) {
    for (const r of SCENARIO_TO_SCENE) {
      if (r.kw.some((k) => s.includes(k))) {
        scenes.add(r.scene)
        break
      }
    }
  }
  return [...scenes]
}

function mapAudiencesToCrowds(entries: IngredientEntry[]): string[] {
  const crowds = new Set<string>()
  const all = entries.flatMap((e) => e.audiences)
  for (const a of all) {
    for (const r of AUDIENCE_TO_CROWD) {
      if (r.kw.some((k) => a.includes(k))) {
        crowds.add(r.crowd)
        break
      }
    }
  }
  return [...crowds]
}

// 基于整体温凉倾向推导谨慎人群 + 风险文案
function deriveRisks(entries: IngredientEntry[]): { cautious: string[]; risk: string } {
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
    cautious.add('经期量大')
    parts.push('含寒凉食材，体虚怕冷及经期量大者宜温热搭配后少量食用')
  }
  return { cautious: [...cautious], risk: parts.join('；') }
}

function predictAllergens(keys: string[]): string[] {
  const set = new Set<string>()
  for (const k of keys) {
    const a = INGREDIENT_ALLERGENS[k]
    if (a) a.forEach((x) => set.add(x))
  }
  return [...set]
}

function inferCategory(name: string): string {
  const t = name || ''
  if (/面|粉|米线|河粉|肠粉|凉皮/.test(t)) return '粉面'
  if (/汤|羹|煲|炖/.test(t)) return '炖汤'
  if (/茶|奶茶|饮|露|汁|咖啡/.test(t)) return '热饮'
  if (/菜|拌|卤|凉|小炒|泡菜/.test(t)) return '小菜'
  return ''
}

/**
 * 系统化食疗识别入口：写菜名 → 系统拆分食材 → 组合生成全部食养字段。
 * 不依赖任何后端 / 密钥，是「智能识别」的本地确定性兜底层。
 * @param name 商品/菜名
 * @param manualIngredients 已手动勾选的食材 key（会与识别结果合并去重）
 */
export function analyzeProductFromName(name: string, manualIngredients: string[] = []): ProductAnalysis {
  const detected = matchIngredientKeys(name)
  const keys = Array.from(new Set([...detected, ...manualIngredients]))
  const entries = getIngredientEntries(keys)

  const overall_nature = aggregateNature(entries)
  const { cautious, risk } = deriveRisks(entries)
  const allergens = predictAllergens(keys)

  const allBenefits = Array.from(new Set(entries.flatMap((e) => e.benefits)))
  const positive_effect = allBenefits.slice(0, 6).join('、')

  const names = entries.map((e) => e.zh)
  const natureText = overall_nature || '性平'
  const allergenText = allergens.length ? `预测含常见过敏原：${allergens.join('、')}，过敏者慎选` : '未识别到常见过敏原'
  const safety_summary = `基于「${name || '商品'}」识别食材：${names.length ? names.join('、') : '未匹配到已知食材'}。整体${natureText}；${risk || '无特殊禁忌'}。${allergenText}。具体营养成分以实物标签为准（食养参考，不替代专业医疗建议）。`

  // 辅料提醒：优先由过敏原推导，否则用风险文案
  const aux_remind = allergens.length
    ? `可能${allergens.join('、')}，过敏人群请谨慎选择`
    : risk || ''

  return {
    ingredients: keys,
    overall_nature,
    health_tag: mapBenefitsToHealthTags(entries).filter((t) => (HEALTH_TAGS as readonly string[]).includes(t)),
    emotion_tag: mapBenefitsToEmotionTags(entries).filter((t) => (EMOTION_TAGS as readonly string[]).includes(t)),
    aux_remind,
    allergens,
    nutrition: null,
    safety_grade: null,
    safety_summary,
    positive_effect,
    risk_warning: risk,
    scenes: mapScenariosToScenes(entries).filter((s) => (SCENE_OPTIONS as readonly string[]).includes(s)),
    rec_crowds: mapAudiencesToCrowds(entries),
    cautious_crowds: cautious,
    forbidden_crowds: [],
  }
}

// 便于在 Edge Function 未配置时，前端判断是否走本地兜底
export const DISH_ANALYZER_SOURCE = 'rule'
export { inferCategory }
