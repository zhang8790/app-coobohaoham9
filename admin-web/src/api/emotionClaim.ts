import { supabase } from '@/lib/supabase'
import type { EmotionClaimRow, EmotionClaimStats, EmotionClaimStatus, EmotionRuleVersion } from '@/types'

export const EMOTION_CLAIM_PAGE_SIZE = 15

// ============ 概览统计 ============
// 优先用 SECURITY DEFINER RPC（绕 RLS）；失败兜底直接聚合（RLS 关闭时可用）
export async function getEmotionClaimStats(): Promise<EmotionClaimStats | null> {
  try {
    const { data, error } = await supabase.rpc('fn_admin_emotion_stats')
    if (!error && data) return data as EmotionClaimStats
  } catch { /* RPC 不存在则走兜底 */ }

  try {
    const { data, error } = await supabase
      .from('emotion_claims')
      .select('user_id, status, cv_amount, tb_amount')
    if (!error && data) {
      const rows = data as any[]
      const active = rows.filter(d => d.status === 'active')
      return {
        total: rows.length,
        active: active.length,
        voided: rows.length - active.length,
        active_cv: active.reduce((s, d) => s + Number(d.cv_amount || 0), 0),
        active_tb: active.reduce((s, d) => s + Number(d.tb_amount || 0), 0),
        active_users: new Set(active.map(d => d.user_id)).size,
      }
    }
  } catch { /* ignore */ }
  return null
}

// ============ 列表 ============
// 直接读 emotion_claims（RLS 关闭，anon 可读）。
// 不依赖不存在的 RPC（fn_admin_list_emotion_claims）与不存在的 FK 关系
// （emotion_claims.user_id 建表时未设外键，无法用 profiles!user_id 语法 join）。
// 改用「先取确权 + 再批量取涉及用户」两步查询，JS 端合并，彻底消除隐性空白。
export async function getEmotionClaims(
  status: EmotionClaimStatus | null,
  page: number,
  pageSize = EMOTION_CLAIM_PAGE_SIZE,
): Promise<{ data: EmotionClaimRow[]; total: number }> {
  try {
    let q = supabase
      .from('emotion_claims')
      .select('*', { count: 'exact' })
    if (status) q = q.eq('status', status)
    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (!error && data) {
      const rows = data as any[]
      const profiles = await fetchProfiles(rows.map(r => r.user_id))
      const pmap = new Map(profiles.map(p => [p.id, p]))
      return {
        data: rows.map(r => normalizeClaim({
          ...r,
          nickname: pmap.get(r.user_id)?.nickname ?? null,
          phone: pmap.get(r.user_id)?.phone ?? null,
          user_is_banned: pmap.get(r.user_id)?.is_banned ?? false,
        })),
        total: count ?? 0,
      }
    }
  } catch { /* ignore */ }
  return { data: [], total: 0 }
}

// 批量取涉及的用户档案（昵称/手机号/封禁态）；profiles 读不到时降级为 null（主数据仍展示）
async function fetchProfiles(ids: (string | null)[]): Promise<any[]> {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[]
  if (uniq.length === 0) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, phone, is_banned')
    .in('id', uniq)
  if (error) return []
  return (data as any[]) ?? []
}

function normalizeClaim(d: any): EmotionClaimRow {
  return {
    id: d.id,
    user_id: d.user_id,
    order_no: d.order_no ?? null,
    product_id: d.product_id ?? null,
    store_id: d.store_id ?? null,
    selected_emotion: d.selected_emotion ?? null,
    badge_text: d.badge_text ?? null,
    badge_code: d.badge_code ?? null,
    tb_amount: Number(d.tb_amount ?? 0),
    cv_amount: Number(d.cv_amount ?? 0),
    upline_l1: d.upline_l1 ?? null,
    upline_l2: d.upline_l2 ?? null,
    upline_l1_cv: Number(d.upline_l1_cv ?? 0),
    upline_l2_cv: Number(d.upline_l2_cv ?? 0),
    status: d.status ?? 'active',
    rule_version: d.rule_version ?? null,
    voided_at: d.voided_at ?? null,
    voided_reason: d.voided_reason ?? null,
    refund_ratio: Number(d.refund_ratio ?? 1),
    created_at: d.created_at,
    nickname: d.nickname ?? null,
    phone: d.phone ?? null,
    user_is_banned: Boolean(d.user_is_banned ?? d.is_banned ?? false),
  }
}

// ============ §5.1 退款作废（回滚本人 + 上级裂变分） ============
export async function voidEmotionClaim(
  claimId: string, reason: string, ratio: number,
): Promise<{ ok: boolean; msg?: string }> {
  try {
    const { data, error } = await supabase.rpc('fn_void_emotion_claim', {
      p_claim_id: claimId,
      p_reason: reason || 'refund',
      p_refund_ratio: ratio,
    })
    if (error) return { ok: false, msg: error.message }
    return { ok: Boolean((data as any)?.ok), msg: (data as any)?.msg }
  } catch (e: any) {
    return { ok: false, msg: e?.message || '操作失败' }
  }
}

// ============ §5.2 封禁（清零 + 上级裂变分扣回） ============
export async function banUserRollback(
  userId: string, reason: string,
): Promise<{ ok: boolean; msg?: string }> {
  try {
    const { data, error } = await supabase.rpc('fn_ban_user_rollback', {
      p_user_id: userId,
      p_reason: reason || 'violation',
    })
    if (error) return { ok: false, msg: error.message }
    return { ok: Boolean((data as any)?.ok), msg: (data as any)?.msg }
  } catch (e: any) {
    return { ok: false, msg: e?.message || '操作失败' }
  }
}

// ============ §5.3 规则版本（公开只读） ============
export async function getEmotionRuleVersions(): Promise<EmotionRuleVersion[]> {
  try {
    const { data, error } = await supabase
      .from('emotion_rule_versions')
      .select('*')
      .order('effective_at', { ascending: false })
    if (!error && data) return data as EmotionRuleVersion[]
  } catch { /* ignore */ }
  return []
}
