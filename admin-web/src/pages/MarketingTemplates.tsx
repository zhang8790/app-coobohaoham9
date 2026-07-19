import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const card = { background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 16 }
const primaryBtn = {
  background: '#C2410C', color: '#fff', border: 'none', borderRadius: 8,
  padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const ghostBtn = {
  background: 'transparent', border: '1px solid #374151', color: '#9CA3AF',
  borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
}
const inputStyle = {
  width: '100%', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8,
  color: '#E5E7EB', padding: '8px 10px', fontSize: 13, outline: 'none' as const,
}

interface TplRow {
  tpl_key: string
  tpl_type: string
  title: string
  content: string
  is_active: boolean
}

const PLACEHOLDER_HINT = '{name} 商品名　{natureText} 性味描述　{tagText} 食疗标签　{tagSentence} 食疗侧重句　{remindText} 养生建议'

export default function MarketingTemplates() {
  const [list, setList] = useState<TplRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<TplRow | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('food_therapy_templates')
      .select('*')
      .order('sort_order', { ascending: true })
    setLoading(false)
    if (error) { alert('加载失败：' + error.message); return }
    setList((data as TplRow[]) || [])
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (r: TplRow) => { setEditing(r); setDraft(r.content); }
  const closeEdit = () => { setEditing(null); setDraft('') }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    const { error } = await supabase
      .from('food_therapy_templates')
      .update({ content: draft })
      .eq('tpl_key', editing.tpl_key)
    setSaving(false)
    if (error) { alert('保存失败：' + error.message); return }
    closeEdit()
    load()
  }

  const toggleActive = async (r: TplRow) => {
    const { error } = await supabase
      .from('food_therapy_templates')
      .update({ is_active: !r.is_active })
      .eq('tpl_key', r.tpl_key)
    if (error) { alert('操作失败：' + error.message); return }
    load()
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: '#E5E7EB', fontSize: 20, fontWeight: 700, margin: 0 }}>🗣 导购话术库 / 营销模板</h2>
        <p style={{ color: '#6B7280', fontSize: 13, margin: '6px 0 0' }}>
          运营可在此免发版修改导购话术，小程序详情页与收银台实时读取生效（迁移 00102 须本机执行）。
        </p>
      </div>

      {/* 占位符说明 */}
      <div style={{ ...card, marginBottom: 16, background: '#0F1623' }}>
        <p style={{ color: '#FDBA74', fontSize: 12, margin: 0, fontWeight: 600 }}>可用占位符</p>
        <p style={{ color: '#9CA3AF', fontSize: 12, margin: '6px 0 0', fontFamily: 'monospace' }}>{PLACEHOLDER_HINT}</p>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(r => (
            <div key={r.tpl_key} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#E5E7EB', fontSize: 15, fontWeight: 600 }}>{r.title}</span>
                    <span style={{ background: 'rgba(148,163,184,0.15)', color: '#94A3B8', fontSize: 11, padding: '1px 8px', borderRadius: 4, fontFamily: 'monospace' }}>{r.tpl_key}</span>
                    {!r.is_active && <span style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', fontSize: 11, padding: '1px 8px', borderRadius: 4 }}>已停用</span>}
                  </div>
                  <p style={{ color: '#9CA3AF', fontSize: 12, margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <button onClick={() => toggleActive(r)} style={ghostBtn}>{r.is_active ? '停用' : '启用'}</button>
                  <button onClick={() => openEdit(r)} style={ghostBtn}>编辑</button>
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ ...card, color: '#6B7280', textAlign: 'center' }}>暂无模板，请先执行迁移 00102。</div>}
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ ...card, width: 560, maxHeight: '90vh', overflowY: 'auto', background: '#0F1623' }}>
            <h3 style={{ color: '#E5E7EB', margin: '0 0 6px', fontSize: 16 }}>编辑 · {editing.title}</h3>
            <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 14px' }}>支持占位符：{PLACEHOLDER_HINT}</p>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={5}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={closeEdit} style={ghostBtn}>取消</button>
              <button onClick={handleSave} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
