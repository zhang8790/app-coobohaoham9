import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { encodeEAN13 } from '@/utils/barcode'
import { NavIcon } from '@/components/icons'

// 总后台 · 条形码制作（独立菜单页）
// 流程：选门店 → 单次/批量生成 EAN-13 店内码 → 预览 → 打印空白「待上架」标签 → 引导去「扫码上架」建档
// 与商家端商品页内的「生成条形码」板块共用同一套后端（fn_alloc_store_barcode / print-receipt barcode 模式）

interface StoreOpt {
  id: string
  name: string
  barcode_prefix: string | null
  barcode_counter: number | null
}

interface GenCode {
  code: string
  ts: number
}

const card: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20,
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)',
  borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13,
}

// EAN-13 屏幕预览条空渲染（人眼可辨 + 数字可读，真实扫码靠打印纸）
function BarcodePreview({ code }: { code: string }) {
  const enc = encodeEAN13(code)
  if (!enc) {
    return <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18 }}>{code}</div>
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', background: '#fff', padding: '8px 10px', borderRadius: 8, width: 'fit-content' }}>
        {enc.modules.split('').map((m, i) => (
          <div key={i} style={{ width: 2, height: 56, background: m === '1' ? '#111' : '#fff' }} />
        ))}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 15, letterSpacing: 3, marginTop: 6, color: 'var(--text)' }}>{code}</div>
    </div>
  )
}

export default function BarcodeMaker() {
  const [stores, setStores] = useState<StoreOpt[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [storeId, setStoreId] = useState<string>('')
  const [qty, setQty] = useState<number>(1)
  const [genCodes, setGenCodes] = useState<GenCode[]>([])
  const [genLoading, setGenLoading] = useState(false)
  const [printingCode, setPrintingCode] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  // 加载所有门店（总后台可见全部门店）
  const loadStores = useCallback(async () => {
    setStoresLoading(true)
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, barcode_prefix, barcode_counter')
        .order('created_at', { ascending: true })
      if (error) throw error
      const list = (data ?? []) as StoreOpt[]
      setStores(list)
      // 默认选中第一个已配置前缀的门店
      const ready = list.find(s => s.barcode_prefix)
      setStoreId(ready?.id ?? list[0]?.id ?? '')
    } catch (e: any) {
      console.warn('[BarcodeMaker] 加载门店失败:', e)
      showToast('门店加载失败：' + (e?.message || '未知错误'))
    } finally {
      setStoresLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadStores() }, [loadStores])

  const selectedStore = stores.find(s => s.id === storeId) ?? null

  // 生成店内码（单次或批量）
  const genBarcodes = async () => {
    if (!storeId) { showToast('请先选择门店'); return }
    if (!selectedStore?.barcode_prefix) {
      showToast('该门店未配置店内码前缀（barcode_prefix），无法生成，请先在门店设置中分配')
      return
    }
    const n = Math.min(Math.max(1, Math.floor(qty)), 50)
    setGenLoading(true)
    let ok = 0
    try {
      for (let i = 0; i < n; i++) {
        const { data, error } = await supabase.rpc('fn_alloc_store_barcode', { p_store_id: storeId })
        if (error || !data || !data.length) {
          showToast('生成失败：' + (error?.message || '未知错误'))
          break
        }
        const code = (data[0] as any).barcode as string
        setGenCodes(g => [{ code, ts: Date.now() + i }, ...g].slice(0, 50))
        ok++
      }
      if (ok > 0) showToast(`已生成 ${ok} 个店内码`)
    } finally {
      setGenLoading(false)
    }
  }

  // 打印空白「待上架」标签（裸码，无商品名/价格）
  const printBare = async (code: string) => {
    if (!storeId) return
    setPrintingCode(code)
    try {
      const { data, error } = await supabase.functions.invoke('print-receipt', {
        body: { mode: 'barcode', store_id: storeId, barcode: code },
      })
      if (error) { showToast('打印失败：' + error.message); return }
      const d = (data ?? {}) as any
      if (d.need_config) { showToast('该门店尚未配置易联云打印机，请先在门店设置中配置'); return }
      if (d.success) showToast(`已推送打印空白标签 ${code}`)
      else showToast(d.message || '打印请求已发送')
    } finally {
      setPrintingCode(null)
    }
  }

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <NavIcon name="tag" size={20} /> 条形码制作
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '6px 0 0' }}>
            为无原厂码商品生成合法 EAN-13 店内码，打印空白标签贴商品；再去商家后台「商品 → 扫码上架」扫此码建档上架。
          </p>
        </div>
      </div>

      {/* 步骤条 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {['1. 选择门店', '2. 生成店内码', '3. 打印空白标签', '4. 扫码上架建档'].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 16px' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{s}</span>
          </div>
        ))}
      </div>

      {/* 控制区 */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <label style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }}>选择门店</label>
            <select
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              disabled={storesLoading}
              style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
            >
              {storesLoading ? <option>加载门店中…</option> : stores.length === 0 ? <option>无门店</option> : null}
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.barcode_prefix ? `（前缀 ${s.barcode_prefix}）` : '（未配置前缀）'}
                </option>
              ))}
            </select>
            {selectedStore && (
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '8px 0 0' }}>
                店内码前缀：<b style={{ color: 'var(--text)' }}>{selectedStore.barcode_prefix || '未配置'}</b>
                {' · '}已用序号：<b style={{ color: 'var(--text)' }}>{selectedStore.barcode_counter ?? 0}</b>
              </p>
            )}
          </div>

          <div style={{ width: 140 }}>
            <label style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }}>批量数量（1-50）</label>
            <input
              type="number" min={1} max={50} value={qty}
              onChange={e => setQty(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
            />
          </div>

          <button onClick={genBarcodes} disabled={genLoading || !storeId} style={{ ...primaryBtn, opacity: (genLoading || !storeId) ? 0.6 : 1, cursor: (genLoading || !storeId) ? 'not-allowed' : 'pointer' }}>
            {genLoading ? '生成中…' : `＋ 生成 ${qty > 1 ? qty + ' 个' : '新店内码'}`}
          </button>
        </div>
      </div>

      {/* 已生成列表 */}
      {genCodes.length > 0 && (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ color: 'var(--text)', margin: 0, fontSize: 15, fontWeight: 700 }}>本次生成（{genCodes.length}）</h3>
            <button onClick={() => setGenCodes([])} style={ghostBtn}>清空</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {genCodes.map((g, i) => (
              <div key={g.ts + '-' + i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BarcodePreview code={g.code} />
                <button
                  onClick={() => printBare(g.code)}
                  disabled={printingCode === g.code}
                  style={{ ...primaryBtn, background: printingCode === g.code ? 'var(--warning)' : 'var(--primary)', opacity: printingCode === g.code ? 0.8 : 1, fontSize: 13, padding: '8px 0' }}
                >
                  {printingCode === g.code ? '打印中…' : '🖨 打印空白标签'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 引导：扫码上架 */}
      <div style={{ marginTop: 20, background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 12, padding: 16 }}>
        <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>下一步：扫码上架建档</p>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          将打印好的空白标签贴到商品上，进入 <b style={{ color: 'var(--text)' }}>商家后台 → 商品 → 扫码上架</b>，扫描该店内码即可快速建档（录入名称/价格/库存），无需手动输入条码。
          同一店内码仅首次上架可绑定商品，重复扫码会提示已占用。
        </p>
      </div>

      {/* toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '12px 18px', color: 'var(--text)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
