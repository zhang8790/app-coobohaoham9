// @title 会员管理（商家端）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { getMerchantStore } from '@/db/api'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

// 会员 Mock 数据（与 admin-web 对齐）
const MOCK_MEMBERS = [
  { id: 'u1', nickname: '办公室张姐', phone: '138****8001', avatar_url: '', level: '内门弟子', total_spent: 2456, order_count: 23, join_date: '2025-09-12', cross_store_orders: 8, cross_store_amount: 689 },
  { id: 'u2', nickname: '程序员小李', phone: '139****2003', avatar_url: '', level: '外门弟子', total_spent: 890, order_count: 9, join_date: '2025-11-03', cross_store_orders: 3, cross_store_amount: 210 },
  { id: 'u3', nickname: '隔壁王阿姨', phone: '137****6005', avatar_url: '', level: '核心弟子', total_spent: 5620, order_count: 47, join_date: '2025-06-20', cross_store_orders: 15, cross_store_amount: 1234 },
  { id: 'u4', nickname: '快递小哥', phone: '136****9007', avatar_url: '', level: '江湖散修', total_spent: 128, order_count: 2, join_date: '2026-03-15', cross_store_orders: 0, cross_store_amount: 0 },
  { id: 'u5', nickname: '奶茶续命', phone: '135****3009', avatar_url: '', level: '内门弟子', total_spent: 1890, order_count: 18, join_date: '2025-10-08', cross_store_orders: 6, cross_store_amount: 456 },
]

// 订单记录（含跨店）
const MOCK_ORDERS: Record<string, any[]> = {
  u1: [
    { id: 'o1', order_no: 'LD202606300001', store_name: '本店', is_current: true, product_name: '伯牙绝弦·云茶', amount: 268, status: 'completed', date: '2026-06-30', profit: 0 },
    { id: 'o2', order_no: 'LD202606290012', store_name: '霸王茶姬（科技园店）', is_current: false, product_name: '', amount: 0, status: 'completed', date: '2026-06-29', profit: 5.4 },
    { id: 'o3', order_no: 'LD202606280008', store_name: '本店', is_current: true, product_name: '手工红糖姜茶', amount: 39.9, status: 'completed', date: '2026-06-28', profit: 0 },
    { id: 'o4', order_no: 'LD202606270015', store_name: '瑞幸咖啡（万达店）', is_current: false, product_name: '', amount: 0, status: 'completed', date: '2026-06-27', profit: 3.2 },
    { id: 'o5', order_no: 'LD202606260003', store_name: '本店', is_current: true, product_name: '傣族鲜花饼', amount: 68, status: 'completed', date: '2026-06-26', profit: 0 },
  ],
  u3: [
    { id: 'o9', order_no: 'LD202606300002', store_name: '本店', is_current: true, product_name: '古树普洱茶礼盒', amount: 398, status: 'completed', date: '2026-06-30', profit: 0 },
    { id: 'o10', order_no: 'LD202606290018', store_name: '霸王茶姬（旗舰店）', is_current: false, product_name: '', amount: 0, status: 'completed', date: '2026-06-29', profit: 8.0 },
    { id: 'o11', order_no: 'LD202606280022', store_name: '本店', is_current: true, product_name: '红糖姜茶 3盒装', amount: 99, status: 'shipped', date: '2026-06-28', profit: 0 },
    { id: 'o12', order_no: 'LD202606270030', store_name: '良品铺子（万达店）', is_current: false, product_name: '', amount: 0, status: 'completed', date: '2026-06-27', profit: 12.5 },
    { id: 'o13', order_no: 'LD202606260014', store_name: '瑞幸咖啡（科技园店）', is_current: false, product_name: '', amount: 0, status: 'completed', date: '2026-06-26', profit: 4.2 },
  ],
}

const STATUS_LABEL: Record<string, string> = { pending_pay: '待支付', pending_ship: '待发货', shipped: '配送中', completed: '已完成', cancelled: '已取消' }

function MerchantMembersPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [members] = useState(MOCK_MEMBERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'cross'>('all')

  useEffect(() => {
    getMerchantStore().then(setStore)
  }, [])

  const selected = members.find(m => m.id === selectedId) ?? null
  const orders = selectedId ? (MOCK_ORDERS[selectedId] || []) : []
  const filteredMembers = filter === 'cross'
    ? members.filter(m => m.cross_store_orders > 0)
    : members

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">
      {/* 顶部 */}
      <View className="flex items-center px-4 pt-4 pb-2">
        <View className="!w-10 !h-10 !flex !items-center !justify-center !rounded-full !bg-muted"
          onClick={() => Taro.navigateBack()}>
          <View className="i-mdi-arrow-left text-2xl text-foreground" />
        </View>
        <Text className="flex-1 text-center text-xl font-bold text-foreground pr-10">会员管理</Text>
      </View>

      {store && (
        <View className="mx-4 mt-2 p-3 rounded-2xl bg-card border border-border">
          <Text className="text-base text-muted-foreground">{store.name}</Text>
        </View>
      )}

      <View className="flex gap-3 px-4 mt-3">
        <View className="flex-1 border-2 border-input rounded-xl px-3 py-2 flex items-center bg-background">
          <View className="i-mdi-magnify text-lg text-muted-foreground mr-2" />
          <Input className="flex-1 text-base bg-transparent" placeholder="搜索昵称/手机号"
            value={search} onInput={e => setSearch((e.target as any)?.value ?? '')} />
        </View>
        <View className="flex items-center gap-1">
          <View className={`px-3 py-2 rounded-xl text-sm font-bold ${filter === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
            onClick={() => setFilter('all')}>全部</View>
          <View className={`px-3 py-2 rounded-xl text-sm font-bold ${filter === 'cross' ? 'bg-purple-500 text-white' : 'bg-muted text-muted-foreground'}`}
            onClick={() => setFilter('cross')}>跨店</View>
        </View>
      </View>

      {!selectedId && (
        <View className="px-4 mt-3">
          {filteredMembers.map(m => (
            <View key={m.id} className="bg-card rounded-2xl border border-border mb-3 p-4"
              onClick={() => setSelectedId(m.id)}>
              <View className="flex items-center gap-3">
                <View className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Text className="text-lg font-bold text-primary">{m.nickname[0]}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex items-center gap-2">
                    <Text className="text-base font-bold text-foreground">{m.nickname}</Text>
                    <View className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs">{m.level}</View>
                  </View>
                  <Text className="text-sm text-muted-foreground">{m.phone} · {m.order_count}单</Text>
                </View>
                <View className="text-right">
                  <Text className="text-base font-bold text-primary">¥{m.total_spent}</Text>
                  {m.cross_store_orders > 0 && (
                    <View className="flex items-center gap-1 mt-1 justify-end">
                      <View className="w-2 h-2 rounded-full bg-purple-500" />
                      <Text className="text-xs text-purple-500">跨店{m.cross_store_orders}单</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 会员详情 + 流水 */}
      {selected && (
        <View className="px-4 mt-3">
          <Button className="!p-0 !bg-transparent !border-none !mb-3" onClick={() => setSelectedId(null)}>
            <View className="flex items-center gap-1">
              <View className="i-mdi-arrow-left text-lg text-primary" />
              <Text className="text-base text-primary">返回列表</Text>
            </View>
          </Button>

          {/* 会员信息卡 */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-3">
            <View className="flex items-center gap-3 mb-3">
              <View className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Text className="text-2xl font-bold text-primary">{selected.nickname[0]}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">{selected.nickname}</Text>
                <Text className="text-base text-muted-foreground">{selected.phone} · {selected.level}</Text>
              </View>
            </View>
            <View className="flex gap-3">
              <View className="flex-1 bg-muted rounded-xl p-3 text-center">
                <Text className="text-xl font-bold text-foreground">{selected.total_spent}</Text>
                <Text className="text-xs text-muted-foreground">累计消费</Text>
              </View>
              <View className="flex-1 bg-muted rounded-xl p-3 text-center">
                <Text className="text-xl font-bold text-foreground">{selected.order_count}</Text>
                <Text className="text-xs text-muted-foreground">订单数</Text>
              </View>
              <View className="flex-1 bg-purple-50 rounded-xl p-3 text-center">
                <Text className="text-xl font-bold text-purple-600">{selected.cross_store_orders}</Text>
                <Text className="text-xs text-purple-500">跨店单</Text>
              </View>
            </View>
          </View>

          {/* 流水列表 */}
          <Text className="text-base font-bold text-foreground mb-2">消费流水</Text>
          {orders.length === 0 ? (
            <View className="flex items-center justify-center py-12">
              <Text className="text-base text-muted-foreground">暂无流水</Text>
            </View>
          ) : (
            orders.map(o => (
              <View key={o.id} className="bg-card rounded-2xl border border-border mb-2 p-3">
                <View className="flex items-center gap-2">
                  <View className={`w-2 h-2 rounded-full flex-shrink-0 ${o.is_current ? 'bg-green-500' : 'bg-purple-500'}`} />
                  <View className="flex-1">
                    {o.is_current ? (
                      <>
                        <Text className="text-base text-foreground font-bold">{o.product_name}</Text>
                        <Text className="text-sm text-muted-foreground ml-2">¥{o.amount}</Text>
                      </>
                    ) : (
                      <>
                        <Text className="text-base text-muted-foreground">订单分润</Text>
                        <View className="px-2 py-0.5 rounded bg-purple-100 ml-2"><Text className="text-xs text-purple-600">跨店</Text></View>
                      </>
                    )}
                    <Text className="text-xs text-muted-foreground mt-0.5 block">{o.order_no} · {o.store_name}</Text>
                  </View>
                  <View className="text-right flex-shrink-0">
                    {o.is_current ? (
                      <Text className="text-lg font-bold text-red-500">¥{o.amount}</Text>
                    ) : (
                      <Text className="text-lg font-bold text-purple-500">分润 ¥{o.profit}</Text>
                    )}
                    <Text className="text-xs text-muted-foreground block">{o.date}</Text>
                    {!o.is_current && <Text className="text-xs text-muted-foreground block">订单金额隐藏</Text>}
                  </View>
                  <View className={`px-2 py-1 rounded text-xs ${o.status === 'completed' ? 'bg-green-100 text-green-600' : o.status === 'shipped' ? 'bg-blue-100 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                    {STATUS_LABEL[o.status] || o.status}
                  </View>
                </View>
              </View>
            ))
          )}

          {selected.cross_store_orders > 0 && (
            <View className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
              <Text className="text-sm text-purple-600">
                🔒 跨店订单仅显示分润金额，商品详情及订单金额已隐藏，以保护其他店铺隐私。
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantMembersPage
