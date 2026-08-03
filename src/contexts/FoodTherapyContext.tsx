// 食材食疗智能导购 —— 全局状态（重构对齐版）
// 新模型：用户「勾选身体人群(多选) + 选择当前场景(单选)」，全站基于纯函数分类器
// classifyProducts 把商品分入三栏（五星推荐 / 谨慎食用 / 不建议点）。
// 战略支柱②扩展：家庭档案（一户一档）。家庭成员>0 时派生 activeProfile，
// 商品页「为谁选购」据此切换个人化食养报告对象（中性食养参考，不替代医嘱）。

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import Taro from '@tarojs/taro'
import {
  toFoodTherapyInput,
  classifyProduct as classifyOne,
  classifyProducts as classifyMany,
  CROWD_OPTIONS,
  type Crowd, type Scene, type FitTier, type FoodTherapyInput, type TierResult,
} from '@/utils/food-therapy'
import { profileToCrowds } from '@/utils/food-therapy/profile-map'
import { getUserHealthProfile } from '@/db/food-api'
import { listFamilyMembers } from '@/db/family-api'
import type { Product, UserHealthProfile, FamilyMember } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'

const CROWD_KEY = 'ftSelectedCrowds'
const SCENE_KEY = 'ftSelectedScene'
// 战略②：当前选购对象（'self' = 本人；否则为 family_members.id）
const MEMBER_KEY = 'ftSelectedMember'

interface FoodTherapyCtx {
  selectedCrowds: Crowd[]
  selectedScene: Scene | null
  toggleCrowd: (c: Crowd) => void
  setScene: (s: Scene | null) => void
  clearFilters: () => void
  // 单品分档（基于当前勾选的人群+场景）；未勾选任何人群返回 null
  classifyProduct: (p: Product) => FitTier | null
  // 批量分组（仅含命中三栏的商品）
  classifyProducts: (list: Product[]) => TierResult
  // 用户结构化画像的过敏原（来自 user_health_profile.allergens）
  userAllergens: string[]
  // 是否已建立健康画像（用于决定是否展示「适合我」个性化）
  hasHealthProfile: boolean
  // 「适合我」三态：结合用户过敏原 + 人群/场景，返回 适合/慎吃/忌口/未判定
  getSuitability: (p: Product) => FitTier | null
  // 用户本人完整结构化健康画像（驱动商品详情页「千人千面专属报告」；含 age_group 分群维度）
  userHealthProfile: UserHealthProfile | null
  // ── 战略② 家庭档案 ──
  // 家庭成员列表（本人除外；本人画像即 userHealthProfile）
  familyMembers: FamilyMember[]
  // 当前选购对象：'self' 或 family_members.id
  selectedMemberId: string
  setSelectedMemberId: (id: string) => void
  // 重新拉取家庭成员（编辑后调用，保证家庭页与商品页「为谁选购」同源一致）
  refreshFamilyMembers: () => void
  // 派生「当前画像」：选成员用成员画像，否则本人 userHealthProfile（供商品页千人千面报告）
  activeProfile: UserHealthProfile | null
}

const Ctx = createContext<FoodTherapyCtx | null>(null)

export function FoodTherapyProvider({ children }: { children: ReactNode }) {
  const [selectedCrowds, setSelectedCrowds] = useState<Crowd[]>(() => {
    try { return (Taro.getStorageSync(CROWD_KEY) || []) as Crowd[] } catch { return [] }
  })
  const [selectedScene, setSelectedScene] = useState<Scene | null>(() => {
    try { return (Taro.getStorageSync(SCENE_KEY) || null) as Scene | null } catch { return null }
  })
  // 用户结构化画像的过敏原（驱动「适合我」三态中的「忌口」判定）
  const [userAllergens, setUserAllergens] = useState<string[]>([])
  const [hasHealthProfile, setHasHealthProfile] = useState(false)
  // 完整结构化画像（含 age_group 分群维度），供商品页千人千面报告使用
  const [userHealthProfile, setUserHealthProfile] = useState<UserHealthProfile | null>(null)
  // 战略②：家庭成员 + 当前选购对象
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [selectedMemberId, setSelectedMemberIdState] = useState<string>(() => {
    try { return (Taro.getStorageSync(MEMBER_KEY) || 'self') as string } catch { return 'self' }
  })

  // 用户体质档案自动注入：登录后读取 user_health_profile 结构化画像，
  // 用 profileToCrowds 推导食疗人群并作为默认匹配项，实现"懂用户身体→自动配对商品"。
  // 优先用结构化画像；若为空，回退 profiles.constitution_tags（历史兼容）。仅注入一次，
  // 手动调整仍持久于 storage。
  const { profile } = useAuth()
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || !profile?.id) return
    seededRef.current = true
    const seedFromTags = (tags?: string[] | null) => {
      if (tags && Array.isArray(tags) && tags.length > 0) {
        const valid = tags.filter((t) => (CROWD_OPTIONS as readonly string[]).includes(t)) as Crowd[]
        if (valid.length) {
          setSelectedCrowds(valid)
          try { Taro.setStorageSync(CROWD_KEY, valid) } catch { /* storage 不可用时静默降级 */ }
        }
      }
    }
    getUserHealthProfile(profile.id)
      .then((hp) => {
        const crowds = profileToCrowds(hp)
        if (crowds.length > 0) {
          setSelectedCrowds(crowds)
          try { Taro.setStorageSync(CROWD_KEY, crowds) } catch { /* ignore */ }
        } else {
          // 结构化画像为空时回退旧自由文本标签
          seedFromTags(profile?.constitution_tags)
        }
        // 过敏原：驱动「适合我」三态中的「忌口」；空数组表示未设置
        const allergens = Array.isArray((hp as any)?.allergens) ? ((hp as any).allergens as string[]) : []
        setUserAllergens(allergens)
        setHasHealthProfile(!!hp)
        // 暴露完整画像（含 age_group），供商品页「千人千面专属报告」按 viewer 分群呈现差异化建议
        setUserHealthProfile(hp as UserHealthProfile | null)
      })
      .catch(() => seedFromTags(profile?.constitution_tags))
    // 战略②：并行加载家庭成员（一户一档），用于「为谁选购」
    listFamilyMembers(profile.id)
      .then((rows) => setFamilyMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setFamilyMembers([]))
  }, [profile?.id])

  // 选购对象若指向已删除成员，回落本人，避免选中幽灵成员
  useEffect(() => {
    if (selectedMemberId !== 'self' && !familyMembers.some((m) => m.id === selectedMemberId)) {
      setSelectedMemberIdState('self')
      try { Taro.setStorageSync(MEMBER_KEY, 'self') } catch { /* ignore */ }
    }
  }, [selectedMemberId, familyMembers])

  const setSelectedMemberId = useCallback((id: string) => {
    setSelectedMemberIdState(id)
    try { Taro.setStorageSync(MEMBER_KEY, id) } catch { /* storage 不可用时静默降级 */ }
  }, [])

  // 战略②：重新拉取家庭成员（家庭档案页写入后调用，保证商品页「为谁选购」同源）
  const refreshFamilyMembers = useCallback(() => {
    const ownerId = profile?.id
    if (!ownerId) return
    listFamilyMembers(ownerId)
      .then((rows) => setFamilyMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setFamilyMembers([]))
  }, [profile?.id])

  const toggleCrowd = useCallback((c: Crowd) => {
    setSelectedCrowds((prev) => {
      const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
      try { Taro.setStorageSync(CROWD_KEY, next) } catch { /* storage 不可用时静默降级 */ }
      return next
    })
  }, [])

  const setScene = useCallback((s: Scene | null) => {
    setSelectedScene(s)
    try {
      if (s) Taro.setStorageSync(SCENE_KEY, s)
      else Taro.removeStorageSync(SCENE_KEY)
    } catch { /* ignore */ }
  }, [])

  const clearFilters = useCallback(() => {
    setSelectedCrowds([])
    setSelectedScene(null)
    try {
      Taro.removeStorageSync(CROWD_KEY)
      Taro.removeStorageSync(SCENE_KEY)
    } catch { /* ignore */ }
  }, [])

  // 单品分档：内部用 classifier 纯函数，输入来自 toFoodTherapyInput（未迁移新列时自动兜底）
  const classifyProduct = useCallback(
    (p: Product): FitTier | null => classifyOne(toFoodTherapyInput(p), selectedCrowds, selectedScene),
    [selectedCrowds, selectedScene],
  )

  // 批量分组：把商品列表映射为 FoodTherapyInput 后交给 classifier
  const classifyProducts = useCallback(
    (list: Product[]): TierResult => classifyMany(list.map((p) => toFoodTherapyInput(p)), selectedCrowds, selectedScene),
    [selectedCrowds, selectedScene],
  )

  // 「适合我」三态：过敏原命中 → 忌口（最高优先级）；否则按人群/场景分档
  const getSuitability = useCallback(
    (p: Product): FitTier | null => {
      const pa = (p as any).allergens as string[] | undefined
      if (userAllergens.length && pa && pa.length) {
        const set = new Set(userAllergens)
        if (pa.some((a) => set.has(a))) return 'avoid'
      }
      return classifyOne(toFoodTherapyInput(p), selectedCrowds, selectedScene)
    },
    [userAllergens, selectedCrowds, selectedScene],
  )

  // 战略②：派生当前画像（activeProfile）。选成员 → 成员画像；否则本人画像。
  // 形状与 UserHealthProfile 兼容，可直接喂给 analyzeForProfile / profileToCrowds / describeCohort。
  const activeProfile = useMemo<UserHealthProfile | null>(() => {
    if (selectedMemberId === 'self') return userHealthProfile
    const m = familyMembers.find((x) => x.id === selectedMemberId)
    if (!m) return userHealthProfile // 兜底：成员不存在时回落本人
    return {
      user_id: m.id,
      age_group: m.age_group,
      gender: m.gender,
      constitution_type: m.constitution_type,
      allergies: m.allergies ?? [],
      chronic_conditions: m.chronic_conditions ?? [],
      body_states: m.body_states ?? [],
      health_goals: m.health_goals ?? [],
      privacy_flags: null,
      updated_at: m.updated_at,
    }
  }, [selectedMemberId, familyMembers, userHealthProfile])

  const value = useMemo<FoodTherapyCtx>(
    () => ({
      selectedCrowds, selectedScene, toggleCrowd, setScene, clearFilters, classifyProduct, classifyProducts,
      userAllergens, hasHealthProfile, getSuitability,       userHealthProfile,
      familyMembers, selectedMemberId, setSelectedMemberId, refreshFamilyMembers, activeProfile,
    }),
    [
      selectedCrowds, selectedScene, toggleCrowd, setScene, clearFilters, classifyProduct, classifyProducts,
      userAllergens, hasHealthProfile, getSuitability, userHealthProfile,
      familyMembers, selectedMemberId, setSelectedMemberId, refreshFamilyMembers, activeProfile,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFoodTherapy(): FoodTherapyCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFoodTherapy 必须在 FoodTherapyProvider 内使用')
  return ctx
}

// 仅类型再导出，方便页面侧按需引用
export type { Crowd, Scene, FitTier, FoodTherapyInput, TierResult }
