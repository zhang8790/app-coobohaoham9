// ============================================================
// 来电有喜 · 食疗商品模块 · 统一食疗计算引擎（系统内核）
// ------------------------------------------------------------
// 纯函数、零网络依赖。输入「商品食材清单（含占比/烹饪/辅料）」，
// 输出：整体性味、综合功效、合并过敏原（三色分级）、慎食人群、
// 慢病适配标签、三色预警、合规商家寄语模板。
// 所有商品（番茄炒蛋、牛肉党参汤…）上传时复用同一套算法，
// 前端详情页/商家编辑页实时调用，做到「一劳永逸模板」。
// 合规：所有文案兜底统一声明 + 医疗宣称词硬替换，规避平台违规。
// ============================================================

// ---------- 类型 ----------
export interface FoodIngredient {
  id?: string
  name: string
  nature: string // 性味枚举（见 NATURE_VALUE 键）
  base_effect?: string | null
  fit_scenes?: string | null
  caution_crowds?: string | null // 逗号分隔
  allergens?: string[] | null
  chronic_tags?: string[] | null
  neutralize?: string | null
}

export interface ProductIngredientInput {
  ingredient: FoodIngredient
  ratio?: number // 实际添加占比 0-100，决定提示权重；缺省平均
  cooking?: string // 烹饪方式：清炒 / 少油 / 重油 / 红烧 ...
  aux?: string[] // 辅料：盐 / 糖 / 食用油 ...
}

export interface TherapyAllergen {
  name: string
  severity: 'high' | 'mid' // high=重度提醒（红），mid=中度（红·轻）
}

export interface TherapyWarning {
  level: 'red' | 'orange' | 'blue' // 红=过敏风险 / 橙=体质慎食 / 蓝=慢病适配
  code: string
  label: string
  text: string
}

export interface ProductTherapyReport {
  overall_nature_code: string // 微凉 / 平性 ...（计算所得主导性味）
  overall_nature: string // 描述语：微凉性平组合
  combined_effect: string // 综合功效
  allergens: TherapyAllergen[] // 合并过敏原（占比高→重度，置顶）
  fit_people: string // 适宜人群
  caution_people: string // 慎食人群
  chronic_tags: string[] // 慢病适配标签（去重）
  warnings: TherapyWarning[] // 三色预警（红/橙/蓝）
  merchant_note: string // 80 字商家寄语模板
  disclaimer: string
}

// ---------- 性味数值映射（严格执行用户规则） ----------
// 凉 + 平 = 微凉；温 + 平 = 微温；凉 + 温 = 平性；占主导者为占比最高食材
const NATURE_VALUE: Record<string, number> = {
  大寒: -3,
  寒凉: -2,
  凉: -2,
  微凉: -1,
  平性: 0,
  平: 0,
  微温: 1,
  温: 2,
  温热: 2,
  大热: 3,
  热: 3,
}
const NATURE_LEVELS = Object.keys(NATURE_VALUE)
const NATURE_LABEL: Record<string, string> = {
  大寒: '大寒', 寒凉: '寒凉', 凉: '凉', 微凉: '微凉',
  平性: '平性', 平: '平性', 微温: '微温', 温: '温', 温热: '温热', 大热: '大热', 热: '大热',
}

// 性味 → 体感短句（抓心用，仅描述口感/体感，不写功效断言，守住合规底线）
export const NATURE_FEELING: Record<string, string> = {
  大寒: '寒凉清润', 寒凉: '清爽凉润', 凉: '清爽偏凉', 微凉: '清润爽口',
  平性: '平和养胃', 平: '平和适口', 微温: '温润舒服', 温: '温润暖胃',
  温热: '温热养身', 大热: '辛温偏燥', 热: '温通偏燥',
}

function natureToValue(n?: string | null): number {
  if (!n) return 0
  const v = NATURE_VALUE[n.trim()]
  return v === undefined ? 0 : v
}

// 把数值映射回最近性味档位
function valueToNatureCode(v: number): string {
  let best = '平性'
  let bestDiff = Infinity
  for (const lvl of NATURE_LEVELS) {
    const d = Math.abs(NATURE_VALUE[lvl] - v)
    if (d < bestDiff) {
      bestDiff = d
      best = lvl
    }
  }
  return best
}

// ---------- 合规：医疗宣称词硬替换 ----------
const MEDICAL_TERM_MAP: Record<string, string> = {
  降压: '关注血压',
  降血压: '关注血压',
  降血脂: '关注血脂',
  治疗: '食养辅助',
  治愈: '食养辅助',
  治病: '食养辅助',
  抗炎: '食养舒缓',
  消炎: '食养舒缓',
  抗癌: '日常食养',
  减肥: '日常膳食管理',
  减脂治病: '日常膳食管理',
  疗效: '食养参考',
  药用: '食养',
  药疗: '食养',
}
export function sanitizeTherapyCopy(text: string): string {
  let out = text || ''
  for (const [bad, good] of Object.entries(MEDICAL_TERM_MAP)) {
    out = out.split(bad).join(good)
  }
  return out
}

export const THERAPY_DISCLAIMER =
  '本内容仅为食养参考，不属于医疗建议，不能替代药物治疗；过敏体质、慢性病患者请结合自身医嘱食用。'

// ---------- 1. 性味合并 ----------
export function mergeNature(items: ProductIngredientInput[]): { code: string; desc: string } {
  const valid = items.filter((it) => it.ingredient && it.ingredient.nature)
  if (valid.length === 0) return { code: '', desc: '' }
  const totalRatio = valid.reduce((s, it) => s + (it.ratio || 0), 0)
  const useRatio = totalRatio > 0
  let sum = 0
  let weight = 0
  for (const it of valid) {
    const w = useRatio ? (it.ratio || 0) : 1
    sum += natureToValue(it.ingredient.nature) * w
    weight += w
  }
  const avg = weight > 0 ? sum / weight : 0
  const code = NATURE_LABEL[valueToNatureCode(avg)] || '平性'
  // 描述语：单味→其性味；多味→「X性Y组合」
  const distinct = Array.from(new Set(valid.map((it) => NATURE_LABEL[it.ingredient.nature] || it.ingredient.nature)))
  const desc = distinct.length === 1 ? distinct[0] : distinct.join('') + '组合'
  return { code, desc }
}

// ---------- 2. 综合功效 ----------
export function mergeEffect(items: ProductIngredientInput[]): string {
  const parts = items
    .map((it) => (it.ingredient.base_effect || '').trim())
    .filter(Boolean)
  // 去重（按「、」拆词后合并）
  const seen = new Set<string>()
  const merged: string[] = []
  for (const p of parts) {
    for (const seg of p.split(/[、，,]/)) {
      const s = seg.trim()
      if (s && !seen.has(s)) {
        seen.add(s)
        merged.push(s)
      }
    }
  }
  return sanitizeTherapyCopy(merged.join('、'))
}

// ---------- 3. 过敏原合并（占比高→重度，置顶） ----------
export function mergeAllergens(items: ProductIngredientInput[]): TherapyAllergen[] {
  const totalRatio = items.reduce((s, it) => s + (it.ratio || 0), 0)
  const useRatio = totalRatio > 0
  const map = new Map<string, number>()
  for (const it of items) {
    const als = it.ingredient.allergens || []
    for (const a of als) {
      const w = useRatio ? (it.ratio || 0) : 1
      map.set(a, (map.get(a) || 0) + w)
    }
  }
  const result: TherapyAllergen[] = []
  for (const [name, w] of map.entries()) {
    // 重度门槛：该过敏原食材占比(或权重) ≥ 40% 视为重度提醒（蛋类在蛋类菜品天然触发）
    const severity: 'high' | 'mid' = w >= 40 ? 'high' : 'mid'
    result.push({ name, severity })
  }
  // 重度置顶
  result.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
  return result
}

// ---------- 4. 慎食人群 + 慢病标签 ----------
function splitCrowds(s?: string | null): string[] {
  return (s || '')
    .split(/[、，,]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// 把禁忌人群文案归类为「体质慎食」已知类别（用于橙标）
const CARE_CATEGORY: { key: string; kw: string[] }[] = [
  { key: '体寒', kw: ['体寒', '脾胃虚寒', '怕冷', '虚寒', '宫寒'] },
  { key: '经期', kw: ['经期'] },
  { key: '上火', kw: ['上火', '咽喉肿痛', '炎症', '热性'] },
]

export function mergeCrowds(
  items: ProductIngredientInput[],
): { caution: string[]; chronic: string[]; careCategories: string[] } {
  const caution = new Set<string>()
  const chronic = new Set<string>()
  const careCategories = new Set<string>()
  for (const it of items) {
    splitCrowds(it.ingredient.caution_crowds).forEach((c) => caution.add(c))
    ;(it.ingredient.chronic_tags || []).forEach((c) => chronic.add(c))
    const lower = (it.ingredient.caution_crowds || '').toLowerCase()
    for (const cat of CARE_CATEGORY) {
      if (cat.kw.some((k) => lower.includes(k.toLowerCase()))) careCategories.add(cat.key)
    }
  }
  // 烹饪/辅料派生提示（高血压差异化的核心）
  const hasHeavyOil = items.some((it) => /重油|红烧|油炸|油焖/.test(it.cooking || ''))
  const hasSaltOrSugar = items.some((it) => (it.aux || []).some((a) => /盐|糖|酱油|酱/.test(a)))
  if (hasHeavyOil || hasSaltOrSugar) {
    caution.add('高血压人群注意控盐控油，建议少油少盐版本')
  }
  return {
    caution: Array.from(caution),
    chronic: Array.from(chronic),
    careCategories: Array.from(careCategories),
  }
}

// ---------- 5. 三色预警 + 文案组装 ----------
export function buildTherapyReport(
  productName: string,
  items: ProductIngredientInput[],
): ProductTherapyReport {
  const nature = mergeNature(items)
  const combined_effect = mergeEffect(items)
  const allergens = mergeAllergens(items)
  const { caution, chronic, careCategories } = mergeCrowds(items)

  const warnings: TherapyWarning[] = []

  // 红：过敏风险（最优先）
  for (const a of allergens) {
    warnings.push({
      level: 'red',
      code: `allergen_${a.name}`,
      label: '过敏风险',
      text: `${a.name}${a.severity === 'high' ? '（重度提醒）' : ''}，过敏者请勿食用。`,
    })
  }

  // 橙：体质慎食
  for (const cat of careCategories) {
    const tipMap: Record<string, string> = {
      体寒: '体寒怕冷、脾胃虚寒、女生生理期人群：偏凉食材建议搭配生姜、红枣等同食，更温和适口。',
      经期: '生理期女性：偏凉食材建议搭配温性辅料，不宜过量生冷。',
      上火: '容易上火、咽喉肿痛人群：温补食材建议单次少量食用。',
    }
    warnings.push({ level: 'orange', code: `care_${cat}`, label: '体质慎食', text: tipMap[cat] || '' })
  }
  // 其它未归类慎食人群也进橙标（去重）
  for (const c of caution) {
    if (warnings.some((w) => w.text.includes(c))) continue
    warnings.push({ level: 'orange', code: `caution_${c}`, label: '食用注意', text: `${c}。`,
    } as TherapyWarning)
  }

  // 蓝：慢病适配（附食用建议）
  for (const t of chronic) {
    const advice = /高血压/.test(t)
      ? '建议选择少油少盐款，单次食用适量。'
      : /减脂|减肥/.test(t)
        ? '作为日常轻盈膳食搭配适量食用。'
        : /儿童/.test(t)
          ? '适合作为日常营养补给。'
          : '结合个人体质适量食用。'
    warnings.push({
      level: 'blue',
      code: `chronic_${t}`,
      label: '慢病适配',
      text: `${t}：${advice}`,
    })
  }

  // 适宜人群 = 食材适用场景(fit_scenes) 聚合 + 慢病标签「友好/适宜/营养/补充」类 + 通用兜底
  // 由食材真实驱动，避免写死通用串；与 warnings 成对呈现，给用户正向信号而非纯警示。
  const fitScenes = Array.from(
    new Set(
      items
        .flatMap((it) => splitCrowds(it.ingredient.fit_scenes))
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
  const chronicFit = chronic.filter((t) => /友好|适宜|营养|补充/.test(t))
  const fitParts = [...fitScenes, ...chronicFit]
  const fit_people = sanitizeTherapyCopy(
    (fitParts.length ? fitParts.join('、') + '、' : '') + '日常佐餐、上班族、青少年营养补给',
  )

  // 商家寄语模板（80 字内，合规过滤）
  const merchant_note = sanitizeTherapyCopy(
    `${productName}为${nature.desc}食养，${combined_effect}；日常温和适口。` +
      (allergens.length ? `${allergens.map((a) => a.name + '过敏者请勿下单').join('，')}；` : '') +
      (chronic.some((t) => /高血压/.test(t)) ? '高血压食客建议清淡做法食用。' : ''),
  ).slice(0, 80)

  return {
    overall_nature_code: nature.code,
    overall_nature: nature.desc,
    combined_effect,
    allergens,
    fit_people,
    caution_people: caution.join('；'),
    chronic_tags: chronic,
    warnings,
    merchant_note,
    disclaimer: THERAPY_DISCLAIMER,
  }
}

// 首屏一句话抓心结论：基于真实配料计算，给确定性体感，非功效断言。
// 过敏存在时主句硬提示（合规不可弱化），否则给正向体感结论。
export interface TherapyHeadline {
  main: string // 抓心主句（首屏最大字号）
  sub: string // 补充副句
}

export function buildTherapyHeadline(r: ProductTherapyReport): TherapyHeadline {
  const red = r.warnings.find((w) => w.level === 'red')
  const feeling = NATURE_FEELING[r.overall_nature_code] || ''
  if (red) {
    const m = red.text.match(/含([^，。、\s]+)/)
    const name = m ? m[1] : '过敏成分'
    return {
      main: `含${name} · 过敏请务必留意`,
      sub: feeling ? `${feeling} · 其余朋友可安心享用` : '其余朋友可安心享用',
    }
  }
  const main = feeling ? `${feeling} · 多数人都能安心吃` : '食养参考 · 适量为宜'
  const sub = r.fit_people
    ? `适合${r.fit_people.split('、')[0].replace(/等$/, '')}等`
    : '基于真实配料实时计算'
  return { main, sub }
}
