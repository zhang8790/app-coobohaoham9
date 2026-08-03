// ============================================================
// 家庭档案 API 路径层（战略支柱② · 一户一档）
// ------------------------------------------------------------
// 复用项目原有 Supabase 客户端（@/client/supabase），与 food-api 同构：
//   supabase.from('table').select/upsert/insert/delete 链式调用 + 类型化返回 + console.error 兜底（不阻断主流程）。
// 覆盖：
//   1) families           一个家庭（owner 唯一）
//   2) family_members     家庭成员结构化画像（owner 级 RLS，经 owner_id 校验）
// 调用示例：
//   import { getMyFamily, createFamily, listFamilyMembers,
//            upsertFamilyMember, deleteFamilyMember } from '@/db/family-api'
// ============================================================
import { supabase } from '@/client/supabase'
import type { Family, FamilyMember } from './types'

// ============================================================
// 1. families（一户一档）
// ============================================================

/** 读取当前用户的家庭（owner 唯一，最多一条） */
export async function getMyFamily(ownerId: string): Promise<Family | null> {
  if (!ownerId) return null
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) {
    if (!String(error.message).includes('does not exist')) {
      console.error('[getMyFamily] 查询失败:', error.message)
    }
    return null
  }
  return (data as Family) ?? null
}

/**
 * 创建或取回家庭（owner_id 唯一，幂等：已存在则回传现有家庭）。
 * 家庭缺失时由各成员操作自动兜底调用，常态下用户主动「创建家庭档案」触发。
 */
export async function createFamily(
  ownerId: string,
  name = '我的家庭',
): Promise<Family | null> {
  if (!ownerId) return null
  const { data, error } = await supabase
    .from('families')
    .upsert({ owner_id: ownerId, name }, { onConflict: 'owner_id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('[createFamily] 写入失败:', error.message)
    return null
  }
  return (data as Family) ?? null
}

// ============================================================
// 2. family_members（家庭成员结构化画像，owner 级 RLS）
// ============================================================

/** 列出当前用户家庭的全部成员（按创建时间排序） */
export async function listFamilyMembers(ownerId: string): Promise<FamilyMember[]> {
  if (!ownerId) return []
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
  if (error) {
    if (!String(error.message).includes('does not exist')) {
      console.error('[listFamilyMembers] 查询失败:', error.message)
    }
    return []
  }
  return (data as FamilyMember[]) ?? []
}

/**
 * 新增或更新家庭成员。新增时自动确保家庭存在（兜底 createFamily）。
 * payload.id 存在 → 更新；否则 → 插入（需 family_id / owner_id）。
 */
export async function upsertFamilyMember(
  payload: Partial<FamilyMember> & { owner_id: string; name: string; family_id?: string },
): Promise<FamilyMember | null> {
  if (!payload.owner_id || !payload.name) return null

  // 兜底：没有 family_id 时自动创建/取回家庭
  let familyId = payload.family_id
  if (!familyId) {
    const fam = await getMyFamily(payload.owner_id)
    const created = fam ?? (await createFamily(payload.owner_id))
    if (!created) {
      console.error('[upsertFamilyMember] 家庭创建失败')
      return null
    }
    familyId = created.id
  }

  const row: Record<string, unknown> = {
    family_id: familyId,
    owner_id: payload.owner_id,
    name: payload.name,
    age_group: payload.age_group ?? null,
    gender: payload.gender ?? null,
    constitution_type: payload.constitution_type ?? null,
    allergies: payload.allergies ?? [],
    chronic_conditions: payload.chronic_conditions ?? [],
    body_states: payload.body_states ?? [],
    health_goals: payload.health_goals ?? [],
    diet_cycle: payload.diet_cycle ?? null,
    avatar_color: payload.avatar_color ?? null,
    notes: payload.notes ?? null,
    updated_at: new Date().toISOString(),
  }
  if (payload.id) {
    const { data, error } = await supabase
      .from('family_members')
      .update(row)
      .eq('id', payload.id)
      .eq('owner_id', payload.owner_id) // 双重归属校验，防越权
      .select()
      .maybeSingle()
    if (error) {
      console.error('[upsertFamilyMember] 更新失败:', error.message)
      return null
    }
    return (data as FamilyMember) ?? null
  }
  const { data, error } = await supabase
    .from('family_members')
    .insert(row)
    .select()
    .maybeSingle()
  if (error) {
    console.error('[upsertFamilyMember] 新增失败:', error.message)
    return null
  }
  return (data as FamilyMember) ?? null
}

/**
 * 删除家庭成员（带 owner 归属校验，防越权删他人成员）。
 * 返回是否成功。
 */
export async function deleteFamilyMember(id: string, ownerId: string): Promise<boolean> {
  if (!id || !ownerId) return false
  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) {
    console.error('[deleteFamilyMember] 删除失败:', error.message)
    return false
  }
  return true
}
