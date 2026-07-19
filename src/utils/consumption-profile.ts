// 消费记录总结推荐引擎
// 思路：回溯用户历史订单 → 聚合「食养功效标签(health_tag) 频次 / 整体性味(overall_nature) 众数」
// 这两个维度都是中性的「口味/食养偏好」信号，不做任何疾病/体质诊断推断（合规安全）。
// 再据此从候选商品池打分，推荐用户没买过但同方向的好物。
// 纯函数、零网络、可解释。

import type { Product } from '@/db/types'
import { HEALTH_TAGS, NATURE_SCALE, type HealthTag, type NatureLevel } from './food-therapy/types'

export interface HealthTagCount {
  tag: HealthTag
  count: number
}

export interface ConsumptionProfile {
  hasData: boolean
  /** 去重后的已购有效商品数 */
  boughtCount: number
  /** 食养功效标签按出现频次降序，最多取 3 个 */
  topHealthTags: HealthTagCount[]
  /** 用户偏好的整体性味（众数），无则 null */
  naturePref: NatureLevel | null
}

/**
 * 从已购商品列表聚合消费画像。
 * 仅统计带 health_tag / overall_nature 的商品；无任何信号时 hasData=false。
 */
export function analyzeConsumption(products: Product[]): ConsumptionProfile {
  const valid = (products || []).filter((p) => p && (p.health_tag?.length || p.overall_nature))
  if (valid.length === 0) {
    return { hasData: false, boughtCount: 0, topHealthTags: [], naturePref: null }
  }

  const tagCount = new Map<string, number>()
  const natureCount = new Map<string, number>()

  for (const p of valid) {
    for (const t of (p.health_tag || [])) {
      if ((HEALTH_TAGS as readonly string[]).includes(t)) {
        tagCount.set(t, (tagCount.get(t) || 0) + 1)
      }
    }
    if (p.overall_nature && (NATURE_SCALE as readonly string[]).includes(p.overall_nature)) {
      natureCount.set(p.overall_nature, (natureCount.get(p.overall_nature) || 0) + 1)
    }
  }

  const topHealthTags: HealthTagCount[] = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => ({ tag: tag as HealthTag, count }))

  let naturePref: NatureLevel | null = null
  let maxN = 0
  for (const [n, c] of natureCount) {
    if (c > maxN) {
      maxN = c
      naturePref = n as NatureLevel
    }
  }

  return {
    hasData: topHealthTags.length > 0,
    boughtCount: valid.length,
    topHealthTags,
    naturePref,
  }
}

/**
 * 基于消费画像从候选池推荐。
 * - 排除已购商品（boughtIds）
 * - 食养功效命中：排名越靠前权重越高（3 - idx）
 * - 性味偏好命中：+1
 * - 无信号或无命中返回 []
 */
export function recommendByConsumption(
  pool: Product[],
  profile: ConsumptionProfile,
  boughtIds: Set<string>,
  limit = 12,
): Product[] {
  if (!profile.hasData || !pool || pool.length === 0) return []

  return pool
    .filter((p) => p && p.id && !boughtIds.has(p.id))
    .map((p) => {
      let score = 0
      profile.topHealthTags.forEach((ht, idx) => {
        if ((p.health_tag || []).includes(ht.tag)) {
          score += profile.topHealthTags.length - idx
        }
      })
      if (profile.naturePref && p.overall_nature === profile.naturePref) score += 1
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.price - a.p.price)
    .slice(0, limit)
    .map((x) => x.p)
}
