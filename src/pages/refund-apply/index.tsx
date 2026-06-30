// @title 申请退款
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { getOrderById, applyRefund } from '@/db/api'
import { withRouteGuard } from '@/components/RouteGuard'
import type { Order } from '@/db/types'

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
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  if (!order) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <p className="text-xl text-muted-foreground">订单不存在</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* 退款金额 */}
      <div className="mx-4 mt-6 p-5 rounded-2xl bg-card border-2 border-primary/20 flex flex-col items-center gap-2">
        <p className="text-xl text-muted-foreground">申请退款金额</p>
        <p className="text-5xl font-bold text-primary">¥{refundAmount.toFixed(2)}</p>
        <p className="text-base text-muted-foreground">可退金额 ¥{refundable.toFixed(2)}</p>
      </div>

      {/* 订单信息 */}
      <div className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        <p className="text-xl font-bold text-foreground mb-3">退款订单</p>
        {order.order_items?.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            <div className="i-mdi-package-variant text-2xl text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xl text-foreground font-bold line-clamp-1">{item.product_name}</p>
              <p className="text-base text-muted-foreground">{item.store_name}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xl font-bold text-primary">¥{item.price}</span>
              <span className="text-base text-muted-foreground">×{item.quantity}</span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3">
          <span className="text-xl text-muted-foreground">订单金额</span>
          <span className="text-xl font-bold text-foreground">¥{Number(order.total_amount).toFixed(2)}</span>
        </div>
        {Number((order as any).refunded_amount ?? 0) > 0 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xl text-muted-foreground">已退款</span>
            <span className="text-xl font-bold text-red-500">-¥{Number((order as any).refunded_amount).toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* 退款原因 */}
      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xl font-bold text-foreground">退款原因</span>
          <span className="text-xl text-destructive ml-1">*</span>
        </div>
        {REASONS.map(r => (
          <div key={r}
            className={`flex items-center gap-3 px-4 py-4 border-b border-border last:border-0 ${selectedReason === r ? 'bg-primary/5' : ''}`}
            onClick={() => setSelectedReason(r)}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedReason === r ? 'border-primary bg-primary' : 'border-border'}`}>
              {selectedReason === r && <div className="i-mdi-check text-white text-xs" />}
            </div>
            <span className="text-xl text-foreground">{r}</span>
          </div>
        ))}
      </div>

      {/* 补充说明 */}
      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xl font-bold text-foreground">补充说明</span>
          <span className="text-base text-muted-foreground ml-2">（选填）</span>
        </div>
        <div className="p-4">
          <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
            <textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              style={{ height: '80px', resize: 'none' }}
              placeholder="请描述退款原因，帮助我们更好地处理..."
              value={description}
              onInput={(e) => { const ev = e as any; setDescription(ev.detail?.value ?? ev.target?.value ?? '') }}
              maxLength={200}
            />
          </div>
          <p className="text-base text-muted-foreground text-right mt-1">{description.length}/200</p>
        </div>
      </div>

      {/* 退款说明 */}
      <div className="mx-4 mt-4 p-4 bg-muted rounded-2xl">
        <div className="flex items-start gap-2">
          <div className="i-mdi-information-outline text-2xl text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xl font-bold text-foreground mb-2">退款说明</p>
            <p className="text-base text-muted-foreground leading-relaxed">• 退款将原路退回至您的支付账户</p>
            <p className="text-base text-muted-foreground leading-relaxed">• 使用金豆抵扣部分将退还至金豆余额</p>
            <p className="text-base text-muted-foreground leading-relaxed">• 退款对应的积分奖励将同步扣回</p>
            <p className="text-base text-muted-foreground leading-relaxed">• 微信退款通常1-3个工作日到账</p>
          </div>
        </div>
      </div>

      {/* 底部提交 */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting || !selectedReason ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <div className="py-4 text-2xl font-bold text-white">
            {submitting ? '提交中...' : `申请退款 ¥${refundAmount.toFixed(2)}`}
          </div>
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(RefundApplyPage)
