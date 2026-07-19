// 性味归一化与聚合
// 字典本性（温/微温/平/微寒/凉/寒）与方案 6 档（大寒/寒凉/平性/微温/温热/大热）双向映射，
// 并提供「由原料聚合推导商品整体性味」能力。

import { INGREDIENT_DICT } from './shiyang-dictionary'
import { NATURE_SCALE, type NatureLevel } from './types'

// 字典性味 → 方案档位（冷性家族归寒凉，热性家族分温热/大热，平性对齐）。
// 说明：字典中无食材为「大寒」，故字典「寒」归入「寒凉」更符合常规认知；
// 极端「大寒」仅由商家显式填写 overall_nature 表达（如冰镇饮品、螃蟹等）。
const DICT_TO_SCALE: Record<string, NatureLevel> = {
  '寒': '寒凉',
  '凉': '寒凉',
  '微寒': '寒凉',
  '平': '平性',
  '微温': '微温',
  '温': '温热',
  '热': '大热',
  '大热': '大热',
}

// 方案档位 → 数值（越热越大），用于寒热对冲 / 温补叠加判定
const SCALE_VALUE: Record<NatureLevel, number> = {
  '大寒': -3,
  '寒凉': -2,
  '平性': 0,
  '微温': 1,
  '温热': 2,
  '大热': 3,
}

const SCALE_SET: ReadonlySet<string> = new Set(NATURE_SCALE as readonly string[])

// 将任意性味字符串归一化为方案 6 档（兼容字典原值、别名）
export function normalizeNature(raw?: string | null): NatureLevel | null {
  if (!raw) return null
  const t = raw.trim()
  if (SCALE_SET.has(t)) return t as NatureLevel
  const mapped = DICT_TO_SCALE[t]
  if (mapped) return mapped
  if (t === '平') return '平性'
  return null
}

// 由原料 keys 聚合推导商品整体性味（加权平均后取最近档位）
export function aggregateNatureFromIngredients(ingredientKeys?: string[] | null): NatureLevel | null {
  if (!ingredientKeys || !ingredientKeys.length) return null
  const counts: Record<NatureLevel, number> = {
    '大寒': 0, '寒凉': 0, '平性': 0, '微温': 0, '温热': 0, '大热': 0,
  }
  let total = 0
  for (const key of ingredientKeys) {
    const ing = INGREDIENT_DICT[key]
    if (!ing) continue
    const lvl = DICT_TO_SCALE[ing.nature]
    if (!lvl) continue
    counts[lvl] += 1
    total += 1
  }
  if (!total) return null
  let sum = 0
  for (const lvl of NATURE_SCALE) sum += SCALE_VALUE[lvl] * counts[lvl]
  const avg = sum / total
  let best: NatureLevel = '平性'
  let bestDiff = Infinity
  for (const lvl of NATURE_SCALE) {
    const d = Math.abs(SCALE_VALUE[lvl] - avg)
    if (d < bestDiff) {
      bestDiff = d
      best = lvl
    }
  }
  return best
}

// 解析商品整体性味：优先用商家填写值，否则由原料聚合推导
export function resolveNature(input: {
  overall_nature?: string | null
  ingredients?: string[] | null
}): NatureLevel | null {
  const direct = normalizeNature(input.overall_nature)
  if (direct) return direct
  return aggregateNatureFromIngredients(input.ingredients)
}
