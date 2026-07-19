import { supabase } from '@/lib/supabase'

// =====================================================
// 财务数据看板 · 聚合查询层
// 设计原则：
//  1. 用 PostgREST 聚合函数（.sum()/.count()）直查，避免拉全表 + 避免未定义 RPC
//  2. 会员上线/昵称用「两步直读」解析（profiles.referrer_id 无 FK，沿用已修通范式）
//  3. 单查询失败降级为 0 / []，不阻塞整页
// =====================================================

// ── 聚合工具 ───────────────────────────────────────────────────────────
async function sumOf(table: string, col: string, filter?: { eq?: [string, any] }): Promise<number> {
  try {
    let q = supabase.from(table).select(`${col}.sum()`)
    if (filter?.eq) q = q.eq(filter.eq[0], filter.eq[1])
    const { data, error } = await q
    if (error) {
      console.error(`[sumOf ${table}.${col}] error:`, error)
      return 0
    }
    if (!data || !data.length) return 0
    const row = data[0] as any
    // PostgREST 聚合返回结构为 [ { "sum": value } ]，不是 `${col}.sum()`
    const val = row.sum
    if (val === undefined || val === null) {
      console.warn(`[sumOf ${table}.${col}] 返回结构异常:`, row)
      return 0
    }
    return Number(val)
  } catch (e) {
    console.error(`[sumOf ${table}.${col}] catch:`, e)
    return 0
  }
}

async function countOf(table: string, filter?: { eq?: [string, any]; gte?: [string, any] }): Promise<number> {
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true })
    if (filter?.eq) q = q.eq(filter.eq[0], filter.eq[1])
    if (filter?.gte) q = q.gte(filter.gte[0], filter.gte[1])
    const { count, error } = await q
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

// ── 类型 ───────────────────────────────────────────────────────────────
export interface FinanceOverview {
  membersTotal: number
  membersToday: number
  members30d: number
  activeMembers30d: number
  storesActive: number
  ordersPaid: number
  gmv: number
  concession: number
  commissionPaid: number
  platformNet: number
  goldBeans: number
  goldBeanIssued: number
  goldBeanConsumed: number
  points: number
  tbTotal: number
  cvTotal: number
  withdrawPending: number
  bannedMembers: number
}

export interface DailyPoint {
  date: string
  registrations: number
  orders: number
  gmv: number
  concession: number
}

export interface MemberRow {
  id: string
  nickname: string
  phone: string | null
  member_rank: string
  points: number
  balance: number
  tb_balance: number
  referrer_id: string | null
  referrer_nickname: string | null
  address: string | null
  created_at: string
  is_banned: boolean
}

export interface MemberEmotionClaim {
  order_no: string | null
  tb_amount: number
  cv_amount: number
  status: string
  created_at: string
}

export interface MemberDetail {
  profile: MemberRow | null
  emotionClaims: MemberEmotionClaim[]
  orderCount: number
}

// ── 看板总览 ──────────────────────────────────────────────────────────
export async function getFinanceOverview(): Promise<FinanceOverview> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const todayISO = today.toISOString()
  const d30ISO = d30

  const [
    membersTotal,
    membersToday,
    members30d,
    storesActive,
    ordersPaid,
    gmv,
    concession,
    commissionPaid,
    goldBeans,
    points,
    tbTotal,
    cvTotal,
    withdrawPending,
    bannedMembers,
  ] = await Promise.all([
    countOf('profiles'),
    countOf('profiles', { gte: ['created_at', todayISO] }),
    countOf('profiles', { gte: ['created_at', d30ISO] }),
    countOf('stores', { eq: ['is_active', true] }),
    countOf('orders'),
    sumOf('orders', 'total_amount'),
    sumOf('orders', 'tb_used_capped'),
    sumOf('commissions', 'commission_amount', { eq: ['status', 'settled'] }),
    sumOf('profiles', 'tb_balance'),
    sumOf('profiles', 'points'),
    sumOf('emotion_claims', 'tb_amount', { eq: ['status', 'active'] }),
    sumOf('profiles', 'cv_total'),
    countOf('withdrawals', { eq: ['status', 'pending'] }),
    countOf('profiles', { eq: ['is_banned', true] }),
  ])

  // 金豆流水闭环：从 tongbao_logs 累计发放 / 消耗（00076 未建时 sumOf 降级为 0，不阻塞）
  const [gbRefund, gbRecharge, gbGrant, gbSpend, gbDeduct, gbEarn, gbRefundDeduct] = await Promise.all([
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'refund_return'] }),
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'recharge'] }),
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'admin_grant'] }),
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'purchase_spend'] }),
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'admin_deduct'] }),
    // 小程序侧写入的两类流水（00096 白名单内，此前 getFinanceOverview 漏算 → 发放/消耗数值偏低）
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'purchase_earn'] }),
    sumOf('tongbao_logs', 'delta', { eq: ['type', 'refund_deduct'] }),
  ])
  const goldBeanIssued = Math.max(0, gbRefund) + Math.max(0, gbRecharge) + Math.max(0, gbGrant) + Math.max(0, gbEarn)
  const goldBeanConsumed = Math.abs(Math.min(0, gbSpend)) + Math.abs(Math.min(0, gbDeduct)) + Math.abs(Math.min(0, gbRefundDeduct))

  // 活跃会员（近30日有下单的去重用户数）
  let activeMembers30d = 0
  try {
    const { data } = await supabase
      .from('orders')
      .select('user_id')
      .gte('created_at', d30ISO)
    if (data) activeMembers30d = new Set((data as any[]).map(d => d.user_id).filter(Boolean)).size
  } catch { /* 降级 0 */ }

  return {
    membersTotal,
    membersToday,
    members30d,
    activeMembers30d,
    storesActive,
    ordersPaid,
    gmv,
    concession,
    commissionPaid,
    platformNet: Math.round((gmv - concession - commissionPaid) * 100) / 100,
    goldBeans,
    goldBeanIssued,
    goldBeanConsumed,
    points,
    tbTotal,
    cvTotal,
    withdrawPending,
    bannedMembers,
  }
}

// ── 每日趋势（近 N 日）──────────────────────────────────────────────────
export async function getDailyTrend(days = 30): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString()
  try {
    const [{ data: regs }, { data: ords }] = await Promise.all([
      supabase.from('profiles').select('created_at').gte('created_at', since),
      supabase.from('orders').select('created_at, total_amount, tb_used_capped').gte('created_at', since),
    ])
    const map = new Map<string, DailyPoint>()
    const ensure = (date: string) => {
      if (!map.has(date)) map.set(date, { date, registrations: 0, orders: 0, gmv: 0, concession: 0 })
      return map.get(date)!
    }
    for (const r of (regs as any[]) ?? []) {
      const d = (r.created_at as string).slice(0, 10)
      ensure(d).registrations += 1
    }
    for (const o of (ords as any[]) ?? []) {
      const d = (o.created_at as string).slice(0, 10)
      const p = ensure(d)
      p.orders += 1
      p.gmv += Number(o.total_amount || 0)
      p.concession += Number(o.tb_used_capped || 0)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

// ── 会员列表（含上线解析）────────────────────────────────────────────────
export async function getMembers(
  page: number,
  pageSize: number,
  keyword = '',
): Promise<{ data: MemberRow[]; total: number }> {
  try {
    let q = supabase.from('profiles').select('*', { count: 'exact' })
    if (keyword) q = q.or(`phone.ilike.%${keyword}%,nickname.ilike.%${keyword}%`)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error || !data) return { data: [], total: 0 }

    const rows = data as any[]
    const referrerIds = Array.from(new Set(rows.map(r => r.referrer_id).filter(Boolean))) as string[]
    const rmap = new Map<string, string>()
    if (referrerIds.length) {
      const { data: refs } = await supabase.from('profiles').select('id, nickname').in('id', referrerIds)
      for (const r of (refs as any[]) ?? []) rmap.set(r.id, r.nickname)
    }

    const data2: MemberRow[] = rows.map(r => ({
      id: r.id,
      nickname: r.nickname ?? '无名',
      phone: r.phone ?? null,
      member_rank: r.member_rank ?? '凡心',
      points: Number(r.points || 0),
      balance: Number(r.tb_balance || 0),
      tb_balance: Number(r.tb_balance || 0),
      referrer_id: r.referrer_id ?? null,
      referrer_nickname: rmap.get(r.referrer_id) ?? null,
      address: r.address ?? r.shipping_address ?? null,
      created_at: r.created_at,
      is_banned: !!r.is_banned,
    }))
    return { data: data2, total: count ?? 0 }
  } catch {
    return { data: [], total: 0 }
  }
}

// ── 会员详情（金豆明细）────────────────────────────────────────────────
export async function getMemberDetail(userId: string): Promise<MemberDetail> {
  try {
    const [{ data: p }, { data: claims }, { count }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('emotion_claims')
        .select('order_no, tb_amount, cv_amount, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    const r = p as any
    const profile: MemberRow | null = r ? {
      id: r.id,
      nickname: r.nickname ?? '无名',
      phone: r.phone ?? null,
      member_rank: r.member_rank ?? '凡心',
      points: Number(r.points || 0),
      balance: Number(r.tb_balance || 0),
      tb_balance: Number(r.tb_balance || 0),
      referrer_id: r.referrer_id ?? null,
      referrer_nickname: null,
      address: r.address ?? r.shipping_address ?? null,
      created_at: r.created_at,
      is_banned: !!r.is_banned,
    } : null
    return {
      profile,
      emotionClaims: ((claims as any[]) ?? []).map(c => ({
        order_no: c.order_no ?? null,
        tb_amount: Number(c.tb_amount || 0),
        cv_amount: Number(c.cv_amount || 0),
        status: c.status,
        created_at: c.created_at,
      })),
      orderCount: count ?? 0,
    }
  } catch {
    return { profile: null, emotionClaims: [], orderCount: 0 }
  }
}

// ── 成交订单（列表 + 两步直读买家/门店/推荐人）────────────────────────
export interface OrderRow {
  id: string
  order_no: string | null
  user_id: string | null
  store_id: string | null
  total_amount: number
  status: string
  tb_used: number
  commission_distributed: boolean
  commission_total: number
  commission_l1: number
  commission_l2: number
  platform_share: number
  referrer_id: string | null
  created_at: string
  refund_status: string | null
  buyer_nickname: string | null
  buyer_phone: string | null
  store_name: string | null
  referrer_nickname: string | null
  // 财务拆解：让利率优先取商品级 discount_rate 的加权混合率；商品未设时回退门店 referral_rate
  store_referral_rate: number | null
  effective_rate: number // 最终用于展示/计算的实际让利率（小数）
}

export interface OrderList {
  data: OrderRow[]
  total: number
}

const ORDER_FIELDS = 'id, order_no, user_id, store_id, total_amount, status, tb_used, commission_distributed, referrer_id, created_at, refund_status'

export async function getOrders(
  page: number,
  pageSize: number,
  filters: { status?: string; keyword?: string } = {},
): Promise<OrderList> {
  try {
    let q = supabase.from('orders').select(ORDER_FIELDS, { count: 'exact' })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.keyword) q = q.ilike('order_no', `%${filters.keyword}%`)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error || !data) return { data: [], total: 0 }

    const rows = data as any[]
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
    const storeIds = Array.from(new Set(rows.map(r => r.store_id).filter(Boolean))) as string[]
    const refIds = Array.from(new Set(rows.map(r => r.referrer_id).filter(Boolean))) as string[]

    const orderIds = rows.map(r => r.id as string)
    const [pmap, smap, rmap, commMap, itemsRaw] = await Promise.all([
      userIds.length
        ? supabase.from('profiles').select('id, nickname, phone').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      storeIds.length
        ? supabase.from('stores').select('id, name, referral_rate, referral_rate_enabled').in('id', storeIds)
        : Promise.resolve({ data: [] as any[] }),
      refIds.length
        ? supabase.from('profiles').select('id, nickname').in('id', refIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? supabase.from('commissions')
            .select('order_id, level, commission_amount')
            .in('order_id', orderIds)
            .neq('status', 'refunded')
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? supabase.from('order_items').select('order_id, product_id, quantity, price').in('order_id', orderIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const pMap = new Map((pmap.data as any[] ?? []).map(p => [p.id, p]))
    const sMap = new Map((smap.data as any[] ?? []).map(s => [s.id, s]))
    const rMap = new Map((rmap.data as any[] ?? []).map(r => [r.id, r]))
    const cMap = new Map<string, { total: number; l1: number; l2: number }>()
    for (const c of (commMap.data as any[] ?? [])) {
      const oid = c.order_id as string
      const amt = Number(c.commission_amount || 0)
      const entry = cMap.get(oid) ?? { total: 0, l1: 0, l2: 0 }
      entry.total += amt
      if (c.level === 1) entry.l1 += amt
      else if (c.level === 2) entry.l2 += amt
      cMap.set(oid, entry)
    }

    // 商品级让利点：按商品 discount_rate 金额加权；商品未设则回退门店 referral_rate
    const productIds = Array.from(new Set((itemsRaw.data as any[] ?? []).map(i => i.product_id).filter(Boolean))) as string[]
    const { data: prodsRaw } = productIds.length
      ? await supabase.from('products').select('id, discount_rate').in('id', productIds)
      : { data: [] as any[] }
    const prateMap = new Map((prodsRaw as any[] ?? []).map(p => [p.id, p.discount_rate != null ? Number(p.discount_rate) : null]))
    const orderRateMap = new Map<string, number>()
    for (const oid of orderIds) {
      const orderItems = (itemsRaw.data as any[] ?? []).filter(i => i.order_id === oid)
      if (!orderItems.length) continue
      const row = rows.find(r => r.id === oid)
      const sd = sMap.get(row?.store_id)
      const storeEnabled = sd?.referral_rate_enabled !== false
      // 开关关闭 → 门店默认让利率不参与回退（仅商品级 discount_rate 生效）；开启无值 → 全局默认 0.09
      const storeRate = storeEnabled ? (Number(sd?.referral_rate ?? 0.09)) : 0
      let totalAmt = 0, weighted = 0
      for (const it of orderItems) {
        const amt = Number(it.quantity || 0) * Number(it.price || 0)
        const dr = prateMap.get(it.product_id)
        const rate = dr != null ? dr / 100 : storeRate
        totalAmt += amt
        weighted += amt * rate
      }
      if (totalAmt > 0) orderRateMap.set(oid, Math.round((weighted / totalAmt) * 10000) / 10000)
    }

    const data2: OrderRow[] = rows.map(r => {
      const sd = sMap.get(r.store_id)
      const storeEnabled = sd?.referral_rate_enabled !== false
      const storeRate = storeEnabled
        ? (sd?.referral_rate != null ? Number(sd.referral_rate) : 0.09)
        : 0
      const comm = cMap.get(r.id) ?? { total: 0, l1: 0, l2: 0 }
      const effRate = orderRateMap.get(r.id) ?? storeRate
      const concession = Math.round(r.total_amount * effRate * 100) / 100
      return {
        id: r.id,
        order_no: r.order_no ?? null,
        user_id: r.user_id ?? null,
        store_id: r.store_id ?? null,
        total_amount: Number(r.total_amount || 0),
        status: r.status,
        tb_used: Number(r.tb_used || 0),
        commission_distributed: !!r.commission_distributed,
        commission_total: comm.total,
        commission_l1: comm.l1,
        commission_l2: comm.l2,
        platform_share: Math.max(0, Math.round((concession - comm.total) * 100) / 100),
        referrer_id: r.referrer_id ?? null,
        created_at: r.created_at,
        refund_status: r.refund_status ?? null,
        buyer_nickname: pMap.get(r.user_id)?.nickname ?? null,
        buyer_phone: pMap.get(r.user_id)?.phone ?? null,
        store_name: sMap.get(r.store_id)?.name ?? null,
        store_referral_rate: storeRate,
        effective_rate: effRate,
        referrer_nickname: rMap.get(r.referrer_id)?.nickname ?? null,
      }
    })
    return { data: data2, total: count ?? 0 }
  } catch {
    return { data: [], total: 0 }
  }
}

// ── 单笔订单详情（含推荐人链）────────────────────────────────────────────
export interface OrderDetail extends OrderRow {
  commissionTotal: number // 该订单已产生佣金（剔除已退款）
  commission_l1: number
  commission_l2: number
  platform_share: number
  platformNet: number // 平台实收（精确）= 成交额 − 让利 − 佣金
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  try {
    const { data } = await supabase.from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle()
    const r = data as any
    if (!r) return null
    const [storeRes, buyerRes, refRes] = await Promise.all([
      r.store_id
        ? supabase.from('stores').select('name, referral_rate, referral_rate_enabled').eq('id', r.store_id).maybeSingle()
        : Promise.resolve({ data: null }),
      r.user_id
        ? supabase.from('profiles').select('nickname, phone').eq('id', r.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      r.referrer_id
        ? supabase.from('profiles').select('nickname').eq('id', r.referrer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const total = Number(r.total_amount || 0)
    const concession = Math.min(Number(r.tb_used || 0), total)
    const commBreak = await getOrderCommissionBreakdown(r.id)
    const commissionTotal = commBreak.total
    const sd = storeRes.data as any
    const storeEnabled = sd?.referral_rate_enabled !== false
    // 开关关闭 → 门店默认让利率不参与回退（仅商品级 discount_rate 生效）；开启无值 → 全局默认 0.09
    const storeRate = storeEnabled
      ? (sd?.referral_rate != null ? Number(sd.referral_rate) : 0.09)
      : 0

    // 计算商品级加权让利率
    let effectiveRate = storeRate
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, quantity, price')
        .eq('order_id', r.id)
      if (items && items.length) {
        const pids = Array.from(new Set((items as any[]).map(i => i.product_id).filter(Boolean))) as string[]
        if (pids.length) {
          const { data: prods } = await supabase.from('products').select('id, discount_rate').in('id', pids)
          const prateMap = new Map((prods as any[] ?? []).map(p => [p.id, p.discount_rate != null ? Number(p.discount_rate) : null]))
          let totalAmt = 0, weighted = 0
          for (const it of items as any[]) {
            const amt = Number(it.quantity || 0) * Number(it.price || 0)
            const dr = prateMap.get(it.product_id)
            const rate = dr != null ? dr / 100 : storeRate
            totalAmt += amt
            weighted += amt * rate
          }
          if (totalAmt > 0) effectiveRate = Math.round((weighted / totalAmt) * 10000) / 10000
        }
      }
    } catch { /* 降级门店率 */ }

    return {
      id: r.id,
      order_no: r.order_no ?? null,
      user_id: r.user_id ?? null,
      store_id: r.store_id ?? null,
      total_amount: total,
      status: r.status,
      tb_used: concession,
      commission_distributed: !!r.commission_distributed,
      commission_total: commissionTotal,
      commission_l1: commBreak.l1,
      commission_l2: commBreak.l2,
      platform_share: Math.max(0, Math.round((total * effectiveRate - commissionTotal) * 100) / 100),
      referrer_id: r.referrer_id ?? null,
      created_at: r.created_at,
      refund_status: r.refund_status ?? null,
      buyer_nickname: (buyerRes.data as any)?.nickname ?? null,
      buyer_phone: (buyerRes.data as any)?.phone ?? null,
      store_name: (storeRes.data as any)?.name ?? null,
      store_referral_rate: storeRate,
      effective_rate: effectiveRate,
      referrer_nickname: (refRes.data as any)?.nickname ?? null,
      commissionTotal,
      platformNet: Math.round((total - concession - commissionTotal) * 100) / 100,
    }
  } catch {
    return null
  }
}

// 单笔订单的精确佣金合计（剔除已退款）
export async function getOrderCommission(orderId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('commissions')
      .select('commission_amount.sum()')
      .eq('order_id', orderId)
      .neq('status', 'refunded')
    if (error || !data || !data.length) return 0
    return Number((data[0] as any).sum ?? 0)
  } catch {
    return 0
  }
}

export interface CommissionBreakdown {
  total: number
  l1: number
  l2: number
  platform_share: number
}

export async function getOrderCommissionBreakdown(orderId: string): Promise<CommissionBreakdown> {
  try {
    const { data, error } = await supabase
      .from('commissions')
      .select('level, commission_amount')
      .eq('order_id', orderId)
      .neq('status', 'refunded')
    if (error || !data) return { total: 0, l1: 0, l2: 0, platform_share: 0 }
    let total = 0, l1 = 0, l2 = 0
    for (const c of data as any[]) {
      const amt = Number(c.commission_amount || 0)
      total += amt
      if (c.level === 1) l1 += amt
      else if (c.level === 2) l2 += amt
    }
    return { total, l1, l2, platform_share: 0 }
  } catch {
    return { total: 0, l1: 0, l2: 0, platform_share: 0 }
  }
}

// =====================================================
// 资产流水中心（三张逐笔明细表）
//  - 积分流水 points_logs
//  - 金豆流水 emotion_tongbao_logs
//  - 佣金流水 commissions
// 均用两步直读解析用户昵称/手机（profiles 无 FK，沿用已修通范式）
// =====================================================

export interface PointsLedgerRow {
  id: string
  user_id: string | null
  order_id: string | null
  type: string
  delta: number
  balance_after: number
  remark: string | null
  created_at: string
  nickname: string | null
  phone: string | null
}

export interface EmotionLedgerRow {
  id: string
  user_id: string | null
  delta: number
  balance_after: number
  reason: string
  ref_id: string | null
  remark: string | null
  created_at: string
  nickname: string | null
  phone: string | null
}

export interface CommissionRow {
  id: string
  order_id: string | null
  order_no: string
  beneficiary_id: string | null
  payer_id: string | null
  level: number
  rank_at_time: string
  ratio: number
  pool_amount: number
  commission_amount: number
  b_coef: number
  status: string
  settle_at: string | null
  created_at: string
  beneficiary_nickname: string | null
  payer_nickname: string | null
}

export interface GoldBeanLedgerRow {
  id: string
  user_id: string | null
  order_id: string | null
  type: string
  delta: number
  balance_after: number
  remark: string | null
  created_at: string
  nickname: string | null
  phone: string | null
}

// ── 积分流水 ────────────────────────────────────────────────
export async function getPointsLedger(
  page: number,
  pageSize: number,
  filters: { type?: string; keyword?: string } = {},
): Promise<{ data: PointsLedgerRow[]; total: number; error?: string }> {
  try {
    let q = supabase.from('points_logs').select('*', { count: 'exact' })
    if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
    if (filters.keyword) q = q.ilike('remark', `%${filters.keyword}%`)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) return { data: [], total: 0, error: `查询失败: ${error.message}` }
    if (!data) return { data: [], total: 0, error: '查询返回空数据' }

    const rows = data as any[]
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
    const umap = userIds.length
      ? (await supabase.from('profiles').select('id, nickname, phone').in('id', userIds)).data as any[] ?? []
      : []
    const uMap = new Map(umap.map(p => [p.id, p]))
    const data2: PointsLedgerRow[] = rows.map(r => ({
      id: r.id,
      user_id: r.user_id ?? null,
      order_id: r.order_id ?? null,
      type: r.type,
      delta: Number(r.delta || 0),
      balance_after: Number(r.balance_after || 0),
      remark: r.remark ?? null,
      created_at: r.created_at,
      nickname: uMap.get(r.user_id)?.nickname ?? null,
      phone: uMap.get(r.user_id)?.phone ?? null,
    }))
    return { data: data2, total: count ?? 0 }
  } catch (e) {
    return { data: [], total: 0, error: `请求异常: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ── 金豆流水 ──────────────────────────────────────────────
export async function getEmotionLedger(
  page: number,
  pageSize: number,
  filters: { reason?: string; keyword?: string } = {},
): Promise<{ data: EmotionLedgerRow[]; total: number; error?: string }> {
  try {
    let q = supabase.from('emotion_tongbao_logs').select('*', { count: 'exact' })
    if (filters.reason && filters.reason !== 'all') q = q.eq('reason', filters.reason)
    if (filters.keyword) q = q.or(`remark.ilike.%${filters.keyword}%,ref_id.ilike.%${filters.keyword}%`)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) return { data: [], total: 0, error: `查询失败: ${error.message}` }
    if (!data) return { data: [], total: 0, error: '查询返回空数据' }

    const rows = data as any[]
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
    const umap = userIds.length
      ? (await supabase.from('profiles').select('id, nickname, phone').in('id', userIds)).data as any[] ?? []
      : []
    const uMap = new Map(umap.map(p => [p.id, p]))
    const data2: EmotionLedgerRow[] = rows.map(r => ({
      id: r.id,
      user_id: r.user_id ?? null,
      delta: Number(r.delta || 0),
      balance_after: Number(r.balance_after || 0),
      reason: r.reason,
      ref_id: r.ref_id ?? null,
      remark: r.remark ?? null,
      created_at: r.created_at,
      nickname: uMap.get(r.user_id)?.nickname ?? null,
      phone: uMap.get(r.user_id)?.phone ?? null,
    }))
    return { data: data2, total: count ?? 0 }
  } catch (e) {
    return { data: [], total: 0, error: `请求异常: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ── 佣金流水 ────────────────────────────────────────────────
export async function getCommissionLedger(
  page: number,
  pageSize: number,
  filters: { status?: string; level?: string; keyword?: string } = {},
): Promise<{ data: CommissionRow[]; total: number; error?: string }> {
  try {
    let q = supabase.from('commissions').select('*', { count: 'exact' })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.level && filters.level !== 'all') q = q.eq('level', Number(filters.level))
    if (filters.keyword) q = q.ilike('order_no', `%${filters.keyword}%`)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) return { data: [], total: 0, error: `查询失败: ${error.message}` }
    if (!data) return { data: [], total: 0, error: '查询返回空数据' }

    const rows = data as any[]
    const benIds = Array.from(new Set(rows.map(r => r.beneficiary_id).filter(Boolean))) as string[]
    const payerIds = Array.from(new Set(rows.map(r => r.payer_id).filter(Boolean))) as string[]
    const allIds = Array.from(new Set([...benIds, ...payerIds]))
    const umap = allIds.length
      ? (await supabase.from('profiles').select('id, nickname').in('id', allIds)).data as any[] ?? []
      : []
    const uMap = new Map(umap.map(p => [p.id, p]))
    const data2: CommissionRow[] = rows.map(r => ({
      id: r.id,
      order_id: r.order_id ?? null,
      order_no: r.order_no,
      beneficiary_id: r.beneficiary_id ?? null,
      payer_id: r.payer_id ?? null,
      level: Number(r.level || 0),
      rank_at_time: r.rank_at_time,
      ratio: Number(r.ratio || 0),
      pool_amount: Number(r.pool_amount || 0),
      commission_amount: Number(r.commission_amount || 0),
      b_coef: Number(r.b_coef || 1),
      status: r.status,
      settle_at: r.settle_at ?? null,
      created_at: r.created_at,
      beneficiary_nickname: uMap.get(r.beneficiary_id)?.nickname ?? null,
      payer_nickname: uMap.get(r.payer_id)?.nickname ?? null,
    }))
    return { data: data2, total: count ?? 0 }
  } catch (e) {
    return { data: [], total: 0, error: `请求异常: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ── 金豆流水 ────────────────────────────────────────────────
export async function getGoldBeanLedger(
  page: number,
  pageSize: number,
  filters: { type?: string; keyword?: string } = {},
): Promise<{ data: GoldBeanLedgerRow[]; total: number; error?: string }> {
  try {
    let q = supabase.from('tongbao_logs').select('*', { count: 'exact' })
    if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
    if (filters.keyword) q = q.or(`remark.ilike.%${filters.keyword}%,order_id.ilike.%${filters.keyword}%`)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) return { data: [], total: 0, error: `查询失败: ${error.message}` }
    if (!data) return { data: [], total: 0, error: '查询返回空数据' }

    const rows = data as any[]
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
    const umap = userIds.length
      ? (await supabase.from('profiles').select('id, nickname, phone').in('id', userIds)).data as any[] ?? []
      : []
    const uMap = new Map(umap.map(p => [p.id, p]))
    const data2: GoldBeanLedgerRow[] = rows.map(r => ({
      id: r.id,
      user_id: r.user_id ?? null,
      order_id: r.order_id ?? null,
      type: r.type,
      delta: Number(r.delta || 0),
      balance_after: Number(r.balance_after || 0),
      remark: r.remark ?? null,
      created_at: r.created_at,
      nickname: uMap.get(r.user_id)?.nickname ?? null,
      phone: uMap.get(r.user_id)?.phone ?? null,
    }))
    return { data: data2, total: count ?? 0 }
  } catch (e) {
    return { data: [], total: 0, error: `请求异常: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ── 金豆后台发放 / 扣减（admin 运营动作）──────────────────────────────
// 写 tongbao_logs（admin_grant/admin_deduct）+ 同步更新 profiles.tb_balance（金豆消费余额）
// 与「用户管理-充值」共用同一 balance 字段，确保两页口径一致（金豆 = 消费抵扣余额，1:1）
// 调用方可 .then().catch() 不阻塞主流程；单步失败返回结构化错误
export interface GoldBeanAdjustResult {
  ok: boolean
  error?: string
  balanceAfter?: number
}

export async function adminAdjustGoldBean(
  userId: string,
  amount: number,
  direction: 'grant' | 'deduct',
  reason: string,
): Promise<GoldBeanAdjustResult> {
  try {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: '金额必须为正数' }
    const { data: p, error: pe } = await supabase
      .from('profiles').select('tb_balance').eq('id', userId).maybeSingle()
    if (pe || !p) return { ok: false, error: pe?.message || '用户不存在' }
    const cur = Number((p as any).tb_balance || 0)
    const delta = direction === 'grant' ? Math.abs(amount) : -Math.abs(amount)
    const balanceAfter = Math.max(0, cur + delta)
    const type = direction === 'grant' ? 'admin_grant' : 'admin_deduct'
    const { error: ie } = await supabase.from('tongbao_logs').insert({
      user_id: userId,
      type,
      delta,
      balance_after: balanceAfter,
      remark: reason || (direction === 'grant' ? '后台发放' : '后台扣减'),
    })
    if (ie) return { ok: false, error: `流水写入失败：${ie.message}` }
    const { error: ue } = await supabase.from('profiles').update({ tb_balance: balanceAfter }).eq('id', userId)
    if (ue) return { ok: false, error: `余额更新失败：${ue.message}（流水已记录，请人工核对）` }
    return { ok: true, balanceAfter }
  } catch (e: any) {
    return { ok: false, error: e?.message || '未知错误' }
  }
}

// ── 金豆充值（admin 给用户充值，余额增加）──────────────────────────────
// 写 tongbao_logs（type='recharge'）+ 同步更新 profiles.tb_balance（金豆消费余额）
// 注意：仅动 tb_balance（金豆消费账户，人民币1:1锚定），不动 commission_balance（可提现佣金，按 00058 设计隔离）
// 调用方可 .then().catch() 不阻塞主流程；单步失败返回结构化错误
export interface GoldBeanRechargeResult {
  ok: boolean
  error?: string
  balanceAfter?: number
}

export async function adminRechargeGoldBean(
  userId: string,
  amount: number,
  remark: string,
): Promise<GoldBeanRechargeResult> {
  try {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: '充值金额必须为正数' }
    const { data: p, error: pe } = await supabase
      .from('profiles').select('tb_balance').eq('id', userId).maybeSingle()
    if (pe || !p) return { ok: false, error: pe?.message || '用户不存在' }
    const cur = Number((p as any).tb_balance || 0)
    // cur 可能是 numeric(12,2) 小数（如 15.33），balance_after 同步改 numeric 后可保留小数
    const amtNum = Math.round(amount) // 充值走 1 豆 = 1 元整数语义
    const balanceAfter = Number((cur + amtNum).toFixed(2))
    const { error: ie } = await supabase.from('tongbao_logs').insert({
      user_id: userId,
      type: 'recharge',
      delta: amtNum,
      balance_after: balanceAfter,
      remark: remark || '后台充值',
    })
    if (ie) return { ok: false, error: `流水写入失败：${ie.message}` }
    const { error: ue } = await supabase.from('profiles').update({ tb_balance: balanceAfter }).eq('id', userId)
    if (ue) return { ok: false, error: `余额更新失败：${ue.message}（流水已记录，请人工核对）` }
    return { ok: true, balanceAfter }
  } catch (e: any) {
    return { ok: false, error: e?.message || '未知错误' }
  }
}

// =====================================================
// 全量导出（循环分页拉取，供 CSV 对账）
//  复用已包装的列表查询（含两步直读昵称/手机），避免重复逻辑
// =====================================================
async function fetchAll<T>(pageFn: (page: number) => Promise<{ data: T[]; total: number }>): Promise<T[]> {
  const all: T[] = []
  let page = 0
  while (true) {
    const { data, total } = await pageFn(page)
    all.push(...data)
    if (data.length === 0 || all.length >= total) break
    page++
  }
  return all
}

export function exportOrders(filters: { status?: string; keyword?: string } = {}): Promise<OrderRow[]> {
  return fetchAll(p => getOrders(p, 500, filters))
}

export function exportPointsLedger(filters: { type?: string; keyword?: string } = {}): Promise<PointsLedgerRow[]> {
  return fetchAll(p => getPointsLedger(p, 500, filters))
}

export function exportEmotionLedger(filters: { reason?: string; keyword?: string } = {}): Promise<EmotionLedgerRow[]> {
  return fetchAll(p => getEmotionLedger(p, 500, filters))
}

export function exportCommissionLedger(filters: { status?: string; level?: string; keyword?: string } = {}): Promise<CommissionRow[]> {
  return fetchAll(p => getCommissionLedger(p, 500, filters))
}

export function exportGoldBeanLedger(filters: { type?: string; keyword?: string } = {}): Promise<GoldBeanLedgerRow[]> {
  return fetchAll(p => getGoldBeanLedger(p, 500, filters))
}

// =====================================================
// 智能异常检测规则引擎
//  零未定义 RPC，全部复用 PostgREST 聚合 + 两步直读范式
//  单规则失败降级为不触发，不阻塞整页
// =====================================================
export interface Anomaly {
  id: string
  level: 'high' | 'medium' | 'low'
  title: string
  detail: string
  metric?: string
}

export interface AnomalyReport {
  anomalies: Anomaly[]
  checkedAt: string
}

export async function getAnomalyReport(): Promise<AnomalyReport> {
  const anomalies: Anomaly[] = []
  try {
    // R1 · 门店异常退款率（成交 ≥5 单且退款率 >30% → 关注 / >50% → 高危）
    const { data: ords } = await supabase
      .from('orders')
      .select('store_id, refund_status')
      .not('store_id', 'is', null)
    const byStore = new Map<string, { total: number; refunded: number }>()
    for (const o of (ords as any[]) ?? []) {
      const sid = o.store_id as string
      const cur = byStore.get(sid) ?? { total: 0, refunded: 0 }
      cur.total += 1
      const rs = (o.refund_status as string) || ''
      if (rs && rs !== 'none' && rs !== 'null') cur.refunded += 1
      byStore.set(sid, cur)
    }
    for (const [sid, s] of byStore) {
      if (s.total >= 5 && s.refunded / s.total > 0.3) {
        const rate = (s.refunded / s.total) * 100
        anomalies.push({
          id: `store-refund-${sid}`,
          level: s.refunded / s.total > 0.5 ? 'high' : 'medium',
          title: '门店退款率异常',
          detail: `门店 ${sid} 退款率 ${rate.toFixed(1)}%（${s.refunded}/${s.total} 单）`,
          metric: sid,
        })
      }
    }

    // R2 · 单日 累计消费额 骤降（较昨日下降 >50%，且今日已有成交，避免凌晨空窗误报）
    const trend = await getDailyTrend(2)
    if (trend.length >= 2) {
      const today = trend[trend.length - 1].gmv
      const yest = trend[trend.length - 2].gmv
      if (yest > 0 && today > 0 && today / yest < 0.5) {
        anomalies.push({
          id: 'gmv-drop',
          level: 'medium',
          title: '成交额骤降',
          detail: `今日 累计消费额 ¥${today.toLocaleString('zh-CN')} 较昨日 ¥${yest.toLocaleString('zh-CN')} 下降 ${((1 - today / yest) * 100).toFixed(1)}%`,
        })
      }
    }

    // R3 · 大额订单关注（近20笔最高金额订单中 >¥5000 的，提示风控复核）
    const { data: big } = await supabase
      .from('orders')
      .select('order_no, total_amount')
      .order('total_amount', { ascending: false })
      .limit(20)
    const bigOnes = ((big as any[]) ?? []).filter(o => Number(o.total_amount || 0) > 5000)
    if (bigOnes.length) {
      const top = Math.max(...bigOnes.map(o => Number(o.total_amount || 0)))
      anomalies.push({
        id: 'large-order',
        level: 'low',
        title: '大额订单关注',
        detail: `近20笔订单中 ${bigOnes.length} 笔金额 >¥5000（最高 ¥${top.toLocaleString('zh-CN')}）`,
      })
    }

    // R4 · 封禁会员占比异常（封禁占比 >5% → 关注 / >15% → 高危，疑似批量封禁或风控失效）
    const [totalM, bannedM] = await Promise.all([
      countOf('profiles'),
      countOf('profiles', { eq: ['is_banned', true] }),
    ])
    if (totalM > 0) {
      const r = bannedM / totalM
      if (r > 0.15) {
        anomalies.push({ id: 'ban-ratio', level: 'high', title: '封禁会员占比异常', detail: `封禁会员 ${bannedM} 人，占全体 ${(r * 100).toFixed(1)}%（疑似批量封禁/风控失效）` })
      } else if (r > 0.05) {
        anomalies.push({ id: 'ban-ratio', level: 'medium', title: '封禁会员占比偏高', detail: `封禁会员 ${bannedM} 人，占全体 ${(r * 100).toFixed(1)}%` })
      }
    }

    // R5 · 刷确权异常（单用户累计确权 >20 次，或近24h >5 次 → 关注，疑似刷量）
    const since24 = new Date(Date.now() - 864e5).toISOString()
    const { data: claimsAll } = await supabase.from('emotion_claims').select('user_id, created_at')
    const perUser = new Map<string, { total: number; recent: number }>()
    for (const c of (claimsAll as any[]) ?? []) {
      const uid = c.user_id as string
      if (!uid) continue
      const u = perUser.get(uid) ?? { total: 0, recent: 0 }
      u.total += 1
      if ((c.created_at as string) >= since24) u.recent += 1
      perUser.set(uid, u)
    }
    for (const [uid, u] of perUser) {
      if (u.total > 20 || u.recent > 5) {
        anomalies.push({
          id: `claim-spam-${uid}`,
          level: 'medium',
          title: '刷确权异常',
          detail: `用户 ${uid.slice(0, 8)}… 累计确权 ${u.total} 次（近24h ${u.recent} 次），疑似刷量`,
          metric: uid,
        })
      }
    }
  } catch {
    /* 单规则异常不影响其它规则，降级为空报告 */
  }
  return { anomalies, checkedAt: new Date().toISOString() }
}

// =====================================================
// 会员上线调拨（仅允许无上线会员指定上线）
// 约束：
//  1. 只能给 referrer_id 为 null 的会员设置上线；
//  2. 不能设自己为上线；
//  3. 不能形成推荐回环（沿目标上线链向上追溯最多 5 层）；
//  4. 必须由 admin-web 的 service_role 或真实 admin 会话执行。
// =====================================================
export interface CandidateReferrer {
  id: string
  nickname: string
  phone: string | null
  member_rank: string
}

export async function searchCandidateReferrers(
  keyword: string,
  excludeUserId: string,
): Promise<{ data: CandidateReferrer[]; error?: string }> {
  try {
    let q = supabase.from('profiles').select('id,nickname,phone,member_rank')
    if (keyword) q = q.or(`phone.ilike.%${keyword}%,nickname.ilike.%${keyword}%`)
    const { data, error } = await q
      .neq('id', excludeUserId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return { data: [], error: error.message }
    return {
      data: (data as any[] ?? []).map(r => ({
        id: r.id,
        nickname: r.nickname ?? '无名',
        phone: r.phone ?? null,
        member_rank: r.member_rank ?? '凡心',
      })),
    }
  } catch (e: any) {
    return { data: [], error: e?.message || '搜索失败' }
  }
}

async function wouldCreateCycle(userId: string, referrerId: string): Promise<boolean> {
  if (userId === referrerId) return true
  let current = referrerId
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('profiles').select('referrer_id').eq('id', current).maybeSingle()
    if (!data || !data.referrer_id) return false
    if (data.referrer_id === userId) return true
    current = data.referrer_id
  }
  return false
}

export async function adminUpdateReferrer(
  userId: string,
  referrerId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!userId || !referrerId) return { ok: false, error: '参数缺失' }
    if (userId === referrerId) return { ok: false, error: '不能将自己设为自己的上线' }

    const [{ data: user, error: userErr }, { data: ref, error: refErr }] = await Promise.all([
      supabase.from('profiles').select('referrer_id').eq('id', userId).maybeSingle(),
      supabase.from('profiles').select('id').eq('id', referrerId).maybeSingle(),
    ])
    if (userErr) return { ok: false, error: userErr.message }
    if (refErr) return { ok: false, error: refErr.message }
    if (!user) return { ok: false, error: '会员不存在' }
    if (user.referrer_id) return { ok: false, error: '该会员已有上线，不能调整。若必须变更，请走申诉流程。' }
    if (!ref) return { ok: false, error: '目标上线不存在' }

    const cycle = await wouldCreateCycle(userId, referrerId)
    if (cycle) return { ok: false, error: '不能将上线调到该会员的下游，会形成循环推荐关系' }

    const { error } = await supabase.from('profiles').update({ referrer_id: referrerId }).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || '调整失败' }
  }
}
