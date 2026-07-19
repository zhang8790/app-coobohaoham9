// @title 行囊
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getCartItems, updateCartQty, removeCartItem, updateCartSelected } from '@/db/api'
import { updateCartBadge } from '@/utils/cartBadge'
import { subscribeCartCount, bumpCartCount } from '@/utils/cartStore'
import { setPendingCheckout } from '@/utils/checkoutCache'
import { generateEmotionHeadline } from '@/utils/emotion-description'
import type { CartItem, Product } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'
import { checkCartConflicts, toFoodTherapyInput, type CartConflict } from '@/utils/food-therapy'

function CartPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [conflictModal, setConflictModal] = useState<CartConflict[] | null>(null)

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
  // 实时联动：购物车总件数变化（如其他端加购/删除）时立即重载行囊物品
  useEffect(() => subscribeCartCount(() => { loadCart() }), [loadCart])

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
      bumpCartCount(-current) // 移除当前件数，徽标实时 -current
      setItems(prev => { const next = prev.filter(i => i.id !== id); updateCartBadge(); return next })
    } else {
      await updateCartQty(id, newQty)
      bumpCartCount(delta) // 件数变化，徽标实时 ±delta
      setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i))
    }
  }

  const handleRemove = async (id: string) => {
    const target = items.find(i => i.id === id)
    const q = target?.quantity || 0
    Taro.showModal({ title: '确认删除', content: '确认从行囊中移除此商品？', success: async (res) => {
      if (res.confirm) {
        await removeCartItem(id)
        bumpCartCount(-q) // 删除整行，徽标实时 -件数
        setItems(prev => { const next = prev.filter(i => i.id !== id); updateCartBadge(); return next })
      }
    }})
  }

  // 结算前：食疗冲突校验（有冲突弹窗提示，否则直接结算）
  const proceedCheckout = (selectedItems: CartItem[]) => {
    const total = selectedItems.reduce((s, i) => s + (i.products?.price || 0) * i.quantity, 0)
    const ids = selectedItems.map(i => i.id).join(',')
    // 写入待结算缓存：覆盖冷启动/热重载停在支付页时 router.params 为空的情况
    setPendingCheckout({ cartIds: ids ? ids.split(',') : [], total })
    Taro.navigateTo({ url: `/pages/payment/index?cartIds=${encodeURIComponent(ids)}&total=${total.toFixed(2)}` })
  }

  const goCheckoutAll = () => {
    const selectedItems = items.filter(i => i.selected)
    if (selectedItems.length === 0) {
      Taro.showToast({ title: '请先勾选商品', icon: 'none' }); return
    }
    const valid = selectedItems.filter(i => i.products) as CartItem[]
    const conflicts = checkCartConflicts(valid.map(i => toFoodTherapyInput(i.products as Product)))
    if (conflicts.length > 0) {
      setConflictModal(conflicts)
      return
    }
    proceedCheckout(valid)
  }

  // 计算已选商品的总金额和数量
  const selectedItems = items.filter(i => i.selected)
  const selectedTotal = selectedItems.reduce((s, i) => s + (i.products?.price || 0) * i.quantity, 0)
  const selectedCount = selectedItems.reduce((s, i) => s + i.quantity, 0)

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
                        {/* v3.1 智能卖点标题：行囊里也露一次脸，强化转化前的心智锚点 */}
                        {(item.products?.mood_tags?.length ?? 0) > 0 && (
                          <Text className="text-xs text-muted-foreground mt-1" style={{ display: 'block' }}>
                            {generateEmotionHeadline(item.products as any, item.products?.mood_tags || [], item.products?.scene_tags || [])}
                          </Text>
                        )}
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

                  {/* 门店小计（仅展示，不提供结算按钮） */}
                  {selectedStoreItems.length > 0 && (
                    <View className="flex items-center px-4 py-2 bg-primary/5">
                      <Text className="text-base text-muted-foreground">
                        {group.storeName} 小计：<Text className="font-bold text-primary">¥{storeTotal.toFixed(2)}</Text>
                      </Text>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 底部统一结算栏 */}
      {items.length > 0 && (
        <View className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-card border-t-2 border-primary shadow-lg">
          <View className="flex-1">
            <Text className="text-xl text-foreground">
              已选 <Text className="font-bold text-primary">{selectedCount}</Text> 件
            </Text>
            <View className="flex items-center mt-1">
              <Text className="text-base text-muted-foreground">合计：</Text>
              <Text className="text-2xl font-bold text-primary">¥{selectedTotal.toFixed(2)}</Text>
            </View>
          </View>
          <View
            className={`flex items-center justify-center leading-none rounded-2xl ${selectedItems.length === 0 ? 'bg-primary/40' : 'bg-primary'}`}
            onClick={goCheckoutAll}>
            <View className="py-3 px-6 text-xl text-white font-bold">
              去结算
            </View>
          </View>
        </View>
      )}

      {/* 食疗冲突校验弹窗 */}
      {conflictModal && (
        <View className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <View className="w-10/12 max-h-4/5 bg-card rounded-3xl p-6 overflow-y-auto">
            <Text className="text-2xl font-bold text-foreground text-center block mb-1">🍲 搭配小贴士</Text>
            <Text className="text-base text-muted-foreground text-center block mb-4">结算前为你做了食疗冲突检测</Text>
            <View className="gap-3 mb-6">
              {conflictModal.map((c, idx) => (
                <View key={idx} className="p-3 rounded-2xl border"
                  style={{ background: c.level === 'danger' ? '#FEE2E2' : '#FEF3C7', borderColor: c.level === 'danger' ? '#FCA5A5' : '#FDE68A' }}>
                  <View className="flex items-center gap-2 mb-1">
                    <Text className="text-xl">{c.level === 'danger' ? '⚠️' : '🟡'}</Text>
                    <Text className="text-base font-bold" style={{ color: c.level === 'danger' ? '#B91C1C' : '#92400E' }}>
                      {c.type === 'warm_overlap' ? '温补叠加' : c.type === 'cold_hot_clash' ? '寒热对冲' : c.type === 'same_attr_overload' ? '同属性过量' : '相克慎搭'}
                    </Text>
                  </View>
                  <Text className="text-base text-muted-foreground" style={{ display: 'block', lineHeight: '1.5' }}>{c.message}</Text>
                </View>
              ))}
            </View>
            <View className="flex gap-3">
              <View className="flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-center text-xl font-bold" onClick={() => setConflictModal(null)}>去调整</View>
              <View className="flex-1 py-3 rounded-2xl bg-primary text-white text-center text-xl font-bold"
                onClick={() => { const sel = items.filter(i => i.selected && i.products) as CartItem[]; setConflictModal(null); proceedCheckout(sel) }}>仍要结算</View>
            </View>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default CartPage

