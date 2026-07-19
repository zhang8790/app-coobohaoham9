// 移动端环境变量（Expo 仅注入 EXPO_PUBLIC_ 前缀的变量到客户端）
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const APP_ID = 'com.laidianyouxi.app'
