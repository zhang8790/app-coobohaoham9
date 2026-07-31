// 来电有喜 · 管理后台「食品配料安全 · 三库维护」
// 数据来源：food_additives(添加剂安全库) / food_allergens(过敏原库) /
//          food_crowd_triggers(人群触发词) / food_crowd_tips(人群文案)
// 这四个基础表后台可维护、无需改代码（对应小程序配料安全分析引擎 ingredient-analyze）。
import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

type Tab = 'additives' | 'allergens' | 'triggers' | 'tips'

const RISK_OPTS = [
  { v: 'white', label: '安全(white)' },
  { v: 'yellow', label: '限量(yellow)' },
  { v: 'black', label: '禁用(black)' },
]
const CROWD_CODES = [
  'hypertension', 'hyperlipidemia', 'diabetes', 'gout', 'children',
  'allergy_soy', 'allergy_sesame', 'allergy_peanut', 'allergy_wheat',
  'allergy_dairy', 'allergy_shrimp', 'allergy_crab', 'allergy_nut',
]

interface AdditiveRow { id?: string; name: string; category: string; risk_level: string; gb_std: string; risk_desc: string }
interface AllergenRow { id?: string; key: string; name: string; description: string; crowd_code: string; sort_order: number }
interface TriggerRow { id?: string; trigger_keyword: string; crowd_code: string }
interface TipRow { id?: string; crowd_code: string; label: string; general_tip: string; children_tip: string; fit_people: string; unfit_people: string; sort_order: number }

const TABS: [Tab, string][] = [
  ['additives', '添加剂安全库'],
  ['allergens', '过敏原库'],
  ['triggers', '人群触发词'],
  ['tips', '人群文案'],
]

const th: CSSProperties = { textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }
const td: CSSProperties = { padding: '10px 12px', color: 'var(--text)', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const inputStyle: CSSProperties = { width: '100%', padding: '7px 9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }

export default function FoodSafetyLibs() {
  const [tab, setTab] = useState<Tab>('additives')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [additives, setAdditives] = useState<AdditiveRow[]>([])
  const [allergens, setAllergens] = useState<AllergenRow[]>([])
  const [triggers, setTriggers] = useState<TriggerRow[]>([])
  const [tips, setTips] = useState<TipRow[]>([])
  const [editing, setEditing] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, al, tr, ti] = await Promise.all([
      supabase.from('food_additives').select('*').order('name'),
      supabase.from('food_allergens').select('*').order('sort_order'),
      supabase.from('food_crowd_triggers').select('*').order('trigger_keyword'),
      supabase.from('food_crowd_tips').select('*').order('sort_order'),
    ])
    setAdditives((a.data as AdditiveRow[]) ?? [])
    setAllergens((al.data as AllergenRow[]) ?? [])
    setTriggers((tr.data as TriggerRow[]) ?? [])
    setTips((ti.data as TipRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const blank = (t: Tab) => {
    if (t === 'additives') return { name: '', category: '', risk_level: 'white', gb_std: 'GB2760', risk_desc: '' }
    if (t === 'allergens') return { key: '', name: '', description: '', crowd_code: 'allergy_soy', sort_order: 99 }
    if (t === 'triggers') return { trigger_keyword: '', crowd_code: 'hypertension' }
    return { crowd_code: '', label: '', general_tip: '', children_tip: '', fit_people: '', unfit_people: '', sort_order: 99 }
  }

  const save = async () => {
    if (!editing) return
    const tbl = { additives: 'food_additives', allergens: 'food_allergens', triggers: 'food_crowd_triggers', tips: 'food_crowd_tips' }[tab]
    try {
      if (editing.id) {
        const { id, ...rest } = editing
        const { error } = await supabase.from(tbl).update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(tbl).insert(editing)
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
    const tbl = { additives: 'food_additives', allergens: 'food_allergens', triggers: 'food_crowd_triggers', tips: 'food_crowd_tips' }[tab]
    const { error } = await supabase.from(tbl).delete().eq('id', id)
    if (error) { setMsg('删除失败：' + error.message); return }
    setMsg('已删除')
    load()
  }

  const setField = (k: string, v: any) => setEditing((e: any) => ({ ...e, [k]: v }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>食品配料安全 · 基础库维护</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
            添加剂/过敏原/人群触发/人群文案 四个基础库，后台维护即生效，无需改代码
          </p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          刷新
        </button>
      </div>

      {msg && <div style={{ padding: '10px 14px', background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setEditing(null) }}
            style={{ padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent', fontWeight: tab === k ? 600 : 400, marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: 'var(--text-dim)', padding: 24 }}>加载中…</p> : (
        <>
          {/* 新增按钮 */}
          <button onClick={() => setEditing(blank(tab))}
            style={{ marginBottom: 12, padding: '8px 16px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>
            + 新增
          </button>

          {/* 编辑面板 */}
          {editing && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>{editing.id ? '编辑' : '新增'} · {TABS.find((t) => t[0] === tab)?.[1]}</p>
              {tab === 'additives' && (
                <>
                  <Field label="标准名 name"><input style={inputStyle} value={editing.name} onChange={(e) => setField('name', e.target.value)} /></Field>
                  <Field label="类别 category"><input style={inputStyle} value={editing.category} onChange={(e) => setField('category', e.target.value)} /></Field>
                  <Field label="风险等级 risk_level">
                    <select style={inputStyle} value={editing.risk_level} onChange={(e) => setField('risk_level', e.target.value)}>
                      {RISK_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="国标 gb_std"><input style={inputStyle} value={editing.gb_std} onChange={(e) => setField('gb_std', e.target.value)} /></Field>
                  <Field label="说明 risk_desc"><textarea style={{ ...inputStyle, minHeight: 56 }} value={editing.risk_desc} onChange={(e) => setField('risk_desc', e.target.value)} /></Field>
                </>
              )}
              {tab === 'allergens' && (
                <>
                  <Field label="key"><input style={inputStyle} value={editing.key} onChange={(e) => setField('key', e.target.value)} /></Field>
                  <Field label="名称 name"><input style={inputStyle} value={editing.name} onChange={(e) => setField('name', e.target.value)} /></Field>
                  <Field label="说明"><input style={inputStyle} value={editing.description} onChange={(e) => setField('description', e.target.value)} /></Field>
                  <Field label="人群 code"><select style={inputStyle} value={editing.crowd_code} onChange={(e) => setField('crowd_code', e.target.value)}>{CROWD_CODES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
                  <Field label="排序 sort_order"><input type="number" style={inputStyle} value={editing.sort_order} onChange={(e) => setField('sort_order', Number(e.target.value))} /></Field>
                </>
              )}
              {tab === 'triggers' && (
                <>
                  <Field label="触发词 trigger_keyword"><input style={inputStyle} value={editing.trigger_keyword} onChange={(e) => setField('trigger_keyword', e.target.value)} /></Field>
                  <Field label="人群 code"><select style={inputStyle} value={editing.crowd_code} onChange={(e) => setField('crowd_code', e.target.value)}>{CROWD_CODES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
                </>
              )}
              {tab === 'tips' && (
                <>
                  <Field label="人群 code（唯一）"><input style={inputStyle} value={editing.crowd_code} onChange={(e) => setField('crowd_code', e.target.value)} /></Field>
                  <Field label="标签 label"><input style={inputStyle} value={editing.label} onChange={(e) => setField('label', e.target.value)} /></Field>
                  <Field label="一般提示"><textarea style={{ ...inputStyle, minHeight: 48 }} value={editing.general_tip} onChange={(e) => setField('general_tip', e.target.value)} /></Field>
                  <Field label="儿童提示"><textarea style={{ ...inputStyle, minHeight: 48 }} value={editing.children_tip} onChange={(e) => setField('children_tip', e.target.value)} /></Field>
                  <Field label="适宜人群"><input style={inputStyle} value={editing.fit_people} onChange={(e) => setField('fit_people', e.target.value)} /></Field>
                  <Field label="需谨慎/不宜人群"><input style={inputStyle} value={editing.unfit_people} onChange={(e) => setField('unfit_people', e.target.value)} /></Field>
                  <Field label="排序"><input type="number" style={inputStyle} value={editing.sort_order} onChange={(e) => setField('sort_order', Number(e.target.value))} /></Field>
                </>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={save} style={{ padding: '8px 18px', background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>保存</button>
                <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>取消</button>
              </div>
            </div>
          )}

          {/* 列表 */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>{headCells(tab).map((h) => <th key={h} style={th}>{h}</th>)}<th style={th}>操作</th></tr></thead>
              <tbody>
                {listFor(tab, additives, allergens, triggers, tips).length === 0 ? (
                  <tr><td colSpan={headCells(tab).length + 1} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>暂无数据</td></tr>
                ) : listFor(tab, additives, allergens, triggers, tips).map((row: any) => (
                  <tr key={row.id}>
                    {bodyCells(tab, row).map((c, i) => <td key={i} style={td}>{c}</td>)}
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditing(row)} style={btnSm}>编辑</button>
                        <button onClick={() => remove(row.id)} style={{ ...btnSm, background: '#DC2626' }}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function headCells(tab: Tab): string[] {
  if (tab === 'additives') return ['名称', '类别', '风险', '国标', '说明']
  if (tab === 'allergens') return ['key', '名称', '说明', '人群code', '排序']
  if (tab === 'triggers') return ['触发词', '人群code']
  return ['code', '标签', '一般提示', '儿童提示', '适宜', '不宜', '排序']
}
function bodyCells(tab: Tab, row: any): string[] {
  if (tab === 'additives') return [row.name, row.category, row.risk_level, row.gb_std, (row.risk_desc || '').slice(0, 40)]
  if (tab === 'allergens') return [row.key, row.name, (row.description || '').slice(0, 30), row.crowd_code, String(row.sort_order)]
  if (tab === 'triggers') return [row.trigger_keyword, row.crowd_code]
  return [row.crowd_code, row.label, (row.general_tip || '').slice(0, 30), (row.children_tip || '').slice(0, 30), (row.fit_people || '').slice(0, 20), (row.unfit_people || '').slice(0, 20), String(row.sort_order)]
}
function listFor(tab: Tab, a: any[], al: any[], tr: any[], ti: any[]) {
  return tab === 'additives' ? a : tab === 'allergens' ? al : tab === 'triggers' ? tr : ti
}

const btnSm: CSSProperties = { padding: '4px 10px', background: 'var(--primary)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
