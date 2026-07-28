import { useEffect, useState } from 'react'
import { getLlmConfig, saveLlmConfig, testLlmConfig, type LlmConfigValue } from '@/api/admin'

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
      <h2 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>AI 模型配置</h2>
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
          <label htmlFor="llm-enabled" style={{ fontSize: 14, color: 'var(--text)' }}>启用 AI 识别（关闭则全项目走本地规则兜底）</label>
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
        填写后全项目 AI 能力即时升级。配置变更后 Edge Function 最多 5 分钟生效（内存缓存）。
      </div>
    </div>
  )
}
