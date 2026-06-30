import { supabase } from '@/lib/supabase'
import type {
  AdminStats, MerchantApplication, Product,
  Withdrawal, Article, Profile,
} from '@/types'

// ── 仪表盘统计 ──────────────────────────────────────────────────────────────
export async function getAdminStats(): Promise<AdminStats> {
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
  return {
    merchants: merchants ?? 0, products: products ?? 0, withdrawals: withdrawals ?? 0,
    articles: articles ?? 0, users: users ?? 0, orders: orders ?? 0,
  }
}

// ── 最新申请预览 ─────────────────────────────────────────────────────────────
export async function getRecentMerchants(limit = 5): Promise<MerchantApplication[]> {
  const { data } = await supabase.from('merchant_applications').select('*')
    .eq('status', 'pending').order('created_at', { ascending: false }).limit(limit)
  return Array.isArray(data) ? data : []
}

// ── 商家审核 ─────────────────────────────────────────────────────────────────
export async function getMerchantApplications(
  status: string, page: number, pageSize: number
): Promise<{ data: MerchantApplication[]; total: number }> {
  let q = supabase.from('merchant_applications').select('*', { count: 'exact' })
  if (status !== 'all') q = q.eq('status', status)
  const { data, count } = await q
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
}

export async function approveApplication(id: string): Promise<boolean> {
  const { data: app } = await supabase.from('merchant_applications').select('user_id').eq('id', id).maybeSingle()
  if (!app) return false
  const { error } = await supabase.from('merchant_applications').update({ status: 'approved' }).eq('id', id)
  if (error) return false
  await supabase.from('profiles').update({ merchant_status: 'approved' }).eq('id', app.user_id)
  return true
}

export async function rejectApplication(id: string, reason: string): Promise<boolean> {
  const { data: app } = await supabase.from('merchant_applications').select('user_id').eq('id', id).maybeSingle()
  if (!app) return false
  const { error } = await supabase.from('merchant_applications').update({ status: 'rejected', reject_reason: reason }).eq('id', id)
  if (error) return false
  await supabase.from('profiles').update({ merchant_status: 'rejected' }).eq('id', app.user_id)
  return true
}

// ── 商品审核 ─────────────────────────────────────────────────────────────────
export async function getPendingProducts(page: number, pageSize: number): Promise<{ data: Product[]; total: number }> {
  const { data, count } = await supabase.from('products')
    .select('*, stores!store_id(name)', { count: 'exact' })
    .eq('review_status', 'pending')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
}

export async function approveProduct(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').update({ review_status: 'approved' }).eq('id', id)
  return !error
}

export async function rejectProduct(id: string, reason: string): Promise<boolean> {
  const { error } = await supabase.from('products').update({ review_status: 'rejected', description: `[驳回] ${reason}` }).eq('id', id)
  return !error
}

// ── 提现审核 ─────────────────────────────────────────────────────────────────
export async function getPendingWithdrawals(page: number, pageSize: number): Promise<{ data: Withdrawal[]; total: number }> {
  const { data, count } = await supabase.from('withdrawals')
    .select('*, profiles!user_id(nickname, phone)', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
}

export async function approveWithdrawal(id: string): Promise<boolean> {
  const { error } = await supabase.from('withdrawals').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', id)
  return !error
}

export async function rejectWithdrawal(id: string): Promise<boolean> {
  const { data: w } = await supabase.from('withdrawals').select('user_id, amount').eq('id', id).maybeSingle()
  if (!w) return false
  const { error } = await supabase.from('withdrawals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  const { data: prof } = await supabase.from('profiles').select('balance').eq('id', w.user_id).maybeSingle()
  const refund = Math.round(Number(w.amount) / 0.01)
  await supabase.from('profiles').update({ balance: (prof?.balance ?? 0) + refund }).eq('id', w.user_id)
  return true
}

// ── UGC 内容管理 ──────────────────────────────────────────────────────────────
export async function getArticles(
  filter: 'all' | 'published' | 'hidden', page: number, pageSize: number
): Promise<{ data: Article[]; total: number }> {
  let q = supabase.from('articles').select('*, profiles!user_id(nickname)', { count: 'exact' })
  if (filter === 'published') q = q.eq('is_published', true)
  else if (filter === 'hidden') q = q.eq('is_published', false)
  const { data, count } = await q
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
}

export async function toggleArticlePublish(id: string, publish: boolean): Promise<boolean> {
  const { error } = await supabase.from('articles').update({ is_published: publish }).eq('id', id)
  return !error
}

export async function deleteArticle(id: string): Promise<boolean> {
  const { error } = await supabase.from('articles').delete().eq('id', id)
  return !error
}

// ── 用户管理 ─────────────────────────────────────────────────────────────────
export async function getUsers(page: number, pageSize: number): Promise<{ data: Profile[]; total: number }> {
  const { data, count } = await supabase.from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return { data: Array.isArray(data) ? data : [], total: count ?? 0 }
}

export async function updateUserRole(id: string, role: 'user' | 'admin'): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  return !error
}
