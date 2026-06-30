import { supabase } from '@/client/supabase'
import type {
  Profile, Store, StoreCategory, Product, CartItem,
  Order, OrderItem, Article, MerchantApplication, Announcement,
  OrderStatus, MerchantStatus
} from './types'

// =====================
// Profiles
// =====================
export async function getMyProfile(): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle()
  return data
}

export async function updateProfile(updates: Partial<Pick<Profile, 'nickname' | 'avatar_url'>>): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return
  await supabase.from('profiles').update(updates).eq('id', uid)
}

// =====================
// Stores
// =====================
export async function getStores(category?: string, page = 0, limit = 20): Promise<Store[]> {
  let q = supabase.from('stores').select('*').eq('is_active', true).order('rating', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  if (category && category !== '全部') q = q.eq('category', category)
  const { data } = await q
  return Array.isArray(data) ? data : []
}

export async function getStoreById(id: string): Promise<Store | null> {
  const { data } = await supabase.from('stores').select('*').eq('id', id).maybeSingle()
  return data
}

export async function getStoreCategories(storeId: string): Promise<StoreCategory[]> {
  const { data } = await supabase.from('store_categories').select('*').eq('store_id', storeId).order('sort_order')
  return Array.isArray(data) ? data : []
}

// =====================
// Products
// =====================
export async function getProducts(opts: {
  storeId?: string, categoryId?: string, search?: string,
  moodTag?: string, moodTags?: string[], sceneTag?: string, page?: number, limit?: number
} = {}): Promise<Product[]> {
  const { storeId, categoryId, search, moodTag, moodTags, sceneTag, page = 0, limit = 20 } = opts
  let q = supabase.from('products').select('*, stores(id,name,image_url)').eq('is_active', true)
    .order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  if (storeId) q = q.eq('store_id', storeId)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (search) q = q.ilike('name', `%${search}%`)
  // 单标签精确匹配（contains = 数组包含该值）
  if (moodTag) q = q.contains('mood_tags', [moodTag])
  // 多标签交集匹配：overlaps = 数组有任意交集（取候选池，前端再按权重排序）
  if (moodTags && moodTags.length > 0) q = q.overlaps('mood_tags', moodTags)
  if (sceneTag) q = q.contains('scene_tags', [sceneTag])
  const { data } = await q
  return Array.isArray(data) ? data : []
}

/**
 * 专为情绪引擎设计的商品查询：
 * - 先用情绪标签池做 overlaps 过滤，取最多 60 条候选
 * - 不足 20 条时，追加无情绪过滤的兜底商品补齐至 limit
 * - 返回的商品携带完整 mood_tags，供前端排序
 */
export async function getProductsByEmotion(
  moodTags: string[],
  limit = 40
): Promise<Product[]> {
  if (!moodTags || moodTags.length === 0) {
    return getProducts({ limit })
  }

  // Step1：情绪匹配池（最多 60 条）
  const { data: matched } = await supabase
    .from('products')
    .select('*, stores(id,name,image_url)')
    .eq('is_active', true)
    .overlaps('mood_tags', moodTags)
    .order('created_at', { ascending: false })
    .limit(60)

  const matchedList: Product[] = Array.isArray(matched) ? matched : []

  // Step2：若匹配不足，用无情绪过滤的商品补齐
  if (matchedList.length < limit) {
    const matchedIds = new Set(matchedList.map(p => p.id))
    const { data: fallback } = await supabase
      .from('products')
      .select('*, stores(id,name,image_url)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit - matchedList.length + 10) // 多取一些防止 id 重叠
    const extra: Product[] = Array.isArray(fallback)
      ? fallback.filter(p => !matchedIds.has(p.id)).slice(0, limit - matchedList.length)
      : []
    return [...matchedList, ...extra]
  }

  return matchedList.slice(0, limit)
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data } = await supabase.from('products').select('*, stores(*)').eq('id', id).maybeSingle()
  return data
}

// =====================
// Cart
// =====================
export async function getCartItems(): Promise<CartItem[]> {
  const { data } = await supabase.from('cart_items')
    .select('*, products(*, stores(id,name)), stores(id,name)')
    .order('created_at', { ascending: false })
  return Array.isArray(data) ? data : []
}

export async function addToCart(productId: string, storeId: string, quantity = 1): Promise<void> {
  const { data: existing } = await supabase.from('cart_items')
    .select('id, quantity').eq('product_id', productId).maybeSingle()
  if (existing) {
    await supabase.from('cart_items').update({ quantity: existing.quantity + quantity }).eq('id', existing.id)
  } else {
    await supabase.from('cart_items').insert({ product_id: productId, store_id: storeId, quantity })
  }
}

export async function updateCartQty(id: string, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await supabase.from('cart_items').delete().eq('id', id)
  } else {
    await supabase.from('cart_items').update({ quantity }).eq('id', id)
  }
}

export async function removeCartItem(id: string): Promise<void> {
  await supabase.from('cart_items').delete().eq('id', id)
}

export async function updateCartSelected(id: string, selected: boolean): Promise<void> {
  await supabase.from('cart_items').update({ selected }).eq('id', id)
}

export async function getCartCount(): Promise<number> {
  const { count } = await supabase.from('cart_items').select('*', { count: 'exact', head: true })
  return count ?? 0
}

/** 更新底部 Tab 栏"行囊"徽标数量（行囊是第 4 个 tab，index=3） */
export async function updateCartBadge(): Promise<void> {
  // 留空：实际徽标更新由 src/utils/cartBadge.ts 负责（需静态导入 Taro）
  // 此函数保留以兼容现有调用，无副作用
}

// =====================
// Orders
// =====================
export async function createOrder(items: Array<{
  product_id: string, store_id: string, store_name: string,
  product_name: string, product_image: string | null, price: number, quantity: number
}>, totalAmount: number, paymentMethod: 'wxpay' | 'gold_beans'): Promise<Order | null> {
  const { data: order } = await supabase.from('orders')
    .insert({ order_no: '', total_amount: totalAmount, payment_method: paymentMethod })
    .select().maybeSingle()
  if (!order) return null
  await supabase.from('order_items').insert(
    items.map(i => ({ order_id: order.id, ...i }))
  )
  return order
}

export async function getOrders(status?: OrderStatus, page = 0, limit = 20): Promise<Order[]> {
  let q = supabase.from('orders').select('*, order_items(*)')
    .order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  if (status) q = q.eq('status', status)
  const { data } = await q
  return Array.isArray(data) ? data : []
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data } = await supabase.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle()
  return data
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await supabase.from('orders').update({ status, ...(status === 'completed' ? { paid_at: new Date().toISOString() } : {}) }).eq('id', id)
}

export async function getOrderCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.from('orders').select('status')
  if (!Array.isArray(data)) return {}
  return data.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {})
}

// =====================
// Articles
// =====================
export async function getArticles(page = 0, limit = 20): Promise<Article[]> {
  const { data } = await supabase.from('articles')
    .select('*, profiles(id,nickname,avatar_url)')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return Array.isArray(data) ? data : []
}

export async function getMyArticles(status?: 'draft' | 'published'): Promise<Article[]> {
  let q = supabase.from('articles').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data } = await q
  return Array.isArray(data) ? data : []
}

export async function getArticleById(id: string): Promise<Article | null> {
  const { data } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()
  return data
}

export async function createArticle(
  title: string, content: string, images: string[], tags: string[],
  opts?: { status?: 'draft' | 'published', cover_image?: string }
): Promise<Article | null> {
  const status = opts?.status ?? 'draft'
  const { data } = await supabase.from('articles')
    .insert({ title, content, images, tags, status, is_published: status === 'published', cover_image: opts?.cover_image ?? null })
    .select().maybeSingle()
  return data
}

export async function updateArticle(id: string, updates: {
  title?: string, content?: string, status?: 'draft' | 'published', cover_image?: string
}): Promise<void> {
  const payload: Record<string, unknown> = { ...updates }
  if (updates.status) payload.is_published = updates.status === 'published'
  await supabase.from('articles').update(payload).eq('id', id)
}

export async function deleteArticle(id: string): Promise<void> {
  await supabase.from('articles').delete().eq('id', id)
}

// =====================
// Merchant Applications
// =====================
export async function getMyMerchantApplication(): Promise<MerchantApplication | null> {
  const { data } = await supabase.from('merchant_applications').select('*')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function submitMerchantApplication(info: {
  store_name: string, contact_name: string, contact_phone: string,
  business_type: string, description?: string
}): Promise<void> {
  await supabase.from('merchant_applications').insert(info)
}

// =====================
// Announcements
// =====================
export async function getAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabase.from('announcements').select('*')
    .eq('is_active', true).order('sort_order')
  return Array.isArray(data) ? data : []
}

// =====================
// Search
// =====================
export async function searchProducts(keyword: string, page = 0): Promise<Product[]> {
  return getProducts({ search: keyword, page })
}

// =====================
// Payment / Commission / Points
// =====================

/** 通过 Edge Function 创建订单（三种支付模式） */
export async function createOrderV2(params: {
  items: Array<{ product_id: string; store_id: string; store_name: string; product_name: string; product_image: string | null; price: number; quantity: number }>
  total_amount: number
  pay_mode: import('./types').PayMode
  gold_beans_to_use?: number
  referrer_id?: string
  idempotency_key?: string
  service_type?: 'dine_in' | 'self_pickup' | 'delivery'
}): Promise<{ order: { id: string; order_no: string; status: string }; wxpay_amount: number; gold_beans_used: number; pay_mode: string } | null> {
  const { data, error } = await supabase.functions.invoke('create-order', { body: params })
  if (error || !data?.success) { console.error('[createOrderV2]', error, data); return null }
  return data
}

/** 获取微信支付预支付参数 */
export async function getWechatPayParams(order_id: string, openid: string): Promise<{ timeStamp: string; nonceStr: string; package: string; signType: string; paySign: string } | null> {
  const { data, error } = await supabase.functions.invoke('create-wechat-payment', { body: { order_id, openid } })
  if (error || !data?.success) { console.error('[getWechatPayParams]', error, data); return null }
  return data.paymentParams
}

/** 静默获取 openid（非微信登录用户） */
export async function getWechatOpenid(code: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('get-wechat-openid', { body: { code } })
  if (error || !data?.success) { console.error('[getWechatOpenid]', error, data); return null }
  return data.openid
}

/** 获取用户佣金列表 */
export async function getMyCommissions(page = 0, limit = 20): Promise<import('./types').Commission[]> {
  const { data } = await supabase.from('commissions')
    .select('*').order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return Array.isArray(data) ? data : []
}

/** 获取我的退款记录 */
export async function getMyRefunds(): Promise<import('./types').Refund[]> {
  const { data } = await supabase.from('refunds').select('*').order('created_at', { ascending: false })
  return Array.isArray(data) ? data : []
}

/** 获取订单的退款记录 */
export async function getRefundsByOrderId(orderId: string): Promise<import('./types').Refund[]> {
  const { data } = await supabase.from('refunds').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
  return Array.isArray(data) ? data : []
}

/** 提交退款申请（调Edge Function） */
export async function applyRefund(params: {
  order_id: string; order_no: string; item_index: number
  refund_quantity: number; refund_amount: number; reason: string; description?: string
}): Promise<{ success: boolean; refund_id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('refund-order', { body: params })
  if (error) return { success: false, error: error.message }
  return data
}
export async function getMyPointsLogs(page = 0, limit = 20): Promise<import('./types').PointsLog[]> {
  const { data } = await supabase.from('points_logs')
    .select('*').order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return Array.isArray(data) ? data : []
}

/** 获取用户积分&金豆余额 */
export async function getMyBalance(): Promise<{ points: number; balance: number }> {
  const { data } = await supabase.from('profiles').select('points, balance').maybeSingle()
  return { points: data?.points ?? 0, balance: data?.balance ?? 0 }
}

/** 生成小程序二维码（推广码 or 门店码） */
export async function generateQrcode(params:
  | { type: 'user'; referral_code: string }
  | { type: 'store'; store_short_code: string; referral_code?: string }
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('generate-qrcode', { body: params })
  if (error || !data?.success) { console.error('[generateQrcode]', error, data); return null }
  return data.url as string
}

// =====================
// 商家管理：商品 CRUD
// =====================
export async function getMerchantStore(): Promise<import('./types').Store | null> {
  const { data } = await supabase.from('stores').select('*').maybeSingle()
  return data ?? null
}

export async function getMerchantProducts(storeId: string, page = 0, limit = 20): Promise<import('./types').Product[]> {
  const { data } = await supabase.from('products').select('*')
    .eq('store_id', storeId).order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return data ?? []
}

export async function getProductByBarcode(barcode: string): Promise<import('./types').Product | null> {
  const { data } = await supabase.from('products').select('*, stores(*)').eq('barcode', barcode).maybeSingle()
  return data ?? null
}

export async function createProduct(params: {
  store_id: string; category_id?: string; name: string; description?: string
  price: number; original_price?: number; image_url?: string; stock: number
  barcode?: string; mood_tags?: string[]; scene_tags?: string[]
}): Promise<import('./types').Product | null> {
  const { data, error } = await supabase.from('products').insert({
    ...params, mood_tags: params.mood_tags ?? [], scene_tags: params.scene_tags ?? [], is_active: true,
  }).select().maybeSingle()
  if (error) { console.error('[createProduct]', error); return null }
  return data
}

export async function updateProduct(id: string, params: Partial<{
  name: string; description: string; price: number; original_price: number
  image_url: string; stock: number; barcode: string; is_active: boolean
  mood_tags: string[]; scene_tags: string[]
}>): Promise<boolean> {
  const { error } = await supabase.from('products').update(params).eq('id', id)
  return !error
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return !error
}

// =====================
// 管理员专用 API
// =====================
export async function getAdminStats(): Promise<{ merchants: number; products: number; withdrawals: number; ugc: number }> {
  const [{ count: m }, { count: p }, { count: w }, { count: u }] = await Promise.all([
    supabase.from('merchant_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
    supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('articles').select('*', { count: 'exact', head: true }),
  ])
  return { merchants: m ?? 0, products: p ?? 0, withdrawals: w ?? 0, ugc: u ?? 0 }
}

export async function getAdminMerchantApplications(): Promise<MerchantApplication[]> {
  const { data } = await supabase.from('merchant_applications').select('*')
    .eq('status', 'pending').order('created_at', { ascending: true })
  return (data ?? []) as MerchantApplication[]
}

export async function adminApproveApplication(id: string): Promise<boolean> {
  const app = await supabase.from('merchant_applications').select('user_id, store_name, business_type').eq('id', id).maybeSingle()
  if (!app.data) return false
  const { error } = await supabase.from('merchant_applications').update({ status: 'approved' }).eq('id', id)
  if (error) return false
  // 同步 profiles.merchant_status
  await supabase.from('profiles').update({ merchant_status: 'approved' }).eq('id', app.data.user_id)
  return true
}

export async function adminRejectApplication(id: string, reason: string): Promise<boolean> {
  const app = await supabase.from('merchant_applications').select('user_id').eq('id', id).maybeSingle()
  if (!app.data) return false
  const { error } = await supabase.from('merchant_applications').update({ status: 'rejected', reject_reason: reason }).eq('id', id)
  if (error) return false
  await supabase.from('profiles').update({ merchant_status: 'rejected' }).eq('id', app.data.user_id)
  return true
}

export async function getAdminPendingProducts(): Promise<Product[]> {
  const { data } = await supabase.from('products').select('*')
    .eq('review_status', 'pending').order('created_at', { ascending: true })
  return (data ?? []) as Product[]
}

export async function adminApproveProduct(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').update({ review_status: 'approved' }).eq('id', id)
  return !error
}

export async function adminRejectProduct(id: string, reason: string): Promise<boolean> {
  const { error } = await supabase.from('products').update({ review_status: 'rejected', description: `[驳回] ${reason}` }).eq('id', id)
  return !error
}

export async function getAdminWithdrawals(): Promise<any[]> {
  const { data } = await supabase.from('withdrawals')
    .select('*, profiles(nickname, phone)')
    .eq('status', 'pending').order('created_at', { ascending: true })
  return data ?? []
}

export async function adminApproveWithdrawal(id: string): Promise<boolean> {
  const { error } = await supabase.from('withdrawals').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', id)
  return !error
}

export async function adminRejectWithdrawal(id: string): Promise<boolean> {
  // 驳回时退还余额
  const w = await supabase.from('withdrawals').select('user_id, amount').eq('id', id).maybeSingle()
  if (!w.data) return false
  const { error } = await supabase.from('withdrawals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  // 退还余额至 profiles.balance（单位：金豆，1元=100金豆，但 withdrawal.amount 是元，balance 存金豆）
  // 查当前余额
  const { data: prof } = await supabase.from('profiles').select('balance').eq('id', w.data.user_id).maybeSingle()
  const cur = prof?.balance ?? 0
  const refundBeans = Math.round(Number(w.data.amount) / 0.01) // 元→金豆
  await supabase.from('profiles').update({ balance: cur + refundBeans }).eq('id', w.data.user_id)
  return true
}

export async function getAdminArticles(): Promise<Article[]> {
  const { data } = await supabase.from('articles').select('*, profiles(id, nickname, avatar_url)')
    .order('created_at', { ascending: false }).limit(100)
  return (data ?? []) as Article[]
}

export async function adminToggleArticlePublish(id: string, publish: boolean): Promise<boolean> {
  const { error } = await supabase.from('articles').update({ is_published: publish }).eq('id', id)
  return !error
}

export async function adminDeleteArticle(id: string): Promise<boolean> {
  const { error } = await supabase.from('articles').delete().eq('id', id)
  return !error
}

// 商家订单
export async function getMerchantOrders(storeId: string, page = 0, limit = 20): Promise<any[]> {
  const { data } = await supabase.from('order_items')
    .select('*, orders(id,order_no,status,total_amount,created_at,payment_method)')
    .eq('store_id', storeId).order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return data ?? []
}

// =====================
// 提现管理
// =====================
export async function applyWithdraw(params: {
  store_id?: string; amount: number; withdraw_method: import('./types').WithdrawMethod
  bank_name?: string; bank_account?: string; bank_holder?: string
  alipay_account?: string; remark?: string
}): Promise<import('./types').Withdrawal | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('withdrawals')
    .insert({ ...params, user_id: user.id, status: 'pending' }).select().maybeSingle()
  if (error) { console.error('[applyWithdraw]', error); return null }
  return data
}

export async function getMyWithdrawals(page = 0, limit = 20): Promise<import('./types').Withdrawal[]> {
  const { data } = await supabase.from('withdrawals').select('*')
    .order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  return (data ?? []) as import('./types').Withdrawal[]
}

// =====================
// 收货地址
// =====================
export async function getMyAddresses(): Promise<import('./types').UserAddress[]> {
  const { data } = await supabase.from('user_addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false })
  return (data ?? []) as import('./types').UserAddress[]
}

export async function saveAddress(params: {
  id?: string; name: string; phone: string; province?: string; city?: string; district?: string; detail: string; is_default?: boolean
}): Promise<import('./types').UserAddress | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (params.is_default) await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', user.id)
  if (params.id) {
    const { data } = await supabase.from('user_addresses').update(params).eq('id', params.id).select().maybeSingle()
    return data as import('./types').UserAddress | null
  }
  const { data } = await supabase.from('user_addresses').insert({ ...params, user_id: user.id }).select().maybeSingle()
  return data as import('./types').UserAddress | null
}

export async function deleteAddress(id: string): Promise<boolean> {
  const { error } = await supabase.from('user_addresses').delete().eq('id', id)
  return !error
}

// =====================
// 收藏
// =====================
export async function getMyFavorites(page = 0, limit = 20): Promise<import('./types').Favorite[]> {
  const { data } = await supabase.from('favorites').select('*, products(*, stores(*))').order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  return (data ?? []) as import('./types').Favorite[]
}

export async function toggleFavorite(productId: string): Promise<{ isFav: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isFav: false }
  const { data: existing } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
  if (existing) {
    await supabase.from('favorites').delete().eq('id', existing.id)
    return { isFav: false }
  }
  await supabase.from('favorites').insert({ user_id: user.id, product_id: productId })
  return { isFav: true }
}

export async function isFavorited(productId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
  return !!data
}

// =====================
// 浏览足迹
// =====================
export async function recordFootprint(productId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('footprints').upsert({ user_id: user.id, product_id: productId, viewed_at: new Date().toISOString() }, { onConflict: 'user_id,product_id' })
}

export async function getMyFootprints(page = 0, limit = 20): Promise<import('./types').Footprint[]> {
  const { data } = await supabase.from('footprints').select('*, products(*, stores(*))').order('viewed_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  return (data ?? []) as import('./types').Footprint[]
}

export async function deleteFootprint(id: string): Promise<boolean> {
  const { error } = await supabase.from('footprints').delete().eq('id', id)
  return !error
}

// =====================
// 商品评价
// =====================
export async function submitReviews(reviews: Array<{
  product_id: string | null; order_id: string; order_item_id: string
  rating: number; content?: string
}>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const rows = reviews.map(r => ({ ...r, user_id: user.id }))
  const { error } = await supabase.from('product_reviews').insert(rows)
  if (!error) {
    // 更新订单状态为已完成
    if (reviews[0]?.order_id) {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', reviews[0].order_id)
    }
  }
  return !error
}

export async function getProductReviews(productId: string, page = 0, limit = 10): Promise<import('./types').ProductReview[]> {
  const { data } = await supabase.from('product_reviews')
    .select('*, profiles(id, nickname, avatar_url)')
    .eq('product_id', productId).order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return (data ?? []) as import('./types').ProductReview[]
}

// =====================
// 优惠券
// =====================
export async function getMyCoupons(): Promise<import('./types').Coupon[]> {
  const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false })
  return (data ?? []) as import('./types').Coupon[]
}

// =====================
// 用户设置
// =====================
export async function updateUserProfile(params: { nickname?: string; avatar_url?: string }): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.from('profiles').update(params).eq('id', user.id)
  return !error
}
