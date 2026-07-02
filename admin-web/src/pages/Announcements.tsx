import { useEffect, useState, useCallback } from 'react'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/api/admin'
import type { Announcement } from '@/types'

export default function Announcements() {
  const [list, setList] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newSort, setNewSort] = useState(99)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getAnnouncements()
    setList(data); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newContent.trim()) { alert('请输入公告内容'); return }
    await createAnnouncement(newContent.trim(), newSort)
    setNewContent(''); setNewSort(99)
    load()
  }

  const handleToggle = async (a: Announcement) => {
    await updateAnnouncement(a.id, { is_active: !a.is_active })
    load()
  }

  const handleDelete = async (a: Announcement) => {
    if (!confirm(`确认删除公告「${a.content}」？`)) return
    await deleteAnnouncement(a.id)
    load()
  }

  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12, padding: '16px 20px' } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
    btn: (bg: string, fg = 'white') => ({ padding: '6px 14px', background: bg, color: fg, border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>公告管理</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>发布平台公告，按 sort_order 升序展示</p>
      </div>

      {/* 新增 */}
      <div style={S.card}>
        <p style={{ color: '#E5E7EB', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>新增公告</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="公告内容"
            style={{ flex: 1, padding: '8px 12px', background: '#0B0F19', border: '1px solid #1F2937', borderRadius: 6, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
          />
          <input
            type="number"
            value={newSort}
            onChange={e => setNewSort(Number(e.target.value))}
            placeholder="排序"
            style={{ width: 80, padding: '8px 12px', background: '#0B0F19', border: '1px solid #1F2937', borderRadius: 6, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
          />
          <button onClick={handleAdd} style={S.btn('#C2410C')}>发布</button>
        </div>
      </div>

      {/* 列表 */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>排序</th>
              <th style={S.th}>内容</th>
              <th style={S.th}>状态</th>
              <th style={S.th}>创建时间</th>
              <th style={S.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#6B7280' }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#6B7280' }}>暂无公告</td></tr>
            ) : list.map(a => (
              <tr key={a.id}>
                <td style={S.td}>{a.sort_order}</td>
                <td style={{ ...S.td, color: '#E5E7EB' }}>{a.content}</td>
                <td style={S.td}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: a.is_active ? '#10B98122' : '#EF444422', color: a.is_active ? '#10B981' : '#EF4444' }}>
                    {a.is_active ? '启用' : '停用'}
                  </span>
                </td>
                <td style={{ ...S.td, color: '#9CA3AF', fontSize: 12 }}>{new Date(a.created_at).toLocaleString('zh-CN')}</td>
                <td style={S.td}>
                  <button onClick={() => handleToggle(a)} style={{ ...S.btn(a.is_active ? '#374151' : '#10B981'), marginRight: 8 }}>
                    {a.is_active ? '停用' : '启用'}
                  </button>
                  <button onClick={() => handleDelete(a)} style={S.btn('#EF4444')}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
