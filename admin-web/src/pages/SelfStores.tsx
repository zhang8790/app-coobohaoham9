import { useEffect, useState, useCallback } from 'react'
import {
  getSelfStores, updateSelfStore, createSelfStore,
  getSelfStoreProducts, createSelfStoreProduct, updateSelfStoreProduct,
  getSelfStoreOrders, getSelfStoreStats,
  type SelfStoreProduct, type SelfStoreOrder, type SelfStoreStats,
} from '@/api/admin'

const PAGE_SIZE = 10
const CATEGORIES = ['图书', '美食', '饮品', '零食', '日用', '礼品', '生鲜', '其他']

const FILTER_TABS = [
  { key: 'self', label: '自营店' },
  { key: 'all', label: '全部门店' },
]

const STORE_ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending_pay: { label: '待支付', color: '#6B7280' },
  pending_ship: { label: '待发货', color: '#F59E0B' },
  pending_receive: { label: '待收货', color: '#F59E0B' },
  pending_pickup: { label: '待核销', color: '#F59E0B' },
  pending_review: { label: '待评价', color: '#3B82F6' },
  completed: { label: '已完成', color: '#10B981' },
  after_sale: { label: '售后', color: '#C2410C' },
  cancelled: { label: '已取消', color: '#6B7280' },
}

type StoreRow = {
  id: string
  name: string
  description: string | null
  category: string | null
  referral_rate: number | null
  referral_rate_enabled?: boolean
  is_platform: boolean
  is_open: boolean
  open_time: string | null
  close_time: string | null
  image_url: string | null
  banner_url: string | null
}

const emptyStoreForm = {
  name: '', description: '', category: '生鲜', referral_rate_pct: 20,
  open_time: '08:00', close_time: '22:00', image_url: '', banner_url: '',
  referral_rate_enabled: true,
}

const emptyProductForm = {
  name: '', description: '', price: '', original_price: '', stock: '999',
  category: '生鲜', discount_rate_pct: 0, image_url: '', is_active: true,
}

const C = {
  bg: '#0B0F19', card: '#0F172A', border: '#1F2937', text: '#E5E7EB',
  sub: '#9CA3AF', dim: '#6B7280', accent: '#C2410C', green: '#10B981',
  gold: '#F59E0B', blue: '#3B82F6', purple: '#8B5CF6',
}

function fmtMoney(n: number) { return `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` }
function fmtDate(s: string) { return new Date(s).toLocaleString('zh-CN', { hour12: false }).slice(0, 10) }

export default function SelfStores() {
  const [filter, setFilter] = useState<'self' | 'all'>('self')
  const [page, setPage] = useState(0)
  const [list, setList] = useState<StoreRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [managing, setManaging] = useState<StoreRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, total: t } = await getSelfStores(filter, page, PAGE_SIZE)
    setList(data as StoreRow[])
    setTotal(t)
    setLoading(false)
  }, [filter, page])

  useEffect(() => { setPage(0) }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {managing ? (
        <StoreDetail store={managing} onBack={() => { setManaging(null); load() }} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>自营门店（探索）</h1>
              <p style={{ color: C.dim, fontSize: 14 }}>平台自有旗舰渠道管理 · 探索页靠「自营」标识识别</p>
            </div>
            <NewStoreButton onCreated={load} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key as any)}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: filter === t.key ? C.accent : C.card, color: filter === t.key ? '#fff' : C.sub }}>
                {t.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', color: C.dim, fontSize: 13, display: 'flex', alignItems: 'center' }}>共 {total} 家</span>
          </div>

          <div style={cardStyle}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>加载中...</div>
            ) : list.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: C.dim }}>暂无数据</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['店名', '类目', '让利率', '营业时间', '状态', '自营', '操作'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...tdStyle, color: C.sub }}>{r.category || '—'}</td>
                      <td style={{ ...tdStyle, color: C.sub }}>{r.referral_rate != null ? `${Math.round(r.referral_rate * 100)}%` : '—'}</td>
                      <td style={{ ...tdStyle, color: C.sub }}>{`${r.open_time || '--:--'} ~ ${r.close_time || '--:--'}`}</td>
                      <td style={tdStyle}>
                        <span style={badge(r.is_open ? C.green : C.dim)}>{r.is_open ? '营业中' : '打烊'}</span>
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => updateSelfStore(r.id, { is_platform: !r.is_platform }).then(() => load())}
                          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: r.is_platform ? 'rgba(194,65,12,0.15)' : 'transparent',
                            color: r.is_platform ? C.accent : C.sub, borderColor: r.is_platform ? C.accent : C.border }}>
                          {r.is_platform ? '自营' : '非自营'}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => setManaging(r)}
                          style={{ padding: '5px 14px', background: C.accent, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          管理
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {Math.ceil(total / PAGE_SIZE) > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: `1px solid ${C.border}` }}>
                {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                      background: page === i ? C.accent : C.card, color: page === i ? '#fff' : C.sub }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── 门店详情（概览 / 商品 / 订单）──────────────────────────────────────
function StoreDetail({ store, onBack }: { store: StoreRow; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'products' | 'orders'>('overview')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...emptyStoreForm })

  const openEdit = () => {
    setEditing(true)
    setForm({
      name: store.name, description: store.description ?? '', category: store.category ?? '生鲜',
      referral_rate_pct: Math.round((store.referral_rate ?? 0) * 100),
      open_time: store.open_time ?? '08:00', close_time: store.close_time ?? '22:00',
      image_url: store.image_url ?? '', banner_url: store.banner_url ?? '',
      referral_rate_enabled: store.referral_rate_enabled ?? true,
    })
  }
  const save = async () => {
    if (!form.name.trim()) { alert('请填写店名'); return }
    if (form.referral_rate_pct < 0 || form.referral_rate_pct > 100) { alert('让利率需在 0~100 之间'); return }
    await updateSelfStore(store.id, {
      name: form.name.trim(), description: form.description.trim() || null, category: form.category,
      referral_rate: Math.round(form.referral_rate_pct) / 100, open_time: form.open_time, close_time: form.close_time,
      is_open: true, image_url: form.image_url.trim() || null, banner_url: form.banner_url.trim() || null,
      referral_rate_enabled: form.referral_rate_enabled,
    })
    setEditing(false)
    onBack()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack}
          style={{ padding: '7px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.sub, cursor: 'pointer', fontSize: 13 }}>
          ← 返回列表
        </button>
        <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700 }}>{store.name}</h1>
        <span style={badge(C.accent)}>{store.is_platform ? '自营' : '非自营'}</span>
        <span style={badge(store.is_open ? C.green : C.dim)}>{store.is_open ? '营业中' : '打烊'}</span>
        <button onClick={openEdit}
          style={{ marginLeft: 'auto', padding: '7px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, cursor: 'pointer', fontSize: 13 }}>
          编辑门店
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {([['overview', '概览'], ['products', '商品'], ['orders', '订单']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: tab === k ? C.accent : C.card, color: tab === k ? '#fff' : C.sub }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab storeId={store.id} />}
      {tab === 'products' && <ProductsTab storeId={store.id} storeReferralEnabled={store.referral_rate_enabled ?? true} />}
      {tab === 'orders' && <OrdersTab storeId={store.id} />}

      {editing && (
        <StoreEditModal form={form} setForm={setForm} onCancel={() => setEditing(false)} onSave={save} />
      )}
    </div>
  )
}

function OverviewTab({ storeId }: { storeId: string }) {
  const [stats, setStats] = useState<SelfStoreStats | null>(null)
  useEffect(() => {
    getSelfStoreStats(storeId).then(setStats)
  }, [storeId])
  const cards = [
    { label: '商品总数', value: stats ? `${stats.productTotal}` : '—', color: C.blue },
    { label: '在售商品', value: stats ? `${stats.productActive}` : '—', color: C.green },
    { label: '订单总数', value: stats ? `${stats.orderTotal}` : '—', color: C.purple },
    { label: 'GMV 累计', value: stats ? fmtMoney(stats.gmv) : '—', color: C.gold },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
      {cards.map(c => (
        <div key={c.label} style={cardStyle}>
          <p style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>{c.label}</p>
          <p style={{ color: c.color, fontSize: 22, fontWeight: 700 }}>{c.value}</p>
        </div>
      ))}
      <p style={{ gridColumn: '1 / -1', color: C.dim, fontSize: 12, marginTop: 4 }}>
        提示：GMV 依赖 Supabase 聚合函数（db-aggregates），若显示 ¥0 请在 Dashboard 执行
        <code style={{ color: C.sub }}> ALTER ROLE authenticator SET pgrst.db_aggregates_enabled='true'; NOTIFY pgrst,'reload config';</code>
      </p>
    </div>
  )
}

function ProductsTab({ storeId, storeReferralEnabled }: { storeId: string; storeReferralEnabled?: boolean }) {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<SelfStoreProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SelfStoreProduct | null>(null)
  const [form, setForm] = useState({ ...emptyProductForm })

  const load = useCallback(() => {
    setLoading(true)
    getSelfStoreProducts(storeId, page, PAGE_SIZE).then(r => { setList(r.data); setTotal(r.total); setLoading(false) })
  }, [storeId, page])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm({ ...emptyProductForm }); setShowForm(true) }
  const openEdit = (p: SelfStoreProduct) => {
    setEditing(p)
    setForm({
      name: p.name, description: p.description ?? '', price: String(p.price),
      original_price: p.original_price != null ? String(p.original_price) : '',
      stock: String(p.stock), category: p.category ?? '生鲜',
      discount_rate_pct: p.discount_rate != null ? p.discount_rate : 0,
      image_url: p.image_url ?? '', is_active: p.is_active,
    })
    setShowForm(true)
  }
  const save = async () => {
    const price = Number(form.price)
    if (!form.name.trim()) { alert('请填写商品名'); return }
    if (!price || price <= 0) { alert('价格需大于 0'); return }
    const payload = {
      name: form.name.trim(), description: form.description.trim() || undefined,
      price, original_price: form.original_price ? Number(form.original_price) : null,
      stock: Number(form.stock) || 0, category: form.category,
      discount_rate: form.discount_rate_pct ? Number(form.discount_rate_pct) : null,
      image_url: form.image_url.trim() || undefined, is_active: form.is_active,
    }
    if (editing) await updateSelfStoreProduct(editing.id, payload)
    else await createSelfStoreProduct(storeId, payload)
    setShowForm(false); load()
  }
  const toggleActive = async (p: SelfStoreProduct) => {
    await updateSelfStoreProduct(p.id, { is_active: !p.is_active, review_status: 'approved' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>店内商品</h3>
        <span style={{ color: C.dim, fontSize: 13, marginLeft: 10 }}>共 {total} 件</span>
        <button onClick={openCreate}
          style={{ marginLeft: 'auto', padding: '8px 16px', background: C.accent, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + 新建商品
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['商品', '价格', '库存', '让利%', '状态', '操作'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.dim }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: C.dim }}>暂无商品，点「新建商品」添加</td></tr>
            ) : list.map(p => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{p.name}</td>
                <td style={{ ...tdStyle, color: C.gold, fontWeight: 700 }}>{fmtMoney(p.price)}</td>
                <td style={{ ...tdStyle, color: C.sub }}>{p.stock}</td>
                <td style={{ ...tdStyle, color: C.sub }}>{p.discount_rate != null ? `${p.discount_rate}%` : '—'}</td>
                <td style={tdStyle}>
                  <span style={badge(p.is_active ? C.green : C.dim)}>{p.is_active ? '在售' : '下架'}</span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(p)}
                      style={miniBtn}>编辑</button>
                    <button onClick={() => toggleActive(p)}
                      style={{ ...miniBtn, color: p.is_active ? C.accent : C.green, borderColor: p.is_active ? C.accent : C.green }}>
                      {p.is_active ? '下架' : '上架'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {Math.ceil(total / PAGE_SIZE) > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: `1px solid ${C.border}` }}>
            {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: page === i ? C.accent : C.card, color: page === i ? '#fff' : C.sub }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ProductFormModal
          isEdit={!!editing} form={form} setForm={setForm}
          storeReferralEnabled={storeReferralEnabled}
          onCancel={() => setShowForm(false)} onSave={save}
        />
      )}
    </div>
  )
}

function OrdersTab({ storeId }: { storeId: string }) {
  const [page, setPage] = useState(0)
  const [list, setList] = useState<SelfStoreOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getSelfStoreOrders(storeId, page, PAGE_SIZE).then(r => { setList(r.data); setTotal(r.total); setLoading(false) })
  }, [storeId, page])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>门店订单 <span style={{ color: C.dim, fontSize: 13, fontWeight: 400 }}>共 {total} 笔</span></h3>
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['订单号', '买家', '成交额', '让利后收益', '情绪豆抵扣', '状态', '时间'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: C.dim }}>加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.dim }}>暂无订单</td></tr>
            ) : list.map(o => {
              const s = STORE_ORDER_STATUS[o.status] ?? { label: o.status, color: C.dim }
              return (
                <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ ...tdStyle, color: C.sub, fontFamily: 'monospace', fontSize: 12 }}>{o.order_no}</td>
                  <td style={{ ...tdStyle, color: C.text }}>{o.buyer_nickname ?? '无名'}</td>
                  <td style={{ ...tdStyle, color: C.sub }}>{fmtMoney(o.total_amount)}</td>
                  <td style={{ ...tdStyle, color: C.green, fontWeight: 700 }}>
                    {o.settle_amount != null ? fmtMoney(o.settle_amount) : <span style={{ color: C.dim, fontSize: 12 }}>待结算</span>}
                    {o.discount_pool != null && o.discount_pool > 0 && (
                      <div style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>让利 {fmtMoney(o.discount_pool)}</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: C.gold }}>{fmtMoney(o.tb_used)}</td>
                  <td style={tdStyle}><span style={{ color: s.color, fontSize: 12 }}>● {s.label}</span></td>
                  <td style={{ ...tdStyle, color: C.dim }}>{fmtDate(o.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {Math.ceil(total / PAGE_SIZE) > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: `1px solid ${C.border}` }}>
            {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: page === i ? C.accent : C.card, color: page === i ? '#fff' : C.sub }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 弹窗 ─────────────────────────────────────────────────────────────
function NewStoreButton({ onCreated }: { onCreated: () => void }) {
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ ...emptyStoreForm })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name.trim()) { alert('请填写店名'); return }
    if (form.referral_rate_pct < 0 || form.referral_rate_pct > 100) { alert('让利率需在 0~100 之间'); return }
    setSaving(true)
    await createSelfStore({
      name: form.name.trim(), description: form.description.trim() || undefined, category: form.category,
      referral_rate: Math.round(form.referral_rate_pct) / 100, open_time: form.open_time, close_time: form.close_time,
      image_url: form.image_url.trim() || undefined, banner_url: form.banner_url.trim() || undefined,
    })
    setSaving(false); setShow(false); onCreated()
  }
  return (
    <>
      <button onClick={() => setShow(true)}
        style={{ padding: '10px 18px', background: C.accent, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
        + 新建自营店
      </button>
      {show && (
        <StoreEditModal
          title="新建自营店"
          form={form} setForm={setForm}
          onCancel={() => setShow(false)} onSave={save}
          saving={saving}
          hint="新建将自动标记为「自营」（探索页可见），owner 绑定平台主账号。"
        />
      )}
    </>
  )
}

function StoreEditModal({ title = '编辑门店', form, setForm, onCancel, onSave, saving, hint }: {
  title?: string; form: any; setForm: any; onCancel: () => void; onSave: () => void; saving?: boolean; hint?: string
}) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ color: C.text, fontSize: 18, fontWeight: 700, marginBottom: 18 }}>{title}</h3>
        <Field label="店名 *">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="如来电有喜·生鲜自营馆" />
        </Field>
        <Field label="简介">
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, height: 64, resize: 'none' }} placeholder="平台自营好货，品质保障" />
        </Field>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="类目" flex>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="让利率 (%)" flex>
            <input type="number" min={0} max={100} value={form.referral_rate_pct} onChange={e => setForm({ ...form, referral_rate_pct: Number(e.target.value) })} style={inputStyle} placeholder="20" />
          </Field>
        </div>
        <Field label="店铺整体让利">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={() => setForm({ ...form, referral_rate_enabled: !form.referral_rate_enabled })}
              style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: form.referral_rate_enabled ? C.accent : C.border, position: 'relative', transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 3, left: form.referral_rate_enabled ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </button>
            <span style={{ color: form.referral_rate_enabled ? C.green : C.sub, fontSize: 13, fontWeight: 600 }}>
              {form.referral_rate_enabled ? '开启（门店默认让利率参与分佣回退）' : '关闭（仅商品级让利生效）'}
            </span>
          </div>
        </Field>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="营业开始" flex>
            <input type="time" value={form.open_time} onChange={e => setForm({ ...form, open_time: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="营业结束" flex>
            <input type="time" value={form.close_time} onChange={e => setForm({ ...form, close_time: e.target.value })} style={inputStyle} />
          </Field>
        </div>
        <Field label="店招图 URL"><input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
        <Field label="横幅图 URL"><input value={form.banner_url} onChange={e => setForm({ ...form, banner_url: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
        {hint && <p style={{ color: C.dim, fontSize: 12, margin: '0 0 16px' }}>{hint}</p>}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={cancelBtn}>取消</button>
          <button onClick={onSave} disabled={saving} style={{ ...saveBtn, background: saving ? '#7f1d1d' : C.accent, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductFormModal({ isEdit, form, setForm, storeReferralEnabled, onCancel, onSave }: {
  isEdit: boolean; form: any; setForm: any; storeReferralEnabled?: boolean; onCancel: () => void; onSave: () => void
}) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ color: C.text, fontSize: 18, fontWeight: 700, marginBottom: 18 }}>{isEdit ? '编辑商品' : '新建商品'}</h3>
        <Field label="商品名 *"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="如 自营·当季鲜橙" /></Field>
        <Field label="简介"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, height: 56, resize: 'none' }} /></Field>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="售价 (元) *" flex><input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={inputStyle} placeholder="19.90" /></Field>
          <Field label="原价 (元)" flex><input type="number" min={0} step="0.01" value={form.original_price} onChange={e => setForm({ ...form, original_price: e.target.value })} style={inputStyle} placeholder="39.90" /></Field>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="库存" flex><input type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} style={inputStyle} placeholder="999" /></Field>
          <Field label="类目" flex>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="商品让利% (0~100，按利润高低设)">
          <input type="number" min={0} max={100} value={form.discount_rate_pct} onChange={e => setForm({ ...form, discount_rate_pct: Number(e.target.value) })} style={inputStyle} placeholder="5" />
          {storeReferralEnabled && form.discount_rate_pct > 0 && (
            <p style={{ margin: '8px 0 0', padding: '8px 10px', background: 'rgba(194,65,12,0.12)', border: `1px solid ${C.accent}`, borderRadius: 8, color: C.accent, fontSize: 12 }}>
              提示：本店已开启「整体让利」，商品让利 {form.discount_rate_pct}% 将与门店默认让利率按金额加权合并计算，不会叠加放大。
            </p>
          )}
          {!storeReferralEnabled && form.discount_rate_pct > 0 && (
            <p style={{ margin: '8px 0 0', padding: '8px 10px', background: 'rgba(59,130,246,0.12)', border: `1px solid ${C.blue}`, borderRadius: 8, color: C.blue, fontSize: 12 }}>
              提示：本店「整体让利」已关闭，该商品让利 {form.discount_rate_pct}% 为唯一让利来源（无商品让利则该单让利为 0）。
            </p>
          )}
        </Field>
        <Field label="商品图 URL"><input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.sub, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
          创建后直接上架（在售）
        </label>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={cancelBtn}>取消</button>
          <button onClick={onSave} style={saveBtn}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── 样式 ─────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }
const thStyle: React.CSSProperties = { color: C.dim, fontSize: 12, fontWeight: 500, padding: '10px 16px', textAlign: 'left', background: C.bg }
const tdStyle: React.CSSProperties = { padding: '14px 16px', fontSize: 14, borderBottom: `1px solid ${C.border}` }
const badge = (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${color}22`, color })
const miniBtn: React.CSSProperties = { padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.sub, cursor: 'pointer', fontSize: 12 }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalStyle: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const cancelBtn: React.CSSProperties = { padding: '9px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.sub, cursor: 'pointer' }
const saveBtn: React.CSSProperties = { padding: '9px 22px', background: C.accent, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ flex: flex ? 1 : undefined, marginBottom: 14 }}>
      <label style={{ display: 'block', color: C.sub, fontSize: 12, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
