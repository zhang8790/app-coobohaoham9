// 情绪编译五维标签库 + 评分引擎（移植自小程序端 src/utils/emotion-dimensions.ts + emotion-scoring.ts）
// 纯函数、无 DB 依赖，供 admin-web 商家情绪工作台实时打分与打标使用。

export interface DimensionTag {
  zh: string
  icon: string
  color: string
}

// 五维标签库（平台标准词库；商家只能从此选择）
export const EMOTION_DIMENSION_TAGS: Record<string, DimensionTag[]> = {
  function: [
    { zh: '热饮', icon: '🍵', color: '#D97706' },
    { zh: '烘焙甜品', icon: '🧁', color: '#DB2777' },
    { zh: '轻食', icon: '🥗', color: '#16A34A' },
    { zh: '单人餐', icon: '🍱', color: '#CA8A04' },
    { zh: '正餐', icon: '🍲', color: '#EA580C' },
    { zh: '按摩', icon: '💆', color: '#0891B2' },
    { zh: 'SPA', icon: '🛁', color: '#0EA5E9' },
    { zh: '采耳', icon: '👂', color: '#6366F1' },
    { zh: '茶饮', icon: '🍶', color: '#65A30D' },
    { zh: '咖啡馆', icon: '☕', color: '#92400E' },
    { zh: '酒水', icon: '🍷', color: '#9F1239' },
    { zh: '甜品', icon: '🍰', color: '#EC4899' },
  ],
  scene: [
    { zh: '深夜加班', icon: '🌙', color: '#4338CA' },
    { zh: '周末一人食', icon: '🏠', color: '#0D9488' },
    { zh: '下班疲惫', icon: '🌆', color: '#B45309' },
    { zh: '午后摸鱼', icon: '☕', color: '#C2410C' },
    { zh: '朋友小聚', icon: '👯', color: '#DB2777' },
    { zh: '约会', icon: '💑', color: '#E11D48' },
    { zh: '独处时光', icon: '🕯️', color: '#7C3AED' },
    { zh: '出差途中', icon: '✈️', color: '#0369A1' },
    { zh: '节日庆祝', icon: '🎉', color: '#DC2626' },
    { zh: '下班路上', icon: '🚶', color: '#57534E' },
  ],
  emotion: [
    { zh: '疲惫', icon: '😮‍💨', color: '#64748B' },
    { zh: '孤独', icon: '🌧️', color: '#475569' },
    { zh: '不将就', icon: '💪', color: '#B91C1C' },
    { zh: '松弛', icon: '🍃', color: '#15803D' },
    { zh: '独处', icon: '🌿', color: '#0F766E' },
    { zh: '自我取悦', icon: '💝', color: '#BE185D' },
    { zh: '解压', icon: '🔥', color: '#EA580C' },
    { zh: '放空', icon: '🌌', color: '#6D28D9' },
    { zh: '回血', icon: '⚡', color: '#CA8A04' },
    { zh: '治愈', icon: '🩹', color: '#0D9488' },
    { zh: '小确幸', icon: '✨', color: '#DB2777' },
    { zh: '仪式感', icon: '🕯️', color: '#9333EA' },
  ],
  identity: [
    { zh: '懂生活', icon: '🌻', color: '#D97706' },
    { zh: '会留白', icon: '⚪', color: '#0891B2' },
    { zh: '爱自己', icon: '💗', color: '#DB2777' },
    { zh: '有品味', icon: '🎩', color: '#7C3AED' },
    { zh: '不将就', icon: '💎', color: '#B91C1C' },
    { zh: '精致', icon: '✨', color: '#A855F7' },
    { zh: '慢生活', icon: '🐌', color: '#65A30D' },
    { zh: '独立', icon: '🕊️', color: '#0EA5E9' },
    { zh: '温柔', icon: '🌸', color: '#EC4899' },
    { zh: '自由', icon: '🦋', color: '#0891B2' },
  ],
  sensory: [
    { zh: '温热', icon: '🔥', color: '#DC2626' },
    { zh: '松软', icon: '🍞', color: '#CA8A04' },
    { zh: '微苦', icon: '☕', color: '#92400E' },
    { zh: '清甜', icon: '🍬', color: '#DB2777' },
    { zh: '绵密', icon: '🍦', color: '#BE185D' },
    { zh: '酥脆', icon: '🥐', color: '#B45309' },
    { zh: '丝滑', icon: '🧈', color: '#D97706' },
    { zh: '馥郁', icon: '🌺', color: '#9F1239' },
    { zh: '清爽', icon: '💧', color: '#0EA5E9' },
    { zh: '醇厚', icon: '🍷', color: '#7C2D12' },
  ],
}

export const EMOTION_DIMENSION_ORDER = ['function', 'scene', 'emotion', 'identity', 'sensory'] as const

export const EMOTION_DIMENSION_LABELS: Record<string, string> = {
  function: '功能属性',
  scene: '适用场景',
  emotion: '情绪锚点',
  identity: '身份认同',
  sensory: '感官体验',
}

export const EMOTION_DIMENSION_MAX = 3

const RECOMMEND_RULES: { keywords: string[]; dim: string; tags: string[] }[] = [
  { keywords: ['咖啡', '拿铁', '美式', '浓缩', 'dirty', '摩卡'], dim: 'function', tags: ['咖啡馆', '热饮'] },
  { keywords: ['咖啡', '拿铁', '美式'], dim: 'scene', tags: ['午后摸鱼', '下班路上'] },
  { keywords: ['咖啡'], dim: 'emotion', tags: ['回血', '松弛'] },
  { keywords: ['咖啡'], dim: 'identity', tags: ['有品味', '懂生活'] },
  { keywords: ['咖啡', '拿铁', '浓缩'], dim: 'sensory', tags: ['醇厚', '微苦', '丝滑'] },
  { keywords: ['茶', '奶茶', '果茶', '乌龙', '绿茶', '普洱'], dim: 'function', tags: ['茶饮', '热饮'] },
  { keywords: ['茶', '奶茶'], dim: 'scene', tags: ['朋友小聚', '周末一人食'] },
  { keywords: ['茶'], dim: 'emotion', tags: ['治愈', '松弛'] },
  { keywords: ['茶'], dim: 'sensory', tags: ['清甜', '清爽'] },
  { keywords: ['蛋糕', '甜品', '面包', '烘焙', '可颂', '甜点', '酥'], dim: 'function', tags: ['烘焙甜品', '甜品'] },
  { keywords: ['蛋糕', '甜品'], dim: 'scene', tags: ['下午茶', '朋友小聚', '节日庆祝'] },
  { keywords: ['甜品', '蛋糕'], dim: 'emotion', tags: ['小确幸', '自我取悦'] },
  { keywords: ['甜品', '面包'], dim: 'sensory', tags: ['松软', '酥脆', '绵密'] },
  { keywords: ['饭', '餐', '面', '米饭', '沙拉', '轻食', '便当', '单人'], dim: 'function', tags: ['正餐', '轻食', '单人餐'] },
  { keywords: ['一人食', '单人', '独自'], dim: 'scene', tags: ['周末一人食', '独处时光'] },
  { keywords: ['轻食', '沙拉'], dim: 'emotion', tags: ['不将就', '爱自己'] },
  { keywords: ['饭', '餐'], dim: 'sensory', tags: ['温热'] },
  { keywords: ['按摩', '推拿', 'SPA', '采耳', '足疗', '理疗'], dim: 'function', tags: ['按摩', 'SPA', '采耳'] },
  { keywords: ['按摩', 'SPA', '采耳'], dim: 'scene', tags: ['下班疲惫', '深夜加班'] },
  { keywords: ['按摩', 'SPA'], dim: 'emotion', tags: ['解压', '放空', '回血'] },
  { keywords: ['SPA', '按摩'], dim: 'identity', tags: ['会留白', '爱自己'] },
  { keywords: ['按摩', 'SPA'], dim: 'sensory', tags: ['松软', '温热'] },
  { keywords: ['酒', '啤酒', '红酒', '精酿', '鸡尾酒'], dim: 'function', tags: ['酒水'] },
  { keywords: ['酒'], dim: 'scene', tags: ['朋友小聚', '约会', '节日庆祝'] },
  { keywords: ['酒'], dim: 'emotion', tags: ['松弛', '独处'] },
  { keywords: ['酒'], dim: 'sensory', tags: ['醇厚', '馥郁'] },
  { keywords: ['累', '疲惫', '加班', '困'], dim: 'scene', tags: ['深夜加班', '下班疲惫'] },
  { keywords: ['放松', '解压', '休息'], dim: 'emotion', tags: ['解压', '放空'] },
  { keywords: ['独处', '一个人', '安静'], dim: 'emotion', tags: ['独处', '松弛'] },
]

export function recommendDimensions(text: string): Partial<Record<string, string[]>> {
  const t = (text || '').toLowerCase()
  const result: Record<string, string[]> = {}
  for (const rule of RECOMMEND_RULES) {
    if (rule.keywords.some(k => t.includes(k.toLowerCase()))) {
      const arr = result[rule.dim] || []
      for (const tag of rule.tags) {
        if (arr.length < EMOTION_DIMENSION_MAX && !arr.includes(tag)) arr.push(tag)
      }
      result[rule.dim] = arr
    }
  }
  return result
}

export function getDimensionTag(dim: string, zh: string): DimensionTag | undefined {
  return (EMOTION_DIMENSION_TAGS[dim] || []).find(t => t.zh === zh)
}

// ---------------- 评分引擎 ----------------
export interface ScoreDimension {
  key: string
  label: string
}

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
  tagDimensions: Partial<Record<string, string[]>>
  copyText: string
  hasFunctionInfo: boolean
  sceneBound: boolean
  claimVerifiable: boolean
  hollowWords?: string[]
  sceneMatchScore?: number
  sceneManualScore?: number
}

export interface ScoreResult {
  total: number
  tier: 'recommend' | 'shopOnly' | 'rejected'
  dimensions: {
    tagCompleteness: number
    copyCompliance: number
    scenePrecision: number
    claimVerifiability: number
  }
  violations: Violation[]
  suggestions: string[]
}

const DEFAULT_HOLLOW_WORDS = ['治愈', '松弛感', '松弛', '小确幸', '氛围感', '治愈系']
const AD_ILLEGAL_WORDS = ['国家级', '最高级', '最佳', '最好', '第一', '顶级', '极品', '万能', '100%', '绝对', '唯一']

export function scoreCompilation(input: CompileScoreInput): ScoreResult {
  const hollow = input.hollowWords ?? DEFAULT_HOLLOW_WORDS
  const copy = input.copyText ?? ''
  const dims = input.tagDimensions ?? {}
  const violations: Violation[] = []
  const suggestions: string[] = []

  let tagCompleteness = 30
  const missingDims = EMOTION_TAG_DIMENSIONS.filter(
    d => !dims[d.key] || (dims[d.key] as string[]).length === 0
  )
  if (missingDims.length) {
    tagCompleteness -= 6 * missingDims.length
    suggestions.push(`补充以下维度的标签：${missingDims.map(d => d.label).join('、')}`)
  }
  const weakTags = Object.values(dims).flat().filter(t => hollow.includes(t) && !input.sceneBound)
  if (weakTags.length) {
    tagCompleteness -= 5 * weakTags.length
    suggestions.push(`标签「${weakTags.join('、')}」与功能弱相关，建议补充场景绑定或替换`)
  }
  tagCompleteness = Math.max(0, tagCompleteness)

  let copyCompliance = 30
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

  let scenePrecision: number
  if (typeof input.sceneManualScore === 'number') {
    scenePrecision = Math.min(20, Math.max(0, input.sceneManualScore))
  } else {
    const match = typeof input.sceneMatchScore === 'number' ? input.sceneMatchScore : input.sceneBound ? 0.85 : 0.5
    scenePrecision = Math.round(match * 20)
  }
  if (scenePrecision < 12) {
    suggestions.push('场景与商品适配度偏低，建议更换场景化问句或补充场景图')
  }

  let claimVerifiability = input.claimVerifiable ? 20 : 0
  if (!input.claimVerifiable) {
    violations.push({
      level: 'redline',
      rule: '情绪承诺不可验证',
      message: '情绪承诺完全不可验证（无对应确权维度），直接驳回',
    })
  }

  const adHit = AD_ILLEGAL_WORDS.find(w => copy.includes(w))
  if (adHit) {
    violations.push({
      level: 'redline',
      rule: '违反广告法',
      message: `文案含违禁绝对化用语「${adHit}」，直接驳回`,
    })
  }

  const total = Math.max(0, tagCompleteness + copyCompliance + scenePrecision + claimVerifiability)
  const hasRedline = violations.some(v => v.level === 'redline')
  let tier: ScoreResult['tier']
  if (hasRedline || total < 60) tier = 'rejected'
  else if (total >= 80) tier = 'recommend'
  else tier = 'shopOnly'

  return {
    total,
    tier,
    dimensions: { tagCompleteness, copyCompliance, scenePrecision, claimVerifiability },
    violations,
    suggestions: Array.from(new Set(suggestions)),
  }
}

// ---------------- 本地规则编译（云函数兜底） ----------------
// 与 supabase/functions/emotion-compile 的 ruleCompile 逻辑对齐。
// 当云端 emotion-compile 函数未部署/不可用时，前端仍能产出情绪文案，避免"编译失败"。
const COMPILE_STAGE_BY_CATEGORY: Record<string, { s1: string; s2: string; s3: string }> = {
  餐饮: { s1: '加班到十点，需要一口暖的？', s2: '明明很累了，又不想随便对付自己？', s3: '你是再忙也会好好照顾自己的人' },
  饮品: { s1: '下午三点，有点撑不住了？', s2: '不想带脑子，就想发会儿呆？', s3: '你是愿意为美好体验买单的人' },
  美业: { s1: '忙了一天，想让自己松口气？', s2: '想好好疼自己一回，不为谁？', s3: '你是懂得给自己留呼吸空间的人' },
  娱乐: { s1: '今天，想彻底放空一下？', s2: '就想痛痛快快玩一场？', s3: '你是会给自己找乐子的人' },
}
const COMPILE_STAGE_FALLBACK = COMPILE_STAGE_BY_CATEGORY['餐饮']

function detectCompileCategory(text: string): string {
  const t = text || ''
  if (/咖啡|拿铁|美式|茶|奶茶|果茶|乌龙|饮品|酒/.test(t)) return '饮品'
  if (/按摩|SPA|采耳|足疗|推拿|理疗|美容|美甲/.test(t)) return '美业'
  if (/电影|游戏|娱乐|桌游|玩/.test(t)) return '娱乐'
  if (/饭|餐|面|米饭|沙拉|轻食|便当|单人/.test(t)) return '餐饮'
  return '餐饮'
}

export function localCompileEmotion(opts: {
  name: string
  description?: string
  selected?: Partial<Record<string, string[]>>
}): { emotion_title: string; emotion_detail: string; compiled_by: 'local' } {
  const { name, description = '', selected = {} } = opts
  const cat = detectCompileCategory(`${name} ${description}`)
  const stage = COMPILE_STAGE_BY_CATEGORY[cat] || COMPILE_STAGE_FALLBACK
  const mood = (selected.emotion && selected.emotion[0]) || (selected.identity && selected.identity[0]) || '安宁'
  const metaphor = (selected.function && selected.function[0]) || '寻常物件'
  const title = `${name}·${mood}`
  const detail = `${stage.s1} ${stage.s2} ${name}便如${metaphor}，${mood}之意漫上心头。${stage.s3}。慢慢享用便好。`
  return { emotion_title: title, emotion_detail: detail, compiled_by: 'local' }
}
