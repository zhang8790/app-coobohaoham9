// @title 商家中心 - 消息通知
import { useState } from 'react'

const MOCK_MESSAGES = [
  { id: 'm1', type: 'order', title: '新订单通知', content: '您有一笔新订单 LD202606300001，请及时发货', time: '2026-06-30 14:20', read: false },
  { id: 'm2', type: 'order', title: '订单退款申请', content: '订单 LD202606300005 申请退款，请及时处理', time: '2026-06-30 10:05', read: false },
  { id: 'm3', type: 'system', title: '平台通知', content: '来店有喜平台将于7月1日凌晨2:00-4:00进行系统升级，届时可能影响下单', time: '2026-06-29 18:00', read: true },
  { id: 'm4', type: 'commission', title: '佣金到账', content: '您的佣金 ¥128.50 已到账，可前往提现', time: '2026-06-29 12:00', read: true },
  { id: 'm5', type: 'order', title: '订单已完成', content: '订单 LD202606300003 已完成，客户已确认收货', time: '2026-06-29 10:30', read: true },
]

const TYPE_ICON: Record<string, string> = { order: '📦', system: '⚙️', commission: '💰' }
const TYPE_LABEL: Record<string, string> = { order: '订单消息', system: '系统消息', commission: '佣金消息' }

export default function MerchantMessages() {
  const [messages, setMessages] = useState(MOCK_MESSAGES)
  const [filter, setFilter] = useState<'all' | 'order' | 'system' | 'commission'>('all')
  const [detailMsg, setDetailMsg] = useState<typeof MOCK_MESSAGES[0] | null>(null)

  const filtered = filter === 'all' ? messages : messages.filter(m => m.type === filter)
  const unreadCount = messages.filter(m => !m.read).length

  const markAsRead = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
  }

  const markAllRead = () => {
    setMessages(prev => prev.map(m => ({ ...m, read: true })))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700 }}>🔔 消息通知 {unreadCount > 0 && <span style={{ color: '#EF4444', fontSize: 14 }}>（{unreadCount}条未读）</span>}</h2>
        <button
          onClick={markAllRead}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', fontSize: 13, cursor: 'pointer' }}
        >
          全部已读
        </button>
      </div>

      {/* 筛选 Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'all', label: '全部' },
          { key: 'order', label: '订单' },
          { key: 'system', label: '系统' },
          { key: 'commission', label: '佣金' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            style={{
              padding: '6px 14px',
              background: filter === tab.key ? '#C2410C' : '#111827',
              border: `1px solid ${filter === tab.key ? '#C2410C' : '#1F2937'}`,
              borderRadius: 6,
              color: filter === tab.key ? 'white' : '#9CA3AF',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 消息列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6B7280', fontSize: 14 }}>暂无消息</div>
        ) : (
          filtered.map(msg => (
            <div
              key={msg.id}
              onClick={() => { markAsRead(msg.id); setDetailMsg(msg) }}
              style={{
                background: '#111827',
                border: '1px solid #1F2937',
                borderRadius: 12,
                padding: '16px 20px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
                borderLeft: msg.read ? '3px solid transparent' : '3px solid #C2410C',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{TYPE_ICON[msg.type]}</span>
                  <span style={{ color: msg.read ? '#E5E7EB' : '#C2410C', fontSize: 15, fontWeight: msg.read ? 600 : 700 }}>{msg.title}</span>
                  {!msg.read && <span style={{ width: 8, height: 8, background: '#C2410C', borderRadius: '50%' }} />}
                </div>
                <span style={{ color: '#6B7280', fontSize: 12 }}>{msg.time}</span>
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 14, lineHeight: 1.5 }}>{msg.content}</p>
            </div>
          ))
        )}
      </div>

      {/* 消息详情弹窗 */}
      {detailMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setDetailMsg(null)}>
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 16, padding: 24, width: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>{detailMsg.title}</h3>
              <button onClick={() => setDetailMsg(null)} style={{ background: 'transparent', border: 'none', color: '#6B7280', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>{TYPE_ICON[detailMsg.type]}</span>
              <span style={{ color: '#6B7280', fontSize: 13 }}>{TYPE_LABEL[detailMsg.type]}</span>
              <span style={{ color: '#374151' }}>·</span>
              <span style={{ color: '#6B7280', fontSize: 13 }}>{detailMsg.time}</span>
            </div>
            <p style={{ color: '#E5E7EB', fontSize: 15, lineHeight: 1.6 }}>{detailMsg.content}</p>
            <button
              onClick={() => setDetailMsg(null)}
              style={{ width: '100%', marginTop: 20, padding: '10px', background: '#C2410C', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
