import { useEffect, useState } from 'react'
import {
  getPointsLedger, getEmotionLedger, getCommissionLedger, getGoldBeanLedger,
  exportPointsLedger, exportEmotionLedger, exportCommissionLedger, exportGoldBeanLedger,
  type PointsLedgerRow, type EmotionLedgerRow, type CommissionRow, type GoldBeanLedgerRow,
} from '@/api/finance'
import { downloadCSV, csvTimestamp, type CsvColumn } from '@/lib/csv'
import { maskPhone } from '@/utils/mask'

const C = {
  bg: '#0B0F19', card: '#0F172A', border: '#1F2937', text: '#E5E7EB',
  sub: '#9CA3AF', dim: '#6B7280', accent: '#C2410C', green: '#10B981',
  blue: '#3B82F6', purple: '#8B5CF6', gold: '#F59E0B', red: '#EF4444',
}
const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px',
}
const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const fmtMoney = (n: number) => `¥${fmt(n)}`
const fmtDate = (s: string) => new Date(s).toLocaleString('zh-CN', { hour12: false })

const POINT_TYPES: [string, string][] = [
  ['purchase_earn', '消费得积分'], ['invite_earn', '邀请得积分'], ['checkin_earn', '签到得积分'],
  ['ugc_earn', 'UGC得积分'], ['redeem_spend', '积分兑换'], ['pay_spend', '支付扣积分'],
  ['lottery_spend', '抽奖扣积分'], ['refund_deduct', '退款扣积分'],
]
const ptLabel = (t: string) => POINT_TYPES.find(([k]) => k === t)?.[1] ?? t

const REASONS: [string, string][] = [
  ['emotion_claim', '情绪确权'], ['emotion_feed', '情绪喂养'], ['emotion_exchange', '通宝兑换'],
  ['admin_adjust', '后台调整'],
]
const reasonLabel = (r: string) => REASONS.find(([k]) => k === r)?.[1] ?? r

const COMMISSION_STATUS: [string, string][] = [
  ['pending', '待结算'], ['settled', '已结算'], ['refunded', '已退款'],
]
const csLabel = (s: string) => COMMISSION_STATUS.find(([k]) => k === s)?.[1] ?? s

const GOLD_TYPES: [string, string][] = [
  ['purchase_spend', '消费抵扣'], ['refund_return', '退款返还'],
  ['recharge', '金豆充值'], ['admin_grant', '后台发放'], ['admin_deduct', '后台扣减'],
]
const gbLabel = (t: string) => GOLD_TYPES.find(([k]) => k === t)?.[1] ?? t

type Tab = 'points' | 'emotion' | 'commission' | 'gold'
const TABS: [Tab, string, string][] = [
  ['points', '🟢 积分流水', 'points_logs'],
  ['emotion', '🔵 情绪豆流水', 'emotion_tongbao_logs'],
  ['commission', '🟠 佣金流水', 'commissions'],
  ['gold', '🟡 金豆流水', 'gold_bean_logs'],
]

export default function Ledgers() {
  const [tab, setTab] = useState<Tab>('points')
  const [page, setPage] = useState(0)
  const [kw, setKw] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [level, setLevel] = useState('all')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const PAGE = 15

  const handleExport = async () => {
    setExporting(true)
    try {
      const fmtT = (s: string) => new Date(s).toLocaleString('zh-CN', { hour12: false })
      if (tab === 'points') {
        const data = await exportPointsLedger({ type, keyword: kw })
        const cols: CsvColumn[] = [
          { key: 'created_at', label: '时间' }, { key: 'nickname', label: '用户' },
          { key: 'phone', label: '手机号' }, { key: 'type', label: '类型' },
          { key: 'delta', label: '变动' }, { key: 'balance_after', label: '变动后余额' },
          { key: 'order_id', label: '关联订单' }, { key: 'remark', label: '备注' },
        ]
        const rows = data.map(r => ({ ...r, type: ptLabel(r.type), created_at: fmtT(r.created_at) }))
        downloadCSV(`积分流水_${csvTimestamp()}.csv`, rows as unknown as Record<string, unknown>[], cols)
      } else if (tab === 'emotion') {
        const data = await exportEmotionLedger({ reason: type, keyword: kw })
        const cols: CsvColumn[] = [
          { key: 'created_at', label: '时间' }, { key: 'nickname', label: '用户' },
          { key: 'phone', label: '手机号' }, { key: 'reason', label: '原因' },
          { key: 'delta', label: '变动' }, { key: 'balance_after', label: '变动后余额' },
          { key: 'ref_id', label: '关联ID' }, { key: 'remark', label: '备注' },
        ]
        const rows = data.map(r => ({ ...r, reason: reasonLabel(r.reason), created_at: fmtT(r.created_at) }))
        downloadCSV(`情绪豆流水_${csvTimestamp()}.csv`, rows as unknown as Record<string, unknown>[], cols)
      } else if (tab === 'gold') {
        const data = await exportGoldBeanLedger({ type, keyword: kw })
        const cols: CsvColumn[] = [
          { key: 'created_at', label: '时间' }, { key: 'nickname', label: '用户' },
          { key: 'phone', label: '手机号' }, { key: 'type', label: '类型' },
          { key: 'delta', label: '变动' }, { key: 'balance_after', label: '变动后余额' },
          { key: 'order_id', label: '关联订单' }, { key: 'remark', label: '备注' },
        ]
        const rows = data.map(r => ({ ...r, type: gbLabel(r.type), created_at: fmtT(r.created_at) }))
        downloadCSV(`金豆流水_${csvTimestamp()}.csv`, rows as unknown as Record<string, unknown>[], cols)
      } else {
        const data = await exportCommissionLedger({ status, level, keyword: kw })
        const cols: CsvColumn[] = [
          { key: 'created_at', label: '时间' }, { key: 'order_no', label: '订单号' },
          { key: 'beneficiary_nickname', label: '受益人' }, { key: 'payer_nickname', label: '付款人' },
          { key: 'level', label: '层级' }, { key: 'rank_at_time', label: '段位' },
          { key: 'ratio', label: '比例' }, { key: 'pool_amount', label: '让利池' },
          { key: 'commission_amount', label: '佣金' }, { key: 'status', label: '状态' },
        ]
        const rows = data.map(r => ({
          ...r, level: r.level === 1 ? '直推L1' : '间推L2',
          ratio: (r.ratio * 100).toFixed(2) + '%', status: csLabel(r.status), created_at: fmtT(r.created_at),
        }))
        downloadCSV(`佣金流水_${csvTimestamp()}.csv`, rows as unknown as Record<string, unknown>[], cols)
      }
    } finally {
      setExporting(false)
    }
  }

  const load = (t: Tab, p: number, f: { kw: string; type: string; status: string; level: string }) => {
    setLoading(true)
    const req =
      t === 'points' ? getPointsLedger(p, PAGE, { type: f.type, keyword: f.kw })
      : t === 'emotion' ? getEmotionLedger(p, PAGE, { reason: f.type, keyword: f.kw })
      : t === 'gold' ? getGoldBeanLedger(p, PAGE, { type: f.type, keyword: f.kw })
      : getCommissionLedger(p, PAGE, { status: f.status, level: f.level, keyword: f.kw })
    req.then(r => { setRows(r.data as any[]); setTotal(r.total); setPage(p) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const f = { kw, type, status, level }
    load(tab, 0, f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const reload = () => load(tab, page, { kw, type, status, level })
  const resetFilters = () => { setKw(''); setType('all'); setStatus('all'); setLevel('all'); load(tab, 0, { kw: '', type: 'all', status: 'all', level: 'all' }) }

  const switchTab = (t: Tab) => {
    setTab(t); setPage(0); setKw(''); setType('all'); setStatus('all'); setLevel('all')
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))

  // 每标签本页 KPI
  let kpis: { label: string; value: string; color: string }[] = []
  if (tab === 'points' || tab === 'emotion' || tab === 'gold') {
    const inc = (rows as any[]).reduce((s, r) => s + (r.delta > 0 ? r.delta : 0), 0)
    const dec = (rows as any[]).reduce((s, r) => s + (r.delta < 0 ? -r.delta : 0), 0)
    const incLabel = tab === 'points' ? '本页积分+ ' : tab === 'emotion' ? '本页通宝发放+ ' : '本页金豆+ '
    const decLabel = tab === 'points' ? '本页积分− ' : tab === 'emotion' ? '本页通宝消耗− ' : '本页金豆− '
    kpis = [
      { label: '本页笔数', value: fmt(rows.length), color: C.text },
      { label: incLabel, value: fmt(inc), color: C.green },
      { label: decLabel, value: fmt(dec), color: C.red },
    ]
  } else {
    const sum = (rows as CommissionRow[]).reduce((s, r) => s + r.commission_amount, 0)
    const settled = (rows as CommissionRow[]).filter(r => r.status === 'settled').reduce((s, r) => s + r.commission_amount, 0)
    const pending = (rows as CommissionRow[]).filter(r => r.status === 'pending').reduce((s, r) => s + r.commission_amount, 0)
    kpis = [
      { label: '本页佣金合计', value: fmtMoney(sum), color: C.gold },
      { label: '已结算', value: fmtMoney(settled), color: C.green },
      { label: '待结算', value: fmtMoney(pending), color: C.blue },
    ]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 标题 + 标签页 */}
      <div>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>资产流水中心</h1>
        <p style={{ color: C.dim, fontSize: 14 }}>积分 / 情绪豆 / 佣金 / 金豆 — 全平台逐笔明细，与用户端同源</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {TABS.map(([t, label, tbl]) => (
            <button key={t} onClick={() => switchTab(t)}
              style={{
                background: tab === t ? C.card : 'transparent',
                border: `1px solid ${tab === t ? C.accent : C.border}`,
                borderRadius: 8, color: tab === t ? C.text : C.sub,
                padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: tab === t ? 600 : 400,
              }}>
              {label}
              <span style={{ color: C.dim, fontSize: 11, marginLeft: 6 }}>{tbl}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI 汇总 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={cardStyle}>
            <p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 22, fontWeight: 700 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tab !== 'commission' ? (
          <select value={type}
            onChange={e => { setType(e.target.value); load(tab, 0, { kw, type: e.target.value, status, level }) }}
            style={selStyle}>
            <option value="all">{tab === 'gold' ? '全部类型' : tab === 'points' ? '全部类型' : '全部原因'}</option>
            {(tab === 'points' ? POINT_TYPES : tab === 'emotion' ? REASONS : GOLD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ) : (
          <>
            <select value={status}
              onChange={e => { setStatus(e.target.value); load(tab, 0, { kw, type, status: e.target.value, level }) }}
              style={selStyle}>
              <option value="all">全部结算状态</option>
              {COMMISSION_STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={level}
              onChange={e => { setLevel(e.target.value); load(tab, 0, { kw, type, status, level: e.target.value }) }}
              style={selStyle}>
              <option value="all">全部层级</option>
              <option value="1">直推(L1)</option>
              <option value="2">间推(L2)</option>
            </select>
          </>
        )}
        <input placeholder={tab === 'commission' ? '搜索订单号' : (tab === 'points' ? '搜索备注' : tab === 'gold' ? '搜索备注/关联订单' : '搜索备注/关联ID')}
          value={kw}
          onChange={e => setKw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(tab, 0, { kw, type, status, level })}
          style={{ ...selStyle, width: 220 }} />
        <button onClick={reload} style={btnStyle(false)}>查询</button>
        <button onClick={resetFilters} style={btnStyle(false)}>重置</button>
        <button onClick={handleExport} disabled={exporting} style={btnStyle(exporting)}>{exporting ? '导出中…' : '⬇ 导出全部'}</button>
      </div>

      {/* 表格 */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#080C14', borderBottom: `1px solid ${C.border}` }}>
                {headCols(tab).map(h => (
                  <th key={h} style={{ color: C.dim, fontWeight: 500, padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === 'points' && (rows as PointsLedgerRow[]).map(r => (
                <tr key={r.id} style={rowStyle}>
                  <td style={tdDate}>{fmtDate(r.created_at)}</td>
                  <td style={tdText}><div style={{ fontWeight: 500 }}>{r.nickname ?? '无名'}</div><div style={{ color: C.dim, fontSize: 12 }}>{maskPhone(r.phone)}</div></td>
                  <td style={tdText}>{ptLabel(r.type)}</td>
                  <td style={{ ...tdText, color: r.delta >= 0 ? C.green : C.red, fontWeight: 600 }}>{r.delta >= 0 ? '+' : ''}{fmt(r.delta)}</td>
                  <td style={tdText}>{fmt(r.balance_after)}</td>
                  <td style={{ ...tdText, color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.order_id ? r.order_id.slice(0, 8) : '—'}</td>
                  <td style={{ ...tdText, color: C.dim, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.remark ?? '—'}</td>
                </tr>
              ))}
              {tab === 'emotion' && (rows as EmotionLedgerRow[]).map(r => (
                <tr key={r.id} style={rowStyle}>
                  <td style={tdDate}>{fmtDate(r.created_at)}</td>
                  <td style={tdText}><div style={{ fontWeight: 500 }}>{r.nickname ?? '无名'}</div><div style={{ color: C.dim, fontSize: 12 }}>{maskPhone(r.phone)}</div></td>
                  <td style={tdText}>{reasonLabel(r.reason)}</td>
                  <td style={{ ...tdText, color: r.delta >= 0 ? C.green : C.red, fontWeight: 600 }}>{r.delta >= 0 ? '+' : ''}{fmt(r.delta)}</td>
                  <td style={tdText}>{fmt(r.balance_after)}</td>
                  <td style={{ ...tdText, color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.ref_id ?? '—'}</td>
                  <td style={{ ...tdText, color: C.dim, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.remark ?? '—'}</td>
                </tr>
              ))}
              {tab === 'gold' && (rows as GoldBeanLedgerRow[]).map(r => (
                <tr key={r.id} style={rowStyle}>
                  <td style={tdDate}>{fmtDate(r.created_at)}</td>
                  <td style={tdText}><div style={{ fontWeight: 500 }}>{r.nickname ?? '无名'}</div><div style={{ color: C.dim, fontSize: 12 }}>{maskPhone(r.phone)}</div></td>
                  <td style={tdText}>{gbLabel(r.type)}</td>
                  <td style={{ ...tdText, color: r.delta >= 0 ? C.green : C.red, fontWeight: 600 }}>{r.delta >= 0 ? '+' : ''}{fmt(r.delta)}</td>
                  <td style={tdText}>{fmt(r.balance_after)}</td>
                  <td style={{ ...tdText, color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.order_id ? r.order_id.slice(0, 8) : '—'}</td>
                  <td style={{ ...tdText, color: C.dim, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.remark ?? '—'}</td>
                </tr>
              ))}
              {tab === 'commission' && (rows as CommissionRow[]).map(r => (
                <tr key={r.id} style={rowStyle}>
                  <td style={tdDate}>{fmtDate(r.created_at)}</td>
                  <td style={{ ...tdText, color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.order_no}</td>
                  <td style={tdText}><div style={{ fontWeight: 500 }}>{r.beneficiary_nickname ?? '无名'}</div><div style={{ color: C.dim, fontSize: 12 }}>付款: {r.payer_nickname ?? '—'}</div></td>
                  <td style={tdText}><span style={{ color: r.level === 1 ? C.blue : C.purple, fontSize: 12 }}>{r.level === 1 ? '直推L1' : '间推L2'}</span></td>
                  <td style={tdText}>{r.rank_at_time}</td>
                  <td style={{ ...tdText, color: C.sub }}>{(r.ratio * 100).toFixed(2)}%</td>
                  <td style={{ ...tdText, color: C.gold }}>{fmtMoney(r.pool_amount)}</td>
                  <td style={{ ...tdText, color: C.green, fontWeight: 600 }}>{fmtMoney(r.commission_amount)}</td>
                  <td style={tdText}><span style={{ color: csColor(r.status), fontSize: 12 }}>● {csLabel(r.status)}</span></td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={headCols(tab).length} style={{ padding: 32, textAlign: 'center', color: C.dim }}>
                  {tab === 'gold'
                    ? '暂无金豆流水（请先确认本机已执行 00076 迁移建 gold_bean_logs 表，且小程序已写入）'
                    : '暂无流水数据（请先确认本机已执行 00075 迁移放开 points_logs RLS）'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: C.dim, fontSize: 13 }}>
        <span>共 {fmt(total)} 条记录</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={page <= 0} onClick={() => load(tab, page - 1, { kw, type, status, level })} style={btnStyle(page <= 0)}>上一页</button>
          <span style={{ color: C.sub }}>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => load(tab, page + 1, { kw, type, status, level })} style={btnStyle(page >= pages - 1)}>下一页</button>
        </div>
      </div>
    </div>
  )
}

function headCols(tab: Tab): string[] {
  if (tab === 'points') return ['时间', '用户', '类型', '变动', '变动后余额', '关联订单', '备注']
  if (tab === 'emotion') return ['时间', '用户', '原因', '变动', '变动后余额', '关联ID', '备注']
  if (tab === 'gold') return ['时间', '用户', '类型', '变动', '变动后余额', '关联订单', '备注']
  return ['时间', '订单号', '受益人 / 付款人', '层级', '段位', '比例', '让利池', '佣金', '状态']
}
const csColor = (s: string) => s === 'settled' ? C.green : s === 'refunded' ? C.red : C.blue

const selStyle: React.CSSProperties = {
  background: '#080C14', border: `1px solid ${C.border}`, borderRadius: 8,
  color: C.text, padding: '8px 12px', fontSize: 13,
}
const tdText: React.CSSProperties = { padding: '10px 12px', color: C.text }
const tdDate: React.CSSProperties = { padding: '10px 12px', color: C.dim, whiteSpace: 'nowrap' }
const rowStyle: React.CSSProperties = {
  borderBottom: `1px solid ${C.border}`,
  cursor: 'default',
}
const btnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
  color: disabled ? C.dim : C.sub, cursor: disabled ? 'not-allowed' : 'pointer',
  padding: '6px 14px', fontSize: 13, opacity: disabled ? 0.5 : 1,
})
