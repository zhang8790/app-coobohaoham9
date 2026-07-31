// 记录 LLM 调用日志（token 用量统计）
// 在任意 Edge Function 调用模型拿到响应后调用一次即可。
// 用 service_role 客户端直写 llm_call_logs（绕过 RLS），内部吞掉所有错误，
// 绝不影响主业务流程。
//
// 用法：
//   const start = Date.now()
//   const j = await resp.json()
//   await logLlmCall({
//     functionName: 'product-analyze',
//     module: '商品识别',
//     model: cfg.model,
//     usage: j?.usage ?? null,
//     latencyMs: Date.now() - start,
//     success: !!j?.choices?.[0],
//     errorMessage: resp.ok ? null : `http ${resp.status}`,
//   })

import { createClient } from 'jsr:@supabase/supabase-js@2'

export interface LlmUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface LlmCallLogInput {
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

export async function logLlmCall(input: LlmCallLogInput): Promise<void> {
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
