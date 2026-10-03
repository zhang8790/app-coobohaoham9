// ============================================================
// 舌象案例库 · 数据层（小程序端，不走云系统）
// ------------------------------------------------------------
// 运行时直接读本地内置包 tongue-cases-local.ts（同源引擎派生、离线可用、零跨境请求）。
// 提供：按体质 / 分级 / 特征 / 关键词检索、8 维相似度比对、案例佐证摘要。
// 合规：案例库只收去标识聚合数据；入库守门见 tongue-compliance.validateTongueCaseText。
// 云端 tongue_cases 表 + 后台检索页保留为「受控维护源」，但小程序运行时已不依赖云。
// ============================================================
import { LOCAL_TONGUE_CASES } from '@/utils/food-therapy/tongue-cases-local'
import { validateTongueCaseText } from '@/utils/food-therapy/tongue-compliance'

export type TongueBand = 'low' | 'mid' | 'high'

/** 8 维望舌维度 id（与 TONGUE_QUESTIONS 对应），供「特征筛选」 */
export const TONGUE_DIM_IDS = [
  'area',
  'color',
  'coat_color',
  'coat_texture',
  'teeth',
  'crack',
  'moist',
  'sublingual',
] as const
export type TongueDimId = (typeof TONGUE_DIM_IDS)[number]

/** 维度 id → 中文展示名（集中维护，避免与引擎层多处漂移） */
export const TONGUE_DIM_LABELS: Record<TongueDimId, string> = {
  area: '舌体形态',
  color: '舌质颜色',
  coat_color: '舌苔颜色',
  coat_texture: '舌苔厚薄',
  teeth: '齿痕',
  crack: '裂纹',
  moist: '润燥',
  sublingual: '舌下络脉',
}

/** 案例行（与 tongue_cases 表一一对应） */
export interface TongueCaseRow {
  case_no: string
  source: 'engine' | 'expert'
  features: Record<string, string>
  answers: number[]
  constitution_primary: string
  constitution_secondary: string | null
  health_index: number
  band: TongueBand
  confidence: number
  tags: string[]
  expert_note: string | null
  created_at: string
}

const CACHE_TTL = 10 * 60 * 1000
let _casesCache: { data: TongueCaseRow[]; ts: number } | null = null

/**
 * 拉全量案例：小程序端直接返回本地内置包（离线可用、零跨境请求）。
 * 带 10 分钟内存缓存避免重复引用；force 参数保留兼容（本地包无需刷新）。
 */
async function fetchAllCases(force = false): Promise<TongueCaseRow[]> {
  if (_casesCache && !force && Date.now() - _casesCache.ts < CACHE_TTL) return _casesCache.data
  const rows = LOCAL_TONGUE_CASES
  _casesCache = { data: rows, ts: Date.now() }
  return rows
}

/** 某维度的特征是否为「中性（常见）」值——中性值不含「（常见）」 */
function isInformativeFeature(v: string | undefined): boolean {
  return !!v && !v.includes('（常见）')
}

export interface TongueCaseFilter {
  /** 主或兼体质 key（命中任一即纳入） */
  constitution?: string
  /** 风险分级 */
  band?: TongueBand
  /** 限定某维度「有指向性」（该维特征不是中性「常见」值） */
  featureDim?: TongueDimId
  /** 关键词：命中 case_no / tags / expert_note 任一即纳入（不区分大小写） */
  keyword?: string
}

/**
 * 检索案例库：先拉全量（缓存），再在内存做组合筛选。
 * 案例库是受控的聚合语料，体量小，内存筛选比拼接 SQL 更稳、更易扩展。
 */
export async function searchTongueCases(
  filter: TongueCaseFilter = {},
  force = false,
): Promise<TongueCaseRow[]> {
  const all = await fetchAllCases(force)
  const kw = filter.keyword?.trim().toLowerCase()
  return all.filter((c) => {
    if (filter.constitution) {
      if (
        c.constitution_primary !== filter.constitution &&
        c.constitution_secondary !== filter.constitution
      ) {
        return false
      }
    }
    if (filter.band && c.band !== filter.band) return false
    if (filter.featureDim && !isInformativeFeature(c.features?.[filter.featureDim])) return false
    if (kw) {
      const hay = [c.case_no, ...(c.tags || []), c.expert_note || ''].join(' ').toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

/** 8 维吻合度：逐维比较用户答案与案例答案，返回吻合维数（0~8） */
export function tongueAnswerSimilarity(userAnswers: number[], caseAnswers: number[]): number {
  if (!userAnswers?.length || !caseAnswers?.length) return 0
  const n = Math.min(userAnswers.length, caseAnswers.length)
  let hit = 0
  for (let i = 0; i < n; i++) if (userAnswers[i] === caseAnswers[i]) hit++
  return hit
}

/** 数据库参考摘要（结果页「用案例库佐证」可用） */
export interface TongueCaseReferenceSummary {
  /** 库内总案例数 */
  total: number
  /** 与本次舌象相似（吻合维数 ≥ minMatch）的案例数 */
  matched: number
  /** 主倾向与本次一致的案例数 */
  samePrimary: number
  /** 相似案例的分级分布 */
  bandDist: Record<TongueBand, number>
  /** 最相似的若干去标识案例（已按吻合度 + 指数排序） */
  top: TongueCaseRow[]
  /** 是否存在库内同类佐证（同主倾向且至少有相似案例） */
  corroborated: boolean
  /** 判定为「相似」的最低吻合维数 */
  minMatch: number
  /** 本次舌象与最相似案例的吻合维数（用于文案：如「6 维吻合」） */
  bestMatch: number
}

/**
 * 用「案例库」佐证本次问卷/识别结果：拿用户的 8 维答案去比对库内案例，
 * 吻合度越高越相似，输出聚合分布 + Top 去标识参考案例。
 * 失败/离线时由调用方兜底（返回 null），绝不抛错阻断本地报告。
 */
export async function getTongueCaseReferences(
  answers: number[],
  opts: {
    /** 本次主倾向 key（用于统计「同主倾向」） */
    primaryKey?: string
    /** 判定相似的吻合维数阈值，默认 3 */
    minMatch?: number
    /** 返回最相似案例条数，默认 3 */
    limit?: number
    /** 是否绕过缓存重新拉取 */
    force?: boolean
  } = {},
): Promise<TongueCaseReferenceSummary> {
  const minMatch = opts.minMatch ?? 3
  const limit = opts.limit ?? 3
  const all = await fetchAllCases(opts.force)
  const bandDist: Record<TongueBand, number> = { low: 0, mid: 0, high: 0 }

  const scored = all.map((c) => ({
    row: c,
    sim: tongueAnswerSimilarity(answers, c.answers),
  }))
  const matched = scored
    .filter((s) => s.sim >= minMatch)
    .sort((a, b) => b.sim - a.sim || a.row.health_index - b.row.health_index)
  matched.forEach((s) => {
    bandDist[s.row.band] = (bandDist[s.row.band] ?? 0) + 1
  })

  const samePrimary = all.filter(
    (c) => opts.primaryKey && c.constitution_primary === opts.primaryKey,
  ).length

  return {
    total: all.length,
    matched: matched.length,
    samePrimary,
    bandDist,
    top: matched.slice(0, limit).map((s) => s.row),
    corroborated: samePrimary > 0 && matched.length > 0,
    minMatch,
    bestMatch: matched.length ? matched[0].sim : 0,
  }
}

/** 入库前合规守门（供后台写入调用方校验：返回是否干净 + 命中违禁词） */
export function guardTongueCaseText(fields: (string | null | undefined)[]): {
  clean: boolean
  hits: string[]
} {
  return validateTongueCaseText(fields)
}
