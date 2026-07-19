// @title 商家中心 - 会员管理（含跨店消费流水）
import { useState } from 'react'

// ============ 类型 ============
interface Member {
  id: string
  nickname: string
  phone: string
  avatar: string
  level: string
  join_date: string
  total_spent: number
  total_orders: number
  last_order_date: string
  store_orders: number   // 在本店消费次数
  other_orders: number   // 在其他店消费次数
}

interface OrderRecord {
  id: string
  order_no: string
  store_name: string
  store_id: string
  product_name?: string   // 跨店订单不显示商品名
  amount?: number         // 跨店订单不显示原价
  commission: number      // 本店分润金额（跨店订单只看分润）
  status: string
  date: string
  is_current_store: boolean
}

// ============ Mock 数据 ============
const MOCK_MEMBERS: Member[] = [
  {
    id: 'u1', nickname: '奶茶爱好者小王', phone: '138****8001', avatar: '',
    level: '黄金会员', join_date: '2025-12-15', total_spent: 1280, total_orders: 18,
    last_order_date: '2026-06-30', store_orders: 8, other_orders: 10,
  },
  {
    id: 'u2', nickname: '吃货小李', phone: '139****9002', avatar: '',
    level: '白银会员', join_date: '2026-02-20', total_spent: 560, total_orders: 9,
    last_order_date: '2026-06-28', store_orders: 4, other_orders: 5,
  },
  {
    id: 'u3', nickname: '办公室张姐', phone: '137****7003', avatar: '',
    level: '黄金会员', join_date: '2025-10-08', total_spent: 2340, total_orders: 32,
    last_order_date: '2026-06-30', store_orders: 15, other_orders: 17,
  },
  {
    id: 'u4', nickname: '周末探店达人', phone: '136****6004', avatar: '',
    level: '青铜会员', join_date: '2026-05-01', total_spent: 180, total_orders: 3,
    last_order_date: '2026-06-25', store_orders: 2, other_orders: 1,
  },
  {
    id: 'u5', nickname: '咖啡续命族', phone: '135****5005', avatar: '',
    level: '铂金会员', join_date: '2025-08-12', total_spent: 5680, total_orders: 56,
    last_order_date: '2026-06-30', store_orders: 22, other_orders: 34,
  },
]

// 每个会员的跨店订单记录
const MOCK_ORDERS: Record<string, OrderRecord[]> = {
  'u1': [
    { id: 'o1', order_no: 'LD202606300001', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '伯牙绝弦·云茶', amount: 268, commission: 26.8, status: 'completed', date: '2026-06-30', is_current_store: true },
    { id: 'o2', order_no: 'LD202606290012', store_name: '霸王茶姬（科技园店）', store_id: 's2', commission: 5.4, status: 'completed', date: '2026-06-29', is_current_store: false },
    { id: 'o3', order_no: 'LD202606280008', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '手工红糖姜茶', amount: 39.9, commission: 4.0, status: 'completed', date: '2026-06-28', is_current_store: true },
    { id: 'o4', order_no: 'LD202606270015', store_name: '瑞幸咖啡（万达店）', store_id: 's3', commission: 6.0, status: 'completed', date: '2026-06-27', is_current_store: false },
    { id: 'o5', order_no: 'LD202606260003', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '傣族鲜花饼', amount: 68, commission: 6.8, status: 'completed', date: '2026-06-26', is_current_store: true },
  ],
  'u2': [
    { id: 'o6', order_no: 'LD202606280005', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '云南小粒咖啡豆', amount: 128, commission: 12.8, status: 'completed', date: '2026-06-28', is_current_store: true },
    { id: 'o7', order_no: 'LD202606250011', store_name: '名创优品（楚河汉街店）', store_id: 's4', commission: 7.5, status: 'completed', date: '2026-06-25', is_current_store: false },
    { id: 'o8', order_no: 'LD202606200007', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '野生菌汤包', amount: 88, commission: 8.8, status: 'completed', date: '2026-06-20', is_current_store: true },
  ],
  'u3': [
    { id: 'o9',  order_no: 'LD202606300002', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '古树普洱茶礼盒', amount: 398, commission: 39.8, status: 'completed', date: '2026-06-30', is_current_store: true },
    { id: 'o10', order_no: 'LD202606290018', store_name: '霸王茶姬（旗舰店）', store_id: 's2', commission: 4.8, status: 'completed', date: '2026-06-29', is_current_store: false },
    { id: 'o11', order_no: 'LD202606280022', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '红糖姜茶 3盒装', amount: 99, commission: 9.9, status: 'shipped', date: '2026-06-28', is_current_store: true },
    { id: 'o12', order_no: 'LD202606270030', store_name: '良品铺子（万达店）', store_id: 's5', commission: 9.0, status: 'completed', date: '2026-06-27', is_current_store: false },
    { id: 'o13', order_no: 'LD202606260014', store_name: '瑞幸咖啡（科技园店）', store_id: 's3', commission: 6.3, status: 'completed', date: '2026-06-26', is_current_store: false },
  ],
  'u4': [
    { id: 'o14', order_no: 'LD202606250009', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '鲜花饼礼盒', amount: 68, commission: 6.8, status: 'completed', date: '2026-06-25', is_current_store: true },
    { id: 'o15', order_no: 'LD202606200006', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '云南咖啡豆', amount: 128, commission: 12.8, status: 'completed', date: '2026-06-20', is_current_store: true },
    { id: 'o16', order_no: 'LD202606150013', store_name: '霸王茶姬（楚河汉街店）', store_id: 's2', commission: 5.4, status: 'completed', date: '2026-06-15', is_current_store: false },
  ],
  'u5': [
    { id: 'o17', order_no: 'LD202606300003', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '云南咖啡豆 2袋', amount: 256, commission: 25.6, status: 'completed', date: '2026-06-30', is_current_store: true },
    { id: 'o18', order_no: 'LD202606290021', store_name: '瑞幸咖啡（全部门店）', store_id: 's3', commission: 6.0, status: 'completed', date: '2026-06-29', is_current_store: false },
    { id: 'o19', order_no: 'LD202606280025', store_name: '犒赏铺（本店）', store_id: 's1', product_name: '普洱茶饼', amount: 268, commission: 26.8, status: 'completed', date: '2026-06-28', is_current_store: true },
    { id: 'o20', order_no: 'LD202606270033', store_name: '霸王茶姬（全部门店）', store_id: 's2', commission: 9.6, status: 'completed', date: '2026-06-27', is_current_store: false },
  ],
}

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待付款', pending_ship: '待发货', pending_receive: '待收货',
  pending_pickup: '待核销', completed: '已完成', refund: '退款', shipped: '已发货',
}
const STATUS_COLOR: Record<string, string> = {
  pending_pay: 'var(--warning)', pending_ship: 'var(--primary)', pending_receive: 'var(--info)',
  pending_pickup: 'var(--accent)', completed: 'var(--success-strong)', refund: 'var(--danger)', shipped: '#06B6D4',
}

const LEVEL_COLOR: Record<string, string> = {
  '青铜会员': '#8B7355', '白银会员': 'var(--text-muted)', '黄金会员': 'var(--warning)', '铂金会员': 'var(--accent-text)',
}

// ============ 组件 ============
export default function MerchantMembers() {
  const [members]   = useState<Member[]>(MOCK_MEMBERS)
  const [selected, setSelected] = useState<Member | null>(null)
  const [orders, setOrders]     = useState<OrderRecord[]>([])
  const [filter, setFilter]     = useState<'all' | 'current' | 'other'>('all')
  const [search, setSearch]     = useState('')

  const handleSelect = (m: Member) => {
    setSelected(m)
    setOrders(MOCK_ORDERS[m.id] || [])
    setFilter('all')
  }

  const filteredOrders = filter === 'all' ? orders
    : filter === 'current' ? orders.filter(o => o.is_current_store)
    : orders.filter(o => !o.is_current_store)

  const displayedMembers = search
    ? members.filter(m => m.nickname.includes(search) || m.phone.includes(search))
    : members

  // 统计
  const totalMembers    = members.length
  const totalSpent      = members.reduce((s, m) => s + m.total_spent, 0)
  const crossStoreCount = members.filter(m => m.other_orders > 0).length

  return (
    <div>
      <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>会员管理</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>查看会员信息及跨店消费流水（会员在其他店铺的消费记录也可查看）</p>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '会员总数', value: totalMembers, color: 'var(--accent)' },
          { label: '会员总消费', value: `¥${totalSpent.toLocaleString()}`, color: 'var(--warning)' },
          { label: '跨店消费会员', value: crossStoreCount, color: '#06B6D4' },
          { label: '跨店流水占比', value: `${Math.round(members.reduce((s, m) => s + m.other_orders, 0) / members.reduce((s, m) => s + m.total_orders, 0) * 100)}%`, color: 'var(--accent)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 主体：左侧会员列表 + 右侧详情 */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.5fr' : '1fr', gap: 16 }}>
        {/* ===== 左侧：会员列表 ===== */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* 搜索 */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索会员昵称/手机号..."
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                />
          </div>

          {/* 会员列表 */}
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {displayedMembers.map(m => (
              <div key={m.id} onClick={() => handleSelect(m)} style={{
                padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background: selected?.id === m.id ? 'rgba(5,150,105,0.08)' : 'transparent',
                borderLeft: selected?.id === m.id ? '3px solid var(--success-strong)' : '3px solid transparent',
                transition: 'background 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 16 }}>👤</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nickname}</p>
                    <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '2px 0 0' }}>{m.phone}</p>
                  </div>
                  <span style={{ background: LEVEL_COLOR[m.level] || 'var(--text-dim)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>{m.level.replace('会员','')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>本店 {m.store_orders} 单 · 跨店 {m.other_orders} 单</span>
                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>¥{m.total_spent.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== 右侧：会员详情 + 跨店流水 ===== */}
        {selected && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* 会员信息头部 */}
            <div style={{ padding: 20, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#05966922', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 28 }}>👤</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: 0 }}>{selected.nickname}</p>
                  <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>{selected.phone} · 加入于 {selected.join_date}</p>
                </div>
                <span style={{ background: LEVEL_COLOR[selected.level], color: '#fff', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                  {selected.level}
                </span>
              </div>

              {/* 数据统计 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: '累计消费', value: `¥${selected.total_spent.toLocaleString()}`, color: 'var(--warning)' },
                  { label: '累计订单', value: `${selected.total_orders} 单`, color: '#06B6D4' },
                  { label: '本店消费', value: `${selected.store_orders} 单`, color: 'var(--success-strong)' },
                  { label: '跨店消费', value: `${selected.other_orders} 单`, color: 'var(--accent)' },
                ].map(c => (
                  <div key={c.label} style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: 0 }}>{c.label}</p>
                    <p style={{ color: c.color, fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>{c.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 流水筛选 Tab */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
              {([
                { key: 'all' as const,     label: `全部流水 (${orders.length})` },
                { key: 'current' as const,  label: `本店 (${orders.filter(o => o.is_current_store).length})` },
                { key: 'other' as const,    label: `跨店 (${orders.filter(o => !o.is_current_store).length})` },
              ]).map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: filter === f.key ? 'var(--success-strong)' : 'var(--border)', color: filter === f.key ? '#fff' : 'var(--text-muted)',
                }}>{f.label}</button>
              ))}
            </div>

            {/* 订单流水列表 */}
            <div style={{ maxHeight: 450, overflowY: 'auto' }}>
              {filteredOrders.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>暂无订单记录</div>
              ) : (
                filteredOrders.map(o => (
                  <div key={o.id} style={{
                    padding: '12px 20px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    {/* 店铺标识 */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: o.is_current_store ? 'var(--success-strong)' : 'var(--accent)',
                    }} title={o.is_current_store ? '本店订单' : '跨店订单'} />

                    {/* 订单信息 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {o.is_current_store ? (
                        /* 本店订单：显示商品名 + 订单号 */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{o.product_name}</span>
                          </div>
                          <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{o.order_no} · {o.store_name}</p>
                        </>
                      ) : (
                        /* 跨店订单：只显示订单号 + 店铺名，不显示商品 */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>订单分润</span>
                            <span style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-text)', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>跨店</span>
                          </div>
                          <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{o.order_no} · {o.store_name}</p>
                        </>
                      )}
                    </div>

                    {/* 金额/分润 */}
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
                      {o.is_current_store ? (
                        /* 本店订单：显示订单金额 */
                        <>
                          <p style={{ color: 'var(--danger)', fontSize: 15, fontWeight: 700, margin: 0 }}>¥{o.amount?.toFixed(1)}</p>
                          <p style={{ color: 'var(--success-strong)', fontSize: 11, margin: '2px 0 0' }}>分润 ¥{o.commission.toFixed(1)}</p>
                        </>
                      ) : (
                        /* 跨店订单：只显示分润金额，不显示订单金额 */
                        <>
                          <p style={{ color: 'var(--accent)', fontSize: 15, fontWeight: 700, margin: 0 }}>分润 ¥{o.commission.toFixed(1)}</p>
                          <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '2px 0 0' }}>订单金额隐藏</p>
                        </>
                      )}
                      <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '2px 0 0' }}>{o.date}</p>
                    </div>

                    {/* 状态 */}
                    <span style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, flexShrink: 0,
                      background: `${STATUS_COLOR[o.status]}15`, color: STATUS_COLOR[o.status],
                    }}>
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* 跨店消费说明 */}
            {selected.other_orders > 0 && (
              <div style={{ padding: '12px 20px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--accent)', fontSize: 16 }}>🔒</span>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
                  跨店订单仅显示<strong style={{ color: 'var(--accent-text)' }}>分润金额</strong>，商品详情及订单金额已隐藏，以保护其他店铺隐私。
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 未选中时的提示 */}
      {!selected && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', padding: 60, textAlign: 'center', marginTop: 16 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 16, margin: 0 }}>← 请在左侧选择会员，查看详细信息及跨店消费流水</p>
        </div>
      )}
    </div>
  )
}
