import { useEffect, useState, useRef } from 'react'
import type { Product, StoreCategory } from '@/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getCategories, createStoreCategory, updateStoreCategory, deleteStoreCategory } from '@/api/categories'
import { getMerchantProductSales, getMyMerchantStore } from '@/api/merchant'
import { localCompileEmotion, recommendDimensions } from '@/utils/emotion'
import { INGREDIENT_DICT, matchIngredientKeys, SHIYANG_DISCLAIMER } from '@/utils/shiyang'
import { NATURE_SCALE, CROWD_OPTIONS, SCENE_OPTIONS, FOOD_CATEGORIES } from '@/utils/food-therapy-tags'
import { analyzeDish } from '@/utils/dish-analyzer'

interface ProductWithExt extends Product {
  status: 'online' | 'offline'
  sales: number
  // 真实销量/营收：从 order_items 聚合得到（products 表无 sales 列，原代码读到 undefined→0）
  revenue?: number
}

// 商品销量/营收从 order_items 聚合（服务端 RPC fn_merchant_product_sales，已支付口径）

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
  const [generating, setGenerating] = useState(false)
  const [dragOverSub, setDragOverSub] = useState(false)
  const [dragOverDetail, setDragOverDetail] = useState(false)
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
    category_id: '',
    food_stage: '',
  })
  const mainImgRef   = useRef<HTMLInputElement>(null)
  const subImgRef    = useRef<HTMLInputElement>(null)
  const detailRef    = useRef<HTMLInputElement>(null)
  const videoRef     = useRef<HTMLInputElement>(null)

  // 判断是否有自营门店权限
  const isMerchantUser = profile?.merchant_status === 'approved' || profile?.role === 'merchant'
  const [customScene, setCustomScene] = useState('')

  // —— 商品分类（store_categories：本店 + 平台全局）——
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')

  // 加载本店分类（含平台全局），仅在真实模式且已拿到 storeId 时
  useEffect(() => {
    if (useMock || !storeId) { setCategories([]); return }
    const loadCats = async () => {
      const data = await getCategories({ storeId, includeGlobal: true })
      setCategories(data)
    }
    loadCats()
  }, [useMock, storeId])

  // 获取当前商家的 store_id
  useEffect(() => {
    if (!profile || !isMerchantUser) return
    if (useMock) { setStoreId(null); return }
    const fetchStore = async () => {
      const st = await getMyMerchantStore(profile.id)
      setStoreId(st?.id ?? null)
      if (st?.id) {
        const { data } = await supabase
          .from('stores')
          .select('category, referral_rate_enabled')
          .eq('id', st.id)
          .maybeSingle()
        setStoreCategory(data?.category ?? null)
        setStoreRefEnabled(data?.referral_rate_enabled ?? false)
      }
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

      // 从真实订单明细聚合每个商品的销量与营收（服务端 RPC，避免前端万级拉取）
      let agg: Record<string, { sales: number; revenue: number }> = {}
      try {
        agg = await getMerchantProductSales(storeId || '')
      } catch (ie) {
        console.warn('[Products] 订单明细聚合失败，销量/营收置 0:', ie)
        agg = {}
      }

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
      combo_product_ids: [], guide_sentence: '', moments_copy: '', taboo_warning: '', category_id: '',
      food_stage: '' })
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
      category_id: (p as any).category_id ?? '',
      food_stage: (p as any).food_stage ?? '',
    })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditing(null) }

  // —— 商品分类管理（新建/改名/排序/删除，仅店内分类可改；全局分类只读）——
  const catNameOf = (id: string | null | undefined): string => {
    if (!id) return '未分类'
    const c = categories.find(x => x.id === id)
    return c ? c.name : '未分类'
  }

  const handleAddCategory = async () => {
    if (!storeId) { alert('未关联门店，无法新建分类'); return }
    const name = newCatName.trim()
    if (!name) { alert('请输入分类名称'); return }
    const created = await createStoreCategory({ storeId, name })
    if (!created) { alert('创建失败，请重试'); return }
    setNewCatName('')
    setCategories(await getCategories({ storeId, includeGlobal: true }))
  }

  const handleSaveRename = async (c: StoreCategory) => {
    const name = editingCatName.trim()
    if (!name) { setEditingCatId(null); return }
    await updateStoreCategory(c.id, { name })
    setEditingCatId(null)
    setCategories(await getCategories({ storeId, includeGlobal: true }))
  }

  const handleDeleteCategory = async (c: StoreCategory) => {
    if (!confirm(`确认删除「${c.name}」？该分类下商品将自动归为「未分类」。`)) return
    await deleteStoreCategory(c.id)
    if (form.category_id === c.id) setForm(f => ({ ...f, category_id: '' }))
    setCategories(await getCategories({ storeId, includeGlobal: true }))
  }

  const handleMoveCategory = async (c: StoreCategory, dir: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(x => x.id === c.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    await updateStoreCategory(c.id, { sort_order: other.sort_order })
    await updateStoreCategory(other.id, { sort_order: c.sort_order })
    setCategories(await getCategories({ storeId, includeGlobal: true }))
  }

  const catBtn: React.CSSProperties = { padding: '4px 8px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }

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
  // 食疗分析：按菜名系统拆解食材并组合生成全部食养字段（回填表单）
  const handleAnalyzeDish = () => {
    if (!form.name) return
    const r = analyzeDish(form.name, form.ingredients)
    setForm(f => ({
      ...f,
      ingredients: r.ingredients,
      food_category: r.food_category || f.food_category,
      overall_nature: r.overall_nature || f.overall_nature,
      health_tag: r.health_tag.length ? r.health_tag : f.health_tag,
      positive_effect: r.positive_effect || f.positive_effect,
      risk_warning: r.risk_warning || f.risk_warning,
      scenes: r.scenes.length ? r.scenes : f.scenes,
      rec_crowds: r.rec_crowds.length ? r.rec_crowds : f.rec_crowds,
      cautious_crowds: Array.from(new Set([...f.cautious_crowds, ...r.cautious_crowds])),
      forbidden_crowds: r.forbidden_crowds.length ? r.forbidden_crowds : f.forbidden_crowds,
    }))
  }
  // 通用多选数组 toggle（场景 / 三类人群 / 升单套餐）
  const toggleArr = (key: 'scenes' | 'rec_crowds' | 'cautious_crowds' | 'forbidden_crowds' | 'combo_product_ids', val: string) => {
    setForm(f => {
      const arr = f[key] as string[]
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  // —— 食疗文案：本地规则草稿（与小程序端同源口径，即使云端 LLM 未配置也能产出可用文案）——
  const buildRuleCopy = (f: typeof form): { guide_sentence: string; moments_copy: string; emotion_copy: string; taboo_warning: string } => {
    const name = f.name || '这款好物'
    const nature = f.overall_nature || (f.ingredients.length ? '平和' : '')
    const tags = f.health_tag.length ? f.health_tag.join('、') : (f.ingredients.length ? '日常调养' : '')
    const rec = f.rec_crowds.length ? f.rec_crowds.join('、') : '注重食养的人'
    const guide = `${name}${nature ? `性${nature}` : ''}，适合${rec}，温润好入口，食疗日常小确幸。`
    const moments = `今天被${name}暖到了。${tags ? `${tags}缓缓补回来，` : ''}把好好吃饭这件小事，过成对自己的犒赏✨`
    const emotion = `第一段：柴米油盐里，也有认真生活的证据。\n第二段：一碗${name}的温度，刚好接住疲惫的自己。\n第三段：好好吃饭，就是最朴素的爱自己。`
    const taboo = f.forbidden_crowds.length
      ? `${f.forbidden_crowds.join('、')}人群建议少量尝试或回避${f.forbidden_reasons ? '：' + f.forbidden_reasons : ''}`
      : (f.cautious_crowds.length ? `${f.cautious_crowds.join('、')}人群建议少量品鉴${f.cautious_notes ? '：' + f.cautious_notes : ''}` : '')
    return { guide_sentence: guide, moments_copy: moments, emotion_copy: emotion, taboo_warning: taboo }
  }

  // —— 合规巡检：医疗宣称词 + 违规广告词（命中则保存前提示运营确认）——
  const MEDICAL_CLAIM_WORDS = ['治疗', '治愈', '疗效', '医治', '药方', '处方', '根治', '抗癌', '抗炎', '消炎', '降压', '降糖', '遵医嘱', '诊断', '治愈率']
  const AD_ILLEGAL_WORDS = ['国家级', '最高级', '最佳', '最好', '第一', '顶级', '极品', '万能', '100%', '绝对', '唯一', '保本', '稳赚', '躺赚', '零风险', '翻倍', '升值', '中奖', '必中']
  const scanCompliance = (fields: Record<string, string>): string[] => {
    const hits: string[] = []
    for (const v of Object.values(fields)) {
      if (!v) continue
      for (const w of [...MEDICAL_CLAIM_WORDS, ...AD_ILLEGAL_WORDS]) {
        if (v.includes(w) && !hits.includes(w)) hits.push(w)
      }
    }
    return hits
  }

  // —— 拖拽读取图片为 base64 ——
  const readFilesToBase64 = async (files: FileList | File[]): Promise<string[]> => {
    const arr = Array.from(files)
    const out: string[] = []
    for (const f of arr) out.push(await fileToBase64(f))
    return out
  }
  const onDropSub = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOverSub(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    const bases = await readFilesToBase64(files)
    setForm(f => ({ ...f, sub_images: [...f.sub_images, ...bases].slice(0, 9) }))
  }
  const onDropDetail = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOverDetail(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    const bases = await readFilesToBase64(files)
    setForm(f => ({ ...f, detail_images: [...f.detail_images, ...bases].slice(0, 20) }))
  }

  // —— AI 一键生成食疗文案（复用已部署 food-therapy-ai · copy 模式，内置医疗宣称闸门）——
  const handleAIGenerate = async () => {
    if (!form.name) { window.alert('请先填写商品名称'); return }
    setGenerating(true)
    const rule = buildRuleCopy(form)
    try {
      const { data, error } = await supabase.functions.invoke('food-therapy-ai', {
        body: {
          mode: 'copy',
          name: form.name,
          nature: form.overall_nature || '',
          health_tags: form.health_tag,
          emotion_tags: form.emotion_tag,
          short_sales_word: rule.guide_sentence,
          detail_desc: rule.emotion_copy,
          circle_copy: rule.moments_copy,
          risk_tip: rule.taboo_warning,
        },
      })
      if (!error && data) {
        setForm(f => ({
          ...f,
          guide_sentence: data.short_sales_word || f.guide_sentence,
          moments_copy: data.circle_copy || f.moments_copy,
          emotion_copy: data.detail_desc || f.emotion_copy,
          taboo_warning: data.risk_tip || f.taboo_warning,
        }))
        setEmotionFlash(`✨ AI 已生成食疗文案（来源：${data.source === 'llm' ? '大模型润色' : '本地规则兜底'}）\n可在下方直接微调后再保存`)
      } else {
        setForm(f => ({ ...f, ...rule }))
        setEmotionFlash('⚠️ 云端润色未响应，已用本地规则生成文案，可直接微调')
      }
    } catch (e: any) {
      setForm(f => ({ ...f, ...rule }))
      setEmotionFlash('AI 生成异常，已用本地规则兜底：' + String(e?.message || e))
    } finally {
      setGenerating(false)
      setTimeout(() => setEmotionFlash(null), 7000)
    }
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
      category_id: form.category_id || null,
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
      food_stage: form.food_stage || null,
    }
    // 合规巡检：营销/食疗文案不得含医疗宣称词或违规广告词（命中则提示运营确认）
    const complianceHits = scanCompliance({
      guide_sentence: body.guide_sentence ?? '',
      moments_copy: body.moments_copy ?? '',
      emotion_copy: body.emotion_copy ?? '',
      positive_effect: body.positive_effect ?? '',
      risk_warning: body.risk_warning ?? '',
      taboo_warning: body.taboo_warning ?? '',
    })
    if (complianceHits.length) {
      const ok = window.confirm(
        `检测到疑似违规词：${complianceHits.join('、')}\n\n含医疗宣称 / 绝对化用语可能影响平台审核与合规，建议修改后再保存。\n\n仍要保存？`
      )
      if (!ok) return
    }
    // 真实模式：写库，保证网页版与小程序自营门店中心同步
    if (!useMock) {
      if (!storeId) {
        window.alert('未找到关联门店（stores.owner_id 未匹配当前账号），无法保存商品。\n请确认：①本账号已通过自营门店审核；②门店 owner_id 已设为当前登录账号。')
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
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>商品管理</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>管理店铺商品：上架/下架、编辑、查看成本/毛利/让利</p>
        </div>
        <button onClick={openCreate} style={{ padding: '8px 18px', background: 'var(--success-strong)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ 添加商品</button>
      </div>

      {/* 情绪编译结果 toast */}
      {emotionFlash && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          maxWidth: 520, background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 12,
          padding: '14px 18px', color: 'var(--accent-text)', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}>
          {emotionFlash}
        </div>
      )}

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '全部商品', value: list.length, color: 'var(--accent)' },
          { label: '上架中',   value: list.filter(p => p.status === 'online').length, color: 'var(--success-strong)' },
          { label: '已下架',   value: list.filter(p => p.status === 'offline').length, color: 'var(--danger)' },
          { label: '总销量',   value: list.reduce((s, p) => s + p.sales, 0), color: 'var(--warning)' },
          { label: '平均毛利率', value: avgMargin + '%', color: 'var(--info)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{c.label}</p>
            <p style={{ color: c.color, fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* biz overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '总成本', value: `¥${totalCost.toLocaleString()}`, color: 'var(--warning)' },
          { label: '总营收', value: `¥${totalRevenue.toLocaleString()}`, color: 'var(--success-strong)' },
          { label: '总利润', value: `¥${totalProfit.toLocaleString()}`, color: 'var(--info)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>{c.label}</p>
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
            background: filter === f.key ? 'var(--success-strong)' : 'var(--border)', color: filter === f.key ? '#fff' : 'var(--text-muted)',
          }}>{f.label}</button>
        ))}
      </div>

      {/* goods table */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 90px 90px 80px 80px 70px 70px 70px 160px',
          padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-dim)', fontWeight: 600,
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
          const marginColor = isNaN(marginNum) ? 'var(--text-muted)' : marginNum >= 50 ? 'var(--success-strong)' : marginNum >= 30 ? 'var(--warning)' : 'var(--danger)'
          const profitStr  = calcRangLi(p.price, p.original_price)
          const hasMedia   = (p.sub_images && p.sub_images.length > 0) || p.video_url
          return (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 90px 90px 80px 80px 70px 70px 70px 160px',
              padding: '12px 16px', alignItems: 'center',
              borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)',
            }}>
              {/* 主图 */}
              <div style={{ position: 'relative' }}>
                {p.main_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.main_image} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', background: 'var(--border)' }} />
                ) : (
                  <div style={{ width: 64, height: 64, background: 'var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-dim)' }}>无图</div>
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
                <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500, margin: 0 }}>{p.name}</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '2px 0 0' }}>编号: {p.id.slice(0, 8)} · 🏷️ {catNameOf((p as any).category_id)}</p>
                {/* 副图预览缩略图 */}
                {p.sub_images && p.sub_images.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                    {p.sub_images.slice(0, 3).map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={img} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} />
                    ))}
                    {p.sub_images.length > 3 && <span style={{ color: 'var(--text-dim)', fontSize: 10, lineHeight: '22px' }}>+{p.sub_images.length - 3}</span>}
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
                    <span style={{ background: 'rgba(16,185,129,0.18)', color: 'var(--success-strong)', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
                      导购已配
                    </span>
                  </div>
                )}
              </div>

              {/* price */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>¥{p.price}</span>
                {p.original_price && <span style={{ color: 'var(--text-dim)', fontSize: 11, textDecoration: 'line-through', marginLeft: 4 }}>¥{p.original_price}</span>}
              </div>
              {/* cost */}
              <div style={{ textAlign: 'right', color: p.cost_price ? 'var(--warning)' : '#4B5563' }}>
                {p.cost_price ? `¥${p.cost_price}` : '-'}
              </div>
              {/* margin */}
              <div style={{ textAlign: 'right', fontWeight: 600, color: marginColor }}>{marginStr}</div>
              {/* profit amount */}
              <div style={{ textAlign: 'right', color: p.original_price && p.original_price > p.price ? 'var(--info)' : '#4B5563' }}>{profitStr}</div>
              {/* discount rate % */}
              <div style={{ textAlign: 'right', fontWeight: 600, color: p.discount_rate && p.discount_rate > 0 ? 'var(--accent)' : '#4B5563' }}>
                {p.discount_rate != null && p.discount_rate > 0 ? p.discount_rate + '%' : '-'}
              </div>
              {/* sales */}
              <div style={{ textAlign: 'center' }}>{(p as any).sales_count ?? p.sales}</div>
              {/* status */}
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: p.status === 'online' ? 'rgba(5,150,105,0.15)' : 'rgba(220,38,38,0.15)',
                  color: p.status === 'online' ? 'var(--success-strong)' : 'var(--danger)',
                }}>
                  {p.status === 'online' ? '上架中' : '已下架'}
                </span>
              </div>
              {/* action */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button onClick={() => handleCompileEmotion(p)} style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.15)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent-text)', cursor: 'pointer', fontSize: 12 }}>情绪编译</button>
                <button onClick={() => openEdit(p)} style={{ padding: '4px 10px', background: 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>编辑</button>
                <button onClick={() => toggleStatus(p.id)} style={{
                  padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  background: p.status === 'online' ? 'rgba(220,38,38,0.1)' : 'rgba(5,150,105,0.1)',
                  border: `1px solid ${p.status === 'online' ? 'var(--danger)' : 'var(--success-strong)'}`,
                  color: p.status === 'online' ? 'var(--danger)' : 'var(--success-strong)',
                }}>
                  {p.status === 'online' ? '下架' : '上架'}
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 4, color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>删除</button>
              </div>
            </div>
          )
        })}
        {!filtered.length && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>暂无商品数据</div>}
      </div>

      {/* add/edit modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={closeModal}>
          <div style={{ background: 'var(--surface-2)', borderRadius: 16, padding: 24, width: 600, border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', margin: '0 0 20px', fontSize: 16 }}>{editing ? '编辑商品' : '添加商品'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* ===== 主图 ===== */}
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>主图 *</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  {form.main_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.main_image} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-soft)' }} />
                  ) : (
                    <div style={{ width: 80, height: 80, background: 'var(--bg)', borderRadius: 8, border: '1px dashed var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 11 }}>无主图</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => mainImgRef.current?.click()} style={{ padding: '6px 14px', background: 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
                      {form.main_image ? '更换主图' : '上传主图'}
                    </button>
                    {form.main_image && (
                      <button onClick={() => setForm(f => ({ ...f, main_image: '' }))} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>移除</button>
                    )}
                  </div>
                  <input ref={mainImgRef} type="file" accept="image/*" onChange={handleMainImgChange} style={{ display: 'none' }} />
                </div>
              </div>

              {/* ===== 副图（最多9张） ===== */}
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>副图（最多9张）</span>
                <div style={{ marginTop: 6 }}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverSub(true) }}
                    onDragLeave={() => setDragOverSub(false)}
                    onDrop={onDropSub}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, padding: dragOverSub ? 8 : 0, borderRadius: 8, background: dragOverSub ? 'rgba(16,185,129,0.12)' : 'transparent', outline: dragOverSub ? '2px dashed var(--success-strong)' : 'none' }}>
                    {form.sub_images.map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-soft)' }} />
                        <button onClick={() => removeSubImg(i)} style={{
                          position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          background: 'var(--danger)', border: 'none', borderRadius: '50%', color: '#fff',
                          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        }}>×</button>
                      </div>
                    ))}
                    {form.sub_images.length < 9 && (
                      <div onClick={() => subImgRef.current?.click()} style={{
                        width: 64, height: 64, background: 'var(--bg)', border: '1px dashed var(--border-soft)',
                        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer',
                      }}>+</div>
                    )}
                  </div>
                  <input ref={subImgRef} type="file" accept="image/*" multiple onChange={handleSubImgChange} style={{ display: 'none' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>已选 {form.sub_images.length}/9 张，支持 JPG/PNG，单张 ≤ 2MB，可直接拖拽图片到此区域</span>
                </div>
              </div>

              {/* ===== 视频 ===== */}
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品视频（可选）</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  {form.video_url ? (
                    <div style={{ position: 'relative' }}>
                      // eslint-disable-next-line @next/next/no-img-element
                      <video src={form.video_url} style={{ width: 120, height: 72, borderRadius: 8, background: '#000' }} muted />
                      <button onClick={() => setForm(f => ({ ...f, video_url: '' }))} style={{
                        position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                        background: 'var(--danger)', border: 'none', borderRadius: '50%', color: '#fff',
                        fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}>×</button>
                    </div>
                  ) : (
                    <button onClick={() => videoRef.current?.click()} style={{ padding: '8px 16px', background: 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>上传视频</button>
                  )}
                  <input ref={videoRef} type="file" accept="video/*" onChange={handleVideoChange} style={{ display: 'none' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>支持 MP4/MOV，≤ 50MB</span>
                </div>
              </div>

              {/* ===== 详情图片（商品详情页展示） ===== */}
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>详情图片（商品详情页展示，最多20张）</span>
                <div style={{ marginTop: 6 }}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverDetail(true) }}
                    onDragLeave={() => setDragOverDetail(false)}
                    onDrop={onDropDetail}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, padding: dragOverDetail ? 8 : 0, borderRadius: 8, background: dragOverDetail ? 'rgba(16,185,129,0.12)' : 'transparent', outline: dragOverDetail ? '2px dashed var(--success-strong)' : 'none' }}>
                    {form.detail_images.map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={img} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-soft)' }} />
                        <button onClick={() => removeDetailImg(i)} style={{
                          position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          background: 'var(--danger)', border: 'none', borderRadius: '50%', color: '#fff',
                          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        }}>×</button>
                      </div>
                    ))}
                    {form.detail_images.length < 20 && (
                      <div onClick={() => detailRef.current?.click()} style={{
                        width: 80, height: 80, background: 'var(--bg)', border: '1px dashed var(--border-soft)',
                        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer',
                      }}>+</div>
                    )}
                  </div>
                  <input ref={detailRef} type="file" accept="image/*" multiple onChange={handleDetailImgChange} style={{ display: 'none' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>已选 {form.detail_images.length}/20 张，支持 JPG/PNG，按上传顺序排列，可在商品详情页依次展示，可直接拖拽图片到此区域</span>
                </div>
              </div>

              {/* ===== 商品信息表单 ===== */}
              <label>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品名称 *</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="请输入商品名称" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </label>
              <label>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品描述</span>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="请输入商品描述" rows={3} style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>售价 *</span>
                  <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} type="number" placeholder="0.00" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                </label>
                <label>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>原价（划线价）</span>
                  <input value={form.original_price} onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))} type="number" placeholder="0.00" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>成本价 *</span>
                  <input value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} type="number" placeholder="0.00" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>用于计算毛利率</span>
                </label>
                <label>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>库存 *</span>
                  <input value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} type="number" placeholder="0" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                </label>
              </div>
              {/* 让利% */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品让利 %</span>
                  <input value={form.discount_rate} onChange={e => setForm(f => ({ ...f, discount_rate: e.target.value }))} type="number" placeholder="0" min={0} max={100} style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>用户端显示让利标签（如"立减33%"）</span>
                  {Number(form.discount_rate) > 0 && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12,
                      background: storeRefEnabled ? 'rgba(194,65,12,0.12)' : 'rgba(59,130,246,0.12)',
                      border: `1px solid ${storeRefEnabled ? 'var(--primary)' : 'var(--info)'}`,
                      color: storeRefEnabled ? 'var(--primary)' : 'var(--info)' }}>
                      {storeRefEnabled
                        ? `提示：该店已开启「整体让利」，商品让利 ${form.discount_rate}% 将与门店默认让利率按金额加权合并计算，不会叠加放大。`
                        : `提示：该店「整体让利」已关闭，此商品让利 ${form.discount_rate}% 为唯一让利来源（无商品让利则该单让利为 0）。`}
                    </div>
                  )}
                </label>
              </div>
              {/* real-time margin preview */}
              {form.price && form.cost_price && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>毛利率预览：</span>
                  {(() => {
                    const m  = (Number(form.price) - Number(form.cost_price)) / Number(form.price) * 100
                    const mc = isNaN(m) ? 'var(--text-muted)' : m >= 50 ? 'var(--success-strong)' : m >= 30 ? 'var(--warning)' : 'var(--danger)'
                    return <span style={{ color: mc, fontWeight: 700, fontSize: 16, marginLeft: 8 }}>{isNaN(m) ? '-' : m.toFixed(1) + '%'}</span>
                  })()}
                  <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 12 }}>
                    单件利润: ¥{((Number(form.price) - Number(form.cost_price)) || 0).toFixed(1)}
                  </span>
                  {form.original_price && Number(form.original_price) > Number(form.price) && (
                    <span style={{ color: 'var(--info)', fontSize: 11, marginLeft: 12 }}>
                      让利金额: ¥{(Number(form.original_price) - Number(form.price)).toFixed(1)}
                    </span>
                  )}
                  {form.discount_rate && Number(form.discount_rate) > 0 && (
                    <span style={{ color: 'var(--accent)', fontSize: 11, marginLeft: 12 }}>
                      让利标签: 立减{Number(form.discount_rate)}%
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 商品分类（spec 基础信息区） */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品分类</span>
              <select value={form.food_category} onChange={e => setForm(f => ({ ...f, food_category: e.target.value }))}
                style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">未分类</option>
                {FOOD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>粉面 / 炖汤 / 热饮 / 小菜，驱动食疗导购分类筛选</span>
            </div>

            {/* 商品自定义分类（store_categories：本店 + 平台全局） */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品分类（自定义）</span>
                <button type="button" onClick={() => setShowCatModal(true)}
                  style={{ padding: '4px 12px', background: 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--primary)', cursor: 'pointer', fontSize: 12 }}>
                  管理分类
                </button>
              </div>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">未分类</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.scope === 'global' ? ' 🌐' : ''}</option>
                ))}
              </select>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>可新建店内分类；🌐 为平台全局分类，对所有门店生效</span>
            </div>

            {/*  原料成分分析（可选） */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}> 原料成分分析（可选）</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={autoDetectIngredients} disabled={!form.name}
                    style={{ padding: '6px 14px', background: (!form.name) ? 'var(--border-soft)' : 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 8, color: (!form.name) ? 'var(--text-dim)' : 'var(--text)', cursor: (!form.name) ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                    智能识别
                  </button>
                  <button type="button" onClick={handleAnalyzeDish} disabled={!form.name}
                    style={{ padding: '6px 14px', background: (!form.name) ? 'var(--border-soft)' : 'var(--success-strong)', border: '1px solid var(--success-strong)', borderRadius: 8, color: (!form.name) ? 'var(--text-dim)' : '#fff', cursor: (!form.name) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                    ✨ 食疗分析
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 8px' }}>根据商品名自动识别食材，匹配食养成分（性味 / 功效 / 适合人群 / 场景）。</p>
              {form.ingredients.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px', background: 'var(--bg)', border: '1px dashed var(--border-soft)', borderRadius: 8 }}>尚未选择原料，可点「智能识别」或下方手动勾选。</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {form.ingredients.map((key: string) => {
                    const e = INGREDIENT_DICT[key]
                    if (!e) return null
                    return (
                      <span key={key} onClick={() => toggleIngredient(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 999, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                        <span>{e.icon} {e.zh}</span>
                        <span style={{ color: 'var(--text-dim)' }}>×</span>
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
                      style={{ padding: '4px 10px', background: active ? '#065F46' : 'var(--bg)', border: `1px solid ${active ? 'var(--success-strong)' : 'var(--border-soft)'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : 'var(--text-muted)' }}>
                      {e.icon} {e.zh}
                    </button>
                  )
                })}
              </div>
              <p style={{ color: '#4B5563', fontSize: 11, margin: '8px 0 0' }}>{SHIYANG_DISCLAIMER}</p>
            </div>

            {/*  商品食疗智能系统 · 完整录入（商家一次录入，前端自动匹配） */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}> 商品食疗智能系统（录入后前端自动匹配）</span>
                <button type="button" onClick={handleAIGenerate} disabled={generating || !form.name}
                  style={{ padding: '6px 14px', background: (generating || !form.name) ? 'var(--border-soft)' : 'linear-gradient(135deg,#10B981,#059669)', border: 'none', borderRadius: 8, color: '#fff', cursor: (generating || !form.name) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {generating ? 'AI 生成中…' : '✨ AI 一键生成食疗文案'}
                </button>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 8px' }}>填全后前端自动匹配；点上方按钮可基于已填字段一键产出导购短句 / 朋友圈 / 情绪文案 / 忌口提示（云端大模型润色，未配置时本地规则兜底）。</p>

              {/* 整体性味（系统自动计算适配逻辑用） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>整体性味</span>
                <select value={form.overall_nature} onChange={e => setForm(f => ({ ...f, overall_nature: e.target.value }))}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                  <option value="">未设置（将按原料自动聚合）</option>
                  {NATURE_SCALE.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>由凉到热：大寒 / 寒凉 / 平性 / 微温 / 温热 / 大热（系统据此绑定场景/人群）</span>
              </div>

              {/* 食养阶段（清通调补固，系统自动派生，支持人工微调覆盖） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>食养阶段（清通调补固）</span>
                <select value={form.food_stage} onChange={e => setForm(f => ({ ...f, food_stage: e.target.value }))}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                  <option value="">未设置（按核心食材主导功效自动判定）</option>
                  <option value="清">清阶 · 清火润燥</option>
                  <option value="通">通阶 · 通肠益菌</option>
                  <option value="调">调阶 · 健脾养胃</option>
                  <option value="补">补阶 · 补钙增营</option>
                  <option value="固">固阶 · 固本均衡</option>
                </select>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>留空则由小程序端按核心食材自动判定；在此手动选择可覆盖自动结果</span>
              </div>

              {/* 食疗滋养效果：正向 + 风险 分离 */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>正向调理作用</span>
                <textarea value={form.positive_effect} onChange={e => setForm(f => ({ ...f, positive_effect: e.target.value }))} placeholder="如：补气养血、改善气虚乏力；温热滋补" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>食用参考（特定人群注意点）</span>
                <textarea value={form.risk_warning} onChange={e => setForm(f => ({ ...f, risk_warning: e.target.value }))} placeholder="如：经期量大人群建议少量品尝" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>仅供参考，详情页以正向展示为主</span>
              </div>

              {/* 情绪价值文案（固定三段式模板填空） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>情绪价值文案（三段式）</span>
                <textarea value={form.emotion_copy} onChange={e => setForm(f => ({ ...f, emotion_copy: e.target.value }))} placeholder={'第一段：热汤通体暖意\n第二段：疲惫时的温柔抚慰\n第三段：犒劳长期辛苦的自己'} rows={3}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>温暖陪伴 / 放松时刻 / 犒劳自己，三段换行填写</span>
              </div>

              {/* 适配消费场景（预设 + 自定义） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>适配消费场景（多选 + 可补充）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {SCENE_OPTIONS.map(s => {
                    const active = form.scenes.includes(s)
                    return (
                      <button key={s} type="button" onClick={() => toggleArr('scenes', s)}
                        style={{ padding: '4px 10px', background: active ? '#065F46' : 'var(--bg)', border: `1px solid ${active ? 'var(--success-strong)' : 'var(--border-soft)'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : 'var(--text-muted)' }}>
                        {s}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={customScene} onChange={e => setCustomScene(e.target.value)} placeholder="补充自定义场景，如：出差途中" style={{ flex: 1, padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                  <button type="button" disabled={!customScene.trim()} onClick={() => { if (customScene.trim()) { toggleArr('scenes', customScene.trim()); setCustomScene('') } }}
                    style={{ padding: '6px 14px', background: customScene.trim() ? 'var(--border)' : 'var(--border-soft)', border: '1px solid var(--border-soft)', borderRadius: 8, color: customScene.trim() ? 'var(--text)' : 'var(--text-dim)', cursor: customScene.trim() ? 'pointer' : 'not-allowed', fontSize: 13 }}>添加</button>
                </div>
                {form.scenes.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--success-strong)', fontSize: 12 }}>已选：{form.scenes.join('、')}</div>
                )}
              </div>

              {/* 人群标签配置：①五星推荐 ②谨慎+说明 ③禁止+原因 */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>① 五星推荐人群（多选）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {CROWD_OPTIONS.map(c => {
                    const active = form.rec_crowds.includes(c)
                    return (
                      <button key={c} type="button" onClick={() => toggleArr('rec_crowds', c)}
                        style={{ padding: '4px 10px', background: active ? '#065F46' : 'var(--bg)', border: `1px solid ${active ? 'var(--success-strong)' : 'var(--border-soft)'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : 'var(--text-muted)' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>② 少量品鉴人群（多选）+ 温馨提醒</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {CROWD_OPTIONS.map(c => {
                    const active = form.cautious_crowds.includes(c)
                    return (
                      <button key={c} type="button" onClick={() => toggleArr('cautious_crowds', c)}
                        style={{ padding: '4px 10px', background: active ? 'var(--warning)' : 'var(--bg)', border: `1px solid ${active ? 'var(--warning)' : 'var(--border-soft)'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#FEF3C7' : 'var(--text-muted)' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
                <textarea value={form.cautious_notes} onChange={e => setForm(f => ({ ...f, cautious_notes: e.target.value }))} placeholder="如：少量饮用、去辣减油" rows={2}
                  style={{ width: '100%', marginTop: 6, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>③ 建议回避人群（多选）+ 参考原因</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {CROWD_OPTIONS.map(c => {
                    const active = form.forbidden_crowds.includes(c)
                    return (
                      <button key={c} type="button" onClick={() => toggleArr('forbidden_crowds', c)}
                        style={{ padding: '4px 10px', background: active ? '#7F1D1D' : 'var(--bg)', border: `1px solid ${active ? 'var(--danger)' : 'var(--border-soft)'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#FECACA' : 'var(--text-muted)' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
                <textarea value={form.forbidden_reasons} onChange={e => setForm(f => ({ ...f, forbidden_reasons: e.target.value }))} placeholder="如：特殊体质建议回避、建议少量尝试" rows={2}
                  style={{ width: '100%', marginTop: 6, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* 门店营销配套录入区 */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}> 门店营销配套（自动同步前端 / 海报 / 导购）</span>
              </div>
              <div style={{ marginBottom: 14, marginTop: 10 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>店内升单搭配套餐（绑定其他商品）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {list.filter(p => p.id !== (editing?.id)).map(p => {
                    const active = form.combo_product_ids.includes(p.id)
                    return (
                      <button key={p.id} type="button" onClick={() => toggleArr('combo_product_ids', p.id)}
                        style={{ padding: '4px 10px', background: active ? '#065F46' : 'var(--bg)', border: `1px solid ${active ? 'var(--success-strong)' : 'var(--border-soft)'}`, borderRadius: 999, cursor: 'pointer', fontSize: 12, color: active ? '#ECFDF5' : 'var(--text-muted)' }}>
                        {p.name}
                      </button>
                    )
                  })}
                  {list.filter(p => p.id !== (editing?.id)).length === 0 && (
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>暂无其他商品可选（先创建商品）</span>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>店员导购短句</span>
                <input value={form.guide_sentence} onChange={e => setForm(f => ({ ...f, guide_sentence: e.target.value }))} placeholder="如：这碗鸡汤温补，特别适合您现在的状态" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>朋友圈种草文案</span>
                <textarea value={form.moments_copy} onChange={e => setForm(f => ({ ...f, moments_copy: e.target.value }))} placeholder="如：今天被这碗鸡汤暖到了，暖到心底✨" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>忌口红字警示语</span>
                <input value={form.taboo_warning} onChange={e => setForm(f => ({ ...f, taboo_warning: e.target.value }))} placeholder="如：经期量大、痛风人群慎点" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '8px 20px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>取消</button>
              <button onClick={handleSubmit} disabled={!form.name || !form.price || !form.stock} style={{
                padding: '8px 20px',
                background: (!form.name || !form.price || !form.stock) ? 'var(--border-soft)' : 'var(--success-strong)',
                border: 'none', borderRadius: 8, color: '#fff',
                cursor: (!form.name || !form.price || !form.stock) ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 商品分类管理弹窗 */}
      {showCatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowCatModal(false)}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 17, fontWeight: 700 }}>管理商品分类</h3>
              <button onClick={() => setShowCatModal(false)} style={{ background: 'transparent', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>

            {/* 新建 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="输入新分类名称"
                style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
              <button onClick={handleAddCategory} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>新建</button>
            </div>

            {/* 列表 */}
            {categories.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>还没有分类，先在上方新建一个吧</p>}
            {[...categories].sort((a, b) => a.sort_order - b.sort_order).map(c => {
              const isGlobal = c.scope === 'global'
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  {editingCatId === c.id ? (
                    <input autoFocus value={editingCatName} onChange={e => setEditingCatName(e.target.value)} onBlur={() => handleSaveRename(c)}
                      style={{ flex: 1, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }}>
                      <span style={{ fontSize: 15, color: 'var(--text)' }}>{c.name}</span>
                      {isGlobal && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🌐 平台</span>}
                    </div>
                  )}
                  {!isGlobal && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => handleMoveCategory(c, -1)} style={catBtn}>↑</button>
                      <button onClick={() => handleMoveCategory(c, 1)} style={catBtn}>↓</button>
                      {editingCatId === c.id
                        ? <button onClick={() => handleSaveRename(c)} style={{ ...catBtn, color: 'var(--success-strong)' }}>✓</button>
                        : <button onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }} style={{ ...catBtn, color: 'var(--info-strong)' }}>改名</button>}
                      <button onClick={() => handleDeleteCategory(c)} style={{ ...catBtn, color: 'var(--danger)' }}>删</button>
                    </div>
                  )}
                </div>
              )
            })}
            <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 12 }}>🌐 平台分类由总部统一维护，店内不可修改；店内分类仅对本店商品生效。</p>
          </div>
        </div>
      )}
    </div>
  )
}
