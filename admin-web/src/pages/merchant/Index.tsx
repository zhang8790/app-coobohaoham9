// @title 商家中心 - 店铺概况
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Mock 数据
const MOCK_STATS = {
  todayRevenue: 1280.50,
  monthRevenue: 38620.00,
  todayOrders: 23,
  totalCustomers: 456,
  pendingOrders: 5,
  pendingWithdraw: 3200.00,
}

const MOCK_RECENT_ORDERS = [
  { id: '1001', product_name: '手工桂花糕', quantity: 2, price: 39.8, status: 'pending_ship', created_at: '2026-06-30 14:20' },
  { id: '1002', product_name: '芝麻汤圆', quantity: 1, price: 28.0, status: 'pending_receive', created_at: '2026-06-30 13:45' },
  { id: '1003', product_name: '红糖糍粑', quantity: 3, price: 45.0, status: 'completed', created_at: '2026-06-30 12:30' },
  { id: '1004', product_name: '手工桂花糕', quantity: 1, price: 19.9, status: 'completed', created_at: '2026-06-30 11:15' },
  { id: '1005', product_name: '豆沙青团', quantity: 2, price: 35.6, status: 'refund', created_at: '2026-06-30 10:00' },
]

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待付款',
  pending_ship: '待发货',
  pending_receive: '待收货',
  completed: '已完成',
  refund: '退款中',
  cancelled: '已取消',
}

const STATUS_COLOR: Record<string, string> = {
  pending_pay: '#F59E0B',
  pending_ship: '#C2410C',
  pending_receive: '#3B82F6',
  completed: '#059669',
  refund: '#EF4444',
  cancelled: '#6B7280',
}

export default function MerchantDashboard() {
  const nav = useNavigate()
  const [stats] = useState(MOCK_STATS)
  const [recentOrders] = useState(MOCK_RECENT_ORDERS)

  const cards = [
    { label: '今日营收', value: `¥${stats.todayRevenue.toFixed(2)}`, icon: '💰', color: '#059669' },
    { label: '本月营收', value: `¥${(stats.monthRevenue / 10000).toFixed(2)}万`, icon: '📈', color: '#3B82F6' },
    { label: '今日订单', value: stats.todayOrders, icon: '📦', color: '#C2410C' },
    { label: '累积客户', value: stats.totalCustomers, icon: '👥', color: '#7C3AED' },
  ]

  return (
    <div>
      {/* 页面标题 */}
      <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>店铺概况</h2>

      {/* 核心指标卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{c.icon}</span>
              <span style={{ color: '#6B7280', fontSize: 13 }}>{c.label}</span>
            </div>
            <p style={{ color: c.color, fontSize: 28, fontWeight: 800 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 32 }}>
        {[
          { label: '商品管理', icon: '📦', to: '/merchant/settings' },
          { label: '订单管理', icon: '📋', to: '/merchant/orders' },
          { label: '优惠券', icon: '🎟️', to: '/merchant/coupons' },
          { label: '数据分析', icon: '📊', to: '/merchant/analytics' },
          { label: '广告投放', icon: '📢', to: '/merchant/ads' },
          { label: '佣金提现', icon: '💰', to: '/merchant/withdraw' },
        ].map((btn, i) => (
          <div key={i}
            onClick={() => nav(btn.to)}
            style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all 0.2s', hover: { borderColor: '#059669' } }}
          >
            <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>{btn.icon}</span>
            <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>{btn.label}</p>
          </div>
        ))}
      </div>

      {/* 待处理事项 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>⚠️ 待处理</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>待发货订单</span>
              <span style={{ color: '#C2410C', fontSize: 20, fontWeight: 800 }}>{stats.pendingOrders}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>可提现佣金</span>
              <span style={{ color: '#059669', fontSize: 20, fontWeight: 800 }}>¥{stats.pendingWithdraw.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📈 今日数据</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>访客数</span>
              <span style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>128</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>浏览量</span>
              <span style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>456</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>转化率</span>
              <span style={{ color: '#059669', fontSize: 18, fontWeight: 700 }}>17.9%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 最新订单 */}
      <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>📋 最新订单</h3>
          <button onClick={() => nav('/merchant/orders')} style={{ background: 'transparent', border: 'none', color: '#059669', cursor: 'pointer', fontSize: 13 }}>查看全部 →</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentOrders.map(order => (
            <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#0B0F19', borderRadius: 8 }}>
              <div>
                <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>{order.product_name} x{order.quantity}</p>
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{order.created_at}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 700 }}>¥{order.price}</p>
                <span style={{ color: STATUS_COLOR[order.status], fontSize: 12, fontWeight: 600 }}>{STATUS_LABEL[order.status]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
