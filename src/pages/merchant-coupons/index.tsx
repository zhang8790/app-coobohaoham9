// @title 优惠券管理（商家端）
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'

const MOCK_COUPONS = [
  { id: 'c1', title: '新客立减5元', discount_type: 'amount', discount_value: 5, min_amount: 0, used_count: 12, total: 100, status: 'active', expired_at: '2026-12-31' },
  { id: 'c2', title: '满50减8元', discount_type: 'amount', discount_value: 8, min_amount: 50, used_count: 5, total: 50, status: 'active', expired_at: '2026-09-30' },
  { id: 'c3', title: '全场8折', discount_type: 'percent', discount_value: 20, min_amount: 0, used_count: 0, total: 200, status: 'draft', expired_at: '2026-10-15' },
]

function MerchantCouponsPage() {
  const [coupons] = useState(MOCK_COUPONS)
  const [showForm, setShowForm] = useState(false)

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      <View className="px-4 mt-3">
        <Button className="!w-full !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none"
          onClick={() => setShowForm(true)}>
          <View className="py-3 flex items-center gap-1 justify-center">
            <View className="i-mdi-plus text-white text-xl" />
            <Text className="text-base font-bold text-white">创建优惠券</Text>
          </View>
        </Button>
      </View>

      <View className="px-4 mt-3">
        {coupons.map(c => (
          <View key={c.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
            <View className="flex items-center justify-between">
              <View>
                <Text className="text-base font-bold text-foreground">{c.title}</Text>
                <Text className="text-sm text-muted-foreground ml-2">
                  {c.discount_type === 'amount' ? `减¥${c.discount_value}` : `${c.discount_value}折`}
                  {c.min_amount > 0 ? ` · 满¥${c.min_amount}` : ''}
                </Text>
              </View>
              <View className={`px-2 py-1 rounded-full text-xs ${c.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                {c.status === 'active' ? '生效中' : '草稿'}
              </View>
            </View>
            <View className="flex items-center gap-4 mt-2">
              <Text className="text-xs text-muted-foreground">已领 {c.used_count}/{c.total}</Text>
              <Text className="text-xs text-muted-foreground">到期 {c.expired_at}</Text>
            </View>
          </View>
        ))}
      </View>

      {showForm && (
        <View className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForm(false)}>
          <View className="w-full bg-card rounded-t-3xl px-4 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <View className="flex items-center justify-between mb-4">
              <Text className="text-xl font-bold text-foreground">创建优惠券</Text>
              <Button className="!p-0 !bg-transparent !border-none" onClick={() => setShowForm(false)}>
                <View className="i-mdi-close text-2xl text-muted-foreground" />
              </Button>
            </View>
            <View className="mb-3">
              <Text className="text-base text-foreground mb-1">优惠券名称</Text>
              <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" placeholder="如：新客立减5元" />
            </View>
            <View className="flex gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">优惠类型</Text>
                <View className="flex gap-2">
                  <View className="flex-1 py-2 rounded-xl bg-primary text-center"><Text className="text-sm text-white">满减</Text></View>
                  <View className="flex-1 py-2 rounded-xl bg-muted text-center"><Text className="text-sm text-muted-foreground">折扣</Text></View>
                </View>
              </View>
            </View>
            <View className="flex gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">优惠金额</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" placeholder="5" type="digit" />
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">最低消费</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" placeholder="0" type="digit" />
              </View>
            </View>
            <Button className="!w-full !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none">
              <View className="py-4 text-base font-bold text-white">创建</View>
            </Button>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantCouponsPage
