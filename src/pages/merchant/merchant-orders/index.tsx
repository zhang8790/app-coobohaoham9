// @title 订单管理（商家端）
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getMerchantStore, getMerchantOrders, getMerchantOrderSummary, merchantShipOrder, merchantCompleteOrder, callPrintReceipt } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待支付', pending_ship: '待发货', pending_receive: '待收货',
  pending_pickup: '待自提', pending_review: '待评价', completed: '已完成',
  after_sale: '售后', cancelled: '已取消',
}
const STATUS_COLOR: Record<string, string> = {
  pending_pay: 'text-orange-500', pending_ship: 'text-primary', pending_receive: 'text-blue-500',
  pending_pickup: 'text-blue-500', completed: 'text-green-600', cancelled: 'text-muted-foreground',
  after_sale: 'text-red-500', pending_review: 'text-primary',
}

function MerchantOrdersPage() {
  const [store, setStore] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])   // 原始 order_items 行（全量，用于按订单聚合）
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'pending_ship' | 'delivery' | 'completed'>('all')
  const [summary, setSummary] = useState<any>(null)

  // 列表(getMerchantOrders 全量 order_items) + 汇总(getMerchantOrderSummary RPC, 真实全量)
  // 说明：getMerchantOrders 以 order_items 粒度返回，这里一次性拉全量(limit=1000)，
  // 再按 orders.id 聚合成「每订单一行」+ 内嵌商品明细，彻底消除原先 limit=20
  // 只显前20商品行 + 同一订单多商品被拆成多张卡片的失真。中小商户订单量远低于此上限。
  const loadAll = async (s: any) => {
    if (!s) return
    const [ords, sum] = await Promise.all([
      getMerchantOrders(s.id, 0, 1000),
      getMerchantOrderSummary(s.id),
    ])
    setOrders(ords)
    setSummary(sum)
  }

  useEffect(() => {
    getMerchantStore().then(async (s) => {
      setStore(s)
      await loadAll(s)
      setLoading(false)
    })
  }, [])

  // 把 order_items 行还原成「一订单一行」+ 内嵌商品明细
  const orderGroups = useMemo(() => {
    const map = new Map<string, any>()
    for (const it of orders) {
      const o = it.orders
      if (!o || !o.id) continue
      if (!map.has(o.id)) {
        map.set(o.id, {
          id: o.id,
          order_no: o.order_no,
          status: o.status,
          total_amount: o.total_amount,
          created_at: o.created_at,
          payment_method: o.payment_method,
          service_type: o.service_type,
          shipping_address: o.shipping_address,
          remark: o.remark,
          merchant_settlements: Array.isArray(o.merchant_settlements)
            ? o.merchant_settlements
            : (o.merchant_settlements ? [o.merchant_settlements] : []),
          items: [] as any[],
        })
      }
      map.get(o.id).items.push({
        product_name: it.product_name,
        product_image: it.product_image,
        quantity: it.quantity,
        price: it.price,
      })
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }, [orders])

  const filtered = tab === 'all' ? orderGroups
    : tab === 'pending_ship' ? orderGroups.filter((g: any) => g.status === 'pending_ship')
    : tab === 'delivery' ? orderGroups.filter((g: any) => g.service_type === 'delivery')
    : orderGroups.filter((g: any) => g.status === 'completed')

  const handleShip = async (order: any) => {
    Taro.showModal({
      title: '发货', content: '确认将该订单发货？（配送）',
      success: async (res) => {
        if (!res.confirm) return
        Taro.showLoading({ title: '发货中' })
        const ok = await merchantShipOrder(order.id)
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
        const ok = await merchantCompleteOrder(order.id)
        Taro.hideLoading()
        if (ok) {
          Taro.showToast({ title: '已完成，货款已结算', icon: 'success' }); load()
          // 订单完成后自动推送小票（延时避免覆盖结算提示）
          setTimeout(() => {
            callPrintReceipt({ orderId: order.id }).then((r) => {
              if (r.success) Taro.showToast({ title: '小票已打印', icon: 'none' })
              else if (!r.need_config) Taro.showToast({ title: '小票打印失败', icon: 'none' })
            }).catch(() => {})
          }, 1200)
        } else Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    })
  }
  const handlePrint = async (order: any) => {
    Taro.showLoading({ title: '打印中' })
    try {
      const r = await callPrintReceipt({ orderId: order.id, test: false })
      Taro.hideLoading()
      if (r.success) Taro.showToast({ title: '小票已推送', icon: 'success' })
      else if (r.need_config) Taro.showToast({ title: '未配置打印机', icon: 'none' })
      else Taro.showToast({ title: '打印失败：' + (r.error || '未知错误'), icon: 'none' })
    } catch (e: any) {
      Taro.hideLoading()
      Taro.showToast({ title: '打印异常：' + (e?.message ? String(e.message) : String(e)), icon: 'none' })
    }
  }
  const load = () => {
    getMerchantStore().then(async (s) => {
      setStore(s)
      await loadAll(s)
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      <View className="flex mx-4 mt-3 bg-muted rounded-2xl p-1">
        {(['all', 'pending_ship', 'delivery', 'completed'] as const).map(key => (
          <View key={key} className={`flex-1 flex items-center justify-center py-2 rounded-xl text-sm font-bold ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {{ all: '全部', pending_ship: '待发货', delivery: '配送单', completed: '已完成' }[key]}
          </View>
        ))}
      </View>

      {/* 订单汇总（让利后价格统计，真实全量） */}
      {!loading && summary && (
        <View className="mx-4 mt-3 rounded-2xl bg-card border border-border p-3">
          <Text className="text-sm font-bold text-foreground block mb-2">订单汇总（让利后）</Text>
          <View className="flex flex-wrap">
            <View className="w-1/2 flex flex-col mb-2">
              <Text className="text-xs text-muted-foreground">订单数</Text>
              <Text className="text-base font-bold text-foreground">{summary.totalOrders}</Text>
            </View>
            <View className="w-1/2 flex flex-col mb-2">
              <Text className="text-xs text-muted-foreground">销售总额</Text>
              <Text className="text-base font-bold text-foreground">¥{summary.totalSales.toFixed(2)}</Text>
            </View>
            <View className="w-1/2 flex flex-col">
              <Text className="text-xs text-muted-foreground">让利总额</Text>
              <Text className="text-base font-bold text-orange-500">¥{summary.totalDiscount.toFixed(2)}</Text>
            </View>
            <View className="w-1/2 flex flex-col">
              <Text className="text-xs text-muted-foreground">实收总额（让利后）</Text>
              <Text className="text-base font-bold text-emerald-600">¥{summary.totalSettle.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      )}

      {loading ? (
        <View className="flex items-center justify-center py-16"><Icon name="loading" size={36} className="text-primary animate-spin" /></View>
      ) : filtered.length === 0 ? (
        <View className="flex flex-col items-center py-16 gap-3">
          <Icon name="receipt-text-outline" size={60} className="text-muted-foreground/40" />
          <Text className="text-base text-muted-foreground">暂无订单</Text>
        </View>
      ) : (
        <View className="px-4 mt-3">
          {filtered.map((g) => (
            <View key={g.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
              <View className="flex items-center justify-between mb-2">
                <View className="flex items-center gap-2">
                  <Text className="text-sm text-muted-foreground">订单号：{g.order_no || '-'}</Text>
                  {g.service_type === 'delivery' && (
                    <Text className="text-xs font-bold text-white bg-blue-500 rounded px-1.5 py-0.5">配送</Text>
                  )}
                  {g.service_type === 'self_pickup' && (
                    <Text className="text-xs font-bold text-white bg-amber-500 rounded px-1.5 py-0.5">自提</Text>
                  )}
                  {g.service_type === 'dine_in' && (
                    <Text className="text-xs font-bold text-white bg-gray-400 rounded px-1.5 py-0.5">堂食</Text>
                  )}
                </View>
                <Text className={`text-sm font-bold ${STATUS_COLOR[g.status] || 'text-foreground'}`}>
                  {STATUS_LABEL[g.status] || g.status || '-'}
                </Text>
              </View>
              {g.service_type === 'delivery' && g.shipping_address && (
                <View className="mb-2 rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5">
                  <Text className="text-xs text-blue-600 font-bold">收货地址</Text>
                  <Text className="text-xs text-foreground mt-0.5 leading-snug">{g.shipping_address}</Text>
                </View>
              )}
              {/* 商品明细（同一订单可能含多个商品，合并展示） */}
              <View className="flex flex-col gap-3">
                {g.items.map((it: any, idx: number) => (
                  <View key={idx} className="flex items-center gap-3">
                    {it.product_image && (
                      <Image src={it.product_image} mode="aspectFill" style={{ width: '56px', height: '56px', borderRadius: '8px', flexShrink: 0 }} />
                    )}
                    <View className="flex-1">
                      <Text className="text-base text-foreground font-bold line-clamp-1">{it.product_name}</Text>
                      <View className="flex items-center justify-between mt-1">
                        <Text className="text-sm text-muted-foreground">x{it.quantity}</Text>
                        <Text className="text-base font-bold text-primary">¥{it.price}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              <View className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                <Text className="text-xs text-muted-foreground">
                  {g.created_at ? new Date(g.created_at).toLocaleDateString('zh-CN') : ''}
                </Text>
                <View className="flex items-center gap-2">
                  {g.status === 'pending_ship' && (
                    <View className="flex items-center justify-center leading-none rounded-xl bg-primary"
                      onClick={() => handleShip(g)}>
                      <View className="py-1.5 px-3 text-sm text-white font-bold">发货</View>
                    </View>
                  )}
                  {(g.status === 'pending_receive' || g.status === 'pending_pickup' || g.status === 'pending_review') && (
                    <View className="flex items-center justify-center leading-none rounded-xl bg-green-600"
                      onClick={() => handleComplete(g)}>
                      <View className="py-1.5 px-3 text-sm text-white font-bold">确认完成</View>
                    </View>
                  )}
                  <View className="flex items-center justify-center leading-none rounded-xl border border-border"
                    onClick={() => handlePrint(g)}>
                    <View className="py-1.5 px-3 text-sm text-foreground font-bold">打印小票</View>
                  </View>
                  <View className="flex flex-col items-end">
                    <Text className="text-xs text-muted-foreground">合计 ¥{g.total_amount?.toFixed(2) || '-'}</Text>
                    {(() => {
                      const ms = g.merchant_settlements?.[0]
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
