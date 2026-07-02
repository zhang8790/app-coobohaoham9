// @title 商家中心 - 优惠券管理
import { useState } from 'react'

const MOCK_COUPONS = [
  { id: 'c1', name: '新客立减5元', type: 'fixed', amount: 5, min_amount: 0, total: 100, used: 23, start_date: '2026-06-01', end_date: '2026-07-31', status: 'online' },
  { id: 'c2', name: '满50减10元', type: 'fixed', amount: 10, min_amount: 50, total: 200, used: 89, start_date: '2026-06-15', end_date: '2026-07-15', status: 'online' },
  { id: 'c3', name: '9折优惠', type: 'percent', amount: 10, min_amount: 30, total: 50, used: 50, start_date: '2026-06-01', end_date: '2026-06-30', status: 'offline' },
  { id: 'c4', name: '满100减20元', type: 'fixed', amount: 20, min_amount: 100, total: 50, used: 0, start_date: '2026-07-01', end_date: '2026-08-31', status: 'offline' },
]

export default function MerchantCoupons() {
  const [coupons] = useState(MOCK_COUPONS)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')

  const filtered = filter === 'all' ? coupons : coupons.filter(c => c.status === filter)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700 }}>🎟️ 优惠券管理</h2>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '10px 20px', background: '#059669', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>+</span> 新建优惠券
        </button>
      </div>

      {/* 筛选 Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'all', label: '全部' },
          { key: 'online', label: '在线' },
          { key: 'offline', label: '离线' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            style={{
              padding: '6px 14px',
              background: filter === tab.key ? '#059669' : '#111827',
              border: `1px solid ${filter === tab.key ? '#059669' : '#1F2937'}`,
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

      {/* 优惠券列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {filtered.map(coupon => (
          <div key={coupon.id} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden' }}>
            {/* 状态标签 */}
            <div style={{
              position: 'absolute', top: 0, right: 0,
              padding: '4px 12px',
              background: coupon.status === 'online' ? '#059669' : '#374151',
              borderBottomLeftRadius: 8,
              color: 'white',
              fontSize: 12,
              fontWeight: 600,
            }}>
              {coupon.status === 'online' ? '在线' : '离线'}
            </div>

            {/* 优惠券面值 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div style={{
                width: 80, height: 80,
                background: coupon.status === 'online' ? 'linear-gradient(135deg, #C2410C, #EA580C)' : '#1F2937',
                borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ color: 'white', fontSize: 10, fontWeight: 600 }}>¥</span>
                <span style={{ color: 'white', fontSize: 28, fontWeight: 800 }}>{coupon.amount}</span>
              </div>
              <div>
                <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{coupon.name}</p>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
                  {coupon.type === 'fixed' ? '满减券' : '折扣券'}
                  {coupon.min_amount > 0 && ` · 满${coupon.min_amount}元可用`}
                </p>
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{coupon.start_date} ~ {coupon.end_date}</p>
              </div>
            </div>

            {/* 发放情况 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #1F2937', borderBottom: '1px solid #1F2937', marginBottom: 12 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>{coupon.total}</p>
                <p style={{ color: '#6B7280', fontSize: 12 }}>发放总量</p>
              </div>
              <div style={{ width: 1, background: '#1F2937' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ color: '#059669', fontSize: 18, fontWeight: 700 }}>{coupon.used}</p>
                <p style={{ color: '#6B7280', fontSize: 12 }}>已领取</p>
              </div>
              <div style={{ width: 1, background: '#1F2937' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ color: '#C2410C', fontSize: 18, fontWeight: 700 }}>{coupon.total - coupon.used}</p>
                <p style={{ color: '#6B7280', fontSize: 12 }}>剩余</p>
              </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => alert(coupon.status === 'online' ? '已下架' : '已上架')}
                style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', fontSize: 13, cursor: 'pointer' }}
              >
                {coupon.status === 'online' ? '下架' : '上架'}
              </button>
              <button
                onClick={() => alert('删除成功')}
                style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid #EF4444', borderRadius: 6, color: '#EF4444', fontSize: 13, cursor: 'pointer' }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 创建优惠券弹窗 */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreate(false)}>
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 16, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>🎟️ 创建优惠券</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>优惠券名称 *</label>
                <input placeholder="如：新客立减5元" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>优惠类型</label>
                  <select style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}>
                    <option value="fixed">满减券</option>
                    <option value="percent">折扣券</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>优惠金额/折扣 *</label>
                  <input placeholder="如：5（元）或 10（9折）" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>最低消费（元，0=无门槛）</label>
                <input placeholder="0" type="number" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>发放数量 *</label>
                <input placeholder="如：100" type="number" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>开始日期</label>
                  <input type="date" defaultValue="2026-07-01" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>结束日期</label>
                  <input type="date" defaultValue="2026-08-31" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #374151', borderRadius: 8, color: '#9CA3AF', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={() => { setShowCreate(false); alert('创建成功！') }} style={{ flex: 1, padding: '10px', background: '#059669', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
