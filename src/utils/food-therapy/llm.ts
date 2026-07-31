// 食材食疗智能导购 —— LLM 网关客户端（规则做脑、LLM 做嘴）
// 通过 supabase Edge Function food-therapy-ai 调用；未配置 LLM_API_KEY 或调用失败时
// 自动回退规则引擎结果，系统照常可用，零外部依赖。

import type { FitRule, FoodTherapyInput, MarketingCopy } from './types'
import { generateMarketingCopy } from './marketing'
import { resolveSymptomRule } from './symptom-rules'

// 惰性加载 supabase 客户端：避免在非 Taro 运行环境（如引擎自测脚本）于模块顶层加载
// @tarojs/runtime 触发 `ENABLE_INNER_HTML is not defined` 崩溃。Taro 构建中动态 import 同样会被 webpack 解析。
let _supabase: import('@supabase/supabase-js').SupabaseClient | null = null
async function getSupabase() {
  if (!_supabase) {
    const mod = await import('@/client/supabase')
    _supabase = mod.supabase
  }
  return _supabase!
}

export interface NluResult {
  matched_rule_id: string | null
  health_tags: string[]
  emotion_tags: string[]
  nature_hint: string
  food_type?: string | null // 用户点名的食类（水果/坚果/茶/汤…），用于收窄候选池
  source: 'llm' | 'rule'
}

// 类目关键词 → 归一化食类（供 food_type 识别；与 consult-recommend 的 FOOD_TYPE_MATCH 对齐）
const FOOD_TYPE_RULES: { type: string; kw: string[] }[] = [
  { type: '水果', kw: ['水果', '果', '鲜果', '果蔬'] },
  { type: '坚果', kw: ['坚果', '核桃', '腰果', '花生', '瓜子', '果仁'] },
  { type: '茶', kw: ['茶', '茶饮'] },
  { type: '汤羹', kw: ['汤', '羹', '煲'] },
  { type: '蔬菜', kw: ['蔬菜', '青菜', '菜'] },
  { type: '主食', kw: ['饭', '粥', '面', '主食', '杂粮', '米'] },
  { type: '零食', kw: ['零食', '糕点', '饼干', '糖果', '蜜饯'] },
  { type: '饮', kw: ['饮', '汁', '奶', '酸奶'] },
]

export function resolveFoodType(text: string): string | null {
  for (const f of FOOD_TYPE_RULES) {
    if (f.kw.some((k) => text.includes(k))) return f.type
  }
  return null
}

// 由规则禁用性味反推用户想要的性味倾向（忌寒→要温；忌温→要凉）
function natureHintFromRule(rule: FitRule): string {
  const ban = rule.banNatures || []
  if (ban.includes('寒凉') || ban.includes('大寒')) return '温'
  if (ban.includes('温热') || ban.includes('大热')) return '凉'
  const tags = rule.priorityHealthTags || []
  if (tags.includes('清热降火') || tags.includes('滋阴润燥')) return '凉'
  if (tags.includes('温中散寒') || tags.includes('补气养血') || tags.includes('健脾养胃')) return '温'
  return ''
}

// 自由文本 → 结构化信号（ai-nlu）。失败/未配置时回退关键词命中。
export async function nluParseSymptoms(text: string): Promise<NluResult> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase.functions.invoke('food-therapy-ai', {
      body: { mode: 'nlu', text },
    })
    if (!error && data?.success) {
      return {
        matched_rule_id: data.matched_rule_id ?? null,
        health_tags: data.health_tags ?? [],
        emotion_tags: data.emotion_tags ?? [],
        nature_hint: data.nature_hint ?? '',
        food_type: data.food_type ?? null,
        source: data.source === 'llm' ? 'llm' : 'rule',
      }
    }
  } catch (e) {
    console.warn('[nluParseSymptoms] 回退规则解析', e)
  }
  // 兜底：规则引擎真实解析（关键词命中 → 健康标签 + 性味倾向 + 食类），零外部依赖
  const rule = resolveSymptomRule(text)
  const foodType = resolveFoodType(text)
  return {
    matched_rule_id: rule?.id ?? null,
    health_tags: rule ? [...(rule.priorityHealthTags || [])] : [],
    emotion_tags: [],
    nature_hint: rule ? natureHintFromRule(rule) : '',
    food_type: foodType,
    source: 'rule',
  }
}

// 规则文案 → 自然润色（ai-copy）。失败/未配置时回退规则文案。
export async function generateMarketingCopyLLM(
  input: FoodTherapyInput,
  rule?: FitRule | null,
): Promise<{ copy: MarketingCopy; source: 'llm' | 'rule' }> {
  const base = generateMarketingCopy(input, rule)
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase.functions.invoke('food-therapy-ai', {
      body: {
        mode: 'copy',
        name: input.name,
        nature: input.overall_nature ?? '',
        health_tags: input.health_tag ?? [],
        emotion_tags: input.emotion_tag ?? [],
        short_sales_word: base.short_sales_word,
        detail_desc: base.detail_desc,
        circle_copy: base.circle_copy,
        risk_tip: base.risk_tip,
      },
    })
    if (!error && data?.success && data.source === 'llm') {
      return {
        copy: {
          short_sales_word: data.short_sales_word || base.short_sales_word,
          detail_desc: data.detail_desc || base.detail_desc,
          circle_copy: data.circle_copy || base.circle_copy,
          risk_tip: data.risk_tip || base.risk_tip,
          poster_template: base.poster_template,
        },
        source: 'llm',
      }
    }
  } catch (e) {
    console.warn('[generateMarketingCopyLLM] 回退规则文案', e)
  }
  return { copy: base, source: 'rule' }
}

// ── 推荐大脑调用（LLM 直接排序候选商品）──
// 把候选商品 + 用户画像 + 提问一起发给 Qwen，由它排出带理由的清单；
// 失败/未配置时回退 {source:'rule'}，由客户端规则引擎兜底。

export interface LlmRecommendItem {
  product_id: string
  score: number
  reasons: string[]
}

export interface LlmRecommendProduct {
  id: string
  name: string
  nature?: string
  health_tags?: string[]
  food_category?: string
  price?: number
  description?: string
  allergens?: string[]
}

export interface LlmRecommendProfile {
  constitutionName?: string
  avoidNature?: string[]
  topTags?: string[]
  allergies?: string[]
}

export interface LlmRecommendPayload {
  queryText: string
  products: LlmRecommendProduct[]
  profile: LlmRecommendProfile
  termName?: string
  isMedical?: boolean
}

export async function recommendProductsLLM(
  payload: LlmRecommendPayload,
): Promise<{ items: LlmRecommendItem[]; summary: string; source: 'llm' | 'rule' }> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase.functions.invoke('food-therapy-ai', {
      body: { mode: 'recommend', ...payload },
    })
    if (!error && data?.success && data.source === 'llm' && Array.isArray(data.recommendations) && data.recommendations.length) {
      return {
        items: data.recommendations as LlmRecommendItem[],
        summary: data.summary || '',
        source: 'llm',
      }
    }
  } catch (e) {
    console.warn('[recommendProductsLLM] 回退规则', e)
  }
  return { items: [], summary: '', source: 'rule' }
}
