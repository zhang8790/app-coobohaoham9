// @title 订单管理（商家端）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getMerchantStore, getMerchantOrders, merchantShipOrder, merchantCompleteOrder } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待支付', pending_ship: '待发货', pending_receive: '待收货',
  pending_review: '待评价', completed: '已完成',
  after_sale: '售后', cancelled: '已取消',
}
const STATUS_COLOR: Record<string, string> = {
  pending_pay: 'text-orange-500', pending_ship: 'text-primary', pending_receive: 'text-blue-500',
  completed: 'text-green-600', cancelled: 'text-muted-foreground',
  after_sale: 'text-red-500', pending_review: 'text-primary',
}

function MerchantOrdersPage() {
  const [store, setStore] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'pending_ship' | 'completed'>('all')

  useEffect(() => {
    getMerchantStore().then(async (s) => {
      setStore(s)
      if (s) {
        const ords = await getMerchantOrders(s.id)
        setOrders(ords)
      }
      setLoading(false)
    })
  }, [])

  const filtered = tab === 'all' ? orders
    : tab === 'pending_ship' ? orders.filter(o => o.orders?.status === 'pending_ship')
    : orders.filter(o => o.orders?.status === 'completed')

  const handleShip = async (order: any) => {
    Taro.showModal({
      title: '发货', content: '确认将该订单发货？（配送）',
      success: async (res) => {
        if (!res.confirm) return
        Taro.showLoading({ title: '发货中' })
        const ok = await merchantShipOrder(order.orders?.id)
        Taro.hideLoading()
        if (ok) { Taro.showToast({ title: '已发货', icon: 'success' }); load() }
        else Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    })
  }
  const handleComplete = async (order: any) => {
    Taro.showModal({
      title: '确认完成订单',
      content: '确认该订单已完成？完成后将自动结算货款到「可结算货款」。',
      success: async (res) => {
        if (!res.confirm) return
        Taro.showLoading({ title: '处理中' })
        const ok = await merchantCompleteOrder(order.orders?.id)
        Taro.hideLoading()
        if (ok) { Taro.showToast({ title: '已完成，货款已结算', icon: 'success' }); load() }
        else Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    })
  }
  const load = () => {
    getMerchantStore().then(async (s) => {
      setStore(s)
      if (s) setOrders(await getMerchantOrders(s.id))
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      <View className="flex mx-4 mt-3 bg-muted rounded-2xl p-1">
        {(['all', 'pending_ship', 'completed'] as const).map(key => (
          <View key={key} className={`flex-1 flex items-center justify-center py-2 rounded-xl text-sm font-bold ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {{ all: '全部', pending_ship: '待发货', completed: '已完成' }[key]}
          </View>
        ))}
      </View>

      {loading ? (
        <View className="flex items-center justify-center py-16"><View className="i-mdi-loading text-4xl text-primary animate-spin" /></View>
      ) : filtered.length === 0 ? (
        <View className="flex flex-col items-center py-16 gap-3">
          <View className="i-mdi-receipt-text-outline text-6xl text-muted-foreground/40" />
          <Text className="text-base text-muted-foreground">暂无订单</Text>
        </View>
      ) : (
        <View className="px-4 mt-3">
          {filtered.map((item, i) => (
            <View key={item.id ?? i} className="bg-card rounded-2xl border border-border mb-3 p-4">
              <View className="flex items-center justify-between mb-2">
                <Text className="text-sm text-muted-foreground">订单号：{item.orders?.order_no || '-'}</Text>
                <Text className={`text-sm font-bold ${STATUS_COLOR[item.orders?.status] || 'text-foreground'}`}>
                  {STATUS_LABEL[item.orders?.status] || item.orders?.status || '-'}
                </Text>
              </View>
              <View className="flex items-center gap-3">
                {item.product_image && (
                  <Image src={item.product_image} mode="aspectFill" style={{ width: '56px', height: '56px', borderRadius: '8px', flexShrink: 0 }} />
                )}
                <View className="flex-1">
                  <Text className="text-base text-foreground font-bold line-clamp-1">{item.product_name}</Text>
                  <View className="flex items-center justify-between mt-1">
                    <Text className="text-sm text-muted-foreground">x{item.quantity}</Text>
                    <Text className="text-base font-bold text-primary">¥{item.price}</Text>
                  </View>
                </View>
              </View>
              <View className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                <Text className="text-xs text-muted-foreground">
                  {item.orders?.created_at ? new Date(item.orders.created_at).toLocaleDateString('zh-CN') : ''}
                </Text>
                <View className="flex items-center gap-2">
                  {item.orders?.status === 'pending_ship' && (
                    <View className="flex items-center justify-center leading-none rounded-xl bg-primary"
                      onClick={() => handleShip(item)}>
                      <View className="py-1.5 px-3 text-sm text-white font-bold">发货</View>
                    </View>
                  )}
                  {(item.orders?.status === 'pending_receive' || item.orders?.status === 'pending_pickup' || item.orders?.status === 'pending_review') && (
                    <View className="flex items-center justify-center leading-none rounded-xl bg-green-600"
                      onClick={() => handleComplete(item)}>
                      <View className="py-1.5 px-3 text-sm text-white font-bold">确认完成</View>
                    </View>
                  )}
                  <View className="flex flex-col items-end">
                    <Text className="text-xs text-muted-foreground">合计 ¥{item.orders?.total_amount?.toFixed(2) || '-'}</Text>
                    {(() => {
                      const ms = Array.isArray(item.orders?.merchant_settlements)
                        ? (item.orders?.merchant_settlements[0] ?? null)
                        : (item.orders?.merchant_settlements ?? null)
                      if (!ms || ms.settle_amount == null) return null
                      return (
                        <Text className="text-sm font-bold text-emerald-600">
                          实收 ¥{Number(ms.settle_amount).toFixed(2)}
                          {ms.discount_pool > 0 ? `（让利 ¥${Number(ms.discount_pool).toFixed(2)}）` : ''}
                        </Text>
                      )
                    })()}
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantOrdersPage
