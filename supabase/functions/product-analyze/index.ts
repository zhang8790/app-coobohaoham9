// product-analyze Edge Function
// ------------------------------------------------------------
// 食疗 / 安全系统 · 智能识别网关（输入菜名 或 上传图片 → 自动识别商品属性与作用）
//
// 复用 food-therapy-ai 的 OpenAI 兼容 LLM 网关（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL），
// 支持：
//   - name 文本识别：把商品/菜名解析为结构化食养属性
//   - imageUrl 视觉识别：支持视觉的模型（gpt-4o / gemini / qwen-vl 等）可"看图识菜"，
//     直接从菜品图/配料表图提取食材与属性
//
// 降级策略（关键）：
//   - 未配置 LLM_API_KEY 时，返回 source:'none'，前端自动回退「小程序本地规则识别」
//     （src/utils/food-therapy/dishAnalyzer.ts），保证无密钥也能用。
//   - 配置密钥后，识别升级为 LLM / 视觉，结果经医疗宣称词闸门 + 枚举归一化约束，
//     确保 all 字段落在前端表单合法枚举内。
//
// 合规铁律：全程"食养/膳食调理/营养搭配"参考，绝不输出诊断/治疗/疗效承诺。

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getLlmConfig, type LlmConfig } from '../_shared/llmConfig.ts'

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
  const key = cfg.key
  const base = cfg.base || 'https://api.openai.com/v1'
  const model = cfg.model || 'gpt-4o-mini'
  try {
    const userContent: any[] = [{ type: 'text', text: user }]
    if (imageUrl) userContent.push({ type: 'image_url', image_url: { url: imageUrl } })

    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: imageUrl ? userContent : user },
        ],
      }),
    })
    if (!resp.ok) {
      console.error('[product-analyze] LLM http', resp.status, await resp.text())
      return null
    }
    const j = await resp.json()
    const content = j?.choices?.[0]?.message?.content || '{}'
    return JSON.parse(content)
  } catch (e) {
    console.error('[product-analyze] LLM error', e)
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

const SYSTEM_PROMPT = `你是「来电有喜」食疗安全系统的商品属性识别引擎。给定商品名或商品图，识别其食养属性与作用。
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
