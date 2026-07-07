// @title 商家中心 - 订单管理
import { useState } from 'react'

interface MockOrderItem {
  id: string
  product_id: string
  product_name: string
  product_image: string
  quantity: number
  price: number
  store_id: string
  orders: {
    id: string
    order_no: string
    status: string
    total_amount: number
    created_at: string
    buyer_phone: string
    delivery_type: string
    address: string
  }
}

const MOCK_ORDERS: MockOrderItem[] = [
  { id: '1', product_id: 'p1', product_name: '手工桂花糕', product_image: '', quantity: 2, price: 39.8, store_id: 's1', orders: { id: 'o1', order_no: 'LD202606300001', status: 'pending_ship', total_amount: 79.6, created_at: '2026-06-30T14:20:00', buyer_phone: '138****8000', delivery_type: 'delivery', address: '杭州市西湖区xx路xx号' } },
  { id: '2', product_id: 'p2', product_name: '芝麻汤圆', product_image: '', quantity: 1, price: 28.0, store_id: 's1', orders: { id: 'o2', order_no: 'LD202606300002', status: 'pending_receive', total_amount: 28.0, created_at: '2026-06-30T13:45:00', buyer_phone: '139****9000', delivery_type: 'delivery', address: '杭州市上城区xx路xx号' } },
  { id: '3', product_id: 'p3', product_name: '红糖糍粑', product_image: '', quantity: 3, price: 45.0, store_id: 's1', orders: { id: 'o3', order_no: 'LD202606300003', status: 'pending_pickup', total_amount: 45.0, created_at: '2026-06-30T12:30:00', buyer_phone: '137****7000', delivery_type: 'pickup', address: '' } },
  { id: '4', product_id: 'p1', product_name: '手工桂花糕', product_image: '', quantity: 1, price: 19.9, store_id: 's1', orders: { id: 'o4', order_no: 'LD202606300004', status: 'completed', total_amount: 19.9, created_at: '2026-06-30T11:15:00', buyer_phone: '136****6000', delivery_type: 'pickup', address: '' } },
  { id: '5', product_id: 'p4', product_name: '豆沙青团', product_image: '', quantity: 2, price: 35.6, store_id: 's1', orders: { id: 'o5', order_no: 'LD202606300005', status: 'refund', total_amount: 35.6, created_at: '2026-06-30T10:00:00', buyer_phone: '135****5000', delivery_type: 'delivery', address: '杭州市拱墅区xx路xx号' } },
]

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending_pay', label: '待付款' },
  { key: 'pending_ship', label: '待发货' },
  { key: 'pending_receive', label: '待收货' },
  { key: 'pending_pickup', label: '待核销' },
  { key: 'completed', label: '已完成' },
  { key: 'refund', label: '退款' },
]

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待付款',
  pending_ship: '待发货',
  pending_receive: '待收货',
  pending_pickup: '待核销',
  completed: '已完成',
  refund: '退款中',
  cancelled: '已取消',
}

const STATUS_COLOR: Record<string, string> = {
  pending_pay: '#F59E0B',
  pending_ship: '#C2410C',
  pending_receive: '#3B82F6',
  pending_pickup: '#8B5CF6',
  completed: '#059669',
  refund: '#EF4444',
  cancelled: '#6B7280',
}

export default function MerchantOrders() {
  const [activeTab, setActiveTab] = useState('all')
  const [orders] = useState(MOCK_ORDERS)
  const [, setDetailOrder] = useState<typeof MOCK_ORDERS[0] | null>(null)
  const [shipModal, setShipModal] = useState<typeof MOCK_ORDERS[0] | null>(null)
  const [shipCompany, setShipCompany] = useState('')
  const [shipNo, setShipNo] = useState('')

  const filtered = activeTab === 'all' ? orders : orders.filter(o => o.orders.status === activeTab)

  const handleShip = () => {
    if (!shipCompany || !shipNo) return
    setShipModal(null)
    setShipCompany('')
    setShipNo('')
  }

  const handleVerify = (order: typeof MOCK_ORDERS[0]) => {
    alert(`核销订单 ${order.orders.order_no} 成功！`)
  }

  return (
    <div>
      <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>📦 订单管理</h2>

      {/* 状态 Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.key ? '#059669' : '#111827',
              border: `1px solid ${activeTab === tab.key ? '#059669' : '#1F2937'}`,
              borderRadius: 8,
              color: activeTab === tab.key ? 'white' : '#9CA3AF',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 订单列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6B7280', fontSize: 14 }}>暂无订单</div>
        ) : (
          filtered.map(order => (
            <div key={order.id} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
              {/* 订单头部 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#6B7280', fontSize: 13 }}>订单号：{order.orders.order_no}</span>
                <span style={{ color: STATUS_COLOR[order.orders.status], fontSize: 14, fontWeight: 700 }}>{STATUS_LABEL[order.orders.status]}</span>
              </div>

              {/* 商品信息 */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 64, height: 64, background: '#1F2937', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#374151', fontSize: 24 }}>📦</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#E5E7EB', fontSize: 15, fontWeight: 600 }}>{order.product_name}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>x{order.quantity} · ¥{order.price}</p>
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>
                    {order.orders.delivery_type === 'delivery' ? '🚚 外卖配送' : '🏪 到店自取'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>¥{order.orders.total_amount?.toFixed(2)}</p>
                </div>
              </div>

              {/* 收货信息 */}
              {order.orders.address && (
                <div style={{ padding: '8px 12px', background: '#0B0F19', borderRadius: 6, marginBottom: 12 }}>
                  <p style={{ color: '#9CA3AF', fontSize: 12 }}>📍 {order.orders.address}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>📞 {order.orders.buyer_phone}</p>
                </div>
              )}

              {/* 操作按钮 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {order.orders.status === 'pending_ship' && (
                  <button
                    onClick={() => setShipModal(order)}
                    style={{ padding: '8px 16px', background: '#059669', border: 'none', borderRadius: 6, color: 'white', fontSize: 13, cursor: 'pointer' }}
                  >
                    发货
                  </button>
                )}
                {order.orders.status === 'pending_pickup' && (
                  <button
                    onClick={() => handleVerify(order)}
                    style={{ padding: '8px 16px', background: '#8B5CF6', border: 'none', borderRadius: 6, color: 'white', fontSize: 13, cursor: 'pointer' }}
                  >
                    核销
                  </button>
                )}
                <button
                  onClick={() => setDetailOrder(order)}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', fontSize: 13, cursor: 'pointer' }}
                >
                  详情
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 发货弹窗 */}
      {shipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShipModal(null)}>
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 16, padding: 24, width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>📦 发货</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>物流公司 *</label>
                <select
                  value={shipCompany}
                  onChange={e => setShipCompany(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                >
                  <option value="">请选择</option>
                  <option value="顺丰">顺丰</option>
                  <option value="圆通">圆通</option>
                  <option value="中通">中通</option>
                  <option value="申通">申通</option>
                  <option value="韵达">韵达</option>
                  <option value="京东">京东</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>物流单号 *</label>
                <input
                  value={shipNo}
                  onChange={e => setShipNo(e.target.value)}
                  placeholder="请输入物流单号"
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShipModal(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #374151', borderRadius: 8, color: '#9CA3AF', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={() => handleShip()} style={{ flex: 1, padding: '10px', background: '#059669', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>确认发货</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
