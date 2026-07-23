// ============================================================
// 食品配料安全管理系统 · API 路径层（食品域 V1.0 全量）
// ------------------------------------------------------------
// 复用项目原有 Supabase 客户端（@/client/supabase），与 api.ts 完全同构：
//   supabase.from('table').select(...).eq(...) 链式调用
//   + 类型化返回 + console.error 兜底（不阻断主流程）
// 覆盖范围（按「食品域 V1.0」规划，异业共享会员联盟不在此实现；
// 二级分销复用来电有喜既有模型，不重复造）：
//   1) 配料安全库        food_additives          （白/黄/黑风险 + 国标，壁垒资产）
//   2) 别名表            food_additive_aliases    （提升 OCR 匹配率）
//   3) 商品-配料关联      product_food_additives   + 商品食养字段持久化
//   4) 配料表 OCR 复核    ingredient_ocr_tasks     （拍照识别 + 人工复核闭环）
//   5) 库存批次+临期      stock_batches            （入库质检 / 临期预警）
//   6) 库存汇总          inventories              （按仓/车实时库存）
//   7) 流动车 + 调拨      vehicles / vehicle_transfers （出库/回库/跨车，弱网离线）
//   8) 会员摄入 + 画像    intake_logs / health_reports （按月聚合）
// 调用示例：
//   import { getFoodAdditives, setProductFoodAdditives, createIngredientOcrTask,
//            addStockBatch, createVehicleTransfer, logIntake } from '@/db/food-api'
// ============================================================
import { supabase } from '@/client/supabase'
import type {
  FoodAdditive,
  FoodAdditiveAlias,
  ProductFoodAdditive,
  IngredientOcrTask,
  IntakeLog,
  HealthReport,
  StockBatch,
  Inventory,
  Vehicle,
  VehicleTransfer,
} from './types'
import { matchIngredientKeys } from '@/utils/ingredient-analysis'

// ============================================================
// 1. 配料安全库 food_additives（白/黄/黑风险 + 国标）
// ============================================================
export async function getFoodAdditives(opts: {
  search?: string
  category?: string
  risk_level?: FoodAdditive['risk_level']
  status?: FoodAdditive['status']
  limit?: number
} = {}): Promise<FoodAdditive[]> {
  let q = supabase.from('food_additives').select('*').order('name')
  if (opts.search) q = q.ilike('name', `%${opts.search}%`)
  if (opts.category) q = q.eq('category', opts.category)
  if (opts.risk_level) q = q.eq('risk_level', opts.risk_level)
  if (opts.status) q = q.eq('status', opts.status)
  else q = q.eq('status', 'active') // 默认仅查已审核生效条目
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) {
    console.error('[getFoodAdditives] 查询失败:', error.message)
    return []
  }
  return (data as FoodAdditive[]) ?? []
}

export async function getFoodAdditive(id: string): Promise<FoodAdditive | null> {
  const { data } = await supabase.from('food_additives').select('*').eq('id', id).maybeSingle()
  return (data as FoodAdditive) ?? null
}

export async function upsertFoodAdditive(
  payload: Partial<FoodAdditive> & { name: string },
): Promise<FoodAdditive | null> {
  const { data, error } = await supabase.from('food_additives').upsert(payload).select().maybeSingle()
  if (error) {
    console.error('[upsertFoodAdditive] 写入失败:', error.message)
    return null
  }
  return (data as FoodAdditive) ?? null
}

export async function deleteFoodAdditive(id: string): Promise<boolean> {
  const { error } = await supabase.from('food_additives').delete().eq('id', id)
  if (error) {
    console.error('[deleteFoodAdditive] 删除失败:', error.message)
    return false
  }
  return true
}

// ============================================================
// 2. 配料别名 food_additive_aliases（俗称/异体映射）
// ============================================================
export async function getFoodAdditiveAliases(additiveId: string): Promise<FoodAdditiveAlias[]> {
  const { data, error } = await supabase
    .from('food_additive_aliases')
    .select('*')
    .eq('additive_id', additiveId)
  if (error) {
    console.error('[getFoodAdditiveAliases] 查询失败:', error.message)
    return []
  }
  return (data as FoodAdditiveAlias[]) ?? []
}

export async function upsertFoodAdditiveAlias(
  payload: Partial<FoodAdditiveAlias> & { additive_id: string; alias: string },
): Promise<FoodAdditiveAlias | null> {
  const { data, error } = await supabase
    .from('food_additive_aliases')
    .upsert(payload, { onConflict: 'additive_id,alias' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('[upsertFoodAdditiveAlias] 写入失败:', error.message)
    return null
  }
  return (data as FoodAdditiveAlias) ?? null
}

// ============================================================
// 3. 商品-配料关联 product_food_additives
// ============================================================
export async function getProductFoodAdditives(productId: string): Promise<ProductFoodAdditive[]> {
  const { data, error } = await supabase
    .from('product_food_additives')
    .select('*')
    .eq('product_id', productId)
  if (error) {
    console.error('[getProductFoodAdditives] 查询失败:', error.message)
    return []
  }
  return (data as ProductFoodAdditive[]) ?? []
}

/** 全量替换某商品的配料关联（先删后插，保证与勾选结果完全一致） */
export async function setProductFoodAdditives(
  productId: string,
  additiveIds: string[],
): Promise<boolean> {
  const { error: dErr } = await supabase
    .from('product_food_additives')
    .delete()
    .eq('product_id', productId)
  if (dErr) {
    console.error('[setProductFoodAdditives] 删除旧关联失败:', dErr.message)
    return false
  }
  if (additiveIds.length) {
    const rows = additiveIds.map((aid) => ({ product_id: productId, additive_id: aid }))
    const { error } = await supabase.from('product_food_additives').insert(rows)
    if (error) {
      console.error('[setProductFoodAdditives] 插入新关联失败:', error.message)
      return false
    }
  }
  return true
}

/** 反向查询：某配料被哪些商品使用 */
export async function getProductsByFoodAdditive(
  additiveId: string,
  limit = 50,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('product_food_additives')
    .select('product_id')
    .eq('additive_id', additiveId)
    .limit(limit)
  if (error) {
    console.error('[getProductsByFoodAdditive] 查询失败:', error.message)
    return []
  }
  return ((data as ProductFoodAdditive[]) ?? []).map((r) => r.product_id)
}

/**
 * 持久化商品食养字段（与迁移 00100 列对齐）。
 * 写入失败仅告警不阻断（软降级，保证上架/编辑流程不崩）。
 */
export async function updateProductFoodFields(
  productId: string,
  fields: {
    ingredients?: string[] | null
    overall_nature?: string | null
    health_tag?: string[] | null
    emotion_tag?: string[] | null
    match_goods?: string[] | null
    conflict_goods?: string[] | null
    aux_remind?: string | null
  },
): Promise<boolean> {
  const { error } = await supabase.from('products').update(fields).eq('id', productId)
  if (error) {
    console.error('[updateProductFoodFields] 写入失败:', error.message)
    return false
  }
  return true
}

/**
 * 将 OCR 原文本 / 商品名解析出的配料，匹配到安全库 food_additives。
 * 复用现有 ingredient-analysis 的 matchIngredientKeys（基于 shiyang-dictionary 做初筛），
 * 再以命中词去 food_additives 取安全分级。
 */
export async function resolveFoodAdditivesByText(text: string): Promise<FoodAdditive[]> {
  const keys = matchIngredientKeys(text)
  if (!keys.length) return []
  const { data, error } = await supabase.from('food_additives').select('*').in('name', keys)
  if (error) {
    console.error('[resolveFoodAdditivesByText] 查询失败:', error.message)
    return []
  }
  return (data as FoodAdditive[]) ?? []
}

// ============================================================
// 4. 配料表 OCR 任务 ingredient_ocr_tasks（识别 + 人工复核闭环）
// ============================================================
export type OcrStatus = 'pending' | 'reviewing' | 'approved' | 'rejected'

export async function createIngredientOcrTask(payload: {
  product_id?: string | null
  store_id?: string | null
  image_url: string
  raw_text?: string | null
  parsed_ingredients?: string[] | null
  matched_additives?: string[] | null   // 已匹配安全库的配料名
  safety_grade?: 'S' | 'A' | 'C' | null // 引擎初算安全评级
  risk_flags?: string[] | null
  created_by?: string | null
}): Promise<IngredientOcrTask | null> {
  const { data, error } = await supabase
    .from('ingredient_ocr_tasks')
    .insert(payload)
    .select()
    .maybeSingle()
  if (error) {
    console.error('[createIngredientOcrTask] 创建失败:', error.message)
    return null
  }
  return (data as IngredientOcrTask) ?? null
}

export async function getIngredientOcrTask(id: string): Promise<IngredientOcrTask | null> {
  const { data } = await supabase
    .from('ingredient_ocr_tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as IngredientOcrTask) ?? null
}

export async function listIngredientOcrTasks(opts: {
  status?: OcrStatus
  store_id?: string
  limit?: number
} = {}): Promise<IngredientOcrTask[]> {
  let q = supabase
    .from('ingredient_ocr_tasks')
    .select('*')
    .order('created_at', { ascending: false })
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.store_id) q = q.eq('store_id', opts.store_id)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) {
    console.error('[listIngredientOcrTasks] 查询失败:', error.message)
    return []
  }
  return (data as IngredientOcrTask[]) ?? []
}

export async function updateIngredientOcrTask(
  id: string,
  fields: Partial<
    Pick<
      IngredientOcrTask,
      | 'raw_text'
      | 'parsed_ingredients'
      | 'matched_additives'
      | 'safety_grade'
      | 'status'
      | 'reviewer_id'
      | 'review_note'
      | 'risk_flags'
    >
  >,
): Promise<boolean> {
  const { error } = await supabase
    .from('ingredient_ocr_tasks')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('[updateIngredientOcrTask] 更新失败:', error.message)
    return false
  }
  return true
}

// ============================================================
// 5. 库存批次 stock_batches（入库质检 + 临期预警）
// ============================================================
export async function getStockBatches(opts: {
  product_id?: string
  store_id?: string
  status?: StockBatch['status']
  limit?: number
} = {}): Promise<StockBatch[]> {
  let q = supabase.from('stock_batches').select('*').order('expire_at', { ascending: true })
  if (opts.product_id) q = q.eq('product_id', opts.product_id)
  if (opts.store_id) q = q.eq('store_id', opts.store_id)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) {
    console.error('[getStockBatches] 查询失败:', error.message)
    return []
  }
  return (data as StockBatch[]) ?? []
}

export async function addStockBatch(
  payload: Partial<StockBatch> & { product_id: string; qty: number },
): Promise<StockBatch | null> {
  const { data, error } = await supabase.from('stock_batches').insert(payload).select().maybeSingle()
  if (error) {
    console.error('[addStockBatch] 入库失败:', error.message)
    return null
  }
  return (data as StockBatch) ?? null
}

export async function updateStockBatch(
  id: string,
  fields: Partial<Pick<StockBatch, 'qty' | 'status' | 'expire_at' | 'batch_no'>>,
): Promise<boolean> {
  const { error } = await supabase.from('stock_batches').update(fields).eq('id', id)
  if (error) {
    console.error('[updateStockBatch] 更新失败:', error.message)
    return false
  }
  return true
}

/** 临期预警：返回 N 天内到期且未售罄的批次 */
export async function getExpiringBatches(days = 30, storeId?: string): Promise<StockBatch[]> {
  const horizon = new Date(Date.now() + days * 86400000).toISOString()
  let q = supabase
    .from('stock_batches')
    .select('*')
    .not('expire_at', 'is', null)
    .lte('expire_at', horizon)
    .neq('status', 'sold_out')
    .order('expire_at', { ascending: true })
  if (storeId) q = q.eq('store_id', storeId)
  const { data, error } = await q
  if (error) {
    console.error('[getExpiringBatches] 查询失败:', error.message)
    return []
  }
  return (data as StockBatch[]) ?? []
}

// ============================================================
// 6. 库存汇总 inventories（按仓/车实时库存）
// ============================================================
export async function getInventory(
  ownerType: Inventory['owner_type'],
  ownerId: string,
): Promise<Inventory[]> {
  const { data, error } = await supabase
    .from('inventories')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
  if (error) {
    console.error('[getInventory] 查询失败:', error.message)
    return []
  }
  return (data as Inventory[]) ?? []
}

/** 设置某 owner 下某商品库存（upsert，按 owner_type+owner_id+product_id 唯一） */
export async function setInventory(payload: {
  owner_type: Inventory['owner_type']
  owner_id: string
  product_id: string
  qty: number
}): Promise<boolean> {
  const { error } = await supabase.from('inventories').upsert(payload, {
    onConflict: 'owner_type,owner_id,product_id',
  })
  if (error) {
    console.error('[setInventory] 写入失败:', error.message)
    return false
  }
  return true
}

/** 库存增减（发货/回库/售卖） */
export async function adjustInventory(
  ownerType: Inventory['owner_type'],
  ownerId: string,
  productId: string,
  delta: number,
): Promise<boolean> {
  const rows = await getInventory(ownerType, ownerId)
  const cur = rows.find((r) => r.product_id === productId)
  const next = Math.max(0, (cur?.qty ?? 0) + delta)
  return setInventory({ owner_type: ownerType, owner_id: ownerId, product_id: productId, qty: next })
}

// ============================================================
// 7. 流动车 + 调拨 vehicles / vehicle_transfers
// ============================================================
export async function getVehicles(opts: {
  store_id?: string
  status?: Vehicle['status']
} = {}): Promise<Vehicle[]> {
  let q = supabase.from('vehicles').select('*').order('created_at', { ascending: true })
  if (opts.store_id) q = q.eq('store_id', opts.store_id)
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) {
    console.error('[getVehicles] 查询失败:', error.message)
    return []
  }
  return (data as Vehicle[]) ?? []
}

export async function createVehicle(
  payload: Partial<Vehicle> & { name: string },
): Promise<Vehicle | null> {
  const { data, error } = await supabase.from('vehicles').insert(payload).select().maybeSingle()
  if (error) {
    console.error('[createVehicle] 创建失败:', error.message)
    return null
  }
  return (data as Vehicle) ?? null
}

export async function updateVehicle(
  id: string,
  fields: Partial<Pick<Vehicle, 'name' | 'status' | 'store_id'>>,
): Promise<boolean> {
  const { error } = await supabase.from('vehicles').update(fields).eq('id', id)
  if (error) {
    console.error('[updateVehicle] 更新失败:', error.message)
    return false
  }
  return true
}

export async function createVehicleTransfer(payload: {
  vehicle_id?: string | null
  type: VehicleTransfer['type']
  product_id?: string | null
  qty: number
  operator_id?: string | null
  sync_status?: VehicleTransfer['sync_status']
}): Promise<VehicleTransfer | null> {
  const { data, error } = await supabase
    .from('vehicle_transfers')
    .insert({ ...payload, sync_status: payload.sync_status ?? 'synced' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('[createVehicleTransfer] 创建失败:', error.message)
    return null
  }
  return (data as VehicleTransfer) ?? null
}

export async function listVehicleTransfers(opts: {
  vehicle_id?: string
  type?: VehicleTransfer['type']
  sync_status?: VehicleTransfer['sync_status']
  limit?: number
} = {}): Promise<VehicleTransfer[]> {
  let q = supabase
    .from('vehicle_transfers')
    .select('*')
    .order('created_at', { ascending: false })
  if (opts.vehicle_id) q = q.eq('vehicle_id', opts.vehicle_id)
  if (opts.type) q = q.eq('type', opts.type)
  if (opts.sync_status) q = q.eq('sync_status', opts.sync_status)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) {
    console.error('[listVehicleTransfers] 查询失败:', error.message)
    return []
  }
  return (data as VehicleTransfer[]) ?? []
}

/** 弱网恢复后，把离线(pending)调拨单标记为已同步 */
export async function syncVehicleTransfer(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('vehicle_transfers')
    .update({ sync_status: 'synced' } as Partial<VehicleTransfer>)
    .eq('id', id)
  if (error) {
    console.error('[syncVehicleTransfer] 同步失败:', error.message)
    return false
  }
  return true
}

// ============================================================
// 8. 会员摄入 intake_logs + 健康画像 health_reports
// ============================================================
export async function logIntake(payload: {
  user_id: string
  product_id?: string | null
  product_name?: string | null
  ingredients?: string[] | null
  nature?: string | null
  health_tags?: string[] | null
  scene?: string | null
  taken_at?: string
}): Promise<IntakeLog | null> {
  const row = { ...payload, taken_at: payload.taken_at ?? new Date().toISOString() }
  const { data, error } = await supabase.from('intake_logs').insert(row).select().maybeSingle()
  if (error) {
    console.error('[logIntake] 写入失败:', error.message)
    return null
  }
  return (data as IntakeLog) ?? null
}

export async function getIntakeLogs(
  userId: string,
  opts: { limit?: number; since?: string } = {},
): Promise<IntakeLog[]> {
  let q = supabase
    .from('intake_logs')
    .select('*')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })
  if (opts.since) q = q.gte('taken_at', opts.since)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) {
    console.error('[getIntakeLogs] 查询失败:', error.message)
    return []
  }
  return (data as IntakeLog[]) ?? []
}

export async function upsertHealthReport(payload: {
  user_id: string
  period: string
  nature_distribution?: Record<string, number> | null
  top_ingredients?: string[] | null
  risk_flags?: string[] | null
  advice?: string | null
}): Promise<HealthReport | null> {
  const { data, error } = await supabase
    .from('health_reports')
    .upsert(payload, { onConflict: 'user_id,period' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('[upsertHealthReport] 写入失败:', error.message)
    return null
  }
  return (data as HealthReport) ?? null
}

export async function getHealthReport(
  userId: string,
  period: string,
): Promise<HealthReport | null> {
  const { data } = await supabase
    .from('health_reports')
    .select('*')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle()
  return (data as HealthReport) ?? null
}
