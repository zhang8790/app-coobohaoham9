// @title 品牌馆
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { getStores } from '@/db/api'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import Icon from '@/components/Icon'
import { UNIFIED_EMOTION_FILTERS } from '@/utils/category-emotion'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import { usePagination } from '@/hooks'
import LazyImage from '@/components/LazyImage'
import CustomTabBar from '@/components/custom-tabbar'
import type { Store } from '@/db/types'

// 品牌馆 = 合作商家入口（platformFilter='exclude'），使用「本地生活类目」体系。
// 门店类目对齐本地生活业态：餐饮 / 购物(→零售) / 娱乐 / 美容(→美业) / 家政(→生活服务) / 教育(→亲子)
// 语义声明与映射见 src/utils/category-emotion.ts（REWARD_SHOP_IS_LOCAL_LIFE / REWARD_SHOP_CATEGORY_TO_LOCAL_LIFE）。
const CATEGORIES = ['全部', '餐饮', '购物', '娱乐', '美容', '家政', '教育']

// 图片加载失败时的占位组件（柔和暖底 + emoji，替代生硬灰块）
function StoreImagePlaceholder({ name }: { name: string }) {
  return (
    <View className="flex items-center justify-center self-stretch"
      style={{
        width: '84px',
        flexShrink: 0,
        backgroundColor: '#F1E9D9',
        borderTopLeftRadius: '16px',
        borderBottomLeftRadius: '16px',
      }}>
      <View className="flex flex-col items-center gap-1">
        <Text style={{ fontSize: '26px' }}>🏪</Text>
        <Text className="text-xs text-muted-foreground">{name.slice(0, 4)}</Text>
      </View>
    </View>
  )
}

export default function RewardShopPage() {
  const [activeCat, setActiveCat] = useState('全部')
  const cartCount = useCartCount()
  const [failedImages, setFailedImages] = useState<string[]>([])  // ✅ 改成数组

  // 使用 usePagination Hook 管理分页
  const { list: stores, loading, refreshing, hasMore, onRefresh, onLoadMore } = usePagination<Store>(
    async (page, pageSize) => {
      // ⭐ 品牌馆 Tab：展示合作门店（品牌馆为合作门店品牌）列表，排除平台自营门店
      const data = await getStores(activeCat === '全部' ? undefined : activeCat, page - 1, pageSize, 'exclude')
      return { data, hasMore: data.length >= pageSize }
    },
    {
      pageSize: 20,
      immediate: false,  // 手动控制首次加载
    }
  )

  const refreshCart = useCallback(async () => { await refreshCartCount() }, [])

  // 切换分类时刷新
  const handleCategoryChange = useCallback((cat: string) => {
    setActiveCat(cat)
    onRefresh()
  }, [onRefresh])

  useEffect(() => { refreshCart() }, [refreshCart])
  useDidShow(() => { refreshCart() })

  // 初始加载
  useEffect(() => {
    onRefresh()
  }, [])
  // 分享配置：携带推广码
  useShareWithReferral({
    title: '来电有喜 · 品牌馆，品质门店推荐',
    path: '/pages/reward-shop/index',
    timelineTitle: '来电有喜 · 发现身边好店',
  })

  const getStoreImage = (store: Store): string | null => {
    // 优先 banner_url（用户最新上传），其次 image_url 兜底
    const url = store.banner_url || store.image_url || ''
    // 排除无效值
    if (!url || url === 'null' || url === 'undefined') return null
    if (url.startsWith('wxfile://') || url.startsWith('http://tmp') || url.startsWith('tmp://') || url.startsWith('data:')) return null
    // 只接受 http(s) 开头的公网 URL
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return null
  }

  return (
    <View className="h-screen flex flex-col bg-background tabbar-pad">
      {/* 顶部搜索栏 */}
      <View className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <View className="text-muted-foreground"><Icon name="search" size={20} /></View>
          <Text className="text-xl text-muted-foreground">搜索门店...</Text>
        </View>
        <View className="relative" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          <View className="text-foreground"><Icon name="bag" size={24} /></View>
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white text-xs">{cartCount > 99 ? '99' : cartCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 情绪筛选层（与探索共用统一情绪维度，点击跳搜索页情绪配对） */}
      <View className="flex gap-2 flex-wrap px-3 py-2 bg-background" style={{ borderBottom: '1px solid #E7DDD0' }}>
        {UNIFIED_EMOTION_FILTERS.map((f) => (
          <View
            key={f.tag}
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: `/pages/search/index?mood=${encodeURIComponent(f.tag)}` })}
            style={{ padding: '6px 14px', borderRadius: '20px', background: '#F1E9D9', border: '1.5px solid #E7DDD0' }}>
            <Text style={{ fontSize: '14px' }}>{f.icon} {f.tag}</Text>
          </View>
        ))}
      </View>

      <View className="flex flex-1 overflow-hidden">
        {/* 左侧分类 */}
        <ScrollView scrollY className="w-24 flex flex-col bg-muted">
          {CATEGORIES.map(cat => (
            <View key={cat}
              className={`py-4 flex items-center justify-center text-xl font-bold transition ${activeCat === cat ? 'bg-background text-primary border-l-4 border-primary' : 'text-foreground'}`}
            onClick={() => handleCategoryChange(cat)}>
              <Text>{cat}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 右侧商家列表 */}
        <ScrollView scrollY className="flex-1 px-3 py-3">
          {loading && stores.length === 0 ? (
            <View className="flex items-center justify-center pt-20">
              <Icon name="loading" size={30} className="text-primary animate-spin" />
            </View>
          ) : (
            stores.map(store => {
              const img = getStoreImage(store)
              return (
              <View key={store.id} className="bg-card rounded-2xl overflow-hidden border border-border mb-2.5 flex gap-0"
                onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${store.id}` })}>
                {failedImages.includes(store.id) || !img ? (
                  <StoreImagePlaceholder name={store.name} />
                ) : (
                  <LazyImage
                    src={img}
                    width={84}
                    height={84}
                    mode="aspectFill"
                    className="flex-shrink-0 self-stretch" />
                )}
                <View className="flex-1 p-2.5 flex flex-col justify-between">
                  <View>
                    <Text className="text-xl font-bold text-foreground">{store.name}</Text>
                    {store.category && (
                      <View className="inline-flex mt-1 px-2 py-0.5 rounded-full text-base bg-primary/10 text-primary">
                        <Text className="text-base bg-primary/10 text-primary">{store.category}</Text>
                      </View>
                    )}
                    {store.description && (
                      <Text className="text-base text-muted-foreground mt-1 line-clamp-2">{store.description}</Text>
                    )}
                  </View>
                  <View className="flex items-center gap-2 mt-1.5">
                    <Icon name="star" size={16} className="text-yellow-500" />
                    <Text className="text-xl text-foreground font-bold">{store.rating}</Text>
                  </View>
                </View>
                <View className="flex items-center pr-3">
                  <Icon name="chevron-right" size={20} className="text-muted-foreground" />
                </View>
              </View>
              )
            })
          )}
          {hasMore && stores.length > 0 && (
            <View className="flex justify-center pt-2 pb-2">
              <View 
                className="px-6 py-2 rounded-full bg-muted text-xl text-muted-foreground"
                onClick={onLoadMore}
              >
                <Text>{loading ? '加载中...' : '加载更多'}</Text>
              </View>
            </View>
          )}
        </ScrollView>
        <CustomTabBar />
      </View>
    </View>
  )
}
