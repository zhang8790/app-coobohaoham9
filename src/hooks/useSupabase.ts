import { useState, useEffect, useCallback, useRef } from 'react'
import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'

/**
 * 通用 Supabase 数据查询 Hook
 * 封装了 loading/error/data 状态管理
 * 
 * @param queryFn - 查询函数，接收 supabase 客户端，返回 Promise<data>
 * @param deps - 依赖数组，当依赖变化时会重新查询
 * @param options - 配置选项
 */
export function useSupabaseQuery<T>(
  queryFn: (supabase: typeof supabase) => Promise<T>,
  deps: any[] = [],
  options: {
    immediate?: boolean  // 是否立即查询，默认 true
    onError?: (error: any) => void
  } = {}
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(options.immediate !== false)
  const [error, setError] = useState<any>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await queryFn(supabase)
      if (mountedRef.current) {
        setData(result)
        setLoading(false)
      }
    } catch (err) {
      console.error('[useSupabaseQuery] 查询失败', err)
      if (mountedRef.current) {
        setError(err)
        setLoading(false)
        options.onError?.(err)
      }
    }
  }, deps)

  useEffect(() => {
    if (options.immediate !== false) {
      fetch()
    }
  }, [fetch])

  return {
    data,
    loading,
    error,
    refetch: fetch,
    setData,
  }
}

/**
 * 分页查询 Hook
 * 封装了分页逻辑（加载更多、下拉刷新、触底加载）
 * 
 * @param queryFn - 查询函数，接收 (page, pageSize) 参数
 * @param options - 配置选项
 */
export function usePagination<T>(
  queryFn: (page: number, pageSize: number) => Promise<{ data: T[], hasMore: boolean }>,
  options: {
    pageSize?: number
    immediate?: boolean
    onError?: (error: any) => void
  } = {}
) {
  const pageSize = options.pageSize || 20
  const [list, setList] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 加载数据
  const load = useCallback(async (p: number, isRefresh = false) => {
    if (loading && !isRefresh) return
    
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const result = await queryFn(p, pageSize)
      if (!mountedRef.current) return

      if (isRefresh) {
        setList(result.data)
      } else {
        setList(prev => [...prev, ...result.data])
      }
      
      setPage(p)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('[usePagination] 加载失败', err)
      options.onError?.(err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [pageSize, queryFn])

  // 下拉刷新
  const onRefresh = useCallback(() => {
    setPage(1)
    load(1, true)
  }, [load])

  // 加载更多（触底）
  const onLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      load(page + 1)
    }
  }, [loading, hasMore, page, load])

  // 立即加载
  useEffect(() => {
    if (options.immediate !== false) {
      onRefresh()
    }
  }, [])

  return {
    list,
    loading,
    refreshing,
    hasMore,
    onRefresh,
    onLoadMore,
    setList,
  }
}

/**
 * 图片懒加载 Hook
 * 使用 IntersectionObserver 实现图片懒加载
 * 
 * @param options - 配置选项
 */
export function useImageLazyLoad(options: {
  threshold?: number
  rootMargin?: string
} = {}) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement
            const src = img.dataset.src
            if (src) {
              img.src = src
              img.removeAttribute('data-src')
              setLoadedImages(prev => new Set([...prev, src]))
            }
            observerRef.current?.unobserve(entry.target)
          }
        })
      },
      {
        threshold: options.threshold || 0.1,
        rootMargin: options.rootMargin || '50px',
      }
    )

    return () => {
      observerRef.current?.disconnect()
    }
  }, [options.threshold, options.rootMargin])

  const observe = useCallback((element: HTMLImageElement) => {
    if (observerRef.current && element) {
      observerRef.current.observe(element)
    }
  }, [])

  return {
    observe,
    loadedImages,
  }
}

/**
 * 获取当前用户 Hook
 * 封装了获取当前登录用户的逻辑
 */
export function useCurrentUser() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function getUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (mounted) {
          setUser(user)
          setLoading(false)
        }
      } catch (err) {
        console.error('[useCurrentUser] 获取用户失败', err)
        if (mounted) {
          setLoading(false)
        }
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user || null)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  return {
    user,
    userId: user?.id || null,
    loading,
    isLoggedIn: !!user,
  }
}
