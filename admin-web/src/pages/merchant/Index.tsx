// @title 商家中心 - 店铺概况
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Mock 数据（演示模式 fallback）
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
  pending_pay: 'var(--warning)',
  pending_ship: 'var(--primary)',
  pending_receive: 'var(--info)',
  completed: 'var(--success-strong)',
  refund: 'var(--danger)',
  cancelled: 'var(--text-dim)',
}

// 判断是否有商家权限
const isMerchantUser = (profile: any): boolean => {
  if (!profile) return false
  return profile.role === 'merchant' || profile.merchant_status === 'approved'
}

export default function MerchantDashboard() {
  const nav = useNavigate()
  const { profile, useMock } = useAuth()
  const [stats, setStats] = useState({ todayRevenue: 0, monthRevenue: 0, todayOrders: 0, totalCustomers: 0, pendingOrders: 0, pendingWithdraw: 0 })
  const [recentOrders, setRecentOrders] = useState<typeof MOCK_RECENT_ORDERS>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [, setLoading] = useState(true)

  // 获取当前商家的 store_id
  useEffect(() => {
    if (!profile || !isMerchantUser(profile)) return
    const fetchStore = async () => {
      const { data } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', profile.id)
        .maybeSingle()
      setStoreId(data?.id ?? null)
    }
    if (!useMock) {
      fetchStore()
    }
  }, [profile, useMock])

  // 加载真实数据
  useEffect(() => {
    if (useMock || !storeId) {
      // 演示模式：用 Mock 数据
      setStats(MOCK_STATS)
      setRecentOrders(MOCK_RECENT_ORDERS)
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

      try {
        // 今日订单
        const { data: todayOrdersData } = await supabase
          .from('orders')
          .select('total_amount, status, created_at')
          .eq('store_id', storeId)
          .gte('created_at', today)

        const todayOrders = todayOrdersData?.length ?? 0
        const todayRevenue = todayOrdersData?.reduce((s, o) => s + (o.total_amount ?? 0), 0) ?? 0

        // 本月订单
        const { data: monthOrdersData } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('store_id', storeId)
          .gte('created_at', monthStart)

        const monthRevenue = monthOrdersData?.reduce((s, o) => s + (o.total_amount ?? 0), 0) ?? 0

        // 待发货订单数
        const { count: pendingCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .eq('status', 'pending_ship')

        // 可提现佣金（已审核通过的提现申请总额，或从 commissions 表汇总）
        const { data: withdrawData } = await supabase
          .from('withdrawals')
          .select('amount')
          .eq('store_id', storeId)
          .eq('status', 'approved')

        const pendingWithdraw = withdrawData?.reduce((s, w) => s + (w.amount ?? 0), 0) ?? 0

        // 累积客户数（有过订单的去重用户数）
        const { data: custData } = await supabase
          .from('orders')
          .select('user_id')
          .eq('store_id', storeId)

        const totalCustomers = new Set(custData?.map(o => o.user_id)).size

        setStats({
          todayRevenue,
          monthRevenue,
          todayOrders,
          totalCustomers,
          pendingOrders: pendingCount ?? 0,
          pendingWithdraw,
        })

        // 最新5条订单
        const { data: recent } = await supabase
          .from('orders')
          .select('id, order_items(product_name, quantity), total_amount, status, created_at')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .limit(5)

        setRecentOrders((recent ?? []).map(o => ({
          id: o.id,
          product_name: (o as any).order_items?.[0]?.product_name ?? '多商品订单',
          quantity: (o as any).order_items?.[0]?.quantity ?? 1,
          price: o.total_amount ?? 0,
          status: o.status,
          created_at: (o.created_at ?? '').replace('T', ' ').slice(0, 16),
        })))
      } catch (e) {
        console.warn('[Dashboard] 加载真实数据失败，使用 Mock:', e)
        setStats(MOCK_STATS)
        setRecentOrders(MOCK_RECENT_ORDERS)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [useMock, storeId])

  const cards = [
    { label: '今日营收', value: `¥${stats.todayRevenue.toFixed(2)}`, icon: '💰', color: 'var(--success-strong)' },
    { label: '本月营收', value: `¥${(stats.monthRevenue / 10000).toFixed(2)}万`, icon: '📈', color: 'var(--info)' },
    { label: '今日订单', value: stats.todayOrders, icon: '📦', color: 'var(--primary)' },
    { label: '累积客户', value: stats.totalCustomers, icon: '👥', color: 'var(--accent)' },
  ]

  return (
    <div>
      {/* 页面标题 */}
      <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>店铺概况</h2>

      {/* 核心指标卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{c.icon}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{c.label}</span>
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
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--success-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>{btn.icon}</span>
            <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{btn.label}</p>
          </div>
        ))}
      </div>

      {/* 待处理事项 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>待处理</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>待发货订单</span>
              <span style={{ color: 'var(--primary)', fontSize: 20, fontWeight: 800 }}>{stats.pendingOrders}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>可提现佣金</span>
              <span style={{ color: 'var(--success-strong)', fontSize: 20, fontWeight: 800 }}>¥{stats.pendingWithdraw.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>今日数据</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>访客数</span>
              <span style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>128</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>浏览量</span>
              <span style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>456</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>转化率</span>
              <span style={{ color: 'var(--success-strong)', fontSize: 18, fontWeight: 700 }}>17.9%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 最新订单 */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>最新订单</h3>
          <button onClick={() => nav('/merchant/orders')} style={{ background: 'transparent', border: 'none', color: 'var(--success-strong)', cursor: 'pointer', fontSize: 13 }}>查看全部 →</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentOrders.map(order => (
            <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
              <div>
                <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{order.product_name} x{order.quantity}</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{order.created_at}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700 }}>¥{order.price}</p>
                <span style={{ color: STATUS_COLOR[order.status], fontSize: 12, fontWeight: 600 }}>{STATUS_LABEL[order.status]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
