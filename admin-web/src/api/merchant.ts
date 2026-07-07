// @title 商家后台数据 API
import { supabase } from '@/lib/supabase'
import type {
  Product, MerchantCoupon, MarketingCampaign, MerchantMessage, MerchantAnalytics, WithdrawalRecord,
} from '@/types'

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
export async function getMerchantAnalytics(storeId: string): Promise<MerchantAnalytics> {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, user_id, total_amount, status, created_at')
    .eq('store_id', storeId)

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, price, quantity')
    .eq('store_id', storeId)

  const paid = (orders || []).filter(o => o.status === 'paid' || o.status === 'completed')
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  const revenueToday = paid
    .filter(o => (o.created_at || '').startsWith(today))
    .reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const revenueMonth = paid
    .filter(o => (o.created_at || '').slice(0, 7) === thisMonth)
    .reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const ordersToday = (orders || []).filter(o => (o.created_at || '').startsWith(today)).length

  // 商品销售排行
  const map: Record<string, { name: string; sales: number }> = {}
  ;(items || []).forEach((it: any) => {
    const name = it.product_name || '未知商品'
    if (!map[name]) map[name] = { name, sales: 0 }
    map[name].sales += Number(it.price || 0) * Number(it.quantity || 0)
  })
  const topProducts = Object.values(map)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)
    .map(p => ({ name: p.name, sales: Math.round(p.sales), trend: 'up' as const }))

  // 近 7 日销售趋势
  const salesTrend: { date: string; amount: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    const amt = paid
      .filter(o => (o.created_at || '').startsWith(ds))
      .reduce((s, o) => s + Number(o.total_amount || 0), 0)
    salesTrend.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, amount: Math.round(amt) })
  }

  const totalCustomers = new Set((orders || []).map((o: any) => o.user_id).filter(Boolean)).size

  return {
    revenueToday: Math.round(revenueToday),
    revenueMonth: Math.round(revenueMonth),
    ordersToday,
    totalCustomers,
    salesTrend,
    topProducts,
    trafficToday: ordersToday,
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
}): Promise<boolean> {
  const { error } = await supabase.from('withdrawals').insert({
    user_id: payload.userId,
    store_id: payload.storeId,
    amount: payload.amount,
    withdraw_method: payload.method,
    alipay_account: payload.method === 'alipay' ? payload.account : null,
    bank_account: payload.method === 'bank' ? payload.account : null,
    bank_holder: payload.name,
    status: 'pending',
  })
  if (error) throw error
  return true
}

// ── 情绪系统：门店商品 + 转化漏斗 ─────────────────────────────────────
export type ProductWithEmotion = Product & {
  product_emotion?: {
    emotion_title?: string | null
    emotion_detail?: string | null
    dimension_tags?: Record<string, string[]> | null
    quality_score?: number | null
    review_status?: string | null
  } | null
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
