// 消费偏好雷达图数据引擎
// 输入：用户已购商品列表（带 overall_nature / health_tag / food_category）+ 当前节气
// 输出：六边形六维（0~1），全部从现有数据算出，零新增后端字段。
//
// 六维：
//   1) 温性偏好  = 温/微温/温热/大热 占比
//   2) 凉性偏好  = 大寒/寒凉 占比
//   3) 食养功效偏好 = 去重 health_tag 覆盖度 / 9
//   4) 性味完整度 = 出现的 NatureLevel 种类 / 6
//   5) 时令契合度 = 性味命中当前节气推荐性味 占比
//   6) 搭配丰富度 = 去重 food_category 种类 / 4
//
// 纯函数、零网络、可解释。越买东西维度越饱满 → 驱动复购。
//
// 兜底策略（2026-08-06）：线上 46 个商品的 overall_nature/health_tag/food_category
// 大多为空（未录入），若仍要求"必须有食养字段"则雷达永远空。改为：只要买过
// （有 id）即计入；缺失字段时用「商品名关键词」做保守估算，并在 summary 标注
// "据商品名估算"，绝不伪造真实食养标注。商家回填真实字段后画像自然变精准。

import type { Product } from '@/db/types'
import { HEALTH_TAGS, NATURE_SCALE, FOOD_CATEGORIES } from './types'
import { getTermNatureTags, type SeasonalTerm } from '../seasonal-box'

const WARM = new Set(['微温', '温热', '大热'])
const COOL = new Set(['大寒', '寒凉'])

// ---- 兜底推断：商品未录入食养字段时，按商品名给一个保守估计 ----
const HOT_NAME_HINTS = ['辣', '椒', '姜', '羊', '牛', '桂', '花椒', '麻', '火锅', '烧烤', '孜然', '蒜', '葱']
const COLD_NAME_HINTS = ['凉', '冰', '西瓜', '梨', '绿豆', '菊', '薄荷', '苦', '黄瓜', '番茄', '荸荠', '莲藕']
function guessNature(name = ''): string {
  if (HOT_NAME_HINTS.some((k) => name.includes(k))) return '温热'
  if (COLD_NAME_HINTS.some((k) => name.includes(k))) return '寒凉'
  return '平性'
}

function guessTags(name = ''): string[] {
  const tags: string[] = []
  const has = (...ks: string[]) => ks.some((k) => name.includes(k))
  if (has('润', '梨', '喉')) tags.push('润养舒喉')
  if (has('燥', '阴')) tags.push('滋阴润燥')
  if (has('安', '眠', '舒')) tags.push('舒缓安适')
  if (has('补', '气', '血')) tags.push('补气养血')
  if (has('脾', '胃', '健')) tags.push('健脾养胃')
  if (has('消', '积', '化')) tags.push('消食化积')
  if (has('火', '热', '炎', '清')) tags.push('清热降火')
  if (has('水', '肿', '利')) tags.push('利水消肿')
  if (has('寒', '暖', '中')) tags.push('温中散寒')
  // 仅保留在固定标签库内的，避免臆造
  return tags.filter((t) => (HEALTH_TAGS as readonly string[]).includes(t))
}

function guessCategory(name = ''): string {
  if (['面', '粉'].some((k) => name.includes(k))) return '粉面'
  if (['汤', '炖', '煲'].some((k) => name.includes(k))) return '炖汤'
  if (['饮', '茶', '奶', '咖啡', '水'].some((k) => name.includes(k))) return '热饮'
  if (['菜', '卤', '拌'].some((k) => name.includes(k))) return '小菜'
  return ''
}

export interface RadarDim {
  key: string
  label: string
  /** 0~1 */
  value: number
}

export interface RadarProfile {
  hasData: boolean
  boughtCount: number
  dims: RadarDim[]
  /** 一句话画像总结 */
  summary: string
  /** 是否为"据商品名估算"（真实食养字段缺失时的兜底，非真实标注） */
  estimated: boolean
}

const DIM_LABELS: Record<string, string> = {
  warm: '温性偏好',
  cool: '凉性偏好',
  efficacy: '食养功效偏好',
  completeness: '性味完整度',
  seasonal: '时令契合度',
  pairing: '搭配丰富度',
}

function clamp01(v: number): number {
  if (!isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

export function buildRadarProfile(products: Product[], term: SeasonalTerm | null): RadarProfile {
  const valid = (products || []).filter((p) => p && p.id)
  const total = valid.length
  if (total === 0) {
    return {
      hasData: false,
      boughtCount: 0,
      dims: Object.keys(DIM_LABELS).map((k) => ({ key: k, label: DIM_LABELS[k], value: 0 })),
      summary: '还没有购物记录，买点喜欢的，食养画像就圆满了',
      estimated: false,
    }
  }

  let warm = 0
  let cool = 0
  const tagSet = new Set<string>()
  const natureSet = new Set<string>()
  const catSet = new Set<string>()
  // 真实录入了食养字段的商品数（用于判断是否纯估算）
  let realFieldCount = 0

  for (const p of valid) {
    const on: string | null | undefined = p.overall_nature
    const hasRealNature = !!(on && (NATURE_SCALE as readonly string[]).includes(on))
    const realTags = (p.health_tag || []).filter((t) => (HEALTH_TAGS as readonly string[]).includes(t))
    const hasRealTag = realTags.length > 0
    const realCat = (p as any).food_category
    if (hasRealNature || hasRealTag || realCat) realFieldCount++

    const n = hasRealNature ? on! : guessNature(p.name || '')
    const tags = hasRealTag ? realTags : guessTags(p.name || '')
    const cat = realCat || guessCategory(p.name || '')

    if (WARM.has(n)) warm++
    else if (COOL.has(n)) cool++
    for (const t of tags) tagSet.add(t)
    if (n && (NATURE_SCALE as readonly string[]).includes(n)) natureSet.add(n)
    if (cat) catSet.add(cat)
  }

  // 时令契合：当前节气推荐性味
  const goodNatures = term ? new Set(getTermNatureTags(term)) : null
  let seasonalHit = 0
  if (goodNatures) {
    for (const p of valid) {
      const on: string | null | undefined = p.overall_nature
      const n = on && (NATURE_SCALE as readonly string[]).includes(on) ? on : guessNature(p.name || '')
      if (goodNatures.has(n)) seasonalHit++
    }
  }

  const dims: RadarDim[] = [
    { key: 'warm', label: DIM_LABELS.warm, value: clamp01(warm / total) },
    { key: 'cool', label: DIM_LABELS.cool, value: clamp01(cool / total) },
    { key: 'efficacy', label: DIM_LABELS.efficacy, value: clamp01(tagSet.size / HEALTH_TAGS.length) },
    { key: 'completeness', label: DIM_LABELS.completeness, value: clamp01(natureSet.size / NATURE_SCALE.length) },
    { key: 'seasonal', label: DIM_LABELS.seasonal, value: goodNatures ? clamp01(seasonalHit / total) : 0.5 },
    { key: 'pairing', label: DIM_LABELS.pairing, value: clamp01(catSet.size / FOOD_CATEGORIES.length) },
  ]

  const estimated = realFieldCount === 0

  // 一句话总结
  const warmRate = warm / total
  const coolRate = cool / total
  const natureWord = warmRate > coolRate + 0.15 ? '温性' : coolRate > warmRate + 0.15 ? '凉性' : '平和'
  let summary = `你偏爱${natureWord}饮食，已尝过 ${tagSet.size} 类食养功效、${natureSet.size} 种性味；${goodNatures ? `当前「${term!.name}」时令契合度 ${Math.round((seasonalHit / total) * 100)}%` : ''}`
  if (estimated) summary += '（食养信息待完善，画像据商品名估算）'

  return { hasData: true, boughtCount: total, dims, summary, estimated }
}
