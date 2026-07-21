import { useEffect, useState } from 'react'
import { getOrders, getOrderDetail, getOrderItemCommissions, exportOrders, type OrderRow, type OrderDetail, type ProductCommissionRow } from '@/api/finance'
import { downloadCSV, csvTimestamp, type CsvColumn } from '@/lib/csv'
import { maskPhone } from '@/utils/mask'
import { supabase } from '@/lib/supabase'

const C = {
  bg: 'var(--bg)', card: 'var(--card)', border: 'var(--border)', text: 'var(--text)',
  sub: 'var(--text-muted)', dim: 'var(--text-dim)', accent: 'var(--primary)', green: 'var(--success-strong)',
  blue: 'var(--info)', purple: 'var(--accent)', gold: 'var(--warning)',
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
  const [itemCommissions, setItemCommissions] = useState<ProductCommissionRow[]>([])
  const [exporting, setExporting] = useState(false)
  const [autoCompleting, setAutoCompleting] = useState(false)

  // 一键触发 auto-complete-orders EF（沙箱无 CLI，须先在用户 Supabase 部署该 EF）
  // 作用：把 verified_at 早于 7 天前的 pending_review 订单批量置 completed，
  //       由触发器 trg_orders_settle 同步结算货款到 stores.merchant_balance
  const handleAutoComplete = async () => {
    if (!confirm('将把超过 7 天的「待评价」订单自动置为已完成并结算货款，确认？')) return
    setAutoCompleting(true)
    try {
      const { data, error } = await supabase.functions.invoke('auto-complete-orders', { method: 'POST' })
      if (error) {
        alert(`执行失败：${error.message}`)
      } else {
        const r = data as any
        const n = r?.completed ?? 0
        const days = r?.threshold_days ?? 7
        const list: string[] = r?.orders ?? []
        const tail = list.length > 0 ? `\n\n订单号（前 ${Math.min(5, list.length)} 条）：\n${list.slice(0, 5).join('\n')}` : ''
        alert(n === 0
          ? `当前没有超过 ${days} 天的待评价订单，无需处理`
          : `✅ 已自动完成 ${n} 笔订单（阈值 ${days} 天），货款已由触发器自动结算${tail}`)
        load(0, status, kw)
      }
    } catch (e: any) {
      alert('执行失败：' + (e?.message || e))
    } finally {
      setAutoCompleting(false)
    }
  }

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
        { key: 'tb_used', label: '金豆抵扣' },
        { key: 'commission_total', label: '佣金' },
        { key: 'commission_l1', label: '一级佣金' },
        { key: 'commission_l2', label: '二级佣金' },
        { key: 'buyer_points', label: '买家金豆' },
        { key: 'platform_share', label: '平台佣金' },
        { key: 'platformNet', label: '门店收益' },
        { key: 'commission_distributed', label: '佣金状态' },
        { key: 'status', label: '状态' },
        { key: 'refund_status', label: '退款状态' },
        { key: 'created_at', label: '下单时间' },
      ]
      const rows = data.map(r => ({
        ...r,
        platformNet: r.store_revenue,
        commission_distributed: r.commission_distributed ? '已发佣金' : '未发佣金',
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
    const [d, items] = await Promise.all([
      getOrderDetail(id),
      getOrderItemCommissions(id),
    ])
    setDetail(d)
    setItemCommissions(items ?? [])
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))
  const gmvSum = rows.reduce((s, r) => s + r.total_amount, 0)
  const cashSum = rows.reduce((s, r) => s + Math.max(0, r.total_amount - r.tb_used), 0)
  const concessionSum = rows.reduce((s, r) => s + Math.min(r.tb_used, r.total_amount), 0)
  const commissionSum = rows.reduce((s, r) => s + r.commission_total, 0)
  const commissionL1Sum = rows.reduce((s, r) => s + r.commission_l1, 0)
  const commissionL2Sum = rows.reduce((s, r) => s + r.commission_l2, 0)
  const buyerPointsSum = rows.reduce((s, r) => s + r.buyer_points, 0)
  // 财务拆解汇总：让利 = total × effective_rate；
  // 平台佣金(平台自有部分) = 让利 − 佣金(已分) − 买家金豆
  // 现金实收 = 成交额 − 金豆抵扣；门店收益 = 成交额 − 已发佣金(l1+l2)
  // 买家金豆从让利中分出，与佣金同源
  const letAmtSum = rows.reduce((s, r) => s + Math.round(r.total_amount * (r.effective_rate ?? 0.09) * 100) / 100, 0)
  const platShareSum = Math.max(0, Math.round((letAmtSum - commissionSum - buyerPointsSum) * 100) / 100)
  const platNetSum = rows.reduce((s, r) => s + r.store_revenue, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>成交订单</h1>
          <p style={{ color: C.dim, fontSize: 14 }}>
            让利金额按让利率计提，在一级佣金 / 二级佣金 / 买家金豆 / 平台佣金间分配；门店收益为商家实际到账货款（取自结算台账）
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={status} onChange={e => { setStatus(e.target.value); load(0, e.target.value, kw) }}
            style={{ background: 'var(--surface)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 12px', fontSize: 13 }}>
            <option value="all">全部状态</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input placeholder="搜索订单号"
            value={kw}
            onChange={e => setKw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(0, status, kw)}
            style={{ background: 'var(--surface)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 12px', fontSize: 13, width: 200 }} />
          <button onClick={handleExport} disabled={exporting} style={btnStyle(exporting)}>{exporting ? '导出中…' : '导出全部'}</button>
          <button
            onClick={handleAutoComplete}
            disabled={autoCompleting}
            title="把超过 7 天的「待评价」订单自动置为已完成，并触发货款结算"
            style={{
              background: autoCompleting ? 'var(--border)' : 'var(--primary-disabled)',
              border: `1px solid ${autoCompleting ? 'var(--border-soft)' : 'var(--primary)'}`,
              borderRadius: 8, color: 'var(--primary-hover)',
              padding: '8px 14px', fontSize: 13, fontWeight: 600,
              cursor: autoCompleting ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {autoCompleting ? '处理中…' : '自动完成超时订单'}
          </button>
        </div>
      </div>

      {/* 本页汇总 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页成交额合计</p><p style={{ color: C.green, fontSize: 22, fontWeight: 700 }}>{fmtMoney(gmvSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页金豆抵扣合计</p><p style={{ color: C.gold, fontSize: 22, fontWeight: 700 }}>{fmtMoney(concessionSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页让利金额合计</p><p style={{ color: C.gold, fontSize: 22, fontWeight: 700 }}>{fmtMoney(letAmtSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页佣金合计（已分上线）</p><p style={{ color: C.purple, fontSize: 22, fontWeight: 700 }}>{fmtMoney(commissionSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页一级佣金合计</p><p style={{ color: C.purple, fontSize: 22, fontWeight: 700 }}>{fmtMoney(commissionL1Sum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页二级佣金合计</p><p style={{ color: C.purple, fontSize: 22, fontWeight: 700 }}>{fmtMoney(commissionL2Sum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页买家金豆合计</p><p style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}>{fmtMoney(buyerPointsSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页平台佣金合计</p><p style={{ color: C.accent, fontSize: 22, fontWeight: 700 }}>{fmtMoney(platShareSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页平台现金实收合计</p><p style={{ color: C.blue, fontSize: 22, fontWeight: 700 }}>{fmtMoney(cashSum)}</p></div>
        <div style={cardStyle}><p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>本页门店收益合计</p><p style={{ color: C.green, fontSize: 22, fontWeight: 700 }}>{fmtMoney(platNetSum)}</p></div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: `1px solid ${C.border}` }}>
              {['订单号', '买家', '门店', '成交额', '金豆抵扣', '平台现金实收', '让利率', '让利金额', '一级佣金', '二级佣金', '买家金豆', '平台佣金', '门店收益', '佣金状态', '状态', '退款', '时间'].map(h => (
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
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                  <td style={{ padding: '10px 12px', color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.order_no ?? r.id.slice(0, 8)}</td>
                  <td style={{ padding: '10px 12px', color: C.text }}>
                    <div style={{ fontWeight: 500 }}>{r.buyer_nickname ?? '无名'}</div>
                    <div style={{ color: C.dim, fontSize: 12 }}>{maskPhone(r.buyer_phone)}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.sub, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.store_name ?? '平台'}</td>
                  <td style={{ padding: '10px 12px', color: C.green, fontWeight: 600 }}>{fmtMoney(r.total_amount)}</td>
                  <td style={{ padding: '10px 12px', color: C.gold }}>{fmtMoney(r.tb_used)}</td>
                  <td style={{ padding: '10px 12px', color: C.blue, fontWeight: 600 }}>
                    {fmtMoney(Math.max(0, r.total_amount - r.tb_used))}
                  </td>
                  {(() => {
                    // 财务拆解：让利 = total × effective_rate；
                    // 平台佣金 = 让利 − 一级佣金 − 二级佣金 − 买家金豆
                    // 门店收益 = 成交额 − 已发佣金(l1+l2)
                    const rate = r.effective_rate ?? 0.09
                    const concession = Math.round(r.total_amount * rate * 100) / 100
                    const platformNet = r.store_revenue
                    return <>
                      <td style={{ padding: '10px 12px', color: C.dim, fontSize: 12 }}>{(rate * 100).toFixed(0)}%</td>
                      <td style={{ padding: '10px 12px', color: C.gold }}>{fmtMoney(concession)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--accent)', fontWeight: 600 }}>{fmtMoney(r.commission_l1)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--accent)', fontWeight: 600 }}>{fmtMoney(r.commission_l2)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--accent)', fontWeight: 600 }}>{fmtMoney(r.buyer_points)}</td>
                      <td style={{ padding: '10px 12px', color: C.accent, fontWeight: 600 }}>{fmtMoney(r.platform_share)}</td>
                      <td style={{ padding: '10px 12px', color: C.green, fontWeight: 600 }}>{fmtMoney(platformNet)}</td>
                    </>
                  })()}
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      color: r.commission_distributed ? C.green : C.accent,
                      fontSize: 12, fontWeight: 600,
                    }}>{r.commission_distributed ? '已发佣金' : '未发佣金'}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}><span style={{ color: s.color, fontSize: 12 }}>● {s.label}</span></td>
                  <td style={{ padding: '10px 12px', color: r.refund_status && r.refund_status !== 'none' ? C.accent : C.dim, fontSize: 12 }}>
                    {r.refund_status && r.refund_status !== 'none' ? r.refund_status : '无'}
                  </td>
                  <td style={{ padding: '10px 12px', color: C.dim, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at).slice(0, 10)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={17} style={{ padding: 32, textAlign: 'center', color: C.dim }}>暂无订单数据</td></tr>
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
        <div onClick={() => { setDetail(null); setItemCommissions([]) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '92vw', background: C.bg, borderLeft: `1px solid ${C.border}`, height: '100%', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>订单详情</h2>
              <button onClick={() => { setDetail(null); setItemCommissions([]) }} style={btnStyle(false)}>关闭</button>
            </div>
            <OrderBlock d={detail} items={itemCommissions} />
          </div>
        </div>
      )}
    </div>
  )
}

function OrderBlock({ d, items = [] }: { d: OrderDetail; items?: ProductCommissionRow[] }) {
  const s = st(d.status)
  const cells: [string, string, string?][] = [
    ['订单号', d.order_no ?? d.id, 'mono'],
    ['状态', `${s.label}`, 'status'],
    ['门店', d.store_name ?? '平台直营'],
    ['买家', d.buyer_nickname ?? '无名'],
    ['买家手机', maskPhone(d.buyer_phone)],
    ['推荐人(上线)', d.referrer_nickname ?? '无'],
    ['成交额', fmtMoney(d.total_amount), 'money'],
    ['让利(金豆抵扣)', fmtMoney(d.tb_used), 'money'],
    ['一级佣金', fmtMoney(d.commission_l1), 'money'],
    ['二级佣金', fmtMoney(d.commission_l2), 'money'],
    ['买家金豆', fmtMoney(d.buyer_points), 'money'],
    ['平台佣金', fmtMoney(d.platform_share), 'money'],
    ['佣金扣减', fmtMoney(d.commissionTotal), 'money'],
    ['门店收益', fmtMoney(d.platformNet), 'money'],
    ['退款状态', d.refund_status && d.refund_status !== 'none' ? d.refund_status : '无'],
    ['下单时间', fmtDate(d.created_at)],
  ]
  const sum = (sel: (it: ProductCommissionRow) => number) => items.reduce((acc, it) => acc + sel(it), 0)
  // 退款净留存 = 原值 × (1 - 退款比例)；退款比例为 0 时等于原值
  const net = (v: number, ratio: number) => Math.round(v * (1 - ratio) * 100) / 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {/* 商品级分佣明细：按各商品自身让利点独立追溯，Σ = 订单汇总（零资损） */}
      {items.length > 0 && (
        <div>
          <h3 style={{ color: C.text, fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            商品级分佣明细
            <span style={{ color: C.dim, fontSize: 12, fontWeight: 400 }}>（每商品按自身让利点追溯；已退款行按退款比例折净留存）</span>
          </h3>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: `1px solid ${C.border}` }}>
                  {['商品', '小计', '让利率', '让利池', '一级佣金', '二级佣金', '买家金豆', '平台佣金'].map(h => (
                    <th key={h} style={{ color: C.dim, fontWeight: 500, padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', color: C.text, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.product_name ?? undefined}>
                      {it.product_name ?? it.product_id ?? '商品'}
                    </td>
                    <td style={{ padding: '8px 10px', color: C.green, fontWeight: 600 }}>{fmtMoney(it.item_total)}</td>
                    <td style={{ padding: '8px 10px', color: C.dim }}>{(it.product_discount_rate * 100).toFixed(0)}%</td>
                    <td style={{ padding: '8px 10px', color: C.gold }}>{fmtMoney(it.discount_pool)}</td>
                    <td style={{ padding: '8px 10px', color: it.refund_ratio > 0 ? C.accent : 'var(--accent)', fontWeight: 600 }}>
                      {fmtMoney(net(it.l1_commission, it.refund_ratio))}
                      {it.refund_ratio > 0 && <div style={{ color: C.accent, fontSize: 11, fontWeight: 400 }}>回冲 {(it.refund_ratio * 100).toFixed(0)}%</div>}
                      {it.l1_nickname && <div style={{ color: C.dim, fontSize: 11, fontWeight: 400 }}>{it.l1_nickname}{it.l1_rank ? `·${it.l1_rank}` : ''}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', color: it.refund_ratio > 0 ? C.accent : 'var(--accent)', fontWeight: 600 }}>
                      {fmtMoney(net(it.l2_commission, it.refund_ratio))}
                      {it.refund_ratio > 0 && <div style={{ color: C.accent, fontSize: 11, fontWeight: 400 }}>回冲 {(it.refund_ratio * 100).toFixed(0)}%</div>}
                      {it.l2_nickname && <div style={{ color: C.dim, fontSize: 11, fontWeight: 400 }}>{it.l2_nickname}{it.l2_rank ? `·${it.l2_rank}` : ''}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', color: it.refund_ratio > 0 ? C.accent : 'var(--accent)', fontWeight: 600 }}>
                      {fmtMoney(net(it.buyer_points, it.refund_ratio))}
                      {it.refund_ratio > 0 && <div style={{ color: C.accent, fontSize: 11, fontWeight: 400 }}>回冲 {(it.refund_ratio * 100).toFixed(0)}%</div>}
                    </td>
                    <td style={{ padding: '8px 10px', color: C.accent, fontWeight: 600 }}>{fmtMoney(it.platform_income)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface)' }}>
                  <td style={{ padding: '8px 10px', color: C.text, fontWeight: 700 }}>合计 ({items.length} 件)</td>
                  <td style={{ padding: '8px 10px', color: C.green, fontWeight: 700 }}>{fmtMoney(sum(it => it.item_total))}</td>
                  <td style={{ padding: '8px 10px', color: C.dim }}>-</td>
                  <td style={{ padding: '8px 10px', color: C.gold, fontWeight: 700 }}>{fmtMoney(sum(it => it.discount_pool))}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--accent)', fontWeight: 700 }}>{fmtMoney(sum(it => net(it.l1_commission, it.refund_ratio)))}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--accent)', fontWeight: 700 }}>{fmtMoney(sum(it => net(it.l2_commission, it.refund_ratio)))}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--accent)', fontWeight: 700 }}>{fmtMoney(sum(it => net(it.buyer_points, it.refund_ratio)))}</td>
                  <td style={{ padding: '8px 10px', color: C.accent, fontWeight: 700 }}>{fmtMoney(sum(it => it.platform_income))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ color: C.dim, fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
            说明：每商品按自身 <b>让利率</b> 计算让利池；一级/二级佣金与买家金豆在整单层面统一封顶缩放后按商品占比分摊，Σ 与订单「一级佣金/二级佣金/买家金豆」汇总一致（零资损）。
          </p>
        </div>
      )}
    </div>
  )
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
  color: disabled ? C.dim : C.sub, cursor: disabled ? 'not-allowed' : 'pointer',
  padding: '6px 14px', fontSize: 13, opacity: disabled ? 0.5 : 1,
})
