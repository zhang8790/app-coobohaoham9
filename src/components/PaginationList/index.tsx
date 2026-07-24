import Taro from '@tarojs/taro'
import { View, ScrollView, Text } from '@tarojs/components'
import { useRef, useEffect, useState } from 'react'
import './PaginationList.scss'

export interface PaginationListProps<T> {
  // 数据查询函数
  queryFn: (page: number, pageSize: number) => Promise<{ data: T[], hasMore: boolean }>
  // 渲染每一项的组件
  renderItem: (item: T, index: number) => any
  // 列表配置
  config?: {
    pageSize?: number
    emptyText?: string
    loadingText?: string
    noMoreText?: string
    // 启用下拉刷新
    enablePullDownRefresh?: boolean
    // 启用上拉加载
    enableReachBottom?: boolean
  }
  // 列表 className
  className?: string
  // 列表项 className
  itemClassName?: string
}

/**
 * 分页列表组件
 * 封装了下拉刷新、上拉加载、空状态、加载状态
 * 
 * 使用示例：
 * <PaginationList
 *   queryFn={async (page, pageSize) => {
 *     const data = await getProducts(undefined, page - 1, pageSize)
 *     return { data, hasMore: data.length >= pageSize }
 *   }}
 *   renderItem={(product) => <ProductCard product={product} />}
 *   config={{
 *     emptyText: '暂无商品',
 *     pageSize: 20,
 *   }}
 * />
 */
export default function PaginationList<T>(props: PaginationListProps<T>) {
  const {
    queryFn,
    renderItem,
    config = {},
    className = '',
    itemClassName = '',
  } = props

  const {
    pageSize = 20,
    emptyText = '暂无数据',
    loadingText = '加载中...',
    noMoreText = '没有更多了',
    enablePullDownRefresh = true,
    enableReachBottom = true,
  } = config

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
  const load = async (p: number, isRefresh = false) => {
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
      console.error('[PaginationList] 加载失败', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  // 下拉刷新
  const onRefresh = () => {
    setPage(1)
    load(1, true)
  }

  // 上拉加载
  const onReachBottom = () => {
    if (!loading && hasMore) {
      load(page + 1)
    }
  }

  // 立即加载
  useEffect(() => {
    onRefresh()
  }, [])

  return (
    <ScrollView
      className={`pagination-list ${className}`}
      scrollY
      refresherEnabled={enablePullDownRefresh}
      refresherTriggered={refreshing}
      onRefresherRefresh={onRefresh}
      onScrollToLower={enableReachBottom ? onReachBottom : undefined}
    >
      {/* 列表内容 */}
      <View className="pagination-list__content">
        {list.length > 0 ? (
          list.map((item, index) => (
            <View key={(item as any).id || index} className={`pagination-list__item ${itemClassName}`}>
              {renderItem(item, index)}
            </View>
          ))
        ) : (
          !loading && (
            <View className="pagination-list__empty">
              <Text className="pagination-list__empty-text">{emptyText}</Text>
            </View>
          )
        )}
      </View>

      {/* 加载状态 */}
      {loading && !refreshing && (
        <View className="pagination-list__loading">
          <Text className="pagination-list__loading-text">{loadingText}</Text>
        </View>
      )}

      {/* 没有更多 */}
      {!hasMore && list.length > 0 && (
        <View className="pagination-list__no-more">
          <Text className="pagination-list__no-more-text">{noMoreText}</Text>
        </View>
      )}
    </ScrollView>
  )
}
