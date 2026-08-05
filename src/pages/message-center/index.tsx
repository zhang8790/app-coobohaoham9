import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getAnnouncements, getOrders } from '@/db/api'
import type { Announcement, Order } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import PageHeader from '@/components/ui/PageHeader'

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_pay: '待付款', pending_ship: '待发货', pending_receive: '待收货',
  pending_pickup: '待取货', pending_review: '待评价', after_sale: '售后中',
  completed: '已完成', cancelled: '已取消',
}

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function Empty({ text }: { text: string }) {
  return (
    <View className="flex items-center justify-center py-20">
      <Text className="text-sm text-muted-foreground">{text}</Text>
    </View>
  )
}

export default function MessageCenter() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'announcement' | 'order'>('announcement')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, o] = await Promise.all([
      getAnnouncements(),
      profile?.id ? getOrders(undefined, 0, 20) : Promise.resolve([]),
    ])
    setAnnouncements(a)
    setOrders(Array.isArray(o) ? o : [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { load() }, [load])

  const goBack = () => { Taro.navigateBack().catch(() => Taro.switchTab({ url: '/pages/index/index' })) }

  return (
    <View className="min-h-screen bg-background flex flex-col">
      <PageHeader
        title="消息中心"
        left={<Text style={{ fontSize: 24, lineHeight: '48px', color: 'hsl(var(--foreground))', paddingRight: 8 }} onClick={goBack}>‹</Text>}
      />

      {/* 双 Tab：公告 / 订单 */}
      <View className="flex border-b border-border bg-background">
        {(['announcement', 'order'] as const).map((t) => (
          <View
            key={t}
            className="flex-1 py-3 text-center active:opacity-70 transition-opacity"
            hoverClass="none"
            onClick={() => setTab(t)}
          >
            <Text className={`text-sm font-semibold ${tab === t ? 'text-primary' : 'text-muted-foreground'}`}>
              {t === 'announcement' ? '公告' : '订单'}
            </Text>
            {tab === t && (
              <View className="mt-1 mx-auto" style={{ width: 24, height: 3, borderRadius: 2, background: 'hsl(var(--primary))' }} />
            )}
          </View>
        ))}
      </View>

      <ScrollView scrollY className="flex-1 px-4 py-3" style={{ height: 'calc(100vh - 96px)' }}>
        {loading ? (
          <Text className="text-sm text-muted-foreground">加载中…</Text>
        ) : tab === 'announcement' ? (
          announcements.length === 0 ? <Empty text="暂无公告" /> :
          announcements.map((a) => (
            <View key={a.id} className="pg-card rounded-2xl p-4 mb-3">
              <Text className="text-sm text-foreground block" style={{ lineHeight: 1.6 }}>{a.content}</Text>
              <Text className="text-[11px] text-muted-foreground mt-2 block">{formatDate(a.created_at)}</Text>
            </View>
          ))
        ) : (
          !profile?.id ? <Empty text="登录后查看你的订单" /> :
          orders.length === 0 ? <Empty text="暂无订单" /> :
          orders.map((o) => (
            <View
              key={o.id}
              className="pg-card rounded-2xl p-4 mb-3 flex items-center justify-between active:scale-[0.99] transition-transform"
              hoverClass="none"
              onClick={() => Taro.navigateTo({ url: '/pages/order-center/index' })}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-foreground block truncate">订单 {o.order_no}</Text>
                <Text className="text-[11px] text-muted-foreground mt-1 block">{formatDate(o.created_at)}</Text>
              </View>
              <View className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
                <Text className="text-sm font-bold text-foreground">¥{o.total_amount}</Text>
                <Text className="text-[11px] text-primary font-medium">{ORDER_STATUS_LABEL[o.status] ?? o.status}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}
