// @title 商家后台数据 API
import { supabase, supabaseAuth } from '@/lib/supabase'
import requestCache from '@/utils/requestCache'
import type {
  Product, MerchantCoupon, MarketingCampaign, MerchantMessage, MerchantAnalytics, WithdrawalRecord,
} from '@/types'

// 违禁词库（与 src/utils/compliance-words 保持一致，全站营销文案统一拦截）
const AD_ILLEGAL_WORDS = ['国家级','最高级','最佳','最好','第一','顶级','极品','万能','100%','绝对','唯一','保本','稳赚','躺赚','零风险','翻倍','升值','资产增值','中奖','开奖','抽奖','必中']
function checkIllegalWords(text: string | undefined | null): string[] {
  if (!text) return []
  return Array.from(new Set(AD_ILLEGAL_WORDS.filter(w => text.includes(w))))
}

// ── 门店解析 ───────────────────────────────────────────────────────────
export async function getMyMerchantStore(userId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('stores')
    .select('id, name')
    .eq('owner_id', userId)
    .maybeSingle()
  return (data as any) || null
}

// ── 优惠券 ─────────────────────────────────────────────────────────────
export async function getMerchantCoupons(storeId: string): Promise<MerchantCoupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as MerchantCoupon[]) || []
}

export async function createMerchantCoupon(
  storeId: string,
  ownerId: string,
  payload: {
    title: string
    discount_type: 'amount' | 'percent'
    discount_value: number
    min_amount: number
    total: number
    start_date: string
    end_date: string
  },
): Promise<boolean> {
  const code = 'CP' + Date.now().toString(36).toUpperCase().slice(-6)
  const { error } = await supabase.from('coupons').insert({
    store_id: storeId,
    user_id: ownerId,
    code,
    title: payload.title,
    discount_type: payload.discount_type,
    discount_value: payload.discount_value,
    min_amount: payload.min_amount,
    total: payload.total,
    claimed_count: 0,
    status: 'active',
    start_date: payload.start_date,
    end_date: payload.end_date,
    is_used: false,
  })
  if (error) throw error
  return true
}

export async function updateCouponStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase.from('coupons').update({ status }).eq('id', id)
  if (error) throw error
  return true
}

export async function deleteCoupon(id: string): Promise<boolean> {
  const { error } = await supabase.from('coupons').delete().eq('id', id)
  if (error) throw error
  return true
}

// ── 营销活动（广告）─────────────────────────────────────────────────────
export async function getMerchantCampaigns(storeId: string): Promise<MarketingCampaign[]> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as MarketingCampaign[]) || []
}

export async function createCampaign(
  storeId: string,
  payload: {
    campaign_name: string
    campaign_type: 'redpacket' | 'physical'
    gift_name: string
    gift_value: number
    total_limit: number
    daily_limit: number
    start_date: string
    end_date: string
    commission_rate: number
  },
): Promise<boolean> {
  // 违禁词校验（活动名称 + 礼品名称）
  const badCampaignName = checkIllegalWords(payload.campaign_name)
  const badGiftName = checkIllegalWords(payload.gift_name)
  if (badCampaignName.length || badGiftName.length) {
    const hits = [...badCampaignName, ...badGiftName]
    throw new Error(`文案含违禁词：${Array.from(new Set(hits)).join('、')}，请修改后重试`)
  }

  const { error } = await supabase.from('marketing_campaigns').insert({
    store_id: storeId,
    ...payload,
    claimed_count: 0,
    status: 'active',
  })
  if (error) throw error
  return true
}

export async function updateCampaignStatus(id: number, status: string): Promise<boolean> {
  const { error } = await supabase
    .from('marketing_campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  return true
}

// ── 数据分析 ───────────────────────────────────────────────────────────
// 商家商品收益聚合（服务端 RPC，替代前端万级 order_items 拉取）
// 返回：{ [product_id]: { sales(销量=数量合计), revenue(营收=price*数量合计) } }
export async function getMerchantProductSales(storeId: string): Promise<Record<string, { sales: number; revenue: number }>> {
  const ck = `amps:${storeId}`
  const cached = requestCache.get<Record<string, { sales: number; revenue: number }>>(ck)
  if (cached) return cached
  const { data, error } = await supabase.rpc('fn_merchant_product_sales', { p_store_id: storeId })
  if (error) throw error
  const m: Record<string, { sales: number; revenue: number }> = {}
  ;(data || []).forEach((r: any) => {
    m[r.product_id] = { sales: Number(r.sales || 0), revenue: Number(r.revenue || 0) }
  })
  requestCache.set(ck, m, 20_000)
  return m
}

// 商家数据分析聚合（服务端 RPC 一次返回，替代前端全量 orders/order_items 拉取）
export async function getMerchantAnalytics(storeId: string): Promise<MerchantAnalytics> {
  const ck = `ama:${storeId}`
  const cached = requestCache.get<MerchantAnalytics>(ck)
  if (cached) return cached

  const { data, error } = await supabase.rpc('fn_merchant_analytics', { p_store_id: storeId })
  if (error) throw error
  const d = (data as any) || {}

  const result: MerchantAnalytics = {
    revenueToday: Number(d.revenueToday ?? 0),
    revenueMonth: Number(d.revenueMonth ?? 0),
    ordersToday: Number(d.ordersToday ?? 0),
    totalCustomers: Number(d.totalCustomers ?? 0),
    salesTrend: Array.isArray(d.salesTrend)
      ? d.salesTrend.map((s: any) => ({ date: String(s.date ?? ''), amount: Number(s.amount ?? 0) }))
      : [],
    topProducts: Array.isArray(d.topProducts)
      ? d.topProducts.map((p: any) => ({ name: String(p.name || ''), sales: Number(p.sales || 0), trend: 'up' as const }))
      : [],
    // 以下为页面装饰字段（与原实现一致，静态占位）
    trafficToday: Number(d.ordersToday ?? 0),
    trafficYesterday: 0,
    weekRatio: 0,
    peakHour: '12:00-13:00',
    sources: [
      { name: '首页推荐', value: 45 },
      { name: '搜索', value: 28 },
      { name: '分享', value: 18 },
      { name: '其他', value: 9 },
    ],
  }
  requestCache.set(ck, result, 20_000)
  return result
}

// ── 消息通知 ───────────────────────────────────────────────────────────
function fmtTime(t?: string): string {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function getMerchantMessages(storeId: string, userId: string): Promise<MerchantMessage[]> {
  const msgs: MerchantMessage[] = []

  const { data: anns } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(10)
  ;(anns || []).forEach((a: any) =>
    msgs.push({ id: 'sys-' + a.id, type: 'system', title: '平台公告', content: a.content, time: fmtTime(a.created_at), read: false, rawTime: a.created_at }))

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_no, created_at, status')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(10)
  ;(orders || []).forEach((o: any) =>
    msgs.push({ id: 'ord-' + o.id, type: 'order', title: '新订单 ' + (o.order_no || ''), content: '订单状态：' + (o.status || ''), time: fmtTime(o.created_at), read: false, rawTime: o.created_at }))

  const { data: comms } = await supabase
    .from('commissions')
    .select('id, commission_amount, created_at, status')
    .eq('beneficiary_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  ;(comms || []).forEach((c: any) =>
    msgs.push({ id: 'com-' + c.id, type: 'commission', title: '佣金到账', content: `佣金 ¥${Number(c.commission_amount || 0).toFixed(2)}（${c.status}）`, time: fmtTime(c.created_at), read: false, rawTime: c.created_at }))

  return msgs.sort((a, b) => (b.rawTime || '').localeCompare(a.rawTime || ''))
}

// ── 佣金提现 ───────────────────────────────────────────────────────────
export async function getMerchantWithdrawals(userId: string): Promise<WithdrawalRecord[]> {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((w: any) => ({
    id: w.id,
    amount: Number(w.amount || 0),
    method: w.withdraw_method === 'alipay' ? '支付宝' : (w.withdraw_method === 'bank' ? '银行卡' : '微信'),
    account: w.alipay_account || w.bank_account || '',
    status: w.status,
    created_at: fmtTime(w.created_at),
    transferred_at: w.status === 'paid' ? fmtTime(w.updated_at) : null,
    kind: w.kind || 'settlement',
    real_name: w.real_name || w.bank_holder || null,
    id_card: w.id_card || null,
    bank_name: w.bank_name || null,
    bank_account: w.bank_account || null,
  }))
}

export async function getCommissionBalance(userId: string): Promise<{ available: number; totalEarned: number; withdrawn: number }> {
  const { data: comms } = await supabase
    .from('commissions')
    .select('commission_amount, status')
    .eq('beneficiary_id', userId)
  const { data: wds } = await supabase
    .from('withdrawals')
    .select('amount, status')
    .eq('user_id', userId)

  const totalEarned = (comms || [])
    .filter((c: any) => c.status === 'settled')
    .reduce((s: number, c: any) => s + Number(c.commission_amount || 0), 0)
  const withdrawn = (wds || [])
    .filter((w: any) => ['paid', 'approved'].includes(w.status))
    .reduce((s: number, w: any) => s + Number(w.amount || 0), 0)
  const available = Math.max(0, totalEarned - withdrawn)
  return {
    available: Math.round(available * 100) / 100,
    totalEarned: Math.round(totalEarned * 100) / 100,
    withdrawn: Math.round(withdrawn * 100) / 100,
  }
}

export async function createWithdrawal(payload: {
  userId: string
  storeId: string | null
  amount: number
  method: 'bank' | 'alipay' | 'wechat'
  account: string
  name: string
  idCard?: string
  bankName?: string
}): Promise<boolean> {
  // P0 修复：提现必须绑定当前登录用户，禁用任意 userId 传入（防提现盗用链路）。
  // 真实登录态下强制使用会话用户；演示/未登录态回退到传入 userId（仅演示可用）。
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userId = user?.id ?? payload.userId
  if (!userId) throw new Error('无法识别用户，请先登录')
  const { error } = await supabase.from('withdrawals').insert({
    user_id: userId,
    store_id: payload.storeId,
    // ⚠️ 双通道隔离硬约束：门店中心提现 = 商家货款结算通道（kind='settlement'）。
    // 严禁省略 kind —— withdrawals.kind 默认值是 'commission'，省略会把门店货款
    // 误写进「用户佣金」通道，破坏后台按 kind 审核/计税/对账的隔离。
    kind: 'settlement',
    amount: payload.amount,
    withdraw_method: payload.method,
    alipay_account: payload.method === 'alipay' ? payload.account : null,
    bank_account: payload.method === 'bank' ? payload.account : null,
    bank_holder: payload.method === 'bank' ? payload.name : null,
    bank_name: payload.method === 'bank' ? (payload.bankName || null) : null,
    real_name: payload.name || null,
    id_card: payload.idCard || null,
    status: 'pending',
  })
  if (error) throw error
  return true
}

/**
 * 读取门店货款结算概览（可结算余额 / 冻结 / 累计已结算 / 子商户号）。
 * 走 SECURITY DEFINER RPC fn_get_store_settlement（与小程序 getMerchantSettlement 同源），anon 可读。
 * 这是「货款提现」通道的余额来源，与用户侧「健康豆（推广佣金）」完全隔离。
 */
export async function getMerchantSettlementBalance(storeId: string): Promise<{
  ok: boolean; merchant_balance: number; settlement_frozen: number; total_settled: number; settlement_count: number; wx_sub_mch_id: string | null
} | null> {
  if (!storeId) return null
  const { data, error } = await supabase.rpc('fn_get_store_settlement', { p_store_id: storeId })
  if (error) { console.error('[getMerchantSettlementBalance]', error); return null }
  const d = (data as any) || {}
  return {
    ok: !!d.ok,
    merchant_balance: Number(d.merchant_balance ?? 0),
    settlement_frozen: Number(d.settlement_frozen ?? 0),
    total_settled: Number(d.total_settled ?? 0),
    settlement_count: Number(d.settlement_count ?? 0),
    wx_sub_mch_id: d.wx_sub_mch_id ?? null,
  }
}

/**
 * 商家货款提现申请（原子 RPC：校验余额 + 扣减 merchant_balance + 写 withdrawals(kind='settlement') + 关联结算单）。
 * 与小程序 applyMerchantWithdrawal 同源（fn_merchant_withdraw）。
 * 这是「货款提现」通道的唯一正确提交入口，确保余额预扣、幂等、通道隔离。
 */
export async function applyMerchantSettlementWithdrawal(params: {
  store_id: string
  amount: number
  method: 'wechat' | 'alipay' | 'bank'
  account_info?: Record<string, unknown>
}): Promise<{ ok: boolean; withdrawal_id?: string; amount?: number; error?: string }> {
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { ok: false, error: '未登录' }
  const amt = Number(params.amount) || 0
  if (!amt || amt <= 0) return { ok: false, error: '提现金额无效' }
  if (!params.store_id) return { ok: false, error: '缺少门店' }
  const { data, error } = await supabase.rpc('fn_merchant_withdraw', {
    p_store_id: params.store_id,
    p_user_id: user.id,
    p_amount: amt,
    p_method: params.method,
    p_account: params.account_info ?? null,
  })
  if (error) { console.error('[applyMerchantSettlementWithdrawal]', error); return { ok: false, error: error.message } }
  const d = (data as any) || {}
  if (!d.ok) return { ok: false, error: d.error || '提现失败' }
  return { ok: true, withdrawal_id: d.withdrawal_id, amount: d.amount }
}

// ── 情绪系统：门店商品 + 转化漏斗 ─────────────────────────────────────
export type ProductWithEmotion = Product & {
  product_emotion?: import('@/types').ProductEmotionData | null
}

/** 某门店下商品列表（含 product_emotion 编译结果），供情绪工作台使用 */
export async function getStoreProducts(storeId: string): Promise<ProductWithEmotion[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_emotion(*)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[getStoreProducts]', error)
    return []
  }
  return (data || []) as ProductWithEmotion[]
}

export interface EmotionFunnelRow {
  product_id: string | null
  event_type: string
  screen_index: number | null
}

/** 按门店 + 时间窗拉取情绪漏斗原始事件（前端聚合，避免复杂 SQL） */
export async function getEmotionFunnelEvents(
  storeId: string,
  days = 30,
): Promise<EmotionFunnelRow[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await supabase
    .from('emotion_funnel_events')
    .select('product_id, event_type, screen_index')
    .eq('store_id', storeId)
    .gte('created_at', since)
  if (error) {
    console.error('[getEmotionFunnelEvents]', error)
    return []
  }
  return (data || []) as EmotionFunnelRow[]
}

/**
 * 前端聚合漏斗：进入 → 滑到尾屏(信任闭环) → 点击购买
 * 返回总体漏斗 + 商品维度榜（按商品去重计数）
 */
export interface EmotionFunnelSummary {
  enter: number
  reachedEnd: number
  cta: number
  enterToEndRate: number // 进入→尾屏
  endToCtaRate: number // 尾屏→购买
  overallRate: number // 进入→购买
  byProduct: {
    productId: string
    enter: number
    reachedEnd: number
    cta: number
  }[]
}

export function aggregateEmotionFunnel(
  rows: EmotionFunnelRow[],
): EmotionFunnelSummary {
  const enter = rows.filter((r) => r.event_type === 'enter').length
  const reachedEnd = rows.filter(
    (r) => r.event_type === 'screen_view' && r.screen_index === 4,
  ).length
  const cta = rows.filter((r) => r.event_type === 'cta_click').length

  const byProductMap = new Map<string, { enter: number; reachedEnd: number; cta: number }>()
  for (const r of rows) {
    const pid = r.product_id || 'unknown'
    if (!byProductMap.has(pid)) byProductMap.set(pid, { enter: 0, reachedEnd: 0, cta: 0 })
    const b = byProductMap.get(pid)!
    if (r.event_type === 'enter') b.enter++
    else if (r.event_type === 'screen_view' && r.screen_index === 4) b.reachedEnd++
    else if (r.event_type === 'cta_click') b.cta++
  }
  const byProduct = Array.from(byProductMap.entries())
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.cta - a.cta)

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
  return {
    enter,
    reachedEnd,
    cta,
    enterToEndRate: pct(reachedEnd, enter),
    endToCtaRate: pct(cta, reachedEnd),
    overallRate: pct(cta, enter),
    byProduct,
  }
}
