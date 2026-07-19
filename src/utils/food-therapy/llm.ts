// 食材食疗智能导购 —— LLM 网关客户端（规则做脑、LLM 做嘴）
// 通过 supabase Edge Function food-therapy-ai 调用；未配置 LLM_API_KEY 或调用失败时
// 自动回退规则引擎结果，系统照常可用，零外部依赖。

import type { FitRule, FoodTherapyInput, MarketingCopy } from './types'
import { generateMarketingCopy } from './marketing'
import { resolveSymptomRule } from './symptom-rules'

// 惰性加载 supabase 客户端：避免在非 Taro 运行环境（如引擎自测脚本）于模块顶层加载
// @tarojs/runtime 触发 `ENABLE_INNER_HTML is not defined` 崩溃。Taro 构建中动态 import 同样会被 webpack 解析。
let _supabase: import('@/client/supabase').supabase | null = null
async function getSupabase() {
  if (!_supabase) {
    const mod = await import('@/client/supabase')
    _supabase = mod.supabase
  }
  return _supabase
}

export interface NluResult {
  matched_rule_id: string | null
  health_tags: string[]
  emotion_tags: string[]
  nature_hint: string
  source: 'llm' | 'rule'
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
        source: data.source === 'llm' ? 'llm' : 'rule',
      }
    }
  } catch (e) {
    console.warn('[nluParseSymptoms] 回退规则解析', e)
  }
  // 兜底：关键词命中
  const rule = resolveSymptomRule(text)
  return { matched_rule_id: rule?.id ?? null, health_tags: [], emotion_tags: [], nature_hint: '', source: 'rule' }
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
