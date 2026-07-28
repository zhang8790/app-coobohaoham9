import { supabase } from '@/lib/supabase'
import type { StoreCategory } from '@/types'

/**
 * 组合查询：店内分类 + 可选全局分类（平台建的 scope='global'）
 * - 商家端：getCategories({ storeId, includeGlobal: true }) 取到「本店 + 全局」两套
 * - 总后台全局管理：getCategories({ includeGlobal: true })（storeId 不传即只取全局）
 */
export async function getCategories(opts: { storeId?: string | null; includeGlobal?: boolean } = {}): Promise<StoreCategory[]> {
  const { storeId, includeGlobal = true } = opts
  let q = supabase.from('store_categories').select('*')
  if (storeId) {
    q = includeGlobal
      ? q.or(`store_id.eq.${storeId},scope.eq.global`)
      : q.eq('store_id', storeId)
  } else if (includeGlobal) {
    q = q.eq('scope', 'global')
  } else {
    q = q.eq('store_id', '00000000-0000-0000-0000-000000000000')
  }
  const { data, error } = await q.order('sort_order', { ascending: true })
  if (error) { console.warn('[getCategories]', error); return [] }
  return (data as StoreCategory[]) ?? []
}

/** 新建分类：storeId 有值→店内分类(scope='store')，否则→全局分类(scope='global') */
export async function createStoreCategory(input: {
  storeId: string | null
  name: string
  sortOrder?: number
  scope?: 'global' | 'store'
}): Promise<StoreCategory | null> {
  const scope = input.scope ?? (input.storeId ? 'store' : 'global')
  const { data, error } = await supabase.from('store_categories').insert({
    store_id: input.storeId ?? null,
    name: input.name.trim(),
    sort_order: Number.isFinite(input.sortOrder as number) ? (input.sortOrder as number) : 0,
    scope,
  }).select().single()
  if (error) { console.warn('[createStoreCategory]', error); return null }
  return data as StoreCategory
}

export async function updateStoreCategory(id: string, patch: { name?: string; sort_order?: number; is_active?: boolean }): Promise<boolean> {
  const { error } = await supabase.from('store_categories').update(patch).eq('id', id)
  if (error) { console.warn('[updateStoreCategory]', error); return false }
  return true
}

/** 统计某分类文字下有多少商品（用于改名前提示是否级联同步） */
export async function countProductsByCategory(name: string): Promise<number> {
  const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category', name)
  if (error) { console.warn('[countProductsByCategory]', error); return 0 }
  return count ?? 0
}

/** 级联改名：把 category=oldName 的商品改为 newName（保证"按名称匹配"方案下商品不丢失归类） */
export async function syncStoreCategoryName(oldName: string, newName: string): Promise<boolean> {
  const { error } = await supabase.from('products').update({ category: newName }).eq('category', oldName)
  if (error) { console.warn('[syncStoreCategoryName]', error); return false }
  return true
}

/** 删除分类：products.category_id 因 ON DELETE SET NULL 自动归位「未分类」 */
export async function deleteStoreCategory(id: string): Promise<boolean> {
  const { error } = await supabase.from('store_categories').delete().eq('id', id)
  if (error) { console.warn('[deleteStoreCategory]', error); return false }
  return true
}
