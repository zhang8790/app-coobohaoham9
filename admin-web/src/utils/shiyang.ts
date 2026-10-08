// 食养成分数据字典（单一权威源：来自 @food-engine/dictionary，与小程序端 / 网页后台共用，消除 C2 漂移）
// 商家后台情绪工作台用于「食养成分打标」，与小程序端共用 product_emotion.shiyang_tags/shiyang_copy 同一 DB 列。
// 所有功效表述均为传统食养文化参考，不替代医疗建议。

import { INGREDIENT_DICT, SHIYANG_DISCLAIMER } from '@food-engine/dictionary'
import type { IngredientEntry, ShiyangTag } from '@food-engine/dictionary'
export { INGREDIENT_DICT, SHIYANG_DISCLAIMER }
export type { IngredientEntry, ShiyangTag }

// 与小程序端保持一致的维度常量（共用 DB 列形状）
export const SHIYANG_DIMENSION_KEY = 'shiyang' as const

// 编译 UI 标签（按性味分组，供商家在打标页选用）
export const SHIYANG_CATEGORIES: Record<string, { label: string; tags: ShiyangTag[] }> = {
  warm: {
    label: '温性·暖身',
    tags: ['jiang', 'hongzao', 'guiyuan', 'hetao', 'nangua', 'chenpi', 'xingren', 'shanzha', 'jirou', 'zhurou', 'xia', 'paigu', 'yangrou'].map(k => {
      const e = INGREDIENT_DICT[k]
      return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
  cool: {
    label: '凉寒·清热',
    tags: ['li', 'jinyinhua', 'lvdou', 'kugua', 'bailuobo', 'xiangjiao', 'bocai', 'ningmeng', 'mihoutao', 'zhizi', 'yinmi', 'fanqie', 'huanggua', 'donggua', 'lianou', 'haidai', 'doufu', 'baicai', 'qiezi'].map(k => {
      const e = INGREDIENT_DICT[k]
      return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
  neutral: {
    label: '平性·滋养',
    tags: ['fengmi', 'yiner', 'baihe', 'lianzi', 'shanyao', 'gouqi', 'heizhima', 'xiaomi', 'pingguo', 'huluobo', 'niunai', 'jidan', 'niurou', 'jiyu', 'bingtang', 'papaya', 'tudou', 'dami', 'miantiao', 'muer', 'xianggu'].map(k => {
      const e = INGREDIENT_DICT[k]
      return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
}

// 文案生成
export interface ShiyangCopyInput {
  ingredients: string[] // ingredient 中文名
  scene?: string
}

export interface ShiyangCopyOutput {
  cardTitle: string
  cardDetail: string
  disclaimer: string
}

// 中文名/别名 → 字典条目（支持别名反查，如「姜」也能定位到生姜条目）
const ALL_TERMS: Record<string, IngredientEntry> = (() => {
  const m: Record<string, IngredientEntry> = {}
  for (const e of Object.values(INGREDIENT_DICT)) {
    m[e.zh] = e
    for (const a of e.aliases || []) m[a] = e
  }
  return m
})()

export function generateShiyangCopy(input: ShiyangCopyInput): ShiyangCopyOutput {
  const entries = input.ingredients.map(zh => ALL_TERMS[zh]).filter(Boolean) as IngredientEntry[]

  if (entries.length === 0) {
    return { cardTitle: '无食养信息', cardDetail: '', disclaimer: SHIYANG_DISCLAIMER }
  }

  const names = entries.map(e => e.zh)
  const allBenefits = Array.from(new Set(entries.flatMap(e => e.benefits)))
  const allAudiences = Array.from(new Set(entries.flatMap(e => e.audiences)))

  const natureStr = entries.map(e => `${e.zh}（${e.nature}）`).join('、')
  const title = names.join('+')

  const subTitle = input.scene
    ? `${input.scene}时`
    : allAudiences.length
      ? `适合${allAudiences.slice(0, 3).join('、')}的日常搭配`
      : '传统食养搭配'

  const detail = `${natureStr}\n传统食养参考：${allBenefits.slice(0, 4).join('、')}。${subTitle}。`

  return {
    cardTitle: title,
    cardDetail: detail,
    disclaimer: SHIYANG_DISCLAIMER,
  }
}

// 收集某食材的全部匹配候选（全名 + 别名，小写）
function candidateTerms(e: IngredientEntry): string[] {
  return [e.zh, ...(e.aliases || [])].map(s => s.toLowerCase()).filter(Boolean)
}

// 按商品名匹配食材 key（双向：① 商品名包含食材全名/别名；② 输入片段包含候选，支持单字/简称）
export function matchIngredientKeys(name: string): string[] {
  if (!name) return []
  const t = name.toLowerCase()
  const tokens = t.split(/[\s,，、/()（）\-+]+/).filter(Boolean)
  const hits: { key: string; len: number }[] = []
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    const cands = candidateTerms(e)
    if (!cands.length) continue
    const forward = cands.some(c => t.includes(c))
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

// 通过食材 key 数组取字典条目（供编辑页勾选 / 详情页渲染）
export function getIngredientEntries(keys: string[]): IngredientEntry[] {
  return (keys ?? []).map(k => INGREDIENT_DICT[k]).filter(Boolean) as IngredientEntry[]
}

// 解析商品原料条目：优先持久化 ingredients，否则按名称临时匹配
// 与小程序端 src/utils/ingredient-analysis.ts resolveIngredientEntries 语义保持一致
// 兼容两种历史形状：结构化 IngredientItem[]（取 id 作 key）与 string[]
export function resolveIngredientEntries(product: { ingredients?: any[] | null; name?: string }): IngredientEntry[] {
  const persisted = product.ingredients && product.ingredients.length > 0
    ? product.ingredients
        .map((x: any) => (typeof x === 'string' ? x : (x && (x.id || x.name)) || null))
        .filter((x): x is string => !!x)
    : null
  const keys = persisted ?? matchIngredientKeys(product.name || '')
  return getIngredientEntries(keys)
}
