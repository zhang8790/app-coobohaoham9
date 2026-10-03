/**
 * 望舌辨证 · 进阶算法 v2（可解释启发式，纯本地 · 离线可用）
 * ----------------------------------------------------------------------------
 * 在 v1（8 维 effect 简单加分求和，见 tongue-rules.ts）之上叠加四层能力，
 * 让「兼夹倾向」与「可信度」都显式化，仍然**全程可解释、无黑盒模型**：
 *   ① 证据链   —— 每一分来自哪一维、哪个选项，可回放
 *   ② 交互项   —— 特征组合的协同（如 舌红 × 苔黄厚腻 ⇒ 湿热互结）
 *   ③ 置信度   —— 信息量 + 选项区分度 + 采集来源（引擎识别 / 手工对照）
 *   ④ 兼夹判定 —— 主/次倾向阈值与 v1 一致，交互项可补强兼夹
 *
 * 合规：本模块只做数值演算，不产出面向用户的文案；文案须过 tongue-compliance。
 */

import {
  CONSTITUTION_TYPES,
  calculateResult,
  type TestResult,
} from '@/utils/constitution-test'
import {
  TONGUE_QUESTIONS,
  calculateTongueResult,
  type TongueResult,
} from '@/utils/food-therapy/tongue-rules'

export type EvidenceSource = 'engine' | 'manual'

/** 维度展示名（与 tongue/index 的 FEATURE_LABELS 对应，集中在此避免多处漂移） */
export const TONGUE_DIM_LABELS: Record<string, string> = {
  area: '舌体形态',
  color: '舌质颜色',
  coat_color: '舌苔颜色',
  coat_texture: '舌苔厚薄',
  teeth: '齿痕',
  crack: '裂纹',
  moist: '润燥',
  sublingual: '舌下络脉',
}

/** 单维证据：某一维选了哪个选项、给哪些体质加了多少分 */
export interface TongueEvidence {
  dim: string
  dimLabel: string
  label: string
  adds: Record<string, number>
}

/** 交互项定义：满足 when(answers) 时对 add 中的体质追加协同分 */
interface Interaction {
  id: string
  label: string
  when: (a: number[]) => boolean
  add: Record<string, number>
}

/**
 * 特征交互规则（协同/拮抗）。index 对应 TONGUE_QUESTIONS 顺序：
 * 0=area 1=color 2=coat_color 3=coat_texture 4=teeth 5=crack 6=moist 7=sublingual
 */
const INTERACTIONS: Interaction[] = [
  {
    id: 'shire_heat_damp',
    label: '舌质偏红 × 苔黄厚腻 → 湿与热互结',
    when: (a) => (a[1] === 2 || a[1] === 3) && a[2] === 3,
    add: { shire: 2, tanshi: 1 },
  },
  {
    id: 'tanshi_swollen_teeth',
    label: '舌体胖大 × 明显齿痕 → 湿困偏重',
    when: (a) => a[0] === 1 && a[4] === 2,
    add: { tanshi: 2, qixu: 1 },
  },
  {
    id: 'xueyu_purple_sublingual',
    label: '舌色青紫/暗红 × 舌下络脉曲张 → 血行不畅',
    when: (a) => (a[1] === 4 || a[1] === 3) && a[7] === 2,
    add: { xueyu: 2 },
  },
  {
    id: 'yinxu_red_less_coat',
    label: '舌质偏红 × 少苔无苔 → 津液偏少',
    when: (a) => (a[1] === 2 || a[1] === 3) && a[2] === 4,
    add: { yinxu: 2 },
  },
  {
    id: 'yangxu_pale_wetslide',
    label: '舌质淡白 × 苔面水滑 → 温煦不足',
    when: (a) => a[1] === 1 && a[3] === 4,
    add: { yangxu: 2 },
  },
  {
    id: 'qixu_swollen_mild_teeth',
    label: '舌体胖大 × 轻度齿痕 → 气偏弱',
    when: (a) => a[0] === 1 && a[4] === 1,
    add: { qixu: 1 },
  },
]

/** v1 阈值（保持一致，避免两套判定） */
const PINGHE_THRESHOLD = 3
const SECONDARY_MIN = 4
const SECONDARY_GAP = 5

export interface TongueAnalysis extends TongueResult {
  /** 置信度 0~1，保留两位小数 */
  confidence: number
  /** 证据链（仅含非中性维度） */
  evidence: TongueEvidence[]
  /** 本次命中的交互项描述 */
  interactions: string[]
  /** 信息维度数（effect 非空的维度个数） */
  informativeDims: number
  /** 中性维度数 */
  neutralDims: number
  /** 采集来源 */
  source: EvidenceSource
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function derivePrimary(scores: Record<string, number>): {
  primaryKey: string
  secondaryKey?: string
} {
  const biased = Object.entries(scores)
    .filter(([k]) => k !== 'pinghe')
    .sort((a, b) => b[1] - a[1])

  const primaryKey =
    biased.length === 0 || biased[0][1] < PINGHE_THRESHOLD ? 'pinghe' : biased[0][0]

  let secondaryKey: string | undefined
  if (primaryKey !== 'pinghe' && biased.length >= 2) {
    if (biased[1][1] >= SECONDARY_MIN && biased[0][1] - biased[1][1] <= SECONDARY_GAP) {
      secondaryKey = biased[1][0]
    }
  }
  return { primaryKey, secondaryKey }
}

/**
 * 进阶辨证：answers 为 8 维选项下标（顺序同 TONGUE_QUESTIONS）。
 * 若含未答（-1）会被忽略（该维不计入证据与置信度）。
 */
export function analyzeTongue(
  answers: number[],
  opts: { source?: EvidenceSource } = {},
): TongueAnalysis {
  const source: EvidenceSource = opts.source || 'manual'

  // ① v1 基线打分 + 证据链
  const base = calculateTongueResult(answers)
  const scores: Record<string, number> = { ...base.scores }

  const evidence: TongueEvidence[] = []
  let informativeDims = 0
  let neutralDims = 0
  for (let i = 0; i < TONGUE_QUESTIONS.length; i++) {
    const q = TONGUE_QUESTIONS[i]
    const idx = answers[i]
    if (idx === undefined || idx < 0 || idx >= q.options.length) continue
    const opt = q.options[idx]
    const adds = opt.effect || {}
    if (Object.keys(adds).length === 0) {
      neutralDims++
      continue
    }
    informativeDims++
    evidence.push({
      dim: q.id,
      dimLabel: TONGUE_DIM_LABELS[q.id] || q.id,
      label: opt.label,
      adds: adds as Record<string, number>,
    })
  }

  // ② 交互项（协同分）
  const applied: string[] = []
  for (const it of INTERACTIONS) {
    if (it.when(answers)) {
      applied.push(it.label)
      for (const [k, v] of Object.entries(it.add)) {
        if (k in CONSTITUTION_TYPES) scores[k] = (scores[k] || 0) + v
      }
    }
  }

  // ③ 主/次判定（与 v1 阈值一致）
  const { primaryKey, secondaryKey } = derivePrimary(scores)
  const primary = CONSTITUTION_TYPES[primaryKey]
  const secondary = secondaryKey ? CONSTITUTION_TYPES[secondaryKey] : undefined

  // ④ 置信度：信息量 + 区分度 + 来源
  const biased = Object.entries(scores)
    .filter(([k]) => k !== 'pinghe')
    .sort((a, b) => b[1] - a[1])
  const separation = biased.length >= 2 ? biased[0][1] - biased[1][1] : biased[0]?.[1] || 0
  const sourceFactor = source === 'engine' ? 1 : 0.92

  let confRaw: number
  if (primaryKey === 'pinghe') {
    // 中性维度越多，「均衡」结论越可信
    confRaw = 0.6 + 0.05 * neutralDims
  } else {
    confRaw = 0.5 + 0.055 * informativeDims + 0.025 * Math.min(separation, 6)
  }
  const confidence = Math.round(clamp(confRaw * sourceFactor, 0.5, 0.95) * 100) / 100

  return {
    ...base,
    primary,
    secondary,
    scores,
    confidence,
    evidence,
    interactions: applied,
    informativeDims,
    neutralDims,
    source,
  }
}

/** 置信度 → 中文档位（界面展示用，避免出现「AI/模型」字样） */
export function confidenceLabel(c: number): string {
  if (c >= 0.85) return '较高'
  if (c >= 0.7) return '中等'
  return '偏低'
}

/** 单条体质得分的构成（来自哪一维、哪个选项、加了几分） */
export interface ConstitutionContribution {
  dimLabel: string
  label: string
  points: number
}

/** 单种体质的得分明细（用于深度辩证的可视化与回放） */
export interface ConstitutionScoreDetail {
  key: string
  name: string
  emoji: string
  color: string
  score: number
  /** 该体质的舌象证据来源（维度 → 选项 → 加分），按分值降序 */
  contributions: ConstitutionContribution[]
  isPrimary: boolean
  isSecondary: boolean
  /** 相对最高分的强度 0~1（用于条形可视化） */
  ratio: number
}

/** 深度体质辩证结果：九种体质全量排序 + 兼夹说明 */
export interface DeepConstitutionAnalysis {
  ranked: ConstitutionScoreDetail[]
  /** 得分 > 0 的偏颇质数量（兼夹维度） */
  biasCount: number
  /** 主与次的分差 */
  primarySecondaryGap?: number
  /** 兼夹/倾向中性说明（渲染层负责最终净化，不出现「诊断」字样） */
  note: string
}

/**
 * 深度体质辩证：把 v2 引擎的 scores + evidence 展开成「九种体质得分排序」，
 * 并给每种体质回溯其舌象证据链（哪维哪个选项加分）。交互项的协同加成以
 * 「协同项」伪证据补足，使各体质回放的加分之和与其最终得分一致。
 */
export function deepConstitutionAnalysis(a: TongueAnalysis): DeepConstitutionAnalysis {
  const maxScore = Math.max(1, ...Object.values(a.scores).map((v) => v || 0))

  const ranked: ConstitutionScoreDetail[] = Object.keys(CONSTITUTION_TYPES).map((key) => {
    const c = CONSTITUTION_TYPES[key]
    const score = a.scores[key] || 0

    // ① 选项证据链
    const contributions: ConstitutionContribution[] = []
    for (const e of a.evidence) {
      const pts = e.adds[key]
      if (typeof pts === 'number' && pts > 0) {
        contributions.push({ dimLabel: e.dimLabel, label: e.label, points: pts })
      }
    }

    // ② 交互项协同加成补足（使回放之和 = 最终得分）
    const optionSum = contributions.reduce((s, cc) => s + cc.points, 0)
    const delta = score - optionSum
    if (delta > 0) {
      contributions.push({ dimLabel: '协同项', label: '特征组合协同加成', points: delta })
    }
    contributions.sort((x, y) => y.points - x.points)

    return {
      key,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      score,
      contributions,
      isPrimary: a.primary?.key === key,
      isSecondary: a.secondary?.key === key,
      ratio: score / maxScore,
    }
  })
  ranked.sort((x, y) => y.score - x.score)

  const biasCount = ranked.filter((r) => r.key !== 'pinghe' && r.score > 0).length

  let note: string
  if (a.primary?.key === 'pinghe') {
    note =
      biasCount === 0
        ? '各项舌象特征以中性表现为多，整体趋于平和，未见明显偏颇倾向。'
        : '以平和为主，个别维度略现倾向，可作为日常食养微调的参考。'
  } else if (a.secondary) {
    const gap = (a.scores[a.primary.key] || 0) - (a.scores[a.secondary.key] || 0)
    note =
      gap <= 2
        ? `以「${a.primary.name}」为主，与「${a.secondary.name}」倾向接近，呈兼夹状态，建议两者兼顾调护。`
        : `以「${a.primary.name}」为主，兼有「${a.secondary.name}」倾向，主次较为分明。`
  } else {
    note = `以「${a.primary.name}」为主倾向，单一偏颇特征较为突出。`
  }

  return {
    ranked,
    biasCount,
    primarySecondaryGap:
      a.secondary ? (a.scores[a.primary.key] || 0) - (a.scores[a.secondary.key] || 0) : undefined,
    note,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 双通道交叉校验：身体感受问卷 + 舌象对照，合成综合体质倾向
// ----------------------------------------------------------------------------
// 两套独立引擎（calculateResult / analyzeTongue）各自辨证，再把两套得分**按同一
// 货币（加分点）求和**得到综合得分，沿用同一套阈值判定主/次。两者一致则互相印证、
// 不一致则呈兼夹，天然完成「问卷 × 舌象」的交叉校验，降低单通道误判。
// 合规：只做数值合成，文案由调用方负责，全程不出现「AI/诊断」。

export interface CombinedAssessment {
  /** 身体感受问卷结果（5 题） */
  body: TestResult
  /** 舌象对照结果（v2 引擎，含证据链/交互项/置信度） */
  tongue: TongueAnalysis
  /** 综合得分（身体 + 舌象，按维度求和） */
  scores: Record<string, number>
  primary: ConstitutionType
  secondary?: ConstitutionType
  /** 身体问卷主倾向 key */
  bodyPrimaryKey: string
  /** 舌象对照主倾向 key */
  tonguePrimaryKey: string
  /** 两通道是否指向同一偏颇质（互相印证） */
  consensus: boolean
  /** 交叉校验说明（食养参考口径，不出现诊断词） */
  note: string
}

/**
 * 把身体感受问卷（5 题）与舌象对照（8 维）合并辨证。
 * @param bodyAnswers   TEST_QUESTIONS 的答案下标数组（长度 5，未答用 -1）
 * @param tongueAnswers TONGUE_QUESTIONS 的答案下标数组（长度 8，未答用 -1）
 */
export function combineAssessment(
  bodyAnswers: number[],
  tongueAnswers: number[],
): CombinedAssessment {
  const body = calculateResult(bodyAnswers)
  const tongue = analyzeTongue(tongueAnswers, { source: 'manual' })

  const scores: Record<string, number> = {}
  for (const key of Object.keys(CONSTITUTION_TYPES)) {
    scores[key] = (body.scores[key] || 0) + (tongue.scores[key] || 0)
  }

  const { primaryKey, secondaryKey } = derivePrimary(scores)
  const primary = CONSTITUTION_TYPES[primaryKey]
  const secondary = secondaryKey ? CONSTITUTION_TYPES[secondaryKey] : undefined

  const bodyPrimaryKey = body.primary.key
  const tonguePrimaryKey = tongue.primary.key
  const consensus =
    bodyPrimaryKey !== 'pinghe' &&
    tonguePrimaryKey !== 'pinghe' &&
    bodyPrimaryKey === tonguePrimaryKey

  let note: string
  if (consensus) {
    note = `身体感受与舌象对照指向同一倾向（${primary.name}），两项互相印证，综合判断更可信。`
  } else if (bodyPrimaryKey === 'pinghe' && tonguePrimaryKey === 'pinghe') {
    note = '身体感受与舌象对照均趋于平和，未见明显偏颇倾向。'
  } else if (bodyPrimaryKey === 'pinghe') {
    note = `身体感受偏中性，舌象对照更倾向「${tongue.primary.name}」，以舌象对照为主参考。`
  } else if (tonguePrimaryKey === 'pinghe') {
    note = `舌象对照偏中性，身体感受更倾向「${body.primary.name}」，以身体感受为主参考。`
  } else {
    note = `身体感受偏「${body.primary.name}」、舌象对照偏「${tongue.primary.name}」，两者略有差异；综合取较高者，建议两者兼顾调护。`
  }

  return {
    body,
    tongue,
    scores,
    primary,
    secondary,
    bodyPrimaryKey,
    tonguePrimaryKey,
    consensus,
    note,
  }
}
