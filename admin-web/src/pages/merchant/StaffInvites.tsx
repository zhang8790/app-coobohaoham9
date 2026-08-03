// @title 自营门店中心 - 运营成员（邀请码绑定）
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore } from '@/api/merchant'

interface Invite {
  id: string
  code: string
  role: string
  created_at: string
  expires_at: string
  used_by: string | null
  used_at: string | null
}

const ROLE_LABEL: Record<string, string> = {
  owner: '店长( owner )',
  manager: '店长( manager )',
  staff: '店员',
  cashier: '收银员',
}

const ROLE_COLOR: Record<string, string> = {
  owner: '#C77B30',
  manager: '#2E7D5B',
  staff: '#3B5B7A',
  cashier: '#8A6D3B',
}

export default function StaffInvites() {
  const { profile } = useAuth()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('manager')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        if (profile?.id) {
          const st = await getMyMerchantStore(profile.id)
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
  }, [profile?.id])

  const loadInvites = async (sid: string) => {
    const { data, error } = await supabase
      .from('store_invites')
      .select('id, code, role, created_at, expires_at, used_by, used_at')
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
      })
      if (error) {
        alert('生成失败：' + error.message)
      } else {
        setGenerated(data as string)
        await loadInvites(storeId)
      }
    } finally {
      setGenerating(false)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(
      () => alert('邀请码已复制：' + code),
      () => alert('复制失败，请手动复制：' + code),
    )
  }

  const isExpired = (e: string) => new Date(e).getTime() < Date.now()

  return (
    <div>
      <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>运营成员</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
        生成门店邀请码，分享给店员或运营者。对方在小程序微信登录后输入邀请码，即可绑定本店身份、进入门店管理。
      </p>

      {/* 生成区 */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14 }}
          >
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#fff', background: generating ? 'var(--text-dim)' : 'var(--success-strong)' }}
          >
            {generating ? '生成中…' : '生成邀请码'}
          </button>
        </div>

        {generated && (
          <div style={{ marginTop: 16, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 4px' }}>新邀请码（7 天内有效，一次性使用）</p>
              <p style={{ color: 'var(--success-strong)', fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: 2 }}>{generated}</p>
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
            const expired = isExpired(inv.expires_at)
            const used = !!inv.used_by
            const status = used ? '已使用' : expired ? '已过期' : '待使用'
            const statusColor = used ? 'var(--text-dim)' : expired ? 'var(--danger)' : 'var(--success-strong)'
            return (
              <div key={inv.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ background: ROLE_COLOR[inv.role] || 'var(--text-dim)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 10, flexShrink: 0 }}>
                  {ROLE_LABEL[inv.role] || inv.role}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{inv.code}</span>
                <span style={{ marginLeft: 'auto', color: statusColor, fontSize: 12, fontWeight: 600 }}>{status}</span>
                {!used && !expired && (
                  <button
                    onClick={() => copyCode(inv.code)}
                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                  >
                    复制
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
