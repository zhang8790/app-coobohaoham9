/**
 * 食养合规护栏 · 违禁词屏蔽
 * ----------------------------------------------------------------------------
 * 定位铁律：全程是「食养 / 膳食调理 / 营养搭配」，不是医学治病。
 * 系统只做"安不安全 / 适不适合吃"的食养参考，绝不做诊断 / 治疗 / 疗效承诺。
 *
 * 所有面向用户的文案（推荐点评、体质评语、月度报告、商品 care 评语等）
 * 在渲染前必须过 shieldCopy()，命中违禁词自动替换为食养近义词（无映射则脱敏为 **），
 * dev 环境 console.warn 留痕，便于审核。
 */

/** 强制免责声明：每张分析 / 推荐 / 报告卡必须展示 */
export const FOOD_THERAPY_DISCLAIMER =
  '以上为食养参考，不替代专业医疗诊断与治疗。如有不适请及时就医。'

/**
 * 违禁词分类黑名单（持续维护）
 * ① 医疗行为 / 诊断  ② 疗效 / 治愈  ③ 疾病预防宣称
 * ④ 替代药品  ⑤ 机能绝对化(药效宣称)  ⑥ 敏感功效(需资质)  ⑦ 绝对化夸大(广告法)
 */
export const FORBIDDEN_WORDS: string[] = [
  // ① 医疗行为 / 诊断
  '治疗', '医治', '医疗', '诊治', '诊断', '确诊', '处方', '开方', '疗程', '患处', '病灶',
  // ② 疗效 / 治愈
  '治愈', '治好', '痊愈', '根治', '包治', '疗效', '药效', '见效', '速效', '奇效', '神效', '立竿见影', '100%有效',
  // ③ 疾病预防宣称
  '抗癌', '抗肿瘤', '防癌', '防治', '降血糖', '降血压', '降血脂',
  // ④ 替代药品
  '替代药品', '代替药物', '非药品胜药品', '绿色药品',
  // ⑤ 机能绝对化（作为药效宣称）
  '排毒', '清体毒', '溶脂', '燃脂',
  // ⑥ 敏感功效（需资质）
  '丰胸', '壮阳', '助孕', '缩阴',
  // ⑦ 绝对化 / 夸大（广告法）
  '国家级', '顶级', '唯一', '特效', '永久', '第一品牌',
]

/** 安全近义词映射：命中违禁词时优先替换为食养语境词 */
const SAFE_REPLACEMENT: Record<string, string> = {
  '治疗': '调理',
  '医治': '调理',
  '治愈': '舒缓',
  '治好': '缓解',
  '痊愈': '好转',
  '根治': '改善',
  '疗效': '食养作用',
  '药效': '食养作用',
  '降血糖': '控糖',
  '降血压': '低盐',
  '降血脂': '低脂',
  '防治': '留意',
  '抗癌': '均衡膳食',
  '抗肿瘤': '均衡膳食',
  '防癌': '均衡膳食',
  '排毒': '轻盈',
  '燃脂': '轻食',
  '溶脂': '轻食',
}

export interface ShieldResult {
  /** 过滤后的安全文案 */
  safe: string
  /** 命中的违禁词列表 */
  hits: string[]
  /** 是否完全干净（无命中） */
  clean: boolean
}

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production'

/**
 * 过滤文案：屏蔽医疗宣称违禁词。
 * - 有安全近义词 → 替换
 * - 无映射 → 脱敏为 **
 * - dev 环境打印命中留痕
 */
export function shieldCopy(text: string): ShieldResult {
  if (!text) return { safe: text, hits: [], clean: true }
  let safe = text
  const hits: string[] = []
  for (const w of FORBIDDEN_WORDS) {
    if (safe.includes(w)) {
      hits.push(w)
      const repl = SAFE_REPLACEMENT[w]
      safe = repl ? safe.split(w).join(repl) : safe.split(w).join('**')
    }
  }
  if (hits.length && isDev) {
    // eslint-disable-next-line no-console
    console.warn('[compliance-shield] 命中违禁词已屏蔽:', hits.join(', '), '| 原文:', text)
  }
  return { safe, hits, clean: hits.length === 0 }
}

/** 仅校验是否含违禁词（用于提交前 / 构建期拦截） */
export function hasForbidden(text: string): boolean {
  return FORBIDDEN_WORDS.some((w) => text.includes(w))
}
