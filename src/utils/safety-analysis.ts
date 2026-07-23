// 全面食品安全分析引擎（纯本地，无需联网）
// ----------------------------------------------------------------------------
// 将「添加剂安全 + 致敏原 + 营养成分 + 标签合规 + 适宜年龄」五维聚合为一份
// 结构化安全报告，供 food-scan（拍照/文本）与商品详情页（商品标签字段）复用。
//
// 设计原则：
//   - 输入既支持「原文标签文本」（扫描过敏原/营养/合规），也支持「已结构化字段」
//     （商品 DB 已存的 allergens / nutrition），两者可并存、相互补充。
//   - 评级 S/A/C/D + 0~100 分，颜色与 FoodSafetyPanel 一致的绿/橙/红语义。
//   - 不臆造：营养项解析不到即为 null；标签合规缺失仅作提示，不恶意扣分。

import { matchAllergens, type AllergenInfo } from './allergen-dictionary'
import { parseNutritionFromText, analyzeStructuredNutrition, type NutritionResult } from './nutrition-rules'
import { matchAdditiveKeys, ADDITIVE_DICT } from './additive-dictionary'

export type SafetyGrade = 'S' | 'A' | 'C' | 'D'

export interface AdditiveRiskSummary {
  total: number
  white: number
  yellow: number
  black: number
  unmatched: number        // 文本命中但安全库未收录的添加剂名数量
  worst?: 'white' | 'yellow' | 'black'
}

export interface DetectedAllergen {
  key: string
  name: string
  category: string
  severity: 'high' | 'medium'
  note: string
}

export interface LabelCompleteness {
  score: number            // 0~100
  present: Record<string, boolean>
  missing: string[]
}

export interface SafetyAnalysisInput {
  text?: string                                  // 原标签/配料文本（扫描过敏原/营养/合规）
  additives?: { name: string; risk_level?: 'white' | 'yellow' | 'black' }[]  // 已匹配安全库条目
  matchedAdditiveNames?: string[]                // 文本命中的添加剂标准名（含库未收录）
  allergensDeclared?: string[] | null            // 商品已声明过敏原 key（来自 DB）
  nutrition?: {                                  // 结构化营养（来自 DB，每 100g）
    energy_kj?: number | null
    protein_g?: number | null
    fat_g?: number | null
    carb_g?: number | null
    sugar_g?: number | null
    sodium_mg?: number | null
  } | null
  /** 是否为「完整商品标签」语境（商品详情=true，纯配料粘贴=false）。
   *  影响标签合规缺失是否计入评级扣分（完整标签才严格）。 */
  isFullLabel?: boolean
}

export interface ComprehensiveSafetyReport {
  overall: { grade: SafetyGrade; score: number; label: string; color: string }
  additives: AdditiveRiskSummary | null
  allergens: { detected: DetectedAllergen[]; contains: boolean }
  nutrition: NutritionResult | null
  label: LabelCompleteness
  ageSuitability: { infantSafe: boolean; notes: string[] }
  warnings: string[]
  hasContent: boolean   // 是否有任何可分析内容（无则 UI 不渲染）
}

const GRADE_META: Record<SafetyGrade, { label: string; color: string }> = {
  S: { label: '较安全', color: '#16A34A' },
  A: { label: '需注意', color: '#D97706' },
  C: { label: '含风险', color: '#DC2626' },
  D: { label: '高风险', color: '#991B1B' },
}

// 标签合规必检项（GB 7718 关键强制标示内容）
const LABEL_FIELDS: { key: string; label: string; patterns: string[] }[] = [
  { key: 'ingredients', label: '配料表', patterns: ['配料', '原料'] },
  { key: 'nutrition', label: '营养成分表', patterns: ['营养成分', '能量', '蛋白质', '脂肪', '碳水化合物', '钠'] },
  { key: 'allergen', label: '致敏原提示', patterns: ['致敏', '过敏', '含有', '可能含有'] },
  { key: 'net_content', label: '净含量', patterns: ['净含量', '净含量：', '规格'] },
  { key: 'prod_date', label: '生产日期', patterns: ['生产日期', '制造日期'] },
  { key: 'shelf_life', label: '保质期', patterns: ['保质期', '最佳食用'] },
  { key: 'manufacturer', label: '生产者/厂名', patterns: ['生产商', '制造商', '生产企业', '厂名'] },
  { key: 'sc_license', label: '食品生产许可证(SC)', patterns: ['sc', '生产许可证', 'qs'] },
  { key: 'standard', label: '产品标准号', patterns: ['产品标准', '标准号', 'gb/t', 'q/', 'gb '] },
  { key: 'storage', label: '贮存条件', patterns: ['贮存', '储藏', '保存条件', '阴凉', '冷藏'] },
  { key: 'origin', label: '产地', patterns: ['产地', '原产地'] },
]

function checkLabelCompleteness(text: string): LabelCompleteness {
  const t = (text || '').toLowerCase()
  const present: Record<string, boolean> = {}
  let hit = 0
  for (const f of LABEL_FIELDS) {
    const ok = f.patterns.some((p) => t.includes(p))
    present[f.label] = ok
    if (ok) hit++
  }
  const score = Math.round((hit / LABEL_FIELDS.length) * 100)
  const missing = LABEL_FIELDS.filter((f) => !present[f.label]).map((f) => f.label)
  return { score, present, missing }
}

function summarizeAdditives(
  additives: SafetyAnalysisInput['additives'],
  matchedNames: string[] = [],
): AdditiveRiskSummary | null {
  if (!additives || (!additives.length && !matchedNames.length)) return null
  const white = additives.filter((a) => a.risk_level === 'white').length
  const yellow = additives.filter((a) => a.risk_level === 'yellow').length
  const black = additives.filter((a) => a.risk_level === 'black').length
  const knownNames = new Set(additives.map((a) => a.name))
  const unmatched = matchedNames.filter((n) => !knownNames.has(n)).length
  const worst: 'white' | 'yellow' | 'black' = black ? 'black' : yellow ? 'yellow' : 'white'
  return { total: additives.length + unmatched, white, yellow, black, unmatched, worst }
}

function collectAllergens(
  text: string,
  declared?: string[] | null,
): DetectedAllergen[] {
  const fromText = matchAllergens(text)
  const map = new Map<string, DetectedAllergen>()
  for (const a of fromText) {
    map.set(a.key, { key: a.key, name: a.name, category: a.category, severity: a.severity, note: a.note })
  }
  // 合并来自 DB 的已声明致敏原（补齐文本未扫到的）
  if (declared?.length) {
    for (const key of declared) {
      if (map.has(key)) continue
      const info = ALLERGEN_BY_KEY[key]
      if (info) map.set(key, { key: info.key, name: info.name, category: info.category, severity: info.severity, note: info.note })
    }
  }
  return [...map.values()]
}

// 反查表（模块内构建一次）
import { ALLERGEN_DICT } from './allergen-dictionary'
const ALLERGEN_BY_KEY: Record<string, AllergenInfo> = Object.fromEntries(
  ALLERGEN_DICT.map((a) => [a.key, a]),
)

export function analyzeFoodLabel(input: SafetyAnalysisInput): ComprehensiveSafetyReport {
  const text = input.text || ''

  // 1) 添加剂（优先用调用方已匹配的安全库条目；否则从文本本地回退匹配 ADDITIVE_DICT）
  let rawAdditives = input.additives
  let rawMatched = input.matchedAdditiveNames
  if (!rawAdditives && text.trim()) {
    const names = matchAdditiveKeys(text)
    if (names.length) {
      rawAdditives = names.map((n) => ({ name: n, risk_level: ADDITIVE_DICT[n]?.risk_level ?? 'white' }))
      rawMatched = names
    }
  }
  const additives = summarizeAdditives(rawAdditives, rawMatched)

  // 2) 致敏原
  const detectedAllergens = collectAllergens(text, input.allergensDeclared)
  const containsAllergen = detectedAllergens.length > 0

  // 3) 营养
  let nutrition: NutritionResult | null = null
  if (input.nutrition && Object.values(input.nutrition).some((v) => v != null)) {
    nutrition = analyzeStructuredNutrition(input.nutrition)
  } else if (text.trim()) {
    const parsed = parseNutritionFromText(text)
    if (parsed.available) nutrition = parsed
  }

  // 4) 标签合规
  const label = checkLabelCompleteness(text)

  // 5) 适宜年龄
  const ageNotes: string[] = []
  const hasBlack = additives?.black ? true : false
  const hasTrans = nutrition?.hasTransFat ? true : false
  const infantSafe = !hasBlack && !hasTrans
  if (hasTrans) ageNotes.push('含反式脂肪，婴幼儿（<3岁）禁用、成人应严控')
  if (hasBlack) ageNotes.push('含婴幼儿禁用/慎用的添加剂，婴幼儿不宜食用')
  if (containsAllergen) {
    const high = detectedAllergens.filter((a) => a.severity === 'high').map((a) => a.name)
    ageNotes.push(`检出致敏原：${high.join('、') || detectedAllergens.map((a) => a.name).join('、')}，过敏人群及婴幼儿首次食用需谨慎`)
  }
  if (nutrition?.highSugar) ageNotes.push('糖分偏高，不建议作为儿童日常高频零食')
  if (nutrition?.highSalt) ageNotes.push('钠偏高，儿童及高血压人群建议少盐')

  // 6) 评级聚合
  const warnings: string[] = []
  let score = 100

  if (additives) {
    if (additives.black > 0) { score -= 40; warnings.push(`含 ${additives.black} 项慎用添加剂（婴幼儿禁用/严控）`) }
    if (additives.yellow > 0) score -= Math.min(20, additives.yellow * 8)
    if (additives.unmatched > 0) warnings.push(`识别到 ${additives.unmatched} 项添加剂名，安全库尚未收录完整评级`)
  }
  if (hasTrans) { score -= 50; warnings.push('含反式脂肪，属高风险成分') }
  if (containsAllergen) { score -= 10; warnings.push(`含致敏原：${detectedAllergens.map((a) => a.name).join('、')}`) }
  if (nutrition) {
    if (nutrition.highSugar) score -= 12
    if (nutrition.highSalt) score -= 12
    if (nutrition.highFat) score -= 8
  }
  // 标签合规：仅完整标签语境严格扣分
  const criticalMissing = label.missing.filter((m) =>
    ['生产日期', '保质期', '生产者/厂名', '食品生产许可证(SC)'].includes(m),
  )
  if (input.isFullLabel && criticalMissing.length) {
    score -= Math.min(15, criticalMissing.length * 5)
    warnings.push(`标签缺失关键信息：${criticalMissing.join('、')}`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  let grade: SafetyGrade = 'S'
  if (score < 35) grade = 'D'
  else if (score < 60) grade = 'C'
  else if (score < 85) grade = 'A'

  // 强制保底：反式脂肪或婴幼儿禁用添加剂直接判 C/D
  if (hasTrans || hasBlack) grade = score < 35 ? 'D' : 'C'

  const hasContent =
    !!additives || containsAllergen || !!nutrition ||
    (input.isFullLabel ? label.score > 0 : false)

  return {
    overall: { grade, score, label: GRADE_META[grade].label, color: GRADE_META[grade].color },
    additives,
    allergens: { detected: detectedAllergens, contains: containsAllergen },
    nutrition,
    label,
    ageSuitability: { infantSafe, notes: ageNotes },
    warnings,
    hasContent,
  }
}

export { GRADE_META }
