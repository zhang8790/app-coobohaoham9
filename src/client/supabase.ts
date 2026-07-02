// @ts-nocheck

import {createClient} from '@supabase/supabase-js'
import Taro, {showToast} from '@tarojs/taro'
import { mockSupabase } from './supabase.mock'

const isLocalDev = process.env.TARO_APP_LOCAL_DEV === 'true'

const supabaseUrl = process.env.TARO_APP_SUPABASE_URL || ''
const supabaseAnonKey = process.env.TARO_APP_SUPABASE_ANON_KEY || 'TOKEN'
const appId = process.env.TARO_APP_APP_ID || ''

let noticed = false
const customFetch: typeof fetch = async (url: string, options: RequestInit) => {
  let headers: HeadersInit = options.headers || {}
  const {method = 'GET', body} = options

  if (options.headers instanceof Map) {
    headers = Object.fromEntries(options.headers)
  }

  const res = await Taro.request({
    url,
    method: method as keyof Taro.request.Method,
    header: headers,
    data: body,
    responseType: 'text'
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
  auth: { storageKey: `${appId}-auth-token` }
})

export const supabase = isLocalDev ? mockSupabase : realSupabase
