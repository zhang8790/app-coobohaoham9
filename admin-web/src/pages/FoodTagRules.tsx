// 来电有喜 · 管理后台「食疗人群匹配标签规则 · 权重微调面板」
// 对应 food_tag_rules：运营可改每个用户标签的优先/规避配料与权重，无需改代码。
import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

type TagRow = {
  tag_key: string
  label: string
  group_name?: string
  prefer_ingredients: string[]
  avoid_ingredients: string[]
  weight_prefer: number
  weight_avoid: number
  status: string
}

const th: CSSProperties = { textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }
const td: CSSProperties = { padding: '10px 12px', color: 'var(--text)', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const inputStyle: CSSProperties = { width: '100%', padding: '7px 9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const btnSm: CSSProperties = { padding: '4px 10px', background: 'var(--primary)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }

export default function FoodTagRules() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [rows, setRows] = useState<TagRow[]>([])
  const [editing, setEditing] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('food_tag_rules').select('*').order('tag_key')
    setRows((data as TagRow[]) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const blank = () => ({ tag_key: '', label: '', group_name: '', prefer_ingredients: [], avoid_ingredients: [], weight_prefer: 15, weight_avoid: 25, status: 'active' })
  const setField = (k: string, v: any) => setEditing((e: any) => ({ ...e, [k]: v }))
  const arrField = (k: string, v: string) => setField(k, v.split(/[,，]/).map((s) => s.trim()).filter(Boolean))

  const save = async () => {
    if (!editing) return
    try {
      if (editing.tag_key) {
        const { tag_key, ...rest } = editing
        const { error } = await supabase.from('food_tag_rules').update(rest).eq('tag_key', tag_key)
        if (error) throw error
      } else {
        const { error } = await supabase.from('food_tag_rules').insert(editing)
        if (error) throw error
      }
      setMsg('已保存')
      setEditing(null)
      load()
    } catch (e: any) { setMsg('保存失败：' + (e?.message || e)) }
  }
  const remove = async (key: string) => {
    const { error } = await supabase.from('food_tag_rules').delete().eq('tag_key', key)
    if (error) { setMsg('删除失败：' + error.message); return }
    setMsg('已删除'); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>食疗匹配标签 · 权重微调面板</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
            每个用户标签绑定「优先/规避配料 + 权重」，0-100 适配分 = 基线50 + 优先命中(+weight_prefer) − 规避命中(按风险档)。改这里即可调算法，无需动代码。
          </p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>刷新</button>
      </div>
      {msg && <div style={{ padding: '10px 14px', background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <button onClick={() => setEditing(blank())} style={{ marginBottom: 12, padding: '8px 16px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>+ 新增标签</button>

      {editing && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>{editing.tag_key ? '编辑' : '新增'} · 标签规则</p>
          <Field label="标签 key（唯一）"><input style={inputStyle} value={editing.tag_key} disabled={!!editing.tag_key} onChange={(e) => setField('tag_key', e.target.value)} /></Field>
          <Field label="标签名 label"><input style={inputStyle} value={editing.label} onChange={(e) => setField('label', e.target.value)} /></Field>
          <Field label="分组 group_name"><input style={inputStyle} value={editing.group_name || ''} onChange={(e) => setField('group_name', e.target.value)} /></Field>
          <Field label="优先配料 prefer_ingredients（逗号分隔）"><textarea style={{ ...inputStyle, minHeight: 48 }} value={(editing.prefer_ingredients || []).join('，')} onChange={(e) => arrField('prefer_ingredients', e.target.value)} /></Field>
          <Field label="规避配料 avoid_ingredients（逗号分隔）"><textarea style={{ ...inputStyle, minHeight: 48 }} value={(editing.avoid_ingredients || []).join('，')} onChange={(e) => arrField('avoid_ingredients', e.target.value)} /></Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="优先权重 weight_prefer"><input type="number" style={inputStyle} value={editing.weight_prefer} onChange={(e) => setField('weight_prefer', Number(e.target.value))} /></Field>
            <Field label="规避权重 weight_avoid"><input type="number" style={inputStyle} value={editing.weight_avoid} onChange={(e) => setField('weight_avoid', Number(e.target.value))} /></Field>
            <Field label="状态 status">
              <select style={inputStyle} value={editing.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={save} style={{ padding: '8px 18px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>保存</button>
            <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--bg)' }}>{['key', '标签', '分组', '优先', '规避', '权重', '状态', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>加载中…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>暂无数据</td></tr>
              : rows.map((r) => (
                <tr key={r.tag_key}>
                  <td style={td}>{r.tag_key}</td>
                  <td style={td}>{r.label}</td>
                  <td style={td}>{r.group_name || '-'}</td>
                  <td style={td}>{(r.prefer_ingredients || []).join('、')}</td>
                  <td style={td}>{(r.avoid_ingredients || []).join('、')}</td>
                  <td style={td}>+{r.weight_prefer} / -{r.weight_avoid}</td>
                  <td style={td}>{r.status}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditing(r)} style={btnSm}>编辑</button>
                      <button onClick={() => remove(r.tag_key)} style={{ ...btnSm, background: '#DC2626' }}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
