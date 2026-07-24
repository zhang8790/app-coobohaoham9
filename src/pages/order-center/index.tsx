// @title 订单中心
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getOrders, confirmReceipt, deleteOrder } from '@/db/api'
import type { Order, OrderStatus } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

const TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending_pay', label: '待付款' },
  { key: 'pending_ship', label: '待发货' },
  { key: 'pending_receive', label: '待收货' },
  { key: 'pending_review', label: '待评价' },
  { key: 'after_sale', label: '售后' },
]

const STATUS_TEXT: Record<string, string> = {
  pending_pay: '待付款', pending_ship: '待发货', pending_receive: '待收货', paid: '已支付',
  pending_pickup: '待核销', pending_review: '待评价', completed: '已完成', after_sale: '售后', cancelled: '已取消'
}
const STATUS_COLOR: Record<string, string> = {
  pending_pay: '#A8552E', pending_ship: '#A8552E', pending_receive: '#3B5B7A', paid: '#6B3A12',
  pending_pickup: '#9A8070', pending_review: '#8A4B1E', completed: '#2E7D5B', after_sale: '#DC2626', cancelled: '#9A8070'
}

function OrderCenterPage() {
  // 修复：用 useRouter() 取响应式 params，原 useMemo(..., []) 会冻结首屏参数快照，
  // 导致 ?tab=pending_pay 等深链在页面实例复用/冷启动时落到默认 tab。
  const router = useRouter()
  const tabParam = (router.params as any)?.tab || 'all'
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>(tabParam)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  const loadOrders = useCallback(async (tab: OrderStatus | 'all') => {
    setLoading(true)
    const data = await getOrders(tab === 'all' ? undefined : tab)
    setOrders(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadOrders(activeTab) }, [loadOrders, activeTab])
  useDidShow(() => { loadOrders(activeTab) })

  const handleConfirmReceipt = async (order: Order) => {
    Taro.showLoading({ title: '确认中' })
    const ok = await confirmReceipt(order.id)
    Taro.hideLoading()
    if (ok) {
      Taro.showToast({ title: '已确认收货', icon: 'success' })
      loadOrders(activeTab)
    }
    else Taro.showToast({ title: '操作失败，稍后重试', icon: 'none' })
  }

  const handleDeleteOrder = async (order: Order) => {
    Taro.showModal({
      title: '删除订单',
      content: '确定删除该未支付订单？删除后不可恢复。',
      success: async (res) => {
        if (!res.confirm) return
        Taro.showLoading({ title: '删除中' })
        const ok = await deleteOrder(order.id)
        Taro.hideLoading()
        if (ok) {
          Taro.showToast({ title: '已删除', icon: 'success' })
          loadOrders(activeTab)
        } else {
          Taro.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
        }
      }
    })
  }

  return (<RouteGuard>
    <View className="h-screen flex flex-col bg-background">
      {/* Tab栏 */}
      <View className="flex bg-card border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <View key={tab.key}
            className={`flex-shrink-0 py-3 px-4 text-base font-bold border-b-2 transition ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </View>
        ))}
      </View>

      {/* 订单列表 */}
      <View className="flex-1 overflow-y-auto px-4 pt-4">
        {loading ? (
          <View className="flex items-center justify-center pt-20">
            <Icon name="loading" size={36} className="text-primary animate-spin" />
          </View>
        ) : orders.length === 0 ? (
          <View className="flex flex-col items-center justify-center pt-24 gap-4">
            <Icon name="clipboard-list-outline" size={28} className="text-8xl text-muted-foreground" />
            <Text className="text-2xl text-muted-foreground">暂无订单</Text>
          </View>
        ) : (
          orders.map(order => (
            <View key={order.id} className="bg-card rounded-2xl border border-border mb-4 overflow-hidden">
              {/* 订单头 */}
              <View className="flex items-center justify-between px-4 py-3 border-b border-border">
                <Text className="text-base text-muted-foreground">订单号：{order.order_no}</Text>
                <Text className="text-base font-bold" style={{ color: STATUS_COLOR[order.status] || '#9A8070' }}>
                  {STATUS_TEXT[order.status] || order.status}
                </Text>
              </View>
              {/* 商品列表 */}
              {order.order_items?.map(item => (
                <View key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  {item.product_image && (
                    <Image src={item.product_image} mode="aspectFill" style={{ width: '60px', height: '60px', borderRadius: '8px', flexShrink: 0 }} />
                  )}
                  <View className="flex-1">
                    <Text className="text-base text-foreground font-bold line-clamp-1">{item.product_name}</Text>
                    <Text className="text-base text-muted-foreground mt-1">{item.store_name}</Text>
                    <View className="flex items-center justify-between mt-1">
                      <Text className="text-base font-bold text-primary">¥{item.price}</Text>
                      <Text className="text-base text-muted-foreground">×{item.quantity}</Text>
                    </View>
                  </View>
                </View>
              ))}
              {/* 底部金额+操作 */}
              <View className="flex items-center justify-between px-4 py-3">
                <Text className="text-base text-muted-foreground">
                  共{order.order_items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0}件
                </Text>
                <View className="flex items-center gap-2">
                  <Text className="text-base text-muted-foreground">合计：</Text>
                  <Text className="text-base font-bold text-primary">¥{Number(order.total_amount).toFixed(2)}</Text>
                </View>
              </View>
              {/* 操作按钮 */}
              <View className="flex justify-end gap-2 px-4 pb-3">
                {order.status === 'pending_pay' && (
                  <View
                    className="flex items-center justify-center leading-none rounded-xl bg-primary"
                    onClick={() => Taro.navigateTo({ url: `/pages/payment/index?total=${order.total_amount}` })}>
                    <View className="py-2 px-4 text-base text-white font-bold">去付款</View>
                  </View>
                )}
                {order.status === 'pending_pay' && (
                  <View
                    className="flex items-center justify-center leading-none rounded-xl border border-border bg-card"
                    onClick={() => handleDeleteOrder(order)}>
                    <View className="py-2 px-4 text-base text-muted-foreground">删除</View>
                  </View>
                )}
                {['pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed', 'paid'].includes(order.status) && (
                  <View
                    className="flex items-center justify-center leading-none rounded-xl bg-muted"
                    onClick={() => Taro.navigateTo({ url: `/pages/trade/refund-apply/index?orderId=${encodeURIComponent(order.id)}` })}>
                    <View className="py-2 px-4 text-base text-muted-foreground font-normal">申请退款</View>
                  </View>
                )}
                {(order.status === 'pending_ship' || order.status === 'pending_receive') && (
                  <View
                    className="flex items-center justify-center leading-none rounded-xl border-2 border-primary bg-card"
                    onClick={() => handleConfirmReceipt(order)}>
                    <View className="py-2 px-4 text-base text-primary font-bold">确认收货</View>
                  </View>
                )}
                {order.status === 'pending_review' && (
                  <View
                    className="flex items-center justify-center leading-none rounded-xl border-2 border-primary bg-card"
                    onClick={() => Taro.navigateTo({ url: `/pages/mine/review/index?orderId=${encodeURIComponent(order.id)}` })}>
                    <View className="py-2 px-4 text-base text-primary font-bold">去评价</View>
                  </View>
                )}
                {order.status === 'after_sale' && (
                  <View className="flex items-center gap-1 px-3 py-2 rounded-xl bg-muted">
                    <Icon name="check-circle" size={16} className="text-green-500" />
                    <Text className="text-base text-muted-foreground">退款处理中</Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>

    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default OrderCenterPage
