// 食疗咨询 · 桥接推荐引擎（自动推荐核心）
// ------------------------------------------------------------
// 把「用户的自由问话 + 用户画像（体质 / 已购商品的六维画像 / 消费偏好）+
// 节气时令」融合，给候选商品池逐件打分，输出带六维明细与理由的排序推荐。
//
// 六维（与 radar-profile 严格对齐）：
//   1) 温性偏好  2) 凉性偏好  3) 食养功效偏好  4) 性味完整度
//   5) 时令契合度 6) 搭配丰富度
// 每维对用户「既看重已成的偏好(连续性) 又补足空缺的维度(新颖性)」做平衡 ——
// 这就是「自动优化」：越买越贴合口味，同时自然补齐未探索的性味/品类。
//
// 纯函数 + 异步 NLU（规则兜底，零外部依赖）。可解释、可审计。

import type { Product, Profile } from '@/db/types'
import { buildRadarProfile, type RadarProfile } from './radar-profile'
import { analyzeConsumption, type ConsumptionProfile } from './consumption-profile'
import { resolveConstitution } from '../today-food-therapy'
import { type ConstitutionType } from '@/utils/constitution-test'
import { getCurrentTerm, getTermNatureTags, type SeasonalTerm } from '../seasonal-box'
import { nluParseSymptoms, type NluResult } from './llm'

// 商品整体性味 6 档（与 NATURE_SCALE 一致）：大寒/寒凉/平性/微温/温热/大热
const WARM = new Set(['微温', '温热', '大热'])
const COOL = new Set(['大寒', '寒凉'])

export interface SixDimScore {
  key: string
  label: string
  /** 该商品对「此用户」在该轴上的契合度 0~1 */
  value: number
}

export interface ConsultRecommendation {
  product: Product
  /** 六维逐轴契合明细（用于前端可视化） */
  sixDim: SixDimScore[]
  /** 体质契合 -1..1（fit / avoid / neutral） */
  constitutionFit: number
  /** 问询信号契合 0..1（NLU 解析出的诉求） */
  queryFit: number
  /** 综合适配分 0~100 */
  total: number
  tier: 'recommend' | 'caution' | 'avoid'
  /** 人话理由（中文，已合规） */
  reasons: string[]
  nature: string
  healthTags: string[]
}

export interface ConsultContext {
  products: Product[]
  boughtProducts: Product[]
  radar: RadarProfile
  consumption: ConsumptionProfile
  constitution: ConstitutionType | null
  profile: Profile | null
  term: SeasonalTerm | null
  nlu: NluResult | null
  queryText: string
  /** 来自本地查询历史的自适应加权标签（自动优化） */
  boostTags?: string[]
}

export interface ConsultResult {
  recommendations: ConsultRecommendation[]
  radar: RadarProfile
  consumption: ConsumptionProfile
  constitution: ConstitutionType | null
  nlu: any
  summary: string
}

function clamp01(v: number): number {
  if (!isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// 连续性维度：商品命中所求 → 用户越看重越高；未命中 → 用户越看重越扣分
function dimValue(userDim: number, isMatch: boolean): number {
  return isMatch ? 0.55 + 0.45 * clamp01(userDim) : 0.4 - 0.25 * clamp01(userDim)
}
// 新颖性维度：商品补足用户空缺维度 → 用户越缺越加分（自动优化：补齐六维短板）
function dimValueNovel(userDim: number, isNovel: boolean): number {
  return isNovel ? (userDim < 0.7 ? 0.9 : 0.6) : userDim > 0.3 ? 0.72 : 0.5
}

function buildConsultRecommendation(p: Product, ctx: ConsultContext): ConsultRecommendation {
  const nature = p.overall_nature || '平性'
  const tags = (p.health_tag || []).filter(Boolean)
  const R = Object.fromEntries(ctx.radar.dims.map((d) => [d.key, d.value])) as Record<string, number>

  const userNatureSet = ctx.boughtProducts.map((b) => b.overall_nature).filter(Boolean) as string[]
  const userCatSet = ctx.boughtProducts.map((b) => (b as any).food_category).filter(Boolean) as string[]
  const goodNatures = ctx.term ? new Set(getTermNatureTags(ctx.term)) : null

  const isWarm = WARM.has(nature)
  const isCool = COOL.has(nature)
  const isNovelNature = !userNatureSet.includes(nature)
  const isNovelCat = !userCatSet.includes((p as any).food_category)

  const unionTags = new Set<string>([
    ...ctx.consumption.topHealthTags.map((t) => t.tag),
    ...(ctx.nlu?.health_tags || []),
    ...(ctx.boostTags || []),
  ])
  const effHits = tags.filter((t) => unionTags.has(t))

  const sixDim: SixDimScore[] = [
    { key: 'warm', label: '温性偏好', value: clamp01(dimValue(R.warm ?? 0, isWarm)) },
    { key: 'cool', label: '凉性偏好', value: clamp01(dimValue(R.cool ?? 0, isCool)) },
    {
      key: 'efficacy',
      label: '食养功效偏好',
      value: unionTags.size
        ? clamp01(0.4 + 0.6 * Math.min(1, effHits.length / Math.max(1, Math.min(2, unionTags.size))))
        : 0.4,
    },
    { key: 'completeness', label: '性味完整度', value: clamp01(dimValueNovel(R.completeness ?? 0, isNovelNature)) },
    { key: 'seasonal', label: '时令契合度', value: clamp01(dimValue(R.seasonal ?? 0, !!goodNatures?.has(nature))) },
    { key: 'pairing', label: '搭配丰富度', value: clamp01(dimValueNovel(R.pairing ?? 0, isNovelCat)) },
  ]

  // 体质契合
  const constitutionFit = ctx.constitution
    ? ctx.constitution.avoidNature.includes(nature)
      ? -1
      : ctx.constitution.recommendNature.includes(nature)
        ? 1
        : 0
    : 0

  // 问询信号契合（NLU 解析）
  let queryFit = 0
  if (ctx.nlu) {
    const nluHits = tags.filter((t) => (ctx.nlu!.health_tags || []).includes(t)).length
    if (nluHits > 0) queryFit = clamp01(0.5 + 0.25 * nluHits)
    else if (ctx.nlu.nature_hint) {
      const hint = ctx.nlu.nature_hint
      if ((hint.includes('寒') || hint.includes('凉')) && (isCool || nature === '平性')) queryFit = 0.7
      else if ((hint.includes('热') || hint.includes('温')) && (isWarm || nature === '平性')) queryFit = 0.7
    }
  }

  const sixAvg = sixDim.reduce((s, d) => s + d.value, 0) / sixDim.length
  let total = 50 + sixAvg * 28 + constitutionFit * 16 + queryFit * 14
  total = clamp(Math.round(total), 0, 100)
  const tier: ConsultRecommendation['tier'] = total >= 72 ? 'recommend' : total >= 40 ? 'caution' : 'avoid'

  // 理由（中文，合规）
  const reasons: string[] = []
  if (isWarm && (R.warm ?? 0) > 0.3) reasons.push('温性食材，契合你偏温的口味')
  if (isCool && (R.cool ?? 0) > 0.3) reasons.push('凉性食材，契合你偏凉的口味')
  if (effHits.length > 0) reasons.push(`食养功效「${effHits.slice(0, 2).join('、')}」正合你诉求`)
  if (isNovelNature && (R.completeness ?? 0) < 0.7) reasons.push(`补充你少尝的${nature}性味，丰富维度`)
  if (goodNatures?.has(nature)) reasons.push(`应「${ctx.term!.name}」时令`)
  if (isNovelCat && (R.pairing ?? 0) < 0.7) reasons.push('新品类，丰富你的搭配')
  if (ctx.constitution) {
    if (constitutionFit === 1) reasons.push(`适合你的${ctx.constitution.name}`)
    else if (constitutionFit === -1) reasons.push(`与你的${ctx.constitution.name}偏冲，建议少点`)
  }
  if (queryFit > 0.6 && ctx.nlu?.health_tags?.length)
    reasons.push(`针对你提到的状态，含「${ctx.nlu.health_tags.slice(0, 2).join('、')}」`)
  if (reasons.length === 0) reasons.push('综合你的画像，日常佐餐可选')

  return {
    product: p,
    sixDim,
    constitutionFit,
    queryFit,
    total,
    tier,
    reasons,
    nature,
    healthTags: tags,
  }
}

export interface RecommendForConsultInput {
  products: Product[]
  boughtProducts?: Product[]
  profile?: Profile | null
  queryText?: string
  boostTags?: string[]
  term?: SeasonalTerm | null
  limit?: number
}

/**
 * 端到端食疗咨询推荐。
 * - 自动构建用户六维画像（来自已购商品）+ 消费偏好 + 体质
 * - 若 queryText 非空，调用 NLU 解析诉求（规则兜底，零外部依赖）
 * - 逐件打分排序，输出 Top-N（带六维明细与理由）
 */
export async function recommendForConsult(input: RecommendForConsultInput): Promise<ConsultResult> {
  const term = input.term ?? getCurrentTerm()
  const bought = input.boughtProducts || []
  const radar = buildRadarProfile(bought, term)
  const consumption = analyzeConsumption(bought)
  const constitution = resolveConstitution(input.profile ?? null)

  let nlu: NluResult | null = null
  if (input.queryText && input.queryText.trim()) {
    nlu = await nluParseSymptoms(input.queryText)
  }

  const ctx: ConsultContext = {
    products: input.products,
    boughtProducts: bought,
    radar,
    consumption,
    constitution,
    profile: input.profile ?? null,
    term,
    nlu,
    queryText: input.queryText || '',
    boostTags: input.boostTags,
  }

  const recs = input.products
    .filter((p) => p && p.id)
    .map((p) => buildConsultRecommendation(p, ctx))
    .sort((a, b) => b.total - a.total)

  // 优先展示综合分≥42 的优选项；若全低（画像/池子极不匹配）则兜底取最高 4 件，保证有结果
  const picked = recs.filter((r) => r.total >= 42).slice(0, input.limit ?? 8)
  const finalRecs = picked.length ? picked : recs.slice(0, Math.min(4, recs.length))

  return {
    recommendations: finalRecs,
    radar,
    consumption,
    constitution,
    nlu,
    summary: buildSummary(finalRecs, ctx),
  }
}

function buildSummary(recs: ConsultRecommendation[], ctx: ConsultContext): string {
  if (!recs.length) return '当前门店暂无可推荐商品，换个门店或换个诉求再试试～'
  const top = recs[0]
  const parts: string[] = []
  if (ctx.constitution) parts.push(`结合你的${ctx.constitution.name}`)
  else if (ctx.radar.hasData) parts.push('结合你的食养画像')
  else parts.push('结合当季食养')
  parts.push(`为你优选 ${recs.length} 款`)
  if (ctx.term) parts.push(`（${ctx.term.name}时令）`)
  parts.push(`，首选「${top.product.name}」适配度 ${top.total} 分`)
  return parts.join('')
}

// 复用：体质展示名（供 UI 直接拿，避免重复 import）
export function constitutionDisplayName(c: ConstitutionType | null): string {
  return c ? c.name : ''
}
