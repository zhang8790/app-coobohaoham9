// LLM 调用抗压层（P2）
// ------------------------------------------------------------
// 统一封装 4 个 LLM Edge Function（product-analyze / emotion-compile /
// food-therapy-ai / expiry-engine）对 chat/completions 的调用，提供：
//   1) 并发信号量（单实例上限 MAX_CONCURRENT）→ 避免高并发瞬时打爆
//      LLM 提供商速率限制与 Edge Function 实例资源
//   2) 请求超时（AbortController，默认 25s）→ 防止慢调用长期占用实例
//   3) 指数退避重试（对 429 / 5xx / 超时，默认 2 次）→ 平滑瞬时抖动
//   4) in-flight 去重（相同请求并发复用同一 Promise）→ 省成本、减堆积
//
// 业务降级（前端本地规则 / 规则折扣）仍由各 EF 自行处理：本层只负责
// “LLM 调用是否成功”，失败时返回 ok:false，由各 EF 走降级分支。
//
// 日志：成功/失败统一由本层调用 logLlmCall 记录一次（各 EF 原调用点移除，
// 避免重复）。

import { logLlmCall } from './logLlmCall.ts'

export interface GuardedChatOpts {
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

export interface GuardedChatResult {
  ok: boolean
  data: any | null
  httpStatus?: number
  error?: string
  latencyMs: number
}

// 单实例并发上限：Supabase 函数实例并发有限，限到 6 避免瞬时打爆 LLM 与实例
const MAX_CONCURRENT = 6
let active = 0
const waiters: Array<() => void> = []

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => waiters.push(resolve))
}
function release() {
  if (active > 0) active--
  if (waiters.length > 0 && active < MAX_CONCURRENT) {
    active++
    const next = waiters.shift()!
    next()
  }
}

// in-flight 去重：相同请求并发复用同一 Promise
const inflight = new Map<string, Promise<GuardedChatResult>>()

function hashKey(o: GuardedChatOpts): string {
  const raw = `${o.functionName}|${o.model}|${o.system ?? ''}|${o.user}|${o.imageUrl ?? ''}`
  let h = 2166136261
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return String(h >>> 0)
}

export async function guardedChat(o: GuardedChatOpts): Promise<GuardedChatResult> {
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

async function run(o: GuardedChatOpts): Promise<GuardedChatResult> {
  const timeoutMs = o.timeoutMs ?? 25000
  const maxRetries = o.maxRetries ?? 2
  const start = Date.now()
  await acquire()
  try {
    const messages: any[] = []
    if (o.system) messages.push({ role: 'system', content: o.system })
    const userContent: any = o.imageUrl
      ? [{ type: 'text', text: o.user }, { type: 'image_url', image_url: { url: o.imageUrl } }]
      : o.user
    messages.push({ role: 'user', content: userContent })

    const body: any = {
      model: o.model,
      temperature: o.temperature ?? 0.7,
      messages,
    }
    if (o.responseFormat) body.response_format = o.responseFormat
    if (o.maxTokens) body.max_tokens = o.maxTokens

    let attempt = 0
    let lastErr = ''
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let resp: Response | null = null
      try {
        resp = await fetch(`${o.base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.key}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } catch (e: any) {
        clearTimeout(timer)
        lastErr = e?.name === 'AbortError' ? `timeout>${timeoutMs}ms` : (e?.message ?? String(e))
        if (attempt < maxRetries) {
          attempt++
          await sleep(backoff(attempt))
          continue
        }
        await log(o, start, false, lastErr, resp?.status)
        return { ok: false, data: null, httpStatus: resp?.status, error: lastErr, latencyMs: Date.now() - start }
      }
      clearTimeout(timer)
      if (resp.ok) {
        const json = await resp.json().catch(() => null)
        await log(o, start, !!json?.choices?.[0], null, resp.status, json?.usage)
        return { ok: true, data: json, httpStatus: resp.status, latencyMs: Date.now() - start }
      }
      const status = resp.status
      const text = await resp.text().catch(() => '')
      // 429 限流 / 5xx 服务端错误 → 退避重试
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        lastErr = `http ${status}`
        attempt++
        await sleep(backoff(attempt))
        continue
      }
      await log(o, start, false, `http ${status}`, status)
      return { ok: false, data: null, httpStatus: status, error: text.slice(0, 200), latencyMs: Date.now() - start }
    }
  } finally {
    release()
  }
}

function backoff(attempt: number): number {
  return Math.min(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200), 4000)
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function log(
  o: GuardedChatOpts,
  start: number,
  success: boolean,
  errorMessage: string | null,
  httpStatus?: number,
  usage?: any,
) {
  try {
    await logLlmCall({
      functionName: o.functionName,
      module: o.module,
      model: o.model,
      usage: usage ?? null,
      latencyMs: Date.now() - start,
      success,
      errorMessage,
    })
  } catch {
    /* 日志失败不影响主流程 */
  }
}
