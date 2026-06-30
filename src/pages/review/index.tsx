// @title 订单评价
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getOrders, submitReviews } from '@/db/api'
import type { Order } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

interface ReviewItem {
  order_item_id: string
  product_id: string | null
  product_name: string
  product_image: string | null
  rating: number
  content: string
}

function ReviewPage() {
  const orderId = useMemo(() => {
    const raw = Taro.getCurrentInstance().router?.params?.orderId || ''
    return decodeURIComponent(raw)
  }, [])

  const [order, setOrder] = useState<Order | null>(null)
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    const orders = await getOrders('pending_review' as any)
    const found = orders.find(o => o.id === orderId)
    if (found) {
      setOrder(found)
      setReviews((found.order_items || []).map(item => ({
        order_item_id: item.id,
        product_id: item.product_id ?? null,
        product_name: item.product_name,
        product_image: item.product_image ?? null,
        rating: 5,
        content: '',
      })))
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  const setRating = (idx: number, r: number) =>
    setReviews(prev => prev.map((item, i) => i === idx ? { ...item, rating: r } : item))

  const setContent = (idx: number, v: string) =>
    setReviews(prev => prev.map((item, i) => i === idx ? { ...item, content: v } : item))

  const handleSubmit = async () => {
    if (!order) return
    setSubmitting(true)
    const ok = await submitReviews(reviews.map(r => ({
      product_id: r.product_id,
      order_id: order.id,
      order_item_id: r.order_item_id,
      rating: r.rating,
      content: r.content || undefined,
    })))
    setSubmitting(false)
    if (ok) {
      Taro.showToast({ title: '评价成功，感谢您的反馈', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1500)
    } else {
      Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  if (!order) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
      <div className="i-mdi-alert-circle-outline text-6xl text-muted-foreground/40" />
      <p className="text-xl text-muted-foreground">订单不存在或已评价</p>
      <button type="button"
        className="flex items-center justify-center leading-none rounded-2xl bg-primary"
        onClick={() => Taro.navigateBack()}>
        <div className="py-3 px-8 text-xl font-bold text-white">返回</div>
      </button>
    </div>
  )

  const STAR_LABELS = ['', '非常差', '较差', '一般', '较好', '非常好']

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">订单评价</span>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-card rounded-2xl border border-border px-4 py-3 mb-4 flex items-center gap-2">
          <div className="i-mdi-receipt-text text-xl text-muted-foreground" />
          <span className="text-xl text-muted-foreground">订单号：{order.order_no}</span>
        </div>

        {reviews.map((rev, idx) => (
          <div key={rev.order_item_id} className="bg-card rounded-2xl border border-border mb-4 p-4">
            {/* 商品信息 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                {rev.product_image
                  ? <Image src={rev.product_image} mode="aspectFill" style={{ width: '64px', height: '64px' }} />
                  : <div className="w-full h-full flex items-center justify-center">
                      <div className="i-mdi-package-variant text-2xl text-muted-foreground/40" />
                    </div>}
              </div>
              <p className="text-xl font-bold text-foreground flex-1 line-clamp-2">{rev.product_name}</p>
            </div>

            {/* 星级 */}
            <div className="flex flex-col gap-2 mb-4">
              <p className="text-xl text-foreground">商品评分</p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(s => (
                  <div key={s} onClick={() => setRating(idx, s)}>
                    <div className={`text-4xl ${s <= rev.rating ? 'i-mdi-star text-yellow-400' : 'i-mdi-star-outline text-muted-foreground'}`} />
                  </div>
                ))}
                <span className="text-xl text-primary font-bold ml-1">{STAR_LABELS[rev.rating]}</span>
              </div>
            </div>

            {/* 文字评价 */}
            <div>
              <p className="text-xl text-foreground mb-2">文字评价（可选）</p>
              <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden" style={{ minHeight: '100px' }}>
                <textarea
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  style={{ height: '90px', display: 'block' }}
                  placeholder="说说你的使用感受，帮助更多人做决策…"
                  value={rev.content}
                  onInput={e => { const ev = e as any; setContent(idx, ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部提交 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background" style={{ borderTop: '1px solid var(--border)' }}>
        <button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <div className="py-4 text-xl font-bold text-white">{submitting ? '提交中…' : '提交评价'}</div>
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(ReviewPage)
