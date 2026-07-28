import { useEffect, useState, useCallback } from 'react'
import { getCategories, createStoreCategory, updateStoreCategory, deleteStoreCategory, countProductsByCategory, syncStoreCategoryName } from '@/api/categories'
import type { StoreCategory } from '@/types'

export default function Categories() {
  const [list, setList] = useState<StoreCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSort, setNewSort] = useState(99)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getCategories({ includeGlobal: true })
    setList(data.filter(c => c.scope === 'global'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newName.trim()) { alert('请输入分类名称'); return }
    setBusy(true)
    const created = await createStoreCategory({ storeId: null, name: newName.trim(), sortOrder: newSort, scope: 'global' })
    setBusy(false)
    if (!created) { alert('创建失败，请重试'); return }
    setNewName(''); setNewSort(99)
    load()
  }

  const handleSaveRename = async (c: StoreCategory) => {
    const name = editingName.trim()
    if (!name) { setEditingId(null); return }
    if (name === c.name) { setEditingId(null); return }
    setBusy(true)
    // 改名前：统计同名商品，提示是否级联同步（避免"按名称匹配"方案下商品丢失归类）
    let affected = 0
    try {
      affected = await countProductsByCategory(c.name)
    } catch { /* 忽略统计错误，继续改名 */ }
    if (affected > 0 && !confirm(`有 ${affected} 个商品的分类为「${c.name}」，是否同步改名为「${name}」？\n确定=同步商品归类；取消=只改类目名（这些商品将不再归入此类）`)) {
      setBusy(false); setEditingId(null); return
    }
    if (affected > 0) await syncStoreCategoryName(c.name, name)
    await updateStoreCategory(c.id, { name })
    setBusy(false); setEditingId(null)
    load()
  }

  const handleDelete = async (c: StoreCategory) => {
    if (!confirm(`确认删除全局分类「${c.name}」？该分类下商品将自动归为「未分类」。`)) return
    setBusy(true)
    await deleteStoreCategory(c.id)
    setBusy(false)
    load()
  }

  const handleToggleActive = async (c: StoreCategory) => {
    setBusy(true)
    await updateStoreCategory(c.id, { is_active: !c.is_active })
    setBusy(false)
    load()
  }

  const handleMove = async (c: StoreCategory, dir: -1 | 1) => {
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(x => x.id === c.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    setBusy(true)
    await updateStoreCategory(c.id, { sort_order: other.sort_order })
    await updateStoreCategory(other.id, { sort_order: c.sort_order })
    setBusy(false)
    load()
  }

  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    btn: (bg: string, fg = 'white') => ({ padding: '6px 14px', background: bg, color: fg, border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>商品分类管理（平台全局）</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>平台统一维护的分类（🌐 全局），对所有自营门店生效；商家可在各自后台新建「店内分类」。</p>
      </div>

      {/* 新增 */}
      <div style={S.card}>
        <p style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>新增全局分类</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="分类名称"
            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }}
          />
          <input
            type="number"
            value={newSort}
            onChange={e => setNewSort(Number(e.target.value))}
            placeholder="排序"
            style={{ width: 80, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }}
          />
          <button onClick={handleAdd} disabled={busy} style={S.btn('var(--primary)')}>新建</button>
        </div>
      </div>

      {/* 列表 */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>排序</th>
              <th style={S.th}>分类名称</th>
              <th style={S.th}>范围</th>
              <th style={S.th}>创建时间</th>
              <th style={S.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>暂无全局分类</td></tr>
            ) : [...list].sort((a, b) => a.sort_order - b.sort_order).map(c => (
              <tr key={c.id}>
                <td style={S.td}>{c.sort_order}</td>
                <td style={{ ...S.td, color: 'var(--text)' }}>
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => handleSaveRename(c)}
                      style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                    />
                  ) : (
                    <span>{c.name}</span>
                  )}
                </td>
                <td style={S.td}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--info-soft)', color: 'var(--info-strong)' }}>🌐 全局</span>
                </td>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{new Date((c as any).created_at ?? Date.now()).toLocaleString('zh-CN')}</td>
                <td style={S.td}>
                  <button onClick={() => handleToggleActive(c)} style={{ ...S.btn(c.is_active ? 'var(--border-soft)' : 'var(--success-strong)'), marginRight: 6 }}>
                    {c.is_active ? '下架' : '上架'}
                  </button>
                  <button onClick={() => handleMove(c, -1)} style={{ ...S.btn('var(--border-soft)'), marginRight: 6 }}>↑</button>
                  <button onClick={() => handleMove(c, 1)} style={{ ...S.btn('var(--border-soft)'), marginRight: 8 }}>↓</button>
                  {editingId === c.id
                    ? <button onClick={() => handleSaveRename(c)} style={S.btn('var(--success-strong)')}>保存</button>
                    : <button onClick={() => { setEditingId(c.id); setEditingName(c.name) }} style={{ ...S.btn('var(--border-soft)'), marginRight: 8 }}>改名</button>}
                  <button onClick={() => handleDelete(c)} style={S.btn('var(--danger)')}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
