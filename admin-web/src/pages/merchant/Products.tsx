import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product, StoreCategory } from '@/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getCategories, createStoreCategory, updateStoreCategory, deleteStoreCategory } from '@/api/categories'
import { getMerchantProductSales, getMyMerchantStore } from '@/api/merchant'
import { useStore } from '@/contexts/StoreContext'
import { localCompileEmotion, recommendDimensions } from '@/utils/emotion'
import { INGREDIENT_DICT, matchIngredientKeys, SHIYANG_DISCLAIMER } from '@/utils/shiyang'
import { NATURE_SCALE, SCENE_OPTIONS, FOOD_CATEGORIES } from '@/utils/food-therapy-tags'
import { analyzeDish } from '@/utils/dish-analyzer'
import { encodeEAN13 } from '@/utils/barcode'
import { uploadProductAsset } from '@/utils/storage'

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

// 可折叠分区：把近 50 个商品字段收进分区，运营按需展开，长表单不再一屏刷屏
function Section({ title, open, onToggle, hint, danger, children }: {
  title: string
  open: boolean
  onToggle: () => void
  hint?: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <button type="button" onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 10, cursor: 'pointer', color: 'var(--text)', fontSize: 15, fontWeight: 700 }}>
        <span>{title}{hint ? <span style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>{hint}</span> : null}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: danger ? 'var(--danger)' : 'var(--text-dim)', fontSize: 13 }}>{danger ? '⚠' : '▾'}</span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

// 结构化食材项（与小程序端 IngredientItem 保持一致）：原料成分分析升级为 占比/烹饪方式/辅料
type IngredientItem = {
  id: string
  name: string
  nature: string
  base_effect: string | null
  caution_crowds: string | null
  allergens: string[]
  chronic_tags: string[]
  neutralize: string | null
  ratio: number
  cooking: string
  aux: string[]
}
const COOKING_METHODS = ['清炒', '少油', '重油', '红烧', '水煮', '凉拌']
const AUX_OPTIONS = ['盐', '糖', '食用油', '酱油', '味精']

// 由食材库 key 构建一个结构化 IngredientItem。
// 注：web 端 INGREDIENT_DICT 仅含 性味/功效/人群/场景，缺少 base_effect / caution_crowds /
// allergens / chronic_tags / neutralize（这些在小程序端来自 food_ingredients 表行）。
// 这里用 benefits 推导 base_effect，其余保留默认空值，保证 IngredientItem 形状一致。
const dictKeyToItem = (key: string): IngredientItem | null => {
  const e = INGREDIENT_DICT[key]
  if (!e) return null
  return {
    id: key,
    name: e.zh,
    nature: e.nature,
    base_effect: e.benefits && e.benefits.length ? e.benefits.join('、') : null,
    caution_crowds: null,
    allergens: [],
    chronic_tags: [],
    neutralize: null,
    ratio: 50,
    cooking: '清炒',
    aux: [],
  }
}

// 中文名/别名 → 食材库 key（用于把已存储的 ingredients 名称还原为结构化项）
const nameToDictKey = (zh: string): string | null => {
  if (!zh) return null
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    if (e.zh === zh || (e.aliases || []).includes(zh)) return key
  }
  return null
}

// 把 DB 存储的 ingredients 还原为结构化 IngredientItem[]（兼容两种历史形状：
// 新 = 结构化 IngredientItem 数组（占比/烹饪/辅料）；旧 = 食材中文名字符串数组）
const namesToItems = (names: any[]): IngredientItem[] => {
  return (names ?? []).map(raw => {
    if (raw && typeof raw === 'object') {
      const o = raw as Partial<IngredientItem>
      return {
        id: String(o.id ?? o.name ?? ''),
        name: String(o.name ?? o.id ?? ''),
        nature: o.nature || '平性',
        base_effect: o.base_effect ?? null,
        caution_crowds: o.caution_crowds ?? null,
        allergens: o.allergens ?? [],
        chronic_tags: o.chronic_tags ?? [],
        neutralize: o.neutralize ?? null,
        ratio: typeof o.ratio === 'number' ? o.ratio : 50,
        cooking: o.cooking || '清炒',
        aux: o.aux ?? [],
      }
    }
    const zh = String(raw ?? '')
    const key = nameToDictKey(zh)
    const it = key ? dictKeyToItem(key) : null
    if (it) return it
    return {
      id: zh, name: zh, nature: '平性', base_effect: null, caution_crowds: null,
      allergens: [], chronic_tags: [], neutralize: null, ratio: 50, cooking: '清炒', aux: [],
    }
  })
}

const MOCK_PRODUCTS: ProductWithExt[] = [
  {
    id: '1', store_id: 'store-1', name: '云南高山古树普洱茶 357g', description: '云南古树普洱，陈化5年，汤色红浓明亮，滋味醇厚回甘。每一饼茶都经过严格筛选，确保品质稳定。适合长期储藏，越陈越香。',
    price: 268, original_price: 398, image_url: null,
    main_image: '',
    sub_images: [],
    detail_images: [],
    video_url: '',
    category_id: 'cat-1', status: 'online', stock: 126, sales: 342, is_active: true, cost_price: 120,
    discount_rate: 33, review_status: 'approved', created_at: '2026-06-15',
  },
  {
    id: '2', store_id: 'store-1', name: '手工红糖姜茶 15包装', description: '云南手工红糖+老姜，暖胃驱寒，独立小包装，方便携带。精选优质红糖和老姜，传统工艺制作，无添加防腐剂。',
    price: 39.9, original_price: 59.9, image_url: null,
    main_image: '',
    sub_images: [],
    detail_images: [],
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
    main_image: '',
    sub_images: [],
    detail_images: [],
    video_url: '',
    category_id: 'cat-4', status: 'online', stock: 200, sales: 789, is_active: true, cost_price: 32,
    discount_rate: 31, review_status: 'approved', created_at: '2026-05-28',
  },
  {
    id: '5', store_id: 'store-1', name: '云南小粒咖啡豆 烘焙熟豆 500g', description: '普洱小粒咖啡，中度烘焙，花果香明显，酸度适中，余韵悠长。产地直供，新鲜烘焙。',
    price: 128, original_price: 168, image_url: null,
    main_image: '',
    sub_images: [],
    detail_images: [],
    video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    category_id: 'cat-5', status: 'offline', stock: 0, sales: 231, is_active: false, cost_price: 65,
    discount_rate: 24, review_status: 'pending', created_at: '2026-05-20',
  },
]

export default function MerchantProducts() {
  const { profile, useMock } = useAuth()
  const { selectedStoreId } = useStore()
  const [list, setList] = useState<ProductWithExt[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [storeCategory, setStoreCategory] = useState<string | null>(null)
  const [storeRefEnabled, setStoreRefEnabled] = useState(false)
  const [emotionFlash, setEmotionFlash] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatingBarcode, setGeneratingBarcode] = useState(false)
  const [printingBarcode, setPrintingBarcode] = useState(false)
  const navigate = useNavigate()
  const [dragOverSub, setDragOverSub] = useState(false)
  const [dragOverDetail, setDragOverDetail] = useState(false)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProductWithExt | null>(null)
  const [form, setForm] = useState({
    name: '', price: '', original_price: '', cost_price: '', stock: '', desc: '', barcode: '',
    main_image: '', sub_images: [] as string[], detail_images: [] as string[], video_url: '',
    discount_rate: '',
    ingredients: [] as IngredientItem[],
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
    sub_category_id: '',
    food_stage: '',
    // 商品类型化 + 礼品/手作 + 辨证适配（对齐小程序端 merchant-products）
    product_kind: 'food',
    is_active: true,
    fit_people_override: '',
    materials: [] as string[],
    gift_meaning: '',
    gift_craft: '',
    gift_scene: '',
    gift_care: '',
  })
  const mainImgRef   = useRef<HTMLInputElement>(null)
  const subImgRef    = useRef<HTMLInputElement>(null)
  const detailRef    = useRef<HTMLInputElement>(null)
  const videoRef     = useRef<HTMLInputElement>(null)

  // 判断是否有自营门店权限
  const isMerchantUser = profile?.merchant_status === 'approved' || profile?.role === 'merchant'
  const [customScene, setCustomScene] = useState('')

  // 实时食疗安全分析结果（P1-8）：点「实时安全分析」后写入，供商家直观看到系统判定
  const [liveSafety, setLiveSafety] = useState<{
    overall_nature: string
    risks: { red: string[]; orange: string[]; blue: string[] }
    note: string
  } | null>(null)

  // —— 商品分类（store_categories：本店 + 平台全局）——
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')

  // 商品编辑表单分区折叠状态（默认展开基础/价格/食疗，媒体/分类/原料/营销收起，降低一眼复杂度）
  const [sections, setSections] = useState<Record<string, boolean>>({
    media: false, base: true, price: true, category: false, ingredients: false, therapy: true, marketing: false,
  })
  const toggleSection = (k: string) => setSections(s => ({ ...s, [k]: !s[k] }))
  // 专家微调：默认关闭；引擎计算的食疗字段只读展示，开启后可手动覆盖（适合人群/性味/阶段/提示）
  const [expertMode, setExpertMode] = useState(false)

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
      const st = await getMyMerchantStore(profile.id, selectedStoreId)
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
  }, [profile, useMock, selectedStoreId])

  // 加载商品列表
  useEffect(() => {
    if (useMock) {
      // 仅「显式演示模式」使用 Mock 商品
      setList([...MOCK_PRODUCTS])
      return
    }
    // 门店尚未解析完 / 无门店：保持空列表。
    // ⚠️ 原判断写作 `!isMerchantUser`（函数取反恒为 false），等价于「只要 storeId 为空就填
    //    MOCK_PRODUCTS」，导致进页面瞬间/无门店时给商户展示一批并不存在的商品。
    if (!storeId) return
    load()
  }, [useMock, storeId, profile])

  const load = async () => {
    setList([])
    setLoadErr(null)
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
    } catch (e: any) {
      // 不再静默回退 Mock 商品：让商户看到并不存在的商品，比看到空列表危险得多
      console.error('[Products] 加载失败：', e)
      setList([])
      setLoadErr(e?.message || '商品列表加载失败')
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
    setLiveSafety(null)
    setForm({ name: '', price: '', original_price: '', cost_price: '', stock: '', desc: '', barcode: '', main_image: '', sub_images: [], detail_images: [], video_url: '', discount_rate: '', ingredients: [],
      overall_nature: '', health_tag: [], emotion_tag: [], match_goods: [], conflict_goods: [], aux_remind: '',
      food_category: '', positive_effect: '', risk_warning: '', emotion_copy: '', scenes: [],
      rec_crowds: [], cautious_crowds: [], cautious_notes: '', forbidden_crowds: [], forbidden_reasons: '',
      combo_product_ids: [], guide_sentence: '', moments_copy: '', taboo_warning: '', category_id: '', sub_category_id: '',
      food_stage: '',
      product_kind: 'food', is_active: true, fit_people_override: '', materials: [],
      gift_meaning: '', gift_craft: '', gift_scene: '', gift_care: '' })
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
      barcode: p.barcode ?? '',
      main_image: p.main_image || '',
      sub_images: p.sub_images ? [...p.sub_images] : [],
      detail_images: p.detail_images ? [...p.detail_images] : [],
      video_url: p.video_url || '',
      discount_rate: p.discount_rate != null ? String(p.discount_rate) : '',
      ingredients: namesToItems(p.ingredients ?? []),
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
      sub_category_id: (p as any).sub_category_id ?? '',
      food_stage: (p as any).food_stage ?? '',
      product_kind: (p as any).product_kind ?? 'food',
      is_active: (p as any).is_active ?? true,
      fit_people_override: (p as any).fit_people_override ?? '',
      materials: (p as any).materials ?? [],
      gift_meaning: (p as any).gift_meaning ?? '',
      gift_craft: (p as any).gift_craft ?? '',
      gift_scene: (p as any).gift_scene ?? '',
      gift_care: (p as any).gift_care ?? '',
    })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditing(null) }

  // 一键生成店内码（仅编辑已有商品）：服务端原子分配 EAN-13 并回写 products.barcode
  // 用 RPC fn_alloc_store_barcode（SECURITY DEFINER，行锁防并发撞码），保证唯一且校验位正确
  const onGenerateBarcode = async () => {
    if (!editing) { window.alert('请先打开一个商品进行编辑'); return }
    if (!storeId) { window.alert('未关联门店，无法生成店内码'); return }
    setGeneratingBarcode(true)
    try {
      const { data, error } = await supabase.rpc('fn_alloc_store_barcode', { p_store_id: storeId })
      if (error || !data || !data.length) {
        window.alert('生成失败：' + (error?.message || '未知错误'))
        return
      }
      const code = (data[0] as any).barcode as string
      const type = (data[0] as any).barcode_type as string
      // ⚠️ 关键：必须 .select() 回读并按「返回行数」判定是否真的落库。
      // PostgREST 对被 RLS 拒绝的 UPDATE **不报错**，只返回 0 行；此前正是靠 upErr 判定，
      // 于是出现「界面提示已生成 → 打印报该商品无条码」的假成功。
      const { data: updated, error: upErr } = await supabase
        .from('products')
        .update({ barcode: code, barcode_type: type })
        .eq('id', editing.id)
        .select('id,barcode')
      if (upErr) { window.alert('回写条码失败：' + upErr.message); return }
      if (!updated || updated.length === 0) {
        window.alert(
          '条码已分配但未能写入商品（安全策略拒绝了本次修改）。\n' +
          '常见原因：当前账号不是该门店负责人。\n' +
          '请用门店负责人账号操作，或前往「条形码制作」页处理。'
        )
        return
      }
      setForm(f => ({ ...f, barcode: code }))
      setList(prev => prev.map(p => p.id === editing.id ? { ...p, barcode: code } : p))
      window.alert('已生成店内码：' + code)
    } finally {
      setGeneratingBarcode(false)
    }
  }

  // 打印条码标签（易联云 EAN-13 店内码）：依赖门店已配置打印机
  const onPrintBarcode = async () => {
    // 原实现在这两个前置不满足时直接 return —— 点击「打印标签」完全没反应，
    // 用户只会以为按钮坏了。改为明确告知原因与下一步。
    if (!editing) { window.alert('请先打开一个商品进行编辑'); return }
    if (!form.barcode) { window.alert('该商品还没有店内码，请先点「一键生成店内码」。'); return }
    setPrintingBarcode(true)
    try {
      const { data, error } = await supabase.functions.invoke('print-receipt', { body: { mode: 'barcode', product_id: editing.id } })
      if (error) { window.alert('打印失败：' + error.message); return }
      const d = (data ?? {}) as any
      if (d.need_config) { window.alert('该门店尚未配置已启用的云打印机，请先到「小票打印」配置打印机后再打印标签。'); return }
      if (d.success) { window.alert('已推送打印'); }
      else {
        // 最常见真因：码只在前端 state 里、没落库 → 服务端读到空条码
        const err = String(d.error || '未知错误')
        window.alert(
          /无条码/.test(err)
            ? '打印失败：该商品的店内码没能写入数据库（通常是权限不足被安全策略拒绝）。\n请用门店负责人账号重试，或前往「条形码制作」页处理。'
            : '打印失败：' + err
        )
      }
    } finally {
      setPrintingBarcode(false)
    }
  }

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

  // 主图选择（上传到 product-images 存储桶，返回真实图片 URL）
  const handleMainImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadProductAsset(file)
    setForm(f => ({ ...f, main_image: url }))
  }

  // 副图选择（多选）
  const handleSubImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      urls.push(await uploadProductAsset(files[i]))
    }
    setForm(f => ({ ...f, sub_images: [...f.sub_images, ...urls].slice(0, 9) }))
  }

  // 视频选择
  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadProductAsset(file)
    setForm(f => ({ ...f, video_url: url }))
  }

  // 详情图片选择（多选）
  const handleDetailImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      urls.push(await uploadProductAsset(files[i]))
    }
    setForm(f => ({ ...f, detail_images: [...f.detail_images, ...urls].slice(0, 20) }))
  }

  const removeDetailImg = (idx: number) => {
    setForm(f => ({ ...f, detail_images: f.detail_images.filter((_, i) => i !== idx) }))
  }

  const removeSubImg = (idx: number) => {
    setForm(f => ({ ...f, sub_images: f.sub_images.filter((_, i) => i !== idx) }))
  }

  // 原料成分：勾选 / 取消某个食材 key（结构化 IngredientItem）
  const toggleIngredient = (key: string) => {
    setForm(f => {
      const has = f.ingredients.some(it => it.id === key)
      if (has) return { ...f, ingredients: f.ingredients.filter(it => it.id !== key) }
      const item = dictKeyToItem(key)
      if (!item) return f
      return { ...f, ingredients: [...f.ingredients, item] }
    })
  }
  // 智能识别：按商品名匹配食材 key，补全为结构化项（保留已配置项）
  const autoDetectIngredients = () => {
    const keys = matchIngredientKeys(form.name)
    setForm(f => {
      const existing = new Set(f.ingredients.map(it => it.id))
      const add = keys.filter(k => !existing.has(k)).map(k => dictKeyToItem(k)).filter(Boolean) as IngredientItem[]
      return { ...f, ingredients: [...f.ingredients, ...add] }
    })
  }
  // 食疗分析：按菜名系统拆解食材并组合生成全部食养字段（回填表单）
  const handleAnalyzeDish = () => {
    if (!form.name) return
    const r = analyzeDish(form.name, form.ingredients.map(i => i.id))
    setForm(f => {
      // 已识别食材转为结构化项；保留已有项的 占比/烹饪/辅料 配置
      const prevById = new Map(f.ingredients.map(it => [it.id, it]))
      const items: IngredientItem[] = r.ingredients
        .map(k => prevById.get(k) ?? dictKeyToItem(k))
        .filter(Boolean) as IngredientItem[]
      return {
        ...f,
        ingredients: items,
        food_category: r.food_category || f.food_category,
        overall_nature: r.overall_nature || f.overall_nature,
        health_tag: r.health_tag.length ? r.health_tag : f.health_tag,
        positive_effect: r.positive_effect || f.positive_effect,
        risk_warning: r.risk_warning || f.risk_warning,
        scenes: r.scenes.length ? r.scenes : f.scenes,
        rec_crowds: r.rec_crowds.length ? r.rec_crowds : f.rec_crowds,
        cautious_crowds: Array.from(new Set([...f.cautious_crowds, ...r.cautious_crowds])),
        forbidden_crowds: r.forbidden_crowds.length ? r.forbidden_crowds : f.forbidden_crowds,
      }
    })
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
    const moments = `今天被${name}暖到了。${tags ? `${tags}缓缓补回来，` : ''}把好好吃饭这件小事，过成对自己的犒赏。`
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

  // —— 拖拽读取图片：上传到存储桶，返回真实图片 URL ——
  const readFilesToUpload = async (files: FileList | File[]): Promise<string[]> => {
    const arr = Array.from(files)
    const out: string[] = []
    for (const f of arr) out.push(await uploadProductAsset(f))
    return out
  }
  const onDropSub = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOverSub(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    const urls = await readFilesToUpload(files)
    setForm(f => ({ ...f, sub_images: [...f.sub_images, ...urls].slice(0, 9) }))
  }
  const onDropDetail = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOverDetail(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    const urls = await readFilesToUpload(files)
    setForm(f => ({ ...f, detail_images: [...f.detail_images, ...urls].slice(0, 20) }))
  }

  // —— 规则引擎一键生成食疗文案（复用已部署 food-therapy-ai · copy 模式，内置医疗宣称闸门）——
  const handleRuleGenerate = async () => {
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
        setEmotionFlash(`已生成食疗文案（来源：${data.source === 'llm' ? '大模型润色' : '本地规则兜底'}）\n可在下方直接微调后再保存`)
      } else {
        setForm(f => ({ ...f, ...rule }))
        setEmotionFlash('⚠️ 云端润色未响应，已用本地规则生成文案，可直接微调')
      }
    } catch (e: any) {
      setForm(f => ({ ...f, ...rule }))
      setEmotionFlash('生成异常，已用本地规则兜底：' + String(e?.message || e))
    } finally {
      setGenerating(false)
      setTimeout(() => setEmotionFlash(null), 7000)
    }
  }

  // 一键智能填充：识别食材 → 食疗分析 → 文案生成，一条龙跑完（用最新值，避免 state 滞后）
  // 运营只需填「商品名称 + 售价 + 库存」，点此即自动产出食疗字段与导购文案
  const handleSmartFill = async () => {
    if (!form.name) { window.alert('请先填写商品名称'); return }
    setGenerating(true)
    // 1) 食材识别（合并已有 + 按名匹配）
    const keys = matchIngredientKeys(form.name)
    const existing = new Set(form.ingredients.map(it => it.id))
    const added = keys.filter(k => !existing.has(k)).map(k => dictKeyToItem(k)).filter(Boolean) as IngredientItem[]
    const mergedIngredients = [...form.ingredients, ...added]
    // 2) 食疗分析
    const r = analyzeDish(form.name, mergedIngredients.map(i => i.id))
    const prevById = new Map(form.ingredients.map(it => [it.id, it]))
    const items: IngredientItem[] = r.ingredients.map(k => prevById.get(k) ?? dictKeyToItem(k)).filter(Boolean) as IngredientItem[]
    const merged = {
      ...form,
      ingredients: items,
      food_category: r.food_category || form.food_category,
      overall_nature: r.overall_nature || form.overall_nature,
      health_tag: r.health_tag.length ? r.health_tag : form.health_tag,
      positive_effect: r.positive_effect || form.positive_effect,
      risk_warning: r.risk_warning || form.risk_warning,
      scenes: r.scenes.length ? r.scenes : form.scenes,
      rec_crowds: r.rec_crowds.length ? r.rec_crowds : form.rec_crowds,
      cautious_crowds: Array.from(new Set([...form.cautious_crowds, ...r.cautious_crowds])),
      forbidden_crowds: r.forbidden_crowds.length ? r.forbidden_crowds : form.forbidden_crowds,
    }
    setForm(merged)
    // 3) 文案（本地规则 + 云端润色，用最新值）
    const rule = buildRuleCopy(merged)
    try {
      const { data, error } = await supabase.functions.invoke('food-therapy-ai', {
        body: {
          mode: 'copy',
          name: merged.name,
          nature: merged.overall_nature || '',
          health_tags: merged.health_tag,
          emotion_tags: merged.emotion_tag,
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
        setEmotionFlash(`已智能填充（分析+文案，来源：${data.source === 'llm' ? '大模型润色' : '本地规则兜底'}）\n系统已自动产出食疗字段，可展开「商品食疗系统」核对，或点「专家微调」手动修正`)
      } else {
        setForm(f => ({ ...f, ...rule }))
        setEmotionFlash('⚠️ 云端润色未响应，已用本地规则生成文案，可直接微调')
      }
    } catch (e: any) {
      setForm(f => ({ ...f, ...rule }))
      setEmotionFlash('生成异常，已用本地规则兜底：' + String(e?.message || e))
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
      barcode: form.barcode ? form.barcode.trim() : null,
      barcode_type: 'EAN13',
      description: form.desc,
      main_image: form.main_image,
      sub_images: form.sub_images,
      detail_images: form.detail_images,
      video_url: form.video_url,
      discount_rate: dr || null,
      category_id: form.category_id || null,
      sub_category_id: form.sub_category_id || null,
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
      // 商品类型 + 礼品详情 + 适合人群覆盖（对齐小程序 merchant-products/index.tsx payload）
      is_active: !!form.is_active,
      product_kind: form.product_kind || 'food',
      fit_people_override: form.fit_people_override || null,
      materials: form.materials.length ? form.materials : null,
      gift_meaning: form.gift_meaning || null,
      gift_craft: form.gift_craft || null,
      gift_scene: form.gift_scene || null,
      gift_care: form.gift_care || null,
    }
    let inserted: any = null  // 新建商品插入后取真实 id（用于本地 state 同步）
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
              // 对齐小程序口径：review_status 恒为 pending，is_active 由「立即上架」开关决定（保存即上架）
              review_status: 'pending',
              is_active: !!form.is_active,
              created_at: new Date().toISOString().slice(0, 10),
            }).select().single()
      try {
        const res: any = await persist(body)
        if (res?.error) throw res.error
        if (!editing && res?.data) inserted = res.data
      } catch (e: any) {
        const msg = e?.message || ''
        // 软降级：若 products 表尚未加导购相关列（迁移 00090 / 00100 / 00104 未执行），
        // 或部分核心列缺失，剥离后重试，保证保存不失败（与小程序端 api.ts 一致）
        if (/column|status|sales|ingredients|overall_nature|health_tag|emotion_tag|match_goods|conflict_goods|aux_remind|food_category|positive_effect|risk_warning|emotion_copy|scenes|rec_crowds|cautious_crowds|cautious_notes|forbidden_crowds|forbidden_reasons|combo_product_ids|guide_sentence|moments_copy|taboo_warning|product_kind|fit_people_override|materials|gift_meaning|gift_craft|gift_scene|gift_care/.test(msg)) {
          const { ingredients, overall_nature, health_tag, emotion_tag, match_goods, conflict_goods, aux_remind,
            food_category, positive_effect, risk_warning, emotion_copy, scenes, rec_crowds, cautious_crowds,
            cautious_notes, forbidden_crowds, forbidden_reasons, combo_product_ids, guide_sentence, moments_copy,
            taboo_warning, product_kind, fit_people_override, materials, gift_meaning, gift_craft, gift_scene, gift_care, ...rest } = body
          const res2: any = await persist(rest)
          if (res2?.error) {
            window.alert(`保存失败（已尝试剥离可选列仍失败）：\n${res2.error.message}${res2.error.hint ? '\n提示：' + res2.error.hint : ''}`)
            console.error('[Products] 软降级仍失败:', res2.error); return
          }
          if (!editing && res2?.data) inserted = res2.data
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
        id: inserted?.id || `new-${Date.now()}`, store_id: storeId || 'store-1', ...body,
        image_url: null,
        category_id: body.category_id || '',
        status: (body.is_active ? 'online' : 'offline') as 'online' | 'offline',
        review_status: 'pending',
        sales: 0,
        is_active: !!body.is_active,
        created_at: new Date().toISOString().slice(0, 10),
        barcode: inserted?.barcode || body.barcode,
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
        setEmotionFlash(`${data.emotion_title || ''}\n${data.emotion_detail || ''}${data.compiled_by ? `（${data.compiled_by}）` : ''}`)
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

      {/* 🏷 条形码制作：统一入口在独立「条形码制作」菜单页，这里只做快捷跳转，避免功能重复 */}
      <div style={{ marginTop: 16, background: 'linear-gradient(135deg,#0F172A,#1E293B)', borderRadius: 16, padding: 18, boxShadow: '0 6px 20px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 700 }}>🏷 条形码制作</h3>
          <span style={{ color: '#10B981', fontSize: 11, fontWeight: 700, border: '1px solid #10B981', borderRadius: 6, padding: '2px 8px' }}>快捷入口</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.7 }}>生成 EAN-13 店内码、打印空白标签、扫码上架，统一在「条形码制作」独立页面操作。</p>
        <button onClick={() => navigate('/merchant/barcode-maker')} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          前往条形码制作 →
        </button>
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

      {/* 商品取数异常提示（列表已置空，避免与假数据混淆） */}
      {loadErr && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--warning)', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16,
        }}>
          <span style={{ color: 'var(--text)', fontSize: 13 }}>⚠️ 商品列表未能加载：{loadErr}</span>
          <button
            onClick={() => load()}
            style={{
              flexShrink: 0, padding: '6px 16px', background: 'var(--surface)',
              border: '1px solid var(--border-strong)', borderRadius: 6,
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            }}
          >重新加载</button>
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
          gridTemplateColumns: '80px 1fr 90px 90px 80px 80px 70px 70px 70px 70px 160px',
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
          <span style={{ textAlign: 'center' }}>库存</span>
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
              gridTemplateColumns: '80px 1fr 90px 90px 80px 80px 70px 70px 70px 70px 160px',
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
              {/* stock */}
              <div style={{ textAlign: 'center', color: p.stock > 0 ? 'var(--text-muted)' : 'var(--danger)' }}>
                {p.stock ?? 0}{p.stock <= 0 && <span style={{ marginLeft: 2, fontSize: 10 }}>缺</span>}
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

              <Section title="基础信息" open={sections.base} onToggle={() => toggleSection('base')} hint="名称 / 描述 / 类型">
              <label>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品名称 *</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="请输入商品名称" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </label>
              <label>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品描述</span>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="请输入商品描述" rows={3} style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>

              {/* ===== 商品类型（食养食品 / 礼品 / 手作 / 护理） ===== */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品类型</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {([
                    { k: 'food', label: '食养食品' },
                    { k: 'gift', label: '药膳手串礼品' },
                    { k: 'craft', label: '手作' },
                    { k: 'care', label: '护理' },
                  ] as const).map(opt => {
                    const sel = (form.product_kind || 'food') === opt.k
                    return (
                      <button key={opt.k} type="button" onClick={() => setForm(f => ({ ...f, product_kind: opt.k }))}
                        style={{ padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          background: sel ? 'var(--success-strong)' : 'var(--bg)',
                          border: `1px solid ${sel ? 'var(--success-strong)' : 'var(--border-soft)'}`,
                          color: sel ? '#ECFDF5' : 'var(--text-muted)' }}>{opt.label}</button>
                    )
                  })}
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>礼品 / 手作 / 护理 不进入食疗引擎，请填写下方「寓意 / 材质」等说明</span>
              </div>

              {/* 礼品 / 手作 / 护理：材质与寓意详情（product_kind !== 'food' 时显示） */}
              {form.product_kind !== 'food' && (
                <div style={{ marginBottom: 14, padding: 14, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
                  <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>礼品 / 手作 / 护理 详情</span>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>寓意文化（gift_meaning）</span>
                    <textarea value={form.gift_meaning} onChange={e => setForm(f => ({ ...f, gift_meaning: e.target.value }))} maxLength={200} placeholder="如：平安顺遂、福气满满" rows={2}
                      style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>材质 / 草本成分（materials，逗号分隔）</span>
                    <textarea value={form.materials.join('、')} onChange={e => setForm(f => ({ ...f, materials: e.target.value.split(/[、，,\s]+/).filter(Boolean) }))} maxLength={200} placeholder="如：天然木珠、艾草、亚麻；绝不填食用食材" rows={2}
                      style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>注意：此处仅填材质 / 草本成分，绝不填食用食材（避免误触食疗引擎）</span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>材质工艺说明（gift_craft）</span>
                    <textarea value={form.gift_craft} onChange={e => setForm(f => ({ ...f, gift_craft: e.target.value }))} maxLength={200} placeholder="如：手工打磨、植物染" rows={2}
                      style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>送礼场景（gift_scene）</span>
                    <textarea value={form.gift_scene} onChange={e => setForm(f => ({ ...f, gift_scene: e.target.value }))} maxLength={200} placeholder="如：生日、乔迁、节日馈赠" rows={2}
                      style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>保养与使用注意（gift_care）</span>
                    <textarea value={form.gift_care} onChange={e => setForm(f => ({ ...f, gift_care: e.target.value }))} maxLength={200} placeholder="如：避免暴晒、定期擦拭" rows={2}
                      style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
              </Section>

              <Section title="价格与库存" open={sections.price} onToggle={() => toggleSection('price')} hint="售价 / 成本价 / 库存 / 上架">
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

              {/* 立即上架开关（P0-4） */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
                <div>
                  <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>立即上架</span>
                  <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '2px 0 0' }}>开启后保存即对外可见；关闭则保存为下架（待后端审核）</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 3,
                    background: form.is_active ? 'var(--success-strong)' : 'var(--border-soft)' }}>
                  <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', marginLeft: form.is_active ? 20 : 0, transition: 'margin-left .2s' }} />
                </button>
              </div>

              {/* 条码（EAN-13 店内码，超市同款）：生成 / 预览 / 打印 */}
              <div style={{ marginTop: 14, padding: 14, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>商品条码（EAN-13 店内码）</span>
                <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="13 位 EAN-13，可留空一键生成" style={{ width: '100%', marginTop: 8, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={onGenerateBarcode} disabled={generatingBarcode || !editing}
                    style={{ padding: '6px 14px', background: (generatingBarcode || !editing) ? 'var(--border-soft)' : 'var(--success-strong)', border: '1px solid ' + (generatingBarcode || !editing ? 'var(--border-soft)' : 'var(--success-strong)'), borderRadius: 8, color: (generatingBarcode || !editing) ? 'var(--text-dim)' : '#fff', cursor: (generatingBarcode || !editing) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {generatingBarcode ? '生成中…' : '⚡ 一键生成店内码'}
                  </button>
                  {form.barcode && (
                    <button type="button" onClick={onPrintBarcode} disabled={printingBarcode}
                      style={{ padding: '6px 14px', background: printingBarcode ? 'var(--border-soft)' : 'var(--primary-strong)', border: '1px solid ' + (printingBarcode ? 'var(--border-soft)' : 'var(--primary)'), borderRadius: 8, color: printingBarcode ? 'var(--text-dim)' : '#fff', cursor: printingBarcode ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                      {printingBarcode ? '打印中…' : '🖨 打印标签'}
                    </button>
                  )}
                </div>
                {form.barcode ? (
                  <div style={{ marginTop: 12 }}>
                    {(() => {
                      const enc = encodeEAN13(form.barcode)
                      if (!enc) return <span style={{ color: 'var(--danger)', fontSize: 12 }}>条码格式无效（须为 13 位 EAN-13）</span>
                      return (
                        <div style={{ background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '10px', display: 'inline-block' }}>
                          <div style={{ display: 'flex', flexDirection: 'row', height: 54, justifyContent: 'center' }}>
                            {enc.modules.split('').map((m, i) => (
                              <span key={i} style={{ display: 'inline-block', width: 2, height: 54, background: m === '1' ? '#000' : '#fff' }} />
                            ))}
                          </div>
                          <div style={{ fontSize: 13, letterSpacing: 2, marginTop: 6, color: '#333', textAlign: 'center', fontFamily: 'monospace' }}>{form.barcode}</div>
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '10px 0 0' }}>无条码：可「一键生成店内码」（EAN-13 超市同款），再打印标签贴商品。</p>
                )}
              </div>

              {/* 让利% */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>商品让利 %</span>
                  <input value={form.discount_rate} onChange={e => setForm(f => ({ ...f, discount_rate: e.target.value }))} onBlur={e => {
                    const v = Number(e.target.value)
                    if (v > 30) setForm(f => ({ ...f, discount_rate: '30' }))
                  }} type="number" placeholder="0" min={0} max={100} style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
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
            </Section>

            <Section title="商品分类" open={sections.category} onToggle={() => toggleSection('category')} hint="预设 / 自定义">
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
                  style={{ padding: '4px 12px', background: 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--primary-strong)', cursor: 'pointer', fontSize: 12 }}>
                  管理分类
                </button>
              </div>
              <select value={form.sub_category_id || form.category_id || ''}
                onChange={e => {
                  const v = e.target.value
                  const cat = categories.find(c => c.id === v)
                  // 选「整个场景」(一级) → category_id=场景，sub_category_id 清空；
                  // 选二级子类 → category_id=其一级父，sub_category_id=二级（与小程序端同源：一级归 category_id，二级仅筛选）
                  if (!v || !cat || !cat.parent_id) setForm(f => ({ ...f, category_id: v, sub_category_id: '' }))
                  else setForm(f => ({ ...f, category_id: cat.parent_id as string, sub_category_id: v }))
                }}
                style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">未分类</option>
                {categories.filter(c => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order).map(p => {
                  const kids = categories.filter(c => c.parent_id === p.id).sort((a, b) => a.sort_order - b.sort_order)
                  const tag = p.scope === 'global' ? ' 🌐' : ''
                  return kids.length ? (
                    <optgroup key={p.id} label={`${p.name}${tag}`}>
                      <option value={p.id}>{p.name}（整个场景）</option>
                      {kids.map(k => <option key={k.id} value={k.id}>　└ {k.name}</option>)}
                    </optgroup>
                  ) : (
                    <option key={p.id} value={p.id}>{p.name}{tag}</option>
                  )
                })}
              </select>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>选二级子类会自动归到对应场景；🌐 为平台全局分类，对所有门店生效</span>
            </div>
            </Section>

            <Section title="原料成分" open={sections.ingredients} onToggle={() => toggleSection('ingredients')} hint="可选 · 自动识别">
            {/*  原料成分分析（可选） */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}> 原料成分分析（可选）</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={autoDetectIngredients} disabled={!form.name}
                    style={{ padding: '6px 14px', background: (!form.name) ? 'var(--border-soft)' : 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 8, color: (!form.name) ? 'var(--text-dim)' : 'var(--text)', cursor: (!form.name) ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                    自动识别
                  </button>
                  <button type="button" onClick={handleAnalyzeDish} disabled={!form.name}
                    style={{ padding: '6px 14px', background: (!form.name) ? 'var(--border-soft)' : 'var(--success-strong)', border: '1px solid var(--success-strong)', borderRadius: 8, color: (!form.name) ? 'var(--text-dim)' : '#fff', cursor: (!form.name) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                    食疗分析
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 8px' }}>根据商品名自动识别食材，匹配食养成分（性味 / 功效 / 适合人群 / 场景）。</p>
              {form.ingredients.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px', background: 'var(--bg)', border: '1px dashed var(--border-soft)', borderRadius: 8 }}>尚未选择原料，可点「自动识别」或下方手动勾选。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {form.ingredients.map((it) => (
                    <div key={it.id} style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{it.name}</span>
                          <span style={{ fontSize: 11, color: '#fff', background: 'var(--success-strong)', padding: '1px 8px', borderRadius: 10 }}>{it.nature}</span>
                        </div>
                        <button type="button" onClick={() => setForm(f => ({ ...f, ingredients: f.ingredients.filter(x => x.id !== it.id) }))}
                          style={{ padding: '2px 10px', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>✕ 移除</button>
                      </div>
                      {/* 占比 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>占比 %</span>
                        <input type="number" min={0} max={100} value={it.ratio} onChange={e => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                          setForm(f => ({ ...f, ingredients: f.ingredients.map(x => x.id === it.id ? { ...x, ratio: v } : x) }))
                        }} style={{ width: 70, padding: '6px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>（越高该食材在配方中占比越大）</span>
                      </div>
                      {/* 烹饪方式 */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>烹饪方式</span>
                        {COOKING_METHODS.map(m => {
                          const sel = it.cooking === m
                          return (
                            <button key={m} type="button" onClick={() => setForm(f => ({ ...f, ingredients: f.ingredients.map(x => x.id === it.id ? { ...x, cooking: m } : x) }))}
                              style={{ padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12, background: sel ? 'var(--success-strong)' : 'var(--surface-2)', border: `1px solid ${sel ? 'var(--success-strong)' : 'var(--border-soft)'}`, color: sel ? '#ECFDF5' : 'var(--text-muted)' }}>{m}</button>
                          )
                        })}
                      </div>
                      {/* 辅料 */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>辅料</span>
                        {AUX_OPTIONS.map(a => {
                          const sel = it.aux.includes(a)
                          return (
                            <button key={a} type="button" onClick={() => setForm(f => ({ ...f, ingredients: f.ingredients.map(x => x.id === it.id ? { ...x, aux: sel ? x.aux.filter(y => y !== a) : [...x.aux, a] } : x) }))}
                              style={{ padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12, background: sel ? '#FDE68A' : 'var(--surface-2)', border: '1px solid #E5C07B', color: sel ? '#1F9D6B' : 'var(--text-muted)' }}>{a}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(INGREDIENT_DICT).map(([key, e]) => {
                  const active = form.ingredients.some(it => it.id === key)
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

            </Section>

            <Section title="商品食疗系统" open={sections.therapy} onToggle={() => toggleSection('therapy')} hint="系统自动计算 · 可一键填充">
            {/*  商品食疗智能系统 · 完整录入（商家一次录入，前端自动匹配） */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}> 商品食疗系统（系统自动计算）</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleSmartFill} disabled={generating || !form.name}
                    style={{ padding: '6px 14px', background: (generating || !form.name) ? 'var(--border-soft)' : 'var(--primary-strong)', border: 'none', borderRadius: 8, color: (generating || !form.name) ? 'var(--text-dim)' : '#fff', cursor: (generating || !form.name) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {generating ? '填充中…' : '⚡ 一键智能填充'}
                  </button>
                  <button type="button" onClick={handleRuleGenerate} disabled={generating || !form.name}
                    style={{ padding: '6px 14px', background: 'var(--border)', border: '1px solid var(--border-soft)', borderRadius: 8, color: (generating || !form.name) ? 'var(--text-dim)' : 'var(--text)', cursor: (generating || !form.name) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {generating ? '生成中…' : '重新生成文案'}
                  </button>
                  <button type="button" onClick={() => setExpertMode(v => !v)}
                    style={{ padding: '6px 14px', background: expertMode ? 'rgba(194,65,12,0.12)' : 'var(--bg)', border: `1px solid ${expertMode ? 'var(--primary)' : 'var(--border-soft)'}`, borderRadius: 8, color: expertMode ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
                    {expertMode ? '✓ 专家微调开' : '专家微调'}
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 8px' }}>点「一键智能填充」即按商品名自动识别食材、计算性味 / 人群 / 安全分析并生成导购文案；下方字段由系统产出，默认只读，仅少数场景需点「专家微调」手动覆盖。</p>

              {/* 实时食疗安全分析（P1-8）：复用 analyzeDish 对当前名称+食材做系统判定 */}
              <div style={{ marginBottom: 14, padding: 14, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>实时食疗安全分析</span>
                  <button type="button" disabled={!form.name && form.ingredients.length === 0}
                    onClick={() => {
                      const r = analyzeDish(form.name, form.ingredients.map(i => i.id))
                      const allergens = Array.from(new Set(form.ingredients.flatMap(i => i.allergens || [])))
                      const chronic = Array.from(new Set(form.ingredients.flatMap(i => i.chronic_tags || [])))
                      const note = [
                        r.overall_nature ? `整体性味：${r.overall_nature}。` : '',
                        r.risk_warning ? `食用参考：${r.risk_warning}。` : '',
                        r.forbidden_crowds.length ? `禁忌人群：${r.forbidden_crowds.join('、')}。` : '',
                        r.cautious_crowds.length ? `谨慎人群：${r.cautious_crowds.join('、')}。` : '',
                      ].filter(Boolean).join('')
                      setLiveSafety({
                        overall_nature: r.overall_nature,
                        risks: { red: [...allergens, ...r.forbidden_crowds], orange: r.cautious_crowds, blue: chronic },
                        note,
                      })
                    }}
                    style={{ padding: '6px 14px', background: (!form.name && form.ingredients.length === 0) ? 'var(--border-soft)' : 'var(--info)', border: 'none', borderRadius: 8, color: (!form.name && form.ingredients.length === 0) ? 'var(--text-dim)' : '#fff', cursor: (!form.name && form.ingredients.length === 0) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                    实时安全分析
                  </button>
                </div>
                {liveSafety && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 150, padding: '8px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid var(--danger)' }}>
                        <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 700 }}>🔴 过敏 / 禁忌</span>
                        <div style={{ marginTop: 4, color: 'var(--danger)', fontSize: 12 }}>{liveSafety.risks.red.length ? liveSafety.risks.red.join('、') : '无'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 150, padding: '8px 10px', borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid var(--warning)' }}>
                        <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 700 }}>🟠 体质慎食</span>
                        <div style={{ marginTop: 4, color: 'var(--status-orange)', fontSize: 12 }}>{liveSafety.risks.orange.length ? liveSafety.risks.orange.join('、') : '无'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 150, padding: '8px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid var(--info)' }}>
                        <span style={{ color: 'var(--info)', fontSize: 12, fontWeight: 700 }}>🔵 慢病适配</span>
                        <div style={{ marginTop: 4, color: '#1D4ED8', fontSize: 12 }}>{liveSafety.risks.blue.length ? liveSafety.risks.blue.join('、') : '无'}</div>
                      </div>
                    </div>
                    {liveSafety.note && (
                      <div style={{ marginTop: 10 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>商家提示文案（可一键套用至商品描述）</span>
                        <textarea value={liveSafety.note} readOnly rows={3}
                          style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                        <button type="button" onClick={() => setForm(f => ({ ...f, desc: liveSafety.note }))}
                          style={{ marginTop: 6, padding: '6px 14px', background: 'var(--success-strong)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>一键套用</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 整体性味（系统自动计算，专家微调可覆盖） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>整体性味（系统自动）</span>
                <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: form.overall_nature ? 'var(--text)' : 'var(--text-dim)', fontSize: 14 }}>
                  {form.overall_nature || '点「一键智能填充」后自动判定'}
                </div>
                {expertMode && (
                  <select value={form.overall_nature} onChange={e => setForm(f => ({ ...f, overall_nature: e.target.value }))}
                    style={{ width: '100%', marginTop: 8, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                    <option value="">未设置（将按原料自动聚合）</option>
                    {NATURE_SCALE.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>

              {/* 食养阶段（清通调补固，系统自动派生，专家微调可覆盖） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>食养阶段（系统自动）</span>
                <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: form.food_stage ? 'var(--text)' : 'var(--text-dim)', fontSize: 14 }}>
                  {form.food_stage ? ({ 清: '清阶 · 清火润燥', 通: '通阶 · 通肠益菌', 调: '调阶 · 健脾养胃', 补: '补阶 · 补钙增营', 固: '固阶 · 固本均衡' } as Record<string, string>)[form.food_stage] : '点「一键智能填充」后自动判定'}
                </div>
                {expertMode && (
                  <select value={form.food_stage} onChange={e => setForm(f => ({ ...f, food_stage: e.target.value }))}
                    style={{ width: '100%', marginTop: 8, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}>
                    <option value="">未设置（按核心食材主导功效自动判定）</option>
                    <option value="清">清阶 · 清火润燥</option>
                    <option value="通">通阶 · 通肠益菌</option>
                    <option value="调">调阶 · 健脾养胃</option>
                    <option value="补">补阶 · 补钙增营</option>
                    <option value="固">固阶 · 固本均衡</option>
                  </select>
                )}
              </div>

              {/* 食疗滋养效果：正向 + 风险（系统自动，只读） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>正向调理作用（系统自动）</span>
                <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: form.positive_effect ? 'var(--text)' : 'var(--text-dim)', fontSize: 14, minHeight: 38, whiteSpace: 'pre-wrap' }}>
                  {form.positive_effect || '点「一键智能填充」后自动产出'}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>食用参考（系统自动）</span>
                <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: form.risk_warning ? 'var(--text)' : 'var(--text-dim)', fontSize: 14, minHeight: 38, whiteSpace: 'pre-wrap' }}>
                  {form.risk_warning || '点「一键智能填充」后自动产出'}
                </div>
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

              {/* 人群标签（系统自动判定，只读；专家微调可改说明/覆盖） */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>① 五星推荐人群（系统自动）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {form.rec_crowds.length ? form.rec_crowds.map(c => (
                    <span key={c} style={{ padding: '4px 10px', background: '#065F46', border: '1px solid var(--success-strong)', borderRadius: 999, fontSize: 12, color: '#ECFDF5' }}>{c}</span>
                  )) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>点「一键智能填充」后自动判定</span>}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>② 少量品鉴人群（系统自动）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {form.cautious_crowds.length ? form.cautious_crowds.map(c => (
                    <span key={c} style={{ padding: '4px 10px', background: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: 999, fontSize: 12, color: '#FEF3C7' }}>{c}</span>
                  )) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>无</span>}
                </div>
                {expertMode && (
                  <textarea value={form.cautious_notes} onChange={e => setForm(f => ({ ...f, cautious_notes: e.target.value }))} placeholder="如：少量饮用、去辣减油" rows={2}
                    style={{ width: '100%', marginTop: 6, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>③ 建议回避人群（系统自动）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {form.forbidden_crowds.length ? form.forbidden_crowds.map(c => (
                    <span key={c} style={{ padding: '4px 10px', background: '#7F1D1D', border: '1px solid var(--danger)', borderRadius: 999, fontSize: 12, color: '#FECACA' }}>{c}</span>
                  )) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>无</span>}
                </div>
                {expertMode && (
                  <textarea value={form.forbidden_reasons} onChange={e => setForm(f => ({ ...f, forbidden_reasons: e.target.value }))} placeholder="如：特殊体质建议回避、建议少量尝试" rows={2}
                    style={{ width: '100%', marginTop: 6, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                )}
              </div>

              {/* 适合人群覆盖（仅专家微调） */}
              {expertMode && (
                <div style={{ marginBottom: 14 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>适合人群（fit_people_override）</span>
                  <textarea value={form.fit_people_override} onChange={e => setForm(f => ({ ...f, fit_people_override: e.target.value }))} placeholder="留空则由食疗引擎辨证推导；手填则直接作为「适合人群」展示" rows={2}
                    style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>若填写，将覆盖系统自动判定的适合人群（辨证增强迁移 00237）</span>
                </div>
              )}

              </Section>

              <Section title="门店营销配套" open={sections.marketing} onToggle={() => toggleSection('marketing')} hint="导购 / 朋友圈 / 忌口（可选）">
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
                <textarea value={form.moments_copy} onChange={e => setForm(f => ({ ...f, moments_copy: e.target.value }))} placeholder="如：今天被这碗鸡汤暖到了，暖到心底" rows={2}
                  style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>忌口红字警示语</span>
                <input value={form.taboo_warning} onChange={e => setForm(f => ({ ...f, taboo_warning: e.target.value }))} placeholder="如：经期量大、痛风人群慎点" style={{ width: '100%', marginTop: 4, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </Section>

            {/* 顾客视角预览（P0-3）：实时从当前表单渲染商品卡 */}
            <div style={{ marginTop: 24 }}>
              <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>顾客视角预览</span>
              <div style={{ marginTop: 8, display: 'flex', gap: 12, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 12 }}>
                <div style={{ width: 96, height: 96, borderRadius: 8, overflow: 'hidden', background: 'var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {form.main_image ? (
                    <img src={form.main_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>无主图</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>{form.name || '商品名称'}</span>
                    {form.overall_nature && (
                      <span style={{ fontSize: 11, color: '#fff', background: 'var(--success-strong)', padding: '1px 8px', borderRadius: 10 }}>{form.overall_nature}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                    <span style={{ color: 'var(--danger)', fontSize: 18, fontWeight: 700 }}>¥{form.price || '0'}</span>
                    {form.original_price && Number(form.original_price) > Number(form.price) && (
                      <span style={{ color: 'var(--text-dim)', fontSize: 12, textDecoration: 'line-through' }}>¥{form.original_price}</span>
                    )}
                  </div>
                  {form.rec_crowds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {form.rec_crowds.map(c => (
                        <span key={c} style={{ fontSize: 11, color: 'var(--success-strong)', background: 'rgba(16,185,129,0.12)', padding: '1px 8px', borderRadius: 999 }}>{c}</span>
                      ))}
                    </div>
                  )}
                  {form.desc && (
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{form.desc}</p>
                  )}
                </div>
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
              <button onClick={handleAddCategory} style={{ padding: '8px 16px', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>新建</button>
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
