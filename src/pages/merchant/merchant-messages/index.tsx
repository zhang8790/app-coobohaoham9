// @title 消息通知（自营门店中心 · 与网页版一一对应）
import { useState, useEffect } from 'react'
import { View, Text, Button } from '@tarojs/components'
import { getMerchantStore, getMerchantMessages } from '@/db/api'
import type { MerchantMessage } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/Icon'

type FilterKey = 'all' | 'order' | 'system' | 'commission'

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'order', label: '订单' },
  { key: 'system', label: '系统' },
  { key: 'commission', label: '佣金' },
]

const TYPE_ICON: Record<string, string> = { order: 'order', system: 'bell-outline', commission: 'coin' }
const TYPE_LABEL: Record<string, string> = { order: '订单消息', system: '系统消息', commission: '佣金消息' }

function MerchantMessagesPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<MerchantMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [storeReady, setStoreReady] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const st = await getMerchantStore()
        if (cancelled) return
        if (!st || !user) { setLoading(false); return }
        setStoreReady(true)
        const list = await getMerchantMessages(st.id, user.id).catch(() => [] as MerchantMessage[])
        if (!cancelled) setMessages(list)
      } catch (e) {
        console.error('[MerchantMessages] 加载失败', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  const filtered = filter === 'all' ? messages : messages.filter(m => m.type === filter)
  const unread = messages.filter(m => !m.read).length
  const markRead = (id: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
  const markAllRead = () => setMessages(prev => prev.map(m => ({ ...m, read: true })))

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      {/* 头部：标题 + 未读数 + 全部已读 */}
      <View className="px-4 mt-4 flex flex-row items-center justify-between">
        <View className="flex flex-row items-center">
          <Text className="text-lg font-bold text-foreground">消息通知</Text>
          {unread > 0 && <Text className="text-xs text-red-500" style={{ marginLeft: '6px' }}>（{unread}条未读）</Text>}
        </View>
        {unread > 0 && (
          <Button className="!m-0 !p-0 !bg-transparent !border !border-border !rounded-xl" onClick={markAllRead}>
            <Text className="text-xs text-muted-foreground" style={{ padding: '6px 12px' }}>全部已读</Text>
          </Button>
        )}
      </View>

      {/* 筛选标签 */}
      <View className="px-4 mt-3 flex flex-row">
        {TABS.map(t => (
          <View
            key={t.key}
            className={`rounded-xl ${filter === t.key ? 'bg-primary' : 'bg-card border border-border'}`}
            style={{ padding: '6px 14px', marginRight: '8px' }}
            onClick={() => setFilter(t.key)}>
            <Text className={`text-sm ${filter === t.key ? 'text-white' : 'text-muted-foreground'}`}>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* 消息列表 */}
      <View className="px-4 mt-3">
        {!storeReady ? (
          <View className="bg-card rounded-2xl border border-border p-8 flex items-center justify-center">
            <Text className="text-base text-muted-foreground">未找到关联门店</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="bg-card rounded-2xl border border-border p-8 flex items-center justify-center">
            <Text className="text-base text-muted-foreground">暂无消息</Text>
          </View>
        ) : filtered.map(msg => (
          <View
            key={msg.id}
            className="bg-card rounded-2xl border border-border mb-2 p-4"
            style={{ borderLeft: msg.read ? '3px solid transparent' : '3px solid hsl(var(--primary))' }}
            onClick={() => markRead(msg.id)}>
            <View className="flex flex-row items-center justify-between">
              <View className="flex flex-row items-center">
                <Icon name={TYPE_ICON[msg.type]} size={18} className="text-primary" />
                <Text className={`text-base ${msg.read ? 'font-bold text-foreground' : 'font-bold text-primary'}`} style={{ marginLeft: '8px' }}>{msg.title}</Text>
                {!msg.read && <View className="w-2 h-2 rounded-full" style={{ marginLeft: '8px', background: 'hsl(var(--primary-strong))' }} />}
              </View>
              <Text className="text-xs text-muted-foreground">{msg.time}</Text>
            </View>
            <Text className="text-sm text-muted-foreground" style={{ marginTop: '8px' }}>{msg.content}</Text>
            <Text className="text-xs text-muted-foreground" style={{ marginTop: '6px' }}>{TYPE_LABEL[msg.type]}</Text>
          </View>
        ))}
      </View>
    </View>
  </RouteGuard>)
}

export default MerchantMessagesPage
