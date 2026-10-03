// 食养商品匹配（维度 ↔ 体质 串联核心）
// ----------------------------------------------------------------------------
// 把问卷/望舌辨证出的体质（主 + 兼）与商品「维度」做匹配，串联到商品：
//   · 性味（overall_nature）↔ 体质 recommendNature / avoidNature（宜 / 慎）
//   · 适配人群（fit_crowd_tags）↔ 体质 bodyStates（如「体虚怕冷」）
//   · 功效标签（health_tag）↔ 体质 healthGoals（如「滋阴润燥」）
// 与「食养分析报告」「食养画像」同源：都来自同一份 8 维 answers 经 v2 引擎辨证，
// 保证「为什么推荐」可回放、可解释，界面零「AI」、零诊断词。
import type { Product } from '@/db/types'
import type { ConstitutionType } from '@/utils/constitution-test'
import type { TongueResult } from '@/utils/food-therapy/tongue-rules'

/** 一件「按体质匹配」后的商品 + 串联理由（解释 维度/体质 → 商品 的链路） */
export interface MatchedProduct {
  p: Product
  reasons: string[]
}

export function buildProductMatch(
  products: Product[],
  analysis: TongueResult,
): { good: MatchedProduct[]; caution: MatchedProduct[] } {
  const cons = [analysis.primary, analysis.secondary].filter(Boolean) as ConstitutionType[]
  const avoidNatures = new Set(cons.flatMap((c) => c.avoidNature))
  const recNatures = new Set(cons.flatMap((c) => c.recommendNature))
  const bodyStates = new Set(cons.flatMap((c) => c.bodyStates))
  const goals = new Set(cons.flatMap((c) => c.healthGoals))

  const good: MatchedProduct[] = []
  const caution: MatchedProduct[] = []
  for (const p of products) {
    const nature = p.overall_nature || '平性'
    const crowd = p.fit_crowd_tags || []
    const tags = p.health_tag || []
    const reasons: string[] = []

    // 慎：性味与体质偏冲
    if (avoidNatures.has(nature)) {
      caution.push({ p, reasons: [`性味偏「${nature}」，与你的倾向偏冲，建议少量或偶尔`] })
      continue
    }

    let matched = false
    if (recNatures.has(nature)) {
      matched = true
      reasons.push(`性味偏「${nature}」，契合你的${analysis.primary.name}`)
    } else if (nature === '平性') {
      matched = true
    }
    const crowdHit = crowd.filter((c) => bodyStates.has(c))
    if (crowdHit.length) {
      matched = true
      reasons.push(`适合「${crowdHit.slice(0, 2).join('、')}」，正合你状态`)
    }
    const goalHit = tags.filter((t) => goals.has(t))
    if (goalHit.length) {
      matched = true
      reasons.push(`含「${goalHit.slice(0, 2).join('、')}」，对应你的食养目标`)
    }

    if (matched) {
      if (reasons.length === 0) reasons.push('性味平和，适合多数体质日常佐餐')
      good.push({ p, reasons })
    }
  }
  return { good, caution }
}
