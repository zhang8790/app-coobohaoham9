// 来电有喜 · 管理后台「临期预警看板」
// 数据来源：v_near_expiry_products（自动折扣视图）/ stock_batches（手动覆盖）/ expiry_alert_log（审计）/ system_config(key='expiry' 阈值)
// 注：stock_batches 已 DISABLE RLS（anon 可写）；expiry_alert_log / system_config 可能受 RLS 拦截 → 均做容错
import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface NearExpiryRow {
  product_id: string
  store_id: string | null
  name: string | null
  image_url: string | null
  price: number
  original_price: number | null
  batch_id: string
  auto_discount_rate: number
  qty: number | null
  effective_price: number
  expire_at: string
  days_left: number
  discount_stage: string
  ai_reason: string | null
  decided_by: string | null
}

interface AuditRow {
  id?: string
  product_id?: string
  batch_id?: string
  old_rate?: number | null
  new_rate?: number | null
  stage?: string | null
  reason?: string | null
  decided_by?: string | null
  decided_at?: string
}

const STAGE_COLOR: Record<string, string> = {
  red: '#EF4444', orange: '#F97316', amber: '#F59E0B', normal: '#22C55E', expired: '#6B7280',
}
const STAGE_LABEL: Record<string, string> = {
  red: '紧急', orange: '紧迫', amber: '临期', normal: '正常', expired: '已过期',
}

// 与迁移 00213 种子一致的默认值，system_config 读不到时兜底渲染
const DEFAULT_CFG = {
  red_days: 3,
  orange_days: 7,
  amber_days: 15,
  red_ratio: 0.1,
  orange_ratio: 0.3,
  amber_ratio: 0.5,
  base_discount: { amber: 10, orange: 25, red: 40 },
  boost_per_3_days: 10,
  max_discount: 90,
  allow_below_cost: false,
}

export default function Expiry() {
  const [rows, setRows] = useState<NearExpiryRow[]>([])
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [cfg, setCfg] = useState<any>(DEFAULT_CFG)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'batches' | 'audit' | 'config'>('batches')
  const [msg, setMsg] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  const th: CSSProperties = { textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }
  const td: CSSProperties = { padding: '10px 12px', color: 'var(--text)', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

  const load = useCallback(async () => {
    setLoading(true)
    const { data: v } = await supabase
      .from('v_near_expiry_products')
      .select('*')
      .order('days_left', { ascending: true })
    setRows((v as NearExpiryRow[]) ?? [])

    try {
      const { data: a } = await supabase
        .from('expiry_alert_log')
        .select('*')
        .order('decided_at', { ascending: false })
        .limit(100)
      setAudits((a as AuditRow[]) ?? [])
    } catch {
      setAudits([])
    }

    try {
      const { data: c } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'expiry')
        .single()
      if (c?.value) setCfg({ ...DEFAULT_CFG, ...(c.value as any) })
    } catch {
      /* RLS 拦截 → 用默认值渲染 */
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const stats = {
    total: rows.length,
    red: rows.filter((r) => r.discount_stage === 'red').length,
    orange: rows.filter((r) => r.discount_stage === 'orange').length,
    amber: rows.filter((r) => r.discount_stage === 'amber').length,
  }

  const saveDiscount = async (batchId: string, daysLeft: number) => {
    const rate = Number(overrides[batchId])
    if (Number.isNaN(rate) || rate < 0 || rate > 90) {
      setMsg('折扣需在 0~90 之间')
      return
    }
    // 视图 v_near_expiry_products 按 discount_stage 过滤；手动覆盖必须同步写 stage，
    // 否则即便设了折扣率，批次仍因 stage='normal' 不被视图收录 → 前台看不到。
    const stage = rate <= 0 ? 'normal'
      : daysLeft <= cfg.red_days ? 'red'
      : daysLeft <= cfg.orange_days ? 'orange'
      : 'amber'
    const { error } = await supabase
      .from('stock_batches')
      .update({ auto_discount_rate: rate, decided_by: 'merchant_manual', discount_stage: stage })
      .eq('id', batchId)
    if (error) {
      setMsg('保存失败：' + error.message)
      return
    }
    setMsg(rate > 0 ? `已保存折扣覆盖（分级：${STAGE_LABEL[stage] || stage}）` : '已恢复原价')
    setRows((rs) => rs.map((r) => (r.batch_id === batchId
      ? { ...r, auto_discount_rate: rate, discount_stage: stage, effective_price: Math.round(r.price * (1 - rate / 100) * 100) / 100 }
      : r)))
  }

  const saveCfg = async () => {
    const { error } = await supabase
      .from('system_config')
      .upsert({ key: 'expiry', value: cfg, updated_at: new Date().toISOString() })
    if (error) {
      setMsg('阈值保存失败：' + error.message + '（可能 RLS 拦截，请在 Supabase 后台修改 system_config 或加读/写策略）')
      return
    }
    setMsg('阈值配置已保存')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>临期预警看板</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
            自动折扣引擎结果 · 手动覆盖 · 审计归因 · 阈值配置
          </p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          刷新
        </button>
      </div>

      {/* 统计卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: '临期商品', value: stats.total, color: 'var(--primary)' },
          { label: '紧急(red)', value: stats.red, color: STAGE_COLOR.red },
          { label: '紧迫(orange)', value: stats.orange, color: STAGE_COLOR.orange },
          { label: '临期(amber)', value: stats.amber, color: STAGE_COLOR.amber },
        ].map((c) => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 28, fontWeight: 700, margin: '6px 0 0', lineHeight: 1 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* Tab */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {([['batches', '临期批次'], ['audit', '审计日志'], ['config', '阈值配置']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14,
              color: tab === k ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab === k ? 600 : 400, marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-dim)', padding: 24 }}>加载中…</p>
      ) : (
        <>
          {tab === 'batches' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={th}>商品</th>
                    <th style={th}>到期日</th>
                    <th style={th}>剩</th>
                    <th style={th}>库存</th>
                    <th style={th}>原价</th>
                    <th style={th}>折后价</th>
                    <th style={th}>分级</th>
                    <th style={th}>决策</th>
                    <th style={th}>理由</th>
                    <th style={th}>覆盖折扣%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>暂无临期商品</td></tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.batch_id}>
                        <td style={td}>{r.name || r.product_id}</td>
                        <td style={td}>{r.expire_at ? new Date(r.expire_at).toLocaleDateString('zh-CN') : '-'}</td>
                        <td style={{ ...td, color: STAGE_COLOR[r.discount_stage] || 'var(--text)', fontWeight: 600 }}>{r.days_left}天</td>
                        <td style={td}>{r.qty ?? '-'}</td>
                        <td style={td}>¥{r.price}</td>
                        <td style={{ ...td, color: 'var(--primary)', fontWeight: 600 }}>¥{r.effective_price}</td>
                        <td style={td}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff', background: STAGE_COLOR[r.discount_stage] || '#6B7280' }}>
                            {STAGE_LABEL[r.discount_stage] || r.discount_stage}
                          </span>
                        </td>
                        <td style={td}>{r.decided_by === 'ai' ? '智能' : r.decided_by === 'merchant_manual' ? '手动' : '规则'}</td>
                        <td style={{ ...td, color: 'var(--text-dim)', maxWidth: 220 }}>{r.ai_reason || '-'}</td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="number"
                              min={0}
                              max={90}
                              defaultValue={r.auto_discount_rate}
                              onChange={(e) => setOverrides((o) => ({ ...o, [r.batch_id]: e.target.value }))}
                              style={{ width: 56, padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
                            />
                            <button
                              onClick={() => saveDiscount(r.batch_id, r.days_left)}
                              style={{ padding: '4px 10px', background: 'var(--primary)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}
                            >
                              保存
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'audit' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={th}>时间</th>
                    <th style={th}>商品</th>
                    <th style={th}>折扣变化</th>
                    <th style={th}>分级</th>
                    <th style={th}>决策</th>
                    <th style={th}>理由</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                      暂无审计记录（若引擎未运行或 expiry_alert_log 受 RLS 拦截则显示此状态）
                    </td></tr>
                  ) : (
                    audits.map((a, i) => (
                      <tr key={a.id || i}>
                        <td style={td}>{a.decided_at ? new Date(a.decided_at).toLocaleString('zh-CN') : '-'}</td>
                        <td style={td}>{a.product_id || a.batch_id || '-'}</td>
                        <td style={{ ...td, color: 'var(--primary)' }}>
                          {a.old_rate ?? 0}% → {a.new_rate ?? 0}%
                        </td>
                        <td style={td}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff', background: STAGE_COLOR[a.stage || 'normal'] || '#6B7280' }}>
                            {STAGE_LABEL[a.stage || 'normal'] || a.stage}
                          </span>
                        </td>
                        <td style={td}>{a.decided_by === 'ai' ? '智能' : a.decided_by === 'merchant_manual' ? '手动' : '规则'}</td>
                        <td style={{ ...td, color: 'var(--text-dim)', maxWidth: 280 }}>{a.reason || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'config' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 560 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 16px' }}>
                引擎分级阈值与折扣基线（改这里即改行为，无需改代码）。保存写入 system_config(key='expiry')。
              </p>
              <Field label="紧急阈值(天) red_days">
                <input type="number" value={cfg.red_days}
                  onChange={(e) => setCfg({ ...cfg, red_days: Number(e.target.value) })}
                  style={inputStyle} />
              </Field>
              <Field label="紧迫阈值(天) orange_days">
                <input type="number" value={cfg.orange_days}
                  onChange={(e) => setCfg({ ...cfg, orange_days: Number(e.target.value) })}
                  style={inputStyle} />
              </Field>
              <Field label="临期阈值(天) amber_days">
                <input type="number" value={cfg.amber_days}
                  onChange={(e) => setCfg({ ...cfg, amber_days: Number(e.target.value) })}
                  style={inputStyle} />
              </Field>
              <Field label="临期基础折扣% amber">
                <input type="number" value={cfg.base_discount?.amber ?? 0}
                  onChange={(e) => setCfg({ ...cfg, base_discount: { ...cfg.base_discount, amber: Number(e.target.value) } })}
                  style={inputStyle} />
              </Field>
              <Field label="紧迫基础折扣% orange">
                <input type="number" value={cfg.base_discount?.orange ?? 0}
                  onChange={(e) => setCfg({ ...cfg, base_discount: { ...cfg.base_discount, orange: Number(e.target.value) } })}
                  style={inputStyle} />
              </Field>
              <Field label="紧急基础折扣% red">
                <input type="number" value={cfg.base_discount?.red ?? 0}
                  onChange={(e) => setCfg({ ...cfg, base_discount: { ...cfg.base_discount, red: Number(e.target.value) } })}
                  style={inputStyle} />
              </Field>
              <Field label="最大折扣% max_discount">
                <input type="number" value={cfg.max_discount}
                  onChange={(e) => setCfg({ ...cfg, max_discount: Number(e.target.value) })}
                  style={inputStyle} />
              </Field>
              <Field label="允许低于成本 allow_below_cost">
                <input type="checkbox" checked={!!cfg.allow_below_cost}
                  onChange={(e) => setCfg({ ...cfg, allow_below_cost: e.target.checked })}
                  style={{ width: 18, height: 18 }} />
              </Field>

              <button
                onClick={saveCfg}
                style={{ marginTop: 8, padding: '10px 20px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                保存阈值配置
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14,
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
