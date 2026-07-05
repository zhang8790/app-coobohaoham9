import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface ProductWithExt extends Product {
  status: 'online' | 'offline'
  sales: number
  cost_price?: number
  main_image?: string
  sub_images?: string[]
  detail_images?: string[]
  video_url?: string
}

function calcMargin(price: number, cost?: number): string {
  if (!cost || cost <= 0 || price <= 0) return '-'
  return ((price - cost) / price * 100).toFixed(1) + '%'
}

function calcRangLi(price: number, original?: number): string {
  if (!original || original <= price) return '-'
  return '¥' + (original - price).toFixed(1)
}

const MOCK_PRODUCTS: ProductWithExt[] = [
  {
    id: '1', store_id: 'store-1', name: '云南高山古树普洱茶 357g', description: '正宗云南古树普洱，陈化5年，汤色红浓明亮，滋味醇厚回甘。每一饼茶都经过严格筛选，确保品质上乘。适合长期储藏，越陈越香。',
    price: 268, original_price: 398,
    main_image: 'https://img.icons8.com/color/96/000000/tea.png',
    sub_images: [
      'https://img.icons8.com/color/96/000000/tea.png',
      'https://img.icons8.com/color/96/000000/green-tea.png',
    ],
    detail_images: [
      'https://img.icons8.com/color/96/000000/tea.png',
      'https://img.icons8.com/color/96/000000/green-tea.png',
      'https://img.icons8.com/color/96/000000/oolong-tea.png',
    ],
    video_url: '',
    category_id: 'cat-1', status: 'online', stock: 126, sales: 342, is_active: true, cost_price: 120,
    discount_rate: 33, created_at: '2026-06-15',
  },
  {
    id: '2', store_id: 'store-1', name: '手工红糖姜茶 15包装', description: '云南手工红糖+老姜，暖胃驱寒，独立小包装，方便携带。精选优质红糖和老姜，传统工艺制作，无添加防腐剂。',
    price: 39.9, original_price: 59.9,
    main_image: 'https://img.icons8.com/color/96/000000/honey.png',
    sub_images: [],
    detail_images: [
      'https://img.icons8.com/color/96/000000/honey.png',
      'https://img.icons8.com/color/96/000000/ginger.png',
    ],
    video_url: '',
    category_id: 'cat-2', status: 'online', stock: 500, sales: 1024, is_active: true, cost_price: 18,
    discount_rate: 33, created_at: '2026-06-10',
  },
  {
    id: '3', store_id: 'store-1', name: '野生菌汤包 煲汤食材 150g', description: '云南野生菌组合，煲汤极品，含牛肝菌、鸡油菌、松茸等优质野生菌，营养丰富，味道鲜美。',
    price: 88, original_price: 128,
    main_image: '',
    sub_images: [],
    detail_images: [],
    video_url: '',
    category_id: 'cat-3', status: 'offline', stock: 80, sales: 56, is_active: false, cost_price: 45,
    discount_rate: 31, created_at: '2026-06-05',
  },
  {
    id: '4', store_id: 'store-1', name: '傣族手工鲜花饼 礼盒装', description: '云南鲜花饼，现做现发20枚，选用云南食用玫瑰，皮薄馅多，花香浓郁，甜而不腻。',
    price: 68, original_price: 98,
    main_image: 'https://img.icons8.com/color/96/000000/cake.png',
    sub_images: [],
    detail_images: [
      'https://img.icons8.com/color/96/000000/cake.png',
    ],
    video_url: '',
    category_id: 'cat-4', status: 'online', stock: 200, sales: 789, is_active: true, cost_price: 32,
    discount_rate: 31, created_at: '2026-05-28',
  },
  {
    id: '5', store_id: 'store-1', name: '云南小粒咖啡豆 烘焙熟豆 500g', description: '普洱小粒咖啡，中度烘焙，花果香明显，酸度适中，余韵悠长。产地直供，新鲜烘焙。',
    price: 128, original_price: 168,
    main_image: 'https://img.icons8.com/color/96/000000/coffee.png',
    sub_images: [
      'https://img.icons8.com/color/96/000000/coffee.png',
      'https://img.icons8.com/color/96/000000/coffee-beans.png',
      'https://img.icons8.com/color/96/000000/espresso-cup.png',
    ],
    detail_images: [
      'https://img.icons8.com/color/96/000000/coffee-beans.png',
      'https://img.icons8.com/color/96/000000/espresso-cup.png',
    ],
    video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    category_id: 'cat-5', status: 'offline', stock: 0, sales: 231, is_active: false, cost_price: 65,
    discount_rate: 24, created_at: '2026-05-20',
  },
]

// 本地文件转 base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function MerchantProducts() {
  const nav = useNavigate()
  const { profile, useMock } = useAuth()
  const [list, setList] = useState<ProductWithExt[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProductWithExt | null>(null)
  const [form, setForm] = useState({
    name: '', price: '', original_price: '', cost_price: '', stock: '', desc: '',
    main_image: '', sub_images: [] as string[], detail_images: [] as string[], video_url: '',
    discount_rate: '',
  })
  const mainImgRef   = useRef<HTMLInputElement>(null)
  const subImgRef    = useRef<HTMLInputElement>(null)
  const detailRef    = useRef<HTMLInputElement>(null)
  const videoRef     = useRef<HTMLInputElement>(null)

  // 判断是否有商家权限
  const isMerchantUser = profile?.merchant_status === 'approved' || profile?.role === 'merchant'

  // 获取当前商家的 store_id
  useEffect(() => {
    if (!profile || !isMerchantUser) return
    if (useMock) { setStoreId(null); return }
    const fetchStore = async () => {
      const { data } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', profile.id)
        .maybeSingle()
      setStoreId(data?.id ?? null)
    }
    fetchStore()
  }, [profile, useMock])

  // 加载商品列表
  useEffect(() => {
    if (useMock || !isMerchantUser || !storeId) {
      // 演示模式或用 Mock 数据
      setList([...MOCK_PRODUCTS])
      return
    }
    load()
  }, [useMock, storeId, profile])

  const load = async () => {
    setList([])
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId || '')
        .order('created_at', { ascending: false })
      if (error) throw error
      setList((data ?? []).map(p => ({
        ...p,
        status: p.is_active ? 'online' : 'offline',
        sales: (p as any).sales ?? 0,
      } as ProductWithExt)))
    } catch (e) {
      console.warn('[Products] 加载失败，使用 Mock:', e)
      setList([...MOCK_PRODUCTS])
    }
  }

  const filtered = filter === 'all' ? list : list.filter(p => p.status === filter)

  const toggleStatus = async (id: string) => {
    const item = list.find(p => p.id === id)
    if (!item) return
    const newActive = !item.is_active
    if (!useMock && storeId) {
      const { error } = await supabase.from('products').update({ is_active: newActive }).eq('id', id)
      if (error) { console.warn('[Products] 更新状态失败:', error); return }
    }
    setList(prev => prev.map(p => p.id === id ? { ...p, is_active: newActive, status: (newActive ? 'online' : 'offline') as 'online' | 'offline' } : p))
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', price: '', original_price: '', cost_price: '', stock: '', desc: '', main_image: '', sub_images: [], detail_images: [], video_url: '', discount_rate: '' })
    setShowModal(true)
  }

  const openEdit = (p: ProductWithExt) => {
    setEditing(p)
    setForm({
      name: p.name,
      price: String(p.price),
      original_price: String(p.original_price || ''),
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      stock: String(p.stock),
      desc: p.description || '',
      main_image: p.main_image || '',
      sub_images: p.sub_images ? [...p.sub_images] : [],
      detail_images: p.detail_images ? [...p.detail_images] : [],
      video_url: p.video_url || '',
      discount_rate: p.discount_rate != null ? String(p.discount_rate) : '',
    })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditing(null) }

  // 主图选择
  const handleMainImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await fileToBase64(file)
    setForm(f => ({ ...f, main_image: base64 }))
  }

  // 副图选择（多选）
  const handleSubImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const bases: string[] = []
    for (let i = 0; i < files.length; i++) {
      bases.push(await fileToBase64(files[i]))
    }
    setForm(f => ({ ...f, sub_images: [...f.sub_images, ...bases].slice(0, 9) }))
  }

  // 视频选择
  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await fileToBase64(file)
    setForm(f => ({ ...f, video_url: base64 }))
  }

  // 详情图片选择（多选）
  const handleDetailImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const bases: string[] = []
    for (let i = 0; i < files.length; i++) {
      bases.push(await fileToBase64(files[i]))
    }
    setForm(f => ({ ...f, detail_images: [...f.detail_images, ...bases].slice(0, 20) }))
  }

  const removeDetailImg = (idx: number) => {
    setForm(f => ({ ...f, detail_images: f.detail_images.filter((_, i) => i !== idx) }))
  }

  const removeSubImg = (idx: number) => {
    setForm(f => ({ ...f, sub_images: f.sub_images.filter((_, i) => i !== idx) }))
  }

  const handleSubmit = async () => {
    // 真实模式：暂时提示去小程序端操作（图片上传需要 Storage 集成）
    if (!useMock && storeId) {
      alert('真实模式下，创建/编辑商品功能请在小程序端操作（支持图片上传）。')
      closeModal()
      return
    }
    const cost = Number(form.cost_price) || 0
    const dr = Number(form.discount_rate) || 0
    if (editing) {
      setList(prev => prev.map(p => p.id === editing.id ? {
        ...p,
        name: form.name,
        price: Number(form.price),
        original_price: Number(form.original_price),
        cost_price: cost || undefined,
        stock: Number(form.stock),
        description: form.desc,
        main_image: form.main_image,
        sub_images: form.sub_images,
        detail_images: form.detail_images,
        video_url: form.video_url,
        discount_rate: dr || undefined,
      } : p))
    } else {
      const newP: ProductWithExt = {
        id: `new-${Date.now()}`, store_id: 'store-1', name: form.name,
        price: Number(form.price), original_price: Number(form.original_price),
        cost_price: cost || undefined, stock: Number(form.stock),
        description: form.desc,
        main_image: form.main_image,
        sub_images: form.sub_images,
        detail_images: form.detail_images,
        video_url: form.video_url,
        discount_rate: dr || undefined,
        category_id: '', status: 'offline', sales: 0, is_active: false,
        created_at: new Date().toISOString().slice(0, 10),
      }
      setList(prev => [newP, ...prev])
    }
    closeModal()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该商品？删除后不可恢复。')) return
    if (!useMock && storeId) {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) { console.warn('[Products] 删除失败:', error); return }
    }
    setList(prev => prev.filter(p => p.id !== id))
  }

  const totalCost    = list.reduce((s, p) => s + (p.cost_price || 0) * p.sales, 0)
  const totalRevenue = list.reduce((s, p) => s + p.price * p.sales, 0)
  const totalProfit  = list.reduce((s, p) => s + ((p.price - (p.cost_price || 0)) * p.sales), 0)
  const avgMargin    = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : '-'

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#E5E7EB', fontSize: 20, fontWeight: 700, margin: 0 }}>商品管理</h2>
          <p style={{ color: '#6B7280', fontSize: 13, margin: '4px 0 0' }}>管理店铺商品：上架/下架、编辑、查看成本/毛利/让利</p>
        </div>
        <button onClick={openCreate} style={{ padding: '8px 18px', background: '#059669', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ 添加商品</button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '全部商品', value: list.length, color: '#6366F1' },
          { label: '上架中',   value: list.filter(p => p.status === 'online').length, color: '#059669' },
          { label: '已下架',   value: list.filter(p => p.status === 'offline').length, color: '#DC2626' },
          { label: '总销量',   value: list.reduce((s, p) => s + p.sales, 0), color: '#D97706' },
          { label: '平均毛利率', value: avgMargin + '%', color: '#06B6D4' },
        ].map(c => (
          <div key={c.label} style={{ background: '#111827', borderRadius: 10, padding: '14px 16px', border: '1px solid #1F2937' }}>
            <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* biz overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '总成本', value: `¥${totalCost.toLocaleString()}`, color: '#F59E0B' },
          { label: '总营收', value: `¥${totalRevenue.toLocaleString()}`, color: '#10B981' },
          { label: '总利润', value: `¥${totalProfit.toLocaleString()}`, color: '#06B6D4' },
        ].map(c => (
          <div key={c.label} style={{ background: '#111827', borderRadius: 10, padding: '14px 16px', border: '1px solid #1F2937' }}>
            <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 20, fontWeight: 700, margin: '4px 0 0' }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { key: 'all' as const, label: '全部' },
          { key: 'online' as const, label: '上架中' },
          { key: 'offline' as const, label: '已下架' },
        ]).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: filter === f.key ? '#059669' : '#1F2937', color: filter === f.key ? '#fff' : '#9CA3AF',
          }}>{f.label}</button>
        ))}
      </div>

      {/* goods table */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1F2937', overflow: 'hidden' }}>
        {/* table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 90px 90px 80px 80px 70px 70px 70px 160px',
          padding: '10px 16px', background: '#0B0F19', borderBottom: '1px solid #1F2937',
          fontSize: 12, color: '#6B7280', fontWeight: 600,
        }}>
          <span>主图</span>
          <span>商品信息</span>
          <span style={{ textAlign: 'right' }}>售价</span>
          <span style={{ textAlign: 'right' }}>成本价</span>
          <span style={{ textAlign: 'right' }}>毛利率</span>
          <span style={{ textAlign: 'right' }}>让利</span>
          <span style={{ textAlign: 'right' }}>让利%</span>
          <span style={{ textAlign: 'center' }}>销量</span>
          <span style={{ textAlign: 'center' }}>状态</span>
          <span style={{ textAlign: 'center' }}>操作</span>
        </div>

        {filtered.map(p => {
          const marginStr  = calcMargin(p.price, p.cost_price)
          const marginNum  = Number(marginStr.replace('%',''))
          const marginColor = isNaN(marginNum) ? '#9CA3AF' : marginNum >= 50 ? '#10B981' : marginNum >= 30 ? '#F59E0B' : '#EF4444'
          const profitStr  = calcRangLi(p.price, p.original_price)
          const hasMedia   = (p.sub_images && p.sub_images.length > 0) || p.video_url
          return (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 90px 90px 80px 80px 70px 70px 70px 160px',
              padding: '12px 16px', alignItems: 'center',
              borderBottom: '1px solid #1F2937', fontSize: 13, color: '#9CA3AF',
            }}>
              {/* 主图 */}
              <div style={{ position: 'relative' }}>
                {p.main_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.main_image} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', background: '#1F2937' }} />
                ) : (
                  <div style={{ width: 64, height: 64, background: '#1F2937', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#6B7280' }}>无图</div>
                )}
                {/* 副图/视频指示点 */}
                {hasMedia && (
                  <div style={{ position: 'absolute', bottom: -2, right: 2, display: 'flex', gap: 2 }}>
                    {p.sub_images && p.sub_images.length > 0 && (
                      <span style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 4 }}>图{p.sub_images.length}</span>
                    )}
                    {p.video_url && (
                      <span style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 4 }}>视频</span>
                    )}
                  </div>
                )}
              </div>

              {/* info */}
              <div>
                <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 500, margin: 0 }}>{p.name}</p>
                <p style={{ color: '#6B7280', fontSize: 11, margin: '2px 0 0' }}>编号: {p.id.slice(0, 8)}</p>
                {/* 副图预览缩略图 */}
                {p.sub_images && p.sub_images.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                    {p.sub_images.slice(0, 3).map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={img} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} />
                    ))}
                    {p.sub_images.length > 3 && <span style={{ color: '#6B7280', fontSize: 10, lineHeight: '22px' }}>+{p.sub_images.length - 3}</span>}
                  </div>
                )}
                {/* 详情图片数量指示 */}
                {p.detail_images && p.detail_images.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ background: 'rgba(99,102,241,0.2)', color: '#818CF8', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
                      详情图 {p.detail_images.length} 张
                    </span>
                  </div>
                )}
              </div>

              {/* price */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#EF4444', fontWeight: 600 }}>¥{p.price}</span>
                {p.original_price && <span style={{ color: '#6B7280', fontSize: 11, textDecoration: 'line-through', marginLeft: 4 }}>¥{p.original_price}</span>}
              </div>
              {/* cost */}
              <div style={{ textAlign: 'right', color: p.cost_price ? '#F59E0B' : '#4B5563' }}>
                {p.cost_price ? `¥${p.cost_price}` : '-'}
              </div>
              {/* margin */}
              <div style={{ textAlign: 'right', fontWeight: 600, color: marginColor }}>{marginStr}</div>
              {/* profit amount */}
              <div style={{ textAlign: 'right', color: p.original_price && p.original_price > p.price ? '#06B6D4' : '#4B5563' }}>{profitStr}</div>
              {/* discount rate % */}
              <div style={{ textAlign: 'right', fontWeight: 600, color: p.discount_rate && p.discount_rate > 0 ? '#8B5CF6' : '#4B5563' }}>
                {p.discount_rate != null && p.discount_rate > 0 ? p.discount_rate + '%' : '-'}
              </div>
              {/* sales */}
              <div style={{ textAlign: 'center' }}>{p.sales}</div>
              {/* status */}
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: p.status === 'online' ? 'rgba(5,150,105,0.15)' : 'rgba(220,38,38,0.15)',
                  color: p.status === 'online' ? '#059669' : '#DC2626',
                }}>
                  {p.status === 'online' ? '上架中' : '已下架'}
                </span>
              </div>
              {/* action */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button onClick={() => openEdit(p)} style={{ padding: '4px 10px', background: '#1F2937', border: '1px solid #374151', borderRadius: 4, color: '#9CA3AF', cursor: 'pointer', fontSize: 12 }}>编辑</button>
                <button onClick={() => toggleStatus(p.id)} style={{
                  padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  background: p.status === 'online' ? 'rgba(220,38,38,0.1)' : 'rgba(5,150,105,0.1)',
                  border: `1px solid ${p.status === 'online' ? '#DC2626' : '#059669'}`,
                  color: p.status === 'online' ? '#DC2626' : '#059669',
                }}>
                  {p.status === 'online' ? '下架' : '上架'}
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #DC2626', borderRadius: 4, color: '#DC2626', cursor: 'pointer', fontSize: 12 }}>删除</button>
              </div>
            </div>
          )
        })}
        {!filtered.length && <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>暂无商品数据</div>}
      </div>

      {/* add/edit modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={closeModal}>
          <div style={{ background: '#111827', borderRadius: 16, padding: 24, width: 600, border: '1px solid #1F2937', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#E5E7EB', margin: '0 0 20px', fontSize: 16 }}>{editing ? '编辑商品' : '添加商品'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* ===== 主图 ===== */}
              <div>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>主图 *</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  {form.main_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.main_image} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid #374151' }} />
                  ) : (
                    <div style={{ width: 80, height: 80, background: '#0B0F19', borderRadius: 8, border: '1px dashed #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 11 }}>无主图</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => mainImgRef.current?.click()} style={{ padding: '6px 14px', background: '#1F2937', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', cursor: 'pointer', fontSize: 13 }}>
                      {form.main_image ? '更换主图' : '上传主图'}
                    </button>
                    {form.main_image && (
                      <button onClick={() => setForm(f => ({ ...f, main_image: '' }))} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #DC2626', borderRadius: 6, color: '#DC2626', cursor: 'pointer', fontSize: 12 }}>移除</button>
                    )}
                  </div>
                  <input ref={mainImgRef} type="file" accept="image/*" onChange={handleMainImgChange} style={{ display: 'none' }} />
                </div>
              </div>

              {/* ===== 副图（最多9张） ===== */}
              <div>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>副图（最多9张）</span>
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {form.sub_images.map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid #374151' }} />
                        <button onClick={() => removeSubImg(i)} style={{
                          position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          background: '#DC2626', border: 'none', borderRadius: '50%', color: '#fff',
                          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        }}>×</button>
                      </div>
                    ))}
                    {form.sub_images.length < 9 && (
                      <div onClick={() => subImgRef.current?.click()} style={{
                        width: 64, height: 64, background: '#0B0F19', border: '1px dashed #374151',
                        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#6B7280', fontSize: 22, cursor: 'pointer',
                      }}>+</div>
                    )}
                  </div>
                  <input ref={subImgRef} type="file" accept="image/*" multiple onChange={handleSubImgChange} style={{ display: 'none' }} />
                  <span style={{ color: '#6B7280', fontSize: 11 }}>已选 {form.sub_images.length}/9 张，支持 JPG/PNG，单张 ≤ 2MB</span>
                </div>
              </div>

              {/* ===== 视频 ===== */}
              <div>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>商品视频（可选）</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  {form.video_url ? (
                    <div style={{ position: 'relative' }}>
                      // eslint-disable-next-line @next/next/no-img-element
                      <video src={form.video_url} style={{ width: 120, height: 72, borderRadius: 8, background: '#000' }} muted />
                      <button onClick={() => setForm(f => ({ ...f, video_url: '' }))} style={{
                        position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                        background: '#DC2626', border: 'none', borderRadius: '50%', color: '#fff',
                        fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}>×</button>
                    </div>
                  ) : (
                    <button onClick={() => videoRef.current?.click()} style={{ padding: '8px 16px', background: '#1F2937', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', cursor: 'pointer', fontSize: 13 }}>上传视频</button>
                  )}
                  <input ref={videoRef} type="file" accept="video/*" onChange={handleVideoChange} style={{ display: 'none' }} />
                  <span style={{ color: '#6B7280', fontSize: 11 }}>支持 MP4/MOV，≤ 50MB</span>
                </div>
              </div>

              {/* ===== 详情图片（商品详情页展示） ===== */}
              <div>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>详情图片（商品详情页展示，最多20张）</span>
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {form.detail_images.map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={img} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid #374151' }} />
                        <button onClick={() => removeDetailImg(i)} style={{
                          position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          background: '#DC2626', border: 'none', borderRadius: '50%', color: '#fff',
                          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        }}>×</button>
                      </div>
                    ))}
                    {form.detail_images.length < 20 && (
                      <div onClick={() => detailRef.current?.click()} style={{
                        width: 80, height: 80, background: '#0B0F19', border: '1px dashed #374151',
                        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#6B7280', fontSize: 22, cursor: 'pointer',
                      }}>+</div>
                    )}
                  </div>
                  <input ref={detailRef} type="file" accept="image/*" multiple onChange={handleDetailImgChange} style={{ display: 'none' }} />
                  <span style={{ color: '#6B7280', fontSize: 11 }}>已选 {form.detail_images.length}/20 张，支持 JPG/PNG，按上传顺序排列，将在商品详情页依次展示</span>
                </div>
              </div>

              {/* ===== 商品信息表单 ===== */}
              <label>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>商品名称 *</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="请输入商品名称" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
              </label>
              <label>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>商品描述</span>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="请输入商品描述" rows={3} style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: '#9CA3AF', fontSize: 13 }}>售价 *</span>
                  <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} type="number" placeholder="0.00" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
                </label>
                <label>
                  <span style={{ color: '#9CA3AF', fontSize: 13 }}>原价（划线价）</span>
                  <input value={form.original_price} onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))} type="number" placeholder="0.00" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: '#9CA3AF', fontSize: 13 }}>成本价 *</span>
                  <input value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} type="number" placeholder="0.00" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
                  <span style={{ color: '#6B7280', fontSize: 11 }}>用于计算毛利率</span>
                </label>
                <label>
                  <span style={{ color: '#9CA3AF', fontSize: 13 }}>库存 *</span>
                  <input value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} type="number" placeholder="0" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
                </label>
              </div>
              {/* 让利% */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: '#9CA3AF', fontSize: 13 }}>商品让利 %</span>
                  <input value={form.discount_rate} onChange={e => setForm(f => ({ ...f, discount_rate: e.target.value }))} type="number" placeholder="0" min={0} max={100} style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
                  <span style={{ color: '#6B7280', fontSize: 11 }}>用户端显示让利标签（如"立减33%"）</span>
                </label>
              </div>
              {/* real-time margin preview */}
              {form.price && form.cost_price && (
                <div style={{ background: '#0B0F19', borderRadius: 8, padding: '10px 14px', border: '1px solid #1F2937' }}>
                  <span style={{ color: '#6B7280', fontSize: 12 }}>毛利率预览：</span>
                  {(() => {
                    const m  = (Number(form.price) - Number(form.cost_price)) / Number(form.price) * 100
                    const mc = isNaN(m) ? '#9CA3AF' : m >= 50 ? '#10B981' : m >= 30 ? '#F59E0B' : '#EF4444'
                    return <span style={{ color: mc, fontWeight: 700, fontSize: 16, marginLeft: 8 }}>{isNaN(m) ? '-' : m.toFixed(1) + '%'}</span>
                  })()}
                  <span style={{ color: '#6B7280', fontSize: 11, marginLeft: 12 }}>
                    单件利润: ¥{((Number(form.price) - Number(form.cost_price)) || 0).toFixed(1)}
                  </span>
                  {form.original_price && Number(form.original_price) > Number(form.price) && (
                    <span style={{ color: '#06B6D4', fontSize: 11, marginLeft: 12 }}>
                      让利金额: ¥{(Number(form.original_price) - Number(form.price)).toFixed(1)}
                    </span>
                  )}
                  {form.discount_rate && Number(form.discount_rate) > 0 && (
                    <span style={{ color: '#8B5CF6', fontSize: 11, marginLeft: 12 }}>
                      让利标签: 立减{Number(form.discount_rate)}%
                    </span>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '8px 20px', background: 'transparent', border: '1px solid #374151', borderRadius: 8, color: '#9CA3AF', cursor: 'pointer', fontSize: 14 }}>取消</button>
              <button onClick={handleSubmit} disabled={!form.name || !form.price || !form.stock} style={{
                padding: '8px 20px',
                background: (!form.name || !form.price || !form.stock) ? '#374151' : '#059669',
                border: 'none', borderRadius: 8, color: '#fff',
                cursor: (!form.name || !form.price || !form.stock) ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
              }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
