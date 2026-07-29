// @ts-nocheck

import { createClient } from '@supabase/supabase-js'
import Taro, { showToast } from '@tarojs/taro'
import { mockSupabase } from './supabase.mock'

const isLocalDev = process.env.TARO_APP_LOCAL_DEV === 'true'


const supabaseUrl = process.env.TARO_APP_SUPABASE_URL || ''
const supabaseAnonKey = process.env.TARO_APP_SUPABASE_ANON_KEY || 'TOKEN'
const appId = process.env.TARO_APP_APP_ID || ''

let noticed = false

/** 将 HeadersInit 统一转成普通对象（Taro.request 只认普通对象）
 *  注意：微信小程序没有全局 Headers/Map 构造器，不能用 instanceof */
function normalizeHeaders(h: any): Record<string, string> {
  // 微信小程序环境下 headers 通常是普通对象或数组
  if (!h) return {}
  if (Array.isArray(h)) return Object.fromEntries(h)
  if (typeof h === 'object' && !(h instanceof String) && !(h instanceof Number) && !(h instanceof Boolean)) {
    // 普通对象或类对象（含 forEach 的），统一转
    if (typeof h.forEach === 'function') {
      const out: Record<string, string> = {}
      h.forEach((v: any, k: any) => { out[String(k)] = String(v) })
      return out
    }
    return { ...h }
  }
  return {}
}

const customFetch: typeof fetch = async (url: string, options: RequestInit) => {
  const headers = normalizeHeaders(options.headers || {})
  const { method = 'GET', body } = options

  const res = await Taro.request({
    url,
    method: method as keyof Taro.request.Method,
    header: headers,
    data: body,
    responseType: 'text',
    timeout: 30000, // Edge Function（含百度 OCR）可能较慢，放宽到 30s
  })

  if (res.statusCode > 300 && res.data?.code === 'SupabaseNotReady' && !noticed) {
    const tip = res.data.message || res.data.msg || '服务端报错'
    noticed = true
    showToast({ title: tip, icon: 'error', duration: 5000 })
  }

  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => {
      const d = res.data
      if (typeof d === 'string') {
        try { return JSON.parse(d) } catch { return d }
      }
      return d
    },
    text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)),
    data: res.data,
    headers: {
      get: (key: string) => {
        if (!res.header || !key) return null
        const lowerKey = key.toLowerCase()
        for (const [k, v] of Object.entries(res.header)) {
          if (k.toLowerCase() === lowerKey) return v as string
        }
        return null
      }
    }
  } as unknown as Response
}

// 微信小程序无全局 fetch：polyfill 成 Taro.request 封装版，使 supabase-js 的
// FunctionsClient 能正常发请求（修复所有 functions.invoke 调用）。
;(globalThis as any).fetch = customFetch

const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: customFetch },
  auth: {
    storageKey: `${appId}-auth-token`,
    storage: {
      getItem: (key: string) => {
        try { return Taro.getStorageSync(key) ?? null } catch { return null }
      },
      setItem: (key: string, value: string) => {
        try { Taro.setStorageSync(key, value) } catch {}
      },
      removeItem: (key: string) => {
        try { Taro.removeStorageSync(key) } catch {}
      },
    },
  }
})

/**
 * 直连 Edge Function，绕过 supabase.functions.invoke。
 *
 * 为什么需要它：supabase-js 的 `functions.invoke` 在真正发请求前会强制走
 *   auth.getSession() → getUser() → GET /auth/v1/user
 * 未登录时这段请求会 403 且耗时 1~2s（即"403 前戏"）。对于 verify_jwt=false 的
 * 公开函数（如 ocr-ingredient），根本不需要登录态，传 { auth: false } 即可跳过整段
 * 会话查询，彻底消除这段延迟。同时复用 customFetch（Taro.request 封装），与全局
 * polyfill 一致，各环境都能正常发请求。
 *
 * 需要登录态的函数（支付/登录等）保持默认 auth: true 即可，会自动附加 Authorization。
 */
export async function callEdgeFunction<T = any>(
  name: string,
  body?: any,
  opts: { auth?: boolean } = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  const url = `${supabaseUrl}/functions/v1/${name}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  }
  // 仅当需要登录态时附加会话 token；公开函数跳过整段 getSession 查询（省掉 403 前戏）
  if (opts.auth !== false) {
    try {
      const { data } = await realSupabase.auth.getSession()
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`
      }
    } catch {
      /* 忽略：降级为匿名调用 */
    }
  }
  const res = await customFetch(url, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json()) as any
  if (!res.ok) {
    return { data: null, error: { message: json?.error || json?.message || `HTTP ${res.status}` } }
  }
  return { data: json as T, error: null }
}

export const supabase = isLocalDev ? mockSupabase : realSupabase
