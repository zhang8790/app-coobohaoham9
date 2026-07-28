/**
 * 今日食养智能推荐引擎
 * 融合：当前节气 + 用户体质 + 消费偏好 → 个性化推荐
 * 所有推荐基于食材属性（性味/功效标签），不含疾病诊断
 */

import type { Product } from '@/db/types'
import { getCurrentTerm, type SeasonalTerm } from './seasonal-box'
import { CONSTITUTION_TYPES, type ConstitutionType } from './constitution-test'
import { type ConsumptionProfile } from './consumption-profile'

// ── 推荐条目 ────────────────────────────────────────────────────────────────

export interface RecommendedItem {
  type: 'ingredient' | 'product'
  name: string
  reason: string       // 为什么推荐（节气×体质×偏好交集的文案）
  sourceMatch: ('season' | 'constitution' | 'preference')[]
  emoji: string
  nature: string       // 性味
  score: number        // 匹配度 0-10
}

export interface TodayFoodTherapyResult {
  /** 当前节气（无用户数据时也可展示） */
  term: SeasonalTerm | null
  /** 用户体质（未测时为 null） */
  constitution: ConstitutionType | null
  /** 季节匹配食材 */
  seasonalIngredients: string[]
  /** 推荐列表（季节+体质+偏好交集排序） */
  recommendations: RecommendedItem[]
  /** 一句话每日食养建议 */
  dailyAdvice: string
  /** 同步提示（适合分享） */
  shareCopy: string
}

// ── 食材名称 → 性味映射（字典 fallback） ────────────────────────────────

/** 常见食材的基本性味（用于对 seasonal-box 推荐食材做体质匹配） */
const INGREDIENT_NATURE_MAP: Record<string, string> = {
  // 温热
  'yangrou': '温', 'jirou': '平', 'paigu': '平', 'jiang': '温', 'dasuan': '温',
  'hetao': '温', 'nangua': '温', 'hongzao': '温', 'guiyuan': '温', 'shanzha': '微温',
  'cong': '温',
  // 平性
  'lianou': '平', 'fanqie': '平', 'bailuobo': '平', 'doufu': '平', 'baicai': '平',
  'bocai': '平', 'muer': '平',
  // 凉/寒
  'lvdou': '寒', 'yinmi': '凉', 'kugua': '寒', 'donggua': '凉', 'huanggua': '凉',
  'jinyinhua': '寒', 'chenpi': '温',
  // 水果
  'xiangjiao': '凉', '梨': '凉', 'haidai': '寒',
}

/** 食材别名→key 映射 */
const INGREDIENT_KEY_MAP: Record<string, string> = {
  '姜': 'jiang', '生姜': 'jiang',
  '蒜': 'dasuan', '大蒜': 'dasuan',
  '葱': 'cong', '葱白': 'cong',
  '山楂': 'shanzha',
  '红枣': 'hongzao', '枣': 'hongzao',
  '莲子': 'lianou',
  '粳米': 'yinmi', '薏米': 'yinmi',
  '绿豆': 'lvdou',
  '核桃': 'hetao', '胡桃': 'hetao',
  '桂圆': 'guiyuan', '龙眼': 'guiyuan',
  '羊肉': 'yangrou',
  '鸡肉': 'jirou',
  '排骨': 'paigu',
}

// ── 推荐引擎 ────────────────────────────────────────────────────────────────

/**
 * 生成今日食养推荐
 * @param constitution 用户体质（未测传 null）
 * @param profile 消费画像（无历史传 null）
 * @param productPool 商品池（可选，用于生成 product 类型推荐）
 * @param boughtIds 已购商品 id 集合（去重）
 */
export function getTodayFoodTherapy(
  constitution: ConstitutionType | null,
  profile: ConsumptionProfile | null,
  productPool?: Product[],
  boughtIds?: Set<string>,
): TodayFoodTherapyResult {
  const term = getCurrentTerm() // 自动取今天日期
  const seasonalIngredients = term?.recommendIngredients || []

  // ── 1. 生成推荐列表 ────────────────────────────────────────

  const recommendations: RecommendedItem[] = []

  // 1a. 节气推荐食材（有性味匹配的更优先）
  for (const key of seasonalIngredients) {
    const nature = INGREDIENT_NATURE_MAP[key] || '平'
    const matchedSources: ('season' | 'constitution' | 'preference')[] = ['season']

    // 体质匹配
    if (constitution) {
      if (constitution.recommendNature.includes(nature)) {
        matchedSources.push('constitution')
      } else if (constitution.avoidNature.includes(nature)) {
        continue // 体质不推荐，跳过
      }
    }

    // 消费偏好匹配（性味）
    if (profile?.naturePref && profile.naturePref === nature) {
      matchedSources.push('preference')
    }

    // 计算得分
    let score = 3 // 季节推荐基线
    if (matchedSources.includes('constitution')) score += 4
    if (matchedSources.includes('preference')) score += 3

    // 找食材中文名
    const DISPLAY_NAMES: Record<string, string> = {
      jiang: '生姜', yangrou: '羊肉', jirou: '鸡肉', paigu: '排骨',
      dasuan: '大蒜', hetao: '核桃', nangua: '南瓜', hongzao: '红枣',
      guiyuan: '桂圆', shanzha: '山楂', cong: '葱白', lianou: '莲藕',
      fanqie: '番茄', bailuobo: '白萝卜', doufu: '豆腐', baicai: '白菜',
      bocai: '菠菜', muer: '木耳', lvdou: '绿豆', yinmi: '薏米',
      kugua: '苦瓜', donggua: '冬瓜', huanggua: '黄瓜', jinyinhua: '金银花',
      chenpi: '陈皮', xiangjiao: '香蕉', haidai: '海带',
    }
    const displayName = DISPLAY_NAMES[key] || key

    const EMOJI_MAP: Record<string, string> = {
      jiang: '🫚', yangrou: '🐑', jirou: '🐔', paigu: '🍖',
      dasuan: '🧄', hetao: '🥜', nangua: '🎃', hongzao: '🫘',
      guiyuan: '🟤', shanzha: '🔴', cong: '🌿', lianou: '🪷',
      fanqie: '🍅', bailuobo: '🥬', doufu: '🍞', baicai: '🥬',
      bocai: '🌿', muer: '🍄', lvdou: '🫘', yinmi: '🌾',
      kugua: '🥒', donggua: '🟢', huanggua: '🥒',
      chenpi: '🟠', xiangjiao: '🍌',
    }

    const reason = buildReason(matchedSources, displayName, term!)
    const emoji = EMOJI_MAP[key] || '🍽️'

    recommendations.push({
      type: 'ingredient',
      name: displayName,
      reason,
      sourceMatch: matchedSources,
      emoji,
      nature,
      score: Math.min(10, score),
    })
  }

  // 1b. 商品推荐（如果传了商品池）
  if (productPool && productPool.length > 0) {
    const bought = boughtIds || new Set<string>()
    for (const p of productPool) {
      if (!p || bought.has(p.id)) continue
      if (!p.overall_nature && !p.health_tag) continue

      const matchedSources: ('season' | 'constitution' | 'preference')[] = []
      const nature = p.overall_nature || '平'

      // 节气匹配
      if (term && nature && getTermNatureTags(term).includes(nature)) {
        matchedSources.push('season')
      }

      // 体质匹配
      if (constitution && nature) {
        if (constitution.recommendNature.includes(nature)) {
          matchedSources.push('constitution')
        } else if (constitution.avoidNature.includes(nature)) {
          continue
        }
      }

      // 偏好匹配（health_tag）
      if (profile && profile.topHealthTags.length > 0 && p.health_tag) {
        const tagHit = profile.topHealthTags.some((ht) =>
          (p.health_tag || []).includes(ht.tag),
        )
        if (tagHit) matchedSources.push('preference')
      }

      if (matchedSources.length === 0) continue

      let score = 0
      if (matchedSources.includes('season')) score += 2
      if (matchedSources.includes('constitution')) score += 5
      if (matchedSources.includes('preference')) score += 3

      recommendations.push({
        type: 'product',
        name: p.name,
        reason: buildReason(matchedSources, p.name, term),
        sourceMatch: matchedSources,
        emoji: '📦',
        nature,
        score: Math.min(10, score),
      })
    }
  }

  // 按得分排序去重
  const seen = new Set<string>()
  const deduped = recommendations.filter((r) => {
    if (seen.has(r.name)) return false
    seen.add(r.name)
    return true
  })
  deduped.sort((a, b) => b.score - a.score)

  // ── 2. 每日建议文案 ───────────────────────────────────────

  const dailyAdvice = buildDailyAdvice(term, constitution)

  // ── 3. 分享文案 ────────────────────────────────────────────

  const shareCopy = buildShareCopy(term, constitution)

  return {
    term,
    constitution,
    seasonalIngredients,
    recommendations: deduped.slice(0, 12),
    dailyAdvice,
    shareCopy,
  }
}

// ── 文案生成 ─────────────────────────────────────────────────────────────

function getTermNatureTags(term: SeasonalTerm): string[] {
  const natureMap: Record<string, string[]> = {
    '温补': ['温', '微温'],
    '清热': ['寒', '凉', '微寒'],
    '平润': ['平', '微温', '微寒'],
    '滋阴': ['寒', '凉'],
    '健脾': ['平', '温', '凉'],
    '润燥': ['寒', '凉', '平'],
  }
  return natureMap[term.nature] || ['平']
}

function buildReason(
  matched: ('season' | 'constitution' | 'preference')[],
  name: string,
  term: SeasonalTerm | null,
): string {
  const parts: string[] = []
  if (matched.includes('season') && term) {
    parts.push(`${term.name}应季食材`)
  }
  if (matched.includes('constitution')) {
    parts.push('适合你的体质')
  }
  if (matched.includes('preference')) {
    parts.push('你平时也喜欢')
  }
  if (parts.length === 0) return '今日推荐'
  // 去掉最后一个分隔符
  return parts.join(' · ')
}

function buildDailyAdvice(
  term: SeasonalTerm | null,
  constitution: ConstitutionType | null,
): string {
  const lines: string[] = []

  if (term) {
    lines.push(`${term.emoji} 今日${term.name}，${term.natureDesc}。`)
    if (term.weatherDesc) {
      lines.push(`🌤 ${term.weatherDesc.split('，')[0]}。`)
    }
  }

  if (constitution) {
    const goal = constitution.healthGoals[0]
    if (goal) {
      lines.push(`💪 你的${constitution.name}倾向：今日宜${goal}。`)
    }
  }

  if (lines.length === 0) {
    return '今天吃点什么好呢？看看当季推荐吧。'
  }

  return lines.join('\n')
}

function buildShareCopy(
  term: SeasonalTerm | null,
  constitution: ConstitutionType | null,
): string {
  const termName = term?.name || '今日'
  const constitName = constitution?.name || '食养'
  return `【${termName}食养推荐】${constitName}适合这样吃！来店有喜帮你搭配好了 →`
}

// ── 从商品池中筛选推荐 ──────────────────────────────────────────────────

/**
 * 获取推荐的商品列表（直接从 result 中提取 product 类型条目，
 * 再在 pool 中按 name 匹配。更精确的方案是直接用 id 匹配）
 */
export function getRecommendedProducts(
  result: TodayFoodTherapyResult,
  pool: Product[],
  limit = 6,
): Product[] {
  const productNames = result.recommendations
    .filter((r) => r.type === 'product')
    .slice(0, limit)
    .map((r) => r.name)

  const matched = pool.filter((p) => productNames.includes(p.name))
  return matched
}

// ── 小程序入口：首页 ─────────────────────────────────────────────────────

/**
 * 判断当前是否在节气切换期（换季前后3天），用于触发「换季提醒」
 */
export function isSeasonTransition(term: SeasonalTerm): boolean {
  const now = new Date()
  const start = new Date(term.startDate)
  const end = new Date(term.endDate)
  const diffToEnd = end.getTime() - now.getTime()
  const diffFromStart = now.getTime() - start.getTime()
  // 节气开始时 3天内 或 结束前 3天内
  return (diffFromStart >= 0 && diffFromStart <= 3 * 86400000) ||
         (diffToEnd >= 0 && diffToEnd <= 3 * 86400000)
}
