// 纯函数分类器：根据「用户勾选的身体人群 + 当前场景」把菜品分入三栏
// 对应 spec 前端入口1：筛选 → 【五星推荐】【谨慎食用】【不建议点】
// 设计原则：纯被动匹配，不依赖 LLM / NLU / 用户反馈权重，规则确定可解释。

import type { Crowd, FitTier, FoodTherapyInput, Scene } from './types'

function overlap(a?: string[] | null, b?: string[] | null): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false
  const set = new Set(a)
  return b.some(x => set.has(x))
}

// 单品分类：返回三档之一；若未勾选任何人群或无命中则返回 null（不进任何栏）
export function classifyProduct(
  p: FoodTherapyInput,
  selectedCrowds: Crowd[],
  selectedScene: Scene | null,
): FitTier | null {
  if (!selectedCrowds || selectedCrowds.length === 0) return null

  const forbidden = overlap(p.forbidden_crowds, selectedCrowds)
  const cautious = overlap(p.cautious_crowds, selectedCrowds)
  const rec = overlap(p.rec_crowds, selectedCrowds)

  // 场景命中：勾选了场景时，推荐档需场景匹配；未勾选场景则只看人群
  let sceneOk = true
  if (selectedScene) {
    sceneOk = !p.scenes || p.scenes.length === 0 || p.scenes.includes(selectedScene)
  }

  // 优先级：不建议点 > 谨慎食用 > 五星推荐
  if (forbidden) return 'avoid'
  if (cautious) return 'caution'
  if (rec && sceneOk) return 'recommend'
  return null
}

export interface TierResult {
  recommend: FoodTherapyInput[]
  caution: FoodTherapyInput[]
  avoid: FoodTherapyInput[]
}

// 批量分类：把商品列表按三栏分组（仅含命中的）
export function classifyProducts(
  products: FoodTherapyInput[],
  selectedCrowds: Crowd[],
  selectedScene: Scene | null,
): TierResult {
  const res: TierResult = { recommend: [], caution: [], avoid: [] }
  for (const p of products) {
    const tier = classifyProduct(p, selectedCrowds, selectedScene)
    if (tier === 'recommend') res.recommend.push(p)
    else if (tier === 'caution') res.caution.push(p)
    else if (tier === 'avoid') res.avoid.push(p)
  }
  return res
}
