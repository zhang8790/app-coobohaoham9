import { useState, useEffect, useCallback, useRef } from 'react'
import Taro from '@tarojs/taro'

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

