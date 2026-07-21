import { useEffect, useState, useCallback } from 'react'
import { getArticles, toggleArticlePublish, deleteArticle } from '@/api/admin'
import type { Article } from '@/types'

const PAGE_SIZE = 10
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'hidden', label: '已隐藏' },
] as const

export default function Ugc() {
  const [filter, setFilter] = useState<'all' | 'published' | 'hidden'>('all')
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getArticles(filter, page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [filter, page])

  useEffect(() => { setPage(0) }, [filter])
  useEffect(() => { load() }, [load])

  const handleToggle = async (a: Article) => {
    setProcessing(a.id)
    await toggleArticlePublish(a.id, !a.is_published)
    setList(prev => prev.map(x => x.id === a.id ? { ...x, is_published: !a.is_published } : x))
    setProcessing(null)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确认删除文章「${title}」？此操作不可恢复。`)) return
    setProcessing(id)
    await deleteArticle(id)
    setProcessing(null); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties,
    th: { color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: 'var(--bg)' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    badge: (pub: boolean) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: pub ? 'var(--success-soft)' : 'var(--text-dim)22', color: pub ? 'var(--success-strong)' : 'var(--text-muted)' }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>UGC管理</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>UGC 内容管理 · 共 {total} 篇</p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: filter === f.key ? 'var(--primary)' : 'var(--card)', color: filter === f.key ? '#fff' : 'var(--text-muted)' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>暂无内容</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['标题', '作者', '状态', '发布时间', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(a => {
                const author = (a.profiles as unknown as { nickname?: string } | null)?.nickname || '匿名'
                return (
                  <tr key={a.id}>
                    <td style={{ ...S.td, color: 'var(--text)', fontWeight: 500, maxWidth: 280 }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {a.title}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-muted)' }}>{author}</td>
                    <td style={S.td}><span style={S.badge(a.is_published)}>{a.is_published ? '已发布' : '已隐藏'}</span></td>
                    <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: 13 }}>{new Date(a.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={processing === a.id} onClick={() => handleToggle(a)}
                          style={{ padding: '5px 12px', background: a.is_published ? 'var(--warning)22' : 'var(--success-soft)',
                            border: `1px solid ${a.is_published ? 'var(--warning)' : 'var(--success-strong)'}`,
                            borderRadius: 6, color: a.is_published ? 'var(--warning)' : 'var(--success-strong)', cursor: 'pointer', fontSize: 12 }}>
                          {a.is_published ? '下架' : '上架'}
                        </button>
                        <button disabled={processing === a.id} onClick={() => handleDelete(a.id, a.title)}
                          style={{ padding: '5px 12px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? 'var(--primary)' : 'var(--border)', color: page === i ? '#fff' : 'var(--text-muted)' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
