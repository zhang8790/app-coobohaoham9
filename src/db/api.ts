import Taro from '@tarojs/taro'
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

// 注销账号：删除用户相关数据并退出登录
export async function deleteUserAccount(): Promise<boolean> {
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return false
  try {
    // 删除用户相关数据（按顺序，避免外键约束报错）
    await supabase.from('cart_items').delete().eq('user_id', uid)
    await supabase.from('user_addresses').delete().eq('user_id', uid)
    await supabase.from('favorites').delete().eq('user_id', uid)
    await supabase.from('footprints').delete().eq('user_id', uid)
    await supabase.from('orders').delete().eq('user_id', uid)
    // 删除 profile（最后删，因为其他表可能引用）
    await supabase.from('profiles').delete().eq('id', uid)
    // 退出登录
    await supabase.auth.signOut()
    return true
  } catch (e) {
    console.error('删除账号失败', e)
    return false
  }
}

// =====================
// Referrals（推荐关系）
// =====================

// 获取我的推广码
export async function ensureReferralCode(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('invite_code').eq('id', user.id).maybeSingle()
  return profile?.invite_code || null
}

// 获取我的推荐列表
export async function getMyReferrals(): Promise<{
  level_1: Profile[]
  level_2: Profile[]
  level_1_count: number
  level_2_count: number
}> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { level_1: [], level_2: [], level_1_count: 0, level_2_count: 0 }

  // 一级推荐（直接推荐人是我）
  const { data: level_1 } = await supabase
    .from('profiles')
    .select('*')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false })

  // 二级推荐（一级推荐人的推荐人）
  const l1Ids = (level_1 || []).map(p => p.id)
  let level_2: any[] = []
  if (l1Ids.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('referrer_id', l1Ids)
      .order('created_at', { ascending: false })
    level_2 = data || []
  }

  return {
    level_1: level_1 || [],
    level_2,
    level_1_count: level_1?.length || 0,
    level_2_count: level_2.length,
  }
}

// =====================
// Stores
// =====================
export async function getStores(category?: string, page = 0, limit = 20, platformFilter?: 'only' | 'exclude'): Promise<Store[]> {
  // 基础查询：所有活跃门店（is_active ≠ false，兼容 NULL 值）
  let q = supabase.from('stores').select('*').not('is_active', 'eq', false).order('rating', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  if (category && category !== '全部') q = q.eq('category', category)

  // 如果需要按平台类型过滤
  if (platformFilter) {
    const { data, error } = await q
    if (error) {
      console.error('[getStores] 查询失败:', error.message, error.code)
      return []
    }
    const all: Store[] = Array.isArray(data) ? data : []
    
    // 双重保险：is_platform 字段 + 名称/ID 兜底
    const PLATFORM_STORE_IDS = new Set([
      'ffffffff-ffff-ffff-ffff-ffffffffffff', // 来店有喜官方店
    ])
    const PLATFORM_STORE_NAMES = ['来店有喜官方店', '来店有喜自营店', '平台自营店']

    const filtered = all.filter(s => {
      const isPlatformById = PLATFORM_STORE_IDS.has(s.id)
      const isPlatformByName = PLATFORM_STORE_NAMES.includes(s.name)
      const isPlatformByField = s.is_platform === true
      const isPlatform = isPlatformById || isPlatformByName || isPlatformByField
      
      if (platformFilter === 'only') return isPlatform
      return !isPlatform  // exclude: 排除自营
    })
    
    console.log(`[getStores] platformFilter=${platformFilter}, 总数=${all.length}, 过滤后=${filtered.length}`)
    console.log('[getStores] 门店列表:', all.map(s => ({ id: s.id.slice(0,8), name: s.name, is_platform: s.is_platform })))
    return filtered
  }

  const { data, error } = await q
  if (error) {
    console.error('[getStores] 查询失败:', error.message)
    return []
  }
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
// 自营门店标识（双重保险：ID + 名称）
const PLATFORM_STORE_IDS = new Set([
  'ffffffff-ffff-ffff-ffff-ffffffffffff', // 来店有喜官方店
])
const PLATFORM_STORE_NAMES = ['来店有喜官方店', '来店有喜自营店', '平台自营店']

/** 判断商品是否属于自营门店 */
function isPlatformProduct(p: Product): boolean {
  const store = (p as any).stores
  if (!store) return false
  return PLATFORM_STORE_IDS.has(store.id || p.store_id)
    || PLATFORM_STORE_NAMES.includes(store.name || '')
    || store.is_platform === true
}

export async function getProducts(opts: {
  storeId?: string, categoryId?: string, search?: string,
  moodTag?: string, moodTags?: string[], sceneTag?: string, page?: number, limit?: number,
  /** 自营门店过滤：'only' = 只看自营商品，'exclude' = 排除自营商品，undefined = 不过滤 */
  platformFilter?: 'only' | 'exclude',
  /** 城市ID：用于过滤城市商品（NULL=全国可见，非NULL=仅该城市可见） */
  cityId?: string,
} = {}): Promise<Product[]> {
  const { storeId, categoryId, search, moodTag, moodTags, sceneTag, page = 0, limit = 20, platformFilter, cityId } = opts
  // 基础查询：所有活跃商品（带上 stores 信息用于 JS 过滤）
  let q = supabase.from('products').select('*, stores(id,name,image_url,is_platform)').not('is_active', 'eq', false)
    .order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  if (storeId) q = q.eq('store_id', storeId)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (search) q = q.ilike('name', `%${search}%`)
  // 单标签精确匹配（contains = 数组包含该值）
  if (moodTag) q = q.contains('mood_tags', [moodTag])
  // 多标签交集匹配：overlaps = 数组有任意交集（取候选池，前端再按权重排序）
  if (moodTags && moodTags.length > 0) q = q.overlaps('mood_tags', moodTags)
  if (sceneTag) q = q.contains('scene_tags', [sceneTag])
  // 城市过滤：NULL=全国可见，非NULL=仅该城市可见
  if (cityId) {
    q = q.or(`city_id.is.null,city_id.eq.${cityId}`)
  }

  const { data, error } = await q
  if (error) {
    console.error('[getProducts] 查询失败:', error.message)
    return []
  }
  const all: Product[] = Array.isArray(data) ? data : []

  // JS 层平台类型过滤（双重保险：is_platform 字段 + ID/名称兜底）
  if (platformFilter === 'only') return all.filter(isPlatformProduct)
  if (platformFilter === 'exclude') return all.filter(p => !isPlatformProduct(p))
  return all
}

// ============================================
// 附近商品推荐（基于用户定位）
// 功能：根据用户输入经纬度，推荐附近门店的商品，并返回距离
// 注意：需要先在 Supabase 执行 RPC_Get_Nearby_Products.sql
// ============================================
export interface NearbyProduct {
  product_id: string
  product_name: string
  product_price: number
  product_image_url: string
  product_mood_tags: string[]
  store_id: string
  store_name: string
  store_address: string
  store_lat: number
  store_lng: number
  distance_km: number  // 距离（公里）
}

export async function getNearbyProducts(
  lat: number,
  lng: number,
  limit: number = 20,
  category?: string
): Promise<NearbyProduct[]> {
  try {
    const { data, error } = await supabase.rpc('get_nearby_products', {
      p_lat: lat,
      p_lng: lng,
      p_limit: limit,
      p_category: category || null,
    })

    if (error) {
      console.error('[getNearbyProducts] 查询失败:', error.message)
      return []
    }

    return (data || []).map((item: any) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      product_price: item.product_price,
      product_image_url: item.product_image_url,
      product_mood_tags: item.product_mood_tags || [],
      store_id: item.store_id,
      store_name: item.store_name,
      store_address: item.store_address,
      store_lat: item.store_lat,
      store_lng: item.store_lng,
      distance_km: Math.round(item.distance_km * 100) / 100,  // 保留2位小数
    }))
  } catch (err) {
    console.error('[getNearbyProducts] 异常:', err)
    return []
  }
}

/**
 * 专为情绪引擎设计的商品查询：
 * - 先用情绪标签池做 overlaps 过滤，取最多 60 条候选
 * - 不足 limit 时，追加无情绪过滤的兜底商品补齐
 * - 返回的商品携带完整 mood_tags，供前端排序
 * @param platformFilter 自营门店过滤：'only'=只看自营，'exclude'=排除自营
 */
export async function getProductsByEmotion(
  moodTags: string[],
  limit = 40,
  platformFilter?: 'only' | 'exclude'
): Promise<Product[]> {
  if (!moodTags || moodTags.length === 0) {
    return getProducts({ limit, platformFilter })
  }

  // JS 层过滤函数（复用 isPlatformProduct 双重保险逻辑）
  const byPlatform = (list: Product[]): Product[] => {
    if (platformFilter === 'only') return list.filter(isPlatformProduct)
    if (platformFilter === 'exclude') return list.filter(p => !isPlatformProduct(p))
    return list
  }

  // Step1：情绪匹配池（最多 60 条），带上 stores 信息用于 JS 过滤
  const { data: matched } = await supabase
    .from('products')
    .select('*, stores(id,name,image_url,is_platform)')
    .eq('is_active', true)
    .overlaps('mood_tags', moodTags)
    .order('created_at', { ascending: false })
    .limit(60)

  let matchedList: Product[] = byPlatform(Array.isArray(matched) ? matched : [])

  // Step2：若匹配不足，用无情绪过滤的商品补齐
  if (matchedList.length < limit) {
    const matchedIds = new Set(matchedList.map(p => p.id))
    const { data: fallback } = await supabase
      .from('products')
      .select('*, stores(id,name,image_url,is_platform)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit - matchedList.length + 10)
    const allFallback = Array.isArray(fallback) ? fallback : []
    const extra: Product[] = byPlatform(allFallback).filter(p => !matchedIds.has(p.id)).slice(0, limit - matchedList.length)
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('cart_items')
    .select('*, products(*, stores(id,name)), stores(id,name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  return Array.isArray(data) ? data : []
}

export async function addToCart(productId: string, storeId: string, quantity = 1): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: existing } = await supabase.from('cart_items')
    .select('id, quantity').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
  if (existing) {
    await supabase.from('cart_items').update({ quantity: existing.quantity + quantity }).eq('id', existing.id)
  } else {
    await supabase.from('cart_items').insert({ user_id: user.id, product_id: productId, store_id: storeId, quantity, selected: true })
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
  opts?: { status?: 'draft' | 'published', cover_image?: string, video_url?: string | null }
): Promise<Article | null> {
  const status = opts?.status ?? 'draft'
  // 获取当前用户 ID（处理 session 过期的情况）
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    console.error('[createArticle] Auth 错误:', authError?.message || '未登录')
    throw new Error('登录已过期，请重新登录后重试')
  }

  const insertData: any = {
    user_id: userData.user.id,
    title,
    content,
    // 有图片才存（空数组不存）
    ...(images && images.length > 0 ? { images } : {}),
    // 有标签才存
    ...(tags && tags.length > 0 ? { tags } : {}),
    // 有视频链接才存
    ...(opts?.video_url ? { video_url: opts.video_url } : {}),
  }
  
  const { data, error } = await supabase.from('articles')
    .insert(insertData)
    .select().maybeSingle()
  
  if (error) {
    console.error('[createArticle] 错误:', error.message)
    throw new Error(error.message || '创建文章失败')
  }
  return data
}

export async function updateArticle(id: string, updates: {
  title?: string, content?: string, status?: 'draft' | 'published', cover_image?: string, images?: string[], video_url?: string | null
}): Promise<void> {
  // 只传最基础字段（title + content），等数据库表结构确认后再加其他字段
  const payload: Record<string, unknown> = {}
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.content !== undefined) payload.content = updates.content
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.cover_image !== undefined) payload.cover_image = updates.cover_image
  if (updates.images !== undefined && updates.images.length > 0) payload.images = updates.images
  if (updates.video_url !== undefined) payload.video_url = updates.video_url
  
  const { error } = await supabase.from('articles').update(payload).eq('id', id)
  if (error) {
    console.error('[updateArticle] 错误:', error.message)
    throw new Error(error.message || '更新文章失败')
  }
}

export async function deleteArticle(id: string): Promise<void> {
  await supabase.from('articles').delete().eq('id', id)
}

/** 增加文章浏览量 */
export async function incrementArticleView(articleId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('articles')
      .select('view_count')
      .eq('id', articleId)
      .maybeSingle()
    const current = data?.view_count || 0
    await supabase
      .from('articles')
      .update({ view_count: current + 1 })
      .eq('id', articleId)
  } catch (e) {
    console.error('[incrementArticleView]', e)
  }
}

// =====================
// Merchant Applications
// =====================
export async function getMyMerchantApplication(): Promise<MerchantApplication | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('merchant_applications').select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function submitMerchantApplication(info: {
  store_name: string, contact_name: string, contact_phone: string,
  business_type: string, description?: string
}): Promise<void> {
  await supabase.from('merchant_applications').insert({
    ...info,
    status: 'pending'  // 显式设置状态为待审核
  })
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

/** 直接创建订单（绕过 Edge Function，RLS 已关闭） */
export async function createOrderV2(params: {
  items: Array<{ product_id: string; store_id: string; store_name: string; product_name: string; product_image: string | null; price: number; quantity: number }>
  total_amount: number
  pay_mode: import('./types').PayMode
  gold_beans_to_use?: number
  referrer_id?: string
  idempotency_key?: string
  service_type?: 'dine_in' | 'self_pickup' | 'delivery'
  address?: string  // 收货地址（外卖配送时必填）
}): Promise<{ order: { id: string; order_no: string; status: string }; wxpay_amount: number; gold_beans_used: number; pay_mode: string } | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    console.log('[createOrderV2] user:', user?.id)
    if (!user) { Taro.showToast({ title: '请先登录', icon: 'none' }); return null }

    // 生成订单号
    const orderNo = `LDYX${Date.now()}${Math.random().toString(36).slice(2, 6)}`

    // 判断是否有多门店
    const storeIds = [...new Set(params.items.map(i => i.store_id).filter(Boolean))]
    const isMultiStore = storeIds.length > 1
    const parentOrderNo = isMultiStore ? `P${orderNo}` : null

    console.log('[createOrderV2] items:', JSON.stringify(params.items))
    console.log('[createOrderV2] pay_mode:', params.pay_mode, 'isMultiStore:', isMultiStore)

    // 纯金豆支付：先扣金豆（RLS 关闭后才能正常查询）
    let goldBeansUsed = 0
    if (params.pay_mode === 'pure_gold' && params.gold_beans_to_use) {
      try {
        const { data: profile, error: profileErr } = await supabase.from('profiles').select('gold_beans').eq('id', user.id).single()
        console.log('[createOrderV2] profile gold_beans:', profile?.gold_beans, 'need:', params.gold_beans_to_use, 'profileErr:', profileErr)
        if (profileErr) { console.warn('[createOrderV2] 查询金豆失败，跳过扣减', profileErr) }
        else if (!profile || profile.gold_beans < params.gold_beans_to_use) {
          Taro.showToast({ title: '金豆余额不足', icon: 'none' }); return null
        } else {
          const { error: deductErr } = await supabase.from('profiles').update({ gold_beans: profile.gold_beans - params.gold_beans_to_use }).eq('id', user.id)
          if (deductErr) { console.warn('[createOrderV2] 金豆扣减失败，继续创建订单', deductErr) }
          else { goldBeansUsed = params.gold_beans_to_use }
        }
      } catch (e) {
        console.warn('[createOrderV2] 金豆操作异常，跳过', e)
      }
    }

    // 创建订单
    const ordersToInsert = params.items.map(item => ({
      user_id: user.id,
      store_id: item.store_id || null,
      order_no: isMultiStore ? `C${orderNo}${item.store_id?.slice(0, 4)}` : orderNo,
      parent_order_no: parentOrderNo,
      total_amount: item.price * item.quantity,
      status: params.pay_mode === 'pure_gold' ? 'pending_ship' : 'pending_pay',
      payment_method: params.pay_mode === 'pure_gold' ? 'gold_beans' : 'wxpay',
      gold_beans_used: isMultiStore ? 0 : goldBeansUsed,
      referrer_id: params.referrer_id || null,
      idempotency_key: null, // 暂时禁用 UNIQUE 约束，避免冲突
      service_type: params.service_type || 'self_pickup',
      address: params.address || null,
    }))

    console.log('[createOrderV2] ordersToInsert:', JSON.stringify(ordersToInsert))

    const { data: insertedOrders, error: orderErr } = await supabase.from('orders').insert(ordersToInsert).select('id, order_no, status')
    console.log('[createOrderV2] insert result:', insertedOrders, 'error:', orderErr)
    if (orderErr) {
      // 详细错误信息：包含 code + message + hint
      const errMsg = orderErr.message || '未知错误'
      const errCode = (orderErr as any).code || ''
      const errHint = (orderErr as any).hint || ''
      const fullErrMsg = `${errMsg}${errCode ? ` [${errCode}]` : ''}${errHint ? ` (${errHint})` : ''}`
      console.error('[创建订单失败]', JSON.stringify(orderErr))
      Taro.showToast({ title: `创建订单失败: ${fullErrMsg}`, icon: 'none', duration: 6000 })
      return null
    }

    // 创建订单商品
    if (insertedOrders && insertedOrders.length > 0) {
      const orderItems = insertedOrders.map((o, idx) => ({
        order_id: o.id,
        product_id: params.items[idx]?.product_id || '',
        quantity: params.items[idx]?.quantity || 1,
        price: params.items[idx]?.price || 0,
        created_at: new Date().toISOString(),
      }))
      await supabase.from('order_items').insert(orderItems)
    }

    // ===== 锁客：用户首次在该门店下单 → 建立 user_store_relation =====
    if (insertedOrders && insertedOrders.length > 0) {
      for (const order of insertedOrders) {
        if (!order.store_id) continue
        try {
          const { data: exist } = await supabase
            .from('user_store_relation').select('id')
            .eq('user_id', user.id).eq('store_id', order.store_id).maybeSingle()
          if (!exist) {
            await supabase.from('user_store_relation').insert({
              user_id: user.id,
              store_id: order.store_id,
              lock_type: 'order',
            })
            console.log(`[锁客] user=${user.id} locked to store=${order.store_id}`)
          }
        } catch (e) { console.warn('[锁客] 失败(不影响)', e) }
      }
    }
    // =========================================================================

    // ===== 分佣 + 积分处理 =====
    if (insertedOrders && insertedOrders.length > 0) {
      for (const order of insertedOrders) {
        try { await distributeCommissionDirect(order.id, user.id) }
        catch (e) { console.warn('[createOrderV2] 分佣失败(不影响订单)', e) }
      }
    }
    // =========================================================================

    const mainOrder = insertedOrders?.[0]
    if (!mainOrder) { Taro.showToast({ title: '订单创建异常', icon: 'none' }); return null }

    return {
      order: { id: mainOrder.id, order_no: isMultiStore ? parentOrderNo! : mainOrder.order_no, status: mainOrder.status },
      wxpay_amount: params.pay_mode === 'pure_gold' ? 0 : params.total_amount,
      gold_beans_used: goldBeansUsed,
      pay_mode: params.pay_mode,
    }
  } catch (err: any) {
    console.error('[createOrderV2] 异常', err);
    Taro.showToast({ title: `创建订单失败: ${err.message}`, icon: 'none' });
    return null
  }
}

/** 直接 DB 操作：分佣 + 积分（替代原 Edge Function distribute-commission） */
async function distributeCommissionDirect(orderId: string, buyerId: string): Promise<void> {
  try {
    // 1. 获取订单信息
    const { data: order } = await supabase
      .from('orders').select('*').eq('id', orderId).single()
    if (!order || order.commission_distributed) return

    const total = order.total_amount || 0
    if (total <= 0) return

    // 2. 获取推广关系（L1 = 直接推荐人，L2 = 推荐人的推荐人）
    const { data: buyerProfile } = await supabase
      .from('profiles').select('invited_by, referrer_id').eq('id', buyerId).single()

    const l1UserId = order.referrer_id || buyerProfile?.invited_by || null
    if (!l1UserId) {
      // 无推广关系，只加积分
      await addBuyerPoints(buyerId, orderId, total)
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', orderId)
      return
    }

    const { data: l1Profile } = await supabase
      .from('profiles').select('invited_by').eq('id', l1UserId).single()
    const l2UserId = l1Profile?.invited_by || null

    // 3. 获取分佣比例（从 store_categories，默认 5% L1 / 2% L2）
    let l1Rate = 0.05, l2Rate = 0.02
    if (order.store_id) {
      const { data: store } = await supabase
        .from('stores').select('category_id').eq('id', order.store_id).single()
      if (store?.category_id) {
        const { data: cat } = await supabase
          .from('store_categories').select('commission_rate').eq('id', store.category_id).single()
        if (cat?.commission_rate) {
          l1Rate = cat.commission_rate / 100
          l2Rate = Math.min(l2Rate, l1Rate / 2)
        }
      }
    }

    // P0 修复：金额计算用整数分，避免浮点精度问题
    const totalCents = Math.round(total * 100)
    const l1Amount = Math.round(totalCents * l1Rate) / 100
    const l2Amount = l2UserId ? Math.round(totalCents * l2Rate) / 100 : 0

    // 4. 写入分佣记录 + 更新受益人余额
    const commissions = []
    if (l1Amount > 0) {
      commissions.push({
        order_id: orderId, order_no: order.order_no,
        beneficiary_id: l1UserId, payer_id: buyerId,
        level: 1, rank_at_time: '江湖散修', ratio: l1Rate,
        pool_amount: total, commission_amount: l1Amount,
        b_coef: 1.0, status: 'pending' as const,
      })
      const { data: l1Bal } = await supabase.from('profiles')
        .select('total_commission, settled_commission').eq('id', l1UserId).single()
      if (l1Bal) {
        await supabase.from('profiles').update({
          total_commission: Math.round((l1Bal.total_commission + l1Amount) * 100) / 100,
          settled_commission: Math.round((l1Bal.settled_commission + l1Amount) * 100) / 100,
        }).eq('id', l1UserId)
      }
    }
    if (l2Amount > 0 && l2UserId) {
      commissions.push({
        order_id: orderId, order_no: order.order_no,
        beneficiary_id: l2UserId, payer_id: buyerId,
        level: 2, rank_at_time: '江湖散修', ratio: l2Rate,
        pool_amount: total, commission_amount: l2Amount,
        b_coef: 1.0, status: 'pending' as const,
      })
      const { data: l2Bal } = await supabase.from('profiles')
        .select('total_commission, settled_commission').eq('id', l2UserId).single()
      if (l2Bal) {
        await supabase.from('profiles').update({
          total_commission: Math.round((l2Bal.total_commission + l2Amount) * 100) / 100,
          settled_commission: Math.round((l2Bal.settled_commission + l2Amount) * 100) / 100,
        }).eq('id', l2UserId)
      }
    }

    if (commissions.length > 0) {
      await supabase.from('commissions').insert(commissions)
    }

    // 5. 买家积分（1元 = 1积分，简化版）
    await addBuyerPoints(buyerId, orderId, total)

    // 6. 标记订单已分佣
    await supabase.from('orders').update({
      commission_distributed: true,
      buyer_points: Math.round(total),
    }).eq('id', orderId)

  } catch (e) {
    console.error('[distributeCommissionDirect] 异常', e)
  }
}

/** 给买家加积分 */
async function addBuyerPoints(buyerId: string, orderId: string, total: number): Promise<void> {
  const points = Math.round(total) // 1元 = 1积分（简化）
  const { data: profile } = await supabase.from('profiles')
    .select('points').eq('id', buyerId).single()
  if (!profile) return
  const newBalance = (profile.points || 0) + points
  await supabase.from('profiles').update({ points: newBalance }).eq('id', buyerId)
  await supabase.from('points_logs').insert({
    user_id: buyerId,
    order_id: orderId,
    type: 'purchase_earn' as any,
    delta: points,
    balance_after: newBalance,
    remark: `订单消费获得积分`,
  }).then(() => {})
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

/** 提交退款申请（直接 DB 操作，绕过 Edge Function）
 *  退款成功后自动处理：分佣退回、积分退回、金豆退回
 */
export async function applyRefund(params: {
  order_id: string; order_no: string; item_index: number
  refund_quantity: number; refund_amount: number; reason: string; description?: string
}): Promise<{ success: boolean; refund_id?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '请先登录' }

    // P0 修复：幂等性检查，防止同一订单重复申请退款
    const { data: existingRefund } = await supabase
      .from('refunds').select('id, status').eq('order_id', params.order_id).maybeSingle()
    if (existingRefund) {
      // 状态码映射为中文
      const statusMap: Record<string, string> = {
        'pending': '待审核',
        'approved': '审核通过',
        'rejected': '已拒绝',
        'completed': '已完成退款',
        'cancelled': '已取消',
      }
      const statusText = statusMap[existingRefund.status] || existingRefund.status
      return { success: false, error: `该订单已申请退款，当前状态：${statusText}` }
    }

    // 获取订单详情（用于分佣/积分/金豆退回 + 校验退款金额）
    const { data: order, error: orderErr } = await supabase
      .from('orders').select('*').eq('id', params.order_id).single()
    if (orderErr || !order) {
      console.error('[applyRefund] 订单不存在', orderErr)
      return { success: false, error: '订单不存在' }
    }

    // P1 修复：校验退款金额和数量
    const paidAmount = Number(order.total_amount) || 0
    const refundedAmount = Number((order as any).refunded_amount) || 0
    const maxRefundAmount = Math.round((paidAmount - refundedAmount) * 100) / 100
    if (params.refund_amount > maxRefundAmount) {
      return { success: false, error: `退款金额不能超过可退金额 ¥${maxRefundAmount.toFixed(2)}` }
    }
    if (params.refund_amount <= 0) {
      return { success: false, error: '退款金额必须大于0' }
    }

    // 校验退款数量（如有 order_items 则校验）
    if (params.refund_quantity && params.refund_quantity > 0) {
      const { data: oItems } = await supabase.from('order_items')
        .select('quantity').eq('order_id', params.order_id).maybeSingle()
      if (oItems && params.refund_quantity > (oItems as any).quantity) {
        return { success: false, error: `退款数量不能超过购买数量（${(oItems as any).quantity}）` }
      }
    }

    // 生成退款单号
    const refundNo = `RF${Date.now()}${Math.random().toString(36).slice(2, 6)}`

    // 插入退款记录（测试阶段自动审批通过）
    const { data, error } = await supabase.from('refunds').insert({
      refund_no: refundNo,
      order_id: params.order_id,
      order_no: params.order_no,
      item_index: params.item_index,
      user_id: user.id,
      initiated_by: 'user',
      status: 'completed',
      refund_quantity: params.refund_quantity,
      refund_amount: params.refund_amount,
      reason: params.reason,
      description: params.description || null,
      version: 1,
      completed_at: new Date().toISOString(),
    }).select('id').maybeSingle()

    if (error) { console.error('[applyRefund]', error); return { success: false, error: error.message } }

    // ===== ① 分佣退回 =====
    const { data: commissions } = await supabase
      .from('commissions').select('*').eq('order_id', params.order_id).in('status', ['settled', 'pending'])
    if (commissions && commissions.length > 0) {
      for (const comm of commissions) {
        const { data: ben } = await supabase
          .from('profiles').select('total_commission,settled_commission').eq('id', comm.beneficiary_id).single()
        if (ben) {
          await supabase.from('profiles').update({
            total_commission: Math.max(0, ben.total_commission - comm.commission_amount),
            settled_commission: Math.max(0, ben.settled_commission - comm.commission_amount),
          }).eq('id', comm.beneficiary_id)
        }
        await supabase.from('commissions').update({ status: 'refunded' as any }).eq('id', comm.id)
      }
    }

    // ===== ② 积分退回 =====
    if (order.buyer_points && order.buyer_points > 0) {
      const { data: profile } = await supabase.from('profiles').select('points').eq('id', user.id).single()
      if (profile && profile.points > 0) {
        const newPoints = Math.max(0, profile.points - order.buyer_points)
        await supabase.from('profiles').update({ points: newPoints }).eq('id', user.id)
        await supabase.from('points_logs').insert({
          user_id: user.id, order_id: params.order_id,
          type: 'refund_deduct' as any,
          delta: -order.buyer_points, balance_after: newPoints,
          remark: `订单${params.order_no}退款，扣除获得积分`,
        })
      }
    }

    // ===== ③ 金豆退回（退回到用户账户）=====
    if (order.gold_beans_used && order.gold_beans_used > 0) {
      const { data: profile } = await supabase.from('profiles').select('gold_beans').eq('id', user.id).single()
      if (profile) {
        await supabase.from('profiles').update({ gold_beans: profile.gold_beans + order.gold_beans_used }).eq('id', user.id)
      }
    }

    // ===== ④ 更新订单状态 =====
    await supabase.from('orders').update({
      status: 'after_sale',
      refund_status: 'refunded',
      refunded_amount: (order.refunded_amount || 0) + params.refund_amount,
      updated_at: new Date().toISOString(),
    }).eq('id', params.order_id)

    // P0 修复：库存回滚
    try {
      const { data: oItems } = await supabase.from('order_items').select('product_id, quantity').eq('order_id', params.order_id)
      if (oItems && oItems.length > 0) {
        for (const it of oItems) {
          const { data: prod } = await supabase.from('products').select('stock').eq('id', it.product_id).maybeSingle()
          if (prod) {
            await supabase.from('products').update({ stock: (prod.stock || 0) + it.quantity }).eq('id', it.product_id)
          }
        }
      }
    } catch (e) { console.warn('[applyRefund] 库存回滚失败(不影响退款)', e) }

    return { success: true, refund_id: data?.id }
  } catch (err: any) {
    console.error('[applyRefund] 异常', err)
    return { success: false, error: err.message }
  }
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
  | { type: 'store'; short_code: string; referral_code?: string }
): Promise<string | null> {
  // 构造小程序路径（用于普通二维码内容）
  let qrContent = ''
  if (params.type === 'user') {
    const ref = (params.referral_code || '').toUpperCase().slice(0, 6)
    if (!ref) return null
    qrContent = `来店有喜·推广码：${ref}\n扫码成为${ref}的推荐用户`
  } else {
    const sc = (params.short_code || '').toUpperCase().slice(0, 8)
    const ref = params.referral_code ? (params.referral_code || '').toUpperCase().slice(0, 6) : ''
    if (!sc) return null
    qrContent = `来店有喜·门店码：${sc}${ref ? `\n推荐人：${ref}` : ''}`
  }

  // 方案1：尝试 Edge Function（生产环境，生成真正的微信小程序码）
  try {
    const { data, error } = await supabase.functions.invoke('qrcodes', { body: params })
    if (!error && data?.success && data?.url) {
      console.log('[generateQrcode] Edge Function 成功')
      return data.url as string
    }
    console.log('[generateQrcode] Edge Function 失败，使用备用方案', error || data?.error)
  } catch (e) {
    console.log('[generateQrcode] Edge Function 异常，使用备用方案', e)
  }

  // 方案2：备用方案 — 使用公共 QR Code API 生成 URL 二维码（微信可识别跳转）
  // 注意：这不是微信小程序码，但扫码后微信可显示链接/跳转
  try {
    const fallbackUrl = params.type === 'user'
      ? `https://pyqgsxcjmijtbstwthbn.supabase.co?ref=${params.referral_code}`
      : `https://pyqgsxcjmijtbstwthbn.supabase.co?store=${params.short_code}`

    const publicUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(fallbackUrl)}&color=c2410c&bgcolor=ffffff`
    console.log('[generateQrcode] 使用公共 QR API (URL模式):', publicUrl.slice(0, 80) + '...')
    return publicUrl
  } catch (e) {
    console.error('[generateQrcode] 公共 API 也失败:', e)
    return null
  }
}

// =====================
// 商家管理：商品 CRUD
// =====================
// =====================
// 商家管理：门店 CRUD
// =====================
export async function updateStore(storeId: string, params: Partial<{
  name: string; description: string; address: string; phone: string
  category: string; image_url: string | null; banner_url: string | null
  is_active: boolean; is_open: boolean; open_time: string; close_time: string
  delivery_enabled: boolean; pickup_enabled: boolean
  delivery_radius: number | string; delivery_fee: number | string
  free_delivery_threshold: number | string; min_order_amount: number | string
  announcement: string; contact: string; scene_tags: string[]
  referral_rate: number | string
}>): Promise<boolean> {
  // 清理字段类型：Input 返回 string，DB 要 numeric/boolean
  // 注意：image_url/banner_url 为 null 时也需要传（用于清空旧值）
  const NULLABLE_FIELDS = ['image_url', 'banner_url']
  const clean: Record<string, any> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue  // undefined 不传
    if (v === null && !NULLABLE_FIELDS.includes(k)) continue  // null 跳过（除了可清空的字段）
    if (['delivery_radius', 'delivery_fee', 'free_delivery_threshold', 'min_order_amount', 'referral_rate'].includes(k)) {
      clean[k] = Number(v)
    } else {
      clean[k] = v
    }
  }
  console.log('[updateStore]', clean)
  const { error } = await supabase.from('stores').update(clean).eq('id', storeId)
  if (error) console.error('[updateStore] error:', error)
  return !error
}

export async function getMerchantStore(): Promise<import('./types').Store | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // 通过 owner_id 过滤，确保只返回当前商家自己拥有的门店
  const { data } = await supabase.from('stores').select('*')
    .eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ?? null
}

export async function getMerchantProducts(storeId: string, page = 0, limit = 20): Promise<import('./types').Product[]> {
  const { data } = await supabase.from('products').select('*')
    .eq('store_id', storeId).order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  return data ?? []
}

export async function getProductByBarcode(barcode: string): Promise<import('./types').Product | null> {
  const code = String(barcode).trim()
  console.log('[getProductByBarcode] 查询条形码:', JSON.stringify(code))
  const { data } = await supabase.from('products').select('*, stores(*)').eq('barcode', code).maybeSingle()
  console.log('[getProductByBarcode] 查询结果:', data ? `找到: ${data.name} (id=${data.id})` : '未找到')
  return data ?? null
}

export async function createProduct(params: {
  store_id: string; category_id?: string; name: string; description?: string
  price: number; original_price?: number; image_url?: string; stock: number
  barcode?: string; mood_tags?: string[]; scene_tags?: string[]
  // 新增字段
  main_image?: string; sub_images?: string[]; detail_images?: string[]
  video_url?: string; cost_price?: number; discount_rate?: number
}): Promise<import('./types').Product | null> {
  // 先查门店信息，让新建商品携带 stores 关联数据
  let storeInfo: any = null
  if (params.store_id) {
    const { data: s } = await supabase.from('stores').select('*').eq('id', params.store_id).maybeSingle()
    storeInfo = s
  }
  const { data, error } = await supabase.from('products').insert({
    ...params,
    mood_tags: params.mood_tags ?? [],
    scene_tags: params.scene_tags ?? [],
    is_active: true,
    main_image: params.main_image || params.image_url || null,
    sub_images: params.sub_images ?? null,
    detail_images: params.detail_images ?? null,
    video_url: params.video_url ?? null,
    cost_price: params.cost_price ?? null,
    discount_rate: params.discount_rate ?? null,
  }).select().maybeSingle()
  if (error) { console.error('[createProduct]', error); return null }
  // 本地模式：手动补上 stores 关联（mock 层不支持嵌套查询）
  if (data && storeInfo && !data.stores) {
    ;(data as any).stores = storeInfo
  }
  return data
}

export async function updateProduct(id: string, params: Partial<{
  name: string; description: string; price: number; original_price: number
  image_url: string; stock: number; barcode: string; is_active: boolean
  mood_tags: string[]; scene_tags: string[]
  // 新增字段
  main_image: string; sub_images: string[]; detail_images: string[]
  video_url: string; cost_price: number; discount_rate: number
}>): Promise<boolean> {
  const { error } = await supabase.from('products').update(params).eq('id', id)
  return !error
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return !error
}

// =====================
// 文章锁客 API
// =====================

/**
 * 文章预览时锁客
 * 当用户通过文章分享链接进入，预览文章时自动建立锁客关系
 * @param storeId 门店 ID
 * @param inviterCode 推广码（ref 参数）
 */
export async function lockCustomerByArticle(storeId: string, inviterCode: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !storeId || !inviterCode) return

    // 检查是否已锁客
    const { data: exist } = await supabase
      .from('user_store_relation')
      .select('id')
      .eq('user_id', user.id)
      .eq('store_id', storeId)
      .maybeSingle()

    if (exist) return  // 已锁客，不重复插入

    // 插入锁客关系
    await supabase.from('user_store_relation').insert({
      user_id: user.id,
      store_id: storeId,
      lock_type: 'article',  // 文章分享锁客
      locked_at: new Date().toISOString(),
    })

    console.log(`[文章锁客] user=${user.id} locked to store=${storeId}`)
  } catch (e) {
    console.warn('[文章锁客] 失败(不影响)', e)
  }
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
  const app = await supabase.from('merchant_applications').select('user_id, store_name, business_type, description, contact_phone').eq('id', id).maybeSingle()
  if (!app.data) return false
  
  // 1. 更新申请状态
  const { error } = await supabase.from('merchant_applications').update({ status: 'approved' }).eq('id', id)
  if (error) return false
  
  // 2. 同步 profiles.merchant_status
  await supabase.from('profiles').update({ merchant_status: 'approved' }).eq('id', app.data.user_id)
  
  // 3. 创建门店记录（关键！）
  const { error: storeError } = await supabase.from('stores').insert({
    owner_id: app.data.user_id,
    name: app.data.store_name,
    description: app.data.description || null,
    phone: app.data.contact_phone || null,
    category: app.data.business_type || '其他',
    is_active: true,
    rating: 0,
  })
  
  if (storeError) {
    console.error('[adminApproveApplication] 创建门店失败:', storeError)
    return false
  }
  
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
  // 退还余额至 profiles.balance
  // profiles.balance 字段是 numeric(10,2)，单位是「元」（与 withdrawal.amount 一致）
  // 1 元 = 100 金豆，但 balance 存的是「元」数（金豆余额存在 profiles.points）
  const { data: prof } = await supabase.from('profiles').select('balance').eq('id', w.data.user_id).maybeSingle()
  const cur = Number(prof?.balance ?? 0)
  const refundAmount = Number(w.data.amount)
  await supabase.from('profiles').update({ balance: cur + refundAmount }).eq('id', w.data.user_id)
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
  try {
    const { data: existing } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
    if (existing) {
      await supabase.from('favorites').delete().eq('id', existing.id)
      return { isFav: false }
    }
    await supabase.from('favorites').insert({ user_id: user.id, product_id: productId })
    return { isFav: true }
  } catch (e) {
    console.error('[toggleFavorite]', e)
    return { isFav: false }
  }
}

export async function isFavorited(productId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  try {
    const { data } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
    return !!data
  } catch (e) {
    console.error('[isFavorited]', e)
    return false
  }
}

// =====================
// 浏览足迹
// =====================
export async function recordFootprint(productId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  try {
    await supabase.from('footprints').upsert({
      user_id: user.id,
      product_id: productId,
      viewed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_id' })
  } catch (e) {
    console.error('[recordFootprint]', e)
  }
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
