// @title 自营门店中心 - 消息通知（真实数据）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore, getMerchantMessages } from '@/api/merchant'
import type { MerchantMessage } from '@/types'

const TYPE_ICON: Record<string, string> = { order: '📦', system: '⚙️', commission: '💰' }
const TYPE_LABEL: Record<string, string> = { order: '订单消息', system: '系统消息', commission: '佣金消息' }

export default function MerchantMessages() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<MerchantMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'order' | 'system' | 'commission'>('all')
  const [detailMsg, setDetailMsg] = useState<MerchantMessage | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      const list = await getMerchantMessages(store.id, profile.id).catch(() => [])
      if (!cancelled) { setMessages(list); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [profile])

  const filtered = filter === 'all' ? messages : messages.filter(m => m.type === filter)
  const unreadCount = messages.filter(m => !m.read).length

  const markAsRead = (id: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
  const markAllRead = () => setMessages(prev => prev.map(m => ({ ...m, read: true })))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700 }}> 消息通知 {unreadCount > 0 && <span style={{ color: 'var(--danger)', fontSize: 14 }}>（{unreadCount}条未读）</span>}</h2>
        <button onClick={markAllRead} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>全部已读</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}
      {!loading && !storeId && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>未找到关联门店</div>}

      {!loading && storeId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[{ key: 'all', label: '全部' }, { key: 'order', label: '订单' }, { key: 'system', label: '系统' }, { key: 'commission', label: '佣金' }].map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key as any)} style={{
                padding: '6px 14px',
                background: filter === tab.key ? 'var(--primary)' : 'var(--surface-2)',
                border: `1px solid ${filter === tab.key ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 6,
                color: filter === tab.key ? 'white' : 'var(--text-muted)',
                fontSize: 13,
                cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>暂无消息</div>
            ) : filtered.map(msg => (
              <div key={msg.id} onClick={() => { markAsRead(msg.id); setDetailMsg(msg) }} style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
                borderLeft: msg.read ? '3px solid transparent' : '3px solid var(--primary)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{TYPE_ICON[msg.type]}</span>
                    <span style={{ color: msg.read ? 'var(--text)' : 'var(--primary)', fontSize: 15, fontWeight: msg.read ? 600 : 700 }}>{msg.title}</span>
                    {!msg.read && <span style={{ width: 8, height: 8, background: 'var(--primary)', borderRadius: '50%' }} />}
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{msg.time}</span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>{msg.content}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {detailMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setDetailMsg(null)}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>{detailMsg.title}</h3>
              <button onClick={() => setDetailMsg(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>{TYPE_ICON[detailMsg.type]}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{TYPE_LABEL[detailMsg.type]}</span>
              <span style={{ color: 'var(--border-soft)' }}>·</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{detailMsg.time}</span>
            </div>
            <p style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.6 }}>{detailMsg.content}</p>
            <button onClick={() => setDetailMsg(null)} style={{ width: '100%', marginTop: 20, padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
