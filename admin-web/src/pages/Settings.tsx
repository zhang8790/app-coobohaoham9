import { useEffect, useState } from 'react'
import { getLlmConfig, saveLlmConfig, testLlmConfig, getLlmUsageStats, getLlmRecentLogs, type LlmConfigValue, type LlmUsageStats, type LlmRecentLog } from '@/api/admin'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6,
}
const hintStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6,
}

export default function Settings() {
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [enabled, setEnabled] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // ---- token 用量统计 ----
  const [stats, setStats] = useState<LlmUsageStats | null>(null)
  const [logs, setLogs] = useState<LlmRecentLog[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const cfg: LlmConfigValue | null = await getLlmConfig()
        if (cfg) {
          setBaseUrl(cfg.base_url || 'https://api.openai.com/v1')
          setApiKey(cfg.api_key || '')
          setModel(cfg.model || 'gpt-4o-mini')
          setEnabled(cfg.enabled !== false)
        }
      } catch (e: any) {
        setMsg({ type: 'error', text: `读取配置失败：${e?.message || e}` })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 加载用量统计 + 最近明细
  useEffect(() => {
    (async () => {
      try {
        const [s, l] = await Promise.all([getLlmUsageStats(30), getLlmRecentLogs(50)])
        setStats(s)
        setLogs(l || [])
      } catch {
        // 统计失败不阻断配置页
      } finally {
        setStatsLoading(false)
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    try {
      const ok = await saveLlmConfig({
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        model: model.trim(),
        enabled,
      })
      setMsg(ok
        ? { type: 'success', text: '配置已保存，全项目立即生效（Edge Function 5 分钟内自动刷新缓存）' }
        : { type: 'error', text: '保存失败' })
    } catch (e: any) {
      setMsg({ type: 'error', text: `保存失败：${e?.message || e}` })
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true); setMsg(null)
    try {
      const r = await testLlmConfig()
      setMsg({ type: r.ok ? 'success' : 'error', text: r.message })
    } catch (e: any) {
      setMsg({ type: 'error', text: `测试失败：${e?.message || e}` })
    } finally { setTesting(false) }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>加载中...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>智能模型配置</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '0 0 20px' }}>
        填写模型网址与 Key 后，全项目（小程序智能识别 / 食疗导购 / 情绪编译）统一调用，无需改代码、无需重启。
      </p>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24,
      }}>
        {/* Base URL */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>模型网址（Base URL）</label>
          <input
            style={inputStyle} value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
          <p style={hintStyle}>OpenAI 兼容接口地址；自建/代理/第三方（如 DeepSeek、通义、智谱）填对应 /v1 前缀。</p>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              type={showKey ? 'text' : 'password'}
              value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(v => !v)}
              style={{ padding: '0 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
            >{showKey ? '隐藏' : '显示'}</button>
          </div>
          <p style={hintStyle}>密钥仅存数据库并以 RLS 隔离，仅管理员可读；客户端（小程序/普通用户）永不接触。</p>
        </div>

        {/* Model */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>模型名称（Model）</label>
          <input
            style={inputStyle} value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
          <p style={hintStyle}>文本类用 gpt-4o-mini / deepseek-chat 等；如需「传图识菜」请填视觉模型（gpt-4o / gemini-1.5-pro / qwen-vl-max 等）。</p>
        </div>

        {/* Enabled */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <input
            type="checkbox" id="llm-enabled" checked={enabled}
            onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }}
          />
          <label htmlFor="llm-enabled" style={{ fontSize: 14, color: 'var(--text)' }}>启用智能识图（关闭则全项目走本地规则兜底）</label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={handleSave} disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >{saving ? '保存中…' : '保存配置'}</button>
          <button
            onClick={handleTest} disabled={testing || !apiKey}
            style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, cursor: (testing || !apiKey) ? 'not-allowed' : 'pointer', opacity: (testing || !apiKey) ? 0.6 : 1 }}
          >{testing ? '测试中…' : '测试连接'}</button>
        </div>

        {msg && (
          <div style={{
            marginTop: 18, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: msg.type === 'success' ? 'var(--success-soft)' : msg.type === 'error' ? 'var(--warning-soft)' : 'var(--bg)',
            color: msg.type === 'success' ? 'var(--success)' : msg.type === 'error' ? 'var(--warning)' : 'var(--text-muted)',
            border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : msg.type === 'error' ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
          }}>{msg.text}</div>
        )}
      </div>

      <div style={{
        marginTop: 16, padding: '12px 16px', borderRadius: 8,
        background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7,
      }}>
        说明：未填写 Key 时，小程序「智能识别」自动回退本地规则引擎，系统照常可用；
        填写后全项目智能能力即时升级。配置变更后 Edge Function 最多 5 分钟生效（内存缓存）。
      </div>

      {/* ================= 智能模型调用统计 ================= */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>智能模型调用统计</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '0 0 16px' }}>
          统计近 30 天各 Edge Function 调用大模型消耗的 token（含成功/失败明细）。
        </p>

        {statsLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>统计加载中…</div>
        ) : (
          <>
            {/* KPI 卡 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: '今日调用', value: stats?.today.today_calls ?? 0, sub: `${stats?.today.today_tokens ?? 0} tokens` },
                { label: '累计调用', value: stats?.totals.total_calls ?? 0, sub: `${stats?.totals.total_tokens ?? 0} tokens` },
                { label: '累计输入', value: stats?.totals.total_prompt ?? 0, sub: 'prompt tokens' },
                { label: '累计输出', value: stats?.totals.total_completion ?? 0, sub: 'completion tokens' },
                { label: '失败次数', value: stats?.totals.failed_calls ?? 0, sub: '自动降级规则' },
              ].map((k) => (
                <div key={k.label} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{k.value.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* 模块占比 + 趋势 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 1.4fr)', gap: 16, marginTop: 16 }}>
              {/* 模块占比 */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>模块占比（按 token）</div>
                {(stats?.by_module?.length ?? 0) === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无调用记录</div>
                ) : (
                  (() => {
                    const max = Math.max(...(stats?.by_module ?? []).map((m) => m.tokens), 1)
                    return (stats?.by_module ?? []).map((m) => (
                      <div key={m.module} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
                          <span>{m.module}</span>
                          <span style={{ color: 'var(--text-dim)' }}>{m.tokens.toLocaleString()} · {m.calls}次</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(4, (m.tokens / max) * 100)}%`, background: 'var(--primary)', borderRadius: 4 }} />
                        </div>
                      </div>
                    ))
                  })()
                )}
              </div>

              {/* 最近 30 天趋势 */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>每日 token 趋势（近 30 天）</div>
                {(stats?.by_day?.length ?? 0) === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无数据</div>
                ) : (
                  (() => {
                    const days = stats?.by_day ?? []
                    const max = Math.max(...days.map((d) => d.tokens), 1)
                    const w = 520, h = 120, pad = 6
                    const stepX = (w - pad * 2) / Math.max(days.length - 1, 1)
                    const pts = days.map((d, i) => {
                      const x = pad + i * stepX
                      const y = h - pad - (d.tokens / max) * (h - pad * 2)
                      return `${x.toFixed(1)},${y.toFixed(1)}`
                    }).join(' ')
                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="none">
                        <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2" />
                        {days.map((d, i) => d.tokens > 0 ? (
                          <circle key={i} cx={pad + i * stepX} cy={h - pad - (d.tokens / max) * (h - pad * 2)} r="2.5" fill="var(--primary)" />
                        ) : null)}
                      </svg>
                    )
                  })()
                )}
              </div>
            </div>

            {/* 最近明细 */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>最近调用明细</div>
              {logs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无记录</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: 'var(--text-dim)', textAlign: 'left' }}>
                        <th style={thStyle}>时间</th>
                        <th style={thStyle}>模块</th>
                        <th style={thStyle}>函数</th>
                        <th style={thStyle}>模型</th>
                        <th style={thStyle}>tokens</th>
                        <th style={thStyle}>耗时</th>
                        <th style={thStyle}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.slice(0, 20).map((l) => (
                        <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={tdStyle}>{new Date(l.created_at).toLocaleString('zh-CN', { hour12: false })}</td>
                          <td style={tdStyle}>{l.module ?? '-'}</td>
                          <td style={tdStyle}>{l.function_name}</td>
                          <td style={tdStyle}>{l.model}</td>
                          <td style={tdStyle}>{l.total_tokens.toLocaleString()}</td>
                          <td style={tdStyle}>{l.latency_ms != null ? `${l.latency_ms}ms` : '-'}</td>
                          <td style={tdStyle}>
                            <span style={{ color: l.success ? 'var(--success)' : 'var(--warning)' }}>{l.success ? '成功' : '失败'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', whiteSpace: 'nowrap' }
