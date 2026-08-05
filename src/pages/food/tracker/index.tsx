// @title 食品管家（保质期追踪）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface ExpiryItem {
  id: string
  product_name: string
  product_id: string
  image_url: string | null
  expire_at: string | null
  status: 'normal' | 'expiring' | 'expired'
  days_left: number
}

export default function FoodTracker() {
  const { user } = useAuth()
  const [items, setItems] = useState<ExpiryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        // 1) 当前用户的已完成订单（orders 仅存订单维度，无商品列）
        const { data: orders, error: oErr } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'completed')
        if (oErr) { console.error('[食品管家] 订单查询失败', oErr); if (!cancelled) setLoading(false); return }
        if (!orders || orders.length === 0) { if (!cancelled) { setItems([]); setLoading(false) } return }
        const orderIds = (orders as any[]).map((o) => o.id)

        // 2) 订单商品明细（商品信息在 order_items，不在 orders）
        const { data: lineItems, error: iErr } = await supabase
          .from('order_items')
          .select('product_id, product_name, product_image')
          .in('order_id', orderIds)
        if (iErr) { console.error('[食品管家] 明细查询失败', iErr); if (!cancelled) setLoading(false); return }
        if (!lineItems || lineItems.length === 0) { if (!cancelled) { setItems([]); setLoading(false) } return }

        // 同一商品多次购买只列一条
        const uniqueMap = new Map<string, any>()
        for (const li of lineItems as any[]) {
          if (li.product_id && !uniqueMap.has(li.product_id)) uniqueMap.set(li.product_id, li)
        }
        const uniqueItems = [...uniqueMap.values()]
        const productIds = uniqueItems.map((i: any) => i.product_id)

        // 3) 批次保质期（尽力而为，失败不影响列表展示）
        const batchMap: Record<string, string> = {}
        if (productIds.length) {
          try {
            const { data: batches } = await supabase
              .from('stock_batches')
              .select('product_id, expire_at')
              .in('product_id', productIds)
            for (const b of (batches || []) as any[]) {
              if (!b.expire_at) continue
              const pid = String(b.product_id)
              // 取最早到期（最保守，便于提前预警）
              if (!batchMap[pid] || b.expire_at < batchMap[pid]) batchMap[pid] = b.expire_at
            }
          } catch (e) { console.warn('[食品管家] 批次查询失败（不影响列表）', e) }
        }

        const now = new Date()
        const result: ExpiryItem[] = uniqueItems.map((li: any) => {
          const expireAt = batchMap[String(li.product_id)] || null
          const expireDate = expireAt ? new Date(expireAt) : null
          const daysLeft = expireDate ? Math.ceil((expireDate.getTime() - now.getTime()) / 86400000) : 999
          let status: ExpiryItem['status'] = 'normal'
          if (daysLeft <= 0) status = 'expired'
          else if (daysLeft <= 7) status = 'expiring'

          return {
            id: li.product_id,
            product_name: li.product_name || '未知商品',
            product_id: li.product_id,
            image_url: li.product_image || null,
            expire_at: expireAt,
            status,
            days_left: daysLeft,
          }
        }).sort((a, b) => {
          const order = { expired: 0, expiring: 1, normal: 2 }
          return order[a.status] - order[b.status]
        })

        if (!cancelled) { setItems(result); setLoading(false) }
      } catch (e) {
        console.error('[食品管家] 加载异常', e)
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  if (loading) {
    return <View style={page}><View style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Text>加载中…</Text></View></View>
  }

  const expiringCount = items.filter(i => i.status === 'expiring').length
  const expiredCount = items.filter(i => i.status === 'expired').length

  return (
    <ScrollView style={page} scrollY>
      {/* 头部概览 */}
      <View style={headerCard}>
        <Text style={{ fontSize: 14, color: '#fff', opacity: 0.9 }}>🍱 食品管家</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 4 }}>
          {items.length}
        </Text>
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.7 }}>件已购商品</Text>
        {(expiringCount > 0 || expiredCount > 0) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {expiredCount > 0 && (
              <View style={{ background: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>⚠ {expiredCount}件已过期</Text>
              </View>
            )}
            {expiringCount > 0 && (
              <View style={{ background: 'rgba(249,115,22,0.3)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>⏰ {expiringCount}件临期</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 商品列表 */}
      {items.length === 0 ? (
        <View style={emptyCard}>
          <Text style={{ fontSize: 40, display: 'block', textAlign: 'center' }}>📦</Text>
          <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 8, textAlign: 'center', display: 'block' }}>
            还没有购买商品，去逛一逛吧～
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={itemCard}
            onClick={() => {
              if (item.product_id) {
                Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(item.product_id)}` })
              }
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 10, background: '#f1f5f9',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 20 }}>{item.status === 'expired' ? '🗑' : item.status === 'expiring' ? '⏰' : '✅'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }} numberOfLines={1}>{item.product_name}</Text>
                <Text style={{ fontSize: 12, color: STATUS_COLORS[item.status].fg || '#94a3b8', marginTop: 2 }}>
                  {item.status === 'expired' ? `已过期 ${Math.abs(item.days_left)} 天`
                    : item.status === 'expiring' ? `临期 · 剩${item.days_left}天`
                    : item.expire_at ? `保质期内 · 约${Math.max(1, Math.round(item.days_left / 30))}个月`
                    : '暂无保质期信息'}
                </Text>
              </View>
            </View>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: STATUS_COLORS[item.status].fg,
              background: STATUS_COLORS[item.status].bg, borderRadius: 8,
              paddingVertical: 4, paddingHorizontal: 10,
            }}>
              {STATUS_COLORS[item.status].label}
            </Text>
          </View>
        ))
      )}

      <View style={{ height: 24 }} />
      <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 20, display: 'block' }}>
        以上信息基于购买批次的保质期估算，请以实物包装为准
      </Text>
    </ScrollView>
  )
}

const STATUS_COLORS: Record<string, { label: string; fg: string; bg: string }> = {
  normal: { label: '正常', fg: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
  expiring: { label: '临期', fg: '#ea580c', bg: 'rgba(249,115,22,0.10)' },
  expired: { label: '已过期', fg: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
}

const page: React.CSSProperties = { minHeight: '100vh', background: '#f8fafc', padding: 16, boxSizing: 'border-box' }
const headerCard: React.CSSProperties = { background: 'linear-gradient(135deg,#0f766e,#14b8a6)', borderRadius: 16, padding: 20, marginBottom: 14 }
const emptyCard: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 32, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }
const itemCard: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', flexDirection: 'row',
  alignItems: 'center', justifyContent: 'space-between',
}
