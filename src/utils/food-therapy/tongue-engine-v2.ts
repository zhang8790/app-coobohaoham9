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

import { CONSTITUTION_TYPES } from '@/utils/constitution-test'
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
