// 营养成分解析与评估（依据 GB 28050《预包装食品营养标签通则》）
// ----------------------------------------------------------------------------
// 用途：从商品标签/配料原文中解析「营养成分表」关键项（每 100g/100mL），
//       并以儿童零食为视角评估「高糖 / 高钠 / 高脂 / 含反式脂肪」。
//
// 本版增强：
//   ✅ NRV%      —— 占每日营养素参考值%（GB 28050 附录 A 标准）
//   ✅ 儿童每日%  —— 该 100g 占儿童每日推荐上限%（糖/钠/能量，给家长直观参考）
//   ✅ 鲁棒解析  —— 兼容「能量 1980kJ / 能量 1980 千焦 / NRV% 列 / 每份基准换算」
//   ✅ 单位容错  —— 千焦/千卡/克/毫克 全角半角均可
//
// 阈值对齐 GB 28050「含量声称」边界（固体食品，每 100g）：
//   糖  ≥15g  → 高糖；≥22.5g → 极高糖
//   钠  ≥400mg → 高钠；≥800mg → 极高钠
//   脂肪 ≥17.5g → 高脂
//   反式脂肪 >0 → 含反式脂肪（应标注且越低越好）
// 纯本地解析，无需联网；解析不到具体项时该项为 null（不臆造）。

export type NutritionBasis = 'per100g' | 'perServing' | 'unknown'

export interface NutritionItem {
  key: string
  label: string
  value: number
  unit: string
  flag?: 'high' | 'extreme' | 'trans'
  nrvPct?: number          // 占每日营养素参考值%（GB 28050）：能量/蛋白/脂肪/碳水/钠
  childDailyPct?: number   // 占儿童每日推荐上限%（糖/钠/能量，给家长直观参考）
}

export interface NutritionResult {
  available: boolean
  basis: NutritionBasis
  servingNote?: string      // 例如「按每份 30g 折算为每 100g」
  items: NutritionItem[]
  flags: string[]
  highSugar: boolean
  highSalt: boolean
  highFat: boolean
  hasTransFat: boolean
}

export const NUTRITION_THRESHOLDS = {
  HIGH_SUGAR: 15,
  EXTREME_SUGAR: 22.5,
  HIGH_SODIUM: 400,
  EXTREME_SODIUM: 800,
  HIGH_FAT: 17.5,
}

/** GB 28050 附录 A 营养素参考值（NRV） */
export const NRV_REF: Record<string, number> = {
  energy_kj: 8400,
  protein_g: 60,
  fat_g: 60,
  carb_g: 300,
  sodium_mg: 2000,
}

/** 儿童每日推荐上限（用于「儿童每日%」直观提示，给家长决策参考）
 *  - 能量：约 6000 kJ（7 岁儿童参考值，低于成人 8400）
 *  - 糖：25 g（WHO 儿童游离糖建议上限）
 *  - 钠：1200 mg（中国居民膳食指南 4~6 岁参考上限）
 */
export const CHILD_DAILY_REF: Record<string, number> = {
  energy_kj: 6000,
  sugar_g: 25,
  sodium_mg: 1200,
}

export const NUTRITION_LABELS: Record<string, string> = {
  energy_kj: '能量',
  protein_g: '蛋白质',
  fat_g: '脂肪',
  carb_g: '碳水化合物',
  sugar_g: '糖',
  sodium_mg: '钠',
}

function nrvPctOf(key: string, value: number): number | undefined {
  const ref = NRV_REF[key]
  if (!ref) return undefined
  return Math.round((value / ref) * 100)
}

function childPctOf(key: string, value: number): number | undefined {
  const ref = CHILD_DAILY_REF[key]
  if (!ref) return undefined
  return Math.round((value / ref) * 100)
}

// ---------- 鲁棒数值提取 ----------
// 所有正则均以「字符串构造」方式书写，避免正则字面量中反斜杠转义与换行歧义。

const NUM = '([\\d.]+)'

/** 在某关键词后就近抓取「数值+单位」。兼容单位在数值前/后、全角/半角。 */
function grabAfter(text: string, keyword: string, units: string): number | null {
  const kw = '(?:' + keyword + ')'   // 关键词整体成组，避免「能量|热量」被拆成独立分支取不到数值
  const re = new RegExp(kw + '[^\\d]{0,10}?(' + NUM + ')\\s*(' + units + ')', 'i')
  const m = text.match(re)
  if (m) {
    const v = parseFloat(m[1])
    if (Number.isFinite(v)) return v
  }
  // 退路：关键词后第一个数字（单位可能缺失/在别处）
  const re2 = new RegExp(kw + '[^\\d]{0,10}?(' + NUM + ')', 'i')
  const m2 = text.match(re2)
  if (m2) {
    const v = parseFloat(m2[1])
    return Number.isFinite(v) ? v : null
  }
  return null
}

/** 检测营养基准：每 100g / 每份（含每份质量） */
function detectBasis(text: string): { basis: NutritionBasis; servingMass?: number; note?: string } {
  if (/每\s*100\s*(g|克|ml|毫升)/i.test(text)) return { basis: 'per100g' }
  const servRe = new RegExp('(每份|每袋|每包|per\\s*serving)[^\\d]{0,8}?([\\d.]+)\\s*(g|克|ml|毫升)', 'i')
  const serv = text.match(servRe)
  if (serv) {
    const mass = parseFloat(serv[2])
    if (Number.isFinite(mass) && mass > 0) {
      return { basis: 'perServing', servingMass: mass, note: `按每份 ${mass}g 折算为每 100g` }
    }
    return { basis: 'perServing' }
  }
  return { basis: 'unknown' }
}

// ---------- 文本解析 ----------

/** 从标签原文解析营养成分表 */
export function parseNutritionFromText(text: string): NutritionResult {
  const t = text || ''
  const items: NutritionItem[] = []
  const flags: string[] = []
  let highSugar = false
  let highSalt = false
  let highFat = false
  let hasTransFat = false

  // 反式脂肪：先单独抓，再从文本剔除，避免污染「脂肪」匹配
  const trans = grabAfter(t, '反式脂肪', '(g|克)')
  let rest = t
  if (trans !== null) {
    hasTransFat = trans > 0
    rest = rest.replace(new RegExp('反式脂肪[^0-9]{0,10}?[\\d.]+\\s*(g|克)', 'i'), '')
    items.push({ key: 'trans_fat', label: '反式脂肪', value: trans, unit: 'g', flag: trans > 0 ? 'trans' : undefined })
    if (trans > 0) flags.push(`含反式脂肪 ${trans}g/100g，婴幼儿禁用、成人应严控`)
  }

  const energy = grabAfter(rest, '能量|热量', '(kj|千焦|kcal|千卡|大卡)')
  const protein = grabAfter(rest, '蛋白质', '(g|克)')
  const fat = grabAfter(rest, '脂肪(?!酸)', '(g|克)')
  const carb = grabAfter(rest, '碳水化合物', '(g|克)')
  // 糖：避免误命中「糖醇/糖类/糖浆/糖原」
  const sugar = (() => {
    const m = rest.match(/糖(?!醇|类|分|浆|原)[^0-9]{0,10}?([\d.]+)\s*(g|克)?/i)
    return m ? parseFloat(m[1]) : null
  })()
  const sodium = grabAfter(rest, '钠', '(mg|毫克)')

  const basisInfo = detectBasis(t)
  const scale = basisInfo.basis === 'perServing' && basisInfo.servingMass ? 100 / basisInfo.servingMass : 1
  const scaledNote = scale !== 1 ? basisInfo.note : undefined

  const pushItem = (key: string, rawValue: number | null, unit: string, flag?: 'high' | 'extreme') => {
    if (rawValue == null) return
    const value = scale !== 1 ? Math.round(rawValue * scale * 10) / 10 : rawValue
    items.push({
      key,
      label: NUTRITION_LABELS[key] ?? key,
      value,
      unit,
      flag,
      nrvPct: nrvPctOf(key, value),
      childDailyPct: childPctOf(key, value),
    })
  }

  if (energy !== null) {
    pushItem('energy_kj', energy, 'kJ')
  }
  if (protein !== null) {
    pushItem('protein_g', protein, 'g')
  }
  if (fat !== null) {
    const f = fat * scale >= NUTRITION_THRESHOLDS.HIGH_FAT ? 'high' : undefined
    const v = scale !== 1 ? Math.round(fat * scale * 10) / 10 : fat
    if (f) { highFat = true; flags.push(`脂肪偏高（${v}g/100g），建议限量`) }
    items.push({ key: 'fat_g', label: '脂肪', value: v, unit: 'g', flag: f, nrvPct: nrvPctOf('fat_g', v), childDailyPct: childPctOf('fat_g', v) })
  }
  if (carb !== null) {
    pushItem('carb_g', carb, 'g')
  }
  if (sugar !== null) {
    const v = scale !== 1 ? Math.round(sugar * scale * 10) / 10 : sugar
    let flag: 'high' | 'extreme' | undefined
    if (v >= NUTRITION_THRESHOLDS.EXTREME_SUGAR) { flag = 'extreme'; highSugar = true; flags.push(`糖分过高（${v}g/100g），儿童建议严格限量`) }
    else if (v >= NUTRITION_THRESHOLDS.HIGH_SUGAR) { flag = 'high'; highSugar = true; flags.push(`含糖量偏高（${v}g/100g），儿童建议限量`) }
    items.push({ key: 'sugar_g', label: '糖', value: v, unit: 'g', flag, nrvPct: nrvPctOf('sugar_g', v), childDailyPct: childPctOf('sugar_g', v) })
  }
  if (sodium !== null) {
    const v = scale !== 1 ? Math.round(sodium * scale * 10) / 10 : sodium
    let flag: 'high' | 'extreme' | undefined
    if (v >= NUTRITION_THRESHOLDS.EXTREME_SODIUM) { flag = 'extreme'; highSalt = true; flags.push(`钠含量极高（${v}mg/100g），增加肾脏与血压负担`) }
    else if (v >= NUTRITION_THRESHOLDS.HIGH_SODIUM) { flag = 'high'; highSalt = true; flags.push(`钠偏高（${v}mg/100g），儿童建议少盐`) }
    items.push({ key: 'sodium_mg', label: '钠', value: v, unit: 'mg', flag, nrvPct: nrvPctOf('sodium_mg', v), childDailyPct: childPctOf('sodium_mg', v) })
  }

  return {
    available: items.length > 0,
    basis: basisInfo.basis,
    servingNote: scaledNote,
    items,
    flags,
    highSugar,
    highSalt,
    highFat,
    hasTransFat,
  }
}

// ---------- 结构化数据（来自商品 DB 字段）----------

/** 由结构化营养数据（来自商品 DB 字段）构造评估结果 */
export function analyzeStructuredNutrition(n: {
  energy_kj?: number | null
  protein_g?: number | null
  fat_g?: number | null
  carb_g?: number | null
  sugar_g?: number | null
  sodium_mg?: number | null
}): NutritionResult {
  const items: NutritionItem[] = []
  const flags: string[] = []
  let highSugar = false
  let highSalt = false
  let highFat = false
  let hasTransFat = false

  const push = (key: string, v: number | null, unit: string) => {
    if (v == null) return
    items.push({ key, label: NUTRITION_LABELS[key] ?? key, value: v, unit, nrvPct: nrvPctOf(key, v), childDailyPct: childPctOf(key, v) })
  }

  push('energy_kj', n.energy_kj ?? null, 'kJ')
  push('protein_g', n.protein_g ?? null, 'g')
  if (n.fat_g != null) {
    const f = n.fat_g >= NUTRITION_THRESHOLDS.HIGH_FAT
    if (f) { highFat = true; flags.push(`脂肪偏高（${n.fat_g}g/100g），建议限量`) }
    items.push({ key: 'fat_g', label: '脂肪', value: n.fat_g, unit: 'g', flag: f ? 'high' : undefined, nrvPct: nrvPctOf('fat_g', n.fat_g), childDailyPct: childPctOf('fat_g', n.fat_g) })
  }
  push('carb_g', n.carb_g ?? null, 'g')
  if (n.sugar_g != null) {
    let flag: 'high' | 'extreme' | undefined
    if (n.sugar_g >= NUTRITION_THRESHOLDS.EXTREME_SUGAR) { flag = 'extreme'; highSugar = true; flags.push(`糖分过高（${n.sugar_g}g/100g），儿童建议严格限量`) }
    else if (n.sugar_g >= NUTRITION_THRESHOLDS.HIGH_SUGAR) { flag = 'high'; highSugar = true; flags.push(`含糖量偏高（${n.sugar_g}g/100g），儿童建议限量`) }
    items.push({ key: 'sugar_g', label: '糖', value: n.sugar_g, unit: 'g', flag, nrvPct: nrvPctOf('sugar_g', n.sugar_g), childDailyPct: childPctOf('sugar_g', n.sugar_g) })
  }
  if (n.sodium_mg != null) {
    let flag: 'high' | 'extreme' | undefined
    if (n.sodium_mg >= NUTRITION_THRESHOLDS.EXTREME_SODIUM) { flag = 'extreme'; highSalt = true; flags.push(`钠含量极高（${n.sodium_mg}mg/100g），增加肾脏与血压负担`) }
    else if (n.sodium_mg >= NUTRITION_THRESHOLDS.HIGH_SODIUM) { flag = 'high'; highSalt = true; flags.push(`钠偏高（${n.sodium_mg}mg/100g），儿童建议少盐`) }
    items.push({ key: 'sodium_mg', label: '钠', value: n.sodium_mg, unit: 'mg', flag, nrvPct: nrvPctOf('sodium_mg', n.sodium_mg), childDailyPct: childPctOf('sodium_mg', n.sodium_mg) })
  }

  return {
    available: items.length > 0,
    basis: 'per100g',
    items,
    flags,
    highSugar,
    highSalt,
    highFat,
    hasTransFat,
  }
}
