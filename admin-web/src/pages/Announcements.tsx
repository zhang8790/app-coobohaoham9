import { useEffect, useState, useCallback } from 'react'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/api/admin'
import type { Announcement } from '@/types'
import { supabase } from '@/lib/supabase'

export default function Announcements() {
  const [list, setList] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newSort, setNewSort] = useState(99)
  const [pushToAll, setPushToAll] = useState(false)
  const [pushing, setPushing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getAnnouncements()
    setList(data); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newContent.trim()) { alert('请输入公告内容'); return }
    const content = newContent.trim()
    const ok = await createAnnouncement(content, newSort)
    if (ok && pushToAll) {
      setPushing(true)
      try {
        const r = await supabase.functions.invoke('send-notification', {
          body: {
            broadcast: true,
            type: 'announcement',
            title: '系统公告',
            body: content,
            payload: {
              summary: content.slice(0, 20),
              published_at: new Date().toLocaleString('zh-CN'),
              page: 'pages/messages/index',
            },
          }
        })
        const data = r.data as { success?: boolean; results?: { total: number; sent: number; failed: number; skipped: number } }
        alert(`公告已发布。推送结果：总计 ${data?.results?.total ?? 0} 人，成功 ${data?.results?.sent ?? 0}，失败 ${data?.results?.failed ?? 0}，跳过（无 openid）${data?.results?.skipped ?? 0}`)
      } catch (e) {
        alert('公告已发布，但推送失败：' + (e as Error).message)
      } finally {
        setPushing(false)
      }
    }
    setNewContent(''); setNewSort(99); setPushToAll(false)
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
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    btn: (bg: string, fg = 'white') => ({ padding: '6px 14px', background: bg, color: fg, border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>公告管理</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>发布平台公告，按 sort_order 升序展示</p>
      </div>

      {/* 新增 */}
      <div style={S.card}>
        <p style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>新增公告</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="公告内容"
            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }}
          />
          <input
            type="number"
            value={newSort}
            onChange={e => setNewSort(Number(e.target.value))}
            placeholder="排序"
            style={{ width: 80, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={pushToAll} onChange={e => setPushToAll(e.target.checked)} style={{ cursor: 'pointer' }} />
            同时推送给所有用户
          </label>
          <button onClick={handleAdd} disabled={pushing} style={S.btn('var(--primary)')}>
            {pushing ? '推送中…' : '发布'}
          </button>
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
              <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text-dim)' }}>暂无公告</td></tr>
            ) : list.map(a => (
              <tr key={a.id}>
                <td style={S.td}>{a.sort_order}</td>
                <td style={{ ...S.td, color: 'var(--text)' }}>{a.content}</td>
                <td style={S.td}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: a.is_active ? 'var(--success-soft)' : 'var(--danger-soft)', color: a.is_active ? 'var(--success-strong)' : 'var(--danger)' }}>
                    {a.is_active ? '启用' : '停用'}
                  </span>
                </td>
                <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{new Date(a.created_at).toLocaleString('zh-CN')}</td>
                <td style={S.td}>
                  <button onClick={() => handleToggle(a)} style={{ ...S.btn(a.is_active ? 'var(--border-soft)' : 'var(--success-strong)'), marginRight: 8 }}>
                    {a.is_active ? '停用' : '启用'}
                  </button>
                  <button onClick={() => handleDelete(a)} style={S.btn('var(--danger)')}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
