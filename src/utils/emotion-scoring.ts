// 编译质量评分引擎（对应方案 §4.2 / §4.3）
// ------------------------------------------------------------
// 把「编译质量评分算法（满分 100）」与「违规检测机制」固化为纯函数，
// 无副作用、无 DB 依赖，便于商家工作台实时打分、单测、以及云函数复用。
//
// 评分维度（满分 100）：
//   标签完整度  25 分  五维标签每缺一个扣 5 分；标签与商品功能弱相关，每项扣 5 分
//   文案合规性  25 分  出现空洞情绪词（治愈/松弛感等）且无场景绑定，每个扣 5 分；功能信息缺失扣 10 分
//   场景精准度  18 分  场景与商品适配度，由算法匹配度 + 人工审核综合判定
//   确权可达性  17 分  情绪承诺可被用户消费后验证，有明确确权维度；不可验证此项 0 分
//   食养完整度  15 分  食养成分标签选择数，每选 1 个食材得 3 分，满 5 个得 15 分（选 0 个此项 0 分）
//
// 违规等级：
//   redline 红线（直接驳回）：虚假宣传 / 核心功能信息缺失 / 情绪承诺完全不可验证 / 违反广告法
//   demote  降权（推荐排序降权 30%）：空洞情绪词堆砌≥3 且无场景绑定 / 弱相关≥2 个
//   tip     优化提示（不影响上架）：文案可优化方向 / 标签补充建议 / 配图建议

export interface ScoreDimension {
  key: string
  label: string
}

// 五维标签维度（与商家工作台「五维标签打标」一致，对应三阶段翻译的功能→场景→情绪→身份→感官）
export const EMOTION_TAG_DIMENSIONS: ScoreDimension[] = [
  { key: 'function', label: '功能' },
  { key: 'scene', label: '场景' },
  { key: 'emotion', label: '情绪' },
  { key: 'identity', label: '身份' },
  { key: 'sensory', label: '感官' },
]

export type ViolationLevel = 'redline' | 'demote' | 'tip'

export interface Violation {
  level: ViolationLevel
  rule: string
  message: string
}

export interface CompileScoreInput {
  /** 各维度已选标签（key 见 EMOTION_TAG_DIMENSIONS） */
  tagDimensions: Partial<Record<string, string[]>>
  /** 编译后文案（标题 + 详情 + 分享语合并，用于合规检测） */
  copyText: string
  /** 功能信息是否完整（成分 / 规格 / 价格 / 用法至少齐备） */
  hasFunctionInfo: boolean
  /** 情绪词是否绑定到具体场景 */
  sceneBound: boolean
  /** 情绪承诺是否可被用户消费后验证（有确权维度） */
  claimVerifiable: boolean
  /** 空洞情绪词清单（默认一组，可运营覆盖） */
  hollowWords?: string[]
  /** 算法侧场景适配度 0~1（可选，未提供则按 sceneBound 给基础分） */
  sceneMatchScore?: number
  /** 人工审核场景评分 0~20（可选，未提供则取算法分） */
  sceneManualScore?: number
  /** 食养成分标签选择数（0~N），每选 1 个得 3 分，上限 15 */
  shiyangTagCount?: number
}

export interface ScoreResult {
  total: number
  /** recommend 进推荐池(≥80) / shopOnly 仅店铺展示(60-79) / rejected 驳回(<60 或有红线) */
  tier: 'recommend' | 'shopOnly' | 'rejected'
  dimensions: {
    tagCompleteness: number
    copyCompliance: number
    scenePrecision: number
    claimVerifiability: number
    shiyangCompleteness: number
  }
  violations: Violation[]
  suggestions: string[]
}

const DEFAULT_HOLLOW_WORDS = ['治愈', '松弛感', '松弛', '小确幸', '氛围感', '治愈系']

// 违禁词库已抽至通用模块（compliance-words），全站商品/活动/情绪文案统一拦截
import { AD_ILLEGAL_WORDS } from './compliance-words'

/**
 * 对一次情绪编译结果打分并检测违规。
 * 纯函数：相同输入永远得到相同输出，便于单测与工作台实时预览。
 */
export function scoreCompilation(input: CompileScoreInput): ScoreResult {
  const hollow = input.hollowWords ?? DEFAULT_HOLLOW_WORDS
  const copy = input.copyText ?? ''
  const dims = input.tagDimensions ?? {}
  const violations: Violation[] = []
  const suggestions: string[] = []

  // ---------------- 标签完整度 25 ----------------
  let tagCompleteness = 25
  const missingDims = EMOTION_TAG_DIMENSIONS.filter(
    d => !dims[d.key] || (dims[d.key] as string[]).length === 0
  )
  if (missingDims.length) {
    tagCompleteness -= 5 * missingDims.length
    suggestions.push(`补充以下维度的标签：${missingDims.map(d => d.label).join('、')}`)
  }
  // 弱相关：选中标签命中空洞词且未绑定场景 → 视为与功能弱相关
  const weakTags = Object.values(dims)
    .flat()
    .filter(t => hollow.includes(t) && !input.sceneBound)
  if (weakTags.length) {
    tagCompleteness -= 5 * weakTags.length
    suggestions.push(`标签「${weakTags.join('、')}」与功能弱相关，建议补充场景绑定或替换`)
  }
  tagCompleteness = Math.max(0, tagCompleteness)

  // ---------------- 文案合规性 25 ----------------
  let copyCompliance = 25
  const hollowHits = hollow.filter(w => copy.includes(w))
  if (hollowHits.length && !input.sceneBound) {
    copyCompliance -= 5 * hollowHits.length
    if (hollowHits.length >= 3) {
      violations.push({
        level: 'demote',
        rule: '空洞情绪词堆砌≥3',
        message: `文案含空洞情绪词「${hollowHits.join('、')}」且无场景绑定，推荐排序降权 30%`,
      })
    } else {
      suggestions.push(`空洞情绪词「${hollowHits.join('、')}」建议绑定具体场景后再使用`)
    }
  }
  if (!input.hasFunctionInfo) {
    copyCompliance -= 10
    violations.push({
      level: 'redline',
      rule: '核心功能信息缺失',
      message: '文案缺失核心功能信息（成分/规格/价格/用法），直接驳回',
    })
  }
  copyCompliance = Math.max(0, copyCompliance)

  // ---------------- 场景精准度 18 ----------------
  let scenePrecision: number
  if (typeof input.sceneManualScore === 'number') {
    scenePrecision = Math.min(18, Math.max(0, input.sceneManualScore))
  } else {
    const match = typeof input.sceneMatchScore === 'number' ? input.sceneMatchScore : input.sceneBound ? 0.85 : 0.5
    scenePrecision = Math.round(match * 18)
  }
  if (scenePrecision < 11) {
    suggestions.push('场景与商品适配度偏低，建议更换场景化问句或补充场景图')
  }

  // ---------------- 确权可达性 17 ----------------
  let claimVerifiability = input.claimVerifiable ? 17 : 0
  if (!input.claimVerifiable) {
    violations.push({
      level: 'redline',
      rule: '情绪承诺不可验证',
      message: '情绪承诺完全不可验证（无对应确权维度），直接驳回',
    })
  }

  // ---------------- 食养完整度 15 ----------------
  const shiyangCompleteness = Math.min(15, (input.shiyangTagCount ?? 0) * 3)
  if ((input.shiyangTagCount ?? 0) === 0) {
    suggestions.push('建议补充食养成分标签，让商品拥有食养推荐资格')
  }

  // ---------------- 红线：广告法 / 虚假宣传 ----------------
  const adHit = AD_ILLEGAL_WORDS.find(w => copy.includes(w))
  if (adHit) {
    violations.push({
      level: 'redline',
      rule: '违反广告法',
      message: `文案含违禁绝对化用语「${adHit}」，直接驳回`,
    })
  }

  const total = Math.max(
    0,
    tagCompleteness + copyCompliance + scenePrecision + claimVerifiability + shiyangCompleteness
  )

  const hasRedline = violations.some(v => v.level === 'redline')
  let tier: ScoreResult['tier']
  if (hasRedline || total < 60) tier = 'rejected'
  else if (total >= 80) tier = 'recommend'
  else tier = 'shopOnly'

  return {
    total,
    tier,
    dimensions: { tagCompleteness, copyCompliance, scenePrecision, claimVerifiability, shiyangCompleteness },
    violations,
    suggestions: Array.from(new Set(suggestions)),
  }
}
