/**
 * 健康短板分析引擎
 * ------------------------------------------------------------
 * 输入：用户体质标签（constitution_tags）+ 过敏原（allergies）
 * 输出：「健康短板」清单——用户需要补强的方向 + 需要规避的性味雷区
 *
 * 与食安扫描结果（食养性味条目 shiyang）比对，给出针对该商品的
 * 「补 / 伤 / 中性」判断，让「食品配料安全」真正结合用户身体短板。
 *
 * 合规框架：全程是「食养偏好/短板参考」，不做医疗诊断、不替代医嘱。
 */

import { CONSTITUTION_TYPES } from '@/utils/constitution-test'
import type { IngredientEntry } from '@/utils/shiyang-dictionary'
import { ALLERGY_OPTIONS } from './profile-map'

// ── 性味等级轴：寒(1) → 凉(2) → 平(3) → 温(4) → 热(5) ──
const NATURE_LEVEL: Record<string, number> = {
  '大寒': 1, '寒': 1,
  '微寒': 2, '凉': 2,
  '平': 3, '平性': 3,
  '微温': 4, '温': 4, '温热': 4,
  '大热': 5, '热': 5,
}

export interface HealthShortfall {
  key: string
  kind: 'constitution' | 'allergy'
  label: string
  emoji: string
  severity: 'high' | 'mid' | 'low'
  desc: string
  /** 商品性味等级 <= 此值则「伤」短板（阴性短板，如阳虚怕冷，凉/寒伤它） */
  harmLevelMax?: number
  /** 商品性味等级 >= 此值则「伤」短板（阳性短板，如阴虚易上火，温/热伤它） */
  harmLevelMin?: number
  /** 商品性味等级 <= 此值则「补」短板 */
  boostLevelMax?: number
  /** 商品性味等级 >= 此值则「补」短板 */
  boostLevelMin?: number
  avoidFoods: string[]
}

export interface ShortfallHit {
  shortfallKey: string
  shortfallLabel: string
  item: string // 命中的食材（含性味）
  kind: 'harm' | 'boost'
}

export interface ShortfallEval {
  status: 'harm' | 'boost' | 'neutral'
  hits: ShortfallHit[]
}

/** 把体质 avoidNature / recommendNature 文案映射为等级阈值 */
function natureToThresholds(natures: string[], mode: 'harm' | 'boost'): { min?: number; max?: number } {
  const negative = natures.some((n) => /寒|凉/.test(n))
  const positive = natures.some((n) => /温|热/.test(n))
  if (mode === 'harm') {
    if (negative) return { max: 2 }
    if (positive) return { min: 4 }
    return {}
  }
  if (positive) return { min: 4 }
  if (negative) return { max: 2 }
  return {}
}

/** 把任意输入的标签（体质 key / 体质名 / body_state）归一为命中的体质 key 列表 */
function resolveConstitutionKeys(inputTags: string[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const tag of inputTags) {
    if (!tag) continue
    if (CONSTITUTION_TYPES[tag]) {
      if (!seen.has(tag)) { seen.add(tag); keys.push(tag) }
      continue
    }
    const byName = Object.keys(CONSTITUTION_TYPES).find((k) => CONSTITUTION_TYPES[k].name === tag)
    if (byName) {
      if (!seen.has(byName)) { seen.add(byName); keys.push(byName) }
      continue
    }
    const byBody = Object.keys(CONSTITUTION_TYPES).find((k) => CONSTITUTION_TYPES[k].bodyStates.includes(tag))
    if (byBody && !seen.has(byBody)) {
      seen.add(byBody)
      keys.push(byBody)
    }
  }
  return keys
}

/** 由体质标签（key / 名 / body_state）+ 过敏原构建短板清单 */
export function buildHealthShortfalls(inputTags: string[] = [], allergies: string[] = []): HealthShortfall[] {
  const list: HealthShortfall[] = []
  const constKeys = resolveConstitutionKeys(inputTags)

  for (const tag of constKeys) {
    const c = CONSTITUTION_TYPES[tag]
    if (!c) continue
    const harmTh = natureToThresholds(c.avoidNature, 'harm')
    const boostTh = natureToThresholds(c.recommendNature, 'boost')
    list.push({
      key: c.key,
      kind: 'constitution',
      label: c.name,
      emoji: c.emoji,
      severity: c.key === 'pinghe' ? 'low' : 'mid',
      desc:
        `短板方向：${c.healthGoals.length ? c.healthGoals.join('、') : c.description}` +
        `；需留意性味：${c.avoidNature.length ? c.avoidNature.join('、') : '无明显禁忌'}`,
      harmLevelMax: harmTh.max,
      harmLevelMin: harmTh.min,
      boostLevelMax: boostTh.max,
      boostLevelMin: boostTh.min,
      avoidFoods: c.avoidFoods,
    })
  }

  // 过敏原短板（高优先级，接触即需避开）
  const allergyName: Record<string, string> = {}
  for (const a of ALLERGY_OPTIONS) allergyName[a.key] = a.name
  for (const k of allergies) {
    list.push({
      key: `allergy:${k}`,
      kind: 'allergy',
      label: allergyName[k] ?? k,
      emoji: '⚠️',
      severity: 'high',
      desc: '过敏成分，接触即需避开',
      avoidFoods: [],
    })
  }

  return list
}

function itemLevel(nature?: string): number | null {
  if (!nature) return null
  return NATURE_LEVEL[nature] ?? null
}

/** 评估一次扫描结果（食养性味条目）对用户短板的「补 / 伤 / 中性」 */
export function evaluateShortfall(shiyang: IngredientEntry[], shortfalls: HealthShortfall[]): ShortfallEval {
  const hits: ShortfallHit[] = []
  if (!shortfalls.length) return { status: 'neutral', hits }

  for (const entry of shiyang) {
    const lv = itemLevel(entry.nature)
    if (lv == null) continue
    for (const s of shortfalls) {
      if (s.kind === 'allergy') continue // 过敏原由扫描强预警单独处理
      const harm =
        (s.harmLevelMax != null && lv <= s.harmLevelMax) ||
        (s.harmLevelMin != null && lv >= s.harmLevelMin)
      const boost =
        !harm &&
        ((s.boostLevelMax != null && lv <= s.boostLevelMax) ||
          (s.boostLevelMin != null && lv >= s.boostLevelMin))
      if (harm) {
        hits.push({ shortfallKey: s.key, shortfallLabel: s.label, item: `${entry.zh}(${entry.nature})`, kind: 'harm' })
      } else if (boost) {
        hits.push({ shortfallKey: s.key, shortfallLabel: s.label, item: `${entry.zh}(${entry.nature})`, kind: 'boost' })
      }
    }
  }

  if (hits.length === 0) return { status: 'neutral', hits }
  const hasHarm = hits.some((h) => h.kind === 'harm')
  return { status: hasHarm ? 'harm' : 'boost', hits }
}
