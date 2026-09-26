// @title 分类商品
import { useState, useEffect, useCallback } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { addToCart, getProducts } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import { refreshCartCount } from '@/utils/cartStore'
import Icon from '@/components/Icon'
import ProductGridCard from '@/components/ProductGridCard'
import { getProductCareInfo } from '@/utils/product-care'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import type { Product } from '@/db/types'

/**
 * 分类商品列表页：首页金刚区 / 探索页类目点选后的落地页。
 *
 * 取数口径与探索页完全一致（三分支：门店 → 城市 → 自营兜底），
 * 保证同一个类目在首页金刚区、探索页、本页看到的商品数量一致。
 * 传入 categoryId（store_categories.id）而非类目名，避免同名类目命中歧义。
 */
export default function CategoryListPage() {
  const router = useRouter()
  const categoryId = String(router.params.categoryId || '')
  const catName = String(router.params.name || '分类商品')

  const { currentCity } = useLocation()
  const { getSuitability } = useFoodTherapy()

  const [list, setList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState('')

  useEffect(() => {
    if (!categoryId) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const load = async () => {
      try {
        // 口径必须与首页 Feed / 金刚区一致：**城市聚合优先**，全平台兜底。
        // ⚠️ 历史 bug：原先优先用 currentStore（GPS 最近门店 = 官方自营店，37 款无类目老数据），
        // 导致从金刚区点进来必然 0 款（「点进去就空」）。自营店无类目货，不能作为优先口径。
        const data = currentCity?.id
          ? await getProducts({ categoryId, cityId: String(currentCity.id), limit: 200 })
          : await getProducts({ categoryId, platformFilter: 'only', limit: 200 })
        if (alive) setList(data)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [categoryId, currentCity?.id])

  const careOf = (p: Product) => {
    try { return getProductCareInfo(p) } catch { return null }
  }

  const handleAddCart = useCallback(async (productId: string, storeId?: string) => {
    if (addingId === productId) return
    setAddingId(productId)
    try {
      const ok = await addToCart(productId, storeId || '')
      if (ok) {
        showCartToast()
        refreshCartCount()
      }
    } finally {
      setAddingId('')
    }
  }, [addingId])

  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 pt-4 pb-2 flex items-end justify-between">
        <Text className="text-xl font-bold text-foreground">{catName}</Text>
        {!loading && <Text className="text-xs text-muted-foreground">{list.length} 款</Text>}
      </View>

      {loading ? (
        <View className="flex items-center justify-center py-24">
          <Text className="text-base text-muted-foreground">加载中…</Text>
        </View>
      ) : list.length === 0 ? (
        <View className="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="bag" size={48} className="text-muted-foreground/40" />
          <Text className="text-base text-foreground">暂无「{catName}」的在售商品</Text>
          <Text className="text-sm text-muted-foreground text-center px-8">
            {currentCity?.city_name
              ? `「${currentCity.city_name}」暂时没有这一类好物，切换城市看看`
              : '这批货还没铺到你所在的城市，切换城市看看'}
          </Text>
        </View>
      ) : (
        <View className="flex flex-wrap justify-between px-4">
          {list.map((p) => (
            <ProductGridCard
              key={p.id}
              id={p.id}
              name={p.name}
              price={p.price}
              spec={p.spec}
              imageUrl={p.main_image || p.image_url || ''}
              care={careOf(p)}
              suitability={getSuitability(p)}
              onTap={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
              onAddCart={(id) => handleAddCart(id, p.store_id)}
              adding={addingId === p.id} />
          ))}
        </View>
      )}
    </View>
  )
}
