/**
 * product-analyze Edge Function —— 自包含单文件版（用于 Supabase Dashboard 网页编辑器粘贴部署）
 *
 * ⚠️ 本文件由 `scripts/gen-dashboard-standalone.py` 自动生成，请勿手工编辑。
 *    源文件：supabase/functions/product-analyze/index.ts + 其 import 的 _shared/*.ts
 *
 * 为什么需要它：
 *    Dashboard 的 Deploy function 编辑器只上传单个文件，不打包 `../_shared/`，
 *    直接粘贴 index.ts 必然报 `Module not found ".../_shared/xxx.ts"`。
 *    本文件已把被依赖的 _shared 符号原地内联，零外部依赖，可直接粘贴部署。
 *
 * 部署方式（二选一）：
 *   A. Dashboard 网页编辑器：打开 product-analyze → 全选粘贴本文件内容 → Deploy
 *   B. CLI（推荐，保持单一事实源）：
 *        cd 项目根 && supabase login && supabase functions deploy product-analyze
 *
 * 重新生成：python scripts/gen-dashboard-standalone.py --fn product-analyze
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
/* ===== 内联自 _shared/llmConfig.ts —— 保持公式/常量一字不改 ===== */

interface LlmConfig {
  base: string
  key: string
  model: string
  enabled: boolean
}

/** 读取 LLM 配置（带缓存）。任何异常都安全回退到 env。 */
async function getLlmConfig(): Promise<LlmConfig> {
  // 本地开发模式（LLM_LOCAL_DEV=1）：直接读 env，指向本机 Ollama，
  // 不读远端 system_config，便于离线 / 零成本自测。
  if (Deno.env.get('LLM_LOCAL_DEV') === '1') {
    const env = envConfig()
    cache = { data: env, ts: Date.now() }
    return env
  }

  const now = Date.now()
  if (cache && now - cache.ts < TTL_MS) return cache.data

  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (url && service) {
    try {
      const sb = createClient(url, service, { auth: { persistSession: false } })
      const { data, error } = await sb
        .from('system_config')
        .select('value')
        .eq('key', CONFIG_KEY)
        .maybeSingle()
      if (!error && data?.value) {
        const v = data.value as Record<string, any>
        const cfg: LlmConfig = {
          base: v.base_url || DEFAULT_BASE,
          key: v.api_key || '',
          model: v.model || DEFAULT_MODEL,
          enabled: v.enabled !== false && !!v.api_key,
        }
        cache = { data: cfg, ts: now }
        return cfg
      }
    } catch (e) {
      console.error('[llmConfig] 读 system_config 失败，回退 env:', e)
    }
  }

  const env = envConfig()
  cache = { data: env, ts: now }
  return env
}

/* ===== 内联自 _shared/logLlmCall.ts —— 保持公式/常量一字不改 ===== */

interface LlmUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface LlmCallLogInput {
  functionName: string
  module?: string | null
  model: string
  usage?: LlmUsage | null
  latencyMs?: number | null
  success?: boolean
  errorMessage?: string | null
  userId?: string | null
  orderNo?: string | null
  meta?: Record<string, unknown> | null
}

async function logLlmCall(input: LlmCallLogInput): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !service) return

    const sb = createClient(url, service, { auth: { persistSession: false } })
    const u = input.usage || {}

    await sb.from('llm_call_logs').insert({
      function_name: input.functionName,
      module: input.module ?? null,
      model: input.model,
      prompt_tokens: u.prompt_tokens ?? 0,
      completion_tokens: u.completion_tokens ?? 0,
      total_tokens: u.total_tokens ?? 0,
      latency_ms: input.latencyMs ?? null,
      success: input.success ?? true,
      error_message: input.errorMessage ?? null,
      user_id: input.userId ?? null,
      order_no: input.orderNo ?? null,
      meta: input.meta ?? {},
    })
  } catch (e) {
    // 日志写入失败绝不影响主流程
    console.error('[logLlmCall] 写入失败(已忽略):', e)
  }
}

/* ===== 内联自 _shared/llmGuard.ts —— 保持公式/常量一字不改 ===== */

interface GuardedChatOpts {
  base: string
  key: string
  model: string
  functionName: string
  module: string
  system?: string
  user: string
  imageUrl?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: 'json_object' }
  timeoutMs?: number
  maxRetries?: number
}

interface GuardedChatResult {
  ok: boolean
  data: any | null
  httpStatus?: number
  error?: string
  latencyMs: number
}

async function guardedChat(o: GuardedChatOpts): Promise<GuardedChatResult> {
  const key = hashKey(o)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = run(o)
  inflight.set(key, p)
  try {
    return await p
  } finally {
    inflight.delete(key)
  }
}

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

// LLM 启用判定改由 getLlmConfig() 在 serve 内统一处理（读 system_config 表，回退 env）

// 前端合法枚举（与 src/utils/food-therapy/types.ts 完全一致，用于归一化 LLM 输出）
const ENUMS = {
  nature: ['大寒', '寒凉', '平性', '微温', '温热', '大热'],
  health: ['温中散寒', '健脾养胃', '滋阴润燥', '清热降火', '补气养血', '舒缓安适', '消食化积', '润养舒喉', '利水消肿'],
  emotion: ['治愈放松', '元气满满', '温暖陪伴', '清爽解压', '怀旧慰藉', '仪式感', '小确幸', '社交分享'],
  scene: ['熬夜工作', '秋冬降温', '经期调理', '术后恢复', '单人简餐', '饭后解腻'],
  crowd: ['宫寒量少', '经期量大', '喉咙肿痛', '易上火', '体虚怕冷', '痛风', '脾胃虚寒', '高血压', '高血糖', '高血脂', '肠胃虚弱', '失眠', '免疫力低'],
  grade: ['S', 'A', 'C', 'D'],
}

function normalizeList(val: any, allowed: string[], max?: number): string[] {
  if (!Array.isArray(val)) return []
  const out = val.filter((x) => allowed.includes(x))
  return max ? out.slice(0, max) : out
}
function normalizeOne(val: any, allowed: string[]): string | null {
  return allowed.includes(val) ? val : null
}

// 医疗宣称词闸门：命中则清空该文案字段（前端会回退本地规则）
const MEDICAL_TERMS = ['治疗', '治愈', '疗效', '医治', '药方', '处方', '根治', '抗癌', '抗炎', '消炎', '降血压', '降血糖', '降血脂', '排毒', '燃脂', '遵医嘱', '医师指导下']
function sanitize(text: string): string {
  if (!text) return ''
  for (const t of MEDICAL_TERMS) {
    if (text.includes(t)) return ''
  }
  return text
}

async function callLLMJson(system: string, user: string, cfg: LlmConfig, imageUrl?: string): Promise<any | null> {
  const r = await guardedChat({
    base: cfg.base,
    key: cfg.key,
    model: cfg.model,
    functionName: 'product-analyze',
    module: '商品识别',
    system,
    user,
    imageUrl,
    temperature: 0.3,
    responseFormat: { type: 'json_object' },
  })
  if (!r.ok || !r.data) return null
  const content = r.data?.choices?.[0]?.message?.content || '{}'
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// 把 LLM 原始输出归一化为前端可消费的 ProductAnalysis
function normalizeAnalysis(raw: any, fallbackName: string): any {
  const a = raw || {}
  return {
    ingredients: Array.isArray(a.ingredients) ? a.ingredients.map((x: any) => String(x)).slice(0, 30) : [],
    overall_nature: normalizeOne(a.overall_nature, ENUMS.nature) || '',
    health_tag: normalizeList(a.health_tag, ENUMS.health, 3),
    emotion_tag: normalizeList(a.emotion_tag, ENUMS.emotion, 3),
    aux_remind: sanitize(a.aux_remind || ''),
    allergens: Array.isArray(a.allergens) ? a.allergens.map((x: any) => String(x)).slice(0, 10) : [],
    nutrition: a.nutrition && typeof a.nutrition === 'object' ? a.nutrition : null,
    safety_grade: normalizeOne(a.safety_grade, ENUMS.grade),
    safety_summary: sanitize(a.safety_summary || ''),
    positive_effect: sanitize(a.positive_effect || ''),
    risk_warning: sanitize(a.risk_warning || ''),
    scenes: normalizeList(a.scenes, ENUMS.scene),
    rec_crowds: normalizeList(a.rec_crowds, ENUMS.crowd),
    cautious_crowds: normalizeList(a.cautious_crowds, ENUMS.crowd),
    forbidden_crowds: normalizeList(a.forbidden_crowds, ENUMS.crowd),
    name: fallbackName,
  }
}

const SYSTEM_PROMPT = `你是「来店有喜」食疗安全系统的商品属性识别引擎。给定商品名或商品图，识别其食养属性与作用。
严格遵守：
- 全程是"食养/膳食调理/营养搭配"参考，绝不输出任何医疗诊断、治疗、疗效承诺。
- overall_nature 只能从 [大寒,寒凉,平性,微温,温热,大热] 选一个。
- health_tag 从 [温中散寒,健脾养胃,滋阴润燥,清热降火,补气养血,舒缓安适,消食化积,润养舒喉,利水消肿] 选，最多3。
- emotion_tag 从 [治愈放松,元气满满,温暖陪伴,清爽解压,怀旧慰藉,仪式感,小确幸,社交分享] 选，最多3。
- scenes 从 [熬夜工作,秋冬降温,经期调理,术后恢复,单人简餐,饭后解腻] 选。
- crowds 从 [宫寒量少,经期量大,喉咙肿痛,易上火,体虚怕冷,痛风,脾胃虚寒,高血压,高血糖,高血脂,肠胃虚弱,失眠,免疫力低] 选，分别归入 rec_crowds（推荐）/ cautious_crowds（谨慎）/ forbidden_crowds（不建议）。
- safety_grade 从 [S,A,C,D] 选，仅当能判断配料安全性时给出。
- allergens 用常见类别：乳制品/蛋类/甲壳类水产/海产品/坚果/芝麻/麸质(小麦) 等。
只输出 JSON（不要解释），字段：ingredients[], overall_nature, health_tag[], emotion_tag[], aux_remind, allergens[], nutrition{energy_kj,protein_g,fat_g,carb_g,sugar_g,sodium_mg}, safety_grade, safety_summary, positive_effect, risk_warning, scenes[], rec_crowds[], cautious_crowds[], forbidden_crowds[]。`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    const name: string = (body.name || '').toString().trim()
    const imageUrl: string | undefined = body.imageUrl || undefined
    const manualIngredients: string[] = Array.isArray(body.manualIngredients) ? body.manualIngredients : []

    // 统一读 LLM 配置（system_config 表 → 回退 env）
    const cfg = await getLlmConfig()
    if (!cfg.key) {
      // 未配置 LLM：明确告知前端走本地规则识别
      return json({ success: false, source: 'none', message: '未配置 LLM，请在小程序内使用本地识别或到总管理后台填写模型配置' }, 200, corsHeaders)
    }

    // 后台「测试连接」模式：最小探活，不跑完整识别
    if (body.test) {
      const probe = await callLLMJson('你是连接测试助手。只回复 JSON：{"ok":true}', 'ping', cfg)
      return json({ success: !!probe, source: 'llm', probe: true }, 200, corsHeaders)
    }

    if (!name && !imageUrl) {
      return json({ success: false, error: 'need name or imageUrl' }, 400, corsHeaders)
    }

    const userText = name
      ? `商品/菜名：${name}${manualIngredients.length ? `；已知食材：${manualIngredients.join('、')}` : ''}。请识别其食养属性。`
      : `这是一张商品/菜品图片，请识别其中的食材并判断食养属性（若图中含文字配料表，请结合配料判断）。`

    const raw = await callLLMJson(SYSTEM_PROMPT, userText, cfg, imageUrl)
    if (!raw) {
      return json({ success: false, source: 'llm_error', message: 'LLM 调用失败，请重试或用本地识别' }, 200, corsHeaders)
    }

    const analysis = normalizeAnalysis(raw, name)
    return json({ success: true, source: 'llm', analysis }, 200, corsHeaders)
  } catch (e) {
    return json({ success: false, error: String(e) }, 500, corsHeaders)
  }
})
