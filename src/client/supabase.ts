// @ts-nocheck

import { createClient } from '@supabase/supabase-js'
import Taro, { showToast } from '@tarojs/taro'
import { mockSupabase } from './supabase.mock'

const isLocalDev = process.env.TARO_APP_LOCAL_DEV === 'true'

console.log('[supabase.ts] TARO_APP_LOCAL_DEV:', process.env.TARO_APP_LOCAL_DEV, '| isLocalDev:', isLocalDev)
console.log('[supabase.ts] supabaseUrl:', process.env.TARO_APP_SUPABASE_URL)

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
    timeout: 10000, // 10秒超时，防止请求永久挂起
  })

  if (res.statusCode > 300 && res.data?.code === 'SupabaseNotReady' && !noticed) {
    const tip = res.data.message || res.data.msg || '服务端报错'
    noticed = true
    showToast({ title: tip, icon: 'error', duration: 5000 })
  }

  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => res.data,
    text: async () => JSON.stringify(res.data),
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

export const supabase = isLocalDev ? mockSupabase : realSupabase
