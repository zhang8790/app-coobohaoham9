// food-therapy-ai Edge Function
// ------------------------------------------------------------
// 食材食疗智能导购 · LLM 网关（规则做脑、LLM 做嘴）
//
// mode = 'nlu'：把用户自由文本（如"最近嗓子干痒还怕冷"）解析为结构化信号：
//   -> { matched_rule_id, health_tags, emotion_tags, nature_hint, source }
//   规则引擎据此命中体质/症状规则，LLM 仅做"理解"。
//
// mode = 'copy'：把规则引擎产出的营销文案（销售话术/详情/朋友圈/风险）润色为
//   更自然、有温度的中文表达；含医疗宣称词闸门：命中则回退规则文案。
//
// 降级策略（关键）：
//   - 未配置 LLM_API_KEY 时，自动走「规则兜底」（nlu 走关键词命中，copy 原样返回），零外部依赖。
//   - 配置 LLM_API_KEY / LLM_BASE_URL 后，理解与润色升级为 LLM，结果仍受医疗宣称词闸门约束。

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getLlmConfig, type LlmConfig } from '../_shared/llmConfig.ts'
import { logLlmCall } from '../_shared/logLlmCall.ts'

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

// LLM 启用判定改由 getLlmConfig() 在各 handler 内统一处理（读 system_config 表，回退 env）

// OpenAI 兼容调用；返回解析后的 JSON 对象（失败返回 null → 调用方走兜底）
async function callLLM(system: string, user: string, cfg: LlmConfig): Promise<any | null> {
  const key = cfg.key
  const base = cfg.base || 'https://api.openai.com/v1'
  const model = cfg.model || 'gpt-4o-mini'
  const start = Date.now()
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
      const httpMsg = `[food-therapy-ai] LLM http ${resp.status} ${await resp.text()}`
      console.error(httpMsg)
      await logLlmCall({
        functionName: 'food-therapy-ai', module: '食疗导购', model,
        latencyMs: Date.now() - start, success: false, errorMessage: `http ${resp.status}`,
      })
      return null
    }
    const j = await resp.json()
    await logLlmCall({
      functionName: 'food-therapy-ai', module: '食疗导购', model,
      usage: j?.usage ?? null, latencyMs: Date.now() - start,
      success: !!j?.choices?.[0], errorMessage: null,
    })
    const content = j?.choices?.[0]?.message?.content || '{}'
    return JSON.parse(content)
  } catch (e) {
    console.error('[food-therapy-ai] LLM error', e)
    await logLlmCall({
      functionName: 'food-therapy-ai', module: '食疗导购', model,
      latencyMs: Date.now() - start, success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

// 医疗宣称词闸门：命中则返回 true（应回退规则文案）
const MEDICAL_TERMS = ['治疗', '治愈', '疗效', '医治', '药方', '处方', '根治', '抗癌', '抗炎', '消炎', '遵医嘱', '医师指导下']
function hasMedicalClaim(text: string): boolean {
  return MEDICAL_TERMS.some((t) => text.includes(t))
}

// ---------------- NLU ----------------

// 规范化食疗标签（与 product.health_tag 严格对齐，引擎 queryFit 依赖精确匹配）。
// 注意：这是引擎真正在用的受控词表，刻意不依赖 DB symptom_rules 的标签名（二者历史已漂移）。
const CANONICAL_TAGS = [
  '润养舒喉', '清热降火', '滋阴润燥', '补气养血', '温中散寒', '健脾养胃', '消食化积', '舒缓安适',
]

// LLM 自由表述 → 规范化标签（同义归一，保证落入受控词表）
const TAG_SYNONYMS: { canonical: string; pat: RegExp }[] = [
  { canonical: '补气养血', pat: /(术后|恢复|康复|病后|虚弱|体虚|乏力|营养|气血|补气|养血|术后恢复|体弱)/ },
  { canonical: '健脾养胃', pat: /(消化|脾胃|胃弱|脾虚|没胃口|积食|养胃|健脾|易饱|胀|易消化)/ },
  { canonical: '清热降火', pat: /(上火|火气|长痘|口腔溃疡|湿热|炎症|清火|降火)/ },
  { canonical: '滋阴润燥', pat: /(燥|干|润|口干|皮肤干|鼻干|阴虚)/ },
  { canonical: '温中散寒', pat: /(寒|冷|怕冷|凉|温|暖|宫寒|阳虚|散寒)/ },
  { canonical: '消食化积', pat: /(油腻|吃多|撑|积食|解腻|消食)/ },
  { canonical: '舒缓安适', pat: /(睡眠|失眠|多梦|焦虑|安神|放松|紧张|舒缓)/ },
  { canonical: '润养舒喉', pat: /(咽喉|嗓子|喉咙|用嗓|干痒|喉|舒喉)/ },
]

// 类目关键词 → 归一化食类（与客户端 FOOD_TYPE_RULES 对齐；多字优先，避免"坚果"误判"水果"）
const FOOD_TYPE_RULES: { type: string; kw: string[] }[] = [
  { type: '水果', kw: ['水果', '鲜果', '果蔬', '果'] },
  { type: '坚果', kw: ['坚果', '核桃', '腰果', '花生', '瓜子', '果仁'] },
  { type: '茶', kw: ['茶', '茶饮'] },
  { type: '汤羹', kw: ['汤', '羹', '煲'] },
  { type: '蔬菜', kw: ['蔬菜', '青菜', '菜'] },
  { type: '主食', kw: ['饭', '粥', '面', '主食', '杂粮', '米'] },
  { type: '零食', kw: ['零食', '糕点', '饼干', '糖果', '蜜饯'] },
  { type: '饮', kw: ['饮', '汁', '奶', '酸奶'] },
]

function deriveFoodType(text: string): string | null {
  if (!text) return null
  let best: { type: string; len: number } | null = null
  for (const f of FOOD_TYPE_RULES) {
    for (const k of f.kw) {
      if (text.includes(k) && (!best || k.length > best.len)) best = { type: f.type, len: k.length }
    }
  }
  return best?.type ?? null
}

// LLM 给的自由标签 + 原始文本 → 受控词表（文本兜底，避免 LLM 漏给标签时也能命中）
function normalizeHealthTags(llmTags: string[], text: string): string[] {
  const out = new Set<string>()
  const corpus = [...(llmTags || []), text || '']
  for (const t of corpus) {
    for (const s of TAG_SYNONYMS) if (s.pat.test(t)) out.add(s.canonical)
  }
  return [...out]
}

// 由规则禁用性味反推用户想要的性味倾向（忌寒→要温；忌温→要凉）
function natureHintFromRuleDb(rule: any): string {
  const ban = (rule?.ban_natures || []) as string[]
  if (ban.includes('寒凉') || ban.includes('大寒')) return '温'
  if (ban.includes('温热') || ban.includes('大热')) return '凉'
  return ''
}

async function handleNlu(supabase: any, text: string, headers: any) {
  if (!text || !text.trim()) return json({ success: false, error: 'empty text' }, 400, headers)

  const cfg = await getLlmConfig()
  if (cfg.key) {
    const sys = `你是食材食疗导购的「理解」引擎。把用户描述身体状态/场景的自由文本，解析为结构化信号。
只输出 JSON：{"matched_rule_label":"最贴合的规则名称或空串","health_tags":["从以下受控标签中选取：润养舒喉/清热降火/滋阴润燥/补气养血/温中散寒/健脾养胃/消食化积/舒缓安适"],"emotion_tags":["情绪标签"],"nature_hint":"偏寒/偏热/平和/空串","food_type":"用户点名的食类(水果/坚果/茶/汤羹/蔬菜/主食/零食/饮)或空串","keywords":["命中的关键词"]}
注意：仅做饮食文化层面的理解，绝不输出任何医疗诊断或治疗建议。`
    const res = await callLLM(sys, `用户说：${text}`, cfg)
    if (res && (res.health_tags || res.matched_rule_label || res.emotion_tags || res.food_type)) {
      // 用 DB 规则做对齐，确保 matched_rule_id 落在已知规则集
      const aligned = await alignRule(supabase, res.matched_rule_label, text)
      // food_type 仅认文本显式关键词，避免 LLM 臆测品类导致过度收窄
      const foodType = deriveFoodType(text)
      const healthTags = normalizeHealthTags(res.health_tags || [], text)
      return json({
        success: true, source: 'llm',
        matched_rule_id: aligned,
        health_tags: healthTags,
        emotion_tags: res.emotion_tags || [],
        nature_hint: res.nature_hint || '',
        food_type: foodType,
        keywords: res.keywords || [],
      }, 200, headers)
    }
  }

  // 规则兜底：读 symptom_rules 关键词命中（即使未配 LLM 也产出可用信号）
  const { data } = await supabase.from('symptom_rules').select('*').eq('is_active', true)
  const rows = (data || []) as { id: string; label: string; keywords: string[]; ban_natures: string[] }[]
  let best: { id: string; score: number; ban_natures: string[] } | null = null
  for (const r of rows) {
    let score = 0
    for (const kw of r.keywords || []) if (text.includes(kw)) score += 1
    if (score > 0 && (!best || score > best.score)) best = { id: r.id, score, ban_natures: r.ban_natures || [] }
  }
  return json({
    success: true, source: 'rule',
    matched_rule_id: best?.id || null,
    health_tags: normalizeHealthTags([], text),
    emotion_tags: [],
    nature_hint: best ? natureHintFromRuleDb(best) : '',
    food_type: deriveFoodType(text),
    keywords: [],
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

  const cfg = await getLlmConfig()
  if (cfg.key) {
    const sys = `你是「食材食疗导购」的文案师，为本地生活电商把导购文案润色得更自然、有温度、口语化。
要求：
- 绝不使用"抢购/手慢无/最佳选择/限时/划算/爆款/必买/治疗/治愈/疗效"等任何带货或医疗宣称话术
- 保留原文的核心信息（性味、食疗侧重、免责说明）
- 输出 JSON，字段与输入一致：short_sales_word / detail_desc / circle_copy / risk_tip`
    const user = `原始文案：\n${JSON.stringify(rule_copy, null, 2)}\n\n商品上下文：\n${ctx}`
    const res = await callLLM(sys, user, cfg)
    if (res && res.short_sales_word) {
      // 医疗宣称词闸门：任一字段含医疗宣称词 → 整段回退规则文案
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

// ---------------- RECOMMEND（LLM 推荐大脑）----------------
// 把候选商品 + 用户画像 + 提问一起交给 Qwen，由它直接排序并给出带理由的清单。
// 彻底替代"规则引擎按历史购买打分"的旧逻辑——现在用户提问才是主导信号。
// 未配置 LLM / 调用失败 / 参数缺失 时返回 source:'rule'，由客户端规则引擎兜底。

const MEDICAL_HINT_EF = ['手术', '术后', '病后', '化疗', '孕期', '怀孕', '哺乳', '炎症', '糖尿', '高血', '医嘱', '康复', '虚弱', '出院', '开刀']

function clampPct(v: any): number {
  const n = Number(v)
  if (!isFinite(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}

async function handleRecommend(supabase: any, body: any, headers: any) {
  const cfg = await getLlmConfig()
  if (!cfg.key) {
    return json({ success: true, source: 'rule', recommendations: [], summary: '' }, 200, headers)
  }

  const query = (body.queryText || '').trim()
  const products = Array.isArray(body.products) ? body.products : []
  const profile = body.profile || {}
  const termName = body.termName || ''
  const isMedical = !!body.isMedical || MEDICAL_HINT_EF.some((w) => query.includes(w))

  if (!query || !products.length) {
    return json({ success: true, source: 'rule', recommendations: [], summary: '' }, 200, headers)
  }

  const sys = `你是「食材食疗智能导购」的推荐大脑。结合用户提问、用户画像与候选商品，挑出最契合的商品并给出人话理由。
硬性要求：
1. 仅做饮食文化/食养层面的推荐，绝不输出任何医疗诊断、治疗、疗效、药方、处方、治愈建议。
2. 若用户提到手术/病后/孕期/慢病等健康场景，在 summary 末尾追加「（以上为日常食养参考，具体请遵医嘱）」。
3. 尊重用户画像约束：已知过敏原则避开含相关过敏原的商品；体质忌某性味则避开该性味的商品。
4. 理由要具体、贴着商品属性与用户诉求，不要空话套话。
5. 只从给定候选商品中选择，严禁编造商品。
6. 输出 JSON：{"recommendations":[{"product_id":"...","score":0.0~1.0,"reasons":["...","..."]}],"summary":"一句话总结"}`

  const user = `用户提问：${query}
用户画像：体质=${profile.constitutionName || '未知'}，忌性味=${(profile.avoidNature || []).join('/') || '无'}，关注功效=${(profile.topTags || []).join('/') || '无'}，过敏原=${(profile.allergies || []).join('/') || '无'}
时令：${termName || '无'}

候选商品（JSON 数组）：
${JSON.stringify(
  products.map((p: any) => ({
    id: p.id,
    name: p.name,
    nature: p.nature,
    food_category: p.food_category,
    health_tags: p.health_tags,
    price: p.price,
    description: p.description,
    allergens: p.allergens,
  })),
  null,
  0,
)}

请从中挑选最契合的 3~8 个，按契合度从高到低排序，score 用 0~1 表示契合度。`

  const res = await callLLM(sys, user, cfg)
  if (!res || !Array.isArray(res.recommendations)) {
    return json({ success: true, source: 'rule', recommendations: [], summary: '' }, 200, headers)
  }

  const ids = new Set(products.map((p: any) => p.id))
  const recs = (res.recommendations as any[])
    .filter((r: any) => r && ids.has(r.product_id))
    .map((r: any) => ({
      product_id: r.product_id,
      score: clampPct(r.score),
      reasons: Array.isArray(r.reasons) ? r.reasons.map(String).slice(0, 3) : [],
    }))

  let summary = typeof res.summary === 'string' ? res.summary : ''
  if (isMedical && !summary.includes('遵医嘱')) {
    summary = summary ? summary + '（以上为日常食养参考，具体请遵医嘱）' : '（以上为日常食养参考，具体请遵医嘱）'
  }

  return json({ success: true, source: 'llm', recommendations: recs, summary }, 200, headers)
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
    if (mode === 'recommend') return await handleRecommend(supabase, body, corsHeaders)
    return await handleCopy(supabase, body, corsHeaders)
  } catch (e) {
    return json({ success: false, error: String(e) }, 500, corsHeaders)
  }
})
