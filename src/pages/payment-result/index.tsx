// @title 支付成功
import { useRouter } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

function PaymentResultPage() {
  const router = useRouter()
  const p = (router.params || {}) as any
  const orderNo = p.orderNo || ''
  const total = parseFloat(p.total || '0') || 0
  const serviceType = (p.serviceType === 'delivery' ? 'delivery' : 'dine_in') as 'dine_in' | 'delivery'
  const reviewable = p.reviewable === '1'
  const isDelivery = serviceType === 'delivery'

  const goOrders = () => Taro.navigateTo({ url: '/pages/order-center/index' })
  const goHome = () => Taro.switchTab({ url: '/pages/explore/index' })
  const goReview = () => {
    if (orderNo) Taro.navigateTo({ url: `/pages/mine/review/index?orderId=${encodeURIComponent(orderNo)}` })
  }

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex flex-col items-center px-6 pt-20">
        {/* 成功图标 */}
        <View className="w-24 h-24 rounded-full flex items-center justify-center bg-primary/10 mb-6">
          <Icon name="check-circle" size={60} className="text-primary" />
        </View>
        <Text className="text-3xl font-bold text-foreground">支付成功</Text>
        <Text className="text-xl text-muted-foreground mt-2">¥{total.toFixed(2)} 已支付</Text>

        {orderNo && (
          <View className="mt-4 px-4 py-2 rounded-xl bg-card border border-border">
            <Text className="text-base text-muted-foreground">订单号：{orderNo}</Text>
          </View>
        )}

        {/* 履约提示（按用餐方式差异化） */}
        <View className="mt-6 w-full p-4 rounded-2xl bg-card border border-border">
          <Text className="text-base text-foreground leading-relaxed">
            {isDelivery
              ? '商家将尽快为您发货，您可在「订单中心」查看物流与确认收货。'
              : '到店消费时，向店员出示本订单号即可核销使用。'}
          </Text>
        </View>

        {/* 操作区：用户主动选择下一步 */}
        <View className="w-full mt-8 flex flex-col gap-3">
          <View
            className="w-full flex items-center justify-center leading-none rounded-2xl bg-primary"
            onClick={goOrders}>
            <View className="py-4 text-2xl font-bold text-white">查看订单</View>
          </View>
          <View
            className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
            onClick={goHome}>
            <View className="py-4 text-xl text-muted-foreground">返回继续逛逛</View>
          </View>
        </View>

        {/* 评价入口：可选项，不强制推送 */}
        {reviewable && (
          <View className="mt-6" onClick={goReview}>
            <Text className="text-base text-primary">写评价，分享你的体验 ›</Text>
          </View>
        )}

        <View className="flex-1" />
      </View>
    </RouteGuard>
  )
}

export default PaymentResultPage
