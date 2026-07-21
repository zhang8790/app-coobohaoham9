import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFinanceOverview, getDailyTrend, getAnomalyReport, type FinanceOverview, type DailyPoint, type AnomalyReport } from '@/api/finance'
import { downloadCSV, csvTimestamp, type CsvColumn } from '@/lib/csv'
import { supabase } from '@/lib/supabase'

// ── 通用样式 ───────────────────────────────────────────────────────────
const C = {
  bg: 'var(--bg)', card: 'var(--card)', border: 'var(--border)', text: 'var(--text)',
  sub: 'var(--text-muted)', dim: 'var(--text-dim)', accent: 'var(--primary)', green: 'var(--success-strong)',
  blue: 'var(--info)', purple: 'var(--accent)', gold: 'var(--warning)',
}
const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px',
}
const exportBtn: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
  color: C.sub, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
}
const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const fmtMoney = (n: number) => `¥${fmt(n)}`

// ── 折线/面积图（手绘 SVG，premium）─────────────────────────────────────
function TrendChart({ points, valueKey, color, height = 160 }: {
  points: DailyPoint[]; valueKey: keyof DailyPoint; color: string; height?: number
}) {
  const W = 680
  const H = height
  const pad = 8
  const vals = points.map(p => Number(p[valueKey] || 0))
  const max = Math.max(1, ...vals)
  const n = points.length
  if (n === 0) return <div style={{ color: C.dim, padding: 24, textAlign: 'center' }}>暂无数据</div>

  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2)
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`
  const gid = `g-${String(valueKey)}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={pad} x2={W - pad} y1={H * t} y2={H * t} stroke={C.border} strokeWidth="1" strokeDasharray="3 3" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(vals[n - 1])} r="3.5" fill={color} />
    </svg>
  )
}

// ── KPI 卡 ─────────────────────────────────────────────────────────────
function Kpi({ label, value, color, sub, to }: {
  label: string; value: string; color: string; sub?: string; to?: string
}) {
  const nav = useNavigate()
  return (
    <div style={{ ...cardStyle, cursor: to ? 'pointer' : 'default' }}
      onClick={() => to && nav(to)}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = color)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = C.border)}>
      <p style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>{label}</p>
      <p style={{ color, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </div>
  )
}

// ── 财务明细对比表 ──────────────────────────────────────────────────────
function FinanceTable({ o }: { o: FinanceOverview }) {
  const rows: { name: string; val: number; kind: string }[] = [
    { name: '成交额 累计消费额', val: o.gmv, kind: 'money' },
    { name: '金豆抵扣总额', val: o.concession, kind: 'money' },
    { name: '推广佣金支出', val: o.commissionPaid, kind: 'money' },
    { name: '平台净收益', val: o.platformNet, kind: 'money' },
    { name: '金豆流通量', val: o.goldBeans, kind: 'num' },
    { name: '买家金豆流通量', val: o.points, kind: 'num' },
    { name: '金豆发放总量', val: o.tbTotal, kind: 'num' },
    { name: '贡献值 CV 总量', val: o.cvTotal, kind: 'num' },
  ]
  const gmv = Math.max(1, o.gmv)
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600 }}>财务明细总表</h2>
        <button onClick={() => exportFinanceTable(o)} style={exportBtn}>导出 CSV</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['指标', '数值', '占 累计消费额 比'].map(h => (
              <th key={h} style={{ color: C.dim, fontSize: 12, fontWeight: 500, padding: '8px 12px', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '11px 12px', color: C.text, fontSize: 14 }}>{r.name}</td>
              <td style={{ padding: '11px 12px', color: C.text, fontSize: 14, fontWeight: 600 }}>
                {r.kind === 'money' ? fmtMoney(r.val) : fmt(r.val)}
              </td>
              <td style={{ padding: '11px 12px', color: C.sub, fontSize: 13 }}>
                {r.kind === 'money' && r.name !== '成交额 累计消费额'
                  ? `${((r.val / gmv) * 100).toFixed(2)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────
export default function FinanceDashboard() {
  const [o, setO] = useState<FinanceOverview | null>(null)
  const [trend, setTrend] = useState<DailyPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [anomaly, setAnomaly] = useState<AnomalyReport | null>(null)

  // 智能化：首屏加载 + Realtime 订阅关键表变更即时刷新（兜底 60s 轮询）
  const refresh = () => {
    setRefreshing(true)
    return Promise.all([getFinanceOverview(), getDailyTrend(30), getAnomalyReport()])
      .then(([ov, tr, an]) => { setO(ov); setTrend(tr); setAnomaly(an); setLastUpdated(new Date()) })
      .finally(() => { setRefreshing(false); setLoading(false) })
  }
  useEffect(() => {
    refresh()
    // Realtime：订阅 orders/profiles/tongbao_logs/emotion_claims 变更，任意写入即重算
    const channel = supabase
      .channel('finance-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tongbao_logs' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emotion_claims' }, () => refresh())
      .subscribe()
    // 兜底轮询：防止 Realtime 未启用（需本机把表加入 supabase_realtime 发布）时数据陈旧
    const id = setInterval(refresh, 60000)
    return () => { supabase.removeChannel(channel); clearInterval(id) }
  }, [])

  // 环比（近7日 vs 前7日），支持多指标
  const delta = (key: 'gmv' | 'orders' | 'registrations') => {
    if (trend.length < 14) return null
    const last7 = trend.slice(-7).reduce((s, p) => s + Number(p[key] || 0), 0)
    const prev7 = trend.slice(-14, -7).reduce((s, p) => s + Number(p[key] || 0), 0)
    if (prev7 === 0) return null
    return ((last7 - prev7) / prev7) * 100
  }
  const mom = delta('gmv')
  const momOrders = delta('orders')
  const momRegs = delta('registrations')

  // 智能预警横幅
  const alerts = useMemo(() => {
    if (!o) return [] as { lvl: 'warn' | 'danger'; text: string }[]
    const a: { lvl: 'warn' | 'danger'; text: string }[] = []
    if (o.withdrawPending > 0)
      a.push({ lvl: 'warn', text: `⏳ 有 ${o.withdrawPending} 笔提现待处理` })
    const ratio = o.concession / Math.max(1, o.gmv)
    if (ratio > 0.15)
      a.push({ lvl: 'danger', text: `⚠️ 让利率 ${(ratio * 100).toFixed(1)}% 偏高（>15%，挤压平台净收益）` })
    if (o.bannedMembers > 0)
      a.push({ lvl: 'warn', text: `🚫 ${o.bannedMembers} 名会员被封禁` })
    return a
  }, [o])

  if (loading) return <div style={{ color: C.sub, padding: 40 }}>加载财务数据中…</div>
  if (!o) return <div style={{ color: C.sub, padding: 40 }}>数据加载失败</div>

  const dChg = (v: number | null) =>
    v === null ? '环比 —' : `${v >= 0 ? '↑' : '↓'} ${Math.abs(v).toFixed(1)}%（近7日）`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>财务数据看板</h1>
          <p style={{ color: C.dim, fontSize: 14 }}>全平台成交 · 收益 · 资产流通 · 会员 — 实时聚合</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: C.dim, fontSize: 12 }}>
          <span>{lastUpdated ? `更新于 ${lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })}` : '—'}</span>
          <button onClick={() => refresh()} disabled={refreshing}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.sub, padding: '6px 14px', fontSize: 13, cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? '刷新中…' : '⟳ 刷新'}
          </button>
        </div>
      </div>

      {/* 智能预警横幅 */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              background: a.lvl === 'danger' ? 'var(--primary-soft)' : 'rgba(245,158,11,0.10)',
              border: `1px solid ${a.lvl === 'danger' ? C.accent : C.gold}`,
              borderRadius: 10, padding: '12px 16px', color: a.lvl === 'danger' ? 'var(--danger-text)' : 'var(--warning)', fontSize: 13, fontWeight: 500,
            }}>{a.text}</div>
          ))}
        </div>
      )}

      {/* 会员 */}
      <Section title="会员" icon="👥">
        <Kpi label="会员总数" value={fmt(o.membersTotal)} color={C.green} to="/members" />
        <Kpi label="今日新增" value={fmt(o.membersToday)} color={C.blue} sub={dChg(momRegs)} />
        <Kpi label="活跃会员(30d)" value={fmt(o.activeMembers30d)} color={C.purple} sub="近30日有下单" />
        <Kpi label="入住门店数" value={fmt(o.storesActive)} color={C.gold} to="/merchants" />
      </Section>

      {/* 成交 / 收益 */}
      <Section title="成交与收益" icon="📈">
        <Kpi label="成交订单数" value={fmt(o.ordersPaid)} color={C.accent} to="/orders" sub={dChg(momOrders)} />
        <Kpi label="成交额 累计消费额" value={fmtMoney(o.gmv)} color={C.green} sub={dChg(mom)} />
        <Kpi label="金豆抵扣" value={fmtMoney(o.concession)} color={C.gold} sub={`占累计消费额 ${((o.concession / Math.max(1, o.gmv)) * 100).toFixed(2)}%`} />
        <Kpi label="平台净收益" value={fmtMoney(o.platformNet)} color={C.blue} sub="累计消费额−金豆抵扣−佣金" />
      </Section>

      {/* 资产流通 */}
      <Section title="资产流通（数字化）" icon="💎">
        <Kpi label="金豆余额" value={fmt(o.goldBeans)} color={C.gold} sub="1金豆=1元" to="/ledgers" />
        <Kpi label="金豆累计发放" value={fmt(o.goldBeanIssued)} color={C.green} sub="tongbao_logs +" />
        <Kpi label="金豆累计消耗" value={fmt(o.goldBeanConsumed)} color={C.accent} sub="tongbao_logs −" />
        <Kpi label="买家金豆流通量" value={fmt(o.points)} color={C.blue} />
        <Kpi label="金豆发放总量" value={fmt(o.tbTotal)} color={C.purple} to="/emotion-claims" />
        <Kpi label="贡献值 CV 总量" value={fmt(o.cvTotal)} color={C.green} />
      </Section>

      {/* 智能风控 · 异常检测引擎 */}
      {anomaly && (
        <Section title="智能风控（异常检测）" icon="🛡️">
          <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            {anomaly.anomalies.length === 0 ? (
              <p style={{ color: C.green, fontSize: 13 }}>✅ 未发现异常指标</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {anomaly.anomalies.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: a.level === 'high' ? 'var(--danger-soft)' : a.level === 'medium' ? 'rgba(245,158,11,0.10)' : 'var(--info-soft)',
                    border: `1px solid ${a.level === 'high' ? 'var(--danger-text)' : a.level === 'medium' ? C.gold : C.blue}`,
                    borderRadius: 10, padding: '12px 16px',
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, flexShrink: 0, width: 44, textAlign: 'center',
                      color: a.level === 'high' ? 'var(--danger-text)' : a.level === 'medium' ? 'var(--warning)' : 'var(--info-text)',
                    }}>{a.level === 'high' ? '高危' : a.level === 'medium' ? '关注' : '提示'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{a.title}</p>
                      <p style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{a.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ color: C.dim, fontSize: 11, marginTop: 12 }}>
              检测于 {new Date(anomaly.checkedAt).toLocaleTimeString('zh-CN', { hour12: false })} · 实时订阅更新（兜底 60s 轮询）
            </p>
          </div>
        </Section>
      )}

      {/* 趋势图 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>每日成交额 (累计消费额)</h3>
            <span style={{ color: C.green, fontSize: 12 }}>近30日</span>
          </div>
          <TrendChart points={trend} valueKey="gmv" color={C.green} />
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>每日会员注册量</h3>
            <span style={{ color: C.blue, fontSize: 12 }}>近30日</span>
          </div>
          <TrendChart points={trend} valueKey="registrations" color={C.blue} />
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>每日成交量</h3>
            <span style={{ color: C.accent, fontSize: 12 }}>近30日</span>
          </div>
          <TrendChart points={trend} valueKey="orders" color={C.accent} />
        </div>
      </div>

      {/* 收益结构 & 资产分布 环形图（智能化可视化）*/}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>收益结构（累计消费额 去向）</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <DonutChart data={[
              { label: '金豆抵扣', value: o.concession, color: C.gold },
              { label: '推广佣金', value: o.commissionPaid, color: C.purple },
              { label: '平台净收益', value: Math.max(0, o.platformNet), color: C.blue },
            ]} centerLabel={`累计消费额\n${fmtMoney(o.gmv)}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <Legend color={C.gold} label="金豆抵扣" value={fmtMoney(o.concession)} />
              <Legend color={C.purple} label="推广佣金" value={fmtMoney(o.commissionPaid)} />
              <Legend color={C.blue} label="平台净收益" value={fmtMoney(o.platformNet)} />
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2 }}>
                <Legend color={C.green} label="累计消费额 合计" value={fmtMoney(o.gmv)} />
              </div>
            </div>
          </div>
        </div>
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>数字资产发行结构</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <DonutChart data={[
              { label: '金豆', value: o.goldBeans, color: C.gold },
              { label: '买家金豆', value: o.points, color: C.blue },
              { label: '金豆', value: o.tbTotal, color: C.purple },
              { label: '贡献值CV', value: o.cvTotal, color: C.green },
            ]} centerLabel="资产\n总览" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <Legend color={C.gold} label="金豆 (1=1元)" value={fmt(o.goldBeans)} />
              <Legend color={C.blue} label="买家金豆" value={fmt(o.points)} />
              <Legend color={C.purple} label="金豆" value={fmt(o.tbTotal)} />
              <Legend color={C.green} label="贡献值 CV" value={fmt(o.cvTotal)} />
            </div>
          </div>
        </div>
      </div>

      <FinanceTable o={o} />
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h2 style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{title}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {children}
      </div>
    </div>
  )
}

// ── 环形图（SVG 手绘，premium）─────────────────────────────────────────
function DonutChart({ data, size = 180, thickness = 22, centerLabel }: {
  data: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  if (total <= 0) return <div style={{ color: C.dim, padding: 24, textAlign: 'center' }}>暂无数据</div>
  const r = (size - thickness) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  let acc = 0
  const lines = centerLabel ? centerLabel.split('\n') : []
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {data.map((d, i) => {
          const frac = Math.max(0, d.value) / total
          if (frac <= 0) return null
          const len = frac * circ
          const off = acc * circ
          acc += frac
          return (
            <circle key={i} cx={cx} cy={cx} r={r} fill="none"
              stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-off} />
          )
        })}
      </g>
      {lines.map((ln, i) => (
        <text key={i}
          x={cx}
          y={cx + (lines.length === 1 ? 0 : (i - (lines.length - 1) / 2) * 16)}
          textAnchor="middle" dominantBaseline="central"
          fill={i === 0 ? C.text : C.sub} fontSize={i === 0 ? 14 : 12}
          fontWeight={i === 0 ? 700 : 500}>
          {ln}
        </text>
      ))}
    </svg>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ color: C.sub }}>{label}</span>
      <span style={{ color: C.text, fontWeight: 600, marginLeft: 'auto' }}>{value}</span>
    </div>
  )
}

function exportFinanceTable(o: FinanceOverview) {
  const gmv = Math.max(1, o.gmv)
  const rows = [
    { 指标: '成交额 累计消费额', 数值: o.gmv, 占累计消费额比: '—' },
    { 指标: '金豆抵扣', 数值: o.concession, 占累计消费额比: ((o.concession / gmv) * 100).toFixed(2) + '%' },
    { 指标: '推广佣金支出', 数值: o.commissionPaid, 占累计消费额比: ((o.commissionPaid / gmv) * 100).toFixed(2) + '%' },
    { 指标: '平台净收益', 数值: o.platformNet, 占累计消费额比: ((o.platformNet / gmv) * 100).toFixed(2) + '%' },
    { 指标: '金豆流通量', 数值: o.goldBeans, 占累计消费额比: '—' },
    { 指标: '买家金豆流通量', 数值: o.points, 占累计消费额比: '—' },
    { 指标: '金豆发放总量', 数值: o.tbTotal, 占累计消费额比: '—' },
    { 指标: '贡献值 CV 总量', 数值: o.cvTotal, 占累计消费额比: '—' },
  ]
  const cols: CsvColumn[] = [
    { key: '指标', label: '指标' },
    { key: '数值', label: '数值' },
    { key: '占累计消费额比', label: '占累计消费额比' },
  ]
  downloadCSV(`财务明细总表_${csvTimestamp()}.csv`, rows as unknown as Record<string, unknown>[], cols)
}
