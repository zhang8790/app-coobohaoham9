// @title 门店上下文：一个账号可管理的多家门店 + 当前所选门店
// 用途：商家后台（/merchant/*）顶部「门店切换器」的数据源。
// 选型：纯前端上下文，不改表、不动 RLS（RLS 早已支持多店：fn_my_store_ids = owner ∪ 活跃 store_staff）。
// 持久化：选择存 sessionStorage，刷新后保持当前门店。
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/utils/withTimeout'
import { useAuth } from './AuthContext'

export interface ManagedStore {
  id: string
  name: string
  is_platform: boolean
}

interface StoreCtx {
  /** 该账号可管理的全部门店（owner ∪ 活跃 store_staff） */
  stores: ManagedStore[]
  /** 当前所选门店 id（null = 尚未加载 / 无门店） */
  selectedStoreId: string | null
  /** 当前所选门店对象 */
  selectedStore: ManagedStore | null
  /** 切换门店（同步写入 sessionStorage） */
  setSelectedStore: (id: string) => void
  /** 列表是否仍在加载 */
  loading: boolean
}

const EMPTY: StoreCtx = {
  stores: [], selectedStoreId: null, selectedStore: null,
  setSelectedStore: () => {}, loading: true,
}

const Ctx = createContext<StoreCtx>(EMPTY)

// ── 取该账号可管理的所有门店（owner ∪ 活跃 store_staff）──────────────────
// 依赖 stores 表的 public_read_stores 策略（is_active = true 即可被任意已登录用户 SELECT），
// 因此非 owner 的 staff 也能读到本店行，列表不会漏。
async function fetchMyStores(userId: string): Promise<ManagedStore[]> {
  return withTimeout(async () => {
    const { data: owned } = await supabase
      .from('stores').select('id').eq('owner_id', userId)
    const { data: staff } = await supabase
      .from('store_staff').select('store_id').eq('user_id', userId).eq('is_active', true)

    const ids = Array.from(new Set<string>([
      ...(owned ?? []).map((r: any) => r.id),
      ...(staff ?? []).map((r: any) => r.store_id).filter(Boolean),
    ]))
    if (!ids.length) return []

    const { data } = await supabase
      .from('stores').select('id, name, is_platform').in('id', ids)
    return (data ?? []).map((s: any) => ({
      id: s.id, name: s.name, is_platform: !!s.is_platform,
    }))
  }, 12_000, '门店列表加载')
}

function savedKey(uid: string) { return `mgmt_store_${uid}` }

export function StoreProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth()
  const [stores, setStores] = useState<ManagedStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!profile) { setStores([]); setSelectedStoreId(null); setLoading(false); return }
    let active = true
    ;(async () => {
      setLoading(true)
      let list: ManagedStore[] = []
      try {
        list = await fetchMyStores(profile.id)
      } catch (e) {
        // 超时/网络异常：不允许把 loading 永远挂住（否则切换器永久显示「门店加载中…」）
        console.warn('[StoreContext] 门店列表加载失败：', e)
      }
      if (!active) return
      setStores(list)
      const saved = sessionStorage.getItem(savedKey(profile.id))
      const initial = (saved && list.find(s => s.id === saved))
        ? saved
        : (list[0]?.id ?? null)
      setSelectedStoreId(initial)
      setLoading(false)
    })()
    return () => { active = false }
  }, [profile, authLoading])

  const setSelectedStore = useCallback((id: string) => {
    setSelectedStoreId(id)
    if (profile) sessionStorage.setItem(savedKey(profile.id), id)
  }, [profile])

  const selectedStore = stores.find(s => s.id === selectedStoreId) ?? null

  return (
    <Ctx.Provider value={{ stores, selectedStoreId, selectedStore, setSelectedStore, loading }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStore() { return useContext(Ctx) }
