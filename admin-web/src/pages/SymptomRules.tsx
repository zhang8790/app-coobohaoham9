import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  HEALTH_TAGS, NATURE_SCALE, SYMPTOM_CATEGORIES,
  type SymptomRule, type SymptomCategory,
  parseList, joinList, categoryLabel,
} from '@/utils/food-therapy-tags'

const card = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const primaryBtn = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
  padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const ghostBtn = {
  background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)',
  borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
}
const inputStyle = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8,
  color: 'var(--text)', padding: '8px 10px', fontSize: 13, outline: 'none' as const,
}

interface FormState {
  id: string
  category: SymptomCategory
  label: string
  keywordsText: string
  priorityHealthTags: string[]
  banNatures: string[]
  banHealthTags: string[]
  remindText: string
  isActive: boolean
  sortOrder: number
}

const emptyForm = (): FormState => ({
  id: '', category: 'throat', label: '', keywordsText: '',
  priorityHealthTags: [], banNatures: [], banHealthTags: [],
  remindText: '', isActive: true, sortOrder: 0,
})

function rowToForm(r: SymptomRule): FormState {
  return {
    id: r.id, category: r.category, label: r.label,
    keywordsText: joinList(r.keywords),
    priorityHealthTags: r.priority_health_tags,
    banNatures: r.ban_natures,
    banHealthTags: r.ban_health_tags,
    remindText: r.remind_text,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  }
}

export default function SymptomRules() {
  const [list, setList] = useState<SymptomRule[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SymptomRule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('symptom_rules')
      .select('*')
      .order('sort_order', { ascending: true })
    setLoading(false)
    if (error) { alert('加载失败：' + error.message); return }
    setList((data as SymptomRule[]) || [])
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true) }
  const openEdit = (r: SymptomRule) => { setEditing(r); setForm(rowToForm(r)); setShowModal(true) }

  const toggleTag = (key: keyof FormState, val: string) => {
    setForm(f => {
      const arr = (f[key] as string[]) || []
      const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
      return { ...f, [key]: next } as FormState
    })
  }

  const handleSave = async () => {
    if (!form.id.trim() || !form.label.trim()) { alert('请填写规则 ID 与名称'); return }
    setSaving(true)
    const payload = {
      id: form.id.trim(),
      category: form.category,
      label: form.label.trim(),
      keywords: parseList(form.keywordsText),
      priority_health_tags: form.priorityHealthTags,
      ban_natures: form.banNatures,
      ban_health_tags: form.banHealthTags,
      remind_text: form.remindText.trim(),
      is_active: form.isActive,
      sort_order: Number(form.sortOrder) || 0,
    }
    const { error } = await supabase.from('symptom_rules').upsert(payload)
    setSaving(false)
    if (error) { alert('保存失败：' + error.message); return }
    setShowModal(false)
    load()
  }

  const handleDelete = async (r: SymptomRule) => {
    if (!confirm(`确认删除规则「${r.label}」？`)) return
    const { error } = await supabase.from('symptom_rules').delete().eq('id', r.id)
    if (error) { alert('删除失败：' + error.message); return }
    load()
  }

  const toggleActive = async (r: SymptomRule) => {
    const { error } = await supabase.from('symptom_rules').update({ is_active: !r.is_active }).eq('id', r.id)
    if (error) { alert('操作失败：' + error.message); return }
    load()
  }

  const ChipGroup = ({ options, selected, onToggle }: { options: readonly string[]; selected: string[]; onToggle: (v: string) => void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const on = selected.includes(opt)
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            style={{
              padding: '4px 10px', borderRadius: 14, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--primary)' : 'var(--border-soft)'}`,
              background: on ? 'rgba(194,65,12,0.18)' : 'transparent',
              color: on ? 'var(--primary-hover)' : 'var(--text-muted)',
            }}>
            {opt}
          </button>
        )
      })}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}> 食疗症状规则库</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '6px 0 0' }}>
            运营可在此免发版增删改人群/症状规则；小程序端实时读取生效（迁移 00101 须本机执行）。
          </p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ 新增规则</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(r => (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>{r.label}</span>
                    <span style={{ background: 'rgba(99,102,241,0.2)', color: 'var(--accent-text)', fontSize: 11, padding: '1px 8px', borderRadius: 4 }}>{categoryLabel(r.category)}</span>
                    <span style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)', fontSize: 11, padding: '1px 8px', borderRadius: 4, fontFamily: 'monospace' }}>{r.id}</span>
                    {!r.is_active && <span style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger-text)', fontSize: 11, padding: '1px 8px', borderRadius: 4 }}>已停用</span>}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }}>触发词：{joinList(r.keywords) || '—'}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 0' }}>
                    宜：{joinList(r.priority_health_tags) || '—'}　忌性味：{joinList(r.ban_natures) || '—'}　忌标签：{joinList(r.ban_health_tags) || '—'}
                  </p>
                  <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '4px 0 0', fontStyle: 'italic' }}>建议：{r.remind_text || '—'}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <button onClick={() => toggleActive(r)} style={ghostBtn}>{r.is_active ? '停用' : '启用'}</button>
                  <button onClick={() => openEdit(r)} style={ghostBtn}>编辑</button>
                  <button onClick={() => handleDelete(r)} style={{ ...ghostBtn, borderColor: '#7F1D1D', color: 'var(--danger-text)' }}>删除</button>
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ ...card, color: 'var(--text-dim)', textAlign: 'center' }}>暂无规则，点击右上角新增。</div>}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ ...card, width: 560, maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)' }}>
            <h3 style={{ color: 'var(--text)', margin: '0 0 16px', fontSize: 16 }}>{editing ? '编辑规则' : '新增规则'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="规则 ID（英文/拼音，唯一）">
                <input disabled={!!editing} value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="如 throat-sore" style={inputStyle} />
              </Field>
              <Field label="规则名称">
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="如 咽喉干痒/不适" style={inputStyle} />
              </Field>
              <Field label="类别">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as SymptomCategory }))} style={inputStyle}>
                  {SYMPTOM_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="触发关键词（逗号分隔）">
                <input value={form.keywordsText} onChange={e => setForm(f => ({ ...f, keywordsText: e.target.value }))} placeholder="咽喉,嗓子,喉咙" style={inputStyle} />
              </Field>
              <Field label="宜·食疗标签">
                <ChipGroup options={HEALTH_TAGS} selected={form.priorityHealthTags} onToggle={v => toggleTag('priorityHealthTags', v)} />
              </Field>
              <Field label="忌·性味">
                <ChipGroup options={NATURE_SCALE} selected={form.banNatures} onToggle={v => toggleTag('banNatures', v)} />
              </Field>
              <Field label="忌·食疗标签">
                <ChipGroup options={HEALTH_TAGS} selected={form.banHealthTags} onToggle={v => toggleTag('banHealthTags', v)} />
              </Field>
              <Field label="养生建议文案">
                <textarea value={form.remindText} onChange={e => setForm(f => ({ ...f, remindText: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="少辛辣过烫，忌烟酒刺激" />
              </Field>
              <Field label="排序（数字越小越靠前）">
                <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                启用（停用后小程序端不加载该规则）
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={ghostBtn}>取消</button>
              <button onClick={handleSave} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
