// 来电有喜 · 管理后台「食疗食材字典维护」
// 数据来源：food_ingredients（食疗引擎统一食材库，驱动商家端编辑页 + 商品详情页引擎）
// 后台可维护、无需改代码，新增食材后小程序端引擎自动生效。
import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

const NATURE_OPTS = ['大寒', '寒凉', '凉', '微凉', '平性', '平', '微温', '温', '温热', '大热', '热']
const ALLERGEN_OPTS = ['蛋类', '乳制品', '海鲜', '坚果', '大豆', '芝麻', '花生', '小麦', '芒果', '菠萝']
const CHRONIC_OPTS = ['高血压友好', '减脂友好', '儿童营养', '控糖友好', '肠胃友好', '补铁', '补钙', '低嘌呤']

interface IngredientRow {
  id?: string
  name: string
  nature: string
  base_effect: string | null
  fit_scenes: string | null
  caution_crowds: string | null
  allergens: string[]
  chronic_tags: string[]
  neutralize: string | null
  sort_order: number
  is_active: boolean
}

const th: CSSProperties = { textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }
const td: CSSProperties = { padding: '10px 12px', color: 'var(--text)', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const inputStyle: CSSProperties = { width: '100%', padding: '7px 9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const btnSm: CSSProperties = { padding: '4px 10px', background: 'var(--primary)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }

export default function FoodIngredients() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [editing, setEditing] = useState<IngredientRow | null>(null)
  const [showInactive, setShowInactive] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('food_ingredients').select('*').order('sort_order')
    if (error) { setMsg('加载失败：' + error.message); setLoading(false); return }
    setRows((data as IngredientRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const blank = (): IngredientRow => ({
    name: '', nature: '平性', base_effect: '', fit_scenes: '', caution_crowds: '',
    allergens: [], chronic_tags: [], neutralize: '', sort_order: 99, is_active: true,
  })

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim()) { setMsg('请填写食材名称'); return }
    try {
      const payload = {
        name: editing.name.trim(),
        nature: editing.nature,
        base_effect: editing.base_effect?.trim() || null,
        fit_scenes: editing.fit_scenes?.trim() || null,
        caution_crowds: editing.caution_crowds?.trim() || null,
        allergens: editing.allergens,
        chronic_tags: editing.chronic_tags,
        neutralize: editing.neutralize?.trim() || null,
        sort_order: editing.sort_order,
        is_active: editing.is_active,
      }
      if (editing.id) {
        const { error } = await supabase.from('food_ingredients').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('food_ingredients').insert(payload)
        if (error) throw error
      }
      setMsg('已保存')
      setEditing(null)
      load()
    } catch (e: any) {
      setMsg('保存失败：' + (e?.message || e))
    }
  }

  const remove = async (id: string) => {
    if (!confirm('确认删除该食材？商品中已引用的食材名称不受影响（商品存的是名称快照）。')) return
    const { error } = await supabase.from('food_ingredients').delete().eq('id', id)
    if (error) { setMsg('删除失败：' + error.message); return }
    setMsg('已删除')
    load()
  }

  const toggleActive = async (row: IngredientRow) => {
    if (!row.id) return
    const { error } = await supabase.from('food_ingredients').update({ is_active: !row.is_active }).eq('id', row.id)
    if (error) { setMsg('操作失败：' + error.message); return }
    load()
  }

  const setField = (k: keyof IngredientRow, v: any) => setEditing((e) => (e ? { ...e, [k]: v } : e))
  const toggleArr = (k: 'allergens' | 'chronic_tags', v: string) =>
    setEditing((e) => {
      if (!e) return e
      const cur = e[k] || []
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
      return { ...e, [k]: next }
    })

  const visibleRows = showInactive ? rows : rows.filter((r) => r.is_active)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>食疗食材字典维护</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
            统一食材库，驱动商家端编辑页与商品详情页食疗引擎；新增食材后小程序端自动生效，无需改代码
          </p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          刷新
        </button>
      </div>

      {msg && <div style={{ padding: '10px 14px', background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setEditing(blank())}
          style={{ padding: '8px 16px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>
          + 新增食材
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          显示已停用
        </label>
      </div>

      {editing && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>{editing.id ? '编辑食材' : '新增食材'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="食材名称 name（必填）"><input style={inputStyle} value={editing.name} onChange={(e) => setField('name', e.target.value)} placeholder="如：番茄" /></Field>
            <Field label="性味 nature">
              <select style={inputStyle} value={editing.nature} onChange={(e) => setField('nature', e.target.value)}>
                {NATURE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="搭配中和食材 neutralize"><input style={inputStyle} value={editing.neutralize || ''} onChange={(e) => setField('neutralize', e.target.value)} placeholder="如：生姜（凉性番茄配生姜中和寒气）" /></Field>
            <Field label="排序 sort_order"><input type="number" style={inputStyle} value={editing.sort_order} onChange={(e) => setField('sort_order', Number(e.target.value))} /></Field>
          </div>
          <Field label="基础作用 base_effect（合规食养描述，禁用医疗词）">
            <textarea style={{ ...inputStyle, minHeight: 56 }} value={editing.base_effect || ''} onChange={(e) => setField('base_effect', e.target.value)} placeholder="如：补充水分与番茄红素，清爽开胃" />
          </Field>
          <Field label="适配场景 fit_scenes"><input style={inputStyle} value={editing.fit_scenes || ''} onChange={(e) => setField('fit_scenes', e.target.value)} placeholder="如：夏季消暑、佐餐开胃" /></Field>
          <Field label="禁忌人群 caution_crowds（逗号分隔）"><input style={inputStyle} value={editing.caution_crowds || ''} onChange={(e) => setField('caution_crowds', e.target.value)} placeholder="如：脾胃虚寒者少食" /></Field>

          <Field label="过敏原标签 allergens（多选）">
            <ChipGroup options={ALLERGEN_OPTS} selected={editing.allergens} onToggle={(v) => toggleArr('allergens', v)} />
          </Field>
          <Field label="慢病适配标签 chronic_tags（多选）">
            <ChipGroup options={CHRONIC_OPTS} selected={editing.chronic_tags} onToggle={(v) => toggleArr('chronic_tags', v)} />
          </Field>

          <Field label="状态 is_active">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setField('is_active', e.target.checked)} />
              {editing.is_active ? '启用（参与引擎计算）' : '停用（不参与引擎，但历史商品仍可显示）'}
            </label>
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={save} style={{ padding: '8px 18px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>保存</button>
            <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['名称', '性味', '基础作用', '过敏原', '慢病标签', '排序', '状态', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>加载中…</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>暂无数据</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.id}>
                <td style={td}>{row.name}</td>
                <td style={td}>{row.nature}</td>
                <td style={{ ...td, maxWidth: 220 }}>{(row.base_effect || '').slice(0, 30) || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                <td style={{ ...td, maxWidth: 160 }}>{(row.allergens || []).join('、') || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                <td style={{ ...td, maxWidth: 200 }}>{(row.chronic_tags || []).join('、') || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                <td style={td}>{row.sort_order}</td>
                <td style={td}>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, color: row.is_active ? 'var(--primary)' : 'var(--text-dim)', background: row.is_active ? 'var(--primary-soft)' : 'var(--bg)', border: '1px solid ' + (row.is_active ? 'var(--primary)' : 'var(--border)') }}>
                    {row.is_active ? '启用' : '停用'}
                  </span>
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => setEditing(row)} style={btnSm}>编辑</button>
                    <button onClick={() => toggleActive(row)} style={{ ...btnSm, background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{row.is_active ? '停用' : '启用'}</button>
                    <button onClick={() => remove(row.id!)} style={{ ...btnSm, background: '#DC2626' }}>删除</button>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function ChipGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o)
        return (
          <button key={o} type="button" onClick={() => onToggle(o)}
            style={{
              padding: '5px 12px', borderRadius: 999, border: '1px solid', fontSize: 12, cursor: 'pointer',
              borderColor: on ? 'var(--primary)' : 'var(--border)',
              background: on ? 'var(--primary-soft)' : 'var(--surface)',
              color: on ? 'var(--primary)' : 'var(--text-muted)',
            }}>
            {o}
          </button>
        )
      })}
    </div>
  )
}
