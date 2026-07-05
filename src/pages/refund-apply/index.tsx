import { View, Button, Textarea, Text } from '@tarojs/components'
// @title 申请退款
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { getOrderById, applyRefund } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'
import type { Order } from '@/db/types'
import { supabase } from '@/client/supabase'

const REASONS = [
  '商品质量问题',
  '商品与描述不符',
  '商家发货错误',
  '不想要了/冲动消费',
  '长时间未发货',
  '其他原因',
]

function RefundApplyPage() {
  const orderId = useMemo(() => {
    const p = Taro.getCurrentInstance().router?.params as any
    return p?.orderId ? decodeURIComponent(p.orderId) : ''
  }, [])

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedReason, setSelectedReason] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refundable, setRefundable] = useState(0)
  const [refundAmount, setRefundAmount] = useState(0)

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    const data = await getOrderById(orderId)

    // 检查是否已存在退款记录（幂等性检查）
    const { data: existingRefund } = await supabase.from('refunds')
      .select('id, status, refund_amount, created_at')
      .eq('order_id', orderId)
      .maybeSingle()

    if (existingRefund) {
      // 已有退款记录，设置特殊状态
      setOrder({ ...data, _existingRefund: existingRefund } as any)
      setLoading(false)
      return
    }

    setOrder(data)
    if (data) {
      const paid = Number(data.total_amount)
      const refunded = Number((data as any).refunded_amount ?? 0)
      const avail = Math.max(0, Math.round((paid - refunded) * 10000) / 10000)
      setRefundable(avail)
      setRefundAmount(avail)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    if (!selectedReason) { Taro.showToast({ title: '请选择退款原因', icon: 'none' }); return }
    if (refundAmount <= 0) { Taro.showToast({ title: '退款金额不能为0', icon: 'none' }); return }
    if (!order) return

    setSubmitting(true)
    try {
      const result = await applyRefund({
        order_id: order.id,
        order_no: order.order_no,
        item_index: -1,  // -1 表示整单退款
        refund_quantity: order.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 1,
        refund_amount: refundAmount,
        reason: selectedReason,
        description: description.trim() || undefined,
      })

      if (result.success) {
        Taro.showToast({ title: '退款申请已提交', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 1500)
      } else {
        Taro.showToast({ title: result.error || '申请失败，请重试', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '网络错误，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  if (!order) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Text className="text-xl text-muted-foreground">订单不存在</Text>
    </View>
  )

  // 已有退款记录，显示状态
  const existingRefund = (order as any)._existingRefund
  if (existingRefund) {
    const statusMap: Record<string, { text: string; color: string; icon: string }> = {
      'pending': { text: '待审核', color: '#B45309', icon: 'i-mdi-clock-outline' },
      'approved': { text: '审核通过', color: '#1976D2', icon: 'i-mdi-check-circle' },
      'rejected': { text: '已拒绝', color: '#DC2626', icon: 'i-mdi-close-circle' },
      'completed': { text: '已完成退款', color: '#4CAF50', icon: 'i-mdi-check-circle' },
      'cancelled': { text: '已取消', color: '#9A8070', icon: 'i-mdi-cancel' },
    }
    const refundStatus = statusMap[existingRefund.status] || { text: existingRefund.status, color: '#9A8070', icon: 'i-mdi-help-circle' }

    return (<RouteGuard>
      <View className="min-h-screen bg-background flex flex-col items-center justify-center px-8">
        <View className={`${refundStatus.icon} text-7xl mb-4`} style={{ color: refundStatus.color }} />
        <Text className="text-2xl font-bold text-foreground text-center mb-2">该订单已申请退款</Text>
        <Text className="text-xl font-bold" style={{ color: refundStatus.color }}>当前状态：{refundStatus.text}</Text>
        {existingRefund.refund_amount && (
          <Text className="text-base text-muted-foreground mt-1">退款金额：¥{Number(existingRefund.refund_amount).toFixed(2)}</Text>
        )}
        <Button type="button"
          className="mt-8 px-10 py-3 rounded-2xl bg-primary text-white text-xl font-bold"
          onClick={() => Taro.navigateBack()}>
          返回订单
        </Button>
      </View>
    </RouteGuard>)
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-36">
      {/* 退款金额 */}
      <View className="mx-4 mt-6 p-5 rounded-2xl bg-card border-2 border-primary/20 flex flex-col items-center gap-2">
        <Text className="text-xl text-muted-foreground">申请退款金额</Text>
        <Text className="text-5xl font-bold text-primary">¥{refundAmount.toFixed(2)}</Text>
        <Text className="text-base text-muted-foreground">可退金额 ¥{refundable.toFixed(2)}</Text>
      </View>

      {/* 订单信息 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        <Text className="text-xl font-bold text-foreground mb-3">退款订单</Text>
        {order.order_items?.map((item, idx) => (
          <View key={idx} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            <View className="i-mdi-package-variant text-2xl text-muted-foreground flex-shrink-0" />
            <View className="flex-1">
              <Text className="text-xl text-foreground font-bold line-clamp-1">{item.product_name}</Text>
              <Text className="text-base text-muted-foreground">{item.store_name}</Text>
            </View>
            <View className="flex flex-col items-end gap-1">
              <Text className="text-xl font-bold text-primary">¥{item.price}</Text>
              <Text className="text-base text-muted-foreground">×{item.quantity}</Text>
            </View>
          </View>
        ))}
        <View className="flex items-center justify-between pt-3">
          <Text className="text-xl text-muted-foreground">订单金额</Text>
          <Text className="text-xl font-bold text-foreground">¥{Number(order.total_amount).toFixed(2)}</Text>
        </View>
        {Number((order as any).refunded_amount ?? 0) > 0 && (
          <View className="flex items-center justify-between pt-1">
            <Text className="text-xl text-muted-foreground">已退款</Text>
            <Text className="text-xl font-bold text-red-500">-¥{Number((order as any).refunded_amount).toFixed(2)}</Text>
          </View>
        )}
      </View>

      {/* 退款原因 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="px-4 py-3 border-b border-border">
          <Text className="text-xl font-bold text-foreground">退款原因</Text>
          <Text className="text-xl text-destructive ml-1">*</Text>
        </View>
        {REASONS.map(r => (
          <View key={r}
            className={`flex items-center gap-3 px-4 py-4 border-b border-border last:border-0 ${selectedReason === r ? 'bg-primary/5' : ''}`}
            onClick={() => setSelectedReason(r)}>
            <View className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedReason === r ? 'border-primary bg-primary' : 'border-border'}`}>
              {selectedReason === r && <View className="i-mdi-check text-white text-xs" />}
            </View>
            <Text className="text-xl text-foreground">{r}</Text>
          </View>
        ))}
      </View>

      {/* 补充说明 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="px-4 py-3 border-b border-border">
          <Text className="text-xl font-bold text-foreground">补充说明</Text>
          <Text className="text-base text-muted-foreground ml-2">（选填）</Text>
        </View>
        <View className="p-4">
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
            <Textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              style={{ height: '80px', resize: 'none' }}
              placeholder="请描述退款原因，帮助我们更好地处理..."
              value={description}
              onInput={(e) => { const ev = e as any; setDescription(ev.detail?.value ?? ev.target?.value ?? '') }}
              maxLength={200}
            />
          </View>
          <Text className="text-base text-muted-foreground text-right mt-1">{description.length}/200</Text>
        </View>
      </View>

      {/* 退款说明 */}
      <View className="mx-4 mt-4 p-4 bg-muted rounded-2xl">
        <View className="flex items-start gap-2">
          <View className="i-mdi-information-outline text-2xl text-primary flex-shrink-0 mt-0.5" />
          <View>
            <Text className="text-xl font-bold text-foreground mb-2">退款说明</Text>
            <Text className="text-base text-muted-foreground leading-relaxed">• 退款将原路退回至您的支付账户</Text>
            <Text className="text-base text-muted-foreground leading-relaxed">• 使用金豆抵扣部分将退还至金豆余额</Text>
            <Text className="text-base text-muted-foreground leading-relaxed">• 退款对应的积分奖励将同步扣回</Text>
            <Text className="text-base text-muted-foreground leading-relaxed">• 微信退款通常1-3个工作日到账</Text>
          </View>
        </View>
      </View>

      {/* 底部提交 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <Button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting || !selectedReason ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <View className="py-4 text-2xl font-bold text-white">
            {submitting ? '提交中...' : `申请退款 ¥${refundAmount.toFixed(2)}`}
          </View>
        </Button>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default RefundApplyPage
