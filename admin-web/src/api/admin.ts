import { supabase } from '@/lib/supabase'
import type {
  AdminStats, MerchantApplication, Product,
  Withdrawal, Article, Profile, Announcement, Refund,
} from '@/types'
import {
  MOCK_ADMIN_STATS,
  MOCK_MERCHANTS, MOCK_PRODUCTS, MOCK_WITHDRAWALS,
  MOCK_ARTICLES, MOCK_USERS, MOCK_ANNOUNCEMENTS, MOCK_REFUNDS,
} from '@/mock/data'

// =========== 模式控制 ===========
// 可通过环境变量控制是否使用 mock 数据
// 在 .env.local 中设置 VITE_USE_MOCK=false 来禁用 mock
// 注意：当前项目 RLS 已关闭，应直接使用真实 API
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// =========== 后端连接检测 ===========
export async function testConnection(): Promise<{ ok: boolean; message: string; details?: any }> {
  try {
    // 测试 1: 检查 Supabase URL 是否可达
    const url = import.meta.env.VITE_SUPABASE_URL
    if (!url) return { ok: false, message: 'VITE_SUPABASE_URL 未配置' }

    // 测试 2: 尝试查询（会受 RLS 影响）
    const { data, error, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .limit(0)

    if (error) {
      // RLS 阻塞或表不存在
      if (error.message?.includes('permission denied') || error.code === '42501') {
        return {
          ok: false,
          message: 'RLS 阻止访问（需要禁用 RLS 或使用 service role key）',
          details: { error: error.message, code: error.code }
        }
      }
      return {
        ok: false,
        message: `API 调用失败: ${error.message}`,
        details: { error: error.message, code: error.code, hint: error.hint }
      }
    }

    return {
      ok: true,
      message: `连接成功！可访问数据（count=${count}）`,
      details: { count }
    }
  } catch (e: any) {
    return {
      ok: false,
      message: `连接异常: ${e?.message || e}`,
      details: e
    }
  }
}

// =========== 通用：带降级的查询 ===========
async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (USE_MOCK) {
    // mock 模式：API 失败时返回 mock 数据
    try {
      const result = await fn()
      return result
    } catch (e) {
      console.warn('[API] 调用失败，使用 mock 数据:', e)
      return fallback
    }
  } else {
    // 真实模式：直接调用，失败时报错
    try {
      return await fn()
    } catch (e: any) {
      console.error('[API] 调用失败:', e)
      throw e
    }
  }
}

// ── 仪表盘统计 ─────────────────────────────────────────────────────────
export async function getAdminStats(): Promise<AdminStats> {
  return safeQuery(async () => {
    const [
      { count: merchants },
      { count: products },
      { count: withdrawals },
      { count: articles },
      { count: users },
      { count: orders },
    ] = await Promise.all([
      supabase.from('merchant_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('articles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
    ])
    return { merchants: merchants ?? 0, products: products ?? 0, withdrawals: withdrawals ?? 0, articles: articles ?? 0, users: users ?? 0, orders: orders ?? 0 }
  }, MOCK_ADMIN_STATS)
}

export async function getRecentMerchants(limit = 5): Promise<MerchantApplication[]> {
  return safeQuery(
    async () => {
      const { data } = await supabase.from('merchant_applications').select('*')
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(limit)
      return Array.isArray(data) ? data : []
    },
    MOCK_MERCHANTS.filter(m => m.status === 'pending').slice(0, limit)
  )
}

// ── 商家审核 ───────────────────────────────────────────────────────────
export async function getMerchantApplications(
  status: string, page: number, pageSize: number
): Promise<{ data: MerchantApplication[]; total: number }> {
  return safeQuery(async () => {
    let q = supabase.from('merchant_applications').select('*', { count: 'exact' })
    if (status !== 'all') q = q.eq('status', status)
    const { data, count } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, (() => {
    let data = [...MOCK_MERCHANTS]
    if (status !== 'all') data = data.filter(m => m.status === status)
    const total = data.length
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total }
  })())
}

// ── 生成唯一 short_code ─────────────────────────────────────────────────
async function generateUniqueShortCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const maxRetries = 10
  
  for (let i = 0; i < maxRetries; i++) {
    // 生成格式：LD + 6位随机字母数字
    const shortCode = 'LD' + Array.from({ length: 6 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('')
    
    // 检查是否已存在
    const { data } = await supabase
      .from('stores')
      .select('id')
      .eq('short_code', shortCode)
      .maybeSingle()
    
    if (!data) return shortCode  // 不存在，返回这个码
  }
  
  // 如果重试多次仍冲突，使用时间戳方案
  return `LD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function approveApplication(id: string): Promise<boolean> {
  return safeQuery(
    async () => {
      // 1. 获取申请信息
      const { data: app } = await supabase
        .from('merchant_applications')
        .select('user_id, store_name, contact_name, contact_phone, business_type, description')
        .eq('id', id)
        .maybeSingle()
      
      if (!app) return false
      
      // 2. 生成唯一 short_code
      const shortCode = await generateUniqueShortCode()
      
      // 3. 更新申请状态
      await supabase
        .from('merchant_applications')
        .update({ status: 'approved' })
        .eq('id', id)
      
      // 4. 更新用户状态
      await supabase
        .from('profiles')
        .update({ merchant_status: 'approved' })
        .eq('id', app.user_id)
      
      // 5. 创建门店记录（包含 short_code）
      const { error: storeError } = await supabase
        .from('stores')
        .insert({
          owner_id: app.user_id,
          name: app.store_name,
          short_code: shortCode,  // ← 新增：唯一短码
          description: app.description || null,
          phone: app.contact_phone || null,
          category: app.business_type || '其他',
          is_active: true,
          rating: 0,
        })
      
      if (storeError) {
        console.error('[approveApplication] 创建门店失败:', storeError)
        return false
      }
      
      console.log(`[approveApplication] 门店创建成功，short_code: ${shortCode}`)
      return true
    },
    true // mock 模式直接返回成功
  )
}

export async function rejectApplication(id: string, _reason: string): Promise<boolean> {
  return safeQuery(
    async () => {
      const { data: app } = await supabase.from('merchant_applications').select('user_id').eq('id', id).maybeSingle()
      if (!app) return false
      await supabase.from('merchant_applications').update({ status: 'rejected', reject_reason: _reason }).eq('id', id)
      await supabase.from('profiles').update({ merchant_status: 'rejected' }).eq('id', app.user_id)
      return true
    },
    true
  )
}

// ── 商品审核 ───────────────────────────────────────────────────────────
export async function getPendingProducts(page: number, pageSize: number): Promise<{ data: Product[]; total: number }> {
  return safeQuery(async () => {
    const { data, count } = await supabase.from('products')
      .select('*, stores!store_id(name)', { count: 'exact' })
      .eq('review_status', 'pending')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, (() => {
    const data = MOCK_PRODUCTS.filter(p => p.status === 'pending')
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

export async function approveProduct(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('products').update({ review_status: 'approved' }).eq('id', _id).then(() => true), true)
}

export async function rejectProduct(_id: string, _reason: string): Promise<boolean> {
  return safeQuery(() => supabase.from('products').update({ review_status: 'rejected' }).eq('id', _id).then(() => true), true)
}

// ── 提现审核 ──────────────────────────────────────────────────────────
export async function getPendingWithdrawals(page: number, pageSize: number): Promise<{ data: Withdrawal[]; total: number }> {
  return safeQuery(async () => {
    const { data, count } = await supabase.from('withdrawals')
      .select('*, profiles!user_id(nickname, phone)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, (() => {
    const data = MOCK_WITHDRAWALS.filter(w => w.status === 'pending')
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

export async function approveWithdrawal(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('withdrawals').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', _id).then(() => true), true)
}

export async function rejectWithdrawal(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('withdrawals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', _id).then(() => true), true)
}

// ── 退款管理 ──────────────────────────────────────────────────────────
export async function getRefunds(status: string, page: number, pageSize: number): Promise<{ data: Refund[]; total: number }> {
  return safeQuery(async () => {
    let q = supabase.from('refunds').select('*', { count: 'exact' })
    if (status !== 'all') q = q.eq('status', status)
    const { data, count } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, (() => {
    let data = [...MOCK_REFUNDS]
    if (status !== 'all') data = data.filter(r => r.status === status)
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

export async function approveRefund(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('refunds').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', _id).then(() => true), true)
}

export async function rejectRefund(_id: string, _reason: string): Promise<boolean> {
  return safeQuery(() => supabase.from('refunds').update({ status: 'closed' }).eq('id', _id).then(() => true), true)
}

// ── UGC 内容管理 ─────────────────────────────────────────────────────
export async function getArticles(
  _filter: 'all' | 'published' | 'hidden', page: number, pageSize: number
): Promise<{ data: Article[]; total: number }> {
  return safeQuery(async () => {
    let q = supabase.from('articles').select('*, profiles!user_id(nickname)', { count: 'exact' })
    if (_filter === 'published') q = q.eq('is_published', true)
    else if (_filter === 'hidden') q = q.eq('is_published', false)
    const { data, count } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, (() => {
    let data = [...MOCK_ARTICLES]
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

export async function toggleArticlePublish(_id: string, _publish: boolean): Promise<boolean> {
  return safeQuery(() => supabase.from('articles').update({ is_published: _publish }).eq('id', _id).then(() => true), true)
}

export async function deleteArticle(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('articles').delete().eq('id', _id).then(() => true), true)
}

// ── 用户管理 ──────────────────────────────────────────────────────────
export async function getUsers(page: number, pageSize: number): Promise<{ data: Profile[]; total: number }> {
  return safeQuery(async () => {
    const { data, count } = await supabase.from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, (() => {
    const data = [...MOCK_USERS]
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

export async function updateUserRole(_id: string, _role: 'user' | 'admin'): Promise<boolean> {
  return safeQuery(() => supabase.from('profiles').update({ role: _role }).eq('id', _id).then(() => true), true)
}

// ── 公告管理 ──────────────────────────────────────────────────────────
export async function getAnnouncements(): Promise<Announcement[]> {
  return safeQuery(async () => {
    const { data } = await supabase.from('announcements').select('*').order('sort_order')
    return Array.isArray(data) ? data : []
  }, MOCK_ANNOUNCEMENTS)
}

export async function createAnnouncement(_content: string, _sortOrder = 99): Promise<boolean> {
  return safeQuery(() => supabase.from('announcements').insert({ content: _content, is_active: true, sort_order: _sortOrder }).then(() => true), true)
}

export async function updateAnnouncement(_id: string, _updates: Partial<Announcement>): Promise<boolean> {
  return safeQuery(() => supabase.from('announcements').update(_updates).eq('id', _id).then(() => true), true)
}

export async function deleteAnnouncement(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('announcements').delete().eq('id', _id).then(() => true), true)
}
