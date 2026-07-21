/**
 * 通用违禁词校验工具：营销内容全量筛查。
 * 供商品标题/描述、活动文案、情绪文案等全站接入，统一拦截广告法违禁词。
 *
 * 设计目标：emotion-scoring、商品创建、活动创建等场景共用同一词库与校验函数，
 * 避免各模块各维护一份导致遗漏。后端如有需要亦可复用同一清单。
 */

// 广告法绝对化用语 + 金融化表述 + 博彩抽奖诱导词 + 医疗宣称（运营可扩展）
export const AD_ILLEGAL_WORDS: string[] = [
  // 广告法绝对化用语
  '国家级', '最高级', '最佳', '最好', '第一', '顶级', '极品', '万能', '100%', '绝对', '唯一',
  // 金融化表述（平台不使用）
  '保本', '稳赚', '躺赚', '零风险', '翻倍', '升值', '资产增值', '静态收益', '动态收益',
  // 博彩 / 抽奖诱导
  '中奖', '开奖', '抽奖', '必中',
  // 医疗宣称（食养/商品文案不使用）
  '治疗', '疗效', '治愈', '抗炎', '降血压', '防感冒', '根治',
]

export interface WordCheckResult {
  /** 命中的违禁词列表（去重） */
  found: string[]
  /** 是否通过校验（true=无违禁词） */
  passed: boolean
}

/**
 * 校验文本是否含违禁词。
 * @param text 待校验文本（商品标题/描述、活动文案、情绪文案等）
 * @returns 命中词列表与是否通过
 */
export function checkIllegalWords(text: string | undefined | null): WordCheckResult {
  if (!text || typeof text !== 'string') return { found: [], passed: true }
  const found = AD_ILLEGAL_WORDS.filter(w => text.includes(w))
  return { found: Array.from(new Set(found)), passed: found.length === 0 }
}

/**
 * 批量校验多个字段，返回合并后的命中结果。
 * @param fields 字段名到文本的映射，如 { 标题: name, 描述: description }
 */
export function checkIllegalWordsBatch(fields: Record<string, string | undefined | null>): WordCheckResult & { details: string[] } {
  const allFound: string[] = []
  const details: string[] = []
  for (const [label, text] of Object.entries(fields)) {
    const r = checkIllegalWords(text)
    if (!r.passed) {
      allFound.push(...r.found)
      details.push(`${label}：${r.found.join('、')}`)
    }
  }
  return { found: Array.from(new Set(allFound)), passed: allFound.length === 0, details }
}
