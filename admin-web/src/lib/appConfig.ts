// 运行时应用配置（端点注入）
//
// 设计目的：让 Supabase 端点（URL + anon key）在「部署期」可被注入，
// 而无需重新构建前端。后端从云端 supabase.co 迁移到自托管 / 反向代理时，
// 只需改部署参数（环境变量），不再改代码、不再 rebuild。
//
// 优先级：window.__APP_CONFIG__（部署脚本注入） > import.meta.env（构建期内联）。
// 因此本地开发（无注入）与历史部署（无注入）自动回退到 .env 的 VITE_ 配置，行为不变。

export interface AppConfig {
  supabaseUrl: string
  supabaseAnonKey: string
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>
  }
}

/** 读取运行时 / 构建期配置，返回合并后的端点信息 */
export function getAppConfig(): AppConfig {
  const injected =
    typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined

  return {
    supabaseUrl:
      (injected?.supabaseUrl ??
        (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
        '') as string,
    supabaseAnonKey:
      (injected?.supabaseAnonKey ??
        (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
        '') as string,
  }
}
