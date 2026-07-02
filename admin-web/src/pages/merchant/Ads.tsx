// @title 商家中心 - 广告管理
import { useState } from 'react'

const MOCK_ADS = [
  { id: 'a1', title: '新品上市：手工桂花糕', status: 'running', impressions: 12560, clicks: 890, ctr: 7.1, conversions: 45, spend: 200, revenue: 1800 },
  { id: 'a2', title: '夏季特惠：满50减10', status: 'paused', impressions: 8560, clicks: 420, ctr: 4.9, conversions: 28, spend: 150, revenue: 1400 },
  { id: 'a3', title: '店铺推广：红糖糍粑', status: 'ended', impressions: 25600, clicks: 2100, ctr: 8.2, conversions: 120, spend: 500, revenue: 5600 },
]

const STATUS_LABEL: Record<string, string> = { running: '投放中', paused: '已暂停', ended: '已结束' }
const STATUS_COLOR: Record<string, string> = { running: '#059669', paused: '#F59E0B', ended: '#6B7280' }

export default function MerchantAds() {
  const [ads] = useState(MOCK_ADS)
  const [filter, setFilter] = useState<'all' | 'running' | 'paused' | 'ended'>('all')

  const filtered = filter === 'all' ? ads : ads.filter(a => a.status === filter)

  const totalBalance = 500
  const runningCount = ads.filter(a => a.status === 'running').length
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0)

  return (
    <div>
      <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>📢 广告管理</h2>

      {/* 余额卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>广告积分余额</p>
          <p style={{ color: '#C2410C', fontSize: 28, fontWeight: 800 }}>¥{totalBalance}</p>
        </div>
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>投放中广告</p>
          <p style={{ color: '#059669', fontSize: 28, fontWeight: 800 }}>{runningCount}</p>
        </div>
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>总曝光量</p>
          <p style={{ color: '#3B82F6', fontSize: 28, fontWeight: 800 }}>{totalImpressions.toLocaleString()}</p>
        </div>
      </div>

      {/* 筛选 Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'all', label: '全部' },
          { key: 'running', label: '投放中' },
          { key: 'paused', label: '已暂停' },
          { key: 'ended', label: '已结束' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            style={{
              padding: '6px 14px',
              background: filter === tab.key ? '#C2410C' : '#111827',
              border: `1px solid ${filter === tab.key ? '#C2410C' : '#1F2937'}`,
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

      {/* 广告列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(ad => (
          <div key={ad.id} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: STATUS_COLOR[ad.status], fontSize: 12, fontWeight: 600, padding: '2px 8px', background: `${STATUS_COLOR[ad.status]}20`, borderRadius: 4 }}>{STATUS_LABEL[ad.status]}</span>
                  {ad.status === 'running' && <span style={{ color: '#059669', fontSize: 10 }}>● 投放中</span>}
                </div>
                <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{ad.title}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {ad.status === 'running' && (
                  <button style={{ padding: '6px 12px', background: '#F59E0B20', border: '1px solid #F59E0B', borderRadius: 6, color: '#F59E0B', fontSize: 12, cursor: 'pointer' }}>暂停</button>
                )}
                {ad.status === 'paused' && (
                  <button style={{ padding: '6px 12px', background: '#05966920', border: '1px solid #059669', borderRadius: 6, color: '#059669', fontSize: 12, cursor: 'pointer' }}>重启</button>
                )}
                {ad.status !== 'ended' && (
                  <button style={{ padding: '6px 12px', background: '#EF444420', border: '1px solid #EF4444', borderRadius: 6, color: '#EF4444', fontSize: 12, cursor: 'pointer' }}>结束</button>
                )}
                {ad.status === 'ended' && (
                  <button style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', fontSize: 12, cursor: 'pointer' }}>删除</button>
                )}
              </div>
            </div>

            {/* 数据展示 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: '曝光', value: ad.impressions.toLocaleString() },
                { label: '点击', value: ad.clicks.toLocaleString() },
                { label: '点击率', value: `${ad.ctr}%` },
                { label: '转化', value: ad.conversions },
              ].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '8px', background: '#0B0F19', borderRadius: 8 }}>
                  <p style={{ color: '#6B7280', fontSize: 11 }}>{d.label}</p>
                  <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{d.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
