// 食疗分析引擎（admin-web 本地纯函数，零后端依赖）
// ----------------------------------------------------------------------------
// 输入：菜名（可选 + 已手动勾选的食材 key）
// 输出：拆分食材 → 聚合整体性味 → 组合功效 → 推导风险人群 → 推断 food_category
//        全部输出字段对齐商品食养列与录入表单枚举（HEALTH_TAGS / CROWD_OPTIONS /
//        NATURE_SCALE / SCENE_OPTIONS / FOOD_CATEGORIES），保证表单能正确识别选中。
//
// 设计原则：
//   - 纯函数、确定性（同一菜名永远得到同一结果）
//   - 复用 INGREDIENT_DICT（59 味）与 matchIngredientKeys，与商家录入「智能识别」同源
//   - 输出落在一套固定词表内，绝不出现枚举外的值（否则表单无法选中）
//   - 合规：所有文案为传统食养文化参考，不含医疗宣称

import { matchIngredientKeys, getIngredientEntries, type IngredientEntry } from './shiyang'
import {
  NATURE_SCALE,
  type HealthTag,
  type Scene,
  type FoodCategory,
} from './food-therapy-tags'

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

// scenario 关键词 → SCENE_OPTIONS
const SCENARIO_TO_SCENE: { kw: string[]; scene: Scene }[] = [
  { kw: ['换季', '感冒'], scene: '换季易感冒' },
  { kw: ['秋冬', '冬季', '御寒'], scene: '秋冬御寒' },
  { kw: ['经期'], scene: '经期前后' },
  { kw: ['术后', '恢复', '调养'], scene: '术后体虚' },
  { kw: ['油腻', '饭后', '解腻', '吃多', '不消化'], scene: '饭后解腻' },
  { kw: ['熬夜', '用眼'], scene: '熬夜加班' },
  { kw: ['单人', '简餐', '主食', '日常'], scene: '单人简餐' },
]

// audience 关键词 → CROWD_OPTIONS
const AUDIENCE_TO_CROWD: { kw: string[]; crowd: string }[] = [
  { kw: ['畏寒', '怕冷'], crowd: '体虚怕冷' },
  { kw: ['上火'], crowd: '易上火' },
  { kw: ['喉咙', '咽喉'], crowd: '喉咙肿痛' },
  { kw: ['脾胃', '胃弱'], crowd: '脾胃虚寒' },
  { kw: ['失眠', '睡眠浅', '睡'], crowd: '失眠' },
  { kw: ['痛风'], crowd: '痛风' },
  { kw: ['肠胃', '积食', '食滞'], crowd: '肠胃虚弱' },
]

export interface DishAnalysis {
  /** 命中的食材 key（已去重，含手动勾选） */
  ingredients: string[]
  /** 推断的商品分类（合法枚举，空串表示无法推断） */
  food_category: FoodCategory | ''
  /** 聚合整体性味（NATURE_SCALE） */
  overall_nature: string
  /** 组合健康标签（HEALTH_TAGS） */
  health_tag: HealthTag[]
  /** 正向调理作用文案（组合各食材功效） */
  positive_effect: string
  /** 食用风险提示 */
  risk_warning: string
  /** 适配场景（SCENE_OPTIONS） */
  scenes: Scene[]
  /** 五星推荐人群（CROWD_OPTIONS） */
  rec_crowds: string[]
  /** 谨慎食用人群（CROWD_OPTIONS） */
  cautious_crowds: string[]
  /** 禁止食用人群（CROWD_OPTIONS） */
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

function mapBenefitsToHealthTags(entries: IngredientEntry[]): HealthTag[] {
  const tags = new Set<HealthTag>()
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

function mapScenariosToScenes(entries: IngredientEntry[]): Scene[] {
  const scenes = new Set<Scene>()
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
    cautious.add('宫寒量少')
    cautious.add('经期量大')
    parts.push('含寒凉食材，宫寒、经期量大及体虚怕冷者宜温热搭配后少量食用')
  }
  return { cautious: [...cautious], risk: parts.join('；') }
}

// 从菜名推断合法 food_category（返回新 7 分类之一或空串；空串表示无法推断，由商家手选）。
// 仅对可明确识别的品类（烘焙 / 低糖轻食）做自动归类，其余交商家在后台「商品分类」手动选择，
// 避免产出枚举外的值导致保存时违反 CHECK 约束。
function inferCategory(name: string): FoodCategory | '' {
  const t = name || ''
  if (/蛋糕|饼干|烘焙|糕点|面包|麻薯|司康|桃酥|曲奇/.test(t)) return '药食同源烘焙'
  if (/无糖|低糖|控糖|0糖|代糖|轻食/.test(t)) return '低糖轻食零食'
  return ''
}

/**
 * 系统化食疗分析入口：写菜名 → 系统拆分食材 → 组合生成全部食养字段。
 * @param name 商品/菜名
 * @param manualIngredients 已手动勾选的食材 key（会与识别结果合并去重）
 */
export function analyzeDish(name: string, manualIngredients: string[] = []): DishAnalysis {
  const detected = matchIngredientKeys(name)
  const keys = Array.from(new Set([...detected, ...manualIngredients]))
  const entries = getIngredientEntries(keys)

  const overall_nature = aggregateNature(entries)
  const { cautious, risk } = deriveRisks(entries)

  const allBenefits = Array.from(new Set(entries.flatMap((e) => e.benefits)))
  const positive_effect = allBenefits.slice(0, 6).join('、')

  return {
    ingredients: keys,
    food_category: inferCategory(name),
    overall_nature,
    health_tag: mapBenefitsToHealthTags(entries),
    positive_effect,
    risk_warning: risk,
    scenes: mapScenariosToScenes(entries),
    rec_crowds: mapAudiencesToCrowds(entries),
    cautious_crowds: cautious,
    forbidden_crowds: [],
  }
}
