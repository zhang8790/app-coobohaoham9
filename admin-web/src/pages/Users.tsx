import { useEffect, useState, useCallback } from 'react'
import { getUsers, updateUserRole } from '@/api/admin'
import { adminRechargeGoldBean } from '@/api/finance'
import type { Profile } from '@/types'
import { maskPhone } from '@/utils/mask'

const PAGE_SIZE = 20
const RANK_COLORS: Record<string, string> = {
  '凡心': '#78350F', '初心': '#B45309', '明心': '#92400E',
  '静心': '#C2410C', '悟心': '#9333EA', '无心境': '#DC2626',
}

export default function Users() {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  // 充值弹窗状态
  const [rcTarget, setRcTarget] = useState<Profile | null>(null)
  const [rcAmt, setRcAmt] = useState('')
  const [rcRemark, setRcRemark] = useState('')
  const [rcBusy, setRcBusy] = useState(false)
  const [rcMsg, setRcMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getUsers(page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (id: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (!confirm(`确认将该用户角色改为「${newRole === 'admin' ? '管理员' : '普通用户'}」？`)) return
    setProcessing(id)
    await updateUserRole(id, newRole)
    setList(prev => prev.map(u => u.id === id ? { ...u, role: newRole as 'user' | 'admin' } : u))
    setProcessing(null)
  }

  const openRecharge = (u: Profile) => {
    setRcTarget(u); setRcAmt(''); setRcRemark(''); setRcMsg(null)
  }
  const closeRecharge = () => {
    if (rcBusy) return
    setRcTarget(null); setRcAmt(''); setRcRemark(''); setRcMsg(null)
  }
  const doRecharge = async () => {
    if (!rcTarget) return
    const amt = Number(rcAmt)
    if (!Number.isFinite(amt) || amt <= 0) { setRcMsg({ ok: false, text: '请输入正数金额' }); return }
    setRcBusy(true); setRcMsg(null)
    const res = await adminRechargeGoldBean(rcTarget.id, amt, rcRemark)
    setRcBusy(false)
    if (res.ok) {
      setList(prev => prev.map(u => u.id === rcTarget.id ? { ...u, tb_balance: (res.balanceAfter ?? u.tb_balance ?? 0) } : u))
      setRcMsg({ ok: true, text: `✅ 已充值 ${amt} 金豆，当前余额 ${res.balanceAfter}` })
      setRcAmt(''); setRcRemark('')
    } else {
      setRcMsg({ ok: false, text: res.error || '充值失败' })
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>用户管理</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>平台用户管理 · 共 {total} 名侠客</p>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无用户数据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['昵称', '手机号', '段位', '积分', '金豆', '角色', '注册时间', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(u => {
                const rankColor = RANK_COLORS[u.member_rank] || '#78350F'
                return (
                  <tr key={u.id}>
                    <td style={{ ...S.td, color: '#E5E7EB', fontWeight: 600 }}>{u.nickname || '侠客'}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{maskPhone(u.phone)}</td>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: `${rankColor}33`, color: rankColor }}>
                        {u.member_rank || '凡心'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{u.points}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>金豆 {Number(u.tb_balance || 0).toFixed(2)}</td>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: u.role === 'admin' ? '#C2410C22' : '#1F2937', color: u.role === 'admin' ? '#C2410C' : '#9CA3AF' }}>
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: '#6B7280', fontSize: 13 }}>{new Date(u.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={processing === u.id} onClick={() => handleRoleChange(u.id, u.role)}
                          style={{ padding: '5px 12px', background: 'transparent',
                            border: `1px solid ${u.role === 'admin' ? '#EF4444' : '#C2410C'}`,
                            borderRadius: 6, color: u.role === 'admin' ? '#EF4444' : '#C2410C', cursor: 'pointer', fontSize: 12 }}>
                          {u.role === 'admin' ? '降为用户' : '设为管理员'}
                        </button>
                        {u.role !== 'admin' && (
                          <button disabled={processing === u.id} onClick={() => openRecharge(u)}
                            style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #F59E0B',
                              borderRadius: 6, color: '#F59E0B', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>
                            💎 充值
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid #1F2937' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? '#C2410C' : '#1F2937', color: page === i ? '#fff' : '#9CA3AF' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 金豆充值弹窗 */}
      {rcTarget && (
        <div onClick={closeRecharge}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '92vw', background: '#0F172A', border: '1px solid #1F2937', borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>💎 金豆充值</h2>
              <button onClick={closeRecharge} disabled={rcBusy}
                style={{ background: 'transparent', border: 'none', color: '#6B7280', fontSize: 22, lineHeight: 1, cursor: rcBusy ? 'not-allowed' : 'pointer' }}>×</button>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16 }}>
              用户：<span style={{ color: '#E5E7EB' }}>{rcTarget.nickname || '侠客'}</span>
              （{maskPhone(rcTarget.phone)}）｜当前金豆：<span style={{ color: '#F59E0B', fontWeight: 600 }}>{Number(rcTarget.tb_balance).toFixed(2)}</span>
            </p>
            <input value={rcAmt} onChange={e => setRcAmt(e.target.value)} inputMode="decimal"
              placeholder="充值金豆数量（1 金豆 = 1 元）"
              style={{ width: '100%', boxSizing: 'border-box', background: '#080C14', border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB', padding: '10px 12px', fontSize: 14, marginBottom: 12 }} />
            <input value={rcRemark} onChange={e => setRcRemark(e.target.value)}
              placeholder="备注（如：活动奖励 / 客服补偿）"
              style={{ width: '100%', boxSizing: 'border-box', background: '#080C14', border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB', padding: '10px 12px', fontSize: 14, marginBottom: 16 }} />
            <button onClick={doRecharge} disabled={rcBusy}
              style={{ width: '100%', background: '#F59E0B', color: '#1A1205', fontWeight: 700, borderRadius: 8, padding: '11px 0', fontSize: 14, cursor: rcBusy ? 'not-allowed' : 'pointer', opacity: rcBusy ? 0.6 : 1 }}>
              {rcBusy ? '处理中…' : '确认充值'}
            </button>
            {rcMsg && (
              <p style={{ fontSize: 13, marginTop: 12, color: rcMsg.ok ? '#10B981' : '#FCA5A5' }}>{rcMsg.text}</p>
            )}
            <p style={{ fontSize: 11, color: '#6B7280', marginTop: 10 }}>充值写入 tongbao_logs（type=recharge）并同步 profiles.tb_balance；充值不可逆，请核对金额。</p>
          </div>
        </div>
      )}
    </div>
  )
}
