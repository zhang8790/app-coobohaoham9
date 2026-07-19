// food-therapy-ai Edge Function
// ------------------------------------------------------------
// 食材食疗智能导购 · LLM 网关（规则做脑、LLM 做嘴）
//
// mode = 'nlu'：把用户自由文本（如"最近嗓子干痒还怕冷"）解析为结构化信号：
//   -> { matched_rule_id, health_tags, emotion_tags, nature_hint, source }
//   规则引擎据此命中体质/症状规则，LLM 仅做"理解"。
//
// mode = 'copy'：把规则引擎产出的营销文案（销售话术/详情/朋友圈/风险）润色为
//   更自然、有温度的中文表达；含合规闸门：出现医疗宣称词则回退规则文案。
//
// 降级策略（关键）：
//   - 未配置 LLM_API_KEY 时，自动走「规则兜底」（nlu 走关键词命中，copy 原样返回），零外部依赖。
//   - 配置 LLM_API_KEY / LLM_BASE_URL 后，理解与润色升级为 LLM，结果仍受合规闸门约束。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: any, status = 200, headers = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function hasLLM(): boolean {
  return !!Deno.env.get('LLM_API_KEY')
}

// OpenAI 兼容调用；返回解析后的 JSON 对象（失败返回 null → 调用方走兜底）
async function callLLM(system: string, user: string): Promise<any | null> {
  const key = Deno.env.get('LLM_API_KEY')
  const base = Deno.env.get('LLM_BASE_URL') || 'https://api.openai.com/v1'
  const model = Deno.env.get('LLM_MODEL') || 'gpt-4o-mini'
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!resp.ok) {
      console.error('[food-therapy-ai] LLM http', resp.status, await resp.text())
      return null
    }
    const j = await resp.json()
    const content = j?.choices?.[0]?.message?.content || '{}'
    return JSON.parse(content)
  } catch (e) {
    console.error('[food-therapy-ai] LLM error', e)
    return null
  }
}

// 合规闸门：医疗宣称词拦截。命中则返回 true（应回退规则文案）
const MEDICAL_TERMS = ['治疗', '治愈', '疗效', '医治', '药方', '处方', '根治', '抗癌', '抗炎', '消炎', '遵医嘱', '医师指导下']
function hasMedicalClaim(text: string): boolean {
  return MEDICAL_TERMS.some((t) => text.includes(t))
}

// ---------------- NLU ----------------
async function handleNlu(supabase: any, text: string, headers: any) {
  if (!text || !text.trim()) return json({ success: false, error: 'empty text' }, 400, headers)

  if (hasLLM()) {
    const sys = `你是食材食疗导购的「理解」引擎。把用户描述身体状态/场景的自由文本，解析为结构化信号。
只输出 JSON：{"matched_rule_label":"最贴合的规则名称或空串","health_tags":["食疗标签"],"emotion_tags":["情绪标签"],"nature_hint":"偏寒/偏热/平和/空串","keywords":["命中的关键词"]}
注意：仅做饮食文化层面的理解，绝不输出任何医疗诊断或治疗建议。`
    const res = await callLLM(sys, `用户说：${text}`)
    if (res && (res.health_tags || res.matched_rule_label || res.emotion_tags)) {
      // 用 DB 规则做对齐，确保 matched_rule_id 落在已知规则集
      const aligned = await alignRule(supabase, res.matched_rule_label, text)
      return json({
        success: true, source: 'llm',
        matched_rule_id: aligned, health_tags: res.health_tags || [],
        emotion_tags: res.emotion_tags || [], nature_hint: res.nature_hint || '',
        keywords: res.keywords || [],
      }, 200, headers)
    }
  }

  // 规则兜底：读 symptom_rules 关键词命中
  const { data } = await supabase.from('symptom_rules').select('*').eq('is_active', true)
  const rows = (data || []) as { id: string; label: string; keywords: string[] }[]
  let best: { id: string; score: number } | null = null
  for (const r of rows) {
    let score = 0
    for (const kw of r.keywords || []) if (text.includes(kw)) score += 1
    if (score > 0 && (!best || score > best.score)) best = { id: r.id, score }
  }
  return json({
    success: true, source: 'rule',
    matched_rule_id: best?.id || null, health_tags: [], emotion_tags: [], nature_hint: '', keywords: [],
  }, 200, headers)
}

// 把 LLM 给的规则名/关键词对齐到 DB 已知规则 id
async function alignRule(supabase: any, label: string, text: string): Promise<string | null> {
  const { data } = await supabase.from('symptom_rules').select('*').eq('is_active', true)
  const rows = (data || []) as { id: string; label: string; keywords: string[] }[]
  if (label) {
    const hit = rows.find((r) => r.label === label || (r.label && label.includes(r.label)))
    if (hit) return hit.id
  }
  // 退回关键词命中
  let best: { id: string; score: number } | null = null
  for (const r of rows) {
    let score = 0
    for (const kw of r.keywords || []) if (text.includes(kw)) score += 1
    if (score > 0 && (!best || score > best.score)) best = { id: r.id, score }
  }
  return best?.id || null
}

// ---------------- COPY ----------------
async function handleCopy(supabase: any, body: any, headers: any) {
  // 规则引擎已产出的文案（客户端传过来，保证兜底可用）
  const rule_copy = {
    short_sales_word: body.short_sales_word || '',
    detail_desc: body.detail_desc || '',
    circle_copy: body.circle_copy || '',
    risk_tip: body.risk_tip || '',
  }
  const ctx = `商品名：${body.name || ''}\n整体性味：${body.nature || ''}\n食疗标签：${(body.health_tags || []).join('、')}\n情绪标签：${(body.emotion_tags || []).join('、')}`

  let result: any = null
  let source = 'rule'

  if (hasLLM()) {
    const sys = `你是「食材食疗导购」的文案师，为本地生活电商把导购文案润色得更自然、有温度、口语化。
要求：
- 绝不使用"抢购/手慢无/最佳选择/限时/划算/爆款/必买/治疗/治愈/疗效"等任何带货或医疗宣称话术
- 保留原文的核心信息（性味、食疗侧重、合规免责）
- 输出 JSON，字段与输入一致：short_sales_word / detail_desc / circle_copy / risk_tip`
    const user = `原始文案：\n${JSON.stringify(rule_copy, null, 2)}\n\n商品上下文：\n${ctx}`
    const res = await callLLM(sys, user)
    if (res && res.short_sales_word) {
      // 合规闸门：任一字段含医疗宣称词 → 整段回退规则文案
      const bad = [res.short_sales_word, res.detail_desc, res.circle_copy, res.risk_tip].some((t) => hasMedicalClaim(t || ''))
      if (!bad) {
        result = {
          short_sales_word: res.short_sales_word,
          detail_desc: res.detail_desc || rule_copy.detail_desc,
          circle_copy: res.circle_copy || rule_copy.circle_copy,
          risk_tip: res.risk_tip || rule_copy.risk_tip,
        }
        source = 'llm'
      }
    }
  }

  if (!result) result = rule_copy

  return json({ success: true, source, ...result }, 200, headers)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const mode = body.mode || 'copy'
    if (mode === 'nlu') return await handleNlu(supabase, body.text || '', corsHeaders)
    return await handleCopy(supabase, body, corsHeaders)
  } catch (e) {
    return json({ success: false, error: String(e) }, 500, corsHeaders)
  }
})
