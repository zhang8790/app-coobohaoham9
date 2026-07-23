// 食材食疗智能导购 —— 全局状态（重构对齐版）
// 新模型：用户「勾选身体人群(多选) + 选择当前场景(单选)」，全站基于纯函数分类器
// classifyProducts 把商品分入三栏（五星推荐 / 谨慎食用 / 不建议点）。
// 设计原则：纯被动匹配，不依赖 LLM / NLU / 用户反馈权重；规则确定、可解释、零网络。

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
import type { Product } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'

const CROWD_KEY = 'ftSelectedCrowds'
const SCENE_KEY = 'ftSelectedScene'

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
}

const Ctx = createContext<FoodTherapyCtx | null>(null)

export function FoodTherapyProvider({ children }: { children: ReactNode }) {
  const [selectedCrowds, setSelectedCrowds] = useState<Crowd[]>(() => {
    try { return (Taro.getStorageSync(CROWD_KEY) || []) as Crowd[] } catch { return [] }
  })
  const [selectedScene, setSelectedScene] = useState<Scene | null>(() => {
    try { return (Taro.getStorageSync(SCENE_KEY) || null) as Scene | null } catch { return null }
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
      })
      .catch(() => seedFromTags(profile?.constitution_tags))
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

  const value = useMemo<FoodTherapyCtx>(
    () => ({ selectedCrowds, selectedScene, toggleCrowd, setScene, clearFilters, classifyProduct, classifyProducts }),
    [selectedCrowds, selectedScene, toggleCrowd, setScene, clearFilters, classifyProduct, classifyProducts],
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
