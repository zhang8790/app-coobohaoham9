import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

// 鉴权 / 当前登录会话专用 anon 客户端：负责 signIn / getSession / getUser 等，
// 保持浏览器 session 与「提现绑定会话用户」(P0) 等依赖当前用户身份的逻辑正常。
export const supabaseAuth = createClient(url, anonKey)

// 数据查询客户端：
//  - 配置 VITE_SUPABASE_SERVICE_ROLE_KEY 时 → 走特权客户端，BYPASSRLS 读全量，
//    覆盖 00081 生产加固后「后台用 anon 直连被 RLS 拦空 → 订单/消息/公告列表空白」的问题。
//  - 未配置时 → 退化为 anon（保持原有行为，便于无 key 环境先不报错、不回归）。
// ⚠️ 安全提示：service_role 拥有绕过 RLS 的权限，仅在内部后台、且部署在受控域名下使用，
//    切勿把含该 key 的包对外公开发布；更安全的替代方案是让后台以真实 admin 会话登录
//    （signInAsAdmin 真实登录成功则 is_admin() 通过 RLS），见下文说明。
export const supabase = serviceKey
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabaseAuth
