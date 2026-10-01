import { createClient } from '@supabase/supabase-js'
import { getAppConfig } from './appConfig'

// 端点来源：运行时注入(window.__APP_CONFIG__) 优先，构建期 VITE_ 兜底。
// 详见 src/lib/appConfig.ts —— 后端迁移到自托管/反代只需改部署参数，无需重建。
const { supabaseUrl: url, supabaseAnonKey: anonKey } = getAppConfig()

// 单一会话客户端：负责「鉴权 + 全部数据读写」。
//
// ⚠️ 安全原则：后台绝不在前端使用 service_role。
//   service_role 会绕过 RLS，一旦随前端包被打进浏览器 JS（import.meta.env.* 会被 Vite 内联），
//   任何拿到产物的人都能提取密钥、越过所有权限控制直接读写全库。
//
// 正确做法（已被现有迁移支持）：后台以「真实 admin 用户」登录，会话由本客户端持久化；
//   迁移 00081/00092/00095 已为所有后台表建立 is_admin() RLS 策略，
//   auth.uid() 对应用户 role='admin' 时自动获得全量读写权限。因此无需、也绝不能依赖 service_role。
export const supabase = createClient(url, anonKey)
export const supabaseAuth = supabase
