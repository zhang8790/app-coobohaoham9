import { useEffect, useState, useCallback } from 'react'
import { getUsers, updateUserRole } from '@/api/admin'
import type { Profile } from '@/types'
import { maskPhone } from '@/utils/mask'

const PAGE_SIZE = 20
const RANK_COLORS: Record<string, string> = {
  '江湖散修': '#78350F', '外门弟子': '#B45309', '内门弟子': '#92400E',
  '核心弟子': '#C2410C', '长老': '#9333EA', '掌门': '#DC2626',
}

export default function Users() {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getUsers(page, PAGE_SIZE)
    setList(data); setTotal(t); setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (id: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (!confirm(`确认将该用户角色改为「${newRole === 'admin' ? '管理员' : '普通用户'}」？`)) return
    setProcessing(id)
    await updateUserRole(id, newRole)
    setList(prev => prev.map(u => u.id === id ? { ...u, role: newRole as 'user' | 'admin' } : u))
    setProcessing(null)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const S = {
    card: { background: '#0F172A', border: '1px solid #1F2937', borderRadius: 12 } as React.CSSProperties,
    th: { color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left' as const, background: '#0B0F19' },
    td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #1F2937' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ color: '#E5E7EB', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>用户管理</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>平台用户管理 · 共 {total} 名侠客</p>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>暂无用户数据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['昵称', '手机号', '段位', '积分', '金豆', '角色', '注册时间', '操作'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(u => {
                const rankColor = RANK_COLORS[u.member_rank] || '#78350F'
                return (
                  <tr key={u.id}>
                    <td style={{ ...S.td, color: '#E5E7EB', fontWeight: 600 }}>{u.nickname || '侠客'}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{maskPhone(u.phone)}</td>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: `${rankColor}33`, color: rankColor }}>
                        {u.member_rank || '江湖散修'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>{u.points}</td>
                    <td style={{ ...S.td, color: '#9CA3AF' }}>金豆 {Number(u.balance).toFixed(2)}</td>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: u.role === 'admin' ? '#C2410C22' : '#1F2937', color: u.role === 'admin' ? '#C2410C' : '#9CA3AF' }}>
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: '#6B7280', fontSize: 13 }}>{new Date(u.created_at).toLocaleDateString('zh-CN')}</td>
                    <td style={S.td}>
                      <button disabled={processing === u.id} onClick={() => handleRoleChange(u.id, u.role)}
                        style={{ padding: '5px 12px', background: 'transparent',
                          border: `1px solid ${u.role === 'admin' ? '#EF4444' : '#C2410C'}`,
                          borderRadius: 6, color: u.role === 'admin' ? '#EF4444' : '#C2410C', cursor: 'pointer', fontSize: 12 }}>
                        {u.role === 'admin' ? '降为用户' : '设为管理员'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid #1F2937' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: page === i ? '#C2410C' : '#1F2937', color: page === i ? '#fff' : '#9CA3AF' }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
