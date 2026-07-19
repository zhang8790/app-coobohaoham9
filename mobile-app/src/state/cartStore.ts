// 购物车状态（Zustand + persist 到 AsyncStorage）
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Product } from '@/types/db'

export interface CartLine {
  product: Product
  quantity: number
}

interface CartState {
  lines: CartLine[]
  add: (product: Product, qty?: number) => void
  remove: (productId: string) => void
  setQty: (productId: string, qty: number) => void
  clear: () => void
  totalCount: () => number
  totalPrice: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (product, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.product.id === product.id)
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id ? { ...l, quantity: l.quantity + qty } : l,
              ),
            }
          }
          return { lines: [...state.lines, { product, quantity: qty }] }
        }),
      remove: (productId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.product.id !== productId) })),
      setQty: (productId, qty) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.product.id === productId ? { ...l, quantity: Math.max(1, qty) } : l,
          ),
        })),
      clear: () => set({ lines: [] }),
      totalCount: () => get().lines.reduce((s, l) => s + l.quantity, 0),
      totalPrice: () => get().lines.reduce((s, l) => s + l.product.price * l.quantity, 0),
    }),
    {
      name: 'laidianyouxi-cart',
      storage: {
        getItem: async (name) => {
          const v = await AsyncStorage.getItem(name)
          return v ? JSON.parse(v) : null
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name)
        },
      },
    },
  ),
)
