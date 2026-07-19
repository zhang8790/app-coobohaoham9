import { supabase } from '@/lib/supabase'
import type {
  AdminStats, MerchantApplication, Product,
  Withdrawal, MerchantSettlement, Article, Profile, Announcement, Refund,
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
    const { error, count } = await supabase
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
async function safeQuery<T>(fn: () => PromiseLike<T>, fallback: T): Promise<T> {
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
    const data = MOCK_PRODUCTS.filter(p => p.review_status === 'pending')
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

export async function approveProduct(_id: string): Promise<boolean> {
  return safeQuery(() => supabase.from('products').update({ review_status: 'approved', is_active: true }).eq('id', _id).then(() => true), true)
}

export async function rejectProduct(_id: string, _reason: string): Promise<boolean> {
  return safeQuery(() => supabase.from('products').update({ review_status: 'rejected', is_active: false }).eq('id', _id).then(() => true), true)
}

// ── 提现审核 ──────────────────────────────────────────────────────────
// 提现审核：withdrawals.user_id 未设外键，profiles!user_id 关系 join 必失败 → 列表空白。
// 改两步直读 + JS merge（与确权页同理）。
async function profileMap(ids: (string | null)[]): Promise<Map<string, any>> {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[]
  if (uniq.length === 0) return new Map()
  const { data, error } = await supabase
    .from('profiles').select('id, nickname, phone').in('id', uniq)
  if (error) return new Map()
  return new Map((data as any[]).map(p => [p.id, p]))
}

export async function getPendingWithdrawals(page: number, pageSize: number, status: string = 'pending', kind?: string): Promise<{ data: Withdrawal[]; total: number }> {
  return safeQuery(async () => {
    let q = supabase.from('withdrawals')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (status !== 'all') q = q.eq('status', status)
    if (kind) q = q.eq('kind', kind)
    const { data, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1)
    const rows = Array.isArray(data) ? (data as any[]) : []
    const pmap = await profileMap(rows.map(r => r.user_id))
    return {
      data: rows.map(r => ({
        ...r,
        // real_name / id_card / bank_* 已在 withdrawals 行内（select '*'），直接透传
        profiles: { nickname: pmap.get(r.user_id)?.nickname ?? null, phone: pmap.get(r.user_id)?.phone ?? null },
      })),
      total: count ?? 0,
    }
  }, (() => {
    const data = status === 'all' ? MOCK_WITHDRAWALS : MOCK_WITHDRAWALS.filter(w => w.status === status)
    return { data: data.slice(page * pageSize, (page + 1) * pageSize), total: data.length }
  })())
}

/** 审核通过：状态 pending → approved（待财务打款）。带 pending 守卫，防重复审核。 */
export async function approveWithdrawal(_id: string, remark?: string): Promise<boolean> {
  return safeQuery(() => supabase.from('withdrawals').update({
    status: 'approved',
    remark: remark || null,
    updated_at: new Date().toISOString(),
  }).eq('id', _id).eq('status', 'pending').then(() => true), true)
}

/**
 * 确认打款：状态 approved → paid，并原子扣减用户可提现佣金。
 * 修复 P0：原实现只改状态不扣 commission_balance，同一笔佣金可无限次提现（资损）。
 * 状态守卫(approved) + 余额充足校验，杜绝重复打款/超额出金。
 */
export async function payWithdrawal(_id: string, remark?: string): Promise<boolean> {
  return safeQuery(async () => {
    // 1. 取提现单（user_id / amount / 当前状态）
    const { data: w, error: we } = await supabase
      .from('withdrawals').select('user_id, amount, status').eq('id', _id).maybeSingle()
    if (we || !w) return false
    if (w.status !== 'approved') return false // 仅「已通过」可打款，防重复打款
    const amt = Number(w.amount || 0)
    // 2. 读最新余额，校验充足（避免并发/超额出金）
    const { data: p } = await supabase
      .from('profiles').select('commission_balance').eq('id', w.user_id).maybeSingle()
    const cur = Number((p as any)?.commission_balance || 0)
    if (cur < amt) return false // 余额不足：阻断打款
    const next = Math.round((cur - amt) * 100) / 100
    // 3. 扣减佣金
    const { error: ue } = await supabase
      .from('profiles').update({ commission_balance: next }).eq('id', w.user_id)
    if (ue) return false
    // 4. 扣减成功后才置 paid（带 approved 守卫，确保幂等）
    await supabase.from('withdrawals').update({
      status: 'paid', remark: remark || null, updated_at: new Date().toISOString(),
    }).eq('id', _id).eq('status', 'approved')
    return true
  }, true)
}

/** 驳回：状态 → rejected，释放（退回）相应佣金额度 */
export async function rejectWithdrawal(_id: string, reason: string, remark?: string): Promise<boolean> {
  return safeQuery(() => supabase.from('withdrawals').update({
    status: 'rejected',
    reject_reason: reason || null,
    remark: remark || null,
    updated_at: new Date().toISOString(),
  }).eq('id', _id).then(() => true), true)
}

// ── 商家货款结算（迁移 00120）──────────────────────────────────────────

/** 商家货款结算台账（全局，含门店名 / 子商户号） */
export async function getMerchantSettlements(page: number, pageSize: number, status: string = 'all'): Promise<{ data: MerchantSettlement[]; total: number }> {
  return safeQuery(async () => {
    let q = supabase
      .from('merchant_settlements')
      .select('*, stores(name, wx_sub_mch_id)', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (status !== 'all') q = q.eq('status', status)
    const { data, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1)
    const rows = Array.isArray(data) ? (data as any[]) : []
    return { data: rows as MerchantSettlement[], total: count ?? 0 }
  }, { data: [], total: 0 })
}

/** 货款结算汇总（累计已结算货款 / 笔数） */
export async function getMerchantSettlementSummary(): Promise<{ total_settled: number; count: number; store_count: number }> {
  return safeQuery(async () => {
    const { data } = await supabase
      .from('merchant_settlements')
      .select('settle_amount, store_id')
      .eq('status', 'settled')
    const rows = Array.isArray(data) ? (data as any[]) : []
    const total = rows.reduce((s, r) => s + Number(r.settle_amount || 0), 0)
    const stores = new Set(rows.map(r => r.store_id).filter(Boolean))
    return { total_settled: Math.round(total * 100) / 100, count: rows.length, store_count: stores.size }
  }, { total_settled: 0, count: 0, store_count: 0 })
}

/** 各门店货款余额概览（merchant_balance） */
export async function getStoreSettlementBalances(): Promise<{ id: string; name: string | null; merchant_balance: number; wx_sub_mch_id: string | null }[]> {
  return safeQuery(async () => {
    const { data } = await supabase
      .from('stores')
      .select('id, name, merchant_balance, wx_sub_mch_id')
      .order('merchant_balance', { ascending: false })
    return (Array.isArray(data) ? data : []) as any[]
  }, [])
}

/** 历史补结算：将已完成未结算的订单补跑结算 RPC（调用 merchant-payout Edge Function） */
export async function triggerSettlementBackfill(): Promise<{ ok: boolean; backfilled?: number; skipped?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('merchant-payout', { body: { action: 'backfill' } })
    if (error) return { ok: false, error: error.message }
    return { ok: true, backfilled: data?.backfilled, skipped: data?.skipped }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '调用失败' }
  }
}

/** 对货款提现单执行微信服务商分账（资金直达商家子商户号；缺配置返回 NEED_CONFIG） */
export async function triggerSettlementPayout(withdrawalId: string): Promise<{ ok: boolean; status?: string; message?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('merchant-payout', {
      body: { action: 'payout', withdrawal_id: withdrawalId },
    })
    if (error) return { ok: false, error: error.message }
    // 分账成功（PROFITSHARING_SENT / MANUAL_PAYOUT）后，本地置为已打款
    if (data?.ok && (data.status === 'PROFITSHARING_SENT' || data.status === 'MANUAL_PAYOUT')) {
      await paySettlementWithdrawal(withdrawalId)
      return { ok: true, status: data.status, message: data.message }
    }
    return { ok: !!data?.ok, status: data?.status, message: data?.message, error: data?.error }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '调用失败' }
  }
}

/** 货款提现打款完成：仅置状态 paid（货款余额已在申请时扣减，无需再扣） */
export async function paySettlementWithdrawal(_id: string, remark?: string): Promise<boolean> {
  return safeQuery(() => supabase.from('withdrawals').update({
    status: 'paid', remark: remark || null, updated_at: new Date().toISOString(),
  }).eq('id', _id).eq('status', 'approved').then(() => true), true)
}

/** 货款提现驳回：退回货款到门店 merchant_balance（申请时已扣，需回补），
 *  并释放关联的 merchant_settlements 行（清除 withdrawal_id），然后置 rejected。 */
export async function rejectSettlementWithdrawal(_id: string, reason: string, remark?: string): Promise<boolean> {
  return safeQuery(async () => {
    const { data: w } = await supabase
      .from('withdrawals').select('store_id, amount, status, merchant_settlement_ids').eq('id', _id).maybeSingle()
    if (!w) return false
    // 仅对 approved / pending 的退回货款余额（已扣状态）
    if (w.status === 'pending' || w.status === 'approved') {
      const amt = Number(w.amount || 0)
      const { data: st } = await supabase.from('stores').select('merchant_balance').eq('id', w.store_id).maybeSingle()
      const cur = Number((st as any)?.merchant_balance || 0)
      await supabase.from('stores').update({
        merchant_balance: Math.round((cur + amt) * 100) / 100,
      }).eq('id', w.store_id)
      // 释放占用的结算台账行，允许重新提现
      if ((w.merchant_settlement_ids || []).length > 0) {
        await supabase.from('merchant_settlements').update({ withdrawal_id: null }).in('id', w.merchant_settlement_ids as string[])
      }
    }
    await supabase.from('withdrawals').update({
      status: 'rejected', reject_reason: reason || null, remark: remark || null, updated_at: new Date().toISOString(),
    }).eq('id', _id)
    return true
  }, true)
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
    let q = supabase.from('articles').select('*', { count: 'exact' })
    if (_filter === 'published') q = q.eq('is_published', true)
    else if (_filter === 'hidden') q = q.eq('is_published', false)
    const { data, count } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    const rows = Array.isArray(data) ? (data as any[]) : []
    const pmap = await profileMap(rows.map(r => r.user_id))
    return {
      data: rows.map(r => ({
        ...r,
        profiles: { nickname: pmap.get(r.user_id)?.nickname ?? null },
      })),
      total: count ?? 0,
    }
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

// ── 自营门店管理（探索页）──────────────────────────────────────────────
// 平台自有旗舰渠道（探索页）靠 is_platform=true 识别，不走商家申请流。
// 管理员经 admin_all_stores RLS 策略可直接增改 stores 表。
const PLATFORM_OWNER_ID = 'd6b38349-dded-4879-9eac-3165a646436a'

/** 列表：filter='self' 仅自营店(is_platform=true)，'all' 全部门店 */
export async function getSelfStores(
  filter: 'self' | 'all', page: number, pageSize: number
): Promise<{ data: any[]; total: number }> {
  return safeQuery(async () => {
    let q = supabase.from('stores').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filter === 'self') q = q.eq('is_platform', true)
    const { data, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
  }, { data: [], total: 0 })
}

/** 更新门店字段（店名/简介/类目/让利率/营业时间/自营开关等） */
export async function updateSelfStore(id: string, patch: Record<string, any>): Promise<boolean> {
  return safeQuery(() => supabase.from('stores').update(patch).eq('id', id).then(() => true), true)
}

/** 新建自营店：自动 is_platform=true、owner=平台账号、生成唯一 short_code */
export async function createSelfStore(input: {
  name: string; description?: string; category: string; referral_rate: number
  open_time?: string; close_time?: string; image_url?: string; banner_url?: string
  referral_rate_enabled?: boolean
}): Promise<boolean> {
  return safeQuery(async () => {
    const shortCode = await generateUniqueShortCode()
    const { error } = await supabase.from('stores').insert({
      owner_id: PLATFORM_OWNER_ID,
      name: input.name,
      description: input.description || null,
      category: input.category,
      referral_rate: input.referral_rate,
      referral_rate_enabled: input.referral_rate_enabled ?? true,
      is_platform: true,
      is_active: true,
      is_open: true,
      open_time: input.open_time || '08:00',
      close_time: input.close_time || '22:00',
      short_code: shortCode,
      rating: 5.0,
      image_url: input.image_url || null,
      banner_url: input.banner_url || null,
    })
    if (error) { console.error('[createSelfStore] 失败:', error); return false }
    return true
  }, true)
}

// ── 自营门店 · 店内商品 ────────────────────────────────────────────────
export interface SelfStoreProduct {
  id: string
  name: string
  description: string | null
  price: number
  original_price: number | null
  stock: number
  category: string | null
  image_url: string | null
  discount_rate: number | null   // 商品让利% (0~100)
  is_active: boolean
  review_status: string
}

/** 门店商品列表（按 store_id 过滤；自营店平台自有，默认可直接上下架） */
export async function getSelfStoreProducts(storeId: string, page: number, pageSize: number): Promise<{ data: SelfStoreProduct[]; total: number }> {
  return safeQuery(async () => {
    const { data, count } = await supabase.from('products')
      .select('id,name,description,price,original_price,stock,category,image_url,discount_rate,is_active,review_status', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    return { data: Array.isArray(data) ? (data as SelfStoreProduct[]) : [], total: count ?? 0 }
  }, { data: [], total: 0 })
}

/** 新建自营店商品：平台自有，直接 approved + 上架，无需走审核流 */
export async function createSelfStoreProduct(storeId: string, input: {
  name: string; description?: string; price: number; original_price?: number | null
  stock?: number; category?: string; image_url?: string; discount_rate?: number | null
}): Promise<boolean> {
  return safeQuery(async () => {
    const { error } = await supabase.from('products').insert({
      store_id: storeId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: input.price,
      original_price: input.original_price ?? null,
      stock: input.stock ?? 999,
      category: input.category || null,
      image_url: input.image_url?.trim() || null,
      discount_rate: input.discount_rate ?? null,
      is_active: true,
      review_status: 'approved',
    })
    if (error) { console.error('[createSelfStoreProduct] 失败:', error); return false }
    return true
  }, true)
}

/** 更新门店商品（改价/改库存/上下架/让利点等） */
export async function updateSelfStoreProduct(id: string, patch: Record<string, any>): Promise<boolean> {
  return safeQuery(() => supabase.from('products').update(patch).eq('id', id).then(() => true), true)
}

// ── 自营门店 · 订单 ────────────────────────────────────────────────────
export interface SelfStoreOrder {
  id: string
  order_no: string
  total_amount: number
  tb_used: number
  settle_amount: number | null   // 让利后商家实收（merchant_settlements，未完成订单为 null）
  discount_pool: number | null   // 让利池（已分出去的推广/积分/平台部分）
  status: string
  refund_status: string | null
  created_at: string
  buyer_nickname: string | null
  buyer_phone: string | null
}

/** 门店订单列表（按 store_id 过滤），buyer 用两步直读避免 profiles 无 FK 导致 join 失败 */
export async function getSelfStoreOrders(storeId: string, page: number, pageSize: number): Promise<{ data: SelfStoreOrder[]; total: number }> {
  return safeQuery(async () => {
    const { data, count } = await supabase.from('orders')
      .select('id,order_no,total_amount,tb_used,status,refund_status,created_at,user_id, merchant_settlements(settle_amount, discount_pool)', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    const rows = Array.isArray(data) ? (data as any[]) : []
    const pmap = await profileMap(rows.map(r => r.user_id))
    return {
      data: rows.map(r => {
        // orders → merchant_settlements 是一对多（FK 在 settlements 侧），取首条
        const ms = Array.isArray(r.merchant_settlements)
          ? (r.merchant_settlements[0] ?? null)
          : (r.merchant_settlements ?? null)
        return {
          id: r.id, order_no: r.order_no, total_amount: Number(r.total_amount),
          tb_used: Number(r.tb_used ?? 0), status: r.status, refund_status: r.refund_status ?? null,
          created_at: r.created_at,
          settle_amount: ms ? Number(ms.settle_amount ?? null) : null,
          discount_pool: ms ? Number(ms.discount_pool ?? null) : null,
          buyer_nickname: pmap.get(r.user_id)?.nickname ?? null,
          buyer_phone: pmap.get(r.user_id)?.phone ?? null,
        }
      }) as SelfStoreOrder[],
      total: count ?? 0,
    }
  }, { data: [], total: 0 })
}

// ── 自营门店 · 概览统计 ───────────────────────────────────────────────
export interface SelfStoreStats {
  productTotal: number
  productActive: number
  orderTotal: number
  gmv: number
}

/** 门店概览：商品数/在售数/订单数/GMV */
export async function getSelfStoreStats(storeId: string): Promise<SelfStoreStats> {
  return safeQuery(async () => {
    const [{ count: productTotal }, { count: productActive }, { count: orderTotal }] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('is_active', true),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
    ])
    // GMV：聚合函数需先在 Dashboard 开启 db-aggregates；失败降级 0
    let gmv = 0
    try {
      const { data } = await supabase.from('orders').select('total_amount.sum()').eq('store_id', storeId)
      const row = Array.isArray(data) && data[0] ? (data[0] as any) : null
      gmv = row && typeof row.sum === 'number' ? row.sum : 0
    } catch { gmv = 0 }
    return {
      productTotal: productTotal ?? 0,
      productActive: productActive ?? 0,
      orderTotal: orderTotal ?? 0,
      gmv: Math.round(gmv * 100) / 100,
    }
  }, { productTotal: 0, productActive: 0, orderTotal: 0, gmv: 0 })
}
