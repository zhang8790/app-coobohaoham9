// @title 消息中心
// @description 展示用户全部业务通知（订单/佣金/退款/提现/公告）
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'

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

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  order_paid:         { icon: '🛒', color: '#10B981', label: '订单' },
  commission_arrived: { icon: '💰', color: '#F59E0B', label: '佣金' },
  withdraw_progress:  { icon: '💸', color: '#3B82F6', label: '提现' },
  refund_result:      { icon: '↩',  color: '#EF4444', label: '退款' },
  announcement:       { icon: '📢', color: '#A8552E', label: '公告' },
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}天前`
  return d.toLocaleDateString('zh-CN')
}

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
      <View style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
        登录后查看消息
      </View>
    )
  }

  return (
    <ScrollView scrollY style={{ minHeight: '100vh', background: '#0B0F19' }}>
      {/* Header */}
      <View style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#080C14', borderBottom: '1px solid #1F2937' }}>
        <View>
          <Text style={{ color: '#E5E7EB', fontSize: 20, fontWeight: 700 }}>消息中心</Text>
          <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2, display: 'block' }}>
            {unread > 0 ? `未读 ${unread} 条` : '全部已读'}
          </Text>
        </View>
        {unread > 0 && (
          <View onClick={markAllRead} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #374151', borderRadius: 16 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>全部已读</Text>
          </View>
        )}
      </View>

      {/* List */}
      {loading && list.length === 0 ? (
        <View style={{ padding: '60px 0', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>加载中…</View>
      ) : list.length === 0 ? (
        <View style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Text style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>📭</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 14, display: 'block' }}>暂无消息</Text>
          <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 8, display: 'block' }}>
            订单支付成功、佣金到账、退款结果、提现进度都会在这里通知
          </Text>
        </View>
      ) : (
        <View style={{ padding: '12px 0' }}>
          {list.map(n => {
            const meta = TYPE_META[n.type] ?? { icon: '🔔', color: '#6B7280', label: '其他' }
            const unread = !n.read_at
            return (
              <View
                key={n.id}
                onClick={() => openDetail(n)}
                style={{
                  margin: '8px 12px', padding: '14px 16px',
                  background: unread ? '#1F293722' : '#0F172A',
                  border: `1px solid ${unread ? meta.color + '66' : '#1F2937'}`,
                  borderRadius: 10, display: 'flex', gap: 12, alignItems: 'flex-start',
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#E5E7EB', fontSize: 15, fontWeight: unread ? 700 : 500 }}>{n.title}</Text>
                    {unread && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, background: meta.color, flexShrink: 0, marginLeft: 8 }} />
                    )}
                  </View>
                  <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.5, display: 'block', marginBottom: 4 }} numberOfLines={2}>
                    {n.body}
                  </Text>
                  <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: meta.color, fontSize: 11, padding: '1px 6px', background: meta.color + '15', borderRadius: 4 }}>
                      {meta.label}
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 11 }}>{formatTime(n.created_at)}</Text>
                    {!n.sent_at && (
                      <Text style={{ color: '#6B7280', fontSize: 11 }}>· 未推送</Text>
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
