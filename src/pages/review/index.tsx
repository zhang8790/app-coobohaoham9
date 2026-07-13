// @title 订单评价
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, Textarea } from '@tarojs/components'
import { getOrders, submitReviews } from '@/db/api'
import type { Order } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { MOOD_CATEGORIES, MOOD_TAGS_ALL, type MoodTag } from '@/utils/mood-tags'

interface ReviewItem {
  order_item_id: string
  product_id: string | null
  product_name: string
  product_image: string | null
  rating: number
  content: string
  mood_tags: string[]
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
  const [activeMoodCategory, setActiveMoodCategory] = useState<string>('positive')

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    try {
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
          mood_tags: [],
        })))
      }
    } catch (e) {
      console.warn('[ReviewPage] load error', e)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  const setRating = (idx: number, r: number) =>
    setReviews(prev => prev.map((item, i) => i === idx ? { ...item, rating: r } : item))

  const setContent = (idx: number, v: string) =>
    setReviews(prev => prev.map((item, i) => i === idx ? { ...item, content: v } : item))

  const toggleMoodTag = (idx: number, tagZh: string) =>
    setReviews(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const tags = item.mood_tags.includes(tagZh)
        ? item.mood_tags.filter(t => t !== tagZh)
        : [...item.mood_tags, tagZh]
      return { ...item, mood_tags: tags }
    }))

  const handleSubmit = async () => {
    if (!order) return
    setSubmitting(true)
    const ok = await submitReviews(reviews.map(r => ({
      product_id: r.product_id,
      order_id: order.id,
      order_item_id: r.order_item_id,
      rating: r.rating,
      content: r.content || undefined,
      mood_tags: r.mood_tags.length > 0 ? r.mood_tags : undefined,
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
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  if (!order) return (
    <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
      <View className="i-mdi-alert-circle-outline text-6xl text-muted-foreground/40" />
      <Text className="text-xl text-muted-foreground">订单不存在或已评价</Text>
      <View
        className="flex items-center justify-center leading-none rounded-2xl bg-primary"
        onClick={() => Taro.navigateBack()}>
        <View className="py-3 px-8 text-xl font-bold text-white">返回</View>
      </View>
    </View>
  )

  const STAR_LABELS = ['', '非常差', '较差', '一般', '较好', '非常好']

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-28">

      <View className="px-4 mt-4">
        <View className="bg-card rounded-2xl border border-border px-4 py-3 mb-4 flex items-center gap-2">
          <View className="i-mdi-receipt-text text-xl text-muted-foreground" />
          <Text className="text-xl text-muted-foreground">订单号：{order.order_no}</Text>
        </View>

        {(reviews || []).map((rev, idx) => (
          <View key={rev.order_item_id} className="bg-card rounded-2xl border border-border mb-4 p-4">
            {/* 商品信息 */}
            <View className="flex items-center gap-3 mb-4">
              <View className="w-16 h-16 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                {rev.product_image
                  ? <Image src={rev.product_image} mode="aspectFill" style={{ width: '64px', height: '64px' }} />
                  : <View className="w-full h-full flex items-center justify-center">
                      <View className="i-mdi-package-variant text-2xl text-muted-foreground/40" />
                    </View>}
              </View>
              <Text className="text-xl font-bold text-foreground flex-1 line-clamp-2">{rev.product_name}</Text>
            </View>

            {/* 星级 */}
            <View className="flex flex-col gap-2 mb-4">
              <Text className="text-xl text-foreground">商品评分</Text>
              <View className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(s => (
                  <View key={s} onClick={() => setRating(idx, s)}>
                    <View className={`text-4xl ${s <= rev.rating ? 'i-mdi-star text-yellow-400' : 'i-mdi-star-outline text-muted-foreground'}`} />
                  </View>
                ))}
                <Text className="text-xl text-primary font-bold ml-1">{STAR_LABELS[rev.rating]}</Text>
              </View>
            </View>

            {/* 文字评价 */}
            <View>
              <Text className="text-xl text-foreground mb-2">文字评价（可选）</Text>
              <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden" style={{ minHeight: '100px' }}>
                <Textarea
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  style={{ height: '90px', display: 'block' }}
                  placeholder="说说你的使用感受，帮助更多人做决策…"
                  value={rev.content}
                  onInput={e => { const ev = e as any; setContent(idx, ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </View>
            </View>

            {/* 情绪标签 */}
            <View className="mt-4">
              <Text className="text-xl text-foreground mb-2">情绪标签（可选）</Text>
              <Text className="text-sm text-muted-foreground mb-3">选择你使用商品后的情绪感受</Text>
              
              {/* 情绪分类切换 */}
              <View className="flex gap-2 mb-3 flex-wrap">
                {Object.keys(MOOD_CATEGORIES).map(cat => (
                  <View key={cat}
                    className={`px-3 py-2 rounded-xl border-2 transition ${
                      activeMoodCategory === cat ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    onClick={() => setActiveMoodCategory(cat)}>
                    <Text className={`text-sm ${activeMoodCategory === cat ? 'text-primary font-bold' : 'text-foreground'}`}>
                      {MOOD_CATEGORIES[cat as keyof typeof MOOD_CATEGORIES].icon} {cat}
                    </Text>
                  </View>
                ))}
              </View>

              {/* 情绪标签选择 */}
              <View className="flex gap-2 flex-wrap">
                {(MOOD_CATEGORIES[activeMoodCategory as keyof typeof MOOD_CATEGORIES]?.tags || []).map(tagZh => {
                  const tag = MOOD_TAGS_ALL.find(t => t.zh === tagZh)
                  if (!tag) return null
                  const selected = rev.mood_tags.includes(tag.zh)
                  return (
                    <View key={tag.zh}
                      className={`px-3 py-2 rounded-full border-2 transition ${
                        selected ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                      onClick={() => toggleMoodTag(idx, tag.zh)}>
                      <Text className={`text-sm ${selected ? 'text-primary font-bold' : 'text-foreground'}`}>
                        {tag.icon} {tag.zh}
                      </Text>
                    </View>
                  )
                })}
              </View>

              {/* 已选中的情绪标签 */}
              {rev.mood_tags.length > 0 && (
                <View className="mt-3 p-3 bg-primary/5 rounded-xl border-2 border-primary/20">
                  <Text className="text-sm font-bold text-primary mb-2">你的感受：</Text>
                  <View className="flex gap-2 flex-wrap">
                    {rev.mood_tags.map(tagZh => {
                      const tag = MOOD_TAGS_ALL.find(t => t.zh === tagZh)
                      return (
                        <View key={tagZh} className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: tag?.color + '20', border: `1px solid ${tag?.color}` }}>
                          <Text className="text-sm" style={{ color: tag?.color }}>{tag?.icon} {tagZh}</Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* 底部提交 */}
      <View className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background" style={{ borderTop: '1px solid var(--border)' }}>
        <View
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <View className="py-4 text-xl font-bold text-white">{submitting ? '提交中…' : '提交评价'}</View>
        </View>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default ReviewPage
