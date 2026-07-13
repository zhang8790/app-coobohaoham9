// 原料 / 食养成分分析工具
// ------------------------------------------------------------
// 复用 shiyang-dictionary 的食材字典，将商品名称/描述解析为具体食材，
// 供商品编辑页「智能识别原料」与详情页「原料分析」卡片使用。
// 所有功效/人群/场景措辞均来自合规的食材字典，不替代医疗建议。

import { INGREDIENT_DICT, type IngredientEntry } from './shiyang-dictionary'

export const SHIYANG_DISCLAIMER =
  '以上为传统食养文化参考，个体差异较大，不替代专业医疗建议。如身体不适应及时休息，症状持续或加重请及时就医。'

// 商品名称/描述 → 命中的食材 key 列表
// 最长关键词优先，避免短串被长串包含的误匹配（如已命中「红茶」则忽略「茶」）
export function matchIngredientKeys(text: string): string[] {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return []
  const hits: { key: string; len: number }[] = []
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    const zh = e.zh.toLowerCase()
    if (zh && t.includes(zh)) hits.push({ key, len: zh.length })
  }
  if (hits.length === 0) return []
  hits.sort((a, b) => b.len - a.len)
  const result: string[] = []
  for (const h of hits) {
    const covered = result.some(rk => {
      const rzh = INGREDIENT_DICT[rk].zh
      return rzh.length > h.len && rzh.includes(INGREDIENT_DICT[h.key].zh)
    })
    if (!covered) result.push(h.key)
  }
  return result
}

// 食材 key → 完整条目
export function getIngredientEntries(keys: string[] | null | undefined): IngredientEntry[] {
  return (keys || []).map(k => INGREDIENT_DICT[k]).filter(Boolean)
}

// 优先用商家持久化的 ingredients（编辑页勾选、DB 列存在时），
// 否则按商品名称自动匹配（保证迁移 00090 未执行也能展示原料分析）
export function resolveIngredientEntries(
  product: { ingredients?: string[] | null; name?: string },
): IngredientEntry[] {
  const stored = getIngredientEntries(product.ingredients)
  if (stored.length) return stored
  return getIngredientEntries(matchIngredientKeys(product.name || ''))
}
