import { useEffect, useMemo, useState } from 'react'
import {
  loadBehaviorData, computeAll, predictNext,
  LIFECYCLE_STATES, RANK_STATES, CLAIM_STATES,
  type BehaviorReport, type MatrixResult, type Trigger,
} from '@/utils/behavior-analytics'
import { executeCare } from '@/utils/behavior-analytics'

// ── 通用样式（对齐 FinanceDashboard）────────────────────────────────────
const C = {
  bg: '#0B0F19', card: '#0F172A', border: '#1F2937', text: '#E5E7EB',
  sub: '#9CA3AF', dim: '#6B7280', accent: '#C2410C', green: '#10B981',
  blue: '#3B82F6', purple: '#8B5CF6', gold: '#F59E0B', red: '#EF4444',
}
const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px',
}
const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })

// ── KPI 卡 ─────────────────────────────────────────────────────────────
function Kpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle }}>
      <p style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>{label}</p>
      <p style={{ color, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </div>
  )
}

// ── 马尔可夫热力图 ─────────────────────────────────────────────────────
function MarkovHeatmap({ m }: { m: MatrixResult }) {
  const n = m.states.length
  const cell = 84
  const pad = 56
  const W = pad + n * cell + 12
  const H = pad + n * cell + 12
  const maxP = Math.max(0.0001, ...m.matrix.flat())
  const heat = (v: number) => {
    const t = Math.min(1, v / Math.max(0.25, maxP))
    // 低=深蓝透，高=橙红
    const r = Math.round(30 + t * 200)
    const g = Math.round(58 + t * 30)
    const b = Math.round(138 - t * 90)
    return `rgb(${r},${g},${b})`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560, display: 'block', margin: '0 auto' }}>
      {/* 列标题（to） */}
      {m.states.map((s, j) => (
        <text key={`c${j}`} x={pad + j * cell + cell / 2} y={pad - 14} fill={C.sub} fontSize={12} textAnchor="middle">{s}</text>
      ))}
      {/* 行标题（from） */}
      {m.states.map((s, i) => (
        <text key={`r${i}`} x={pad - 12} y={pad + i * cell + cell / 2 + 4} fill={C.sub} fontSize={12} textAnchor="end">{s}</text>
      ))}
      {m.matrix.map((row, i) =>
        row.map((v, j) => (
          <g key={`${i}-${j}`}>
            <rect x={pad + j * cell} y={pad + i * cell} width={cell - 4} height={cell - 4} rx={6}
              fill={heat(v)} stroke={i === j ? C.accent : 'transparent'} strokeWidth={i === j ? 1.5 : 0} />
            <text x={pad + j * cell + (cell - 4) / 2} y={pad + i * cell + (cell - 4) / 2 + 4}
              fill={v > 0.45 ? '#fff' : C.text} fontSize={12} fontWeight={600} textAnchor="middle">
              {v > 0 ? `${Math.round(v * 100)}%` : '·'}
            </text>
          </g>
        )),
      )}
      <text x={pad + (n * cell) / 2} y={H - 2} fill={C.dim} fontSize={11} textAnchor="middle">行=当前态 · 列=下一步态 · 对角线=维持</text>
    </svg>
  )
}

// ── 复购周期直方图 ──────────────────────────────────────────────────────
function Histogram({ data }: { data: { bucket: string; count: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.count))
  const W = 560, H = 180, padB = 28, padT = 10
  const bw = (W - 20) / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560, display: 'block' }}>
      {data.map((d, i) => {
        const h = (d.count / max) * (H - padB - padT)
        const x = 10 + i * bw
        return (
          <g key={d.bucket}>
            <rect x={x + 4} y={H - padB - h} width={bw - 8} height={h} rx={5} fill={C.accent} opacity={0.85} />
            <text x={x + bw / 2} y={H - padB + 14} fill={C.sub} fontSize={11} textAnchor="middle">{d.bucket}</text>
            <text x={x + bw / 2} y={H - padB - h - 4} fill={C.text} fontSize={11} textAnchor="middle">{d.count}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 触发规则面板 ───────────────────────────────────────────────────────
function TriggerPanel({ triggers, onCare, caring }: {
  triggers: Trigger[]; onCare: (t: Trigger) => void; caring: string | null
}) {
  if (!triggers.length) return <p style={{ color: C.dim, fontSize: 13 }}>当前无触发条件命中，用户活跃度健康。</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {triggers.slice(0, 12).map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: '#0B1220', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{t.nickname} <span style={{ color: C.dim, fontWeight: 400 }}>· {t.reason}</span></p>
            <p style={{ color: C.gold, fontSize: 12, marginTop: 2 }}>→ {t.action}</p>
          </div>
          <button onClick={() => onCare(t)} disabled={caring === t.userId}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: caring === t.userId ? C.dim : C.accent, color: '#fff' }}>
            {caring === t.userId ? '执行中' : '执行关怀'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────
type SpaceKey = 'lifecycle' | 'rank' | 'claim'
const SPACES: { key: SpaceKey; label: string; states: string[] }[] = [
  { key: 'lifecycle', label: '生命周期态', states: LIFECYCLE_STATES },
  { key: 'rank', label: '段位六阶', states: RANK_STATES },
  { key: 'claim', label: '确权态', states: CLAIM_STATES },
]

export default function BehaviorAnalytics() {
  const [report, setReport] = useState<BehaviorReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [space, setSpace] = useState<SpaceKey>('lifecycle')
  const [caring, setCaring] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [optedOut, setOptedOut] = useState(0)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const raw = await loadBehaviorData()
      setOptedOut(raw.optedOutCount || 0)
      setReport(computeAll(raw))
    } catch (e: any) {
      setErr(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const matrix = useMemo<MatrixResult | null>(() => {
    if (!report) return null
    return space === 'lifecycle' ? report.lifecycle : space === 'rank' ? report.rank : report.claim
  }, [report, space])

  // 选中态的预测示例：取矩阵中“活跃/核心弟子/已确权”等代表态，预测 1 步
  const samplePredict = useMemo(() => {
    if (!matrix) return null
    const probe = space === 'lifecycle' ? '活跃' : space === 'rank' ? '核心弟子' : '已确权'
    const dist = predictNext(matrix, probe, 1)
    return { probe, dist }
  }, [matrix, space])

  const onCare = async (t: Trigger) => {
    setCaring(t.userId)
    const res = await executeCare(t)
    setCaring(null)
    setToast(res.ok ? `已向 ${t.nickname} 推送关怀（数据回流闭环）` : `关怀失败：${res.error}`)
    setTimeout(() => setToast(null), 3200)
  }

  if (loading) return <div style={{ color: C.sub, padding: 24 }}>行为分析计算中…</div>
  if (err) return <div style={{ color: C.red, padding: 24 }}>错误：{err}</div>
  if (!report) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: 0 }}>用户行为分析</h2>
        <p style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
          确定性统计模型（衰减因子 · 复购周期 · 马尔可夫链 · 流失风险）· 纯客户端聚合 · 零资金影响 · 可审计
          {optedOut > 0 && (
            <span style={{ color: C.gold }}> · 已退出个性化 {optedOut} 人（已排除出分析）</span>
          )}
        </p>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Kpi label="总用户数" value={fmt(report.totalUsers)} color={C.blue} />
        <Kpi label="全局复购周期" value={`${report.repurchase.globalMedianDays} 天`} color={C.green} sub="中位订单间隔" />
        <Kpi label="流失风险用户" value={`${report.churn.length}`} color={C.red} sub="超复购周期 1.5 倍未购" />
        <Kpi label="平均衰减活跃度" value={`${report.decay.mean}`} color={C.gold} sub="近 30 天指数加权" />
        <Kpi label="命中触发规则" value={`${report.triggers.length}`} color={C.purple} sub="可一键关怀闭环" />
      </div>

      {/* 马尔可夫 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: 0 }}>马尔可夫转移矩阵</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {SPACES.map(s => (
              <button key={s.key} onClick={() => setSpace(s.key)}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  background: space === s.key ? C.accent : 'transparent', color: space === s.key ? '#fff' : C.sub,
                  border: `1px solid ${space === s.key ? C.accent : C.border}` }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {matrix && <MarkovHeatmap m={matrix} />}
        {samplePredict && (
          <p style={{ color: C.dim, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            示例预测：当前「{samplePredict.probe}」→ 下一步很可能
            {Object.entries(samplePredict.dist).sort((a, b) => b[1] - a[1]).slice(0, 2)
              .map(([k, v]) => ` ${k} ${(v * 100).toFixed(0)}%`).join('、')}
          </p>
        )}
      </div>

      {/* 复购 + 衰减 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>复购周期分布</h3>
          <Histogram data={report.repurchase.histogram} />
        </div>
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>高活跃度 Top 用户（衰减分）</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.decay.top.slice(0, 10).map(u => (
              <div key={u.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.text }}>{u.nickname}</span>
                <span style={{ color: C.gold, fontWeight: 600 }}>{u.score}</span>
              </div>
            ))}
            {!report.decay.top.length && <p style={{ color: C.dim, fontSize: 12 }}>暂无数据</p>}
          </div>
        </div>
      </div>

      {/* 流失风险 */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>流失风险名单（按风险分排序）</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {report.churn.slice(0, 15).map(u => (
            <div key={u.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 10px', background: '#0B1220', borderRadius: 8 }}>
              <div>
                <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{u.nickname}</span>
                <span style={{ color: C.dim, fontSize: 12, marginLeft: 8 }}>末单 {u.lastOrder} · 已 {u.daysSince} 天</span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                background: u.score > 0.66 ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)',
                color: u.score > 0.66 ? C.red : C.gold,
              }}>{Math.round(u.score * 100)}%</span>
            </div>
          ))}
          {!report.churn.length && <p style={{ color: C.dim, fontSize: 12 }}>暂无高风险用户，稳健。</p>}
        </div>
      </div>

      {/* 触发闭环 */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>触发规则 · 数据回流闭环</h3>
        <p style={{ color: C.dim, fontSize: 12, margin: '0 0 12px' }}>命中即「执行关怀」：写入 notifications，由订阅消息触达用户端（不直接动资金，合规安全）。</p>
        <TriggerPanel triggers={report.triggers} onCare={onCare} caring={caring} />
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: C.accent, color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
