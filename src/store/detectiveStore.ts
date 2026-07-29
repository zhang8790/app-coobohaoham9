/**
 * 食安侦探进度状态
 * 持久化到本地Storage：已破获案件 / 侦探积分 / 等级
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import Taro from '@tarojs/taro'
import { DETECTIVE_CASES, TOTAL_CASES, type CaseResult } from '@/utils/detective-cases'

interface DetectiveState {
  solved: Record<string, { score: number; passedAt: string; points: number }>
  totalPoints: number
  solveCase: (result: CaseResult, points: number) => void
  isSolved: (caseId: string) => boolean
  getSolvedCount: () => number
  getLevel: () => { level: number; title: string; nextAt: number | null; progress: number }
  getStats: () => { solved: number; total: number; points: number; percent: number }
}

// 侦探等级（按累计积分）
const LEVELS = [
  { min: 0, title: '实习侦探' },
  { min: 30, title: '初级侦探' },
  { min: 80, title: '中级侦探' },
  { min: 150, title: '高级侦探' },
  { min: 250, title: '王牌侦探' },
  { min: 400, title: '食安神探' },
]

export const useDetectiveStore = create<DetectiveState>()(
  persist(
    (set, get) => ({
      solved: {},
      totalPoints: 0,

      solveCase: (result, points) => {
        const { solved, totalPoints } = get()
        if (solved[result.caseId]) return // 已破获不再加分
        const entry = {
          score: result.score,
          passedAt: new Date().toISOString(),
          points,
        }
        set({
          solved: { ...solved, [result.caseId]: entry },
          totalPoints: totalPoints + points,
        })
      },

      isSolved: (caseId) => !!get().solved[caseId],

      getSolvedCount: () => Object.keys(get().solved).length,

      getLevel: () => {
        const pts = get().totalPoints
        let idx = 0
        for (let i = 0; i < LEVELS.length; i++) {
          if (pts >= LEVELS[i].min) idx = i
        }
        const cur = LEVELS[idx]
        const next = LEVELS[idx + 1] || null
        const prevMin = cur.min
        const range = next ? next.min - prevMin : 1
        const progress = next ? Math.min(100, Math.floor(((pts - prevMin) / range) * 100)) : 100
        return {
          level: idx + 1,
          title: cur.title,
          nextAt: next ? next.min : null,
          progress,
        }
      },

      getStats: () => {
        const solvedCount = Object.keys(get().solved).length
        return {
          solved: solvedCount,
          total: TOTAL_CASES,
          points: get().totalPoints,
          percent: Math.floor((solvedCount / TOTAL_CASES) * 100),
        }
      },
    }),
    {
      name: 'detective-storage',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => Taro.getStorageSync(key),
        setItem: (key: string, value: string) => Taro.setStorageSync(key, value),
        removeItem: (key: string) => Taro.removeStorageSync(key),
      })),
    },
  ),
)
