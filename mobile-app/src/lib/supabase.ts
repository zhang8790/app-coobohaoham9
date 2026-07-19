// 食材食疗 / 来电有喜 —— React Native 版 Supabase 客户端
// 与小程序差异：
//  1. 小程序用 Taro.request 自定义 fetch（无全局 fetch）→ 原生 RN 直接用内置 fetch，无需 customFetch。
//  2. 小程序用 Taro.getStorageSync 持久化 token → 原生用 @react-native-async-storage/async-storage。
//  3. 生产环境建议改用 expo-secure-store / react-native-keychain 存 token（更安全），此处先用 AsyncStorage 跑通。
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_ID } from './env'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] 未配置 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY，请在 .env 中填入（值来自小程序 .env 或 Supabase 控制台）',
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: `${APP_ID}-auth-token`,
  },
})
