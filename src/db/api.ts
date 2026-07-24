import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'
import type {
  Profile, Store, StoreCategory, Product, CartItem,


  EmotionAsset, EmotionTongbaoLog, EmotionTongbaoReason,
  EmotionBadgeDef, EmotionBadgeGrant,
  ProductEmotion, Order, OrderStatus, Article,
  MerchantApplication, Announcement, EmotionClaim} from './types'
import { generateEmotionDescription } from '@/utils/emotion-description'
import { type ProductCareInfo } from '@/utils/product-care'
import { MOOD_TAGS, MOOD_CATEGORIES } from '@/utils/mood-tags'
import { calculateDynamicScore, RANK_CONFIG_TABLE_V5, calculateCommissionV5, computeMemberRank, getActiveMultiplier, getRecruitMultiplier, calcWithholdingTax, PLATFORM_CONFIG } from '@/utils/commission-calculator-v5'
import { bumpCartCount } from '@/utils/cartStore'
import { checkIllegalWords } from '@/utils/compliance-words'
import { calculateDistance } from '@/utils/lbs-service'

// 食材食疗导购新列（迁移 00100）：DB 未执行时软降级剥离，保证既有上架不失败
const NEW_PRODUCT_COLUMNS = [
  'overall_nature', 'health_tag', 'emotion_tag', 'match_goods', 'conflict_goods', 'aux_remind',
]
const NEW_COLUMN_RE = /overall_nature|health_tag|emotion_tag|match_goods|conflict_goods|aux_remind/
function stripNewProductColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(payload)) {
    if (!NEW_PRODUCT_COLUMNS.includes(k)) out[k] = payload[k]
  }
  return out
}

// =====================
// Profiles
// =====================
export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return data
}

export async function updateProfile(updates: Partial<Pick<Profile, 'nickname' | 'avatar_url' | 'constitution_tags'>>): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return
  await supabase.from('profiles').update(updates).eq('id', uid)
}

// 注销账号：调用 delete-account 云函数（service_role）彻底删除账号及其关联数据，
// 含 auth.users 认证记录（PIPL 要求：原凭证失效、不可再登录）。客户端无法删除 auth 账号，必须走云函数。
export async function deleteUserAccount(): Promise<boolean> {
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return false
  try {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
    if (error) {
      console.error('注销账号失败', error)
      return false
    }
    // 本地清除会话
    await supabase.auth.signOut()
    return true
  } catch (e) {
    console.error('注销账号异常', e)
    return false
  }
}

// =====================
// Referrals（推荐关系）
// =====================

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// 获取我的推广码（无则自动生成）
// 兼容 profiles 同时存在 referral_code 与 invite_code 两列的历史情况
export async function ensureReferralCode(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles')
    .select('referral_code, invite_code')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.referral_code) return profile.referral_code
  if (profile?.invite_code) return profile.invite_code

  // 生成并写入，失败则重试一次（避免唯一冲突）
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateReferralCode()
    const { error } = await supabase.from('profiles')
      .update({ invite_code: code, referral_code: code })
      .eq('id', user.id)
    if (!error) return code
    console.warn('[ensureReferralCode] 生成失败，重试:', error.message)
  }
  return null
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
  const l1Ids = (level_1 || []).map((p: any) => p.id)
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
    level_2_count: level_2.length}
}

// =====================
// Pending Referrals（预归属）
// =====================

// 获取设备ID（微信小程序环境）
function getDeviceId(): string {
  try {
    const systemInfo = Taro.getSystemInfoSync()
    // 使用设备型号 + 系统版本 + 随机ID生成设备指纹
    const storedId = Taro.getStorageSync('device_id')
    if (storedId) return storedId
    
    const randomId = Math.random().toString(36).substring(2, 15)
    const deviceId = `device_${systemInfo.model || 'unknown'}_${randomId}`
    Taro.setStorageSync('device_id', deviceId)
    return deviceId
  } catch (e) {
    // 降级方案：使用随机ID
    const storedId = Taro.getStorageSync('device_id')
    if (storedId) return storedId
    const randomId = Math.random().toString(36).substring(2, 15)
    Taro.setStorageSync('device_id', randomId)
    return randomId
  }
}

// 创建预归属记录（扫码时调用，不需要登录）
export async function createPendingReferral(params: {
  referral_code: string
  store_id?: string
  campaign_id?: string
}): Promise<boolean> {
  try {
    const deviceId = getDeviceId()
    const { error } = await supabase
      .from('pending_referrals')
      .insert({
        device_id: deviceId,
        referral_code: params.referral_code,
        store_id: params.store_id || null,
        campaign_id: params.campaign_id || null,
        status: 'pending'})
    
    if (error) {
      console.error('[createPendingReferral] 失败:', error.message)
      return false
    }
    
    // 同时保存到本地缓存（注册时备用）
    Taro.setStorageSync('pending_referral_code', params.referral_code)
    if (params.store_id) Taro.setStorageSync('pending_store_id', params.store_id)
    if (params.campaign_id) Taro.setStorageSync('pending_campaign_id', params.campaign_id)
    
    console.log('[createPendingReferral] 成功:', params.referral_code)
    return true
  } catch (e) {
    console.error('[createPendingReferral] 异常:', e)
    return false
  }
}

// 转化预归属记录（注册时调用）
export async function convertPendingReferral(userId: string): Promise<boolean> {
  try {
    const deviceId = getDeviceId()
    
    // 调用数据库函数转化预归属记录
    const { error } = await supabase
      .rpc('convert_pending_referral', {
        p_device_id: deviceId,
        p_user_id: userId})
    
    if (error) {
      console.error('[convertPendingReferral] 失败:', error.message)
      return false
    }
    
    // 清除本地缓存
    Taro.removeStorageSync('pending_referral_code')
    Taro.removeStorageSync('pending_store_id')
    Taro.removeStorageSync('pending_campaign_id')
    
    console.log('[convertPendingReferral] 成功:', userId)
    return true
  } catch (e) {
    console.error('[convertPendingReferral] 异常:', e)
    return false
  }
}

// 检查并绑定本地缓存的推广码（注册时调用）
export async function checkAndBindReferralCode(userId: string): Promise<boolean> {
  try {
    const referralCode = Taro.getStorageSync('pending_referral_code')
    if (!referralCode) return false

    // 通过 invite_code / referral_code 找到推荐人，并把 referrer_id 设为其用户 ID
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id')
      .or(`invite_code.eq.${referralCode},referral_code.eq.${referralCode}`)
      .maybeSingle()
    if (!referrer) {
      console.warn('[checkAndBindReferralCode] 未找到推广码:', referralCode)
      return false
    }

    const { error } = await supabase
      .from('profiles')
      .update({ referrer_id: referrer.id })
      .eq('id', userId)
      .is('referrer_id', null)

    if (error) {
      console.error('[checkAndBindReferralCode] 失败:', error.message)
      return false
    }

    console.log('[checkAndBindReferralCode] 成功绑定 referrer_id:', referrer.id)
    return true
  } catch (e) {
    console.error('[checkAndBindReferralCode] 异常:', e)
    return false
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
      'ffffffff-ffff-ffff-ffff-ffffffffffff', // 来电有喜官方店
    ])
    const PLATFORM_STORE_NAMES = ['来电有喜官方店', '来电有喜自营店', '平台自营店']

    const filtered = all.filter(s => {
      const isPlatformById = PLATFORM_STORE_IDS.has(s.id)
      const isPlatformByName = PLATFORM_STORE_NAMES.includes(s.name)
      const isPlatformByField = s.is_platform === true
      const isPlatform = isPlatformById || isPlatformByName || isPlatformByField
      // 现仅自营门店：合作品牌(partner_brand)已统一归并到自营，不再区分
      if (platformFilter === 'only') return isPlatform
      return !isPlatform  // exclude: 非自营（当前已无，归并后全为自营）
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

// =====================
// 最近直营门店（按定位切换「当前门店」，客户端计算，不依赖缺失的 find_nearest_stores RPC）
// =====================
export interface NearestStore {
  id: string
  store_name: string
  address: string
  distance_km: number
  is_open: boolean
  lat: number
  lng: number
}

/**
 * 根据经纬度返回最近的直营门店列表（升序）。
 * 直营判定：is_platform=true（品牌馆已归并，partner_brand 恒 NULL）。
 */
export async function getNearestStores(lat: number, lng: number, limit = 20): Promise<NearestStore[]> {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, address, lat, lng, is_open, is_platform')
      .not('is_active', 'eq', false)
    if (error) {
      console.error('[getNearestStores] 查询失败:', error.message)
      return []
    }
    const list = (data || [])
      .filter((s: any) => s.is_platform === true && s.lat != null && s.lng != null)
      .map((s: any) => ({
        id: s.id,
        store_name: s.name,
        address: s.address || '',
        lat: s.lat,
        lng: s.lng,
        is_open: s.is_open,
        distance_km: Math.round(calculateDistance(lat, lng, s.lat, s.lng) * 100) / 100,
      }))
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
    return list.slice(0, limit)
  } catch (err) {
    console.error('[getNearestStores] 异常:', err)
    return []
  }
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
  'ffffffff-ffff-ffff-ffff-ffffffffffff', // 来电有喜官方店
])
const PLATFORM_STORE_NAMES = ['来电有喜官方店', '来电有喜自营店', '平台自营店']

/** 判断商品是否属于自营门店（现仅自营门店：合作品牌已统一归并到自营，partner_brand 不再作为排除条件） */
function isPlatformProduct(p: Product): boolean {
  const store = (p as any).stores
  if (!store) return false
  return (
    PLATFORM_STORE_IDS.has(store.id || p.store_id)
    || PLATFORM_STORE_NAMES.includes(store.name || '')
    || store.is_platform === true
  )
}

export async function getProducts(opts: {
  storeId?: string, categoryId?: string, search?: string,
  moodTag?: string, moodTags?: string[], sceneTag?: string, page?: number, limit?: number,
  /** 自营门店过滤：'only' = 只看自营商品，'exclude' = 排除自营商品，undefined = 不过滤 */
  platformFilter?: 'only' | 'exclude',
  /** 城市ID：用于过滤城市商品（NULL=全国可见，非NULL=仅该城市可见） */
  cityId?: string} = {}): Promise<Product[]> {
  const { storeId, categoryId, search, moodTag, moodTags, sceneTag, page = 0, limit = 20, platformFilter, cityId } = opts
  // 基础查询：所有活跃商品（带上 stores 信息用于 JS 过滤；现仅自营门店，partner_brand 已归并）
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
  care?: ProductCareInfo  // 商品「关怀层」信息（食养/情绪/适配），由前端编译注入，不影响后端
}

export async function getNearbyProducts(
  lat: number,
  lng: number,
  limit: number = 20,
  category?: string,
  /** 自营门店过滤：'only' = 只看自营商品，'exclude' = 排除自营商品 */
  platformFilter?: 'only' | 'exclude'
): Promise<NearbyProduct[]> {
  try {
    const { data, error } = await supabase.rpc('get_nearby_products', {
      p_lat: lat,
      p_lng: lng,
      p_limit: limit * 3, // 多取一些，过滤后再截断
      p_category: category || null})

    if (error) {
      console.error('[getNearbyProducts] 查询失败:', error.message)
      return []
    }

    let results = (data || []).map((item: any) => ({
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
      distance_km: Math.round(item.distance_km * 100) / 100,
      is_platform: item.is_platform ?? false }))

    // 根据 platformFilter 过滤（现仅自营门店：partner_brand 已归并，不再排除）
    if (platformFilter) {
      results = results.filter((item: any) => {
        const isOfficial = item.is_platform === true ||
          item.store_id === 'ffffffff-ffff-ffff-ffff-ffffffffffff' ||
          ['来电有喜官方店', '来电有喜自营店', '平台自营店'].includes(item.store_name || '')
        if (platformFilter === 'only') return isOfficial
        return !isOfficial  // exclude: 非自营（当前已无）
      })
    }

    return results.slice(0, limit)
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

/**
 * 按商品 ID 批量取商品（带上 stores 信息），用于回溯已购订单对应的商品。
 * @param ids 商品 ID 列表（内部去重；为空直接返回 []）
 */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const uniq = Array.from(new Set(ids || []))
  if (uniq.length === 0) return []
  const { data, error } = await supabase
    .from('products')
    .select('*, stores(id,name,image_url,is_platform)')
    .in('id', uniq)
  if (error) {
    console.error('[getProductsByIds] 查询失败:', error.message)
    return []
  }
  return Array.isArray(data) ? data : []
}

export async function getProductById(id: string): Promise<Product | null> {
  // 主查询：商品 + 门店。不内联 product_emotion，避免该表尚未创建时整条查询失败（商品加载不出）
  const { data, error } = await supabase
    .from('products')
    .select('*, stores(*)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null

  // 情绪编译缓存：独立查询，失败（如 product_emotion 表未建）静默跳过，详情页回退本地规则编译
  try {
    const { data: emo } = await supabase
      .from('product_emotion')
      .select('*')
      .eq('product_id', id)
      .maybeSingle()
    if (emo) (data as any).product_emotion = emo
  } catch {
    /* 表未创建：忽略，详情页走本地规则编译 */
  }
  return data
}

// =====================
// 情绪编译（emotion-compile Edge Function）
// =====================

export interface CompilePayload {
  product_id?: string
  name: string
  description?: string
  category?: string
  mood_tags?: string[]
  scene_tags?: string[]
}

/**
 * 本地规则兜底：云端 emotion-compile 未部署时，用前端规则生成三阶段情绪叙事。
 * 结构与云端 ruleCompile 对齐：emotion_title / stage1(场景问句) / stage2(状态确认) / stage3(身份确认)
 */
function localCompile(payload: CompilePayload): any {
  const name = (payload.name || '').trim()
  const mood = payload.mood_tags || []
  const scene = payload.scene_tags || []
  const category = payload.category

  // 商品名为空时直接返回填写提示，避免生成「这件物事」之类的废话
  if (!name) {
    const hint = '请先填写商品名称，再生成情绪化描述——有了名字，文案才能写出它的模样。'
    return {
      emotion_title: '待填写商品名称',
      stage1: hint,
      stage2: hint,
      stage3: '',
      candidates: [hint],
      emotion_detail: hint,
      compiled_by: 'local-rule',
      _local: true}
  }

  // 用 3 个候选文案（v1 → v2 → v3），各取不同的 variant 池子
  const variants = [0, 1, 2].map(v => generateEmotionDescription({ name }, mood, scene, category, undefined, v))
  // 主文案 = 三个候选拼接（stage2 主体信息量翻 3 倍，且段落感强）
  const stage2 = variants.join('\n')

  // 起笔：场景化问句
  const moment = scene[0] ? `每逢${scene[0]}` : '若得闲时'
  const stage1 = `${moment}，你可曾想要一份妥帖的心境？`

  // 收束：身份确认
  const closers = [
    '你便是懂得慢享生活的人。',
    '这便是你给日子留白的本事。',
    '你便是有心为自己留一寸温柔的人。',
  ]
  const stage3 = closers[Math.abs(name.length) % closers.length]

  return {
    emotion_title: name,
    stage1,
    stage2,
    stage3,
    candidates: variants,  // 工作台可点"换一版"切换
    emotion_detail: `${stage1} ${stage2} ${stage3}`,
    compiled_by: 'local-rule',
    _local: true}
}

/** 本地关键词兜底：把自由文本分类为 6 情绪态之一（positive/warm/fresh/luxury/fun/calm） */
function localUnderstand(text: string): string | null {
  for (const cat of Object.keys(MOOD_CATEGORIES)) {
    for (const t of (MOOD_TAGS[cat] || [])) {
      if (t.zh && text.includes(t.zh)) return t.zh
    }
  }
  return null
}

/** 调 emotion-compile 编译商品情绪叙事，结果写 product_emotion 缓存（云端未部署时回退本地规则） */
export async function compileProductEmotion(payload: CompilePayload): Promise<any> {
  const { data, error } = await supabase.functions.invoke('emotion-compile', {
    body: { mode: 'compile', ...payload }})
  if (error || !data) {
    console.warn('[compileProductEmotion] 云端函数未部署，使用本地规则兜底', error?.message)
    return localCompile(payload)
  }
  return data
}

/** 调 emotion-compile 把用户自由文本分类为 6 情绪态之一（云端未部署时回退本地关键词） */
export async function understandEmotion(text: string): Promise<string | null> {
  if (!text || !text.trim()) return null
  const { data, error } = await supabase.functions.invoke('emotion-compile', {
    body: { mode: 'understand', text }})
  if (error || !data) {
    console.warn('[understandEmotion] 云端函数未部署，使用本地关键词兜底', error?.message)
    return localUnderstand(text)
  }
  // 优先中文 canonical_tag（与前端 EMOTION_KEYWORD_MAP 标签体系统一）；兼容旧 inner_label
  return data?.canonical_tag ?? data?.inner_label ?? null
}

// =====================
// 商家情绪编译工作台：product_emotion 读写
// =====================

/** 读取某商品的情绪编译结果（含五维标签/质量分/审核态） */
export async function getProductEmotion(productId: string): Promise<ProductEmotion | null> {
  const { data, error } = await supabase
    .from('product_emotion')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle()
  if (error) { console.error('[getProductEmotion]', error); return null }
  return (data as ProductEmotion) ?? null
}

/** 保存（upsert）商品情绪编译工作台结果。product_id 唯一键。 */
export async function saveProductEmotion(row: Partial<ProductEmotion> & { product_id: string }): Promise<boolean> {
  const { error } = await supabase
    .from('product_emotion')
    .upsert(row, { onConflict: 'product_id' })
  if (error) { console.error('[saveProductEmotion]', error); return false }
  return true
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

export async function addToCart(productId: string, storeId: string, quantity = 1): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { Taro.showToast({ title: '请先登录后再加购', icon: 'none' }); return false }
  const { data: existing, error: qErr } = await supabase.from('cart_items')
    .select('id, quantity').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
  if (qErr) { Taro.showToast({ title: '加购失败，请重试', icon: 'none' }); return false }
  if (existing) {
    const { error } = await supabase.from('cart_items')
      .update({ quantity: (existing.quantity || 0) + quantity }).eq('id', existing.id)
    if (error) { Taro.showToast({ title: '加购失败，请重试', icon: 'none' }); return false }
    // 已存在同款：quantity 增加 quantity，总件数 +quantity（乐观计数，立即同步徽标）
    bumpCartCount(quantity)
  } else {
    const { error } = await supabase.from('cart_items')
      .insert({ user_id: user.id, product_id: productId, store_id: storeId, quantity, selected: true })
    if (error) { Taro.showToast({ title: '加购失败，请重试', icon: 'none' }); return false }
    // 新增一行：立刻让角标 +quantity（实时，无需刷新）
    bumpCartCount(quantity)
  }
  return true
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  // 总件数 = Σ quantity（更贴合「购物数量」心智；改数量时徽标也会跟着变）
  const { data } = await supabase.from('cart_items')
    .select('quantity').eq('user_id', user.id)
  return (data || []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0)
}

// =====================
// Orders
// =====================
export async function createOrder(items: Array<{
  product_id: string, store_id: string, store_name: string,
  product_name: string, product_image: string | null, price: number, quantity: number
}>, totalAmount: number, paymentMethod: 'wxpay' | 'emotion_beans'): Promise<Order | null> {
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

// 删除未支付订单（pending_pay 才允许）：无资金/分佣/金豆流水，可安全硬删。
// 先删 order_items（外键依赖），再删 orders 本体。
export async function deleteOrder(orderId: string): Promise<boolean> {
  const { data: o } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle()
  if (!o || o.status !== 'pending_pay') return false
  await supabase.from('order_items').delete().eq('order_id', orderId)
  const { error } = await supabase.from('orders').delete().eq('id', orderId)
  if (error) { console.error('[deleteOrder]', error); return false }
  return true
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
    ...(opts?.video_url ? { video_url: opts.video_url } : {})}
  
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('请先登录')
  const { error } = await supabase.from('merchant_applications').insert({
    ...info,
    user_id: user.id,  // 关键：关联当前用户
    status: 'pending'  // 显式设置状态为待审核
  })
  if (error) {
    console.error('[submitMerchantApplication] 插入失败:', error.message, error.code, error.details)
    throw new Error(`提交失败: ${error.message}`)
  }
}

// =====================
// Announcements
// =====================
export async function getAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabase.from('announcements').select('*')
    .eq('is_active', true).order('sort_order')
  return Array.isArray(data) ? data : []
}

// 首页「江湖动态」：拉取全站实时下单脱敏聚合（SECURITY DEFINER RPC，绕过 orders RLS）
export async function getOrderFeed(limit = 20): Promise<import('./types').OrderFeedItem[]> {
  const { data, error } = await supabase.rpc('get_recent_order_feed', { p_limit: limit })
  if (error) {
    console.error('[getOrderFeed]', error)
    return []
  }
  return (data as import('./types').OrderFeedItem[]) ?? []
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
  tb_used?: number
  referrer_id?: string
  idempotency_key?: string
  service_type?: 'dine_in' | 'self_pickup' | 'delivery'
  address?: string  // 收货地址（配送时必填）
}): Promise<{ order: { id: string; order_no: string; status: string; parent_order_no: string | null }; wxpay_amount: number; tb_used: number; pay_mode: string; is_multi_store: boolean } | null> {
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

    // P0 修复：价格防伪——下单前回查 products 目录价，弃用客户端传入的 price，杜绝压价下单资损
    const dbProductIds = [...new Set(params.items.map(i => i.product_id).filter(Boolean))]
    console.log('[createOrderV2] 回查 products:', dbProductIds)
    const { data: dbProducts, error: dbProdErr } = await supabase
      .from('products').select('id, price, is_active').in('id', dbProductIds)
    if (dbProdErr) {
      console.error('[createOrderV2] 商品目录查询失败:', dbProdErr)
      Taro.showToast({ title: '商品目录校验失败，禁止下单', icon: 'none' }); return null
    }
    console.log('[createOrderV2] 回查结果:', JSON.stringify(dbProducts))
    const dbPriceMap = new Map<string, number>()
    for (const p of (dbProducts || [])) dbPriceMap.set(p.id, Number(p.price) || 0)
    // 用目录价覆盖客户端 price；任一商品缺失或价格无效则禁止下单
    const verifiedItems = params.items.map(item => {
      const dbPrice = dbPriceMap.get(item.product_id)
      if (dbPrice == null || dbPrice <= 0) {
        const exists = (dbProducts || []).some((p: any) => p.id === item.product_id)
        const reason = exists ? '商品价格缺失' : '商品不存在或已下架'
        console.error(`[createOrderV2] INVALID_PRODUCT: ${reason}, product_id=${item.product_id}, name=${item.product_name}, clientPrice=${item.price}`)
        Taro.showToast({ title: `含无效商品：${reason}`, icon: 'none', duration: 5000 })
        throw new Error(`INVALID_PRODUCT: ${reason}`)
      }
      return { ...item, price: dbPrice }
    })
    // 用目录价重算应付基准总额（gold bean 抵扣前的净额）
    const catalogTotal = verifiedItems.reduce((s, i) => s + i.price * i.quantity, 0)

    console.log('[createOrderV2] items:', JSON.stringify(params.items))
    console.log('[createOrderV2] pay_mode:', params.pay_mode, 'isMultiStore:', isMultiStore)

    // 金豆处理：
    // - 纯金豆：创建订单时即扣金豆（订单直接完成，无失败态）
    // - 混合支付：先记录计划用量到订单（供微信支付云函数算正确应付金额），金豆扣减推迟到微信支付成功后再执行，避免支付失败导致金豆被锁定
    let tbUsed = (params.tb_used && (params.pay_mode === 'pure_gold' || params.pay_mode === 'hybrid')) ? params.tb_used : 0
    // 防御：金豆抵扣不得超过订单实际成交额（防止向上取整/输入错误导致平台现金实收为负）
    tbUsed = Math.min(tbUsed, catalogTotal)
    tbUsed = Math.max(0, tbUsed)
    // 金豆处理：记录下单前余额，订单失败时用于回滚
    let originalBalance = 0
    if (params.pay_mode === 'pure_gold' && tbUsed) {
      try {
        const { data: profile, error: profileErr } = await supabase.from('profiles').select('tb_balance').eq('id', user.id).single()
        originalBalance = profile?.tb_balance ?? 0
    if (process.env.NODE_ENV !== 'production') console.log('[createOrderV2] tb_balance:', profile?.tb_balance, 'need:', tbUsed, 'err:', profileErr)
        if (profileErr) {
          console.error('[createOrderV2] 查询金豆失败，阻断下单', profileErr)
          Taro.showToast({ title: '查询金豆失败，请重试', icon: 'none' }); return null
        }
        else if (!profile || profile.tb_balance < tbUsed) {
          Taro.showToast({ title: '金豆余额不足', icon: 'none' }); return null
        } else {
          const { error: deductErr } = await supabase.from('profiles').update({ tb_balance: profile.tb_balance - tbUsed }).eq('id', user.id)
          if (deductErr) {
            // P0 修复：金豆扣减失败必须阻断下单（避免"未扣豆但显示已扣"）
            console.error('[createOrderV2] 金豆扣减失败，阻断下单', deductErr)
            Taro.showToast({ title: `金豆扣减失败: ${deductErr.message}`, icon: 'none', duration: 4000 }); return null
          } else {
            // 非阻塞写金豆流水（下单消费抵扣）；表缺失(404)也不影响主流程
            supabase.from('tongbao_logs').insert({
              user_id: user.id,
              order_id: null,
              type: 'purchase_spend',
              delta: -tbUsed,
              balance_after: (profile.tb_balance ?? 0) - tbUsed,
              remark: '下单消费抵扣金豆'}).then(() => {}).catch((e: any) => {
              if (e?.code === '42P01' || (e as any)?.status === 404) {
                console.warn('[tongbao_logs] 表不存在(00096未执行)，流水暂不记录')
              }
            })
          }
        }
      } catch (e) {
        console.warn('[createOrderV2] 金豆操作异常，跳过', e)
      }
    }

    // 创建订单：按 store_id 分组，每个门店一个子订单
    const isInStore = params.service_type !== 'delivery'
    const nowIso = new Date().toISOString()
    const storeGroups = new Map<string, typeof verifiedItems>()
    for (const item of verifiedItems) {
      const sid = item.store_id || '__no_store__'
      if (!storeGroups.has(sid)) storeGroups.set(sid, [])
      storeGroups.get(sid)!.push(item)
    }
    const storeGroupArray = Array.from(storeGroups.entries())
    const ordersToInsert = storeGroupArray.map(([store_id, items], idx) => ({
      user_id: user.id,
      store_id: store_id === '__no_store__' ? null : store_id,
      order_no: isMultiStore ? `C${orderNo}${store_id?.slice(0, 4)}` : orderNo,
      parent_order_no: parentOrderNo,
      total_amount: Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100,
      // 纯金豆支付即视为已支付：配送走「待发货」，到店消费（堂食）当场使用→直接「待评价+已使用」，跳过待核销
      status: params.pay_mode === 'pure_gold'
        ? (params.service_type === 'delivery' ? 'pending_ship' : 'pending_review')
        : 'pending_pay',
      payment_method: params.pay_mode === 'pure_gold' ? 'emotion_beans' : 'wxpay',
      tb_used: isMultiStore ? 0 : tbUsed,
      referrer_id: params.referrer_id || null,
      // idempotency_key 唯一约束：多门店拆单时每个子订单必须独立 key，否则第二单起唯一冲突导致整批建单失败
      idempotency_key: isMultiStore ? `${(params.idempotency_key || orderNo)}-${idx}` : (params.idempotency_key || orderNo),
      service_type: params.service_type || 'dine_in',
      shipping_address: params.address || null,
      // 到店消费支付即视为已使用（verified_at 标记核销时间）。
      // ⚠️ 韧性修复：不在 insert 内写入 verified_at —— 若该列缺失(00055 未执行)会整单 insert 失败、
      // 纯金豆支付直接卡死。改为插入成功后用容错 update 补标（见下方「verified_at 韧性补标」）。
    }))

    console.log('[createOrderV2] ordersToInsert:', JSON.stringify(ordersToInsert))

    const { data: insertedOrders, error: orderErr } = await supabase.from('orders').insert(ordersToInsert).select('id, order_no, status')
    console.log('[createOrderV2] insert result:', insertedOrders, 'error:', orderErr)
    if (orderErr) {
      // P0 修复：orders 写入失败 → 回滚金豆（避免"金豆已扣但订单不存在"导致用户资产凭空消失）
      if (tbUsed > 0) {
        try {
          await supabase.from('profiles').update({ tb_balance: originalBalance }).eq('id', user.id)
          console.log('[createOrderV2] 已回滚金豆', tbUsed)
        } catch (e) { console.error('[createOrderV2] 金豆回滚失败，需人工补偿', e) }
      }
      // 详细错误信息：包含 code + message + hint
      const errMsg = orderErr.message || '未知错误'
      const errCode = (orderErr as any).code || ''
      const errHint = (orderErr as any).hint || ''
      const fullErrMsg = `${errMsg}${errCode ? ` [${errCode}]` : ''}${errHint ? ` (${errHint})` : ''}`
      console.error('[创建订单失败]', JSON.stringify(orderErr))
      Taro.showToast({ title: `创建订单失败: ${fullErrMsg}`, icon: 'none', duration: 6000 })
      return null
    }

    // ===== verified_at 韧性补标（P0 修复：避免纯金豆到店消费因列缺失而整单失败）=====
    // 到店消费(堂食)纯金豆订单支付即视为已使用，用 verified_at 标记。
    // 若 00055 迁移未执行（verified_at 列不存在），update 静默失败，订单已创建/已支付不受影响。
    if (params.pay_mode === 'pure_gold' && isInStore && insertedOrders && insertedOrders.length > 0) {
      const ids = (insertedOrders as any[]).map(o => o.id)
      await supabase.from('orders').update({ verified_at: nowIso }).in('id', ids)
        .then(({ error }: { error: any }) => {
          if (error) console.warn('[createOrderV2] verified_at 补标失败(列可能缺失,不影响支付):', error?.message || error)
          else console.log('[createOrderV2] verified_at 补标成功', ids.length, '单')
        })
    }
    // =========================================================================

    // 创建订单商品：每个子订单下挂对应门店的所有商品
    if (insertedOrders && insertedOrders.length > 0) {
      const orderItems = insertedOrders.flatMap((order: any, storeIdx: any) => {
        const [, items] = storeGroupArray[storeIdx]
        return items.map(item => ({
          order_id: order.id,
          store_id: order.store_id || item.store_id || null,
          store_name: item.store_name || null,
          product_id: item.product_id || null,
          product_name: item.product_name || '商品',
          product_image: item.product_image || null,
          quantity: item.quantity || 1,
          price: item.price || 0,
          created_at: new Date().toISOString()}))
      })
      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) {
        console.error('[createOrderV2] order_items 插入失败:', itemsErr, JSON.stringify(orderItems))
        Taro.showToast({ title: `订单商品创建失败: ${itemsErr.message}`, icon: 'none', duration: 6000 })
      } else {
        console.log('[createOrderV2] order_items 插入成功:', orderItems.length)
      }
    }

    // ===== 归属：用户首次在该门店下单 → 建立 user_store_relation =====
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
              lock_type: 'order'})
            console.log(`[归属] user=${user.id} locked to store=${order.store_id}`)
          }
        } catch (e) { console.warn('[归属] 失败(不影响)', e) }
      }
    }
    // =========================================================================

    // ===== 佣金 + 买家金豆处理 =====
    // P0 修复：佣金必须延后到「支付成功」后触发。纯金豆在下方已支付分支处理；微信/混合支付由
    // wechat-payment-callback → distribute-commission 云函数处理（T4 已修 commission_balance 累加）。
    // =========================================================================

    // ===== 纯金豆订单佣金 + 买家金豆（P1-A 修复：此前纯金豆永不发佣金/不发买家金豆）=====
    // 佣金主路径走服务端 distribute-commission（service_role 绕过 RLS，可靠发佣+买家金豆+余额）；
    // 客户端 distributeCommissionDirect 仅作快速路径，受 RLS 限制必然失败，失败无害、不阻断兜底。
    if (params.pay_mode === 'pure_gold' && insertedOrders && insertedOrders.length > 0) {
      for (const order of insertedOrders) {
        const orderTotal = Number((order as any).total_amount) || 0
        if (orderTotal <= 0) continue
        // 推荐人（L1）= 订单落库的 referrer_id（下单时已透传 1870.profile.referrer_id=1856）
        const directReferrerId: string | null = (order as any).referrer_id || null
        let discountRate = 0.09
        try {
          if (order.store_id) {
            const { data: storeData } = await supabase.from('stores').select('referral_rate').eq('id', order.store_id).maybeSingle()
            discountRate = (storeData as any)?.referral_rate ?? 0.09
          }
          // 让利点合并规则（按商品自身，金额加权）：每商品用自身 discount_rate（整数%÷100），未设则回退店铺率；
          // 按商品金额(price×qty)加权得到整单混合率，高利润品主导平台让利、低利润品少分，绝不二次叠加。
          // 修复：order_items.product_id 无外键指向 products.id，嵌入 products() 必 PGRST200，
          // 改为先取 order_items 再按 product_id 单独查 products 在 JS 内关联。
          const { data: itemRows } = await supabase
            .from('order_items').select('price, quantity, product_id').eq('order_id', order.id)
          const items = (itemRows || []) as Array<{ price?: any; quantity?: any; product_id?: string | null }>
          const productIds = Array.from(new Set((items || []).map(it => it?.product_id).filter(Boolean))) as string[]
          let rateMap2: Record<string, number> = {}
          if (productIds.length) {
            const { data: prods2 } = await supabase
              .from('products').select('id, discount_rate').in('id', productIds)
            for (const p of (prods2 || []) as Array<{ id?: string; discount_rate?: any }>) {
              if (p?.id) rateMap2[p.id] = Number(p.discount_rate ?? 0)
            }
          }
          let totalAmt = 0, weightedSum = 0
          for (const it of items) {
            const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
            const pid = String(it?.product_id)
            const pRate = (typeof rateMap2[pid] === 'number' && rateMap2[pid] > 0) ? rateMap2[pid] / 100 : discountRate
            totalAmt += amt
            weightedSum += amt * pRate
          }
          if (totalAmt > 0) discountRate = weightedSum / totalAmt
          let staffId: string | undefined, staffMet = { rolling: 0, active: 1, recruit: 1 }
          let l2Id: string | undefined, l2Met = { rolling: 0, active: 1, recruit: 1 }
          if (directReferrerId) {
            staffId = directReferrerId
            staffMet = await fetchCommissionMetrics(directReferrerId)
            // L2 = 直接推荐人的上级（统一用 profiles.referrer_id，uuid 上级链；原 invited_by 是邀请码文本，非用户id）
            const { data: refP } = await supabase.from('profiles').select('referrer_id').eq('id', directReferrerId).maybeSingle()
            if (refP?.referrer_id) {
              l2Id = refP.referrer_id
              l2Met = await fetchCommissionMetrics(refP.referrer_id)
            }
          }
          const buyerMet = await fetchCommissionMetrics(user.id)
          const commissionResult = calculateCommissionV5({
            orderAmount: orderTotal, discountRate,
            staffId,
            staffRollingConsumption: staffMet.rolling, staffActiveMult: staffMet.active, staffRecruitMult: staffMet.recruit,
            referrerId: l2Id,
            referrerRollingConsumption: l2Met.rolling, referrerActiveMult: l2Met.active, referrerRecruitMult: l2Met.recruit,
            buyerId: user.id,
            buyerRollingConsumption: buyerMet.rolling})
          // 仅落库展示字段（l1/l2/buyer_points），真实发放交给服务端 distribute-commission
          await supabase.from('orders').update({
            l1_commission: commissionResult.l1Commission,
            l2_commission: commissionResult.l2Commission,
            buyer_points: Math.round(commissionResult.buyerGoldBeans),
            commission_calculated: true}).eq('id', order.id)
        } catch (e) { console.warn('[createOrderV2] 纯金豆佣金预算失败(不影响下单):', e) }

        // 快速路径：客户端直写佣金（受 RLS 限制会失败，无害）
        try { await distributeCommissionDirect(order.id, user.id) }
        catch (e) { console.warn('[createOrderV2] 客户端直写佣金失败，转服务端兜底:', e) }

        // 兜底主路径：服务端 distribute-commission（service_role 绕过 RLS，幂等，必发佣+买家金豆+余额）
        // 修复：改用 raw fetch 调用（绕过 Taro.request 自定义 fetch 对 Edge Function 的兼容性问题），
        // 错误写回 orders.commission_error 便于排查；最多重试 1 次。
        try {
          const dcBody = {
            order_id: order.id,
            order_no: order.order_no,
            payer_id: user.id,
            total_amount: orderTotal,
            net_amount: 0,
            referrer_id: directReferrerId ?? null,
            discount_rate: discountRate,
          }
          let dcOk = false
          let dcErr: string | null = null
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const dcRes = await fetch(`${process.env.TARO_APP_SUPABASE_URL}/functions/v1/distribute-commission`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabase.auth.getSession()?.data?.access_token || ''}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(dcBody),
              })
              if (dcRes.ok) {
                dcOk = true
                break
              }
              const dcText = await dcRes.text()
              dcErr = `HTTP ${dcRes.status}: ${dcText.slice(0, 200)}`
            } catch (netErr: any) {
              dcErr = netErr?.message || String(netErr)
            }
            if (attempt === 0) await new Promise(r => setTimeout(r, 1000)) // 重试前等 1s
          }
          if (!dcErr && !dcOk) dcErr = '未知：无异常但未确认成功'
          // 写回错误信息（便于管理端排查），成功则清空旧错误
          await supabase.from('orders').update({
            commission_error: dcErr,
          }).eq('id', order.id)
          if (!dcOk) console.warn('[createOrderV2] 服务端分佣调用失败:', dcErr)
        } catch (fe: any) {
          const errMsg = fe?.message || String(fe)
          console.warn('[createOrderV2] 服务端佣金兜底调用失败(不影响下单):', fe)
          try {
            await supabase.from('orders').update({ commission_error: `兜底异常:${errMsg}` }).eq('id', order.id)
          } catch {}
        }
      }
    }
    // =========================================================================

    const mainOrder = insertedOrders?.[0]
    if (!mainOrder) { Taro.showToast({ title: '订单创建异常', icon: 'none' }); return null }

    return {
      order: { id: mainOrder.id, order_no: isMultiStore ? parentOrderNo! : mainOrder.order_no, status: mainOrder.status, parent_order_no: parentOrderNo },
      // 金豆1豆=1元（与人民币1:1锚定）：纯金豆应付0，混合=目录价总额-金豆抵扣（均基于回查目录价，防压价）
      wxpay_amount: params.pay_mode === 'pure_gold' ? 0 : Math.max(0, Math.round((catalogTotal - (params.tb_used || 0) * 1) * 10000) / 10000),
      tb_used: tbUsed,
      pay_mode: params.pay_mode,
      is_multi_store: isMultiStore}
  } catch (err: any) {
    console.error('[createOrderV2] 异常', err);
    Taro.showToast({ title: `创建订单失败: ${err.message}`, icon: 'none' });
    return null
  }
}

/** 直接 DB 操作：佣金 + 买家金豆（替代原 Edge Function distribute-commission） */
async function distributeCommissionDirect(orderId: string, buyerId: string): Promise<void> {
  try {
    // 1. 获取订单信息
    const { data: order } = await supabase
      .from('orders').select('*').eq('id', orderId).single()
    if (!order || order.commission_distributed) return

    const total = order.total_amount || 0
    if (total <= 0) return

    // 2. 读取前端支付时已由 V5 算法算好并落库的佣金/买家金豆结果
    //    （前端 payment 页 calculateCommissionV5 写入，保证「展示 = 实发」一致）
    const l1Commission = Number(order.l1_commission) || 0
    const l2Commission = Number(order.l2_commission) || 0
    const buyerGoldBeans = Math.round(Number(order.buyer_points) || 0)

    // 3. 推广关系（与前端/Edge Function 一致：L1 = 直接推荐人，L2 = 推荐人的上级）
    const l1UserId = order.referrer_id || null
    if (!l1UserId && buyerGoldBeans <= 0) {
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', orderId)
      return
    }
    const { data: l1Profile } = l1UserId
      ? await supabase.from('profiles').select('referrer_id').eq('id', l1UserId).single()
      : { data: null }
    // L2 上级链统一用 profiles.referrer_id（uuid 上级），原 invited_by 是邀请码文本非用户id
    const l2UserId = (l1Profile as any)?.referrer_id || null
    // 取近6月滚动指标用于 commissions 历史展示的段位（与 Edge Function 一致）
    const l1Met = l1UserId ? await fetchCommissionMetrics(l1UserId) : { rolling: 0, active: 1, recruit: 1 }
    const l2Met = l2UserId ? await fetchCommissionMetrics(l2UserId) : { rolling: 0, active: 1, recruit: 1 }

    // 4. 净额（与 distribute-commission Edge Function 完全一致）：
    //    通道费(微信0.6%)仅对微信实付(net_amount)计提，从佣金扣除，由用户承担；纯金豆订单(net_amount=0)通道费=0。
    //    佣金额度来自支付页落库的 l1_commission/l2_commission（已按 total_amount 全额口径计算），此处不重算基数。
    const cashBase = Number(order.total_amount) || 0
    const isGoldOrder = Number(order.net_amount || 0) <= 0 && cashBase > 0
    const channelFee = Math.round((Number(order.net_amount) || 0) * PLATFORM_CONFIG.CHANNEL_FEE_RATE * 10000) / 10000
    const gross = l1Commission + l2Commission
    const afterChannel = Math.max(0, gross - channelFee)
    const taxWithheld = calcWithholdingTax(afterChannel)
    // 按各行佣金占比分摊通道费/个税 → 净到手（与 Edge Function allocCommission 同公式）
    const netOf = (rowGross: number): number => {
      if (gross <= 0) return 0
      const net = rowGross - channelFee * (rowGross / gross) - taxWithheld * (rowGross / gross)
      return Math.round(net * 100) / 100
    }
    const netL1 = netOf(l1Commission)
    const netL2 = netOf(l2Commission)

    // 写入佣金记录 + 更新受益人余额。
    // commission_amount = 名义毛佣（展示/对账，与 Edge Function 一致）；net_amount = 实际净到手；余额记净额。
    const commissions = []
    if (l1Commission > 0 && l1UserId) {
      const cf = gross > 0 ? Math.round(channelFee * (l1Commission / gross) * 100) / 100 : 0
      const tx = gross > 0 ? Math.round(taxWithheld * (l1Commission / gross) * 100) / 100 : 0
      commissions.push({
        order_id: orderId, order_no: order.order_no,
        beneficiary_id: l1UserId, payer_id: buyerId,
        level: 1,
        rank_at_time: calcRankNameFromRolling(l1Met.rolling),
        ratio: total > 0 ? Math.round((l1Commission / total) * 10000) / 10000 : 0,
        pool_amount: total, commission_amount: l1Commission,
        channel_fee: cf, tax_withheld: tx, net_amount: netL1,
        b_coef: 1.0, status: 'pending' as const})
      const { data: l1Bal } = await supabase.from('profiles')
        .select('total_commission, tb_balance').eq('id', l1UserId).single()
      if (l1Bal) {
        const newTb = Math.round((Number(l1Bal.tb_balance || 0) + netL1) * 100) / 100
        // 累计佣金记净额；实际发放改为「金豆」(tb_balance)，与 Edge Function 一致（覆盖原资产隔离铁律）
        await supabase.from('profiles').update({
          total_commission: Math.round((Number(l1Bal.total_commission || 0) + netL1) * 100) / 100,
          tb_balance: newTb}).eq('id', l1UserId)
        supabase.from('tongbao_logs').insert({
          user_id: l1UserId, order_id: orderId, type: 'commission_earn',
          delta: netL1, balance_after: newTb, remark: `订单${order?.order_no}推广佣金(金豆)`,
        }).then(() => {}).catch(() => {})
      }
    }
    if (l2Commission > 0 && l2UserId) {
      const cf = gross > 0 ? Math.round(channelFee * (l2Commission / gross) * 100) / 100 : 0
      const tx = gross > 0 ? Math.round(taxWithheld * (l2Commission / gross) * 100) / 100 : 0
      commissions.push({
        order_id: orderId, order_no: order.order_no,
        beneficiary_id: l2UserId, payer_id: buyerId,
        level: 2,
        rank_at_time: calcRankNameFromRolling(l2Met.rolling),
        ratio: total > 0 ? Math.round((l2Commission / total) * 10000) / 10000 : 0,
        pool_amount: total, commission_amount: l2Commission,
        channel_fee: cf, tax_withheld: tx, net_amount: netL2,
        b_coef: 1.0, status: 'pending' as const})
      const { data: l2Bal } = await supabase.from('profiles')
        .select('total_commission, tb_balance').eq('id', l2UserId).single()
      if (l2Bal) {
        const newTb = Math.round((Number(l2Bal.tb_balance || 0) + netL2) * 100) / 100
        await supabase.from('profiles').update({
          total_commission: Math.round((Number(l2Bal.total_commission || 0) + netL2) * 100) / 100,
          tb_balance: newTb}).eq('id', l2UserId)
        supabase.from('tongbao_logs').insert({
          user_id: l2UserId, order_id: orderId, type: 'commission_earn',
          delta: netL2, balance_after: newTb, remark: `订单${order?.order_no}推广佣金(金豆)`,
        }).then(() => {}).catch(() => {})
      }
    }

    if (commissions.length > 0) {
      await supabase.from('commissions').insert(commissions)
    }

    // 5. 买家获赠金豆：金豆 按「1元=1金豆」等额传入，实发在 addBuyerGoldBeans 内乘 GOLD_BEAN_EARN_RATE 缩放（1:1 体系下即消费回馈比例）
    await addBuyerGoldBeans(buyerId, orderId, buyerGoldBeans > 0 ? buyerGoldBeans : Math.round(total))

    // 6. 标记订单已发佣金
    await supabase.from('orders').update({ commission_distributed: true }).eq('id', orderId)
  } catch (e) {
    console.error('[distributeCommissionDirect] 异常', e)
  }
}

/**
 * 取受益人近6月滚动指标（与 distribute-commission Edge Function 完全一致）：
 * - rolling：本人近 6 月有效成交订单的现金基数（现金取 net_amount，纯金豆取 total_amount）之和
 * - active：活跃系数（近 30 天 / 30~60 天推荐成交分布）
 * - recruit：邀请新用户衰减系数（距上次邀请新用户天数）
 * 失败降级：读 profiles.total_consumption（终身）作为滚动近似、系数不设衰减（保证不出错）。
 */
async function fetchCommissionMetrics(userId: string): Promise<{ rolling: number; active: number; recruit: number }> {
  try {
    const since6 = new Date(Date.now() - 180 * 86400000).toISOString()
    const { data: cons } = await supabase.from('orders')
      .select('total_amount, status')
      .eq('user_id', userId).gte('created_at', since6)
      .in('status', ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup'])
    let rolling = 0
    for (const o of (cons as any[]) ?? []) {
      rolling += Number((o as any).total_amount) || 0
    }
    rolling = Math.round(rolling * 100) / 100

    const since60 = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data: ref } = await supabase.from('orders')
      .select('created_at').eq('referrer_id', userId).gte('created_at', since60)
      .in('status', ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup'])
    let r30 = 0, r3060 = 0
    const now = Date.now()
    for (const o of (ref as any[]) ?? []) {
      const d = (now - new Date((o as any).created_at).getTime()) / 86400000
      if (d <= 30) r30++
      else if (d <= 60) r3060++
    }
    const active = getActiveMultiplier(r30, r3060)

    const { data: rec } = await supabase.from('profiles')
      .select('created_at').eq('referrer_id', userId).order('created_at', { ascending: false }).limit(1)
    let daysSince: number | null = null
    if ((rec as any[])?.length) {
      daysSince = (now - new Date((rec as any[])[0].created_at).getTime()) / 86400000
    }
    const recruit = getRecruitMultiplier(daysSince)

    return { rolling, active, recruit }
  } catch (e) {
    console.warn('[fetchCommissionMetrics] 失败降级为终身消费/无衰减:', e)
    const { data: p } = await supabase.from('profiles').select('total_consumption').eq('id', userId).maybeSingle()
    return { rolling: (p as any)?.total_consumption ?? 0, active: 1, recruit: 1 }
  }
}

/** 根据近6月滚动消费计算 V5 段位名（用于 commissions 历史展示，与 Edge Function 一致） */
function calcRankNameFromRolling(rollingConsumption: number): string {
  const score = calculateDynamicScore(rollingConsumption)
  const sorted = [...RANK_CONFIG_TABLE_V5].sort((a, b) => a.minDynamicScore - b.minDynamicScore)
  let matched = sorted[0]
  for (const r of sorted) { if (score >= r.minDynamicScore) matched = r }
  return matched.rank
}

/** 买家获赠金豆（忠诚度返利）：消费获赠金豆写入 tb_balance（1元=1豆，与人民币1:1锚定，平台内消费币，不可提现/兑现金） */
async function addBuyerGoldBeans(buyerId: string, orderId: string, goldBeans: number): Promise<void> {
  // 1:1 体系下 goldBeans 由上游按「1元消费=1金豆」等额传入；此处乘 GOLD_BEAN_EARN_RATE 缩放为实发金豆，
  // 避免消费全额 100% 返现。GOLD_BEAN_EARN_RATE=0.05 → 消费1元实发0.05金豆=可抵0.05元（5%回馈）；设为1即全额返现。
  const pts = Math.max(0, Math.round(goldBeans * GOLD_BEAN_EARN_RATE))
  if (pts <= 0) return
  const { data: profile } = await supabase.from('profiles')
    .select('tb_balance').eq('id', buyerId).single()
  if (!profile) return
  const newBalance = (profile.tb_balance || 0) + pts
  await supabase.from('profiles').update({ tb_balance: newBalance }).eq('id', buyerId)
  supabase.from('tongbao_logs').insert({
    user_id: buyerId,
    order_id: orderId,
    type: 'purchase_earn',
    delta: pts,
    balance_after: newBalance,
    remark: `订单消费获赠金豆`}).then(() => {}).catch(() => {})
}

/** V2 会员权益版：每单发放 金豆（TB）与 会员贡献值（CV）。防亏损权重版：TB 受净毛利封顶、成长回馈取自净毛利池 */
export const EMOTION_TB_PER_CLAIM = 10
/** CV 基础转化率：每 1 TB 兑换 0.12 CV（再乘权重系数） */
export const EMOTION_CV_RATE = 0.12
/** 平台毛利率估算（下行兼容占位，防亏损版改用净毛利 net_margin_total） */
export const PLATFORM_GROSS_MARGIN = 0.15
// 金豆下发比率：1:1 体系下「消费1元=1金豆」等额传入，此处按比例缩放为实发金豆，避免消费全额 100% 返现。
export const GOLD_BEAN_EARN_RATE = 0.05  // 消费回馈比例（5%）：消费1元实发0.05金豆=可抵0.05元；设为 1 = 恢复全额返现

// ===== 防亏损权重配置（硬约束：R_TB + R_DIV ≤ 0.5，平台永远留 ≥50% 净利） =====
const R_TB = 0.15                  // 单笔 TB 负债上限 = 该笔净毛利 × 15%
const R_DIV = 0.30                 // 年度成长回馈计提比例 = 平台净毛利 × 30%（仅用于成长回馈金豆估算，非现金分红）
const M_MIN = 10                   // 净毛利门槛：低于 10 元只发徽章、不发 TB/CV（零负债）
const P_BASE = 100                 // 基准客单价（经济贡献权重归一化分母）
const W_BEH_MAX = 1.5              // 行为权重上限（复购/评价/分享）
const GROSS_MARGIN_FALLBACK = 0.15 // 缺 platform_income 时按 total_amount × 此比例估算净毛利
// ===== 裂变附加分（§5.1：退款时需同步回滚上级这部分贡献值）=====
const R_FISS_L1 = 0.05             // 直接推荐人(L1) 裂变附加分 = 下级个人CV × 5%
const R_FISS_L2 = 0.02             // 间接推荐人(L2) 裂变附加分 = 下级个人CV × 2%

/** §5.3 算法规则版本：读取当前已生效(announced+effective≤now)的版本常量；无表/无版本时回退硬编码 */
export interface RuleVersionConsts {
  EMOTION_TB_PER_CLAIM: number
  R_TB: number
  R_DIV: number
  M_MIN: number
  P_BASE: number
  W_BEH_MAX: number
  EMOTION_CV_RATE: number
  R_FISS_L1: number
  R_FISS_L2: number
  GROSS_MARGIN_FALLBACK: number
}
const DEFAULT_RULE: RuleVersionConsts = {
  EMOTION_TB_PER_CLAIM, R_TB, R_DIV, M_MIN, P_BASE, W_BEH_MAX, EMOTION_CV_RATE,
  R_FISS_L1, R_FISS_L2, GROSS_MARGIN_FALLBACK}
export async function getActiveRuleVersion(): Promise<{ version: string; consts: RuleVersionConsts }> {
  try {
    const { data, error } = await supabase
      .from('emotion_rule_versions')
      .select('version, const_json')
      .lte('effective_at', new Date().toISOString())
      .eq('is_active', true)
      .order('effective_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!error && data?.const_json) {
      return { version: data.version, consts: { ...DEFAULT_RULE, ...(data.const_json as object) } as RuleVersionConsts }
    }
  } catch { /* 表未部署时回退 */ }
  return { version: 'default', consts: DEFAULT_RULE }
}

/**
 * 用户行为权重（best-effort，缺表自动降级为仅复购维度）
 *  - repurchase: 历史已确权/已使用订单数，越多股越多
 *  - review / share: 评价/分享（本表未建时恒为 0，不报错）
 */
async function getUserBehavior(userId: string): Promise<{ repurchase: number; review: number; share: number }> {
  try {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .not('verified_at', 'is', null)
    const cnt = (data?.length || 0)
    const repurchase = Math.max(0, Math.min(1, (cnt - 1) / 5)) // 第 2 单起计，5 单封顶=1
    return { repurchase, review: 0, share: 0 }
  } catch {
    return { repurchase: 0, review: 0, share: 0 }
  }
}

/** 确权综合权重 = 经济贡献 × 行为权重（只放大「会员贡献值/CV」，不放大 金豆/成长回馈负债） */
function calcWeight(totalAmount: number, b: { repurchase: number; review: number; share: number }): number {
  const wEcon = Math.min(3, Math.max(0.2, (totalAmount || 0) / P_BASE))
  const wBeh = Math.min(W_BEH_MAX, 1 + b.repurchase * 0.1 + b.review * 0.05 + b.share * 0.03)
  return wEcon * wBeh
}

/** 情绪 → 确权徽章映射（前端本地，badge_code 同时写入 grants 表；字典表缺省时也能展示） */
export const EMOTION_BADGE_MAP: Record<string, { code: string; name: string; icon: string }> = {
  '松弛': { code: 'emo_relax', name: '松弛时刻', icon: '🌿' },
  '治愈': { code: 'emo_heal', name: '暖心微光', icon: '✨' },
  '平静': { code: 'emo_calm', name: '安宁片刻', icon: '🍃' },
  '勇敢': { code: 'emo_brave', name: '勇敢一刻', icon: '🔥' },
  '温暖': { code: 'emo_warm', name: '温暖相伴', icon: '☀️' },
  '思念': { code: 'emo_miss', name: '思念悠悠', icon: '🌙' },
  '喜悦': { code: 'emo_joy', name: '喜悦绽放', icon: '🌸' },
  '自由': { code: 'emo_free', name: '自由之心', icon: '🕊️' }}
function resolveBadge(emotions: string[]): { code: string; name: string; icon: string } {
  for (const e of emotions) {
    const hit = Object.keys(EMOTION_BADGE_MAP).find(k => e.includes(k))
    if (hit) return EMOTION_BADGE_MAP[hit]
  }
  return { code: 'emo_first', name: '初识情绪', icon: '🎭' }
}

/**
 * 情绪确权发放（防亏损权重版 + §5.1/§5.3 回退友好）
 * 入口：支付成功自动发放（payment/index.tsx → autoClaimAfterPay → grantEmotionClaim），
 *       订单中心「去确权」按钮已于 2026-07 移除，分享卡仍可由 emotion-claim 页承接。发放逻辑：
 *  - 净毛利 = orders.platform_income（缺则 total_amount × 毛利率 估算）
 *  - 金豆 TB = min(EMOTION_TB_PER_CLAIM, 净毛利 × R_TB)；净毛利 ≤ 0 时才只发徽章(零负债)；其余按实赚比例发放（金豆/小额单不再被误杀）
 *  - 会员贡献值 CV = TB × EMOTION_CV_RATE × 权重（权重 = 经济贡献 × 行为，仅放大贡献值、不增负债）
 *  - 裂变附加分：本人 CV 的 R_FISS_L1/R_FISS_L2 给二级推荐人（退款时同步回滚）
 *  - 情绪徽章按所选首个情绪映射
 *  - §5.3：发放时盖章当前生效 rule_version，历史确权永不回溯
 * 全程非阻断。
 */

/** 解析二级推荐人(基于 profiles.invited_by 邀请码链)并计算裂变附加分 */
async function resolveUplineFission(
  userId: string, cv: number, C: RuleVersionConsts
): Promise<{ l1Id: string | null; l2Id: string | null; l1Cv: number; l2Cv: number }> {
  try {
    const { data: me } = await supabase.from('profiles').select('invited_by').eq('id', userId).maybeSingle()
    const l1Code = (me as any)?.invited_by
    if (!l1Code) return { l1Id: null, l2Id: null, l1Cv: 0, l2Cv: 0 }

    const { data: l1 } = await supabase.from('profiles').select('id, invited_by').eq('referral_code', l1Code).maybeSingle()
    if (!l1) return { l1Id: null, l2Id: null, l1Cv: 0, l2Cv: 0 }
    const l1Id = (l1 as any).id
    const l1Cv = Math.round(cv * C.R_FISS_L1 * 100) / 100

    const l2Code = (l1 as any).invited_by
    let l2Id: string | null = null
    let l2Cv = 0
    if (l2Code) {
      const { data: l2 } = await supabase.from('profiles').select('id').eq('referral_code', l2Code).maybeSingle()
      if (l2) {
        l2Id = (l2 as any).id
        l2Cv = Math.round(cv * C.R_FISS_L2 * 100) / 100
      }
    }
    return { l1Id, l2Id, l1Cv, l2Cv }
  } catch {
    return { l1Id: null, l2Id: null, l1Cv: 0, l2Cv: 0 }
  }
}

/** 给指定用户累加贡献值(best-effort) */
async function addCvToProfile(userId: string, cv: number): Promise<void> {
  if (!userId || !cv) return
  try {
    const { data } = await supabase.from('profiles').select('cv_total').eq('id', userId).maybeSingle()
    const cur = Number((data as any)?.cv_total || 0)
    await supabase.from('profiles').update({ cv_total: Math.round((cur + cv) * 100) / 100 }).eq('id', userId)
  } catch { /* best-effort */ }
}

// ── 确权记录降级安全写入 ──────────────────────────────────────────────
// emotion_claims 表的列分两批：00052 基础列(必定存在) + 00054 扩展列(迁移可能未执行)。
// 先尝试全量写入；若因缺列失败(42703/400)，自动降级为仅写基础列，
// 确保「已确权」状态能被 getClaimedOrderNos() 识别（该函数现虽未被前端直接引用，仍保留用于后台/风控识别已确权订单）。
interface SafeClaimInsertParams {
  profileId: string; orderNo: string; productId: string; storeId: string
  selectedEmotion: string[]; badgeText: string
  tb: number; cv: number; badgeCode: string; ruleVersion: string
  l1Id?: string | null; l2Id?: string | null; l1Cv?: number; l2Cv?: number
}
// 记忆扩展列 schema 是否可用：避免每次确权都先"故意失败一次全量 INSERT"再降级（省一次失败 RTT）
let claimFullSchemaOk: boolean | null = null

async function safeInsertClaim(p: SafeClaimInsertParams): Promise<void> {
  const baseRow: Record<string, any> = {
    user_id: p.profileId, order_no: p.orderNo, product_id: p.productId,
    store_id: p.storeId, selected_emotion: p.selectedEmotion, badge_text: p.badgeText,
    tongbao_amount: Math.max(p.tb, 0)}
  // 已知全量 schema 不可用（00054 未执行）→ 直接写基础列，跳过必败的全量尝试
  if (claimFullSchemaOk === false) {
    const { error: e2 } = await supabase.from('emotion_claims').insert(baseRow)
    if (e2) console.error('[safeInsertClaim] 基础列写入失败', e2)
    return
  }
  // 尝试全量写入（00052+00054 全部列）
  const fullRow: Record<string, any> = {
    ...baseRow,
    tb_amount: p.tb, cv_amount: p.cv,
    badge_code: p.badgeCode, status: 'active', rule_version: p.ruleVersion}
  if (p.l1Id != null) fullRow.upline_l1 = p.l1Id
  if (p.l2Id != null) fullRow.upline_l2 = p.l2Id
  if (p.l1Cv != null) fullRow.upline_l1_cv = p.l1Cv
  if (p.l2Cv != null) fullRow.upline_l2_cv = p.l2Cv

  const { error } = await supabase.from('emotion_claims').insert(fullRow)
  if (!error) { claimFullSchemaOk = true; return } // ✅ 成功，记住 schema 可用

  // 42703 = 列不存在 → 标记 schema 不可用，降级为仅基础列(00052)
  if (error.code === '42703' || String(error.message || '').includes('column')) {
    claimFullSchemaOk = false
    console.warn('[safeInsertClaim] 扩展列缺失(00054未执行)，降级为基础列写入', error.message)
    const { error: e2 } = await supabase.from('emotion_claims').insert(baseRow)
    if (e2) console.error('[safeInsertClaim] 基础列写入也失败', e2)
    return
  }
  // 其它错误（RLS/约束等）直接抛出，让外层 catch 处理
  throw error
}

export async function grantEmotionClaim(payload: {
  orderNo: string
  productId: string
  storeId: string
  selectedEmotion: string[]
  badgeText: string
  equity?: EquitySummary   // 页面已加载的权益概览，透传可省去确权时重复的全平台聚合查询
}): Promise<{
  ok: boolean
  already?: boolean
  skipped?: boolean
  tb?: number
  cv?: number
  badgeName?: string
  badgeIcon?: string
  equity?: EquitySummary
}> {
  try {
    // 并行：profile / 规则版本 / 订单净毛利 三者彼此独立，省 2 个 RTT
    const [profile, rv, ordRes] = await Promise.all([
      getMyProfile(),
      getActiveRuleVersion(),
      supabase.from('orders')
        .select('platform_income, total_amount, user_id, verified_at, status')
        .eq('order_no', payload.orderNo).maybeSingle(),
    ])
    if (!profile) return { ok: false }
    // 段位-徽章关联（#74）：确权后补发里程碑徽章并同步身份段位（best-effort，不阻塞确权）
    const finalizeRank = () =>
      checkAndGrantEmotionBadges(profile.id).then(() => syncMemberRank(profile.id)).catch(() => {})
    const C = rv.consts
    const ord = (ordRes as any)?.data || null

    // 🔒 P0 修复：所有权 + 已核销校验。仅「本人订单且已核销/已支付」才确权，
    // 否则任何人拿一个已支付 order_no 即可白嫖 TB/CV（资产盗用）。
    const owned = !!ord && ord.user_id === profile.id
    const verified = !!ord && (
      ord.verified_at != null ||
      // 放宽闸门：支付成功后(pending_ship/pending_receive)即视为可确权，
      // 支持「下单即默认确权」流程（堂食支付即 pending_review 本就在列）。
      ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup'].includes(ord.status)
    )
    if (!owned || !verified) {
      console.warn('[grantEmotionClaim] 订单校验未通过(非本人或未核销)，拒绝确权', { orderNo: payload.orderNo })
      return { ok: false }
    }

    // 防重复 + 行为权重：都只依赖 profile.id，并行查询（避免连点重复发放）
    const [existRes, behavior] = await Promise.all([
      supabase.from('emotion_claims').select('id').eq('user_id', profile.id).eq('order_no', payload.orderNo).maybeSingle(),
      getUserBehavior(profile.id),
    ])
    if (existRes?.data) return { ok: true, already: true }

    // 取订单净毛利（平台真实收益），缺则按总额×毛利率估算
    const netMargin = ord
      ? (Number((ord as any).platform_income) ||
         Number((ord as any).total_amount || 0) * C.GROSS_MARGIN_FALLBACK)
      : C.EMOTION_TB_PER_CLAIM / C.R_TB // 无订单记录：按可发满额保守估算（极少发生）

    const badge = resolveBadge(payload.selectedEmotion)
    // 仅当净毛利 ≤ 0（订单对平台毫无价值）才只发徽章、零负债。
    // 不再用 M_MIN 硬门槛跳过小额真实订单（金豆单 platform_income≈3.27、微信小额单 fallback≈5.9 曾被误杀）。
    // 防亏损由下方 tb = min(上限, netMargin×R_TB) 兜底：TB 永不超过本笔平台实赚。
    const skipped = netMargin <= 0

    // 净毛利 ≤ 0 的订单：仅发徽章、零负债（无 CV/金豆/裂变）；netMargin > 0 一律按实赚比例发放
    if (skipped) {
      await safeInsertClaim({
        profileId: profile.id, orderNo: payload.orderNo,
        productId: payload.productId, storeId: payload.storeId,
        selectedEmotion: payload.selectedEmotion, badgeText: payload.badgeText,
        tb: 0, cv: 0, badgeCode: badge.code, ruleVersion: rv.version})
      grantEmotionBadge(profile.id, badge.code).then(() => {}).catch((e: any) => {
        // 409 = 外键约束（emo_* 徽章种子未导入，迁移 00073 未执行），非阻断
        if (e?.code === '42703' || e?.code === '23503' || e?.status === 409) {
          console.warn('[grantEmotionBadge] 徽章种子缺失(00073未执行)，跳过')
          return
        }
      })
      const equity = payload.equity || await getEquitySummary().catch(() => undefined)
      finalizeRank()
      return { ok: true, skipped: true, tb: 0, cv: 0, badgeName: badge.name, badgeIcon: badge.icon, equity }
    }

    // 正常确权：TB 受净毛利封顶，绝不超出该笔平台赚到的钱
    const tb = Math.round(Math.min(C.EMOTION_TB_PER_CLAIM, netMargin * C.R_TB) * 100) / 100
    const weight = calcWeight(Number((ord as any)?.total_amount || netMargin), behavior)
    const cv = Math.round(tb * C.EMOTION_CV_RATE * weight * 100) / 100

    // 裂变附加分：基于本人 CV 给二级推荐人（不增加平台现金负债，仅作为会员贡献份额）
    const { l1Id, l2Id, l1Cv, l2Cv } = await resolveUplineFission(profile.id, cv, C)

    // 写确权记录（含发放明细 + 裂变 + 规则版本，供 §5.1/§5.2 回滚精确扣减）
    await safeInsertClaim({
      profileId: profile.id, orderNo: payload.orderNo,
      productId: payload.productId, storeId: payload.storeId,
      selectedEmotion: payload.selectedEmotion, badgeText: payload.badgeText,
      tb, cv, badgeCode: badge.code, ruleVersion: rv.version,
      l1Id, l2Id, l1Cv, l2Cv})

    // 发放 金豆 + 会员贡献值（沿用项目既有的 profiles.update 写法）
    const newTb = Math.round(((profile.tb_balance || 0) + tb) * 100) / 100
    const newCv = Math.round(((profile.cv_total || 0) + cv) * 100) / 100
    await supabase.from('profiles').update({
      tb_balance: newTb,
      cv_total: newCv}).eq('id', profile.id)

    // 给上级结算裂变附加分（并行，省 1 个 RTT；best-effort，不阻塞主流程）
    const cvTasks: Promise<void>[] = []
    if (l1Id) cvTasks.push(addCvToProfile(l1Id, l1Cv))
    if (l2Id) cvTasks.push(addCvToProfile(l2Id, l2Cv))
    await Promise.all(cvTasks)

    // 徽章（best-effort，不阻塞；409=外键/种子缺失非致命）
    grantEmotionBadge(profile.id, badge.code).then(() => {}).catch((e: any) => {
      if (e?.code === '23503' || e?.status === 409) {
        console.warn('[grantEmotionBadge] 徽章种子缺失(00073未执行)，跳过')
        return
      }
    })

    // 返回最新会员权益概览：优先用页面已加载的（透传），避免重复全平台聚合；缺失时回退查询
    const equity = payload.equity || await getEquitySummary().catch(() => undefined)
    finalizeRank()
    return { ok: true, tb, cv, badgeName: badge.name, badgeIcon: badge.icon, equity }
  } catch (e) {
    console.warn('[grantEmotionClaim] 失败(不影响主流程)', e)
    return { ok: false }
  }
}

/** 会员权益概览（展示用，成长回馈先展示后接结算） */
export interface EquitySummary {
  myCv: number              // 我的会员贡献值
  totalCv: number           // 全平台会员贡献值总和
  shareRatio: number        // 成长占比 0~1（会员贡献值占比，非公司股权）
  dividendEstimate: number  // 年度成长回馈预估（金豆，展示）
  newUsersThisMonth: number // 平台本月新增用户
  gmvTotal: number          // 平台累计 累计消费额
}

/** 平台月度指标：优先 RPC（get_platform_metrics 返回 net_margin_total），失败回退估算值 */
export async function getPlatformMetrics(): Promise<{
  total_cv: number
  gmv_total: number
  new_users_month: number
  net_margin_total: number
} | null> {
  try {
    const { data, error } = await supabase.rpc('get_platform_metrics')
    if (!error && data) {
      const d = data as any
      return {
        total_cv: Number(d.total_cv) || 0,
        gmv_total: Number(d.gmv_total) || 0,
        new_users_month: Number(d.new_users_month) || 0,
        net_margin_total: Number(d.net_margin_total) || 0}
    }
  } catch (e) {
    console.warn('[getPlatformMetrics] RPC 不可用，回退估算', e)
  }
  // 回退：未部署 get_platform_metrics RPC 时，用 fn_total_cv() 取实时全平台贡献值
  // （排除封禁用户 & 已回滚的作废确权，保证 §5.2 不计入总贡献）
  try {
    const { data: tc } = await supabase.rpc('fn_total_cv')
    if (typeof tc === 'number') {
      return { total_cv: tc, gmv_total: 0, new_users_month: 12368, net_margin_total: 3000000 }
    }
  } catch { /* fn 未部署则继续占位 */ }
  return { total_cv: 10000, gmv_total: 0, new_users_month: 12368, net_margin_total: 3000000 }
}

/** 计算我的会员权益概览（成长占比 / 年度成长回馈预估）。
 *  防亏损核心：成长回馈池 = 平台净毛利(net_margin_total) × R_DIV，绝不超过平台真正赚到的钱 */
export async function getEquitySummary(): Promise<EquitySummary> {
  const profile = await getMyProfile().catch(() => null)
  const myCv = profile?.cv_total || 0
  const m = await getPlatformMetrics()
  const totalCv = m?.total_cv || 1
  const netMargin = m?.net_margin_total || 0
  // 成长回馈池基于「净毛利」而非 累计消费额 —— 平台成长回馈只来源于真实赚到的净利
  const profitPool = netMargin * R_DIV
  const shareRatio = totalCv > 0 ? myCv / totalCv : 0
  const dividendEstimate = Math.round(profitPool * shareRatio * 100) / 100
  return {
    myCv: Math.round(myCv * 100) / 100,
    totalCv: Math.round(totalCv * 100) / 100,
    shareRatio,
    dividendEstimate,
    newUsersThisMonth: m?.new_users_month || 0,
    // gmvTotal 展示口径：由净毛利反推粗略 累计消费额（无任何页面强依赖此字段）
    gmvTotal: netMargin > 0 ? Math.round(netMargin / GROSS_MARGIN_FALLBACK) : 0}
}

// =====================================================
// §5.1 / §5.2 特殊场景回退与修正（原子函数见 00054 迁移）
// =====================================================

/** §5.1 确权作废 / 订单退款回滚：回滚本人贡献值 + 上级裂变附加分。
 *  @param refundRatio 1=全额退款, 0~1=部分退款同比例扣减 */
export async function voidEmotionClaim(
  claimId: string, reason = 'refund', refundRatio = 1
): Promise<{ ok: boolean; cv_back?: number; tb_back?: number; l1_back?: number; l2_back?: number } | null> {
  try {
    const { data, error } = await supabase.rpc('fn_void_emotion_claim', {
      p_claim_id: claimId, p_reason: reason, p_refund_ratio: refundRatio})
    if (error) { console.warn('[voidEmotionClaim]', error); return null }
    return data as any
  } catch (e) { console.warn('[voidEmotionClaim]', e); return null }
}

/** §5.1 便捷入口：按订单号作废该用户对应确权（退款流程调用） */
export async function voidClaimByOrder(
  orderNo: string, reason = 'refund', refundRatio = 1
): Promise<{ ok: boolean }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }
    const { data: claim } = await supabase
      .from('emotion_claims').select('id').eq('user_id', user.id).eq('order_no', orderNo).eq('status', 'active').maybeSingle()
    if (!claim) return { ok: true } // 本就没有有效确权，无需回滚
    const r = await voidEmotionClaim((claim as any).id, reason, refundRatio)
    return { ok: !!r?.ok }
  } catch (e) { console.warn('[voidClaimByOrder]', e); return { ok: false } }
}

/** §5.1 退款流程：记录订单退款比例并触发确权回滚（部分退款同比例扣减消费权重后扣差额） */
export async function applyRefundToClaim(
  orderNo: string, refundRatio: number, refundAmount = 0
): Promise<{ ok: boolean }> {
  const ratio = Math.max(0, Math.min(1, refundRatio))
  try {
    await supabase.from('orders')
      .update({ refund_ratio: ratio, refund_amount: refundAmount, status: 'after_sale' })
      .eq('order_no', orderNo)
    const r = await voidClaimByOrder(orderNo, ratio >= 1 ? 'refund_full' : 'refund_partial', ratio)
    return r
  } catch (e) { console.warn('[applyRefundToClaim]', e); return { ok: false } }
}

/** §5.2 封禁：个人贡献值清零 + 上级裂变分同步扣回（原子） */
export async function banUserRollback(
  userId: string, reason = 'violation'
): Promise<{ ok: boolean; upline_l1_back?: number; upline_l2_back?: number } | null> {
  try {
    const { data, error } = await supabase.rpc('fn_ban_user_rollback', {
      p_user_id: userId, p_reason: reason})
    if (error) { console.warn('[banUserRollback]', error); return null }
    return data as any
  } catch (e) { console.warn('[banUserRollback]', e); return null }
}

/** 确认收货：pending_receive → pending_review（落库，修复订单中心空壳按钮） */
export async function confirmReceipt(orderId: string): Promise<boolean> {
  try {
    // 收货即视为已使用：一次原子更新同时推进状态 + 置 verified_at，
    // 让「确权」跟随订单流程自然推进，省去单独的「标记已使用」步骤
    const { error } = await supabase.from('orders')
      .update({ status: 'pending_review', verified_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) { console.warn('[confirmReceipt]', error); return false }
    return true
  } catch (e) { console.warn('[confirmReceipt]', e); return false }
}

/** 标记订单已使用（确权闸门：使用后才可以确权） */
export async function markOrderUsed(orderId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('orders').update({ verified_at: new Date().toISOString() }).eq('id', orderId)
    if (error) { console.warn('[markOrderUsed]', error); return false }
    return true
  } catch (e) { console.warn('[markOrderUsed]', e); return false }
}

/** 按订单号查订单（确权页校验是否已使用） */
export async function getOrderForClaim(orderNo: string): Promise<{ verified_at: string | null; status: string } | null> {
  if (!orderNo) return null
  const { data } = await supabase
    .from('orders').select('verified_at, status').eq('order_no', orderNo).maybeSingle()
  if (!data) return null
  return { verified_at: (data as any).verified_at || null, status: (data as any).status }
}

/** 当前用户已确权的订单号集合（订单中心判断「去确权」按钮用） */
export async function getClaimedOrderNos(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('emotion_claims').select('order_no').eq('user_id', user.id)
  return (data || []).map((r: any) => r.order_no).filter(Boolean)
}

// =====================================================
// 金豆 + 徽章（V5 P2-1 独立化，依赖 00053 迁移）
// =====================================================

/** 获取用户通宝账户（不存在则懒创建并返回 0） */
export async function getOrCreateEmotionAsset(userId: string): Promise<EmotionAsset> {
  if (!userId) throw new Error('userId required')
  const { data, error } = await supabase
    .from('emotion_assets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (data) return data as EmotionAsset
  if (error) console.warn('[getOrCreateEmotionAsset] select', error)
  const { data: created, error: insErr } = await supabase
    .from('emotion_assets')
    .insert({ user_id: userId })
    .select('*')
    .single()
  if (insErr || !created) {
    // 极小概率：并发同时插时 unique 冲突，重试读
    const { data: reread } = await supabase
      .from('emotion_assets').select('*').eq('user_id', userId).maybeSingle()
    if (reread) return reread as EmotionAsset
    throw insErr || new Error('create emotion_assets failed')
  }
  return created as EmotionAsset
}

/** 增加通宝（消费确权/分享归属/admin 调账等正向收入） */
export async function addEmotionTongbao(
  userId: string,
  delta: number,
  reason: EmotionTongbaoReason,
  refId?: string,
  remark?: string,
): Promise<{ balance: number; log: EmotionTongbaoLog | null }> {
  if (!userId || delta <= 0) return { balance: 0, log: null }
  // 确保账户存在
  const asset = await getOrCreateEmotionAsset(userId)
  const newBalance = (asset.balance || 0) + delta
  const newTotal = (asset.total_earned || 0) + delta
  const { error: updErr } = await supabase
    .from('emotion_assets')
    .update({ balance: newBalance, total_earned: newTotal })
    .eq('user_id', userId)
  if (updErr) {
    console.warn('[addEmotionTongbao] update 失败', updErr)
    return { balance: asset.balance, log: null }
  }
  const { data: log } = await supabase
    .from('emotion_tongbao_logs')
    .insert({
      user_id: userId,
      delta,
      balance_after: newBalance,
      reason,
      ref_id: refId || null,
      remark: remark || null})
    .select('*')
    .maybeSingle()
  return { balance: newBalance, log: (log as EmotionTongbaoLog) || null }
}

/** 消耗通宝（情绪喂养/未来兑换等），余额不足返回 false 不扣 */
export async function spendEmotionTongbao(
  userId: string,
  delta: number,
  reason: EmotionTongbaoReason,
  refId?: string,
  remark?: string,
): Promise<{ ok: boolean; balance: number; log: EmotionTongbaoLog | null }> {
  if (!userId || delta <= 0) return { ok: false, balance: 0, log: null }
  const asset = await getOrCreateEmotionAsset(userId)
  if ((asset.balance || 0) < delta) {
    return { ok: false, balance: asset.balance, log: null }
  }
  const newBalance = (asset.balance || 0) - delta
  const newTotal = (asset.total_spent || 0) + delta
  const { error: updErr } = await supabase
    .from('emotion_assets')
    .update({ balance: newBalance, total_spent: newTotal })
    .eq('user_id', userId)
  if (updErr) {
    console.warn('[spendEmotionTongbao] update 失败', updErr)
    return { ok: false, balance: asset.balance, log: null }
  }
  const { data: log } = await supabase
    .from('emotion_tongbao_logs')
    .insert({
      user_id: userId,
      delta: -delta,
      balance_after: newBalance,
      reason,
      ref_id: refId || null,
      remark: remark || null})
    .select('*')
    .maybeSingle()
  return { ok: true, balance: newBalance, log: (log as EmotionTongbaoLog) || null }
}

/** 用户通宝余额（前端展示用，比 getOrCreate 轻） */
export async function getEmotionTongbaoBalance(userId: string): Promise<number> {
  if (!userId) return 0
  const { data } = await supabase
    .from('emotion_assets').select('balance').eq('user_id', userId).maybeSingle()
  return data?.balance ?? 0
}

/** 通宝流水（最近 N 条，倒序） */
export async function getEmotionTongbaoLogs(userId: string, limit = 50): Promise<EmotionTongbaoLog[]> {
  if (!userId) return []
  const { data } = await supabase
    .from('emotion_tongbao_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data || []) as unknown as EmotionTongbaoLog[]
}

/** 通宝累计统计（用于账单页） */
export async function getEmotionTongbaoStats(userId: string): Promise<{
  balance: number; total_earned: number; total_spent: number
}> {
  if (!userId) return { balance: 0, total_earned: 0, total_spent: 0 }
  const { data } = await supabase
    .from('emotion_assets')
    .select('balance,total_earned,total_spent')
    .eq('user_id', userId)
    .maybeSingle()
  return {
    balance: data?.balance ?? 0,
    total_earned: data?.total_earned ?? 0,
    total_spent: data?.total_spent ?? 0}
}

/** 徽章字典（前端冷启动拉一次即可） */
export async function getEmotionBadgeDefs(): Promise<EmotionBadgeDef[]> {
  const { data } = await supabase
    .from('emotion_badge_defs')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data || []) as unknown as EmotionBadgeDef[]
}

/** 用户已获徽章 */
export async function getUserEmotionBadges(userId: string): Promise<EmotionBadgeGrant[]> {
  if (!userId) return []
  const { data } = await supabase
    .from('emotion_badge_grants')
    .select('*')
    .eq('user_id', userId)
    .order('granted_at', { ascending: false })
  return (data || []) as unknown as EmotionBadgeGrant[]
}

/** 颁发徽章（幂等：已拥有则静默跳过，不触发 409 噪音） */
export async function grantEmotionBadge(
  userId: string,
  badgeCode: string,
  source: 'auto' | 'admin' = 'auto',
): Promise<{ granted: boolean; code: EmotionBadgeGrant | null }> {
  if (!userId || !badgeCode) return { granted: false, code: null }
  // 用 upsert + ignoreDuplicates 替代 insert：唯一约束 (user_id,badge_code)
  // 命中冲突即 DO NOTHING，不再返回 409，从根上消除控制台噪音与多余请求。
  const { data, error } = await supabase
    .from('emotion_badge_grants')
    .upsert(
      { user_id: userId, badge_code: badgeCode, source },
      { onConflict: 'user_id,badge_code', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle()
  if (error) {
    // 仅 FK/种子缺失(23503)等真异常才告警；唯一冲突已被 upsert 吸收
    console.warn('[grantEmotionBadge] 失败', error)
    return { granted: false, code: null }
  }
  // 已拥有 → upsert DO NOTHING 返回 null（granted:false）；新获得 → 返回行（granted:true）
  return { granted: !!data, code: (data as EmotionBadgeGrant) || null }
}

/** 一次性同步检查并补发徽章（在确权/账单/详情页调用） */
export async function checkAndGrantEmotionBadges(userId: string): Promise<EmotionBadgeGrant[]> {
  if (!userId) return []
  const newly: EmotionBadgeGrant[] = []
  try {
    // 1) 初识情绪：至少 1 条确权
    const { count: claimCount } = await supabase
      .from('emotion_claims')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if ((claimCount || 0) >= 1) {
      const r = await grantEmotionBadge(userId, 'first_claim')
      if (r.granted && r.code) newly.push(r.code)
    }
    // 2) 共情者：确权商品去重数 ≥ 10
    const { data: claims } = await supabase
      .from('emotion_claims')
      .select('product_id,selected_emotion')
      .eq('user_id', userId)
    const products = new Set((claims || []).map((c: any) => c.product_id).filter(Boolean))
    if (products.size >= 10) {
      const r = await grantEmotionBadge(userId, 'empath')
      if (r.granted && r.code) newly.push(r.code)
    }
    // 3) 五味杂陈：累计 5 个不同情绪维度（粗略：取所有 selected_emotion 拼接去重）
    const dimSet = new Set<string>()
    ;(claims || []).forEach((c: any) => (c.selected_emotion || []).forEach((e: string) => dimSet.add(e)))
    if (dimSet.size >= 5) {
      const r = await grantEmotionBadge(userId, 'five_emotions')
      if (r.granted && r.code) newly.push(r.code)
    }
    // 注：原「通宝藏家」徽章依赖通宝账户，已随通宝体系移除；未来可改为「百金豆」等金豆里程碑。
  } catch (e) {
    console.warn('[checkAndGrantEmotionBadges] 失败(非阻断)', e)
  }
  return newly
}

/** 统计用户已收集徽章：总数 + 稀有(史诗/传说)数（用于段位软门槛） */
export async function getBadgeStats(userId: string): Promise<{ count: number; rareCount: number }> {
  if (!userId) return { count: 0, rareCount: 0 }
  try {
    const { data: grants } = await supabase
      .from('emotion_badge_grants')
      .select('badge_code')
      .eq('user_id', userId)
    const codes = (grants || []).map((g: any) => (g as any).badge_code).filter(Boolean)
    if (codes.length === 0) return { count: 0, rareCount: 0 }
    const { data: defs } = await supabase
      .from('emotion_badge_defs')
      .select('code, rarity')
      .in('code', codes)
    const rareSet = new Set(['epic', 'legend'])
    const rareCount = (defs || []).filter((d: any) => rareSet.has((d as any).rarity)).length
    return { count: codes.length, rareCount }
  } catch (e) {
    console.warn('[getBadgeStats] 失败(非阻断)', e)
    return { count: 0, rareCount: 0 }
  }
}

/**
 * 同步会员「身份段位」(profile.member_rank)：
 * 消费达标 + 徽章软门槛 → computeMemberRank；仅当变化时才写库（best-effort，非阻断）。
 * 与佣金段位（消费决定）解耦，覆盖 user 页 / 推广页 / 管理后台展示。
 */
export async function syncMemberRank(userId: string): Promise<string | null> {
  if (!userId) return null
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('member_rank, total_consumption')
      .eq('id', userId)
      .maybeSingle()
    if (!profile) return null
    const stats = await getBadgeStats(userId)
    const next = computeMemberRank({
      totalConsumption: (profile as any).total_consumption || 0,
      badgeCount: stats.count,
      rareBadgeCount: stats.rareCount})
    const current = (profile as any).member_rank || '凡心'
    if (next !== current) {
      await supabase.from('profiles').update({ member_rank: next }).eq('id', userId)
      // 段位跃迁写事件表：支撑阶段间时间窗口 + 段位态马尔可夫（非阻断）
      await supabase.from('member_rank_events').insert({
        user_id: userId,
        from_stage: current,
        to_stage: next,
        trigger: 'consume+badge'}).then(() => {}).catch(() => {})
    }
    return next
  } catch (e) {
    console.warn('[syncMemberRank] 失败(非阻断)', e)
    return null
  }
}

// 查询用户全部情绪确权记录（「我的情绪账单」页）
export async function getUserEmotionClaims(userId: string): Promise<EmotionClaim[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('emotion_claims')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[getUserEmotionClaims]', error)
    return []
  }
  return (data || []) as unknown as EmotionClaim[]
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

/** 获取我的金豆流水（收益+支出） */
export async function getMyTongbaoLogs(page = 0, limit = 30): Promise<import('./types').TongbaoLog[]> {
  const { data } = await supabase.from('tongbao_logs')
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

/**
 * 提交退款申请 —— 改为调用 refund-order Edge Function（服务端闭环）。
 *
 * 关键变更（2026-07-20 方案A 重构）：
 *  - 旧实现是「客户端直连数据库」，用 anon key 直接 update 受益人 profiles（跨用户写被 RLS 拦截 → 佣金扣回静默失败 = 资损），
 *    且完全没有发起微信退款 API（用户实付的微信款项退不回来）。
 *  - 新实现把所有资金操作（微信退款发起、金豆返还、佣金回冲、买家金豆扣回、库存回滚、状态机）统一收敛到
 *    refund-order / wechat-refund-callback 两个 Edge Function（service_role 执行，绕过 RLS、可安全调微信）。
 *  - 客户端仅做轻量前置校验（登录、幂等、金额上界），真正的退款由服务端完成。
 *
 * EF 返回：{ success:true, refund_id, refund_no, method } 或 { success:false, error }
 */
export async function applyRefund(params: {
  order_id: string; order_no: string; item_index: number
  refund_quantity: number; refund_amount: number; reason: string; description?: string
}): Promise<{ success: boolean; refund_id?: string; method?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '请先登录' }

    // 幂等性检查，防止同一订单重复申请退款（前端页面也有此检查，这里兜底）
    const { data: existingRefund } = await supabase
      .from('refunds').select('id, status').eq('order_id', params.order_id).maybeSingle()
    if (existingRefund) {
      const statusMap: Record<string, string> = {
        'pending': '待审核', 'processing': '退款处理中', 'approved': '审核通过',
        'rejected': '已拒绝', 'completed': '已完成退款', 'closed': '已关闭',
        'abnormal': '退款异常', 'cancelled': '已取消'}
      const statusText = statusMap[existingRefund.status] || existingRefund.status
      return { success: false, error: `该订单已申请退款，当前状态：${statusText}` }
    }

    // 轻量金额上界校验（服务端 EF 也会二次校验，这里只做即时反馈）
    // 注意：当前 orders 表累计退款列是 refund_amount（非 refunded_amount）
    const { data: order, error: orderErr } = await supabase
      .from('orders').select('total_amount, refund_amount, user_id').eq('id', params.order_id).maybeSingle()
    if (orderErr || !order) return { success: false, error: '订单不存在' }
    if ((order as any).user_id && (order as any).user_id !== user.id) {
      return { success: false, error: '无权操作该订单' }
    }
    const maxRefundAmount = Math.round((Number(order.total_amount || 0) - Number((order as any).refund_amount || 0)) * 100) / 100
    if (params.refund_amount <= 0) return { success: false, error: '退款金额必须大于0' }
    if (params.refund_amount > maxRefundAmount + 0.0001) {
      return { success: false, error: `退款金额不能超过可退金额 ¥${maxRefundAmount.toFixed(2)}` }
    }

    // 调用服务端退款引擎（自动带用户会话鉴权）
    const { data, error } = await supabase.functions.invoke('refund-order', {
      method: 'POST',
      body: {
        order_id: params.order_id,
        order_no: params.order_no,
        item_index: params.item_index,
        refund_quantity: params.refund_quantity,
        refund_amount: params.refund_amount,
        reason: params.reason,
        description: params.description,
      },
    })

    if (error) {
      console.error('[applyRefund] refund-order invoke error:', error)
      return { success: false, error: (error as any)?.message || '退款服务调用失败，请稍后重试' }
    }

    const res = (data ?? {}) as { success?: boolean; refund_id?: string; method?: string; error?: string }
    if (!res.success) {
      return { success: false, error: res.error || '退款申请失败，请重试' }
    }

    return { success: true, refund_id: res.refund_id, method: res.method }
  } catch (err: any) {
    console.error('[applyRefund] 异常', err)
    return { success: false, error: err?.message || '网络错误，请重试' }
  }
}
/** 获取用户余额 & 推广佣金账户余额。
 *  注意：金豆已合并为金豆，统一平台内部货币 = tb_balance（人民币1:1锚定，仅平台内消费，不可提现/兑现金）。
 *        历史遗留 gold_beans 已并入佣金，balance 已并入 tb_balance，均不再作为消费币。 */
export async function getMyBalance(): Promise<{ points: number; tb_balance: number; commission_balance: number }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { points: 0, tb_balance: 0, commission_balance: 0 }
  const { data } = await supabase.from('profiles').select('points, tb_balance, commission_balance').eq('id', user.id).maybeSingle()
  return {
    points: data?.points ?? 0,
    tb_balance: data?.tb_balance ?? 0,
    commission_balance: data?.commission_balance ?? 0}
}

// =====================
// 商家货款结算（迁移 00120）
// =====================

/** 读取门店货款结算概览（可结算余额 / 累计已结算 / 笔数 / 子商户号）
 *  走 SECURITY DEFINER RPC 绕过 stores RLS，anon 可读。 */
export async function getMerchantSettlement(storeId: string): Promise<{
  ok: boolean; merchant_balance: number; settlement_frozen: number; total_settled: number; settlement_count: number; wx_sub_mch_id: string | null
} | null> {
  if (!storeId) return null
  const { data, error } = await supabase.rpc('fn_get_store_settlement', { p_store_id: storeId })
  if (error) { console.error('[getMerchantSettlement]', error); return null }
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

/** 商家货款结算台账列表（按门店） */
export async function getMerchantSettlements(storeId: string, page = 0, limit = 20): Promise<any[]> {
  if (!storeId) return []
  const { data, error } = await supabase
    .from('merchant_settlements')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  if (error) { console.error('[getMerchantSettlements]', error); return [] }
  return data ?? []
}

/** 商家货款提现申请（原子 RPC：校验余额 + 扣减 + 写 withdrawals(kind='settlement')） */
export async function applyMerchantWithdrawal(params: {
  store_id: string
  amount: number
  method: 'wechat' | 'alipay' | 'bank'
  account_info?: Record<string, unknown>
}): Promise<{ ok: boolean; withdrawal_id?: string; amount?: number; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
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
  if (error) { console.error('[applyMerchantWithdrawal]', error); return { ok: false, error: error.message } }
  const d = (data as any) || {}
  if (!d.ok) return { ok: false, error: d.error || '提现失败' }
  return { ok: true, withdrawal_id: d.withdrawal_id, amount: d.amount }
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
    qrContent = `来电有喜·推广码：${ref}\n扫码成为${ref}的推荐用户`
  } else {
    const sc = (params.short_code || '').toUpperCase().slice(0, 8)
    const ref = params.referral_code ? (params.referral_code || '').toUpperCase().slice(0, 6) : ''
    if (!sc) return null
    qrContent = `来电有喜·门店码：${sc}${ref ? `\n推荐人：${ref}` : ''}`
  }

  // 方案1：尝试 Edge Function（生产环境，生成真正的微信小程序码）
  try {
    const { data, error } = await supabase.functions.invoke('generate-qrcode', { body: params })
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
  referral_rate_enabled: boolean
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
  ingredients?: string[]   // 原料成分分析：关联食材 key（即方案 raw_material）
  is_active?: boolean
  // 食材食疗智能导购字段（迁移 00100）
  overall_nature?: string
  health_tag?: string[]
  emotion_tag?: string[]
  match_goods?: string[]
  conflict_goods?: string[]
  aux_remind?: string
}): Promise<import('./types').Product | null> {
  // 校验：商品标题/描述不得含违禁词（广告法绝对化用语/金融化/博彩诱导）
  const nameCheck = checkIllegalWords(params.name)
  const descCheck = checkIllegalWords(params.description)
  if (!nameCheck.passed || !descCheck.passed) {
    const words = Array.from(new Set([...nameCheck.found, ...descCheck.found]))
    console.error('[createProduct] 商品文案含违禁词，已拦截:', words)
    Taro.showToast({ title: `商品文案含违禁词：${words.join('、')}`, icon: 'none', duration: 3000 })
    return null
  }

  // ── 优先走 Edge Function（service_role 在服务端写库，绕过 products 表 RLS 写策略）──
  // 彻底规避「安全加固迁移把商家写策略删掉 → 上架保存失败」的反复问题。
  // 函数未部署 / 调用异常时自动回退到下方直写逻辑（保持旧行为，不退化）。
  try {
    const invokeBody: Record<string, unknown> = {
      store_id: params.store_id,
      name: params.name,
      description: params.description ?? null,
      price: params.price,
      stock: params.stock,
      barcode: params.barcode ?? null,
      main_image: params.main_image || params.image_url || null,
      sub_images: params.sub_images ?? null,
      detail_images: params.detail_images ?? null,
      video_url: params.video_url ?? null,
      cost_price: params.cost_price ?? null,
      original_price: params.original_price ?? null,
      discount_rate: params.discount_rate ?? null,
      mood_tags: params.mood_tags ?? [],
      scene_tags: params.scene_tags ?? [],
      ingredients: params.ingredients ?? null,
      is_active: params.is_active ?? false,
      overall_nature: params.overall_nature ?? null,
      health_tag: params.health_tag ?? null,
      emotion_tag: params.emotion_tag ?? null,
      match_goods: params.match_goods ?? null,
      conflict_goods: params.conflict_goods ?? null,
      aux_remind: params.aux_remind ?? null}
    const { data, error } = await supabase.functions.invoke('product-mutate', { body: invokeBody })
    if (!error && data?.success) {
      console.log('[createProduct] 经 Edge Function 写入成功 (绕过 RLS)')
      return (data as any).product as import('./types').Product
    }
    // 函数返回业务错误（如门店归属不匹配）→ 直接抛出，不再回退（回退也会失败）
    if (error) {
      console.warn('[createProduct] Edge Function 调用失败，回退直写：', error.message || JSON.stringify(error))
    } else if (data?.error) {
      console.warn('[createProduct] Edge Function 业务错误，回退直写：', data.error)
    }
  } catch (e: any) {
    console.warn('[createProduct] 调用 Edge Function 异常，回退直写：', e?.message || e)
  }

  // ── 回退：直连 Supabase 写入（依赖 products 表 RLS 写策略，需 00095 已应用）──
  // 先查门店信息，让新建商品携带 stores 关联数据
  let storeInfo: any = null
  if (params.store_id) {
    const { data: s } = await supabase.from('stores').select('*').eq('id', params.store_id).maybeSingle()
    storeInfo = s
  }
  const insertPayload: Record<string, unknown> = {
    ...params,
    mood_tags: params.mood_tags ?? [],
    scene_tags: params.scene_tags ?? [],
    review_status: 'pending',
    is_active: params.is_active ?? false,
    main_image: params.main_image || params.image_url || null,
    sub_images: params.sub_images ?? null,
    detail_images: params.detail_images ?? null,
    video_url: params.video_url ?? null,
    cost_price: params.cost_price ?? null,
    discount_rate: params.discount_rate ?? null,
    ingredients: params.ingredients ?? null,
    overall_nature: params.overall_nature ?? null,
    health_tag: params.health_tag ?? null,
    emotion_tag: params.emotion_tag ?? null,
    match_goods: params.match_goods ?? null,
    conflict_goods: params.conflict_goods ?? null,
    aux_remind: params.aux_remind ?? null}
  const { data, error } = await supabase.from('products').insert(insertPayload).select().maybeSingle()
  // 软降级：若 products 表尚未加食疗导购新列（迁移 00100 未执行），剥离后重试，保证保存不失败
  if (error && NEW_COLUMN_RE.test(error.message)) {
    const r2 = await supabase.from('products').insert(stripNewProductColumns(insertPayload)).select().maybeSingle()
    if (r2.error) { console.error('[createProduct]', r2.error); throw r2.error }
    return r2.data as import('./types').Product
  }
  if (error) { console.error('[createProduct]', error); throw error }
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
  ingredients?: string[]
  // 食材食疗智能导购字段（迁移 00100）
  overall_nature?: string; health_tag?: string[]; emotion_tag?: string[]
  match_goods?: string[]; conflict_goods?: string[]; aux_remind?: string
}>): Promise<boolean> {
  // 优先走 Edge Function（service_role 绕过 RLS 写策略），未部署时回退直写
  try {
    const invokeBody: Record<string, unknown> = { id, ...(params as Record<string, unknown>) }
    const { data, error } = await supabase.functions.invoke('product-mutate', { body: invokeBody })
    if (!error && data?.success) {
      console.log('[updateProduct] 经 Edge Function 更新成功 (绕过 RLS)')
      return true
    }
    if (error) console.warn('[updateProduct] Edge Function 调用失败，回退直写：', error.message || JSON.stringify(error))
    else if (data?.error) console.warn('[updateProduct] Edge Function 业务错误，回退直写：', data.error)
  } catch (e: any) {
    console.warn('[updateProduct] 调用 Edge Function 异常，回退直写：', e?.message || e)
  }

  // 回退：直连更新（依赖 products 表 RLS 写策略）
  const { error } = await supabase.from('products').update(params as any).eq('id', id)
  // 软降级：若 products 表尚未加食疗导购新列（迁移 00100 未执行），剥离后重试
  if (error && NEW_COLUMN_RE.test(error.message)) {
    const r2 = await supabase.from('products').update(stripNewProductColumns(params as any)).eq('id', id)
    return !r2.error
  }
  return !error
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return !error
}

// =====================
// 文章归属 API
// =====================

/**
 * 文章预览时归属
 * 当用户通过文章分享链接进入，预览文章时自动建立归属关系
 * @param storeId 门店 ID
 * @param inviterCode 推广码（ref 参数）
 */
export async function lockCustomerByArticle(storeId: string, inviterCode: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !storeId) return

    // 1) 文章分享带推广码 → 同步绑定推广链（先到先得，已绑则跳过）
    //    规则：全部佣金「谁先锁客谁先拿」——门店锁客只做业绩归因、不参与佣金；
    //    此步确保「先锁客的推广员」拿到佣金，不被门店锁客挤掉。
    if (inviterCode) {
      try {
        const code = String(inviterCode).trim()
        const { data: referrer } = await supabase
          .from('profiles')
          .select('id')
          .or(`invite_code.eq.${code},referral_code.eq.${code}`)
          .maybeSingle()
        if (referrer && referrer.id !== user.id) {
          await supabase
            .from('profiles')
            .update({ referrer_id: referrer.id })
            .eq('id', user.id)
            .is('referrer_id', null)
        }
      } catch (e) { console.warn('[文章归因] 推广绑定失败(不影响)', e) }
    }

    // 2) 门店归属（业绩归因，不参与佣金）
    const { data: exist } = await supabase
      .from('user_store_relation')
      .select('id')
      .eq('user_id', user.id)
      .eq('store_id', storeId)
      .maybeSingle()
    if (exist) return  // 已归属，不重复插入

    // 插入归属关系
    await supabase.from('user_store_relation').insert({
      user_id: user.id,
      store_id: storeId,
      lock_type: 'article',  // 文章分享归属
      locked_at: new Date().toISOString()})

    console.log(`[文章归属] user=${user.id} locked to store=${storeId}`)
  } catch (e) {
    console.warn('[文章归属] 失败(不影响)', e)
  }
}

// 强引导门店自推码：客户进入门店域（门店主页/商品详情）时，
// 若尚未绑定推广链（referrer_id 为空），自动用门店 owner 的推广码绑定，
// 使门店让利产生的佣金回流门店自身（门店 = 卖家 + 推广员，自己让利自己挣）。
// 已绑定则跳过（先绑先得，保护既有推广员权益，不二次覆盖）。
export async function bindStoreReferrer(storeId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !storeId) return

    // 已绑则跳过（先绑先得）
    const { data: me } = await supabase
      .from('profiles')
      .select('referrer_id')
      .eq('id', user.id)
      .maybeSingle()
    if ((me as any)?.referrer_id) return

    // 取门店 owner 的推广码
    const { data: store } = await supabase
      .from('stores')
      .select('owner_id')
      .eq('id', storeId)
      .maybeSingle()
    const ownerId = (store as any)?.owner_id
    if (!ownerId || ownerId === user.id) return

    const { data: owner } = await supabase
      .from('profiles')
      .select('referral_code, invite_code')
      .eq('id', ownerId)
      .maybeSingle()
    const code = (owner as any)?.referral_code || (owner as any)?.invite_code
    if (!code) return

    // 绑定（仅当为空，防二次覆盖）
    const { error } = await supabase
      .from('profiles')
      .update({ referrer_id: ownerId })
      .eq('id', user.id)
      .is('referrer_id', null)
    if (!error) console.log('[bindStoreReferrer] 门店码绑定成功 store=', storeId, 'referrer=', ownerId)
  } catch (e) {
    console.warn('[bindStoreReferrer] 失败(不影响)', e)
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
    rating: 0})
  
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
  // 审核通过：扣减用户【推广佣金账户】commission_balance（即结算的推广佣金，单位元）
  const w = await supabase.from('withdrawals').select('user_id, amount').eq('id', id).maybeSingle()
  if (!w.data) return false
  const { data: prof } = await supabase.from('profiles')
    .select('commission_balance, settled_commission').eq('id', w.data.user_id).maybeSingle()
  const cur = Number(prof?.commission_balance ?? 0)
  const amt = Number(w.data.amount)
  if (cur < amt) {
    // 余额不足，仅标记异常（不打款），由管理员线下处理
    await supabase.from('withdrawals').update({ status: 'rejected', remark: '推广佣金余额不足', updated_at: new Date().toISOString() }).eq('id', id)
    return false
  }
  // 扣减佣金账户，并累加「已结算佣金」用于对账（消费金豆 gold_beans 不在此链路）
  const settled = Number(prof?.settled_commission ?? 0) + amt
  await supabase.from('profiles').update({
    commission_balance: cur - amt,
    settled_commission: Math.round(settled * 100) / 100,
    updated_at: new Date().toISOString()}).eq('id', w.data.user_id)
  const { error } = await supabase.from('withdrawals').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', id)
  return !error
}

export async function adminRejectWithdrawal(id: string): Promise<boolean> {
  // 申请时未预扣余额，驳回无需退还（避免凭空加钱）
  const { error } = await supabase.from('withdrawals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id)
  return !error
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
// 注意：order_items 表未持久化 store_id（createOrderV2 仅写入 orders.store_id），
// 因此必须按「关联订单的 store_id」过滤，否则商家永远查不到订单。
export async function getMerchantOrders(storeId: string, page = 0, limit = 20): Promise<any[]> {
  // 用 orders!inner 把门店过滤变成真正的 INNER JOIN 条件，
  // 即使 RLS 放行了商家作为买家的跨店订单，也不会泄漏到本店订单列表。
  const { data, error } = await supabase.from('order_items')
    .select('*, orders!inner(id,order_no,status,total_amount,created_at,payment_method, merchant_settlements(settle_amount, discount_pool))')
    .eq('orders.store_id', storeId).order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  if (error) { console.error('[getMerchantOrders]', error); return [] }
  return (data ?? []) as any[]
}

// 商家发货（配送）：订单进入「待收货」
export async function merchantShipOrder(orderId: string, shipCompany?: string, shipNo?: string): Promise<boolean> {
  const { error } = await supabase.from('orders').update({
    status: 'pending_receive',
    ship_company: shipCompany || null,
    ship_no: shipNo || null,
    shipped_at: new Date().toISOString()}).eq('id', orderId)
  if (error) { console.error('[merchantShipOrder]', error); return false }
  return true
}

// 商家核销（堂食）：核销即视为已使用，进入「待评价」可供确权
export async function merchantVerifyPickup(orderId: string): Promise<boolean> {
  const { error } = await supabase.from('orders').update({
    status: 'pending_review',
    verified_at: new Date().toISOString()}).eq('id', orderId)
  if (error) { console.error('[merchantVerifyPickup]', error); return false }
  return true
}

// 商家确认完成订单：触发 trg_orders_settle 自动结算货款到 stores.merchant_balance
// 适用状态：pending_receive(已发货待收货) / pending_pickup(待核销) / pending_review(待评价)
// —— 让商家成为完成的最终确认方，不等买家评价（契合水果店到店/自提场景）
export async function merchantCompleteOrder(orderId: string): Promise<boolean> {
  const { error } = await supabase.from('orders').update({
    status: 'completed',
    paid_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) { console.error('[merchantCompleteOrder]', error); return false }
  return true
}

// =====================
// 提现管理
// =====================
export async function applyWithdraw(params: {
  store_id?: string; amount: number; withdraw_method: import('./types').WithdrawMethod
  bank_name?: string; bank_account?: string; bank_holder?: string
  alipay_account?: string; remark?: string
  real_name?: string; id_card?: string
}): Promise<import('./types').Withdrawal | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // P1-B 修复：客户端前置余额校验（第一道防御；最终拦截在 payWithdrawal 服务端）。
  // 提现兑付的是推广佣金 commission_balance，超额申请会被打款环节拦住，
  // 但此处提前挡掉明显超额，避免脏数据堆积进审核列表。
  const amt = Number(params.amount) || 0
  if (!amt || amt <= 0) {
    Taro.showToast({ title: '提现金额无效', icon: 'none' }); return null
  }
  try {
    const { data: profile } = await supabase
      .from('profiles').select('commission_balance').eq('id', user.id).single()
    const balance = Number((profile as any)?.commission_balance || 0)
    if (balance < amt) {
      Taro.showToast({ title: `可提现佣金不足（当前 ${balance.toFixed(2)} 元）`, icon: 'none' }); return null
    }
  } catch (e) {
    // 余额读取失败不阻断主流程，放行至服务端 payWithdrawal 最终校验
    console.warn('[applyWithdraw] 余额校验失败，放行至审核环节', e)
  }

  // 真实姓名统一存入 real_name；银行卡方式同时回填 bank_holder 以兼容旧读取
  const realName = params.real_name?.trim() || null
  const { data, error } = await supabase.from('withdrawals')
    .insert({
      ...params,
      user_id: user.id,
      status: 'pending',
      real_name: realName,
      id_card: params.id_card?.trim() || null,
      bank_holder: params.withdraw_method === 'bank'
        ? (params.bank_holder?.trim() || realName)
        : params.bank_holder?.trim() || null}).select().maybeSingle()
  if (error) { console.error('[applyWithdraw]', error); return null }
  return data
}

export async function getMyWithdrawals(page = 0, limit = 20): Promise<import('./types').Withdrawal[]> {
  const { data } = await supabase.from('withdrawals').select('*')
    .order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1)
  return (data ?? []) as import('./types').Withdrawal[]
}

// =====================
// 已保存收款账户（迁移 00123）：绑定一次，免二次填写
// =====================
export async function getWithdrawalAccounts(
  ownerId: string,
  ownerType: 'user' | 'store',
): Promise<import('./types').SavedWithdrawalAccount[]> {
  if (!ownerId) return []
  const { data, error } = await supabase.rpc('fn_get_withdrawal_accounts', {
    p_owner_id: ownerId,
    p_owner_type: ownerType,
  })
  if (error) { console.error('[getWithdrawalAccounts]', error); return [] }
  const d = (data as any) || {}
  if (!d.ok) return []
  return (d.accounts ?? []) as import('./types').SavedWithdrawalAccount[]
}

export async function saveWithdrawalAccount(params: {
  ownerId: string
  ownerType: 'user' | 'store'
  method: import('./types').WithdrawMethod
  realName?: string
  idCard?: string
  bankName?: string
  bankAccount?: string
  bankHolder?: string
  alipayAccount?: string
  makeDefault?: boolean
}): Promise<boolean> {
  if (!params.ownerId) return false
  const { error } = await supabase.rpc('fn_save_withdrawal_account', {
    p_owner_id: params.ownerId,
    p_owner_type: params.ownerType,
    p_method: params.method,
    p_real_name: params.realName ?? null,
    p_id_card: params.idCard ?? null,
    p_bank_name: params.bankName ?? null,
    p_bank_account: params.bankAccount ?? null,
    p_bank_holder: params.bankHolder ?? null,
    p_alipay_account: params.alipayAccount ?? null,
    p_make_default: params.makeDefault ?? true,
  })
  if (error) { console.error('[saveWithdrawalAccount]', error); return false }
  return true
}

export async function deleteWithdrawalAccount(id: string): Promise<boolean> {
  if (!id) return false
  const { error } = await supabase.rpc('fn_delete_withdrawal_account', { p_id: id })
  if (error) { console.error('[deleteWithdrawalAccount]', error); return false }
  return true
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
      viewed_at: new Date().toISOString()}, { onConflict: 'user_id,product_id' })
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
  rating: number; content?: string; mood_tags?: string[]
}>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const rows = reviews.map(r => ({ 
    ...r, 
    user_id: user.id,
    mood_tags: r.mood_tags && r.mood_tags.length > 0 ? r.mood_tags : null}))
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
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return []
  const { data } = await supabase.from('coupons').select('*').eq('user_id', uid).order('created_at', { ascending: false })
  return (data ?? []) as import('./types').Coupon[]
}

// 可领取的券模板（user_id IS NULL 且上架中），供用户端"领券中心"展示
export async function getClaimableCoupons(): Promise<import('./types').Coupon[]> {
  const { data } = await supabase.from('coupons')
    .select('*')
    .is('user_id', null)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  return (data ?? []) as import('./types').Coupon[]
}

// 用户领取某模板券 → 生成个人实例（RPC 原子操作，防重复）
export async function claimCoupon(templateId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('claim_coupon', { p_template_id: templateId })
  if (error) return { ok: false, error: error.message }
  const res = data as any
  return res?.ok ? { ok: true } : { ok: false, error: res?.error || '领取失败' }
}

// 商家核销本店用户券（RPC 原子操作，仅本店店主可核销）
export async function merchantRedeemCoupon(code: string, storeId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('merchant_redeem_coupon', { p_code: code, p_store_id: storeId })
  if (error) return { ok: false, error: error.message }
  const res = data as any
  return res?.ok ? { ok: true } : { ok: false, error: res?.error || '核销失败' }
}

// =====================
// 用户设置
// =====================
export async function updateUserProfile(params: { nickname?: string; avatar_url?: string; allow_behavior_analysis?: boolean }): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.from('profiles').update(params).eq('id', user.id)
  return !error
}

// =====================
// 食材食疗导购 · 用户反馈回流（个性化权重）
// =====================

export type FoodTherapyEvent = 'view' | 'add_cart' | 'purchase' | 'like' | 'dislike'

// 埋点：记录用户与导购商品的一次交互。best-effort，不阻断主流程。
// 迁移 00103 未执行时表不存在，insert 失败被 catch 静默吞掉。
export async function trackFoodTherapyEvent(params: {
  productId?: string | null
  eventType: FoodTherapyEvent
  healthTag?: string[] | null
  emotionTag?: string[] | null
}): Promise<boolean> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return false
    const { error } = await supabase.from('food_therapy_feedback').insert({
      user_id: uid,
      product_id: params.productId ?? null,
      event_type: params.eventType,
      health_tag: params.healthTag ?? [],
      emotion_tag: params.emotionTag ?? []})
    if (error) {
      console.warn('[trackFoodTherapyEvent] 跳过（反馈表可能未迁移）:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[trackFoodTherapyEvent] 异常(不影响主流程)', e)
    return false
  }
}

// 读取当前用户的个性化权重：统计各 health_tag 的正负反馈。
// 加购/购买/点赞 +1，点踩 -1（view 不计权重，仅作潜在兴趣）。
// 返回 { [tag]: number }，打分引擎据其提升匹配标签的加分。
export async function getUserFoodTherapyWeights(): Promise<Record<string, number>> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return {}
    const { data, error } = await supabase
      .from('food_therapy_feedback')
      .select('event_type, health_tag')
      .eq('user_id', uid)
    if (error) {
      console.warn('[getUserFoodTherapyWeights] 跳过（反馈表可能未迁移）:', error.message)
      return {}
    }
    const weights: Record<string, number> = {}
    for (const row of (data ?? []) as { event_type: string; health_tag: string[] | null }[]) {
      const sign = row.event_type === 'dislike' ? -1 : row.event_type === 'view' ? 0 : 1
      if (sign === 0) continue
      for (const t of row.health_tag ?? []) {
        weights[t] = (weights[t] ?? 0) + sign
      }
    }
    return weights
  } catch (e) {
    console.warn('[getUserFoodTherapyWeights] 异常(不影响主流程)', e)
    return {}
  }
}
