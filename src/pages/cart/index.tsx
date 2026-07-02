// @title 行囊
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getCartItems, updateCartQty, removeCartItem, updateCartSelected } from '@/db/api'
import { updateCartBadge } from '@/utils/cartBadge'
import type { CartItem } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'

function CartPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadCart = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const data = await getCartItems()
    setItems(data)
    setLoading(false)
    updateCartBadge()
  }, [user])

  useEffect(() => { loadCart() }, [loadCart])
  useDidShow(() => { loadCart() })

  // 按门店分组
  const grouped = items.reduce((acc: Record<string, { storeName: string; storeId: string; items: CartItem[] }>, item) => {
    const sid = item.store_id
    if (!acc[sid]) acc[sid] = { storeName: item.stores?.name || '未知门店', storeId: sid, items: [] }
    acc[sid].items.push(item)
    return acc
  }, {})

  const allSelected = items.length > 0 && items.every(i => i.selected)

  const toggleAll = async (val: boolean) => {
    await Promise.all(items.map(i => updateCartSelected(i.id, val)))
    setItems(prev => prev.map(i => ({ ...i, selected: val })))
  }

  const toggleStore = async (storeId: string, val: boolean) => {
    const storeItems = items.filter(i => i.store_id === storeId)
    await Promise.all(storeItems.map(i => updateCartSelected(i.id, val)))
    setItems(prev => prev.map(i => i.store_id === storeId ? { ...i, selected: val } : i))
  }

  const toggleItem = async (id: string, val: boolean) => {
    await updateCartSelected(id, val)
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: val } : i))
  }

  const changeQty = async (id: string, delta: number, current: number) => {
    const newQty = current + delta
    if (newQty <= 0) {
      await removeCartItem(id)
      setItems(prev => { const next = prev.filter(i => i.id !== id); updateCartBadge(); return next })
    } else {
      await updateCartQty(id, newQty)
      setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i))
    }
  }

  const handleRemove = async (id: string) => {
    Taro.showModal({ title: '确认删除', content: '确认从行囊中移除此商品？', success: async (res) => {
      if (res.confirm) {
        await removeCartItem(id)
        setItems(prev => { const next = prev.filter(i => i.id !== id); updateCartBadge(); return next })
      }
    }})
  }

  // 按门店结算：只结算该门店已选商品
  const goCheckoutStore = (storeId: string) => {
    const selectedStoreItems = items.filter(i => i.store_id === storeId && i.selected)
    if (selectedStoreItems.length === 0) {
      Taro.showToast({ title: '请先勾选商品', icon: 'none' }); return
    }
    const total = selectedStoreItems.reduce((s, i) => s + (i.products?.price || 0) * i.quantity, 0)
    const ids = selectedStoreItems.map(i => i.id).join(',')
    Taro.navigateTo({ url: `/pages/payment/index?cartIds=${encodeURIComponent(ids)}&total=${total.toFixed(2)}` })
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="h-screen flex flex-col bg-background">
      {/* 顶部全选栏 */}
      {items.length > 0 && (
        <View className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
          <View className="flex items-center gap-2" onClick={() => toggleAll(!allSelected)}>
            <View className={`w-5 h-5 rounded flex items-center justify-center border-2 ${allSelected ? 'bg-primary border-primary' : 'border-border'}`}>
              {allSelected && <View className="i-mdi-check text-white text-xs" />}
            </View>
            <Text className="text-xl text-foreground">全选</Text>
          </View>
          <Text className="text-xl text-muted-foreground ml-auto">
            共 <Text className="font-bold text-foreground">{items.reduce((s, i) => s + i.quantity, 0)}</Text> 件
          </Text>
        </View>
      )}

      {/* 内容区 */}
      <View className="flex-1 overflow-y-auto pb-4">
        {items.length === 0 ? (
          <View className="flex flex-col items-center justify-center pt-32 gap-4">
            <View className="i-mdi-bag-personal-outline text-8xl text-muted-foreground" />
            <Text className="text-2xl text-muted-foreground">行囊空空如也</Text>
            <View
              className="flex items-center justify-center leading-none rounded-2xl bg-primary"
              onClick={() => Taro.switchTab({ url: '/pages/reward-shop/index' })}>
              <View className="py-3 px-8 text-xl text-white font-bold">去犒赏铺转转</View>
            </View>
          </View>
        ) : (
          <View className="px-4 pt-4">
            {Object.entries(grouped).map(([storeId, group]) => {
              const allStoreSelected = group.items.every(i => i.selected)
              const selectedStoreItems = group.items.filter(i => i.selected)
              const storeTotal = selectedStoreItems.reduce((s, i) => s + (i.products?.price || 0) * i.quantity, 0)
              const storeTotalQty = group.items.reduce((s, i) => s + i.quantity, 0)
              return (
                <View key={storeId} className="bg-card rounded-2xl mb-4 border border-border overflow-hidden">
                  {/* 门店头 */}
                  <View className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b border-border">
                    <View className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${allStoreSelected ? 'bg-primary border-primary' : 'border-border'}`}
                      onClick={() => toggleStore(storeId, !allStoreSelected)}>
                      {allStoreSelected && <View className="i-mdi-check text-white text-xs" />}
                    </View>
                    <View className="i-mdi-store text-xl text-primary" />
                    <Text className="text-xl font-bold text-foreground flex-1">{group.storeName}</Text>
                    <Text className="text-base text-muted-foreground">{storeTotalQty}件</Text>
                  </View>

                  {/* 商品列表 */}
                  {group.items.map(item => (
                    <View key={item.id} className="flex items-center gap-3 px-4 py-4 border-b border-border last:border-0">
                      <View className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${item.selected ? 'bg-primary border-primary' : 'border-border'}`}
                        onClick={() => toggleItem(item.id, !item.selected)}>
                        {item.selected && <View className="i-mdi-check text-white text-xs" />}
                      </View>
                      <Image src={item.products?.image_url || ''} mode="aspectFill"
                        style={{ width: '72px', height: '72px', borderRadius: '8px', flexShrink: 0 }}
                        onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${item.product_id}` })} />
                      <View className="flex-1">
                        <Text className="text-xl text-foreground font-bold line-clamp-2">{item.products?.name}</Text>
                        <Text className="text-xl font-bold text-primary mt-1">¥{item.products?.price}</Text>
                        <View className="flex items-center justify-between mt-2">
                          <View className="flex items-center gap-3">
                            <View
                              className="w-8 h-8 rounded-full border-2 border-border bg-card flex items-center justify-center leading-none"
                              onClick={() => changeQty(item.id, -1, item.quantity)}>
                              <View className="i-mdi-minus text-xl text-foreground" />
                            </View>
                            <Text className="text-xl text-foreground font-bold w-6 text-center">{item.quantity}</Text>
                            <View
                              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center leading-none"
                              onClick={() => changeQty(item.id, 1, item.quantity)}>
                              <View className="i-mdi-plus text-white text-xl" />
                            </View>
                          </View>
                          <View
                            className="w-8 h-8 flex items-center justify-center"
                            onClick={() => handleRemove(item.id)}>
                            <View className="i-mdi-delete-outline text-2xl text-muted-foreground" />
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* 门店结算栏 */}
                  <View className="flex items-center px-4 py-3 bg-background border-t border-border gap-3">
                    <View className="flex-1">
                      {selectedStoreItems.length > 0 ? (
                        <Text className="text-xl text-foreground">
                          已选 <Text className="font-bold text-primary">{selectedStoreItems.length}</Text> 件 · 小计
                          <Text className="text-2xl font-bold text-primary ml-1">¥{storeTotal.toFixed(2)}</Text>
                        </Text>
                      ) : (
                        <Text className="text-xl text-muted-foreground">勾选商品后结算</Text>
                      )}
                    </View>
                    <View
                      className={`flex items-center justify-center leading-none rounded-2xl ${selectedStoreItems.length === 0 ? 'bg-primary/40' : 'bg-primary'}`}
                      onClick={() => goCheckoutStore(storeId)}>
                      <View className="py-3 px-5 text-xl text-white font-bold">
                        结算({selectedStoreItems.length})
                      </View>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default CartPage

