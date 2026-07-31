// 推广/佣金风控看板
// 展示「自推自」「新号养号」等可疑佣金，支持人工冻结/放行/拒结；并附高频拓新 TOP 辅助判断。
// 依赖迁移 20260728_commission_risk.sql：commissions.risk_flag + status='frozen' + admin_read_all_commissions RLS。
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { maskPhone, maskName } from '@/utils/mask'

interface CommissionRow {
  id: string
  order_id: string
  order_no: string
  beneficiary_id: string
  payer_id: string
  level: number
  rank_at_time: string
  ratio: number
  pool_amount: number
  commission_amount: number
  net_amount: number
  risk_flag: string | null
  status: string
  created_at: string
}

interface ProfileMap { [id: string]: { nickname: string; phone: string } }

const RISK_LABEL: Record<string, { label: string; color: string }> = {
  self_referral: { label: '自推自', color: '#dc2626' },
  new_account_referral: { label: '新号养号', color: '#d97706' },
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: '待结算', color: '#2563eb' },
  settled: { label: '已结算', color: '#16a34a' },
  refunded: { label: '已拒结', color: '#6b7280' },
  frozen: { label: '已冻结', color: '#dc2626' },
}

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

type FilterKey = 'all' | 'frozen' | 'self_referral' | 'new_account_referral'

export default function Risk() {
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [topReferrers, setTopReferrers] = useState<Array<{ id: string; count: number; nickname: string }>>([])
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 可疑佣金：risk_flag 非空 或 已冻结
      const { data, error } = await supabase
        .from('commissions')
        .select('*')
        .or('risk_flag.not.is.null,status.eq.frozen')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) {
        console.error('[Risk] load error', error)
        return
      }
      const list = (data ?? []) as CommissionRow[]
      setRows(list)

      // 批量查受益人/买家昵称+手机（脱敏展示）
      const ids = Array.from(new Set(list.flatMap(r => [r.beneficiary_id, r.payer_id])))
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('id,nickname,phone').in('id', ids)
        const m: ProfileMap = {}
        for (const p of (ps ?? []) as any[]) m[p.id] = { nickname: p.nickname, phone: p.phone }
        setProfiles(m)
      }

      // 高频拓新 TOP（近7天注册且有上级的下级数，前端聚合）
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: rec } = await supabase
        .from('profiles')
        .select('referrer_id')
        .gte('created_at', since)
        .not('referrer_id', 'is', null)
        .limit(1000)
      const agg: Record<string, number> = {}
      for (const r of (rec ?? []) as any[]) {
        if (r.referrer_id) agg[r.referrer_id] = (agg[r.referrer_id] || 0) + 1
      }
      const topIds = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0])
      let topMap: ProfileMap = {}
      if (topIds.length) {
        const { data: tp } = await supabase.from('profiles').select('id,nickname,phone').in('id', topIds)
        for (const p of (tp ?? []) as any[]) topMap[p.id] = { nickname: p.nickname, phone: p.phone }
      }
      setTopReferrers(topIds.map(id => ({ id, count: agg[id], nickname: topMap[id]?.nickname ?? '未知' })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: string, next: 'pending' | 'refunded', clearFlag: boolean) => {
    setActionId(id)
    const patch: any = { status: next }
    if (clearFlag) patch.risk_flag = null
    const { error } = await supabase.from('commissions').update(patch).eq('id', id)
    if (error) {
      alert('操作失败: ' + error.message)
    } else {
      await load()
    }
    setActionId(null)
  }

  const filtered = rows.filter(r => {
    if (filter === 'all') return true
    if (filter === 'frozen') return r.status === 'frozen'
    return (r.risk_flag ?? '').includes(filter)
  })

  const stats = {
    total: rows.length,
    frozenAmt: rows.filter(r => r.status === 'frozen').reduce((s, r) => s + Number(r.commission_amount || 0), 0),
    selfRef: rows.filter(r => (r.risk_flag ?? '').includes('self_referral')).length,
    newAcc: rows.filter(r => (r.risk_flag ?? '').includes('new_account_referral')).length,
  }

  const nameOf = (id: string) => {
    const p = profiles[id]
    if (!p) return '—'
    const base = p.nickname ? maskName(p.nickname) : (p.phone ? maskPhone(p.phone) : '未知')
    return base
  }

  const chips: Array<{ key: FilterKey; label: string; n: number }> = [
    { key: 'all', label: '全部可疑', n: stats.total },
    { key: 'frozen', label: '已冻结', n: rows.filter(r => r.status === 'frozen').length },
    { key: 'self_referral', label: '自推自', n: stats.selfRef },
    { key: 'new_account_referral', label: '新号养号', n: stats.newAcc },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>推广风控中心</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            识别自推自、新号养号等可疑佣金，冻结待审或放行结算
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', cursor: loading ? 'default' : 'pointer', fontSize: 14,
          }}
        >{loading ? '刷新中…' : '刷新'}</button>
      </div>

      {/* 统计卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: '可疑佣金总数', value: stats.total, color: '#dc2626' },
          { label: '冻结金额(健康豆)', value: fmt(stats.frozenAmt), color: '#dc2626' },
          { label: '自推自嫌疑', value: stats.selfRef, color: '#d97706' },
          { label: '新号养号嫌疑', value: stats.newAcc, color: '#d97706' },
        ].map(c => (
          <div key={c.label} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: c.color, marginTop: 6 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 筛选 chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {chips.map(ch => (
          <button
            key={ch.key}
            onClick={() => setFilter(ch.key)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${filter === ch.key ? 'var(--primary)' : 'var(--border)'}`,
              background: filter === ch.key ? 'var(--primary-soft)' : 'var(--bg)',
              color: filter === ch.key ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: filter === ch.key ? 600 : 400,
            }}
          >{ch.label} ({ch.n})</button>
        ))}
      </div>

      {/* 主体：可疑列表 + 高频拓新 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        {/* 可疑佣金表 */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {loading && rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>暂无符合条件的可疑佣金 🎉</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>订单</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>受益人</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>买家</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>级</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>金额</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>风险</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>状态</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const rf = (r.risk_flag ?? '').split(',').filter(Boolean)
                  const sMeta = STATUS_LABEL[r.status] ?? { label: r.status, color: 'var(--text-muted)' }
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{r.order_no}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{nameOf(r.beneficiary_id)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{nameOf(r.payer_id)}</td>
                      <td style={{ padding: '10px 12px' }}>L{r.level}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>{fmt(r.commission_amount)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {rf.length === 0 ? <span style={{ color: 'var(--text-muted)' }}>—</span> :
                          rf.map(k => (
                            <span key={k} style={{
                              display: 'inline-block', marginRight: 4, padding: '1px 6px', borderRadius: 4, fontSize: 11,
                              color: '#fff', background: RISK_LABEL[k]?.color ?? '#6b7280',
                            }}>{RISK_LABEL[k]?.label ?? k}</span>
                          ))}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          color: sMeta.color, background: `${sMeta.color}1a`,
                        }}>{sMeta.label}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.status === 'frozen' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => act(r.id, 'pending', true)}
                              disabled={actionId === r.id}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                            >放行</button>
                            <button
                              onClick={() => act(r.id, 'refunded', false)}
                              disabled={actionId === r.id}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                            >拒结</button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>已处理</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 高频拓新 TOP */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>近7天高频拓新 TOP</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>下级注册数异常高者，疑似养号刷量</div>
          {topReferrers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无数据</div>
          ) : (
            topReferrers.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--text)', fontSize: 13 }}>{maskName(t.nickname)}</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: t.count >= 5 ? '#dc2626' : (t.count >= 3 ? '#d97706' : 'var(--text-muted)'),
                }}>{t.count} 人</span>
              </div>
            ))
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.6 }}>
        说明：分佣函数已自动拦截「L1=买家本人」直接自推并冻结「小号链/新号」佣金。
        此处放行=解除冻结进入正常结算队列（需由平台补发流程实际发放）；拒结=永久不结算。
      </p>
    </div>
  )
}
