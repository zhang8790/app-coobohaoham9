// 商品「关怀层」信息抽取（零后端改动，纯读现有字段）
// ------------------------------------------------------------
// 把商品自带的食养/情绪数据，编译成卡片可直接呈现的「关怀信息」：
//   性味(nature) · 食疗标签(healthTags) · 食材(ingredients) ·
//   食养一句话(shiyang) · 适配分档(tier) · 关怀度(careScore) ·
//   宜搭/慎搭(match/conflict)。
// 复用项目既有引擎：resolveNature / classifyProduct / toFoodTherapyInput。
// 这正是「智能分辨配方是否对身体有益」在 UI 上的落点——让每件商品都像在说"我在关心你"。

import type { Product } from '@/db/types'
import { resolveNature } from '@/utils/food-therapy/nature'
import { classifyProduct, toFoodTherapyInput } from '@/utils/food-therapy'
import type { Crowd, FitTier } from '@/utils/food-therapy/types'

export interface ProductCareInfo {
  /** 整体性味：平性/微温/温热/寒凉… */
  nature: string | null
  /** 固定食疗标签（最多取 3） */
  healthTags: string[]
  /** 食材清单 */
  ingredients: string[]
  /** 食养/情绪编译一句话（关怀文案），用于卡片描述位 */
  shiyang: string | null
  /** 适配分档（依用户体质/人群） */
  tier: FitTier | null
  /** 关怀度 0-100：数据丰富度 + 适配度 综合，作为"游戏化"进度条 */
  careScore: number
  /** 宜搭商品数 */
  matchCount: number
  /** 慎搭商品数 */
  conflictCount: number
}

/** 关怀度文案分级（游戏化感知） */
export function careLevel(score: number): { label: string; tone: 'high' | 'mid' | 'low' } {
  if (score >= 75) return { label: '悉心照看', tone: 'high' }
  if (score >= 50) return { label: '温和相宜', tone: 'mid' }
  return { label: '待你品鉴', tone: 'low' }
}

/**
 * 抽取单品关怀信息。
 * @param crowds 用户当前体质/人群（selected + detected），用于个性化适配分档
 */
export function getProductCareInfo(p: Product, crowds: Crowd[] = []): ProductCareInfo {
  const nature = resolveNature(p)
  const healthTags = (p.health_tag ?? []).filter(Boolean).slice(0, 3)
  const ingredients = (p.ingredients ?? []).filter(Boolean)
  const shiyang =
    p.product_emotion?.shiyang_copy ||
    p.product_emotion?.emotion_title ||
    p.description ||
    null

  let tier: FitTier | null = null
  try {
    tier = classifyProduct(toFoodTherapyInput(p), crowds, null)
  } catch {
    tier = null
  }

  // 关怀度：数据越丰富、越适配用户，分数越高（游戏化）
  let score = 30
  if (nature) score += 16
  score += Math.min(healthTags.length, 3) * 10
  score += Math.min(ingredients.length, 4) * 4
  if (shiyang && shiyang.length > 6) score += 16
  if (tier === 'recommend') score += 12
  else if (tier === 'avoid') score -= 6
  score = Math.max(20, Math.min(98, score))

  return {
    nature,
    healthTags,
    ingredients,
    shiyang,
    tier,
    careScore: score,
    matchCount: p.match_goods?.length ?? 0,
    conflictCount: p.conflict_goods?.length ?? 0,
  }
}
