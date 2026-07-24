// @title 消息中心
// @description 展示用户全部业务通知（订单/佣金/退款/提现/公告）
// 样式对齐全站「墨韵国潮」暖米亮色主题（设计 token: app.scss :root），
// 与首页/自营/行囊/侠客 4 个 tab 页保持一致，移除离群的暗色皮肤。
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatRelativeTime } from '@/utils/format'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  order_id: string | null
  payload: Record<string, unknown>
  read_at: string | null
  sent_at: string | null
  created_at: string
}

// 状态语义色映射到全局 token（app.scss :root），统一国潮调，不再用离群 hex
const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  order_paid:         { icon: '🛒', color: 'success',    label: '订单' },
  commission_arrived: { icon: '💰', color: 'warning',    label: '佣金' },
  withdraw_progress:  { icon: '💸', color: 'info',       label: '提现' },
  refund_result:      { icon: '↩',  color: 'destructive', label: '退款' },
  announcement:       { icon: '📢', color: 'primary',    label: '公告' },
}

// hsl(var(--token)) 便捷生成
const cvar = (token: string) => `hsl(var(--${token}))`

export default function MessagesPage() {
  const { user } = useAuth()
  const [list, setList] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) {
        console.error('[Messages] load error', error)
        return
      }
      const rows = (data ?? []) as Notification[]
      setList(rows)
      setUnread(rows.filter(r => !r.read_at).length)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])
  useDidShow(() => { load() })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  // 进入详情
  const openDetail = async (n: Notification) => {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
      setUnread(u => Math.max(0, u - 1))
      setList(l => l.map(r => r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r))
    }
    // 跳转
    const target = (n.payload?.page as string | undefined) ?? 'pages/order-center/index'
    if (target === 'pages/messages/index') {
      // 当前页，刷新即可
      load()
      return
    }
    try {
      Taro.navigateTo({ url: '/' + target.replace(/^\//, '') })
    } catch (e) {
      console.warn('[Messages] navigate fail', e)
    }
  }

  // 全部已读
  const markAllRead = async () => {
    if (!user?.id) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
    setUnread(0)
    setList(l => l.map(r => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })))
  }

  if (!user) {
    return (
      <View className="min-h-screen bg-background flex items-center justify-center px-5">
        <Text className="text-base text-muted-foreground">登录后查看消息</Text>
      </View>
    )
  }

  return (
    <ScrollView scrollY className="min-h-screen bg-background">
      {/* 头部：对齐全站亮色卡片风格 */}
      <View className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <View>
          <Text className="text-xl font-bold text-foreground">消息中心</Text>
          <Text className="text-xs text-muted-foreground mt-0.5 block">
            {unread > 0 ? `未读 ${unread} 条` : '全部已读'}
          </Text>
        </View>
        {unread > 0 && (
          <View onClick={markAllRead} className="px-3 py-1.5 rounded-full border border-border">
            <Text className="text-xs text-muted-foreground">全部已读</Text>
          </View>
        )}
      </View>

      {/* 列表 */}
      {loading && list.length === 0 ? (
        <Skeleton count={3} height={56} rounded="rounded-xl" className="px-4 mt-4" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Text className="text-5xl block mb-3">📭</Text>}
          title="暂无消息"
          description="订单支付成功、佣金到账、退款结果、提现进度都会在这里通知"
        />
      ) : (
        <View className="py-3">
          {list.map(n => {
            const meta = TYPE_META[n.type] ?? { icon: '🔔', color: 'muted-foreground', label: '其他' }
            const accent = cvar(meta.color)
            const unreadFlag = !n.read_at
            return (
              <View
                key={n.id}
                onClick={() => openDetail(n)}
                style={{
                  margin: '8px 12px', padding: '14px 16px',
                  background: unreadFlag ? 'hsl(var(--primary) / 0.06)' : 'hsl(var(--card))',
                  border: `1px solid ${unreadFlag ? 'hsl(var(--primary) / 0.45)' : 'hsl(var(--border))'}`,
                  borderRadius: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: `${accent} / 0.13`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: 'hsl(var(--foreground))', fontSize: 15, fontWeight: unreadFlag ? 700 : 500 }}>{n.title}</Text>
                    {unreadFlag && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, background: accent, flexShrink: 0, marginLeft: 8 }} />
                    )}
                  </View>
                  <Text style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13, lineHeight: 1.5, display: 'block', marginBottom: 4 }} numberOfLines={2}>
                    {n.body}
                  </Text>
                  <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: accent, fontSize: 11, padding: '1px 6px', background: `${accent} / 0.12`, borderRadius: 4 }}>
                      {meta.label}
                    </Text>
                    <Text style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>{formatRelativeTime(n.created_at)}</Text>
                    {!n.sent_at && (
                      <Text style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>· 未推送</Text>
                    )}
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}
