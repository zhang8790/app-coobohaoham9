// 原料 / 食养成分分析工具
// ------------------------------------------------------------
// 复用 shiyang-dictionary 的食材字典，将商品名称/描述解析为具体食材，
// 供商品编辑页「智能识别原料」与详情页「原料分析」卡片使用。
// 所有功效/人群/场景措辞均来自食材字典，不替代医疗建议。

import { INGREDIENT_DICT, type IngredientEntry } from './shiyang-dictionary'

export const SHIYANG_DISCLAIMER =
  '以上为传统食养文化参考，个体差异较大，不替代专业医疗建议。如身体不适应及时休息，症状持续或加重请及时就医。'

// 商品名称/描述 → 命中的食材 key 列表
// 双向匹配：① 商品名包含食材全名/别名；② 用户输入的某片段包含候选（支持单字/简称）
// 如「姜茶」命中生姜、「姜」命中生姜、「番茄」命中番茄
function candidateTerms(e: IngredientEntry): string[] {
  return [e.zh, ...(e.aliases || [])].map(s => s.toLowerCase()).filter(Boolean)
}

export function matchIngredientKeys(text: string): string[] {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return []
  // 切词：兼容「姜茶」「冰糖雪梨羹」「番茄,土豆」等写法
  const tokens = t.split(/[\s,，、/()（）\-+]+/).filter(Boolean)
  const hits: { key: string; len: number }[] = []
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    const cands = candidateTerms(e)
    if (!cands.length) continue
    // 正向：商品名包含食材全名/别名
    const forward = cands.some(c => t.includes(c))
    // 反向：用户输入片段包含候选（如「姜」包含「姜」）。用 tok.includes(c)
    // 天然避免「红」误命中「红枣」（「红」不包含「红枣」）
    const backward = tokens.some(tok => cands.some(c => tok.includes(c)))
    if (forward || backward) hits.push({ key, len: Math.max(...cands.map(c => c.length)) })
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

// 原料名搜索：编辑页「输入原料名快速添加」入口，按名称/别名模糊匹配
export function searchIngredients(query: string, limit = 30): string[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const result: string[] = []
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    if (candidateTerms(e).some(c => c.includes(q) || q.includes(c))) result.push(key)
  }
  return result.slice(0, limit)
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
