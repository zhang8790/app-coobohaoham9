// ============================================================
// 食品配料安全管理系统 · 模块补全数据层（迁移 00220 配套）
// ------------------------------------------------------------
// 三库（过敏原/人群触发/人群文案）+ 标准报告（food_analysis_reports）
// 的客户端封装，复用电商项目既有 Supabase 客户端（@/client/supabase）。
// 独立成文件，避免与 food-api.ts 耦合；调用示例：
//   import { callIngredientAnalyze, getFoodAllergens } from '@/db/food-safety'
// ============================================================
import { supabase } from '@/client/supabase'

// 4 档安全评级 code（与 ingredient-analyze EF / ingredient_ocr_tasks.safety_level 一致）
export type SafeLevelCode = 'A_preferred' | 'A_limit' | 'B_caution' | 'C_avoid'

// 人群 severity 分级（负向四级语义；信任度核心）
export type CrowdSeverity = 'ok' | 'caution' | 'advise_against' | 'forbidden'

// 人群适配建议（ingredient-analyze EF 输出，按 severity 倒序）
export interface AudienceAdvice {
  code: string
  severity: CrowdSeverity
  label: string
  text: string
}

// ① 过敏原匹配库 food_allergens（8 类）
export interface FoodAllergen {
  id: string
  key: string
  name: string
  description: string | null
  crowd_code: string
  sort_order: number
}

// ② 人群标签触发库 food_crowd_triggers（触发词 → crowd_code）
export interface FoodCrowdTrigger {
  id: string
  trigger_keyword: string
  crowd_code: string
}

// ③ 人群文案库 food_crowd_tips（crowd_code → 食养提示文案）
export interface FoodCrowdTip {
  id: string
  crowd_code: string
  label: string
  general_tip: string | null
  children_tip: string | null
  fit_people: string | null
  unfit_people: string | null
  sort_order: number
}

// ④ 标准报告 food_analysis_reports
export interface FoodAnalysisReport {
  id: string
  product_id: string | null
  source: 'manual' | 'ocr' | 'llm'
  input_text: string | null
  parsed_ingredients: string[] | null
  additive_list: Array<{ name: string; level: 'safe' | 'limit' | 'high_risk'; risk_tier?: string; type: string; desc: string }> | null
  allergen_list: Array<{ key: string; name: string; crowd_code: string }> | null
  crowd_tips: string[] | null
  safe_level: string | null
  safe_level_code: SafeLevelCode | null
  main_conclusion: { general: string; children: string; fit_people: string; unfit_people: string; audience_advice?: AudienceAdvice[] | null } | null
  health_shortboard_tip: string | null
  created_by: string | null
  created_at: string
}

// 私有目录表药食同源洞察（ingredient-analyze EF 服务端基于 medicinal_food_catalog 计算，
// 客户端读不到该表；仅回传衍生洞察，是「竞品抄不到」的差异化数据层）
export interface CatalogAgeCautionHit {
  ingredient: string
  cautions: string[]
}
export interface CatalogInsight {
  matched_count: number
  matched: string[]
  nature_summary: string
  nature_distribution: Record<string, number>
  age_caution_hits: CatalogAgeCautionHit[]
  compatibility_notes: string[]
}

// 标准报告输出（与 ingredient-analyze Edge Function 完全对齐）
export interface StandardFoodReport {
  success: boolean
  report_id?: string
  safe_level?: string
  safe_level_code?: SafeLevelCode
  main_conclusion?: { general: string; children: string; fit_people: string; unfit_people: string }
  health_shortboard_tip?: string
  catalog_insight?: CatalogInsight
  additive_list?: Array<{ name: string; level: 'safe' | 'limit' | 'high_risk'; risk_tier?: string; type: string; desc: string }>
  crowd_tips?: string[]
  parsed_ingredients?: string[]
  matched_additives?: string[]
  match_score?: { score: number; tier: 'recommend' | 'caution' | 'avoid'; reasons: string[]; tags: string[] } | null
  error?: string
}

// 适配分（模块三·食疗人群匹配算法引擎输出）
export interface FoodMatchScore {
  score: number
  tier: 'recommend' | 'caution' | 'avoid'
  reasons: string[]
}

// 用户食疗标签规则（food_tag_rules）
export interface FoodTagRule {
  tag_key: string
  label: string
  group_name?: string
  prefer_ingredients: string[]
  avoid_ingredients: string[]
  weight_prefer: number
  weight_avoid: number
  status: string
}

// ============================================================
// 三库读取（公开可读）
// ============================================================
export async function getFoodAllergens(): Promise<FoodAllergen[]> {
  const { data, error } = await supabase
    .from('food_allergens')
    .select('*')
    .order('sort_order')
  if (error) {
    console.error('[getFoodAllergens] 查询失败:', error.message)
    return []
  }
  return (data as FoodAllergen[]) ?? []
}

export async function getFoodCrowdTips(): Promise<FoodCrowdTip[]> {
  const { data, error } = await supabase
    .from('food_crowd_tips')
    .select('*')
    .order('sort_order')
  if (error) {
    console.error('[getFoodCrowdTips] 查询失败:', error.message)
    return []
  }
  return (data as FoodCrowdTip[]) ?? []
}

export async function getFoodCrowdTriggers(): Promise<FoodCrowdTrigger[]> {
  const { data, error } = await supabase
    .from('food_crowd_triggers')
    .select('*')
  if (error) {
    console.error('[getFoodCrowdTriggers] 查询失败:', error.message)
    return []
  }
  return (data as FoodCrowdTrigger[]) ?? []
}

// ============================================================
// 标准报告读取 / 绑定商品
// ============================================================
export async function getFoodAnalysisReportsByProduct(productId: string): Promise<FoodAnalysisReport[]> {
  const { data, error } = await supabase
    .from('food_analysis_reports')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[getFoodAnalysisReportsByProduct] 查询失败:', error.message)
    return []
  }
  return (data as FoodAnalysisReport[]) ?? []
}

export async function getFoodAnalysisReport(id: string): Promise<FoodAnalysisReport | null> {
  const { data, error } = await supabase
    .from('food_analysis_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[getFoodAnalysisReport] 查询失败:', error.message)
    return null
  }
  return (data as FoodAnalysisReport) ?? null
}

// ============================================================
// 全局食材字典（food_ingredients）：食疗商品模块内核
// 商家编辑页拉取后按统一引擎（product-therapy.ts）实时计算。
// 简单内存缓存，避免每次编辑重复请求。
// ============================================================
export interface FoodIngredientRow {
  id: string
  name: string
  nature: string
  base_effect: string | null
  fit_scenes: string | null
  caution_crowds: string | null
  allergens: string[] | null
  chronic_tags: string[] | null
  neutralize: string | null
  sort_order: number
  is_active: boolean
}

let _ingredientsCache: FoodIngredientRow[] | null = null

export async function getFoodIngredients(force = false): Promise<FoodIngredientRow[]> {
  if (_ingredientsCache && !force) return _ingredientsCache
  const { data, error } = await supabase
    .from('food_ingredients')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (error) {
    console.error('[getFoodIngredients] 查询失败:', error.message)
    return _ingredientsCache ?? []
  }
  _ingredientsCache = (data as FoodIngredientRow[]) ?? []
  return _ingredientsCache
}

// ============================================================
// 调用规范引擎 Edge Function（ingredient-analyze）
// 输入文本或 ocr_task_id → 返回标准 JSON（见 StandardFoodReport）
// 失败时返回 { success:false, error }，调用方应回退本地引擎。
// ============================================================
export async function callIngredientAnalyze(payload: {
  text?: string
  ocr_task_id?: string
  product_id?: string
  user_id?: string
  user_tags?: string[]
  age_group?: string
  persist?: boolean
  source?: 'manual' | 'ocr' | 'llm'
}): Promise<StandardFoodReport> {
  try {
    const { data, error } = await supabase.functions.invoke('ingredient-analyze', {
      body: payload,
    })
    if (error) {
      console.error('[callIngredientAnalyze] 调用失败:', error.message)
      return { success: false, error: error.message }
    }
    return (data as StandardFoodReport) ?? { success: false, error: '空响应' }
  } catch (e: any) {
    console.error('[callIngredientAnalyze] 异常:', e)
    return { success: false, error: e?.message ?? String(e) }
  }
}

// 读取食疗标签规则（供前端「自检标签库」勾选 + 后台面板）
export async function getFoodTagRules(): Promise<FoodTagRule[]> {
  const { data, error } = await supabase
    .from('food_tag_rules')
    .select('*')
    .eq('status', 'active')
    .order('tag_key')
  if (error) {
    console.error('[getFoodTagRules] 查询失败:', error.message)
    return []
  }
  return (data as FoodTagRule[]) ?? []
}

// 跨商品适配分排序（模块三·food-match Edge Function）
export async function callFoodMatch(payload: {
  user_tags: string[]
  product_ids?: string[]
  store_id?: string
  user_id?: string
  limit?: number
}): Promise<{ success: boolean; count?: number; items?: Array<{
  product_id: string
  score: number
  tier: 'recommend' | 'caution' | 'avoid'
  reasons: string[]
  safe_level?: string
  safe_level_code?: string
}>; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('food-match', { body: payload })
    if (error) {
      console.error('[callFoodMatch] 调用失败:', error.message)
      return { success: false, error: error.message }
    }
    return (data as any) ?? { success: false, error: '空响应' }
  } catch (e: any) {
    console.error('[callFoodMatch] 异常:', e)
    return { success: false, error: e?.message ?? String(e) }
  }
}
