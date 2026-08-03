// @title 自营门店中心 - 小票打印机配置（云打印对接）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore } from '@/api/merchant'
import {
  getPrinterConfig, upsertPrinterConfig, callPrintReceipt,
} from '@/api/printer'

export default function MerchantPrinters() {
  const { profile } = useAuth()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const [provider, setProvider] = useState<'feie' | 'yilianyun' | '365'>('feie')
  const [deviceSn, setDeviceSn] = useState('')
  const [apiUser, setApiUser] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [printerKey, setPrinterKey] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printCount, setPrintCount] = useState(0)
  const [lastPrintAt, setLastPrintAt] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      const cfg = await getPrinterConfig(store.id)
      if (cancelled) return
      if (cfg) {
        setProvider(cfg.provider)
        setDeviceSn(cfg.device_sn)
        setApiUser(cfg.api_user || '')
        setApiKey(cfg.api_key || '')
        setPrinterKey(cfg.printer_key || '')
        setEnabled(cfg.enabled)
        setAutoPrint(cfg.auto_print_on_paid)
        setPrintCount(cfg.print_count)
        setLastPrintAt(cfg.last_print_at)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile])

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSave = async () => {
    if (!storeId) return
    if (!deviceSn.trim()) { showToast('err', '请填写打印机设备编号'); return }
    if (!apiUser.trim() || !apiKey.trim()) { showToast('err', '请填写 API 账号与密钥'); return }
    setSaving(true)
    try {
      const ok = await upsertPrinterConfig({
        store_id: storeId,
        device_sn: deviceSn.trim(),
        provider,
        api_user: apiUser.trim(),
        api_key: apiKey.trim(),
        printer_key: printerKey.trim() || null,
        enabled,
        auto_print_on_paid: autoPrint,
      })
      if (ok) showToast('ok', '打印机配置已保存')
      else showToast('err', '保存失败，请重试')
    } catch (e: any) {
      showToast('err', '保存失败：' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!storeId) return
    setTesting(true)
    try {
      const res = await callPrintReceipt({ storeId, test: true })
      if (res.success) showToast('ok', res.message || '测试小票已推送')
      else if (res.need_config) showToast('err', '该门店未配置已启用的打印机，请先保存配置')
      else showToast('err', '测试打印失败：' + (res.error || '未知错误'))
    } catch (e: any) {
      showToast('err', '测试失败：' + (e?.message || e))
    } finally {
      setTesting(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: 'var(--bg)',
    border: '1px solid var(--border-soft)', borderRadius: 8,
    color: 'var(--text)', fontSize: 14, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6,
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700 }}>小票打印机配置</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>配置云打印设备（飞鹅 / 易联云），订单完成后自动推送小票到门店打印机</p>
      </div>

      {toast && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14, color: 'white',
          background: toast.type === 'ok' ? 'var(--success-strong)' : 'var(--danger)',
        }}>
          {toast.msg}
        </div>
      )}

      {!storeId && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>未找到关联门店，请先在「店铺设置」完善门店信息</div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}

      {!loading && storeId && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>打印机服务商</label>
            <select value={provider} onChange={e => setProvider(e.target.value as 'feie' | 'yilianyun' | '365')} style={fieldStyle}>
              <option value="feie">飞鹅云打印</option>
              <option value="yilianyun">易联云</option>
              <option value="365">365 云打印</option>
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>设备编号 / 机器码 *</label>
            <input value={deviceSn} onChange={e => setDeviceSn(e.target.value)} placeholder="打印机机身或后台的设备编号" style={fieldStyle} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>API 账号（飞鹅 user / 易联云 client_id）*</label>
            <input value={apiUser} onChange={e => setApiUser(e.target.value)} placeholder="服务商后台获取" style={fieldStyle} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>API 密钥（飞鹅 UKEY / 易联云 client_secret）*</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="服务商后台获取" type="password" style={fieldStyle} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>打印机密钥（可选，部分机型需要）</label>
            <input value={printerKey} onChange={e => setPrinterKey(e.target.value)} placeholder="选填" style={fieldStyle} />
          </div>

          <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)' }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} /> 启用打印机
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)' }}>
              <input type="checkbox" checked={autoPrint} onChange={e => setAutoPrint(e.target.checked)} style={{ width: 16, height: 16 }} /> 订单完成后自动打印
            </label>
          </div>

          {printCount > 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16 }}>
              已打印 {printCount} 次{lastPrintAt ? '，最近：' + lastPrintAt.replace('T', ' ').slice(0, 19) : ''}
            </p>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 1, padding: '12px', background: saving ? 'var(--border-soft)' : 'var(--success-strong)',
              border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}>{saving ? '保存中…' : '保存配置'}</button>
            <button onClick={handleTest} disabled={testing} style={{
              flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--primary)',
              borderRadius: 8, color: 'var(--primary)', fontSize: 14, fontWeight: 600,
              cursor: testing ? 'not-allowed' : 'pointer',
            }}>{testing ? '打印中…' : '测试打印'}</button>
          </div>

          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
            提示：测试打印会向该设备推送一张示例小票，用于验证设备联网与凭证是否正确。「订单完成后自动打印」开启后，商家在订单页确认完成时将自动出小票。
          </p>
        </div>
      )}
    </div>
  )
}
