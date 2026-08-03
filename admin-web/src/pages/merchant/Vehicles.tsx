// @title 自营门店中心 - 流动车管理（P3 门店联动，真实数据）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMyMerchantStore, getMerchantVehicles, createVehicle, updateVehicleName, setVehicleStatus,
  getVehicleTransfers, type MerchantVehicle, type VehicleTransferRow,
} from '@/api/merchant'

const STATUS_LABEL: Record<string, string> = { active: '运营中', offline: '已停驶' }
const STATUS_COLOR: Record<string, string> = { active: 'var(--success-strong)', offline: 'var(--text-muted)' }
const TRANSFER_LABEL: Record<string, string> = { out: '出库', return: '回库', cross: '跨车' }

export default function MerchantVehicles() {
  const { profile } = useAuth()
  const [vehicles, setVehicles] = useState<MerchantVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newName, setNewName] = useState('')

  // 改名弹窗
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // 调拨记录弹窗
  const [transferVehicle, setTransferVehicle] = useState<MerchantVehicle | null>(null)
  const [transfers, setTransfers] = useState<VehicleTransferRow[]>([])
  const [transferLoading, setTransferLoading] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      const list = await getMerchantVehicles(store.id).catch(() => [])
      if (!cancelled) { setVehicles(list); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [profile])

  const reload = async () => {
    if (!storeId) return
    const list = await getMerchantVehicles(storeId).catch(() => [])
    setVehicles(list)
  }

  const handleCreate = async () => {
    if (!storeId) return
    if (!newName.trim()) { alert('请输入流动车名称'); return }
    setSubmitting(true)
    try {
      await createVehicle(storeId, newName)
      await reload()
      setShowCreate(false)
      setNewName('')
      alert('流动车已添加')
    } catch (e: any) {
      alert('添加失败：' + (e?.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async (v: MerchantVehicle) => {
    const next = v.status === 'active' ? 'offline' : 'active'
    try {
      await setVehicleStatus(v.id, next)
      setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, status: next } : x))
    } catch (e: any) { alert('操作失败：' + (e?.message || e)) }
  }

  const handleRename = async () => {
    if (!renameId) return
    try {
      await updateVehicleName(renameId, renameValue)
      setVehicles(prev => prev.map(x => x.id === renameId ? { ...x, name: renameValue.trim() } : x))
      setRenameId(null)
      setRenameValue('')
    } catch (e: any) { alert('改名失败：' + (e?.message || e)) }
  }

  const openTransfers = async (v: MerchantVehicle) => {
    setTransferVehicle(v)
    setTransferLoading(true)
    const list = await getVehicleTransfers(v.id).catch(() => [])
    setTransfers(list)
    setTransferLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700 }}>流动车管理</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>本门店名下流动车（P3 门店联动，随统一运营身份按店隔离）</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!storeId}
          style={{ padding: '10px 20px', background: storeId ? 'var(--success-strong)' : 'var(--border-soft)', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: storeId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>+</span> 新增流动车
        </button>
      </div>

      {!storeId && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>未找到关联门店，请先在「店铺设置」完善门店信息</div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}

      {!loading && storeId && (
        vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>暂无流动车，点击右上角新增</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {vehicles.map(v => (
              <div key={v.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, right: 0, padding: '4px 12px',
                  background: STATUS_COLOR[v.status] || 'var(--border-soft)',
                  borderBottomLeftRadius: 8, color: 'white', fontSize: 12, fontWeight: 600,
                }}>
                  {STATUS_LABEL[v.status] || v.status}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 24 }}>🚚</span>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700 }}>{v.name}</p>
                    <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>编号 {v.id.slice(0, 8)}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleStatus(v)} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    {v.status === 'active' ? '停驶' : '启用'}
                  </button>
                  <button onClick={() => { setRenameId(v.id); setRenameValue(v.name) }} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    改名
                  </button>
                  <button onClick={() => openTransfers(v)} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--primary)', fontSize: 13, cursor: 'pointer' }}>
                    调拨记录
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 新增流动车弹窗 */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreate(false)}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 440, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>新增流动车</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>流动车名称 *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如：城西夜市流动车" style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCreate} disabled={submitting} style={{ flex: 1, padding: '10px', background: submitting ? 'var(--border-soft)' : 'var(--success-strong)', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? '提交中…' : '添加'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 改名弹窗 */}
      {renameId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setRenameId(null)}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>修改流动车名称</h3>
            <input value={renameValue} onChange={e => setRenameValue(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setRenameId(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleRename} style={{ flex: 1, padding: '10px', background: 'var(--success-strong)', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 调拨记录弹窗 */}
      {transferVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setTransferVehicle(null)}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>调拨记录 · {transferVehicle.name}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16 }}>出库 / 回库 / 跨车（弱网离线标记一并展示）</p>
            {transferLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>加载中…</div>
            ) : transfers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 14 }}>暂无调拨记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {transfers.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: 'var(--surface)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, marginRight: 8 }}>{TRANSFER_LABEL[t.type] || t.type}</span>
                      <span style={{ color: 'var(--text)', fontSize: 14 }}>数量 {t.qty}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.created_at.replace('T', ' ').slice(0, 16)}</p>
                      {t.sync_status === 'pending' && <span style={{ color: 'var(--warning)', fontSize: 11 }}>离线待同步</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <button onClick={() => setTransferVehicle(null)} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
