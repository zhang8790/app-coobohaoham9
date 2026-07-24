// @title 数据分析（商家端）
import { useState, useEffect } from 'react'

import { View, Text } from '@tarojs/components'
import { getMerchantStore, getMerchantProducts, getMerchantOrders } from '@/db/api'
import { supabase } from '@/client/supabase'
import { RouteGuard } from '@/components/RouteGuard'

// 仅已付款/完成订单计入营收（排除未付款、取消、售后退款）；含待核销(pending_pickup)
const REVENUE_STATUSES = ['pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed']

function MerchantAnalyticsPage() {
  const [store, setStore] = useState<any>(null)
  const [stats, setStats] = useState({
    todayOrders: 0, todayRevenue: 0, weekOrders: 0, weekRevenue: 0,
    totalProducts: 0, onlineProducts: 0, totalMembers: 0, crossStoreOrders: 0})

  useEffect(() => {
    getMerchantStore().then(async (s) => {
      setStore(s)
      if (s) {
        const [prods, ords, membersRes] = await Promise.all([
          getMerchantProducts(s.id),
          getMerchantOrders(s.id),
          supabase.rpc('get_store_locked_members', { p_store_id: s.id })
            .then((r: any) => (r.data ?? []) as any[]).catch(() => [] as any[]),
        ])
        // getMerchantOrders 返回 order_items（一行一商品），先按 order_no 去重为独立订单，
        // 否则一笔多商品订单会被重复计数、营收也会按商品行数翻倍。
        const orderMap = new Map<string, any>()
        for (const it of (ords || [])) {
          const no = it.orders?.order_no
          if (no && !orderMap.has(no)) orderMap.set(no, it.orders)
        }
        const distinctOrders = Array.from(orderMap.values())
        // 仅已付款/完成订单计入营收，与网页版商家后台口径一致（排除未付款、取消、售后退款）
        const paid = distinctOrders.filter(o => REVENUE_STATUSES.includes(o.status))
        const today = new Date().toISOString().slice(0, 10)
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
        const todayOrders = paid.filter(o => (o.created_at || '').startsWith(today))
        const weekOrders = paid.filter(o => (o.created_at || '') >= weekAgo)
        const memberList = Array.isArray(membersRes) ? membersRes : []
        const crossStore = memberList.filter((m: any) => m.referrer_store_id && m.referrer_store_id !== s.id).length
        setStats({
          todayOrders: todayOrders.length,
          todayRevenue: todayOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
          weekOrders: weekOrders.length,
          weekRevenue: weekOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
          totalProducts: prods.length,
          onlineProducts: prods.filter(p => p.is_active).length,
          totalMembers: memberList.length,
          crossStoreOrders: crossStore})
      }
    })
  }, [])

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

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
