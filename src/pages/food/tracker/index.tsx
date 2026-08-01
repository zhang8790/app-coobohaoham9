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
    supabase.from('orders')
      .select('id, product_id, product_name, product_image, created_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(async ({ data: orders }) => {
        if (!orders?.length) { setItems([]); setLoading(false); return }

        const productIds = [...new Set(orders.map((o: any) => o.product_id))]
        // 拉取批次信息（保质期）
        const { data: batches } = await supabase
          .from('stock_batches')
          .select('product_id, expire_at')
          .in('product_id', productIds)
          .eq('is_active', true)
          .order('expire_at', { ascending: true })

        const batchMap: Record<string, string> = {}
        for (const b of (batches || [])) {
          if (!batchMap[b.product_id] || b.expire_at < batchMap[b.product_id]) {
            batchMap[b.product_id] = b.expire_at
          }
        }

        const result: ExpiryItem[] = orders.map((o: any) => {
          const expireAt = batchMap[o.product_id]
          const now = new Date()
          const expireDate = expireAt ? new Date(expireAt) : null
          const daysLeft = expireDate ? Math.ceil((expireDate.getTime() - now.getTime()) / 86400000) : 999
          let status: ExpiryItem['status'] = 'normal'
          if (daysLeft <= 0) status = 'expired'
          else if (daysLeft <= 7) status = 'expiring'

          return {
            id: o.id,
            product_name: o.product_name || '未知商品',
            product_id: o.product_id,
            image_url: o.product_image || null,
            expire_at: expireAt,
            status,
            days_left: daysLeft,
          }
        }).sort((a, b) => {
          const order = { expired: 0, expiring: 1, normal: 2 }
          return order[a.status] - order[b.status]
        })

        setItems(result)
        setLoading(false)
      }).catch(() => setLoading(false))
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
                    : `保质期内 · 约${Math.max(1, Math.round(item.days_left / 30))}个月`}
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
