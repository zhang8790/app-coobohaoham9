// 食疗分析引擎 · 单一权威源（消除双端 dishAnalyzer 逻辑漂移）
// 纯函数、确定性；输出严格落在 wordTables 固定枚举内；零「AI」字样。
// 双端（小程序 / 网页后台）统一调用 analyzeProduct，命名一致，结果一致。

import {
  type IngredientEntry,
  matchIngredientKeys,
  getIngredientEntries,
} from './dictionary'
import {
  type HealthTag,
  type Scene,
  type FoodCategory,
  aggregateNature,
  mapBenefitsToHealthTags,
  mapBenefitsToEmotionTags,
  mapScenariosToScenes,
  mapAudiencesToCrowds,
  deriveRisks,
  predictAllergens,
  inferCategory,
} from './wordTables'

export interface ProductAnalysis {
  /** 命中的食材 key（已去重，含手动勾选） */
  ingredients: string[]
  /** 推断的商品分类（合法枚举，空串表示无法推断） */
  food_category: FoodCategory | ''
  /** 聚合整体性味（NATURE_SCALE） */
  overall_nature: string
  /** 组合健康标签（HEALTH_TAGS） */
  health_tag: HealthTag[]
  /** 情绪配对标签（EMOTION_TAGS，最多 3） */
  emotion_tag: string[]
  /** 辅料/过敏提醒文案 */
  aux_remind: string
  /** 预测过敏原（GB 7718 类目） */
  allergens: string[]
  /** 正向调理作用文案 */
  positive_effect: string
  /** 食用风险提示 */
  risk_warning: string
  /** 适配场景（SCENE_OPTIONS） */
  scenes: Scene[]
  /** 推荐人群 */
  rec_crowds: string[]
  /** 谨慎食用人群 */
  cautious_crowds: string[]
  /** 不建议人群 */
  forbidden_crowds: string[]
  /** 食养安全摘要（参考口径，含免责） */
  safety_summary: string
}

/**
 * 系统化食疗识别入口：写菜名 + 已勾选食材 key → 系统拆分食材 → 组合生成全部食养字段。
 * 不依赖任何后端 / 密钥，是「智能识别」的本地确定性兜底层。
 */
export function analyzeProduct(name: string, manualIngredients: string[] = []): ProductAnalysis {
  const detected = matchIngredientKeys(name)
  const keys = Array.from(new Set([...detected, ...manualIngredients]))
  const entries: IngredientEntry[] = getIngredientEntries(keys)

  const overall_nature = aggregateNature(entries)
  const { cautious, risk } = deriveRisks(entries)
  const allergens = predictAllergens(keys)

  const allBenefits = Array.from(new Set(entries.flatMap((e) => e.benefits)))
  const positive_effect = allBenefits.slice(0, 6).join('、')

  const names = entries.map((e) => e.zh)
  const natureText = overall_nature || '性平'
  const allergenText = allergens.length
    ? `预测含常见过敏原：${allergens.join('、')}，过敏者慎选`
    : '未识别到常见过敏原'
  const safety_summary = `基于「${name || '商品'}」识别食材：${names.length ? names.join('、') : '未匹配到已知食材'}。整体${natureText}；${risk || '无特殊禁忌'}。${allergenText}。具体营养成分以实物标签为准（食养参考，不替代专业医疗建议）。`

  const aux_remind = allergens.length
    ? `可能${allergens.join('、')}，过敏人群请谨慎选择`
    : risk || ''

  return {
    ingredients: keys,
    food_category: inferCategory(name),
    overall_nature,
    health_tag: mapBenefitsToHealthTags(entries),
    emotion_tag: mapBenefitsToEmotionTags(entries),
    aux_remind,
    allergens,
    positive_effect,
    risk_warning: risk,
    scenes: mapScenariosToScenes(entries),
    rec_crowds: mapAudiencesToCrowds(entries),
    cautious_crowds: cautious,
    forbidden_crowds: [],
    safety_summary,
  }
}

export { inferCategory }
