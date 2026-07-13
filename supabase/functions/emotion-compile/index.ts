// emotion-compile Edge Function
// ------------------------------------------------------------
// 情绪系统核心服务：理解 + 编译，两端均可接 LLM（OpenAI 兼容接口）。
//
// mode = 'understand'：把用户自由文本（如"今天好累"）分类为 6 个情绪态之一
//   -> inner_label: drained_low | lonely_still | expressive_high | peaceful_zen | nostalgic_soft | eager_forward
//
// mode = 'compile'：把商品（名称/描述/类目/情绪标签）编译成情绪化叙事
//   -> { emotion_title, emotion_detail, scene_tags_compiled, mood_tags_used }
//   结果写入 product_emotion 表缓存（product_id 存在时），详情页直读。
//
// 降级策略（关键）：
//   - 未配置 LLM_API_KEY 时，自动走「规则兜底」，系统照常可用，零外部依赖。
//   - 配置 LLM_API_KEY / LLM_BASE_URL 后，理解与编译均升级为 LLM，结果仍落库缓存。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INNER_LABELS = [
  'drained_low', 'lonely_still', 'expressive_high',
  'peaceful_zen', 'nostalgic_soft', 'eager_forward',
]

const LABEL_DESC: Record<string, string> = {
  drained_low: '耗竭态（累、虚脱、需要回血）',
  lonely_still: '孤独态（一个人、想家、冷清）',
  expressive_high: '表达驱动态（开心、兴奋、想分享）',
  peaceful_zen: '平稳态（放松、悠闲、不想吵）',
  nostalgic_soft: '怀念态（怀旧、旧时光、老友）',
  eager_forward: '渴望态（向往、想改变、想出发）',
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

// OpenAI 兼容调用；返回解析后的 JSON 对象
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
        temperature: 0.85,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!resp.ok) {
      console.error('[emotion-compile] LLM http', resp.status, await resp.text())
      return null
    }
    const j = await resp.json()
    const content = j?.choices?.[0]?.message?.content || '{}'
    return JSON.parse(content)
  } catch (e) {
    console.error('[emotion-compile] LLM error', e)
    return null
  }
}

// 解析类目策略（优先 DB，找不到回退通用）
async function resolveProfile(supabase: any, category?: string) {
  const c = (category || '').trim()
  if (c) {
    const { data } = await supabase
      .from('category_emotion_profiles')
      .select('*')
      .or(`category_key.eq.${c},aliases.cs.{${c}}`)
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  const { data } = await supabase
    .from('category_emotion_profiles')
    .select('*')
    .eq('category_key', '通用')
    .maybeSingle()
  return data || null
}

// 中文标准情绪标签白名单（与前端 EMOTION_KEYWORD_MAP / ALL_MOOD_TAGS 对齐）
// understand 统一返回中文标准标签，避免与前端 MOOD_TAGS 英文 6 态键割裂。
const CANONICAL_TAGS = [
  '治愈', '孤独', '安静', '放松', '愉悦', '快乐', '活泼', '甜蜜', '幸福', '开心',
  '满足', '品质', '刺激', '创意', '分享', '送礼', '实用', '仪式感', '怀旧', '温暖', '专注',
  '活力', '用餐时光', '学习空间', '想念', '思念', '陪伴', '清爽', '清新', '自然', '纯净',
  '奢华', '高端', '精致', '典雅', '尊贵', '有趣', '可爱', '潮流', '个性', '平静', '舒适', '安逸', '慢生活',
]

// ---------------- 理解侧 ----------------
async function handleUnderstand(supabase: any, text: string, headers: any) {
  if (!text || !text.trim()) return json({ success: false, error: 'empty text' }, 400, headers)

  if (hasLLM()) {
    const sys = `你是情绪理解引擎。把用户的话归类到唯一一个中文标准情绪标签。
可选标签（只返回其中之一，不要解释）：
${CANONICAL_TAGS.join('、')}
只输出 JSON：{"canonical_tag": "..."}`
    const res = await callLLM(sys, `用户说：${text}`)
    if (res?.canonical_tag && CANONICAL_TAGS.includes(res.canonical_tag)) {
      return json({ success: true, canonical_tag: res.canonical_tag, inner_label: res.canonical_tag, source: 'llm' }, 200, headers)
    }
  }

  // 规则兜底：读 emotion_lexicon 表（与前端 00057 迁移、loadEmotionLexiconFromDb 列名一致）
  const { data, error } = await supabase
    .from('emotion_lexicon')
    .select('raw_expr, canonical_tag, weight')
    .limit(1000)
  if (error) console.error('[emotion-compile] lexicon load error', error)
  const rows = (data || []) as { raw_expr: string; canonical_tag: string; weight: number }[]
  // 按 raw_expr 长度降序，优先匹配更长、更具体的表达（如先匹配"被绿"再匹配"绿"）
  rows.sort((a, b) => (b.raw_expr?.length || 0) - (a.raw_expr?.length || 0))
  const hit = rows.find(r => r.raw_expr && text.includes(r.raw_expr))
  const canonical_tag = hit?.canonical_tag || '治愈'
  return json({ success: true, canonical_tag, inner_label: canonical_tag, source: 'rule' }, 200, headers)
}

// ---------------- 编译侧 ----------------
// 三阶段翻译模板（与方案 §4.1 对齐）：功能→场景（问句）/ 场景→情绪（状态确认）/ 情绪→身份（身份确认）
// 保持函数自包含，不跨目录 import；运营迭代可在此扩展，或后续改为从 emotion_compile_rules 表读取。
const STAGE_BY_CATEGORY: Record<string, { s1: string; s2: string; s3: string }> = {
  餐饮: { s1: '加班到十点，需要一口暖的？', s2: '明明很累了，又不想随便对付自己？', s3: '你是再忙也会好好照顾自己的人' },
  饮品: { s1: '下午三点，有点撑不住了？', s2: '不想带脑子，就想发会儿呆？', s3: '你是愿意为美好体验买单的人' },
  美业: { s1: '忙了一天，想让自己松口气？', s2: '想好好疼自己一回，不为谁？', s3: '你是懂得给自己留呼吸空间的人' },
  娱乐: { s1: '今天，想彻底放空一下？', s2: '就想痛痛快快玩一场？', s3: '你是会给自己找乐子的人' },
}
const STAGE_FALLBACK = STAGE_BY_CATEGORY['餐饮']

function ruleCompile(name: string, description: string, profile: any, moodTags: string[], sceneTags: string[], category?: string) {
  const metaphors: string[] = profile?.metaphors || []
  const closers: string[] = profile?.closers || []
  const metaphor = metaphors[0] || '寻常物件'
  const closer = closers[0] || '慢慢享用便好。'
  const mood = (moodTags && moodTags[0]) || (profile?.allowed_mood_tags?.[0]) || '安宁'
  const label = profile?.label || '心选'
  const catKey = category || label
  const stage = STAGE_BY_CATEGORY[catKey] || STAGE_FALLBACK
  const title = `${name}·${label}`
  // 三阶段结构化叙事：场景化问句 → 状态确认 → 身份确认
  const detail = `${stage.s1} ${stage.s2} ${name}便如${metaphor}，${mood}之意漫上心头。${stage.s3}。${closer}`
  return {
    emotion_title: title,
    emotion_detail: detail,
    scene_tags_compiled: sceneTags && sceneTags.length ? sceneTags.slice(0, 3) : [mood],
    mood_tags_used: moodTags && moodTags.length ? moodTags.slice(0, 4) : [mood],
    // 五屏情绪详情页可直接消费的三阶段拆分字段（不写入 product_emotion，避免无列报错）
    stage1: stage.s1,
    stage2: stage.s2,
    stage3: stage.s3,
  }
}

async function handleCompile(supabase: any, body: any, headers: any) {
  const { product_id, name, description, category, mood_tags, scene_tags } = body
  const profile = await resolveProfile(supabase, category)

  let result: any
  let compiledBy = 'rule'

  if (hasLLM()) {
    const sys = `你是「情绪编译」文案师，为本地生活电商把商品编译成有武侠气韵、无推销腔的情绪化叙事。
要求：
- 绝不使用"抢购/手慢无/最佳选择/限时/划算/爆款/必买"等任何带货话术
- 语气沉静、有画面感，像在讲一个关于这件物事的小故事
- 输出 JSON，字段：emotion_title(8字内意境短句), emotion_detail(40-70字叙事), scene_tags_compiled(≤3个适用心绪短语), mood_tags_used(≤4个情绪标签)`
    const ctx = `类目策略：${JSON.stringify(profile || {})}
商品名：${name}
商品描述：${description || ''}
情绪标签：${(mood_tags || []).join('、')}
场景标签：${(scene_tags || []).join('、')}`
    const res = await callLLM(sys, ctx)
    if (res && res.emotion_detail) {
      result = {
        emotion_title: res.emotion_title || `${name}·心选`,
        emotion_detail: res.emotion_detail,
        scene_tags_compiled: res.scene_tags_compiled || scene_tags || [],
        mood_tags_used: res.mood_tags_used || mood_tags || [],
      }
      compiledBy = 'llm'
    }
  }

  if (!result) {
    result = ruleCompile(name, description || '', profile, mood_tags || [], scene_tags || [], category)
  }

  // 落库缓存
  if (product_id) {
    const row = {
      product_id,
      emotion_title: result.emotion_title,
      emotion_detail: result.emotion_detail,
      scene_tags_compiled: result.scene_tags_compiled,
      mood_tags_used: result.mood_tags_used,
      category_profile_id: profile?.id || null,
      compiled_by: compiledBy,
      model: compiledBy === 'llm' ? (Deno.env.get('LLM_MODEL') || 'gpt-4o-mini') : null,
      compiled_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('product_emotion')
      .upsert(row, { onConflict: 'product_id' })
    if (error) console.error('[emotion-compile] upsert failed', error)
  }

  return json({ success: true, compiled_by: compiledBy, ...result }, 200, headers)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const mode = body.mode || 'compile'
    if (mode === 'understand') return await handleUnderstand(supabase, body.text || '', corsHeaders)
    return await handleCompile(supabase, body, corsHeaders)
  } catch (e) {
    return json({ success: false, error: String(e) }, 500, corsHeaders)
  }
})
