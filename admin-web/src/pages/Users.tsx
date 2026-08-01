import { useEffect, useState, useCallback } from 'react'
import { getUsers, updateUserRole, createUserAccount } from '@/api/admin'
import { adminRechargeGoldBean } from '@/api/finance'
import type { Profile } from '@/types'
import { maskPhone } from '@/utils/mask'

const PAGE_SIZE = 20
const RANK_COLORS: Record<string, string> = {
  '凡心': '#78350F', '初心': 'var(--warning)', '明心': 'var(--warning)',
  '静心': 'var(--primary)', '悟心': 'var(--accent)', '无心境': 'var(--danger)',
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

  // 新建账号弹窗状态
  const [createOpen, setCreateOpen] = useState(false)
  const [cEmail, setCEmail] = useState('')
  const [cPwd, setCPwd] = useState('')
  const [cNick, setCNick] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cRole, setCRole] = useState<'admin' | 'user'>('admin')
  const [cBusy, setCBusy] = useState(false)
  const [cMsg, setCMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const openCreate = () => {
    setCEmail(''); setCPwd(''); setCNick(''); setCPhone(''); setCRole('admin'); setCMsg(null)
    setCreateOpen(true)
  }
  const closeCreate = () => {
    if (cBusy) return
    setCreateOpen(false)
  }
  const doCreate = async () => {
    const email = cEmail.trim()
    const pwd = cPwd
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setCMsg({ ok: false, text: '请输入合法的邮箱地址' }); return }
    if (pwd.length < 6) { setCMsg({ ok: false, text: '密码至少 6 位' }); return }
    setCBusy(true); setCMsg(null)
    const res = await createUserAccount({
      email, password: pwd,
      phone: cPhone.trim() || undefined,
      nickname: cNick.trim() || undefined,
      role: cRole,
    })
    setCBusy(false)
    if (res.ok) {
      setCMsg({ ok: true, text: `✅ 账号 ${email} 已创建（角色：${cRole === 'admin' ? '管理员' : '普通用户'}）` })
      setCEmail(''); setCPwd(''); setCNick(''); setCPhone('')
      load() // 刷新列表
    } else {
      setCMsg({ ok: false, text: res.error || '创建失败' })
    }
  }

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
      setRcMsg({ ok: true, text: `✅ 已充值 ${amt} 健康豆，当前余额 ${res.balanceAfter}` })
      setRcAmt(''); setRcRemark('')
    } else {
      setRcMsg({ ok: false, text: res.error || '充值失败' })
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>用户管理</h1>
            <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>平台用户管理 · 共 {total} 名用户</p>
          </div>
          <button onClick={openCreate}
            style={{ padding: '9px 16px', background: 'var(--primary)', color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + 新建账号
          </button>
        </div>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>暂无用户数据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['昵称', '手机号', '段位', '买家健康豆', '健康豆', '角色', '注册时间', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(u => {
                const rankColor = RANK_COLORS[u.member_rank] || '#78350F'
                return (
                  <tr key={u.id}>
                    <td style={{ ...S.td, color: 'var(--text)', fontWeight: 600 }}>{u.nickname || '侠客'}</td>
                    <td style={{ ...S.td, color: 'var(--text-muted)' }}>{maskPhone(u.phone)}</td>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: `${rankColor}33`, color: rankColor }}>
                        {u.member_rank || '凡心'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-muted)' }}>{u.points}</td>
                    <td style={{ ...S.td, color: 'var(--text-muted)' }}>健康豆 {Number(u.tb_balance || 0).toFixed(2)}</td>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: u.role === 'admin' ? 'var(--primary-soft)' : 'var(--border)', color: u.role === 'admin' ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: 13 }}>{new Date(u.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={processing === u.id} onClick={() => handleRoleChange(u.id, u.role)}
                          style={{ padding: '5px 12px', background: 'transparent',
                            border: `1px solid ${u.role === 'admin' ? 'var(--danger)' : 'var(--primary)'}`,
                            borderRadius: 6, color: u.role === 'admin' ? 'var(--danger)' : 'var(--primary)', cursor: 'pointer', fontSize: 12 }}>
                          {u.role === 'admin' ? '降为用户' : '设为管理员'}
                        </button>
                        {u.role !== 'admin' && (
                          <button disabled={processing === u.id} onClick={() => openRecharge(u)}
                            style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--warning)',
                              borderRadius: 6, color: 'var(--warning)', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>
                             充值
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? 'var(--primary)' : 'var(--border)', color: page === i ? '#fff' : 'var(--text-muted)' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 健康豆充值弹窗 */}
      {rcTarget && (
        <div onClick={closeRecharge}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '92vw', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}> 健康豆充值</h2>
              <button onClick={closeRecharge} disabled={rcBusy}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, lineHeight: 1, cursor: rcBusy ? 'not-allowed' : 'pointer' }}>×</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              用户：<span style={{ color: 'var(--text)' }}>{rcTarget.nickname || '侠客'}</span>
              （{maskPhone(rcTarget.phone)}）｜当前健康豆：<span style={{ color: 'var(--warning)', fontWeight: 600 }}>{Number(rcTarget.tb_balance).toFixed(2)}</span>
            </p>
            <input value={rcAmt} onChange={e => setRcAmt(e.target.value)} inputMode="decimal"
              placeholder="充值健康豆数量（1 健康豆 = 1 元）"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 14, marginBottom: 12 }} />
            <input value={rcRemark} onChange={e => setRcRemark(e.target.value)}
              placeholder="备注（如：活动奖励 / 客服补偿）"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 14, marginBottom: 16 }} />
            <button onClick={doRecharge} disabled={rcBusy}
              style={{ width: '100%', background: 'var(--warning)', color: '#1A1205', fontWeight: 700, borderRadius: 8, padding: '11px 0', fontSize: 14, cursor: rcBusy ? 'not-allowed' : 'pointer', opacity: rcBusy ? 0.6 : 1 }}>
              {rcBusy ? '处理中…' : '确认充值'}
            </button>
            {rcMsg && (
              <p style={{ fontSize: 13, marginTop: 12, color: rcMsg.ok ? 'var(--success-strong)' : 'var(--danger-text)' }}>{rcMsg.text}</p>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>充值不可逆，请核对金额。</p>
          </div>
        </div>
      )}

      {/* 新建登录账号弹窗 */}
      {createOpen && (
        <div onClick={closeCreate}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 440, maxWidth: '92vw', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>新建登录账号</h2>
              <button onClick={closeCreate} disabled={cBusy}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, lineHeight: 1, cursor: cBusy ? 'not-allowed' : 'pointer' }}>×</button>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
              该账号可凭邮箱 + 密码直接登录后台。创建后将在服务端自动确认邮箱，<b style={{ color: 'var(--text-muted)' }}>无需邮件验证</b>即可使用。
            </p>

            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>邮箱 *</label>
            <input value={cEmail} onChange={e => setCEmail(e.target.value)}
              placeholder="如 admin2@laidianyouxi.com"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 14, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>密码 *（至少 6 位）</label>
            <input value={cPwd} onChange={e => setCPwd(e.target.value)} type="password"
              placeholder="登录密码"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 14, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>昵称（可选）</label>
            <input value={cNick} onChange={e => setCNick(e.target.value)}
              placeholder="后台显示名称"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 14, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>手机号（可选，用于验证码登录）</label>
            <input value={cPhone} onChange={e => setCPhone(e.target.value)} inputMode="numeric"
              placeholder="选填"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 14, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>角色 *</label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {([['admin', '管理员（可登录后台）'], ['user', '普通用户（C 端）']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setCRole(val)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    border: `1px solid ${cRole === val ? 'var(--primary)' : 'var(--border)'}`,
                    background: cRole === val ? 'var(--primary-soft)' : 'transparent',
                    color: cRole === val ? 'var(--primary)' : 'var(--text-muted)', fontWeight: cRole === val ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>

            <button onClick={doCreate} disabled={cBusy}
              style={{ width: '100%', background: 'var(--primary)', color: '#fff', fontWeight: 700, borderRadius: 8, padding: '11px 0', fontSize: 14, cursor: cBusy ? 'not-allowed' : 'pointer', opacity: cBusy ? 0.6 : 1 }}>
              {cBusy ? '创建中…' : '确认创建'}
            </button>
            {cMsg && (
              <p style={{ fontSize: 13, marginTop: 12, color: cMsg.ok ? 'var(--success-strong)' : 'var(--danger-text)' }}>{cMsg.text}</p>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>仅超级管理员可创建账号；服务端的账号创建不会在前端暴露任何密钥。</p>
          </div>
        </div>
      )}
    </div>
  )
}
