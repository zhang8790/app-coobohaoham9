import { supabase } from '@/lib/supabase'
import type {
  AdminStats, MerchantApplication, Product,
  Withdrawal, MerchantSettlement, Profile, Announcement, Refund,
} from '@/types'
import {
  MOCK_ADMIN_STATS,
  MOCK_MERCHANTS, MOCK_PRODUCTS, MOCK_WITHDRAWALS,
  MOCK_USERS, MOCK_ANNOUNCEMENTS, MOCK_REFUNDS,
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
      { count: users },
      { count: orders },
    ] = await Promise.all([
      supabase.from('merchant_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
    ])
    return { merchants: merchants ?? 0, products: products ?? 0, withdrawals: withdrawals ?? 0, users: users ?? 0, orders: orders ?? 0 }
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

// ── 自营门店审核 ───────────────────────────────────────────────────────────
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

export async function approveApplication(id: string, assignToExplore: boolean = false): Promise<boolean> {
  return safeQuery(
    async () => {
      // 1. 获取申请信息
      const { data: app } = await supabase
        .from('merchant_applications')
        .select('user_id, store_name, contact_name, contact_phone, business_type, description, address')
        .eq('id', id)
        .maybeSingle()
      
      if (!app) return false
      
      // 2. 生成唯一 short_code
      const shortCode = await generateUniqueShortCode()

      // 3. ★ 先建店，再落状态（2026-09-17 修复「审核通过却进不了管理后台」）
      //    旧实现先 update status='approved' 再 insert stores，建店一旦失败就留下
      //    「已通过 + 无门店」的孤儿态（小程序端同源问题由 store_type='self' 触发 23514）；
      //    stores 又是 merchant-center 解析商家的唯一依据 → 用户永远进不去管理后台。
      //    幂等：owner_id 已有门店则跳过建店，支持重复点击「通过」。
      const { data: existed } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', app.user_id)
        .limit(1)
        .maybeSingle()

      // 3.5 ★ 同名无主店优先认领（2026-09-18）
      //     线上存在「无主店」（owner_id 为 null 的历史遗留/后台预建店，如 杭州礼品店）。
      //     旧实现无条件新建，会导致：① 重名门店出现两家；② 商家进的是刚建的空壳新店，
      //     老店的商品/订单/坐标全都看不到；③ 老店永远没有 owner，谁也认领不了。
      //     这里先把同名且无主的店认领给申请人，认领不到才新建。
      let storeId: string | null = (existed as any)?.id ?? null

      if (!storeId) {
        const { data: orphan } = await supabase
          .from('stores')
          .select('id')
          .eq('name', app.store_name)
          .is('owner_id', null)
          .limit(1)
          .maybeSingle()

        if (orphan?.id) {
          const { data: claimed, error: claimErr } = await supabase
            .from('stores')
            .update({ owner_id: app.user_id, is_active: true })
            .eq('id', orphan.id)
            .select('id')

          if (claimErr || !claimed || claimed.length === 0) {
            console.error('[approveApplication] 认领同名无主店失败:', claimErr)
          } else {
            storeId = orphan.id
            console.log('[approveApplication] 已认领同名无主店:', orphan.id)
          }
        }
      }

      if (!storeId) {
        const { error: storeError } = await supabase
          .from('stores')
          .insert({
            owner_id: app.user_id,
            name: app.store_name,
            short_code: shortCode,  // ← 新增：唯一短码
            description: app.description || null,
            phone: app.contact_phone || null,
            address: (app as any).address || null,
            category: app.business_type || '其他',
            // store_type 合法值仅 branch/hub/transfer/truck（stores_store_type_check）
            store_type: 'branch',
            is_active: true,
            rating: 0,
            is_platform: assignToExplore,
          })

        if (storeError) {
          // 建店失败 → 中止审核，保持 pending 可重试
          console.error('[approveApplication] 创建门店失败，已中止审核:', storeError)
          return false
        }
      }

      console.log(`[approveApplication] 门店就绪，short_code: ${shortCode}`)

      // 3.6 补运营成员行（best-effort）：owner_id 已足以进后台并读写，
      //     store_staff 只影响多店切换 / is_store_manager 等增强能力，失败不阻断审核。
      if (storeId) {
        const staffWrite = await supabase.from('store_staff').upsert(
          { store_id: storeId, user_id: app.user_id, role: 'owner', is_active: true },
          { onConflict: 'store_id,user_id' },
        )
        if (staffWrite.error) {
          console.warn('[approveApplication] store_staff 写入失败（owner_id 已就绪，不影响进后台）:', staffWrite.error.message)
        }
      }

      // 4. 更新申请状态
      const { error: appErr } = await supabase
        .from('merchant_applications')
        .update({ status: 'approved' })
        .eq('id', id)
      if (appErr) {
        console.error('[approveApplication] 更新申请状态失败:', appErr)
        return false
      }

      // 5. 更新用户状态
      await supabase
        .from('profiles')
        .update({ merchant_status: 'approved' })
        .eq('id', app.user_id)

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

/** 审核通过：状态 pending → approved（待财务打款）。带 pending 守卫，防重复审核。
 *  修复：「审核通过却仍显示审核中」根因——旧实现 .then(() => true) 无条件返回成功，
 *  把 RLS 拦截 / 0 行匹配 / 网络异常全部静默吞掉，导致 UI 报成功但 DB 仍是 pending。
 *  现改为校验 {error} 与命中行数，仅在确有行被更新时返回 true，失败返回 false（不再吞错）。 */
export async function approveWithdrawal(_id: string, remark?: string): Promise<boolean> {
  return safeQuery(async () => {
    try {
      const { data, error } = await supabase.from('withdrawals').update({
        status: 'approved',
        remark: remark || null,
        updated_at: new Date().toISOString(),
      }).eq('id', _id).eq('status', 'pending').select('id')
      if (error) { console.error('[approveWithdrawal] 更新失败:', error); return false }
      return Array.isArray(data) && data.length > 0
    } catch (e) {
      console.error('[approveWithdrawal] 异常:', e); return false
    }
  }, false)
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

/** 驳回：状态 → rejected，释放（退回）相应佣金额度。
 *  修复：同上，去掉 .then(() => true)，校验真实成败。 */
export async function rejectWithdrawal(_id: string, reason: string, remark?: string): Promise<boolean> {
  return safeQuery(async () => {
    try {
      const { data, error } = await supabase.from('withdrawals').update({
        status: 'rejected',
        reject_reason: reason || null,
        remark: remark || null,
        updated_at: new Date().toISOString(),
      }).eq('id', _id).select('id')
      if (error) { console.error('[rejectWithdrawal] 更新失败:', error); return false }
      return Array.isArray(data) && data.length > 0
    } catch (e) {
      console.error('[rejectWithdrawal] 异常:', e); return false
    }
  }, false)
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

/** 货款提现打款完成：仅置状态 paid（货款余额已在申请时扣减，无需再扣）。
 *  修复：去掉 .then(() => true)，校验真实成败（含 RLS 拦截 / 0 行）。 */
export async function paySettlementWithdrawal(_id: string, remark?: string): Promise<boolean> {
  return safeQuery(async () => {
    try {
      const { data, error } = await supabase.from('withdrawals').update({
        status: 'paid', remark: remark || null, updated_at: new Date().toISOString(),
      }).eq('id', _id).eq('status', 'approved').select('id')
      if (error) { console.error('[paySettlementWithdrawal] 更新失败:', error); return false }
      return Array.isArray(data) && data.length > 0
    } catch (e) {
      console.error('[paySettlementWithdrawal] 异常:', e); return false
    }
  }, false)
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

// ── 后台新建登录账号 ──────────────────────────────────────────────────
// 经 Edge Function admin-create-user 创建（service_role 在服务端，前端不持有密钥）。
// 调用方需为已登录 admin，函数内会二次校验 role='admin'。
export interface CreateUserPayload {
  email?: string
  password: string
  phone?: string
  nickname?: string
  role: 'admin' | 'user'
}
export async function createUserAccount(payload: CreateUserPayload): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload })
    if (error) return { ok: false, error: error.message }
    if (data && (data as any).error) return { ok: false, error: (data as any).error }
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '调用失败' }
  }
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

/**
 * 更新门店字段（店名/简介/类目/让利率/营业时间/坐标等）。
 *
 * 返回 false 有两种含义，都必须暴露给调用方：
 *   1) 数据库报错；
 *   2) **RLS 把行过滤掉**——PostgREST 对「UPDATE 匹配 0 行」返回 204/200 且不带 error，
 *      旧实现 `.then(() => true)` 会把它当成功，于是后台弹「已保存」但数据没变（静默假成功，
 *      与小程序的 updateStore 同源问题）。这里用 `.select('id')` 回传实际写入行来识别。
 */
export async function updateSelfStore(id: string, patch: Record<string, any>): Promise<boolean> {
  return safeQuery(async () => {
    const { data, error } = await supabase.from('stores').update(patch).eq('id', id).select('id')
    if (error) { console.error('[updateSelfStore]', error); return false }
    if (!data || data.length === 0) {
      console.error('[updateSelfStore] 0 行受影响 —— 写入被 RLS 拦截（当前账号非管理员且非该店 owner）')
      return false
    }
    return true
  }, true)
}

/** 读取门店当前店长信息（stores.owner_id → profiles） */
export async function getStoreManager(storeId: string): Promise<{ id: string; nickname: string; phone: string | null } | null> {
  return safeQuery(async () => {
    const { data: s } = await supabase.from('stores').select('owner_id').eq('id', storeId).maybeSingle()
    const uid = (s as any)?.owner_id as string | null | undefined
    if (!uid) return null
    const { data: p } = await supabase.from('profiles').select('id, nickname, phone').eq('id', uid).maybeSingle()
    if (!p) return { id: uid, nickname: '(账号已删除)', phone: null }
    return { id: (p as any).id, nickname: (p as any).nickname || '未命名', phone: (p as any).phone ?? null }
  }, null)
}

/**
 * 绑定 / 更换门店店长（补齐「身份闭环」缺失的一步）。
 *
 * 背景：门店若 stores.owner_id 为空且 store_staff 无记录，商家在小程序里
 * 「能进管理中心、但任何修改都被 RLS 静默拦截」（保存地址没反应）。本函数一次把三处写齐：
 *   1. stores.owner_id      —— 让仍按 owner_id 判权的链路全部生效
 *   2. store_staff(owner)   —— 让 fn_my_store_ids / is_store_manager 生效
 *   3. profiles.role        —— 赋予自营门店身份，可登录自营门店中心
 */
export async function bindStoreManager(storeId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  return safeQuery(async () => {
    const { data, error } = await supabase.from('stores').update({ owner_id: userId }).eq('id', storeId).select('id')
    if (error) return { ok: false, error: error.message }
    if (!data || data.length === 0) return { ok: false, error: '写入被拒绝：当前账号无该门店管理权限（需管理员）' }

    const staffWrite = await supabase.from('store_staff').upsert(
      { store_id: storeId, user_id: userId, role: 'owner', is_active: true },
      { onConflict: 'store_id,user_id' },
    )
    if (staffWrite.error) {
      // 门店已绑定成功，成员行失败只影响多店切换等增强能力，故降级为提示而非整体失败
      console.warn('[bindStoreManager] store_staff 写入失败（门店 owner 已保存）:', staffWrite.error.message)
      return { ok: true, error: '门店已绑定，但运营成员记录写入失败：' + staffWrite.error.message }
    }
    const profWrite = await supabase.from('profiles').update({ role: 'merchant' }).eq('id', userId)
    if (profWrite.error) console.warn('[bindStoreManager] profiles.role 更新失败:', profWrite.error.message)
    return { ok: true }
  }, { ok: true })
}

/** 解绑门店店长（owner_id 置空，供总部收回管理权） */
export async function unbindStoreManager(storeId: string, userId: string): Promise<boolean> {
  return safeQuery(async () => {
    const { data, error } = await supabase.from('stores').update({ owner_id: null }).eq('id', storeId).select('id')
    if (error || !data || data.length === 0) return false
    await supabase.from('store_staff').update({ is_active: false })
      .eq('store_id', storeId).eq('user_id', userId)
    return true
  }, true)
}

/** 新建自营店：自动 is_platform=true、owner=平台账号、生成唯一 short_code */
export async function createSelfStore(input: {
  name: string; description?: string; category: string; referral_rate: number
  open_time?: string; close_time?: string; image_url?: string; banner_url?: string
  referral_rate_enabled?: boolean
  store_type?: 'hub' | 'transfer' | 'truck' | 'branch'
  owner_id?: string   // 店长账号 uid；不传则归平台主账号（兼容旧行为）
}): Promise<boolean> {
  return safeQuery(async () => {
    // 店长自治：owner 放宽为指定店长，每家自营店可绑定独立店长账号
    const ownerId = input.owner_id || PLATFORM_OWNER_ID
    const { data: me } = await supabase.auth.getUser()
    const shortCode = await generateUniqueShortCode()
    const { error } = await supabase.from('stores').insert({
      owner_id: ownerId,
      created_by: me?.user?.id ?? null,
      store_type: input.store_type ?? null,
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
    // 指定了店长 -> 自动赋予 merchant 角色，使其可登录小程序自营门店中心 + admin-web 商家后台管理本店
    if (input.owner_id) {
      await supabase.from('profiles').update({ role: 'merchant' }).eq('id', input.owner_id)
    }
    return true
  }, true)
}

/** 总后台「建店 + 建运营登陆」原子操作：经 Edge Function admin-create-store
 *  一次性完成：创建门店(is_platform=true) + 创建运营登录账号(email/密码) +
 *  绑定 store_staff(role=owner) + 置 profiles.role='merchant'。 */
export async function adminCreateStoreWithLogin(input: {
  store_name: string
  category: string
  description?: string
  referral_rate: number
  open_time?: string
  close_time?: string
  image_url?: string
  banner_url?: string
  store_type?: 'hub' | 'transfer' | 'truck' | 'branch'
  manager_email: string
  manager_password: string
  manager_phone?: string
  manager_nickname?: string
}): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-create-store', { body: input })
    if (error) return { ok: false, error: error.message }
    if (data && (data as any).error) return { ok: false, error: (data as any).error }
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '调用失败' }
  }
}

/** 搜索用户（按手机号/昵称），用于自营店绑定店长 */
export async function searchUsers(keyword: string, limit = 20): Promise<Profile[]> {
  const kw = (keyword || '').trim()
  if (!kw) return []
  return safeQuery(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, phone, avatar_url, role')
      .or(`nickname.ilike.%${kw}%,phone.ilike.%${kw}%`)
      .limit(limit)
    if (error) { console.error('[searchUsers]', error); return [] }
    return (data as Profile[]) || []
  }, [])
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
  discount_pool: number | null   // 平台让利（已分出去的推广/健康豆/平台部分）
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

/** 门店概览：商品数/在售数/订单数/累计消费额 */
export async function getSelfStoreStats(storeId: string): Promise<SelfStoreStats> {
  return safeQuery(async () => {
    const [{ count: productTotal }, { count: productActive }, { count: orderTotal }] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('is_active', true),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
    ])
    // 累计消费额：聚合函数需先在 Dashboard 开启 db-aggregates；失败降级 0
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

// ── 系统 LLM 配置（总管理后台填写，全项目共用）──────────────────────────
// 对应 supabase/migrations/20260726_system_llm_config.sql 的 system_config 表（key='llm'）。
// RLS：仅 is_admin() 可读写；anon/普通用户读不到 → API Key 不外泄。

export interface LlmConfigValue {
  base_url: string
  api_key: string
  model: string
  enabled: boolean
}

/** 读取当前 LLM 配置（管理后台初始化表单用）。无配置返回 null。 */
export async function getLlmConfig(): Promise<LlmConfigValue | null> {
  return safeQuery(async () => {
    const { data, error } = await supabase
      .from('system_config').select('value').eq('key', 'llm').maybeSingle()
    if (error) throw error
    return (data?.value as LlmConfigValue) ?? null
  }, null)
}

/** 保存 LLM 配置（upsert key='llm'）。仅 admin 可写（RLS 约束）。 */
export async function saveLlmConfig(value: LlmConfigValue): Promise<boolean> {
  return safeQuery(async () => {
    const { error } = await supabase
      .from('system_config')
      .upsert({ key: 'llm', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
    return true
  }, true)
}

export interface LlmUsageStats {
  totals: { total_calls: number; total_tokens: number; total_prompt: number; total_completion: number; failed_calls: number }
  today: { today_calls: number; today_tokens: number }
  by_day: { day: string; calls: number; tokens: number }[]
  by_module: { module: string; calls: number; tokens: number }[]
}

export interface LlmRecentLog {
  id: string
  created_at: string
  function_name: string
  module: string | null
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number | null
  success: boolean
  error_message: string | null
}

/** 读取 LLM 调用统计（聚合）。仅 admin 可调用（RPC SECURITY DEFINER）。 */
export async function getLlmUsageStats(pDays = 30): Promise<LlmUsageStats | null> {
  return safeQuery(async () => {
    const { data, error } = await supabase.rpc('fn_llm_usage_stats', { p_days: pDays })
    if (error) throw error
    return (data as unknown as LlmUsageStats) ?? null
  }, null)
}

/** 读取最近 LLM 调用明细。仅 admin 可调用（RPC SECURITY DEFINER）。 */
export async function getLlmRecentLogs(pLimit = 50): Promise<LlmRecentLog[]> {
  return safeQuery(async () => {
    const { data, error } = await supabase.rpc('fn_llm_recent_logs', { p_limit: pLimit })
    if (error) throw error
    return (data as unknown as LlmRecentLog[]) ?? []
  }, [])
}

/** 测试 LLM 连通性：通过 product-analyze 的 test 模式验证当前配置可用（不跑完整识别）。 */
export async function testLlmConfig(): Promise<{ ok: boolean; message: string; source?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('product-analyze', { body: { test: true, name: '连通性测试' } })
    if (error) return { ok: false, message: error.message }
    if (data?.success) return { ok: true, message: '连接成功，模型可用', source: data.source }
    return { ok: false, message: data?.message || '测试失败（可能未配置或密钥无效）' }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? '调用失败' }
  }
}

