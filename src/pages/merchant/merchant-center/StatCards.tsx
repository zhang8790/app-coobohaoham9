// 商家中心：经营概览四宫格（专业仪表盘 KPI，纯展示）
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'

interface Stats {
  products: number
  online: number
  orders: number
  todayOrders: number
  members: number
  crossStore: number
}

const ITEMS = [
  { key: 'todayOrders', label: '今日订单', icon: 'receipt-text', color: '#3F6B43' },
  { key: 'online', label: '在售商品', icon: 'box', color: '#B5793B' },
  { key: 'orders', label: '累计订单', icon: 'chart', color: '#4A6FA5' },
  { key: 'members', label: '会员', icon: 'user', color: '#8A6DBF' },
] as const

export default function StatCards({ stats }: { stats: Stats }) {
  const values: Record<string, number> = {
    todayOrders: stats.todayOrders,
    online: stats.online,
    orders: stats.orders,
    members: stats.members,
  }
  return (
    <View
      className="mx-4 bg-card rounded-2xl border border-border"
      style={{ marginTop: '-16px', position: 'relative', zIndex: 2, padding: '16px 8px' }}>
      <View style={{ flexDirection: 'row' }}>
        {ITEMS.map((it, idx) => (
          <View
            key={it.key}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: '4px',
              borderLeftWidth: idx === 0 ? 0 : '1px',
              borderLeftColor: 'rgba(148,163,184,0.18)',
            }}>
            <View
              style={{
                width: '44px', height: '44px', borderRadius: '14px',
                backgroundColor: `${it.color}14`, alignItems: 'center', justifyContent: 'center',
                marginBottom: '8px',
              }}>
              <Icon name={it.icon} size={22} style={{ color: it.color }} />
            </View>
            <Text style={{ fontSize: '38rpx', fontWeight: 'bold', color: '#2A2A2A' }}>{values[it.key] ?? 0}</Text>
            <Text style={{ fontSize: '22rpx', color: '#8A8A8A', marginTop: '2px' }}>{it.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
