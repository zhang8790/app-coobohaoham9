// @title 订单中心
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getOrders } from '@/db/api'
import type { Order, OrderStatus } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

const TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending_pay', label: '待付款' },
  { key: 'pending_ship', label: '待发货' },
  { key: 'pending_receive', label: '待收货' },
  { key: 'pending_review', label: '待评价' },
  { key: 'after_sale', label: '售后' },
]

const STATUS_TEXT: Record<string, string> = {
  pending_pay: '待付款', pending_ship: '待发货', pending_receive: '待收货',
  pending_review: '待评价', completed: '已完成', after_sale: '售后', cancelled: '已取消'
}
const STATUS_COLOR: Record<string, string> = {
  pending_pay: '#C2410C', pending_ship: '#B45309', pending_receive: '#1976D2',
  pending_review: '#7B1FA2', completed: '#4CAF50', after_sale: '#DC2626', cancelled: '#9A8070'
}

function OrderCenterPage() {
  const tabParam = useMemo(() => (Taro.getCurrentInstance().router?.params as any)?.tab || 'all', [])
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Tab栏 */}
      <div className="flex bg-card border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <div key={tab.key}
            className={`flex-shrink-0 py-3 px-4 text-xl font-bold border-b-2 transition ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </div>
        ))}
      </div>

      {/* 订单列表 */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <div className="i-mdi-loading text-4xl text-primary animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 gap-4">
            <div className="i-mdi-clipboard-list-outline text-8xl text-muted-foreground" />
            <p className="text-2xl text-muted-foreground">暂无订单</p>
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="bg-card rounded-2xl border border-border mb-4 overflow-hidden">
              {/* 订单头 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-base text-muted-foreground">订单号：{order.order_no}</span>
                <span className="text-xl font-bold" style={{ color: STATUS_COLOR[order.status] || '#9A8070' }}>
                  {STATUS_TEXT[order.status] || order.status}
                </span>
              </div>
              {/* 商品列表 */}
              {order.order_items?.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  {item.product_image && (
                    <Image src={item.product_image} mode="aspectFill" style={{ width: '60px', height: '60px', borderRadius: '8px', flexShrink: 0 }} />
                  )}
                  <div className="flex-1">
                    <p className="text-xl text-foreground font-bold line-clamp-1">{item.product_name}</p>
                    <p className="text-base text-muted-foreground mt-1">{item.store_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xl font-bold text-primary">¥{item.price}</span>
                      <span className="text-base text-muted-foreground">×{item.quantity}</span>
                    </div>
                  </div>
                </div>
              ))}
              {/* 底部金额+操作 */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xl text-muted-foreground">
                  共{order.order_items?.reduce((s, i) => s + i.quantity, 0) || 0}件
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xl text-muted-foreground">合计：</span>
                  <span className="text-xl font-bold text-primary">¥{Number(order.total_amount).toFixed(2)}</span>
                </div>
              </div>
              {/* 操作按钮 */}
              <div className="flex justify-end gap-2 px-4 pb-3">
                {order.status === 'pending_pay' && (
                  <button type="button"
                    className="flex items-center justify-center leading-none rounded-xl bg-primary"
                    onClick={() => Taro.navigateTo({ url: `/pages/payment/index?total=${order.total_amount}` })}>
                    <div className="py-2 px-4 text-xl text-white font-bold">去付款</div>
                  </button>
                )}
                {(order.status === 'pending_ship' || order.status === 'pending_receive') && (
                  <button type="button"
                    className="flex items-center justify-center leading-none rounded-xl border-2 border-red-400 bg-card"
                    onClick={() => Taro.navigateTo({ url: `/pages/refund-apply/index?orderId=${encodeURIComponent(order.id)}` })}>
                    <div className="py-2 px-4 text-xl text-red-500 font-bold">申请退款</div>
                  </button>
                )}
                {order.status === 'pending_receive' && (
                  <button type="button"
                    className="flex items-center justify-center leading-none rounded-xl border-2 border-primary bg-card"
                    onClick={() => Taro.showToast({ title: '已确认收货', icon: 'success' })}>
                    <div className="py-2 px-4 text-xl text-primary font-bold">确认收货</div>
                  </button>
                )}
                {order.status === 'pending_review' && (
                  <button type="button"
                    className="flex items-center justify-center leading-none rounded-xl border-2 border-primary bg-card"
                    onClick={() => Taro.navigateTo({ url: `/pages/review/index?orderId=${encodeURIComponent(order.id)}` })}>
                    <div className="py-2 px-4 text-xl text-primary font-bold">去评价</div>
                  </button>
                )}
                {order.status === 'after_sale' && (
                  <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-muted">
                    <div className="i-mdi-check-circle text-xl text-green-500" />
                    <span className="text-xl text-muted-foreground">退款处理中</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(OrderCenterPage)
