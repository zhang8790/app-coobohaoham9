import { useEffect, useState } from 'react'
import { getMembers, getMemberDetail, adminAdjustGoldBean, type MemberRow, type MemberDetail } from '@/api/finance'
import { maskPhone, maskAddress } from '@/utils/mask'

const C = {
  bg: '#0B0F19', card: '#0F172A', border: '#1F2937', text: '#E5E7EB',
  sub: '#9CA3AF', dim: '#6B7280', accent: '#C2410C', green: '#10B981',
  blue: '#3B82F6', purple: '#8B5CF6', gold: '#F59E0B',
}
const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px',
}
const fmt = (n: number) => n.toLocaleString('zh-CN')
const fmtDate = (s: string) => new Date(s).toLocaleString('zh-CN', { hour12: false })

export default function Members() {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [kw, setKw] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{ row: MemberRow; data: MemberDetail } | null>(null)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjDir, setAdjDir] = useState<'grant' | 'deduct'>('grant')
  const [adjAmt, setAdjAmt] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjBusy, setAdjBusy] = useState(false)
  const [adjMsg, setAdjMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const PAGE = 15
  const load = (p: number, keyword: string) => {
    setLoading(true)
    getMembers(p, PAGE, keyword).then(r => { setRows(r.data); setTotal(r.total); setPage(p) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(0, '') }, [])

  const openDetail = async (row: MemberRow) => {
    const data = await getMemberDetail(row.id)
    setDetail({ row, data })
  }

  const doAdjust = async () => {
    if (!detail) return
    const amt = Number(adjAmt)
    if (!Number.isFinite(amt) || amt <= 0) { setAdjMsg({ ok: false, text: '请输入正数金额' }); return }
    setAdjBusy(true); setAdjMsg(null)
    const res = await adminAdjustGoldBean(detail.row.id, amt, adjDir, adjReason)
    setAdjBusy(false)
    if (res.ok) {
      setAdjMsg({ ok: true, text: `已${adjDir === 'grant' ? '发放' : '扣减'} ${amt} 情绪豆，余额 ${res.balanceAfter ?? ''}` })
      setAdjAmt(''); setAdjReason('')
      const data = await getMemberDetail(detail.row.id)
      setDetail({ row: data.profile ?? detail.row, data })
      load(page, kw)
    } else {
      setAdjMsg({ ok: false, text: res.error || '操作失败' })
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>会员明细</h1>
          <p style={{ color: C.dim, fontSize: 14 }}>会员 ID · 手机号 · 上线 · 注册时间 · 地址 · 积分 · 情绪豆</p>
        </div>
        <input
          placeholder="搜索手机号 / 昵称"
          value={kw}
          onChange={e => setKw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0, kw)}
          style={{ background: '#080C14', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 12px', fontSize: 13, width: 220 }}
        />
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#080C14', borderBottom: `1px solid ${C.border}` }}>
              {['会员ID', '昵称/手机号', '上线', '段位', '注册时间', '地址', '积分', '情绪豆', '状态'].map(h => (
                <th key={h} style={{ color: C.dim, fontWeight: 500, padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} onClick={() => openDetail(r)}
                style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#141B2D')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                <td style={{ padding: '10px 12px', color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{r.id.slice(0, 8)}…</td>
                <td style={{ padding: '10px 12px', color: C.text }}>
                  <div style={{ fontWeight: 500 }}>{r.nickname}</div>
                  <div style={{ color: C.dim, fontSize: 12 }}>{maskPhone(r.phone)}</div>
                </td>
                <td style={{ padding: '10px 12px', color: C.sub }}>{r.referrer_nickname ?? <span style={{ color: C.dim }}>无</span>}</td>
                <td style={{ padding: '10px 12px', color: C.gold }}>{r.member_rank}</td>
                <td style={{ padding: '10px 12px', color: C.dim, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at).slice(0, 10)}</td>
                <td style={{ padding: '10px 12px', color: C.sub, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{maskAddress(r.address)}</td>
                <td style={{ padding: '10px 12px', color: C.blue, fontWeight: 600 }}>{fmt(r.points)}</td>
                <td style={{ padding: '10px 12px', color: C.purple, fontWeight: 600 }}>{fmt(r.tb_balance)}</td>
                <td style={{ padding: '10px 12px' }}>
                  {r.is_banned
                    ? <span style={{ color: '#EF4444', fontSize: 12 }}>已封禁</span>
                    : <span style={{ color: C.green, fontSize: 12 }}>正常</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: C.dim }}>暂无会员数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: C.dim, fontSize: 13 }}>
        <span>共 {fmt(total)} 名会员</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={page <= 0} onClick={() => load(page - 1, kw)}
            style={btnStyle(page <= 0)}>上一页</button>
          <span style={{ color: C.sub }}>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => load(page + 1, kw)}
            style={btnStyle(page >= pages - 1)}>下一页</button>
        </div>
      </div>

      {/* 情绪豆明细抽屉 */}
      {detail && (
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '92vw', background: C.bg, borderLeft: `1px solid ${C.border}`, height: '100%', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>会员档案</h2>
              <button onClick={() => setDetail(null)} style={btnStyle(false)}>关闭</button>
            </div>

            <ProfileBlock d={detail} />

            {/* 情绪豆后台发放 / 扣减 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
              <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>情绪豆管理</h3>
              <button onClick={() => { setShowAdjust(v => !v); setAdjMsg(null) }} style={btnStyle(false)}>
                {showAdjust ? '收起' : '💎 调整情绪豆'}
              </button>
            </div>
            {showAdjust && (
              <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['grant', 'deduct'] as const).map(d => (
                    <button key={d} onClick={() => setAdjDir(d)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${adjDir === d ? (d === 'grant' ? C.green : '#EF4444') : C.border}`,
                        background: adjDir === d ? (d === 'grant' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)') : 'transparent',
                        color: adjDir === d ? (d === 'grant' ? C.green : '#FCA5A5') : C.sub }}>
                      {d === 'grant' ? '发放 +' : '扣减 −'}
                    </button>
                  ))}
                </div>
                <input value={adjAmt} onChange={e => setAdjAmt(e.target.value)} inputMode="decimal" placeholder="金豆数量（1 金豆 = 1 元）"
                  style={{ background: '#080C14', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '10px 12px', fontSize: 13 }} />
                <input value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="原因（如：活动奖励 / 客服补偿）"
                  style={{ background: '#080C14', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '10px 12px', fontSize: 13 }} />
                <button onClick={doAdjust} disabled={adjBusy}
                  style={{ background: adjDir === 'grant' ? C.green : '#EF4444', color: '#06121F', fontWeight: 700, borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: adjBusy ? 'not-allowed' : 'pointer', opacity: adjBusy ? 0.6 : 1 }}>
                  {adjBusy ? '处理中…' : `确认${adjDir === 'grant' ? '发放' : '扣减'}`}
                </button>
                {adjMsg && (
                  <p style={{ fontSize: 12, color: adjMsg.ok ? C.green : '#FCA5A5' }}>{adjMsg.ok ? '✅ ' : '⚠️ '}{adjMsg.text}</p>
                )}
                <p style={{ fontSize: 11, color: C.dim }}>写入 tongbao_logs 并同步 profiles.tb_balance（情绪豆消费余额，与「用户管理-充值」同一字段）；扣减不会使余额低于 0。</p>
              </div>
            )}

            <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600, margin: '20px 0 12px' }}>情绪豆明细（emotion_claims）</h3>
            {detail.data.emotionClaims.length === 0 ? (
              <p style={{ color: C.dim, fontSize: 13 }}>该会员暂无情绪确权记录</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['订单号', '情绪豆', '贡献值', '状态', '时间'].map(h => (
                      <th key={h} style={{ color: C.dim, fontWeight: 500, padding: '8px 6px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.data.emotionClaims.map((c, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 6px', color: C.sub, fontFamily: 'monospace' }}>{c.order_no ?? '—'}</td>
                      <td style={{ padding: '8px 6px', color: C.purple, fontWeight: 600 }}>{fmt(c.tb_amount)}</td>
                      <td style={{ padding: '8px 6px', color: C.green }}>{fmt(c.cv_amount)}</td>
                      <td style={{ padding: '8px 6px', color: c.status === 'active' ? C.green : C.dim }}>{c.status}</td>
                      <td style={{ padding: '8px 6px', color: C.dim }}>{fmtDate(c.created_at).slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileBlock({ d }: { d: { row: MemberRow; data: MemberDetail } }) {
  const r = d.row
  const cells: [string, string][] = [
    ['会员ID', r.id],
    ['昵称', r.nickname],
    ['手机号', maskPhone(r.phone)],
    ['上线', r.referrer_nickname ?? '无'],
    ['段位', r.member_rank],
    ['注册时间', fmtDate(r.created_at)],
    ['地址', maskAddress(r.address)],
    ['积分', fmt(r.points)],
    ['情绪豆余额', fmt(r.tb_balance)],
    ['下单次数', fmt(d.data.orderCount)],
    ['情绪豆发放笔数', fmt(d.data.emotionClaims.length)],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {cells.map(([k, v]) => (
        <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ color: C.dim, fontSize: 11, marginBottom: 4 }}>{k}</p>
          <p style={{ color: C.text, fontSize: 13, fontWeight: 500, wordBreak: 'break-all' }}>{v}</p>
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
