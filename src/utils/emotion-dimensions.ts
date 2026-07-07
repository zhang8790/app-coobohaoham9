// 情绪编译五维标签库（对应方案 §3.1「五维标签打标」与 §4.2 评分维度）
// ------------------------------------------------------------
// 五个维度与 emotion-scoring.ts 的 EMOTION_TAG_DIMENSIONS 严格对齐：
//   function 功能 / scene 场景 / emotion 情绪 / identity 身份 / sensory 感官
// 每个维度商家限选 1-3 个（见工作台约束）。
//
// 另提供 recommendDimensions(description)：根据商品描述关键词，给各维度推荐标签，
// 辅助商家快速打标（对应方案 §3.2「算法引擎自动推荐标签」）。

export interface DimensionTag {
  zh: string
  icon: string
  color: string
}

// 五维标签库（平台标准词库，运营后台可扩；商家只能从此选择）
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

// 维度顺序（渲染用）
export const EMOTION_DIMENSION_ORDER = ['function', 'scene', 'emotion', 'identity', 'sensory'] as const

export const EMOTION_DIMENSION_LABELS: Record<string, string> = {
  function: '功能属性',
  scene: '适用场景',
  emotion: '情绪锚点',
  identity: '身份认同',
  sensory: '感官体验',
}

export const EMOTION_DIMENSION_MAX = 3 // 每维最多选 3 个

// 描述关键词 → 维度标签推荐映射（算法引擎 P0 版，运营可迭代扩展）
const RECOMMEND_RULES: { keywords: string[]; dim: string; tags: string[] }[] = [
  // 饮品 / 咖啡
  { keywords: ['咖啡', '拿铁', '美式', '浓缩', 'dirty', '摩卡'], dim: 'function', tags: ['咖啡馆', '热饮'] },
  { keywords: ['咖啡', '拿铁', '美式'], dim: 'scene', tags: ['午后摸鱼', '下班路上'] },
  { keywords: ['咖啡'], dim: 'emotion', tags: ['回血', '松弛'] },
  { keywords: ['咖啡'], dim: 'identity', tags: ['有品味', '懂生活'] },
  { keywords: ['咖啡', '拿铁', '浓缩'], dim: 'sensory', tags: ['醇厚', '微苦', '丝滑'] },
  // 茶饮
  { keywords: ['茶', '奶茶', '果茶', '乌龙', '绿茶', '普洱'], dim: 'function', tags: ['茶饮', '热饮'] },
  { keywords: ['茶', '奶茶'], dim: 'scene', tags: ['朋友小聚', '周末一人食'] },
  { keywords: ['茶'], dim: 'emotion', tags: ['治愈', '松弛'] },
  { keywords: ['茶'], dim: 'sensory', tags: ['清甜', '清爽'] },
  // 甜品 / 烘焙
  { keywords: ['蛋糕', '甜品', '面包', '烘焙', '可颂', '甜点', '酥'], dim: 'function', tags: ['烘焙甜品', '甜品'] },
  { keywords: ['蛋糕', '甜品'], dim: 'scene', tags: ['下午茶', '朋友小聚', '节日庆祝'] },
  { keywords: ['甜品', '蛋糕'], dim: 'emotion', tags: ['小确幸', '自我取悦'] },
  { keywords: ['甜品', '面包'], dim: 'sensory', tags: ['松软', '酥脆', '绵密'] },
  // 正餐 / 轻食
  { keywords: ['饭', '餐', '面', '米饭', '沙拉', '轻食', '便当', '单人'], dim: 'function', tags: ['正餐', '轻食', '单人餐'] },
  { keywords: ['一人食', '单人', '独自'], dim: 'scene', tags: ['周末一人食', '独处时光'] },
  { keywords: ['轻食', '沙拉'], dim: 'emotion', tags: ['不将就', '爱自己'] },
  { keywords: ['饭', '餐'], dim: 'sensory', tags: ['温热'] },
  // 按摩 / SPA / 采耳
  { keywords: ['按摩', '推拿', 'SPA', '采耳', '足疗', '理疗'], dim: 'function', tags: ['按摩', 'SPA', '采耳'] },
  { keywords: ['按摩', 'SPA', '采耳'], dim: 'scene', tags: ['下班疲惫', '深夜加班'] },
  { keywords: ['按摩', 'SPA'], dim: 'emotion', tags: ['解压', '放空', '回血'] },
  { keywords: ['SPA', '按摩'], dim: 'identity', tags: ['会留白', '爱自己'] },
  { keywords: ['按摩', 'SPA'], dim: 'sensory', tags: ['松软', '温热'] },
  // 酒水
  { keywords: ['酒', '啤酒', '红酒', '精酿', '鸡尾酒'], dim: 'function', tags: ['酒水'] },
  { keywords: ['酒'], dim: 'scene', tags: ['朋友小聚', '约会', '节日庆祝'] },
  { keywords: ['酒'], dim: 'emotion', tags: ['松弛', '独处'] },
  { keywords: ['酒'], dim: 'sensory', tags: ['醇厚', '馥郁'] },
  // 通用情绪触发词
  { keywords: ['累', '疲惫', '加班', '困'], dim: 'scene', tags: ['深夜加班', '下班疲惫'] },
  { keywords: ['放松', '解压', '休息'], dim: 'emotion', tags: ['解压', '放空'] },
  { keywords: ['独处', '一个人', '安静'], dim: 'emotion', tags: ['独处', '松弛'] },
]

/**
 * 根据商品描述（名称+描述）推荐五维标签。
 * 返回各维度推荐标签（最多 3 个）。商家可一键采纳或按需增减。
 */
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

// 便捷：取某维度的标签对象（带 color/icon）
export function getDimensionTag(dim: string, zh: string): DimensionTag | undefined {
  return (EMOTION_DIMENSION_TAGS[dim] || []).find(t => t.zh === zh)
}
