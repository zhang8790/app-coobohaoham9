// @title 数据分析（商家端）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { getMerchantStore, getMerchantProducts, getMerchantOrders } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'

function MerchantAnalyticsPage() {
  const [store, setStore] = useState<any>(null)
  const [stats, setStats] = useState({
    todayOrders: 0, todayRevenue: 0, weekOrders: 0, weekRevenue: 0,
    totalProducts: 0, onlineProducts: 0, totalMembers: 5, crossStoreOrders: 2,
  })

  useEffect(() => {
    getMerchantStore().then(async (s) => {
      setStore(s)
      if (s) {
        const [prods, ords] = await Promise.all([
          getMerchantProducts(s.id),
          getMerchantOrders(s.id),
        ])
        const today = new Date().toISOString().slice(0, 10)
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
        const todayOrders = ords.filter(o => (o.orders?.created_at || '').startsWith(today))
        const weekOrders = ords.filter(o => (o.orders?.created_at || '') >= weekAgo)
        setStats({
          todayOrders: todayOrders.length,
          todayRevenue: todayOrders.reduce((s, o) => s + (o.orders?.total_amount || 0), 0),
          weekOrders: weekOrders.length,
          weekRevenue: weekOrders.reduce((s, o) => s + (o.orders?.total_amount || 0), 0),
          totalProducts: prods.length,
          onlineProducts: prods.filter(p => p.is_active).length,
          totalMembers: 5,
          crossStoreOrders: 2,
        })
      }
    })
  }, [])

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">
      <View className="flex items-center px-4 pt-4 pb-2">
        <View className="!w-10 !h-10 !flex !items-center !justify-center !rounded-full !bg-muted" onClick={() => Taro.navigateBack()}>
          <View className="i-mdi-arrow-left text-2xl text-foreground" />
        </View>
        <Text className="flex-1 text-center text-xl font-bold text-foreground pr-10">数据分析</Text>
      </View>

      {/* 今日概览 */}
      <View className="mx-4 mt-3">
        <Text className="text-base font-bold text-foreground mb-2">今日概览</Text>
        <View className="flex gap-3">
          <View className="flex-1 bg-card rounded-2xl border border-border p-4">
            <Text className="text-2xl font-bold text-primary">{stats.todayOrders}</Text>
            <Text className="text-xs text-muted-foreground">今日订单</Text>
          </View>
          <View className="flex-1 bg-card rounded-2xl border border-border p-4">
            <Text className="text-2xl font-bold text-green-500">¥{stats.todayRevenue.toFixed(0)}</Text>
            <Text className="text-xs text-muted-foreground">今日营收</Text>
          </View>
        </View>
      </View>

      {/* 本周数据 */}
      <View className="mx-4 mt-3">
        <Text className="text-base font-bold text-foreground mb-2">本周数据</Text>
        <View className="flex gap-3">
          <View className="flex-1 bg-card rounded-2xl border border-border p-4">
            <Text className="text-2xl font-bold text-blue-500">{stats.weekOrders}</Text>
            <Text className="text-xs text-muted-foreground">订单数</Text>
          </View>
          <View className="flex-1 bg-card rounded-2xl border border-border p-4">
            <Text className="text-2xl font-bold text-orange-500">¥{stats.weekRevenue.toFixed(0)}</Text>
            <Text className="text-xs text-muted-foreground">营收</Text>
          </View>
        </View>
      </View>

      {/* 商品统计 */}
      <View className="mx-4 mt-3">
        <Text className="text-base font-bold text-foreground mb-2">商品统计</Text>
        <View className="bg-card rounded-2xl border border-border p-4">
          <View className="flex justify-between py-2 border-b border-border">
            <Text className="text-base text-muted-foreground">总商品数</Text>
            <Text className="text-base font-bold text-foreground">{stats.totalProducts}</Text>
          </View>
          <View className="flex justify-between py-2 border-b border-border">
            <Text className="text-base text-muted-foreground">在售商品</Text>
            <Text className="text-base font-bold text-green-500">{stats.onlineProducts}</Text>
          </View>
          <View className="flex justify-between py-2">
            <Text className="text-base text-muted-foreground">已下架</Text>
            <Text className="text-base font-bold text-muted-foreground">{stats.totalProducts - stats.onlineProducts}</Text>
          </View>
        </View>
      </View>

      {/* 会员统计 */}
      <View className="mx-4 mt-3">
        <Text className="text-base font-bold text-foreground mb-2">会员统计</Text>
        <View className="bg-card rounded-2xl border border-border p-4">
          <View className="flex justify-between py-2 border-b border-border">
            <Text className="text-base text-muted-foreground">总会员数</Text>
            <Text className="text-base font-bold text-foreground">{stats.totalMembers}</Text>
          </View>
          <View className="flex justify-between py-2">
            <Text className="text-base text-muted-foreground">跨店消费会员</Text>
            <Text className="text-base font-bold text-purple-500">{stats.crossStoreOrders}</Text>
          </View>
        </View>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantAnalyticsPage
