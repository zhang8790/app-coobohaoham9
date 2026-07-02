// @title 商家中心 - 数据分析
import { useState } from 'react'

const MOCK_DAILY_SALES = [320, 480, 260, 550, 420, 380, 290]
const MOCK_DAILY_LABELS = ['6/24', '6/25', '6/26', '6/27', '6/28', '6/29', '6/30']
const MOCK_TOP_PRODUCTS = [
  { name: '手工桂花糕', sales: 156, trend: 'up' },
  { name: '芝麻汤圆', sales: 98, trend: 'up' },
  { name: '红糖糍粑', sales: 87, trend: 'down' },
  { name: '豆沙青团', sales: 65, trend: 'up' },
  { name: '芒果班戟', sales: 43, trend: 'down' },
]
const MOCK_TRAFFIC = { today: 128, yesterday: 115, weekRatio: 11.3, peakHour: '12:00-13:00' }
const MOCK_SOURCES = [
  { name: '首页推荐', value: 45 },
  { name: '搜索', value: 28 },
  { name: '分享', value: 18 },
  { name: '其他', value: 9 },
]

function MiniBarChart({ data, labels, height = 120 }: { data: number[]; labels: string[]; height?: number }) {
  const max = Math.max(...data)
  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 4, padding: '0 8px' }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 32, height: `${max > 0 ? (v / max) * 100 : 0}%`, background: 'linear-gradient(180deg, #059669, #10B981)', borderRadius: 4, transition: 'height 0.3s' }} />
          <span style={{ color: '#6B7280', fontSize: 10, marginTop: 4 }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

function PieChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const colors = ['#059669', '#3B82F6', '#C2410C', '#6B7280']
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
            <path
              key={i}
              d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={colors[i % colors.length]}
            />
          )
        })}
        <circle cx="60" cy="60" r="25" fill="#111827" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, background: colors[i % colors.length], borderRadius: 3, flexShrink: 0 }} />
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>{d.name} {d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MerchantAnalytics() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700 }}>📊 数据分析</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: '7d', label: '近7日' },
            { key: '30d', label: '近30日' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key as any)}
              style={{
                padding: '6px 14px',
                background: period === p.key ? '#059669' : '#111827',
                border: `1px solid ${period === p.key ? '#059669' : '#1F2937'}`,
                borderRadius: 6,
                color: period === p.key ? 'white' : '#9CA3AF',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 核心指标 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '今日营收', value: '¥1,280', icon: '💰', color: '#059669' },
          { label: '本月营收', value: '¥3.86万', icon: '📈', color: '#3B82F6' },
          { label: '今日订单', value: '23', icon: '📦', color: '#C2410C' },
          { label: '累积客户', value: '456', icon: '👥', color: '#7C3AED' },
        ].map((stat, i) => (
          <div key={i} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
            </div>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>{stat.label}</p>
            <p style={{ color: stat.color, fontSize: 24, fontWeight: 800 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* 销售趋势 */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📈 销售趋势</h3>
          <MiniBarChart data={MOCK_DAILY_SALES} labels={MOCK_DAILY_LABELS} height={200} />
        </div>

        {/* 商品销量排行 */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🏆 商品排行 TOP 5</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MOCK_TOP_PRODUCTS.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: i < 3 ? '#C2410C' : '#6B7280', fontSize: 14, fontWeight: 700, width: 20 }}>{i + 1}</span>
                <span style={{ color: '#E5E7EB', fontSize: 13, flex: 1 }}>{p.name}</span>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>{p.sales}</span>
                <span style={{ color: p.trend === 'up' ? '#059669' : '#EF4444', fontSize: 12 }}>{p.trend === 'up' ? '↑' : '↓'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* 访客分析 */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>👣 访客分析</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9CA3AF', fontSize: 13 }}>今日访客</span>
              <span style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{MOCK_TRAFFIC.today}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9CA3AF', fontSize: 13 }}>昨日访客</span>
              <span style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{MOCK_TRAFFIC.yesterday}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9CA3AF', fontSize: 13 }}>周环比</span>
              <span style={{ color: '#059669', fontSize: 16, fontWeight: 700 }}>+{MOCK_TRAFFIC.weekRatio}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9CA3AF', fontSize: 13 }}>高峰时段</span>
              <span style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{MOCK_TRAFFIC.peakHour}</span>
            </div>
          </div>
        </div>

        {/* 流量来源 */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔗 流量来源</h3>
          <PieChart data={MOCK_SOURCES} />
        </div>
      </div>
    </div>
  )
}
