// 双维度单品适配打分 + 双价值聚合
// 食疗维度（上下文相关，安全导向）+ 情绪维度（内在价值），
// 汇总为可呈现的 ProductFit（含文案 summary）。

import type { FitRule, FitTier, FoodTherapyInput, HealthTag, NatureLevel } from './types'
import { TIER_LABEL } from './types'
import { resolveNature } from './nature'

export interface FoodTherapyScore {
  score: number // 0-100
  tier: FitTier
  matchedTags: HealthTag[]
  plus: string[] // 加分原因
  minus: string[] // 减分原因
}

export interface EmotionScore {
  score: number
  tier: FitTier
}

export interface ProductFit {
  productId: string
  name: string
  foodTherapy: FoodTherapyScore
  emotion: EmotionScore
  nature: NatureLevel | null
  summary: string // 双价值聚合文案
}

function tierOf(score: number): FitTier {
  if (score >= 85) return 'recommend'
  if (score >= 30) return 'caution'
  return 'avoid'
}

// 食疗维度打分（方案规则：标签命中 +15/项，性味符合 +20，命中禁止 -40/条）
// 中性基准 50，使普通商品落「少量慎点」，相关升、冲突降。
// weights：用户个性化权重（来自反馈回流），每项标签额外 ±(限幅内)，让常买/常赞的标签更受推荐。
export function scoreFoodTherapy(input: FoodTherapyInput, rule: FitRule, weights?: Record<string, number> | null): FoodTherapyScore {
  let score = 50
  const plus: string[] = []
  const minus: string[] = []
  const tags = input.health_tag ?? []
  const prio = rule.priorityHealthTags as string[]
  const banT = rule.banHealthTags as string[]

  const matched = tags.filter((t) => prio.includes(t))
  if (matched.length) {
    const detail: string[] = []
    let bonus = 0
    for (const t of matched) {
      const w = weights?.[t] ?? 0
      // 个性化权重限幅 [-10, +20]，避免单一偏好单边失衡
      const add = 15 + Math.max(-10, Math.min(20, w))
      bonus += add
      detail.push(w !== 0 ? `${t}+${add}(偏好${w > 0 ? '+' : ''}${w})` : `${t}+${add}`)
    }
    score += bonus
    plus.push(`食疗标签契合「${detail.join('、')}」`)
  }

  const nature = resolveNature(input)
  let natureOk = true
  if (nature && rule.banNatures.length) {
    if ((rule.banNatures as string[]).includes(nature)) {
      natureOk = false
      score -= 40
      minus.push(`性味「${nature}」属禁忌 -40`)
    }
  }
  if (natureOk && nature) {
    score += 20
    plus.push(`性味「${nature}」符合体质 +20`)
  }

  const banHits = tags.filter((t) => banT.includes(t))
  if (banHits.length) {
    score -= banHits.length * 40
    minus.push(`含禁忌食疗标签「${banHits.join('、')}」-${banHits.length * 40}`)
  }

  score = Math.max(0, Math.min(100, score))
  return { score, tier: tierOf(score), matchedTags: matched, plus, minus }
}

// 情绪维度打分（内在价值：情绪标签越丰富，情绪治愈感越强）
export function scoreEmotion(input: FoodTherapyInput): EmotionScore {
  const tags = input.emotion_tag ?? []
  let score = 40
  score += Math.min(tags.length, 5) * 8 // 最多 +40
  score = Math.max(0, Math.min(100, score))
  return { score, tier: tierOf(score) }
}

// 双价值聚合：综合食疗适配 + 情绪价值，生成一句话 summary
export function buildProductFit(input: FoodTherapyInput, rule: FitRule, weights?: Record<string, number> | null): ProductFit {
  const ft = scoreFoodTherapy(input, rule, weights)
  const em = scoreEmotion(input)
  const nature = resolveNature(input)

  const summaryParts: string[] = [
    `【食疗适配 ${ft.score}分·${TIER_LABEL[ft.tier]}】`,
    ft.plus.length ? ft.plus.join('；') : '常规餐品，按口味适量即可',
  ]
  if (ft.minus.length) summaryParts.push(ft.minus.join('；'))
  summaryParts.push(
    `【情绪价值 ${em.score}分】${
      em.tier === 'recommend' ? '情绪治愈感强' : em.tier === 'caution' ? '有情绪陪伴感' : '情绪标签待丰富'
    }`,
  )
  if (nature) summaryParts.push(`整体性味：${nature}`)
  summaryParts.push(rule.remindText)

  return {
    productId: input.id,
    name: input.name,
    foodTherapy: ft,
    emotion: em,
    nature,
    summary: summaryParts.join('。'),
  }
}

// 将一批商品按适配分档分组（首页三栏）
export function groupByTier(fits: ProductFit[]): {
  recommend: ProductFit[]
  caution: ProductFit[]
  avoid: ProductFit[]
} {
  const out = { recommend: [] as ProductFit[], caution: [] as ProductFit[], avoid: [] as ProductFit[] }
  for (const f of fits) {
    if (f.foodTherapy.tier === 'recommend') out.recommend.push(f)
    else if (f.foodTherapy.tier === 'caution') out.caution.push(f)
    else out.avoid.push(f)
  }
  // 同档内按食疗分降序
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    out[k].sort((a, b) => b.foodTherapy.score - a.foodTherapy.score)
  }
  return out
}
