import { useEffect, useState, useRef } from 'react'
import type { Product } from '@/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { localCompileEmotion, recommendDimensions } from '@/utils/emotion'
import { INGREDIENT_DICT, matchIngredientKeys, SHIYANG_DISCLAIMER } from '@/utils/shiyang'
import { NATURE_SCALE, CROWD_OPTIONS, SCENE_OPTIONS, FOOD_CATEGORIES } from '@/utils/food-therapy-tags'

interface ProductWithExt extends Product {
  status: 'online' | 'offline'
  sales: number
  // 真实销量/营收：从 order_items 聚合得到（products 表无 sales 列，原代码读到 undefined→0）
  revenue?: number
}

// 仅已付款/完成订单计入商品收益（与数据分析页 merchant.ts 的 REVENUE_STATUSES 对齐）
const REVENUE_STATUSES = ['pending_ship', 'pending_receive', 'pending_review', 'completed']

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
    id: '1', store_id: 'store-1', name: '云南高山古树普洱茶 357g', description: '云南古树普洱，陈化5年，汤色红浓明亮，滋味醇厚回甘。每一饼茶都经过严格筛选，确保品质稳定。适合长期储藏，越陈越香。',
    price: 268, original_price: 398, image_url: null,
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
    discount_rate: 33, review_status: 'approved', created_at: '2026-06-15',
  },
  {
    id: '2', store_id: 'store-1', name: '手工红糖姜茶 15包装', description: '云南手工红糖+老姜，暖胃驱寒，独立小包装，方便携带。精选优质红糖和老姜，传统工艺制作，无添加防腐剂。',
    price: 39.9, original_price: 59.9, image_url: null,
    main_image: 'https://img.icons8.com/color/96/000000/honey.png',
    sub_images: [],
    detail_images: [
      'https://img.icons8.com/color/96/000000/honey.png',
      'https://img.icons8.com/color/96/000000/ginger.png',
    ],
    video_url: '',
    category_id: 'cat-2', status: 'online', stock: 500, sales: 1024, is_active: true, cost_price: 18,
    discount_rate: 33, review_status: 'approved', created_at: '2026-06-10',
  },
  {
    id: '3', store_id: 'store-1', name: '野生菌汤包 煲汤食材 150g', description: '云南野生菌组合，煲汤佳品，含牛肝菌、鸡油菌、松茸等优质野生菌，营养丰富，味道鲜美。',
    price: 88, original_price: 128, image_url: null,
    main_image: '',
    sub_images: [],
    detail_images: [],
    video_url: '',
    category_id: 'cat-3', status: 'offline', stock: 80, sales: 56, is_active: false, cost_price: 45,
    discount_rate: 31, review_status: 'pending', created_at: '2026-06-05',
  },
  {
    id: '4', store_id: 'store-1', name: '傣族手工鲜花饼 礼盒装', description: '云南鲜花饼，现做现发20枚，选用云南食用玫瑰，皮薄馅多，花香浓郁，甜而不腻。',
    price: 68, original_price: 98, image_url: null,
    main_image: 'https://img.icons8.com/color/96/000000/cake.png',
    sub_images: [],
    detail_images: [
      'https://img.icons8.com/color/96/000000/cake.png',
    ],
    video_url: '',
    category_id: 'cat-4', status: 'online', stock: 200, sales: 789, is_active: true, cost_price: 32,
    discount_rate: 31, review_status: 'approved', created_at: '2026-05-28',
  },
  {
    id: '5', store_id: 'store-1', name: '云南小粒咖啡豆 烘焙熟豆 500g', description: '普洱小粒咖啡，中度烘焙，花果香明显，酸度适中，余韵悠长。产地直供，新鲜烘焙。',
    price: 128, original_price: 168, image_url: null,
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
    discount_rate: 24, review_status: 'pending', created_at: '2026-05-20',
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
  const { profile, useMock } = useAuth()
  const [list, setList] = useState<ProductWithExt[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [storeCategory, setStoreCategory] = useState<string | null>(null)
  const [storeRefEnabled, setStoreRefEnabled] = useState(false)
  const [emotionFlash, setEmotionFlash] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProductWithExt | null>(null)
  const [form, setForm] = useState({
    name: '', price: '', original_price: '', cost_price: '', stock: '', desc: '',
    main_image: '', sub_images: [] as string[], detail_images: [] as string[], video_url: '',
    discount_rate: '',
    ingredients: [] as string[],
    // 食材食疗智能导购属性
    overall_nature: '',
    health_tag: [] as string[],
    emotion_tag: [] as string[],
    match_goods: [] as string[],
    conflict_goods: [] as string[],
    aux_remind: '',
    // 00104：商品食疗智能系统完整录入
    food_category: '',
    positive_effect: '',
    risk_warning: '',
    emotion_copy: '',
    scenes: [] as string[],
    rec_crowds: [] as string[],
    cautious_crowds: [] as string[],
    cautious_notes: '',
    forbidden_crowds: [] as string[],
    forbidden_reasons: '',
    combo_product_ids: [] as string[],
    guide_sentence: '',
    moments_copy: '',
    taboo_warning: '',
  })
  const mainImgRef   = useRef<HTMLInputElement>(null)
  const subImgRef    = useRef<HTMLInputElement>(null)
  const detailRef    = useRef<HTMLInputElement>(null)
  const videoRef     = useRef<HTMLInputElement>(null)

  // 判断是否有商家权限
  const isMerchantUser = profile?.merchant_status === 'approved' || profile?.role === 'merchant'
  const [customScene, setCustomScene] = useState('')

  // 获取当前商家的 store_id
  useEffect(() => {
    if (!profile || !isMerchantUser) return
    if (useMock) { setStoreId(null); return }
    const fetchStore = async () => {
      const { data } = await supabase
        .from('stores')
        .select('id, category, referral_rate_enabled')
        .eq('owner_id', profile.id)
        .maybeSingle()
      setStoreId(data?.id ?? null)
      setStoreCategory(data?.category ?? null)
      setStoreRefEnabled(data?.referral_rate_enabled ?? false)
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

      // 从真实订单明细聚合每个商品的销量与营收（products 表无 sales 列，须从 order_items 推导）
      let items: any[] = []
      try {
        const { data: itemData } = await supabase
          .from('order_items')
          .select('product_id, price, quantity, orders!inner(store_id, status)')
          .eq('orders.store_id', storeId || '')
          .in('orders.status', REVENUE_STATUSES)
        items = itemData || []
      } catch (ie) {
        console.warn('[Products] 订单明细聚合失败，销量/营收置 0:', ie)
      }
      const agg: Record<string, { sales: number; revenue: number }> = {}
      ;(items || []).forEach((it: any) => {
        const pid = it.product_id
        if (!pid) return
        if (!agg[pid]) agg[pid] = { sales: 0, revenue: 0 }
        const qty = Number(it.quantity || 0)
        agg[pid].sales += qty
        agg[pid].revenue += Number(it.price || 0) * qty
      })

      setList((data ?? []).map(p => ({
        ...p,
        status: p.is_active ? 'online' : 'offline',
        sales: agg[p.id]?.sales ?? 0,
        revenue: agg[p.id]?.revenue ?? 0,
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
    if (!useMock) {
      if (!storeId) {
        window.alert('未找到关联门店，无法修改上架状态。')
        return
      }
      const { error } = await supabase.from('products').update({ is_active: newActive }).eq('id', id)
      if (error) {
        window.alert(`上架状态更新失败：\n${error.message}${error.hint ? '\n提示：' + error.hint : ''}`)
        console.warn('[Products] 更新状态失败:', error); return
      }
    }
    setList(prev => prev.map(p => p.id === id ? { ...p, is_active: newActive, status: (newActive ? 'online' : 'offline') as 'online' | 'offline' } : p))
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', price: '', original_price: '', cost_price: '', stock: '', desc: '', main_image: '', sub_images: [], detail_images: [], video_url: '', discount_rate: '', ingredients: [],
      overall_nature: '', health_tag: [], emotion_tag: [], match_goods: [], conflict_goods: [], aux_remind: '',
      food_category: '', positive_effect: '', risk_warning: '', emotion_copy: '', scenes: [],
      rec_crowds: [], cautious_crowds: [], cautious_notes: '', forbidden_crowds: [], forbidden_reasons: '',
      combo_product_ids: [], guide_sentence: '', moments_copy: '', taboo_warning: '' })
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
      ingredients: p.ingredients ?? [],
      overall_nature: p.overall_nature ?? '',
      health_tag: p.health_tag ?? [],
      emotion_tag: p.emotion_tag ?? [],
      match_goods: p.match_goods ?? [],
      conflict_goods: p.conflict_goods ?? [],
      aux_remind: p.aux_remind ?? '',
      food_category: (p as any).food_category ?? '',
      positive_effect: (p as any).positive_effect ?? '',
      risk_warning: (p as any).risk_warning ?? '',
      emotion_copy: (p as any).emotion_copy ?? '',
      scenes: (p as any).scenes ?? [],
      rec_crowds: (p as any).rec_crowds ?? [],
      cautious_crowds: (p as any).cautious_crowds ?? [],
      cautious_notes: (p as any).cautious_notes ?? '',
      forbidden_crowds: (p as any).forbidden_crowds ?? [],
      forbidden_reasons: (p as any).forbidden_reasons ?? '',
      combo_product_ids: (p as any).combo_product_ids ?? [],
      guide_sentence: (p as any).guide_sentence ?? '',
      moments_copy: (p as any).moments_copy ?? '',
      taboo_warning: (p as any).taboo_warning ?? '',
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

  // 原料成分：勾选 / 取消某个食材 key
  const toggleIngredient = (key: string) => {
    setForm(f => {
      const has = f.ingredients.includes(key)
      return { ...f, ingredients: has ? f.ingredients.filter(k => k !== key) : [...f.ingredients, key] }
    })
  }
  // 智能识别：按商品名匹配食材 key
  const autoDetectIngredients = () => {
    const keys = matchIngredientKeys(form.name)
    setForm(f => ({ ...f, ingredients: Array.from(new Set([...f.ingredients, ...keys])) }))
  }
  // 通用多选数组 toggle（场景 / 三类人群 / 升单套餐）
  const toggleArr = (key: 'scenes' | 'rec_crowds' | 'cautious_crowds' | 'forbidden_crowds' | 'combo_product_ids', val: string) => {
    setForm(f => {
      const arr = f[key] as string[]
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  const handleSubmit = async () => {
    const cost = Number(form.cost_price) || 0
    const dr = Number(form.discount_rate) || 0
    const payload = {
      name: form.name,
      price: Number(form.price),
      original_price: Number(form.original_price),
      cost_price: cost || null,
      stock: Number(form.stock),
      description: form.desc,
      main_image: form.main_image,
      sub_images: form.sub_images,
      detail_images: form.detail_images,
      video_url: form.video_url,
      discount_rate: dr || null,
    }
    const body = {
      ...payload,
      ingredients: form.ingredients.length > 0 ? form.ingredients : null,
      // 食材食疗智能导购属性（迁移 00100_food_therapy_fields.sql）
      overall_nature: form.overall_nature || null,
      health_tag: form.health_tag.length ? form.health_tag : null,
      emotion_tag: form.emotion_tag.length ? form.emotion_tag : null,
      match_goods: form.match_goods.length ? form.match_goods : null,
      conflict_goods: form.conflict_goods.length ? form.conflict_goods : null,
      aux_remind: form.aux_remind || null,
      // 00104：商品食疗智能系统完整录入
      food_category: form.food_category || null,
      positive_effect: form.positive_effect || null,
      risk_warning: form.risk_warning || null,
      emotion_copy: form.emotion_copy || null,
      scenes: form.scenes.length ? form.scenes : null,
      rec_crowds: form.rec_crowds.length ? form.rec_crowds : null,
      cautious_crowds: form.cautious_crowds.length ? form.cautious_crowds : null,
      cautious_notes: form.cautious_notes || null,
      forbidden_crowds: form.forbidden_crowds.length ? form.forbidden_crowds : null,
      forbidden_reasons: form.forbidden_reasons || null,
      combo_product_ids: form.combo_product_ids.length ? form.combo_product_ids : null,
      guide_sentence: form.guide_sentence || null,
      moments_copy: form.moments_copy || null,
      taboo_warning: form.taboo_warning || null,
    }
    // 真实模式：写库，保证网页版与小程序商家中心同步
    if (!useMock) {
      if (!storeId) {
        window.alert('未找到关联门店（stores.owner_id 未匹配当前账号），无法保存商品。\n请确认：①本账号已通过商家审核；②门店 owner_id 已设为当前登录账号。')
        return
      }
      const persist = (b: any) =>
        editing
          ? supabase.from('products').update(b).eq('id', editing.id)
          : supabase.from('products').insert({
              ...b,
              store_id: storeId,
              review_status: 'pending',
              is_active: false,
              created_at: new Date().toISOString().slice(0, 10),
            })
      try {
        const { error } = await persist(body)
        if (error) throw error
      } catch (e: any) {
        const msg = e?.message || ''
        // 软降级：若 products 表尚未加导购相关列（迁移 00090 / 00100 / 00104 未执行），
        // 或部分核心列缺失，剥离后重试，保证保存不失败（与小程序端 api.ts 一致）
        if (/column|status|sales|ingredients|overall_nature|health_tag|emotion_tag|match_goods|conflict_goods|aux_remind|food_category|positive_effect|risk_warning|emotion_copy|scenes|rec_crowds|cautious_crowds|cautious_notes|forbidden_crowds|forbidden_reasons|combo_product_ids|guide_sentence|moments_copy|taboo_warning/.test(msg)) {
          const { ingredients, overall_nature, health_tag, emotion_tag, match_goods, conflict_goods, aux_remind,
            food_category, positive_effect, risk_warning, emotion_copy, scenes, rec_crowds, cautious_crowds,
            cautious_notes, forbidden_crowds, forbidden_reasons, combo_product_ids, guide_sentence, moments_copy,
            taboo_warning, ...rest } = body
          const { error } = await persist(rest)
          if (error) {
            window.alert(`保存失败（已尝试剥离可选列仍失败）：\n${error.message}${error.hint ? '\n提示：' + error.hint : ''}`)
            console.error('[Products] 软降级仍失败:', error); return
          }
          console.warn('[Products] 已软降级保存（忽略食疗导购/部分列，请在本机执行迁移 00100/00104 加列）')
        } else {
          window.alert(`保存失败：\n${msg}${e?.hint ? '\n提示：' + e.hint : ''}`)
          console.error('[Products] 保存失败:', e); return
        }
      }
    }
    // 本地 state 同步（无论 mock 还是真实都更新显示）
    if (editing) {
      setList(prev => prev.map(p => p.id === editing.id ? { ...p, ...body } : p))
    } else {
      const newP: ProductWithExt = {
        id: `new-${Date.now()}`, store_id: storeId || 'store-1', ...body,
        image_url: null,
        category_id: '',
        status: 'offline',
        review_status: 'pending',
        sales: 0,
        is_active: false,
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

  // 情绪编译：调 emotion-compile Edge Function，把商品编译为情绪化叙事（结果写入 product_emotion 缓存）
  const handleCompileEmotion = async (p: ProductWithExt) => {
    try {
      const { data, error } = await supabase.functions.invoke('emotion-compile', {
        body: {
          mode: 'compile',
          product_id: useMock ? undefined : p.id,
          name: p.name,
          description: p.description || '',
          category: storeCategory || undefined,
        },
      })
      if (error) {
        // 云端函数未部署/不可用时，前端本地规则兜底，保证编译不失败
        const rec = recommendDimensions(p.description || '')
        const local = localCompileEmotion({ name: p.name, description: p.description || '', selected: rec })
        setEmotionFlash(`⚠️ 云端函数未部署，已用本地规则生成：\n${local.emotion_title}\n${local.emotion_detail}`)
      } else if (data) {
        setEmotionFlash(`✨ ${data.emotion_title || ''}\n${data.emotion_detail || ''}${data.compiled_by ? `（${data.compiled_by}）` : ''}`)
      }
      setTimeout(() => setEmotionFlash(null), 7000)
    } catch (e: any) {
      setEmotionFlash('编译异常：' + String(e?.message || e))
      setTimeout(() => setEmotionFlash(null), 7000)
    }
  }

  const totalCost    = list.reduce((s, p) => s + (p.cost_price || 0) * p.sales, 0)
  // 营收取 order_items 聚合值（revenue）；Mock 商品无 revenue 时回退 price*sales
  const totalRevenue = list.reduce((s, p) => s + (p.revenue ?? (p.price * p.sales)), 0)
  const totalProfit  = list.reduce((s, p) => s + ((p.revenue ?? (p.price * p.sales)) - (p.cost_price || 0) * p.sales), 0)
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

      {/* 情绪编译结果 toast */}
      {emotionFlash && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          maxWidth: 520, background: '#1E1B4B', border: '1px solid #6366F1', borderRadius: 12,
          padding: '14px 18px', color: '#E0E7FF', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}>
          {emotionFlash}
        </div>
      )}

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
                {/* 食疗导购配置指示 */}
                {(p.overall_nature || (p.health_tag && p.health_tag.length) || (p.emotion_tag && p.emotion_tag.length)) && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ background: 'rgba(16,185,129,0.18)', color: '#34D399', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
                      导购已配
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
                <button onClick={() => handleCompileEmotion(p)} style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.15)', border: '1px solid #6366F1', borderRadius: 4, color: '#A5B4FC', cursor: 'pointer', fontSize: 12 }}>情绪编译</button>
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
                  {Number(form.discount_rate) > 0 && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12,
                      background: storeRefEnabled ? 'rgba(194,65,12,0.12)' : 'rgba(59,130,246,0.12)',
                      border: `1px solid ${storeRefEnabled ? '#C2410C' : '#3B82F6'}`,
                      color: storeRefEnabled ? '#C2410C' : '#3B82F6' }}>
                      {storeRefEnabled
                        ? `提示：该店已开启「整体让利」，商品让利 ${form.discount_rate}% 将与门店默认让利率按金额加权合并计算，不会叠加放大。`
                        : `提示：该店「整体让利」已关闭，此商品让利 ${form.discount_rate}% 为唯一让利来源（无商品让利则该单让利为 0）。`}
                    </div>
                  )}
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

            {/* 商品分类（spec 基础信息区） */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ color: '#9CA3AF', fontSize: 13 }}>商品分类</span>
              <select value={form.food_category} onChange={e => setForm(f => ({ ...f, food_category: e.target.value }))}
                style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">未分类</option>
                {FOOD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{ color: '#6B7280', fontSize: 11 }}>粉面 / 炖汤 / 热饮 / 小菜，驱动食疗导购分类筛选</span>
            </div>

            {/* 🥗 原料成分分析（可选） */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>🥗 原料成分分析（可选）</span>
                <button type="button" onClick={autoDetectIngredients} disabled={!form.name}
                  style={{ padding: '6px 14px', background: (!form.name) ? '#374151' : '#1F2937', border: '1px solid #374151', borderRadius: 8, color: (!form.name) ? '#6B7280' : '#E5E7EB', cursor: (!form.name) ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                  智能识别
                </button>
              </div>
              <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 8px' }}>根据商品名自动识别食材，匹配食养成分（性味 / 功效 / 适合人群 / 场景）。</p>
              {form.ingredients.length === 0 ? (
                <div style={{ color: '#6B7280', fontSize: 13, padding: '12px', background: '#0B0F19', border: '1px dashed #374151', borderRadius: 8 }}>尚未选择原料，可点「智能识别」或下方手动勾选。</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {form.ingredients.map((key: string) => {
                    const e = INGREDIENT_DICT[key]
                    if (!e) return null
                    return (
                      <span key={key} onClick={() => toggleIngredient(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 999, cursor: 'pointer', fontSize: 13, color: '#E5E7EB' }}>
                        <span>{e.icon} {e.zh}</span>
                        <span style={{ color: '#6B7280' }}>×</span>
                      </span>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(INGREDIENT_DICT).map(([key, e]) => {
                  const active = form.ingredients.includes(key)
                  return (
                    <button key={key} type="button" onClick={() => toggleIngredient(key)}
                      style={{ padding: '4px 10px', background: active ? '#065F46' : '#0B0F19', border: `1px solid ${active ? '#059669' : '#374151'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : '#9CA3AF' }}>
                      {e.icon} {e.zh}
                    </button>
                  )
                })}
              </div>
              <p style={{ color: '#4B5563', fontSize: 11, margin: '8px 0 0' }}>{SHIYANG_DISCLAIMER}</p>
            </div>

            {/* 🍵 商品食疗智能系统 · 完整录入（商家一次录入，前端自动匹配） */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>🍵 商品食疗智能系统（录入后前端自动匹配）</span>
                <span style={{ color: '#6B7280', fontSize: 12 }}>填全后，小程序端筛选三栏、详情六模块即基于真实数据</span>
              </div>

              {/* 整体性味（系统自动计算适配逻辑用） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>整体性味</span>
                <select value={form.overall_nature} onChange={e => setForm(f => ({ ...f, overall_nature: e.target.value }))}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }}>
                  <option value="">未设置（将按原料自动聚合）</option>
                  {NATURE_SCALE.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ color: '#6B7280', fontSize: 11 }}>由凉到热：大寒 / 寒凉 / 平性 / 微温 / 温热 / 大热（系统据此绑定场景/人群）</span>
              </div>

              {/* 食疗滋养效果：正向 + 风险 分离 */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>正向调理作用</span>
                <textarea value={form.positive_effect} onChange={e => setForm(f => ({ ...f, positive_effect: e.target.value }))} placeholder="如：补气养血、改善气虚乏力；温热滋补" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>食用风险提示</span>
                <textarea value={form.risk_warning} onChange={e => setForm(f => ({ ...f, risk_warning: e.target.value }))} placeholder="如：上火、经期量大人群会加重不适" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                <span style={{ color: '#6B7280', fontSize: 11 }}>与正向作用分开填写，详情页分别展示</span>
              </div>

              {/* 情绪价值文案（固定三段式模板填空） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>情绪价值文案（三段式）</span>
                <textarea value={form.emotion_copy} onChange={e => setForm(f => ({ ...f, emotion_copy: e.target.value }))} placeholder={'第一段：热汤通体暖意\n第二段：治愈经期低落\n第三段：犒劳长期疲惫的自己'} rows={3}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                <span style={{ color: '#6B7280', fontSize: 11 }}>温暖陪伴 / 治愈低落 / 犒劳自己，三段换行填写</span>
              </div>

              {/* 适配消费场景（预设 + 自定义） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>适配消费场景（多选 + 可补充）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {SCENE_OPTIONS.map(s => {
                    const active = form.scenes.includes(s)
                    return (
                      <button key={s} type="button" onClick={() => toggleArr('scenes', s)}
                        style={{ padding: '4px 10px', background: active ? '#065F46' : '#0B0F19', border: `1px solid ${active ? '#059669' : '#374151'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : '#9CA3AF' }}>
                        {s}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={customScene} onChange={e => setCustomScene(e.target.value)} placeholder="补充自定义场景，如：出差途中" style={{ flex: 1, padding: '6px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                  <button type="button" disabled={!customScene.trim()} onClick={() => { if (customScene.trim()) { toggleArr('scenes', customScene.trim()); setCustomScene('') } }}
                    style={{ padding: '6px 14px', background: customScene.trim() ? '#1F2937' : '#374151', border: '1px solid #374151', borderRadius: 8, color: customScene.trim() ? '#E5E7EB' : '#6B7280', cursor: customScene.trim() ? 'pointer' : 'not-allowed', fontSize: 13 }}>添加</button>
                </div>
                {form.scenes.length > 0 && (
                  <div style={{ marginTop: 6, color: '#34D399', fontSize: 12 }}>已选：{form.scenes.join('、')}</div>
                )}
              </div>

              {/* 人群标签配置：①五星推荐 ②谨慎+说明 ③禁止+原因 */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>① 五星推荐人群（多选）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {CROWD_OPTIONS.map(c => {
                    const active = form.rec_crowds.includes(c)
                    return (
                      <button key={c} type="button" onClick={() => toggleArr('rec_crowds', c)}
                        style={{ padding: '4px 10px', background: active ? '#065F46' : '#0B0F19', border: `1px solid ${active ? '#059669' : '#374151'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : '#9CA3AF' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>② 谨慎食用人群（多选）+ 限制说明</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {CROWD_OPTIONS.map(c => {
                    const active = form.cautious_crowds.includes(c)
                    return (
                      <button key={c} type="button" onClick={() => toggleArr('cautious_crowds', c)}
                        style={{ padding: '4px 10px', background: active ? '#B45309' : '#0B0F19', border: `1px solid ${active ? '#D97706' : '#374151'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#FEF3C7' : '#9CA3AF' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
                <textarea value={form.cautious_notes} onChange={e => setForm(f => ({ ...f, cautious_notes: e.target.value }))} placeholder="如：少量饮用、去辣减油" rows={2}
                  style={{ width: '100%', marginTop: 6, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>③ 禁止食用人群（多选）+ 风险原因</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {CROWD_OPTIONS.map(c => {
                    const active = form.forbidden_crowds.includes(c)
                    return (
                      <button key={c} type="button" onClick={() => toggleArr('forbidden_crowds', c)}
                        style={{ padding: '4px 10px', background: active ? '#7F1D1D' : '#0B0F19', border: `1px solid ${active ? '#DC2626' : '#374151'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#FECACA' : '#9CA3AF' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
                <textarea value={form.forbidden_reasons} onChange={e => setForm(f => ({ ...f, forbidden_reasons: e.target.value }))} placeholder="如：加重不适、诱发痛风" rows={2}
                  style={{ width: '100%', marginTop: 6, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* 门店营销配套录入区 */}
              <div style={{ borderTop: '1px solid #1F2937', paddingTop: 14, marginTop: 4 }}>
                <span style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>🏪 门店营销配套（自动同步前端 / 海报 / 导购）</span>
              </div>
              <div style={{ marginBottom: 14, marginTop: 10 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>店内升单搭配套餐（绑定其他商品）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {list.filter(p => p.id !== (editing?.id)).map(p => {
                    const active = form.combo_product_ids.includes(p.id)
                    return (
                      <button key={p.id} type="button" onClick={() => toggleArr('combo_product_ids', p.id)}
                        style={{ padding: '4px 10px', background: active ? '#065F46' : '#0B0F19', border: `1px solid ${active ? '#059669' : '#374151'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : '#9CA3AF' }}>
                        {p.name}
                      </button>
                    )
                  })}
                  {list.filter(p => p.id !== (editing?.id)).length === 0 && (
                    <span style={{ color: '#6B7280', fontSize: 12 }}>暂无其他商品可选（先创建商品）</span>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>店员导购短句</span>
                <input value={form.guide_sentence} onChange={e => setForm(f => ({ ...f, guide_sentence: e.target.value }))} placeholder="如：这碗鸡汤温补，特别适合您现在的状态" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>朋友圈种草文案</span>
                <textarea value={form.moments_copy} onChange={e => setForm(f => ({ ...f, moments_copy: e.target.value }))} placeholder="如：今天被这碗鸡汤治愈了，暖到心底✨" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>忌口红字警示语</span>
                <input value={form.taboo_warning} onChange={e => setForm(f => ({ ...f, taboo_warning: e.target.value }))} placeholder="如：经期量大、痛风人群慎点" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
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
