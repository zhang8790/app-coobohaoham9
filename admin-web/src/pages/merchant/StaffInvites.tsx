// @title 自营门店中心 - 运营成员（邀请码绑定）
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/contexts/StoreContext'
import { getMyMerchantStore } from '@/api/merchant'

interface Invite {
  id: string
  code: string
  role: string
  created_at: string
  expires_at: string
  used_by: string | null
  used_at: string | null
  max_uses: number
  use_count: number
  remark: string | null
  revoked_at: string | null
}

const ROLE_LABEL: Record<string, string> = {
  owner: '店主 owner（不支持邀请码发放）',
  manager: '店长 manager',
  staff: '店员 staff',
  cashier: '收银员 cashier',
}

const ROLE_COLOR: Record<string, string> = {
  owner: '#C77B30',
  manager: '#2E7D5B',
  staff: '#3B5B7A',
  cashier: '#8A6D3B',
}

/** 后端 create_store_invite 抛出的英文错误 → 店长能看懂的话术 */
const ERROR_TEXT: Record<string, string> = {
  'owner must be granted via stores.owner_id, not invite code':
    '店主身份不能通过邀请码发放，请在门店设置中直接指定 owner',
  'insufficient privilege: only owner/manager/admin can issue invites':
    '权限不足：只有店主、店长或平台管理员可以生成邀请码',
  'insufficient privilege: cannot issue a role equal or higher than your own':
    '权限不足：不能生成等于或高于自己权限的角色（只能向下发放）',
  'multi-use invites are limited to staff/cashier':
    '可多人共用的码只支持店员 / 收银员角色',
  'invalid expires_hours (1-720)': '有效期设置无效（需 1-720 小时）',
  'invalid max_uses': '可用次数设置无效',
  'invalid role': '角色无效',
  'not authenticated': '登录已失效，请重新登录',
  'permission denied: not store operator': '您不是该门店的运营成员，无法生成邀请码',
}

/** 无限次的上限值。后端允许 1-720 小时有效期，次数由前端限制来源 */
const UNLIMITED = 999

/** LD + 8 位 → 视觉分段 LD8A-3F1C-2B，便于口述和抄写 */
function prettyCode(code: string): string {
  if (!code || code.length !== 10) return code
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`
}

/** 邀请码状态机：终态（已使用/已过期/已撤销/已用完）不可再操作，也不可复制 */
function inviteStatus(inv: Invite): { label: string; color: string; live: boolean } {
  if (inv.revoked_at) return { label: '已撤销', color: 'var(--danger)', live: false }
  if (Date.parse(inv.expires_at) < Date.now()) return { label: '已过期', color: 'var(--text-dim)', live: false }
  if (inv.max_uses === 1) {
    return inv.used_by
      ? { label: '已使用', color: 'var(--text-dim)', live: false }
      : { label: '待使用', color: 'var(--success-strong)', live: true }
  }
  if (inv.use_count >= inv.max_uses) return { label: '已用完', color: 'var(--text-dim)', live: false }
  const total = inv.max_uses >= UNLIMITED ? '∞' : String(inv.max_uses)
  return {
    label: `已用 ${inv.use_count}/${total}`,
    color: 'var(--success-strong)',
    live: true,
  }
}

export default function StaffInvites() {
  const { profile } = useAuth()
  const { selectedStoreId } = useStore()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)

  const [role, setRole] = useState<string>('staff')
  const [remark, setRemark] = useState('')
  const [expiresHours, setExpiresHours] = useState<number>(24)
  const [maxUses, setMaxUses] = useState<number>(1)

  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // 只有低权限角色才允许多次使用；选了店长时强制回到 1 次
  const multiAllowed = role === 'staff' || role === 'cashier'

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        if (profile?.id) {
          const st = await getMyMerchantStore(profile.id, selectedStoreId)
          if (cancelled) return
          setStoreId(st?.id ?? null)
          if (st?.id) await loadInvites(st.id)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [profile?.id, selectedStoreId])

  const loadInvites = async (sid: string) => {
    const { data, error } = await supabase
      .from('store_invites')
      .select('id, code, role, created_at, expires_at, used_by, used_at, max_uses, use_count, remark, revoked_at')
      .eq('store_id', sid)
      .order('created_at', { ascending: false })
    if (!error && data) setInvites(data as Invite[])
  }

  const handleGenerate = async () => {
    if (!storeId) return
    setGenerating(true)
    setGenerated(null)
    try {
      const { data, error } = await supabase.rpc('create_store_invite', {
        p_store_id: storeId,
        p_role: role,
        p_remark: remark.trim() || null,
        p_expires_hours: expiresHours,
        p_max_uses: multiAllowed ? maxUses : 1,
      })
      if (error) {
        alert('生成失败：' + (ERROR_TEXT[error.message] || error.message))
      } else {
        setGenerated(data as string)
        setRemark('')
        await loadInvites(storeId)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (inv: Invite) => {
    if (!storeId) return
    if (!confirm(`确认撤销邀请码 ${inv.code}？\n撤销后立即失效，且不可恢复（需要时请重新生成一条）。`)) return
    setRevokingId(inv.id)
    try {
      const { data, error } = await supabase.rpc('revoke_store_invite', { p_code: inv.code })
      if (error) {
        alert('撤销失败：' + error.message)
        return
      }
      const res = data as any
      if (!res?.ok) {
        alert('撤销失败：' + (res?.error === 'already_used' ? '该码已被使用，请改为调整成员权限' : (res?.error || '未知错误')))
        return
      }
      await loadInvites(storeId)
    } finally {
      setRevokingId(null)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(
      () => alert('邀请码已复制：' + code),
      () => alert('复制失败，请手动复制：' + code),
    )
  }

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--text-dim)', fontSize: 12, marginBottom: 6, display: 'block',
  }

  return (
    <div>
      <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>运营成员</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
        生成门店邀请码，分享给店员或运营者。对方在小程序微信登录后扫码或输入邀请码，即可绑定本店身份。
        <strong> 高权限建议用短时效</strong>：店长 24 小时内、收银员临时支援 1 小时。
      </p>

      {/* 生成区 */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <span style={labelStyle}>角色</span>
            <select value={role} onChange={e => setRole(e.target.value)} style={selectStyle}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                // 店主 = 门店资产归属，禁止通过邀请码转让，改由门店设置直设 stores.owner_id
                <option key={k} value={k} disabled={k === 'owner'}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <span style={labelStyle}>发放备注（建议填写，便于一周后还能认出这条码）</span>
            <input
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="例：给小李的店员码 / 周六临时收银"
              maxLength={40}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, minWidth: 240 }}
            />
          </div>

          <div>
            <span style={labelStyle}>有效期</span>
            <select value={expiresHours} onChange={e => setExpiresHours(Number(e.target.value))} style={selectStyle}>
              <option value={1}>1 小时（临时支援）</option>
              <option value={24}>24 小时（推荐 · 店长/店员入职）</option>
              <option value={168}>7 天（稳妥期）</option>
            </select>
          </div>

          <div>
            <span style={labelStyle}>可用次数</span>
            <select
              value={maxUses}
              onChange={e => setMaxUses(Number(e.target.value))}
              disabled={!multiAllowed}
              title={multiAllowed ? '' : '多人共用的码只支持店员 / 收银员'}
              style={{ ...selectStyle, opacity: multiAllowed ? 1 : 0.5 }}
            >
              <option value={1}>1 次（一人一码）</option>
              <option value={5}>5 次（多人共用）</option>
              <option value={UNLIMITED}>不限次数</option>
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#fff', background: generating ? 'var(--text-dim)' : 'var(--success-strong)' }}
          >
            {generating ? '生成中…' : '生成邀请码'}
          </button>
        </div>

        {!multiAllowed && role !== 'owner' && (
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            多人共用（&gt;1 次）的码仅限店员 / 收银员，已自动按 1 次生成。
          </p>
        )}

        {generated && (
          <div style={{ marginTop: 16, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 4px' }}>
                新邀请码（{expiresHours >= 168 ? '7 天' : expiresHours + ' 小时'}内有效，{multiAllowed && maxUses > 1 ? (maxUses >= UNLIMITED ? '不限次数' : `可用 ${maxUses} 次`) : '一次性使用'}）
              </p>
              <p style={{ color: 'var(--success-strong)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: 2 }}>
                {generated}
                <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 10, letterSpacing: 1, opacity: 0.75 }}>
                  {prettyCode(generated)}
                </span>
              </p>
            </div>
            <button
              onClick={() => copyCode(generated)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--success-strong)', background: 'transparent', color: 'var(--success-strong)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              复制
            </button>
          </div>
        )}
      </div>

      {/* 列表 */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          已生成的邀请码（{invites.length}）
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>加载中…</div>
        ) : invites.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>暂无邀请码，点击上方生成</div>
        ) : (
          invites.map(inv => {
            const st = inviteStatus(inv)
            return (
              <div key={inv.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ background: ROLE_COLOR[inv.role] || 'var(--text-dim)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 10, flexShrink: 0 }}>
                  {inv.role === 'owner' ? '店主' : ROLE_LABEL[inv.role]?.split(' ')[0] || inv.role}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{inv.code}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                  {inv.remark || '—'}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12, flexShrink: 0 }}>
                  {inv.max_uses > 1 ? `${inv.use_count}/${inv.max_uses >= UNLIMITED ? '∞' : inv.max_uses} 次` : '单码'}
                </span>
                <span style={{ marginLeft: 'auto', color: st.color, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{st.label}</span>
                {st.live && (
                  <>
                    <button
                      onClick={() => copyCode(inv.code)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                    >
                      复制
                    </button>
                    <button
                      onClick={() => handleRevoke(inv)}
                      disabled={revokingId === inv.id}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}
                    >
                      {revokingId === inv.id ? '撤销中…' : '撤销'}
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
