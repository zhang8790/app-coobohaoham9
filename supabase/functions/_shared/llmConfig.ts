// 集中读取 LLM 配置（被各 Edge Function 复用）
// ------------------------------------------------------------
// 优先级：
//   1) system_config 表（key='llm'）→ 管理后台网页填写，全项目共用
//   2) 回退 Deno.env（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）→ 兼容旧部署
//
// 安全：Edge Function 以 service_role 读表（服务端，绕过 RLS，不暴露给客户端）。
//   前端/小程序永不接触 API Key —— Key 只在服务端被读取并使用。
//
// 性能：模块级缓存 5 分钟，避免每个请求都打一次 DB。

import { createClient } from 'jsr:@supabase/supabase-js@2'

export interface LlmConfig {
  base: string
  key: string
  model: string
  enabled: boolean
}

const CONFIG_KEY = 'llm'
const DEFAULT_BASE = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const TTL_MS = 5 * 60 * 1000

let cache: { data: LlmConfig; ts: number } | null = null

function envConfig(): LlmConfig {
  const key = Deno.env.get('LLM_API_KEY') || ''
  return {
    key,
    base: Deno.env.get('LLM_BASE_URL') || DEFAULT_BASE,
    model: Deno.env.get('LLM_MODEL') || DEFAULT_MODEL,
    enabled: key.length > 0,
  }
}

/** 读取 LLM 配置（带缓存）。任何异常都安全回退到 env。 */
export async function getLlmConfig(): Promise<LlmConfig> {
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

/** 使缓存失效（保存配置后调用，确保下一次读取拿到最新值）。 */
export function resetLlmConfigCache() {
  cache = null
}
