// @title 健康豆兑换
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { getMyBalance, getProducts } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'

interface ExchangeItem {
  id: string
  title: string
  cost: number
  icon: string
  stock: string
  type: 'coupon' | 'product' | 'service'
}

const EXCHANGE_ITEMS: ExchangeItem[] = [
  { id: 'c1', title: '满50减5优惠券', cost: 500, icon: '🎫', stock: '限量100份', type: 'coupon' },
  { id: 'c2', title: '满100减12优惠券', cost: 1000, icon: '🎟️', stock: '限量50份', type: 'coupon' },
  { id: 'c3', title: '免邮券', cost: 300, icon: '📦', stock: '限量200份', type: 'coupon' },
  { id: 'c4', title: '食养专属食谱', cost: 200, icon: '📖', stock: '长期有效', type: 'service' },
  { id: 'p1', title: '当季养生茶包', cost: 800, icon: '🍵', stock: '限量30份', type: 'product' },
  { id: 'p2', title: '儿童零食尝鲜包', cost: 600, icon: '🍪', stock: '限量20份', type: 'product' },
]

export default function BeanExchange() {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    getMyBalance().then(b => { setBalance(b.tb_balance || 0) }).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  const handleExchange = (item: ExchangeItem) => {
    if (balance < item.cost) {
      Taro.showToast({ title: `还差${item.cost - balance}健康豆`, icon: 'none' })
      return
    }
    Taro.showModal({
      title: '确认兑换',
      content: `用 ${item.cost} 健康豆兑换「${item.title}」？`,
      success: (res) => {
        if (res.confirm) {
          Taro.showToast({ title: '兑换成功！', icon: 'success' })
          setBalance(b => Math.max(0, b - item.cost))
        }
      },
    })
  }

  if (loading) {
    return <View style={page}><View style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Text>加载中…</Text></View></View>
  }

  return (
    <ScrollView style={page} scrollY>
      {/* 余额卡片 */}
      <View style={headerCard}>
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.8 }}>我的健康豆</Text>
        <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff', marginTop: 4 }}>{balance}</Text>
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.7, marginTop: 2 }}>
          1健康豆 = 1元 · 签到、分享、购物均可获得
        </Text>
      </View>

      {/* 兑换列表 */}
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12, paddingLeft: 4 }}>🔄 兑换专区</Text>
      {EXCHANGE_ITEMS.map((item) => (
        <View key={item.id} style={exchangeCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <Text style={{ fontSize: 28 }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }}>{item.title}</Text>
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.stock}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'center', flexShrink: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#d4a537' }}>{item.cost}</Text>
            <Text style={{ fontSize: 10, color: '#94a3b8' }}>健康豆</Text>
            <View
              style={{
                marginTop: 6, background: balance >= item.cost ? 'linear-gradient(135deg,#d4a537,#b8860b)' : '#e5e7eb',
                borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14,
              }}
              onClick={() => handleExchange(item)}
            >
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: balance >= item.cost ? '#fff' : '#94a3b8',
              }}>{balance >= item.cost ? '立即兑换' : '豆不足'}</Text>
            </View>
          </View>
        </View>
      ))}

      <View style={{ height: 24 }} />
      <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 20, display: 'block' }}>
        更多兑换品陆续上架，敬请期待
      </Text>
    </ScrollView>
  )
}

const page: React.CSSProperties = { minHeight: '100vh', background: '#f8fafc', padding: 16, boxSizing: 'border-box' }
const headerCard: React.CSSProperties = { background: 'linear-gradient(135deg,#b8860b,#d4a537)', borderRadius: 16, padding: 20, marginBottom: 20 }
const exchangeCard: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
}
