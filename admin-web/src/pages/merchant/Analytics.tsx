// @title 自营门店中心 - 数据分析（真实数据）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore, getMerchantAnalytics } from '@/api/merchant'
import type { MerchantAnalytics } from '@/types'

function MiniBarChart({ data, labels, height = 120 }: { data: number[]; labels: string[]; height?: number }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 4, padding: '0 8px' }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 32, height: `${max > 0 ? (v / max) * 100 : 0}%`, background: 'linear-gradient(180deg, var(--success-strong), var(--success-strong))', borderRadius: 4, transition: 'height 0.3s' }} />
          <span style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4 }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

function PieChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const colors = ['var(--success-strong)', 'var(--info)', 'var(--primary)', 'var(--text-dim)']
  let acc = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {data.map((d, i) => {
          const startAngle = (acc / total) * 360
          const endAngle = ((acc + d.value) / total) * 360
          acc += d.value
          const x1 = 60 + 50 * Math.cos((startAngle - 90) * Math.PI / 180)
          const y1 = 60 + 50 * Math.sin((startAngle - 90) * Math.PI / 180)
          const x2 = 60 + 50 * Math.cos((endAngle - 90) * Math.PI / 180)
          const y2 = 60 + 50 * Math.sin((endAngle - 90) * Math.PI / 180)
          const largeArc = endAngle - startAngle > 180 ? 1 : 0
          return (
            <path key={i} d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`} style={{ fill: colors[i % colors.length] }} />
          )
        })}
        <circle cx="60" cy="60" r="25" fill="var(--surface-2)" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, background: colors[i % colors.length], borderRadius: 3, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.name} {d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MerchantAnalytics() {
  const { profile } = useAuth()
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const [data, setData] = useState<MerchantAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      const d = await getMerchantAnalytics(store.id).catch(() => null)
      if (!cancelled) { setData(d); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [profile])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700 }}>数据分析</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ key: '7d', label: '近7日' }, { key: '30d', label: '近30日' }].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key as any)} style={{
              padding: '6px 14px',
              background: period === p.key ? 'var(--success-strong)' : 'var(--surface-2)',
              border: `1px solid ${period === p.key ? 'var(--success-strong)' : 'var(--border)'}`,
              borderRadius: 6,
              color: period === p.key ? 'white' : 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}

      {!loading && !storeId && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>未找到关联门店</div>
      )}

      {!loading && storeId && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: '今日营收', value: `¥${data.revenueToday.toLocaleString()}`, icon: '💰', color: 'var(--success-strong)' },
              { label: '本月营收', value: `¥${data.revenueMonth.toLocaleString()}`, icon: '📈', color: 'var(--info)' },
              { label: '今日订单', value: String(data.ordersToday), icon: '📦', color: 'var(--primary)' },
              { label: '累积客户', value: String(data.totalCustomers), icon: '👥', color: 'var(--accent)' },
            ].map((stat, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{stat.icon}</span>
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 4 }}>{stat.label}</p>
                <p style={{ color: stat.color, fontSize: 24, fontWeight: 800 }}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>销售趋势（近7日）</h3>
              <MiniBarChart data={data.salesTrend.map(s => s.amount)} labels={data.salesTrend.map(s => s.date)} height={200} />
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>商品排行 TOP 5</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.topProducts.length === 0 ? (
                  <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>暂无销售数据</p>
                ) : data.topProducts.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: i < 3 ? 'var(--primary)' : 'var(--text-dim)', fontSize: 14, fontWeight: 700, width: 20 }}>{i + 1}</span>
                    <span style={{ color: 'var(--text)', fontSize: 13, flex: 1 }}>{p.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>¥{p.sales}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>访客分析</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>今日访客（订单数）</span>
                  <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>{data.trafficToday}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>高峰时段</span>
                  <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>{data.peakHour}</span>
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 11 }}>注：精细访客统计开发中，当前以订单数为参考</p>
              </div>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>流量来源</h3>
              <PieChart data={data.sources} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
