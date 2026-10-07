import { useEffect, useState, useCallback, Fragment } from 'react'
import { getCategories, createStoreCategory, updateStoreCategory, deleteStoreCategory, countProductsByCategory, syncStoreCategoryName } from '@/api/categories'
import type { StoreCategory } from '@/types'
import { NavIcon } from '@/components/icons'

/**
 * 商品分类管理（平台全局）——支持两级：场景(一级) → 子类(二级)
 *
 * 层级由 store_categories.parent_id 表达（见迁移 20260927_add_category_parent.sql）：
 *   - parent_id 为空 = 一级分类（首页金刚区「按场景选食养」的场景）
 *   - parent_id 指向某个一级 = 二级分类（用户端分类落地页顶部的二级 Tab）
 * 用户端小程序与本后台共用同一张 store_categories，因此这里改完即时两端同步。
 */
export default function Categories() {
  const [list, setList] = useState<StoreCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  // 新增表单：newParent='' 表示建一级，否则建该一级下的二级
  const [newName, setNewName] = useState('')
  const [newSort, setNewSort] = useState(99)
  const [newParent, setNewParent] = useState('')
  // 内联快捷新增子类（某一级行展开的输入框）
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  // 图标编辑器：每行可改 icon（emoji 文本），预设快捷选择 + 自定义输入
  const [editingIconId, setEditingIconId] = useState<string | null>(null)
  const [iconInput, setIconInput] = useState('')
  // 子类展开态：默认全部展开
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const PRESET_EMOJIS = ['🍼', '🥕', '👵', '🌙', '🥣', '💪', '🛡️', '⚡', '🌿', '🍎', '🥗', '🍵', '💊', '🌾', '☕', '🍯']

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getCategories({ includeGlobal: true })
    setList(data.filter(c => c.scope === 'global'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const parents = list.filter(c => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const childrenOf = (pid: string) => list.filter(c => c.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order)

  const handleAdd = async () => {
    if (!newName.trim()) { alert('请输入分类名称'); return }
    setBusy(true)
    const created = await createStoreCategory({
      storeId: null, name: newName.trim(), sortOrder: newSort, scope: 'global',
      parentId: newParent || null,
    })
    setBusy(false)
    if (!created) { alert('创建失败：若新增二级分类，请先在本机执行迁移 20260927_add_category_parent.sql'); return }
    if (newParent) setCollapsed(s => ({ ...s, [newParent]: false }))
    setNewName(''); setNewSort(99)
    load()
  }

  const handleAddChild = async (parentId: string) => {
    const name = childName.trim()
    if (!name) { setAddingChildFor(null); return }
    setBusy(true)
    const created = await createStoreCategory({ storeId: null, name, sortOrder: 99, scope: 'global', parentId })
    setBusy(false)
    if (!created) { alert('新增子分类失败：请先在本机执行迁移 20260927_add_category_parent.sql'); return }
    setChildName(''); setAddingChildFor(null)
    setCollapsed(s => ({ ...s, [parentId]: false }))
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
    const isChild = !!c.parent_id
    const msg = isChild
      ? `确认删除二级分类「${c.name}」？该分类下商品将自动归为「未分类」。`
      : `确认删除一级分类「${c.name}」？其下所有二级分类将一并删除，相关商品自动归为「未分类」。`
    if (!confirm(msg)) return
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

  // 同级内上下移动（一级在一级间移动，二级在自己父级下移动）
  const handleMove = async (c: StoreCategory, dir: -1 | 1) => {
    const siblings = c.parent_id ? childrenOf(c.parent_id) : parents
    const idx = siblings.findIndex(x => x.id === c.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const other = siblings[swapIdx]
    setBusy(true)
    await updateStoreCategory(c.id, { sort_order: other.sort_order })
    await updateStoreCategory(other.id, { sort_order: c.sort_order })
    setBusy(false)
    load()
  }

  const startEditIcon = (c: StoreCategory) => {
    setEditingIconId(c.id)
    setIconInput(c.icon || '')
  }
  const handleSaveIcon = async (c: StoreCategory) => {
    setBusy(true)
    const ok = await updateStoreCategory(c.id, { icon: iconInput.trim() || null })
    setBusy(false)
    if (!ok) { alert('图标保存失败，请重试'); return }
    setEditingIconId(null)
    setIconInput('')
    load()
  }

  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    btn: (bg: string, fg = 'white') => ({ padding: '6px 14px', background: bg, color: fg, border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }),
    input: { padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' } as React.CSSProperties,
  }

  const renderIconCell = (c: StoreCategory) => (
    <td style={S.td}>
      {editingIconId === c.id ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            value={iconInput}
            maxLength={4}
            placeholder="粘贴 emoji"
            onChange={e => setIconInput(e.target.value)}
            style={{ ...S.input, width: 110, fontSize: 16 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 180 }}>
            {PRESET_EMOJIS.map(e => (
              <button key={e} onClick={() => setIconInput(e)} style={{ fontSize: 18, lineHeight: 1, padding: '2px 4px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>{e}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleSaveIcon(c)} style={S.btn('var(--success-strong)')}>保存</button>
            <button onClick={() => { setEditingIconId(null); setIconInput('') }} style={S.btn('var(--border-soft)')}>取消</button>
          </div>
        </div>
      ) : (
        <button onClick={() => startEditIcon(c)} style={{ background: 'transparent', border: '1px dashed var(--border-soft)', borderRadius: 8, padding: '4px 8px', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>
          {c.icon || '🌿'}
        </button>
      )}
    </td>
  )

  const renderNameCell = (c: StoreCategory, level: 0 | 1) => (
    <td style={{ ...S.td, color: 'var(--text)' }}>
      {editingId === c.id ? (
        <input
          autoFocus
          value={editingName}
          onChange={e => setEditingName(e.target.value)}
          onBlur={() => handleSaveRename(c)}
          style={{ ...S.input, border: '1px solid var(--primary)' }}
        />
      ) : (
        <span style={level === 1 ? { paddingLeft: 22, color: 'var(--text-dim)' } : undefined}>
          {level === 1 && <span style={{ color: 'var(--border-soft)', marginRight: 6 }}>└</span>}
          {c.name}
        </span>
      )}
    </td>
  )

  const renderRow = (c: StoreCategory, level: 0 | 1) => {
    const kids = level === 0 ? childrenOf(c.id) : []
    const isCollapsed = !!collapsed[c.id]
    return (
      <tr key={c.id} style={{ background: level === 1 ? 'var(--bg)' : undefined }}>
        <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: 12 }}>
          {level === 0 && kids.length > 0 && (
            <button
              onClick={() => setCollapsed(s => ({ ...s, [c.id]: !s[c.id] }))}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', marginRight: 4, fontSize: 12 }}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          )}
          {c.sort_order}
        </td>
        {renderNameCell(c, level)}
        {renderIconCell(c)}
        <td style={S.td}>
          {level === 0 ? (
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--info-soft)', color: 'var(--info-strong)' }}><NavIcon name="globe" size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />全局</span>
          ) : (
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--bg)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>二级</span>
          )}
        </td>
        <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{new Date((c as any).created_at ?? Date.now()).toLocaleString('zh-CN')}</td>
        <td style={S.td}>
          {level === 0 && (
            <>
              <button
                onClick={() => { setAddingChildFor(addingChildFor === c.id ? null : c.id); setChildName('') }}
                style={{ ...S.btn('var(--primary)'), marginRight: 6 }}
              >
                {addingChildFor === c.id ? '取消' : '+ 子分类'}
              </button>
              {kids.length > 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12, marginRight: 6 }}>{kids.length} 子类</span>}
            </>
          )}
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
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>商品分类管理（平台全局）</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          两级结构：<b style={{ color: 'var(--text)' }}>一级=场景</b>（首页金刚区「按场景选食养」）→
          <b style={{ color: 'var(--text)' }}> 二级=子类</b>（用户端分类页顶部二级 Tab）。平台维护的全局分类对所有自营门店生效。
        </p>
      </div>

      {/* 新增 */}
      <div style={S.card}>
        <p style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>新增分类</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="分类名称"
            style={{ ...S.input, flex: 1, minWidth: 160 }}
          />
          <select
            value={newParent}
            onChange={e => setNewParent(e.target.value)}
            style={{ ...S.input, minWidth: 170 }}
          >
            <option value="">作为一级分类（场景）</option>
            {parents.map(p => (
              <option key={p.id} value={p.id}>归入「{p.name}」为二级</option>
            ))}
          </select>
          <input
            type="number"
            value={newSort}
            onChange={e => setNewSort(Number(e.target.value))}
            placeholder="排序"
            style={{ ...S.input, width: 80 }}
          />
          <button onClick={handleAdd} disabled={busy} style={S.btn('var(--primary)')}>新建</button>
        </div>
      </div>

      {/* 列表（两级树） */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>排序</th>
              <th style={S.th}>分类名称</th>
              <th style={S.th}>图标</th>
              <th style={S.th}>层级</th>
              <th style={S.th}>创建时间</th>
              <th style={S.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</td></tr>
            ) : parents.length === 0 ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>暂无全局分类</td></tr>
            ) : parents.map(p => {
              const kids = childrenOf(p.id)
              const isCollapsed = !!collapsed[p.id]
              return (
                <Fragment key={p.id}>
                  {renderRow(p, 0)}
                  {!isCollapsed && kids.map(k => renderRow(k, 1))}
                  {addingChildFor === p.id && (
                    <tr style={{ background: 'var(--bg)' }}>
                      <td style={S.td} />
                      <td style={{ ...S.td, paddingLeft: 38 }} colSpan={2}>
                        <input
                          autoFocus
                          value={childName}
                          onChange={e => setChildName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddChild(p.id) }}
                          placeholder={`「${p.name}」下的二级分类名称`}
                          style={{ ...S.input, width: 240, border: '1px solid var(--primary)' }}
                        />
                      </td>
                      <td style={S.td} colSpan={3}>
                        <button onClick={() => handleAddChild(p.id)} style={{ ...S.btn('var(--success-strong)'), marginRight: 6 }}>保存</button>
                        <button onClick={() => { setAddingChildFor(null); setChildName('') }} style={S.btn('var(--border-soft)')}>取消</button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
