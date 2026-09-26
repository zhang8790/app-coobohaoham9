// @title 自营门店中心 - 条形码制作（EAN-13 店内码：生成 / 台账 / 打印）
// 生成 → 打印空白标签 → 贴商品 → 再用「扫码上架」扫此码建档，两步分离。
//
// 为什么要有独立页（而不是只在商品编辑里做）：
//   商品编辑里的「一键生成 + 打印」是一条**隐式**链路，中间任一步失败都表现为
//   「点了没反应 / 打印失败」：
//     · 出码走 RPC（SECURITY DEFINER，必然成功，门店 counter 自增）
//     · 回写 products.barcode 走客户端 REST UPDATE，被 RLS 拒绝时 PostgREST
//       **不报错、只返回 0 行** → 前端以为成功 → 打印时服务端读到空条码
//   本页把「出了哪些码」「有没有真正写进商品」「打印机通不通」全部显式化，
//   并补上「批量为无码商品补码」与「按码补打」两个止血动作。
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/contexts/StoreContext'
import { getMyMerchantStore } from '@/api/merchant'
import { encodeEAN13 } from '@/utils/barcode'

type LedgerRow = {
  id: string
  barcode: string
  barcode_type: string
  product_id: string | null
  status: 'pending' | 'bound'
  created_at: string
}

export default function MerchantBarcodeMaker() {
  const { profile } = useAuth()
  const { selectedStoreId } = useStore()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'gen' | 'print' | 'batch' | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [noCodeCount, setNoCodeCount] = useState(0)
  const [ledgerMissing, setLedgerMissing] = useState(false)

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4500)
  }

  const load = useCallback(async (sid: string) => {
    // 台账（store_barcodes，迁移 20260926_store_barcodes_ledger.sql）
    const { data, error } = await supabase
      .from('store_barcodes')
      .select('id,barcode,barcode_type,product_id,status,created_at')
      .eq('store_id', sid)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      // 表尚未部署时不阻断页面，只是没有历史可查
      setLedgerMissing(true)
      setLedger([])
    } else {
      setLedgerMissing(false)
      setLedger((data || []) as LedgerRow[])
    }
    // 无码商品数：决定「批量补码」按钮是否提示
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', sid)
      .is('barcode', null)
    setNoCodeCount(count || 0)
  }, [])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id, selectedStoreId)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      setStoreName(store.name || '')
      await load(store.id)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile, selectedStoreId, load])

  // 出码：RPC 原子分配（行锁防并发撞码），并写入台账
  const handleGenerate = async () => {
    if (!storeId) return
    setBusy('gen')
    try {
      const { data, error } = await supabase.rpc('fn_alloc_store_barcode', { p_store_id: storeId })
      if (error || !data || !data.length) {
        showToast('err', '生成失败：' + (error?.message || '未知错误'))
        return
      }
      await load(storeId)
      showToast('ok', '已生成店内码：' + data[0].barcode)
    } catch (e: any) {
      showToast('err', '生成失败：' + (e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  // 打印空白标签（裸码，无商品名/价格）
  // 失败时把服务端返回的真实原因透出，并针对「无条码」给出可执行结论
  const handlePrint = async (code: string) => {
    if (!storeId) return
    setBusy('print')
    try {
      const { data, error } = await supabase.functions.invoke('print-receipt', {
        body: { mode: 'barcode', store_id: storeId, barcode: code },
      })
      if (error) { showToast('err', '打印失败：' + error.message); return }
      const d = (data ?? {}) as any
      if (d.need_config) { showToast('err', '该门店未配置已启用的打印机，请先到「小票打印」配置'); return }
      if (d.success) showToast('ok', '空白标签已推送打印')
      else showToast('err', '打印失败：' + (d.error || '未知错误'))
    } catch (e: any) {
      showToast('err', '打印失败：' + (e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  const handleTestPrint = async () => {
    if (!storeId) return
    setBusy('print')
    try {
      const { data, error } = await supabase.functions.invoke('print-receipt', {
        body: { mode: 'barcode', test: true, store_id: storeId },
      })
      if (error) { showToast('err', '测试失败：' + error.message); return }
      const d = (data ?? {}) as any
      if (d.need_config) { showToast('err', '该门店未配置已启用的打印机，请先到「小票打印」配置'); return }
      if (d.success) showToast('ok', '测试标签已推送，请查看打印机')
      else showToast('err', '测试失败：' + (d.error || '未知错误'))
    } catch (e: any) {
      showToast('err', '测试失败：' + (e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  // 批量为无码商品补店内码
  // 关键：update 加 .select() —— PostgREST 对 RLS 拒绝的 UPDATE 不报错、只返回 0 行，
  // 必须按「返回行数」判定是否真的写进去了，否则会出现「界面提示成功、实际没落库」。
  const handleBatchFill = async () => {
    if (!storeId) return
    if (!window.confirm(`将为 ${noCodeCount} 个尚无店内码的商品批量分配并回写条码，是否继续？`)) return
    setBusy('batch')
    let ok = 0
    let blocked = 0
    try {
      const { data: list } = await supabase
        .from('products')
        .select('id,name,barcode')
        .eq('store_id', storeId)
        .is('barcode', null)
        .limit(500)
      for (const p of list || []) {
        const { data: alloc } = await supabase.rpc('fn_alloc_store_barcode', { p_store_id: storeId })
        const code = alloc?.[0]?.barcode
        if (!code) continue
        const { data: updated, error: upErr } = await supabase
          .from('products')
          .update({ barcode: code, barcode_type: 'EAN13' })
          .eq('id', p.id)
          .select('id')
        if (upErr || !updated || updated.length === 0) blocked++
        else ok++
      }
      await load(storeId)
      if (blocked > 0) {
        showToast('err', `成功 ${ok} 个，${blocked} 个被安全策略拒绝（当前账号可能不是该门店负责人，请用负责人账号操作）`)
      } else {
        showToast('ok', `已为 ${ok} 个商品补上店内码`)
      }
    } catch (e: any) {
      showToast('err', '批量补码失败：' + (e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700 }}>条形码制作</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
          生成 EAN-13 店内码 → 打印空白标签贴商品 → 再用小程序「扫码上架」扫此码建档
          {storeName ? `（当前门店：${storeName}）` : ''}
        </p>
      </div>

      {toast && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14, color: 'white',
          background: toast.type === 'ok' ? 'var(--success-strong)' : 'var(--danger)',
        }}>{toast.msg}</div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}
      {!loading && !storeId && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>未找到关联门店，请先在「店铺设置」完善门店信息</div>
      )}

      {!loading && storeId && (
        <>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={handleGenerate} disabled={busy !== null} style={{
                flex: 1, minWidth: 180, padding: '12px', border: 'none', borderRadius: 8, color: 'white',
                background: busy ? 'var(--border-soft)' : 'var(--success-strong)',
                fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
              }}>{busy === 'gen' ? '生成中…' : '生成新店内码'}</button>
              <button onClick={handleTestPrint} disabled={busy !== null} style={{
                flex: 1, minWidth: 180, padding: '12px', border: '1px solid var(--primary)', borderRadius: 8,
                background: 'transparent', color: 'var(--primary-strong)',
                fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
              }}>{busy === 'print' ? '打印中…' : '测试打印（验证设备）'}</button>
            </div>

            {noCodeCount > 0 && (
              <div style={{
                marginTop: 16, padding: '12px 14px', borderRadius: 8,
                background: 'var(--warning-soft, #FEF3C7)', border: '1px solid var(--warning, #D97706)',
              }}>
                <p style={{ color: '#92400E', fontSize: 13, margin: 0, lineHeight: 1.7 }}>
                  本店还有 <b>{noCodeCount}</b> 个商品没有店内码（扫码收银/扫码上架会扫不出来）。
                </p>
                <button onClick={handleBatchFill} disabled={busy !== null} style={{
                  marginTop: 10, padding: '8px 16px', border: 'none', borderRadius: 6,
                  background: '#D97706', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}>{busy === 'batch' ? '补码中…' : '批量补店内码'}</button>
              </div>
            )}

            {ledgerMissing && (
              <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
                提示：店内码台账表（store_barcodes）尚未部署，历史码暂不可查/补打。
                请在 Supabase 执行迁移 <code>20260926_store_barcodes_ledger.sql</code> 后刷新本页。
              </p>
            )}
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>店内码台账</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 16px' }}>
              出码即留痕，可随时补打。灰色 = 已绑定商品（无需再打空白标签）。
            </p>

            {ledger.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 14 }}>
                尚无店内码，点上方「生成新店内码」开始
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ledger.map(row => {
                  const enc = encodeEAN13(row.barcode)
                  const bound = row.status === 'bound'
                  return (
                    <div key={row.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      background: 'var(--bg)', border: '1px solid var(--border-soft)',
                      opacity: bound ? 0.6 : 1,
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'monospace', fontSize: 15, fontWeight: 700,
                            color: bound ? 'var(--text-dim)' : 'var(--text)', letterSpacing: 1,
                          }}>{row.barcode}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            color: bound ? 'var(--text-dim)' : 'var(--success-strong)',
                            border: `1px solid ${bound ? 'var(--border)' : 'var(--success-strong)'}`,
                          }}>{bound ? '已绑商品' : '待上架'}</span>
                        </div>
                        <div style={{ marginTop: 8, background: '#fff', borderRadius: 6, padding: 6, display: 'inline-block' }}>
                          {enc ? (
                            <div style={{ display: 'flex', height: 34, alignItems: 'stretch' }}>
                              {enc.modules.split('').map((m, i) => (
                                <div key={i} style={{ width: 2, background: m === '1' ? '#000' : '#fff' }} />
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--danger)', fontSize: 12 }}>条码格式无效</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => handlePrint(row.barcode)} disabled={busy !== null} style={{
                          padding: '8px 14px', border: 'none', borderRadius: 6, background: '#FF8C42',
                          color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                        }}>打印</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
