// @title 分类商品
import { useState, useEffect, useCallback, useMemo } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { addToCart, getProducts, getCategories } from '@/db/api'
import { showCartToast } from '@/utils/cartToast'
import { refreshCartCount } from '@/utils/cartStore'
import Icon from '@/components/Icon'
import ProductGridCard from '@/components/ProductGridCard'
import { getProductCareInfo } from '@/utils/product-care'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import type { Product, StoreCategory } from '@/db/types'

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
  // 类目名经 CategoryGrid 用 encodeURIComponent 写入 URL，此处显式解码（与 store-home/index 一致），否则中文类目会显示成 %E5%AE%9D 这类乱码
  const catName = String(decodeURIComponent(router.params.name || '分类商品'))

  const { currentCity } = useLocation()
  const { getSuitability } = useFoodTherapy()

  const [list, setList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState('')
  // 二级分类：当前一级场景下的子类（来自 store_categories.parent_id）；activeSub='' 表示「全部」
  const [subCats, setSubCats] = useState<StoreCategory[]>([])
  const [activeSub, setActiveSub] = useState('')

  useEffect(() => {
    if (!categoryId) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const load = async () => {
      try {
        // 先取一级场景的二级子类（共用 store_categories 真相源，与 admin-web 后台一致）；
        // 无子类时 subCats 为空，下方 Tab 自动隐藏，行为与升级前完全一致。
        const all = await getCategories({ isActive: true })
        if (!alive) return
        const subs = all
          .filter((c) => c.parent_id === categoryId)
          .sort((a, b) => a.sort_order - b.sort_order)
        setSubCats(subs)
        // 口径必须与首页 Feed / 金刚区一致：**城市聚合优先**，全平台兜底。
        // ⚠️ 历史 bug：原先优先用 currentStore（GPS 最近门店 = 官方自营店，37 款无类目老数据），
        // 导致从金刚区点进来必然 0 款（「点进去就空」）。自营店无类目货，不能作为优先口径。
        // 商品的一级归类仍是 category_id（场景），二级仅作筛选维度（sub_category_id）。
        // 这里拉「场景 + 其全部二级」的商品（IN）；二级 Tab 用 sub_category_id 客户端筛选。
        const ids = [categoryId, ...subs.map((s) => s.id)]
        const data = currentCity?.id
          ? await getProducts({ categoryIds: ids, cityId: String(currentCity.id), limit: 200 })
          : await getProducts({ categoryIds: ids, platformFilter: 'only', limit: 200 })
        if (alive) setList(data)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [categoryId, currentCity?.id])

  // 二级 Tab 仅做客户端筛选（不重新请求）：「全部」显示场景全部；选二级显示该子类
  const displayed = useMemo(
    () => (activeSub ? list.filter((p) => p.sub_category_id === activeSub) : list),
    [list, activeSub],
  )

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
        {!loading && <Text className="text-xs text-muted-foreground">{displayed.length} 款</Text>}
      </View>

      {/* 二级分类 Tab：该一级场景下有子类才显示（数据与 admin-web 后台同源）。
          「全部」= 一级 + 全部子类商品；点具体子类 = 只看该子类。无子类时整块隐藏。 */}
      {subCats.length > 0 && (
        <ScrollView scrollX className="whitespace-nowrap" style={{ width: '100%' }}>
          <View style={{ display: 'inline-flex', gap: '16rpx', padding: '0 32rpx 16rpx' }}>
            {[{ id: '', name: '全部' }, ...subCats].map((s) => {
              const on = activeSub === s.id
              return (
                <View
                  key={s.id || 'all'}
                  onClick={() => setActiveSub(s.id)}
                  style={{
                    flex: '0 0 auto',
                    padding: '10rpx 28rpx',
                    borderRadius: '999rpx',
                    fontSize: '26rpx',
                    lineHeight: 1.4,
                    background: on ? 'hsl(var(--primary))' : 'hsl(var(--primary-soft))',
                    color: on ? '#ffffff' : 'hsl(var(--primary-strong))',
                    borderWidth: 1,
                    borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.25)',
                  }}
                >
                  {s.name}
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}

      {loading ? (
        <View className="flex items-center justify-center py-24">
          <Text className="text-base text-muted-foreground">加载中…</Text>
        </View>
      ) : displayed.length === 0 ? (
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
          {displayed.map((p) => (
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
