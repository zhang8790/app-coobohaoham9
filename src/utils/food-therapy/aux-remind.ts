// 辅料自适应优化（方案「核心引擎④」）
// 结合体质/场景规则，给出加料/减料建议；商家已配 aux_remind 时优先采用。

import type { FitRule, FoodTherapyInput } from './types'
import { resolveNature } from './nature'

export function buildAuxRemind(input: FoodTherapyInput, rule?: FitRule | null): string {
  // 商家已配文案优先
  if (input.aux_remind && input.aux_remind.trim()) return input.aux_remind.trim()

  const parts: string[] = []
  const nature = resolveNature(input)

  if (rule) {
    const ban = rule.banNatures as string[]
    if (ban.includes('寒凉') || ban.includes('大寒')) {
      parts.push('体质偏寒/经期建议加姜丝、红枣温中')
    }
    if (ban.includes('温热') || ban.includes('大热')) {
      parts.push('易上火/咽喉不适建议去辣减油，可配梨汤、绿豆')
    }
  } else if (nature) {
    if (nature === '大寒' || nature === '寒凉') parts.push('偏寒凉，可加姜、红枣平衡')
    if (nature === '温热' || nature === '大热') parts.push('偏温热，建议搭配凉润食材如梨、冬瓜')
  }

  return parts.length ? parts.join('；') : '可按口味自由搭配辅料，适量为佳'
}
