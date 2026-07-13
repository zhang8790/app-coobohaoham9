import { useEffect, useState } from 'react'
import { getOrders, getOrderDetail, exportOrders, type OrderRow, type OrderDetail } from '@/api/finance'
import { downloadCSV, csvTimestamp, type CsvColumn } from '@/lib/csv'
import { maskPhone } from '@/utils/mask'

const C = {
  bg: '#0B0F19', card: '#0F172A', border: '#1F2937', text: '#E5E7EB',
  sub: '#9CA3AF', dim: '#6B7280', accent: '#C2410C', green: '#10B981',
  blue: '#3B82F6', purple: '#8B5CF6', gold: '#F59E0B',
}
const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px',
}
const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const fmtMoney = (n: number) => `¥${fmt(n)}`
const fmtDate = (s: string) => new Date(s).toLocaleString('zh-CN', { hour12: false })

const STATUS: Record<string, { label: string; color: string }> = {
  pending_pay: { label: '待支付', color: C.dim },
  pending_ship: { label: '待发货', color: C.gold },
  pending_receive: { label: '待收货', color: C.gold },
  pending_pickup: { label: '待核销', color: C.gold },
  pending_review: { label: '待评价', color: C.blue },
  completed: { label: '已完成', color: C.green },
  after_sale: { label: '售后', color: C.accent },
  cancelled: { label: '已取消', color: C.dim },
}
const st = (s: string) => STATUS[s] ?? { label: s, color: C.dim }

export default function Orders() {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('all')
  const [kw, setKw] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await exportOrders({ status, keyword: kw })
      const cols: CsvColumn[] = [
        { key: 'order_no', label: '订单号' },
        { key: 'buyer_nickname', label: '买家' },
        { key: 'buyer_phone', label: '手机号' },
        { key: 'store_name', label: '门店' },
        { key: 'total_amount', label: '成交额' },
        { key: 'gold_beans_used', label: '让利' },
        { key: 'platformNet', label: '平台实收估' },
        { key: 'status', label: '状态' },
        { key: 'refund_status', label: '退款状态' },
        { key: 'created_at', label: '下单时间' },
      ]
      const rows = data.map(r => ({
        ...r,
        platformNet: Math.round((r.total_amount - r.gold_beans_used) * 100) / 100,
        created_at: new Date(r.created_at).toLocaleString('zh-CN', { hour12: false }),
      }))
      downloadCSV(`成交订单_${csvTimestamp()}.csv`, rows as unknown as Record<string, unknown>[], cols)
    } finally {
      setExporting(false)
    }
  }

  const PAGE = 15
  const load = (p: number, st2: string, keyword: string) => {
    setLoading(true)
    getOrders(p, PAGE, { status: st2, keyword })
      .then(r => { setRows(r.data); setTotal(r.total); setPage(p) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(0, 'all', '') }, [])

  const openDetail = async (id: string) => {
    const d = await getOrderDetail(id)
    setDetail(d)
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))
  const gmvSum = rows.reduce((s, r) => s + r.total_amount, 0)
  const concessionSum = rows.reduce((s, r) => s + r.gold_beans_used, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>成交订单</h1>
          <p style={{ color: C.dim, fontSize: 14 }}>订单号 · 买家 · 门店 · 成交额 · 让利 · 平台实收 · 状态</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={status} onChange={e => { setStatus(e.target.value); load(0, e.target.value, kw) }}
            style={{ background: '#080C14', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 12px', fontSize: 13 }}>
            <option value="all">全部状态</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input placeholder="搜索订单号"
            value={kw}
            onChange={e => setKw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(0, status, kw)}
            style={{ background: '#080C14', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 12px', fontSize: 13, width: 200 }} />
          <button onClick={handleExport} disabled={exporting} style={btnStyle(exporting)}>{exporting ? '导出中…' : '⬇ 导出全部'}</button>
        </div>
      </div>

      {/* 本页汇总 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页成交额合计</p><p style={{ color: C.green, fontSize: 22, fontWeight: 700 }}>{fmtMoney(gmvSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页让利合计</p><p style={{ color: C.gold, fontSize: 22, fontWeight: 700 }}>{fmtMoney(concessionSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页平台实收估</p><p style={{ color: C.blue, fontSize: 22, fontWeight: 700 }}>{fmtMoney(gmvSum - concessionSum)}</p></div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#080C14', borderBottom: `1px solid ${C.border}` }}>
              {['订单号', '买家', '门店', '成交额', '让利', '平台实收估', '状态', '退款', '时间'].map(h => (
                <th key={h} style={{ color: C.dim, fontWeight: 500, padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = st(r.status)
              return (
                <tr key={r.id} onClick={() => openDetail(r.id)}
                  style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#141B2D')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                  <td style={{ padding: '10px 12px', color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.order_no ?? r.id.slice(0, 8)}</td>
                  <td style={{ padding: '10px 12px', color: C.text }}>
                    <div style={{ fontWeight: 500 }}>{r.buyer_nickname ?? '无名'}</div>
                    <div style={{ color: C.dim, fontSize: 12 }}>{maskPhone(r.buyer_phone)}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.sub, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.store_name ?? '平台'}</td>
                  <td style={{ padding: '10px 12px', color: C.green, fontWeight: 600 }}>{fmtMoney(r.total_amount)}</td>
                  <td style={{ padding: '10px 12px', color: C.gold }}>{fmtMoney(r.gold_beans_used)}</td>
                  <td style={{ padding: '10px 12px', color: C.blue, fontWeight: 600 }}>{fmtMoney(r.total_amount - r.gold_beans_used)}</td>
                  <td style={{ padding: '10px 12px' }}><span style={{ color: s.color, fontSize: 12 }}>● {s.label}</span></td>
                  <td style={{ padding: '10px 12px', color: r.refund_status && r.refund_status !== 'none' ? C.accent : C.dim, fontSize: 12 }}>
                    {r.refund_status && r.refund_status !== 'none' ? r.refund_status : '无'}
                  </td>
                  <td style={{ padding: '10px 12px', color: C.dim, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at).slice(0, 10)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: C.dim }}>暂无订单数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: C.dim, fontSize: 13 }}>
        <span>共 {fmt(total)} 笔订单</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={page <= 0} onClick={() => load(page - 1, status, kw)} style={btnStyle(page <= 0)}>上一页</button>
          <span style={{ color: C.sub }}>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => load(page + 1, status, kw)} style={btnStyle(page >= pages - 1)}>下一页</button>
        </div>
      </div>

      {/* 订单详情抽屉 */}
      {detail && (
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '92vw', background: C.bg, borderLeft: `1px solid ${C.border}`, height: '100%', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>订单详情</h2>
              <button onClick={() => setDetail(null)} style={btnStyle(false)}>关闭</button>
            </div>
            <OrderBlock d={detail} />
          </div>
        </div>
      )}
    </div>
  )
}

function OrderBlock({ d }: { d: OrderDetail }) {
  const s = st(d.status)
  const cells: [string, string, string?][] = [
    ['订单号', d.order_no ?? d.id, 'mono'],
    ['状态', `${s.label}`, 'status'],
    ['门店', d.store_name ?? '平台直营'],
    ['买家', d.buyer_nickname ?? '无名'],
    ['买家手机', maskPhone(d.buyer_phone)],
    ['推荐人(上线)', d.referrer_nickname ?? '无'],
    ['成交额', fmtMoney(d.total_amount), 'money'],
    ['让利(金豆抵扣)', fmtMoney(d.gold_beans_used), 'money'],
    ['佣金扣减', fmtMoney(d.commissionTotal), 'money'],
    ['平台实收(精确)', fmtMoney(d.platformNet), 'money'],
    ['退款状态', d.refund_status && d.refund_status !== 'none' ? d.refund_status : '无'],
    ['下单时间', fmtDate(d.created_at)],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {cells.map(([k, v, kind]) => (
        <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ color: C.dim, fontSize: 11, marginBottom: 4 }}>{k}</p>
          <p style={{
            color: kind === 'money' ? C.green : kind === 'status' ? s.color : C.text,
            fontSize: 13, fontWeight: 500, wordBreak: 'break-all',
            fontFamily: kind === 'mono' ? 'monospace' : 'inherit',
          }}>{v}</p>
        </div>
      ))}
    </div>
  )
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
  color: disabled ? C.dim : C.sub, cursor: disabled ? 'not-allowed' : 'pointer',
  padding: '6px 14px', fontSize: 13, opacity: disabled ? 0.5 : 1,
})
