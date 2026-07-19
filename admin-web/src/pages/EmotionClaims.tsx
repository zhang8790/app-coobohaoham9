import { useEffect, useState, useCallback } from 'react'
import {
  getEmotionClaims, getEmotionClaimStats, voidEmotionClaim, banUserRollback,
  getEmotionRuleVersions, EMOTION_CLAIM_PAGE_SIZE,
} from '@/api/emotionClaim'
import type { EmotionClaimRow, EmotionClaimStats, EmotionClaimStatus, EmotionRuleVersion } from '@/types'
import { maskPhone } from '@/utils/mask'

type Tab = 'all' | EmotionClaimStatus
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '有效' },
  { value: 'voided', label: '已作废' },
]

export default function EmotionClaims() {
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  const [list, setList] = useState<EmotionClaimRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<EmotionClaimStats | null>(null)
  const [rules, setRules] = useState<EmotionRuleVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const [voidTarget, setVoidTarget] = useState<EmotionClaimRow | null>(null)
  const [banTarget, setBanTarget] = useState<EmotionClaimRow | null>(null)
  const [showRules, setShowRules] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const status = tab === 'all' ? null : tab
    const [{ data, total: t }, st] = await Promise.all([
      getEmotionClaims(status, page),
      getEmotionClaimStats(),
    ])
    setList(data); setTotal(t); if (st) setStats(st)
    setLoading(false)
  }, [tab, page])

  useEffect(() => { setPage(0) }, [tab])
  useEffect(() => { load() }, [load])

  const refreshRules = useCallback(async () => {
    const r = await getEmotionRuleVersions()
    setRules(r)
  }, [])
  useEffect(() => { refreshRules() }, [refreshRules])

  const afterAction = async (ok: boolean, msg?: string) => {
    setVoidTarget(null); setBanTarget(null); setBusy(null)
    if (!ok) { alert('操作失败：' + (msg || '未知错误')) }
    await load(); await refreshRules()
  }

  const handleVoid = async (reason: string, ratioPct: number) => {
    if (!voidTarget) return
    if (!confirm(`确认对订单 ${voidTarget.order_no || voidTarget.id.slice(0, 8)} 执行退款作废？\n` +
      `将按 ${ratioPct}% 比例回滚该用户的通宝/贡献值及上级裂变分。`)) return
    setBusy('void')
    const res = await voidEmotionClaim(voidTarget.id, reason, ratioPct / 100)
    await afterAction(res.ok, res.msg)
  }

  const handleBan = async (reason: string) => {
    if (!banTarget) return
    if (!confirm(`确认封禁用户 ${banTarget.nickname || maskPhone(banTarget.phone) || banTarget.user_id.slice(0, 8)}？\n` +
      `将清零其全部贡献值/通宝、作废其所有有效确权、并扣回上级裂变分。此操作不可自动恢复！`)) return
    setBusy('ban')
    const res = await banUserRollback(banTarget.user_id, reason)
    await afterAction(res.ok, res.msg)
  }

  const totalPages = Math.max(1, Math.ceil(total / EMOTION_CLAIM_PAGE_SIZE))

  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)', whiteSpace: 'nowrap' as const },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '8px 16px', background: active ? 'var(--primary-soft)' : 'transparent', color: active ? 'var(--primary)' : 'var(--text-muted)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>确权治理</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          共建股权确权记录 · 退款作废（§5.1） / 违规封禁（§5.2） / 规则版本（§5.3）
        </p>
      </div>

      {/* 概览统计 */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <StatCard label="确权总数" value={String(stats.total)} accent="var(--primary)" />
          <StatCard label="有效确权" value={String(stats.active)} accent="var(--success-strong)" />
          <StatCard label="已作废" value={String(stats.voided)} accent="var(--text-dim)" />
          <StatCard label="有效贡献值 CV" value={stats.active_cv.toFixed(4)} accent="var(--accent)" />
          <StatCard label="有效通宝 TB" value={stats.active_tb.toFixed(2)} accent="var(--warning)" />
          <StatCard label="未封禁用户" value={String(stats.active_users)} accent="var(--info)" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)} style={S.tab(tab === t.value)}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowRules(v => !v)}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
          {showRules ? '收起规则版本 ▲' : '规则版本 §5.3 ▼'}
        </button>
      </div>

      {/* §5.3 规则版本面板 */}
      {showRules && (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['版本', '公示时间', '生效时间', '状态', '备注', '核心常量'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>暂无规则版本</td></tr>
              ) : rules.map(r => (
                <tr key={r.version}>
                  <td style={{ ...S.td, color: 'var(--text)', fontWeight: 600 }}>v{r.version}</td>
                  <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 13 }}>{fmt(r.announced_at)}</td>
                  <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 13 }}>{fmt(r.effective_at)}</td>
                  <td style={S.td}>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: r.is_active ? 'var(--success-soft)' : 'var(--border-soft)', color: r.is_active ? 'var(--success-strong)' : 'var(--text-muted)' }}>
                      {r.is_active ? '现行' : '历史'}
                    </span>
                  </td>
                  <td style={{ ...S.td, color: 'var(--text)' }}>{r.note || '-'}</td>
                  <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>
                    R_TB={r.const_json?.R_TB} · R_DIV={r.const_json?.R_DIV} · M_MIN={r.const_json?.M_MIN} · CV_RATE={r.const_json?.EMOTION_CV_RATE}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 列表 */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>用户</th>
              <th style={S.th}>订单号</th>
              <th style={S.th}>通宝</th>
              <th style={S.th}>贡献值 CV</th>
              <th style={S.th}>徽章</th>
              <th style={S.th}>规则</th>
              <th style={S.th}>状态</th>
              <th style={S.th}>确权时间</th>
              <th style={S.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>暂无确权记录</td></tr>
            ) : list.map(c => (
              <tr key={c.id}>
                <td style={S.td}>
                  <div style={{ color: 'var(--text)', fontWeight: 600 }}>{c.nickname || '侠客'}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {maskPhone(c.phone) || c.user_id.slice(0, 8)}
                    {c.user_is_banned && <span style={{ marginLeft: 6, color: 'var(--danger)', fontSize: 11 }}>已封禁</span>}
                  </div>
                </td>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{c.order_no || '-'}</td>
                <td style={{ ...S.td, color: 'var(--warning)', fontWeight: 600 }}>{c.tb_amount.toFixed(2)}</td>
                <td style={{ ...S.td, color: 'var(--accent-text)', fontWeight: 600 }}>{c.cv_amount.toFixed(4)}</td>
                <td style={{ ...S.td, color: 'var(--text)' }}>{c.badge_text || c.badge_code || '-'}</td>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>v{c.rule_version || '?'}</td>
                <td style={S.td}>
                  {c.status === 'active' ? (
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--success-soft)', color: 'var(--success-strong)' }}>有效</span>
                  ) : (
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--border-soft)', color: 'var(--text-muted)' }}>已作废</span>
                  )}
                </td>
                <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: 12 }}>{new Date(c.created_at).toLocaleString('zh-CN')}</td>
                <td style={S.td}>
                  {c.status === 'active' ? (
                    <>
                      <button onClick={() => setVoidTarget(c)} disabled={busy !== null} style={btnStyle('var(--danger)')}>退款作废</button>
                      <button onClick={() => setBanTarget(c)} disabled={busy !== null} style={btnStyle('#9333EA')}>封禁用户</button>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      {c.voided_reason ? `原因：${c.voided_reason}` : '—'}
                      {c.refund_ratio < 1 ? `（${Math.round(c.refund_ratio * 100)}%）` : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={btnStyle('var(--border-soft)')}>上一页</button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>第 {page + 1} / {totalPages} 页</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={btnStyle('var(--border-soft)')}>下一页</button>
        </div>
      )}

      {/* 退款作废弹窗 */}
      {voidTarget && (
        <VoidModal claim={voidTarget} busy={busy === 'void'} onClose={() => setVoidTarget(null)} onConfirm={handleVoid} />
      )}
      {/* 封禁弹窗 */}
      {banTarget && (
        <BanModal claim={banTarget} busy={busy === 'ban'} onClose={() => setBanTarget(null)} onConfirm={handleBan} />
      )}
    </div>
  )
}

// ───────────── 统计卡 ─────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{label}</p>
      <p style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: '6px 0 0', letterSpacing: 0.5 }}>{value}</p>
    </div>
  )
}

// ───────────── 退款作废弹窗 ─────────────
function VoidModal({ claim, busy, onClose, onConfirm }: {
  claim: EmotionClaimRow; busy: boolean; onClose: () => void;
  onConfirm: (reason: string, ratioPct: number) => void;
}) {
  const [reason, setReason] = useState('')
  const [ratio, setRatio] = useState(100)
  const backTb = (claim.tb_amount * ratio / 100)
  const backCv = (claim.cv_amount * ratio / 100)

  return (
    <Overlay onClose={onClose}>
      <div style={modalCard}>
        <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>退款作废</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px' }}>
          订单 {claim.order_no || claim.id.slice(0, 8)} · 用户 {claim.nickname || maskPhone(claim.phone) || claim.user_id.slice(0, 8)}
        </p>

        <label style={labelStyle}>作废原因</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="如：用户申请全额退款 / 订单异常"
          rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        <label style={{ ...labelStyle, marginTop: 16 }}>退款比例：<b style={{ color: 'var(--primary)' }}>{ratio}%</b></label>
        <input type="range" min={0} max={100} step={5} value={ratio} onChange={e => setRatio(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--primary)' }} />
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>回滚通宝 TB：<b style={{ color: 'var(--warning)' }}>{backTb.toFixed(2)}</b></span>
          <span>回滚贡献值 CV：<b style={{ color: 'var(--accent-text)' }}>{backCv.toFixed(4)}</b></span>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>取消</button>
          <button onClick={() => onConfirm(reason, ratio)} disabled={busy} style={{ flex: 2, padding: '11px', background: busy ? 'var(--primary-disabled)' : 'linear-gradient(135deg,var(--primary),var(--primary-hover))', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? '处理中...' : `确认作废（${ratio}%）`}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ───────────── 封禁弹窗 ─────────────
function BanModal({ claim, busy, onClose, onConfirm }: {
  claim: EmotionClaimRow; busy: boolean; onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('')
  return (
    <Overlay onClose={onClose}>
      <div style={modalCard}>
        <h3 style={{ color: 'var(--danger)', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>违规封禁用户</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px' }}>
          将清零 {claim.nickname || maskPhone(claim.phone) || claim.user_id.slice(0, 8)} 的全部贡献值/通宝、作废其所有有效确权，并扣回上级裂变分。
        </p>
        <label style={labelStyle}>封禁原因</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="如：刷单 / 违规营销 / 欺诈"
          rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>取消</button>
          <button onClick={() => onConfirm(reason)} disabled={busy} style={{ flex: 2, padding: '11px', background: busy ? '#6D28D9' : '#9333EA', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? '处理中...' : '确认封禁'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ───────────── 通用 ─────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(3,6,12,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
      animation: 'fadeIn 0.18s ease',
    }}>
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

const modalCard: React.CSSProperties = {
  width: '100%', maxWidth: 440, background: 'rgba(17,20,30,0.96)', backdropFilter: 'blur(40px)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24,
  boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text)', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '5px 11px', background: bg, color: '#fff', border: 'none', borderRadius: 5,
    fontSize: 12, cursor: 'pointer', marginRight: 6, whiteSpace: 'nowrap',
    transition: 'transform 0.12s',
  } as React.CSSProperties
}

function fmt(s?: string): string {
  if (!s) return '-'
  return new Date(s).toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
}
