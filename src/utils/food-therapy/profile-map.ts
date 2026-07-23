// 用户结构化健康画像 → 食疗引擎 映射层（V1 个性化，迁移 00205）
// ----------------------------------------------------------------------------
// 把 user_health_profile 的"结构化字段"翻译成食疗引擎能消费的 Crowd[]，
// 并导出表单选项常量，供「我的体质档案」页与画像感知引擎复用。
// 全部纯函数，零网络、零后端改动。

import type { UserHealthProfile } from '@/db/types'
import { ALLERGEN_DICT } from '@/utils/allergen-dictionary'
import {
  BODY_CROWD_OPTIONS,
  HEALTH_CROWD_OPTIONS,
  type Crowd,
} from './types'

/** 把结构化画像映射为食疗 Crowd[]（身体状态 + 慢病，均落在既有 13 人群标签库内） */
export function profileToCrowds(profile: UserHealthProfile | null): Crowd[] {
  if (!profile) return []
  const crowds: Crowd[] = []
  const bodyOk = BODY_CROWD_OPTIONS as readonly string[]
  const chronicOk = HEALTH_CROWD_OPTIONS as readonly string[]
  for (const s of profile.body_states ?? []) {
    if (bodyOk.includes(s)) crowds.push(s as Crowd)
  }
  for (const c of profile.chronic_conditions ?? []) {
    if (chronicOk.includes(c)) crowds.push(c as Crowd)
  }
  // 去重保序
  return [...new Set(crowds)]
}

// ── 表单选项常量（「我的体质档案」页与引擎共用）──

/** 致敏原多选（allergen-dictionary key → 展示名） */
export const ALLERGY_OPTIONS = ALLERGEN_DICT.map((a) => ({
  key: a.key,
  name: a.name,
  severity: a.severity,
}))

/** 身体状态多选（= BODY_CROWD_OPTIONS） */
export const BODY_STATE_OPTIONS = [...BODY_CROWD_OPTIONS] as string[]

/** 慢病/健康人群多选（= HEALTH_CROWD_OPTIONS） */
export const CHRONIC_OPTIONS = [...HEALTH_CROWD_OPTIONS] as string[]

/** 健康目标多选 */
export const HEALTH_GOAL_OPTIONS = [
  '控糖', '护胃', '助眠', '补血', '抗疲劳', '减脂', '清热',
] as const

/** 生命阶段单选 */
export const AGE_GROUP_OPTIONS = ['儿童', '青少年', '成人', '孕哺期', '老年'] as const

/** 性别单选 */
export const GENDER_OPTIONS = ['男', '女', '不填'] as const
