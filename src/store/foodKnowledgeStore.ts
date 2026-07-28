/**
 * 食安知识图谱收集状态
 * 持久化到本地Storage，用户扫描到新成分时自动激活
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import Taro from '@tarojs/taro'
import { KNOWLEDGE_FRAGMENTS } from '@/utils/knowledge-fragments'

export interface KnowledgeFragment {
  additiveKey: string
  name: string
  category: string
  riskLevel: 'white' | 'yellow' | 'black'
  title: string
  description: string
  funFact: string
  dangerTip?: string
  foundIn?: string[]
  safeLimit?: string
  discoveredAt?: string
  viewed: boolean
}

interface FoodKnowledgeState {
  collected: Record<string, KnowledgeFragment>
  newDiscovery: string | null
  totalFragments: number
  discoverFragment: (key: string) => void
  markViewed: (key: string) => void
  clearNewDiscovery: () => void
  getCollection: () => KnowledgeFragment[]
  getCollectionStats: () => {
    collected: number
    total: number
    percent: number
    categories: Record<string, { collected: number; total: number }>
  }
  isNewDiscovered: (key: string) => boolean
}

export const useFoodKnowledgeStore = create<FoodKnowledgeState>()(
  persist(
    (set, get) => ({
      collected: {},
      newDiscovery: null,
      totalFragments: Object.keys(KNOWLEDGE_FRAGMENTS).length,

      discoverFragment: (key: string) => {
        const { collected } = get()
        if (collected[key]) return
        const fragment = KNOWLEDGE_FRAGMENTS[key]
        if (!fragment) return

        const newFragment: KnowledgeFragment = {
          ...fragment,
          additiveKey: key,
          discoveredAt: new Date().toISOString(),
          viewed: false,
        }

        set((state) => ({
          collected: { ...state.collected, [key]: newFragment },
          newDiscovery: key,
        }))
      },

      markViewed: (key: string) => {
        set((state) => {
          const existing = state.collected[key]
          if (!existing) return state
          return {
            collected: { ...state.collected, [key]: { ...existing, viewed: true } },
          }
        })
      },

      clearNewDiscovery: () => set({ newDiscovery: null }),

      getCollection: () => {
        const { collected } = get()
        return Object.values(collected).sort((a, b) => {
          if (a.viewed !== b.viewed) return a.viewed ? 1 : -1
          return (b.discoveredAt || '').localeCompare(a.discoveredAt || '')
        })
      },

      getCollectionStats: () => {
        const { collected, totalFragments } = get()
        const list = Object.values(collected)
        const cats: Record<string, { collected: number; total: number }> = {}
        for (const f of list) {
          if (!cats[f.category]) cats[f.category] = { collected: 0, total: 0 }
          cats[f.category].collected++
        }
        return {
          collected: list.length,
          total: totalFragments,
          percent: totalFragments > 0 ? Math.round((list.length / totalFragments) * 100) : 0,
          categories: cats,
        }
      },

      isNewDiscovered: (key: string) => {
        return Taro.getStorageSync('__new_knowledge_fragment') === key
      },
    }),
    {
      name: 'food-knowledge-v1',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => Taro.getStorageSync(key),
        setItem: (key: string, value: string) => Taro.setStorageSync(key, value),
        removeItem: (key: string) => Taro.removeStorageSync(key),
      })),
    }
  )
)
