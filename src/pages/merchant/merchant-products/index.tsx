// @title 商品管理（商家端）
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image, View, Text, Input, Textarea, Switch } from '@tarojs/components'
import Icon from '@/components/Icon'
import ProductGridCard from '@/components/ProductGridCard'
import { getProductCareInfo } from '@/utils/product-care'
import { HEALTH_TAGS, EMOTION_TAGS, NATURE_SCALE } from '@/utils/food-therapy/types'
import {
  getMerchantStore, getMerchantProducts, getMerchantOrders,
  createProduct, updateProduct, deleteProduct, getProductByBarcode,
  getCategories, createStoreCategory, updateStoreCategory, deleteStoreCategory,
  getNearExpiryProducts,
} from '@/db/api'
import { supabase } from '@/client/supabase'
import { uploadImage, uploadVideo } from '@/utils/upload'
import { SCENE_TAGS, type MoodTag } from '@/utils/mood-tags'
import { generateEmotionDescriptions } from '@/utils/emotion-description'
import { matchIngredientKeys, getIngredientEntries, searchIngredients } from '@/utils/ingredient-analysis'
import { analyzeProductFromName, type ProductAnalysis } from '@/utils/food-therapy/dishAnalyzer'
import type { Product, Store, StoreCategory } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

// 仅已付款/完成订单计入商品收益（与数据分析页 merchant-analytics 的 REVENUE_STATUSES 对齐）
const REVENUE_STATUSES = ['pending_ship', 'pending_receive', 'pending_review', 'completed']

type FormState = {
  name: string; price: string; original_price: string; cost_price: string
  discount_rate: string
  stock: string; description: string; barcode: string
  main_image: string; sub_images: string[]; detail_images: string[]; video_url: string
  is_active: boolean
  scene_tags: string[]
  ingredients: string[]
  attribute_keywords: string
  // —— 智能食养 · 情绪配对（让商品更懂用户）——
  overall_nature: string            // 整体性味：大寒/寒凉/平性/微温/温热/大热
  health_tag: string[]              // 食疗标签（最多3）
  emotion_tag: string[]             // 情绪配对标签（最多3）
  match_goods: string[]             // 宜搭商品 id
  conflict_goods: string[]          // 慎搭商品 id
  aux_remind: string                // 辅料提醒文案
  allergens: string[]               // 预测过敏原（智能识别填充）
  nutrition: { energy_kj?: number; protein_g?: number; fat_g?: number; carb_g?: number; sugar_g?: number; sodium_mg?: number } | null
  safety_grade: string              // 安全评级 S/A/C/D（智能识别填充）
  safety_summary: string            // 安全摘要（智能识别填充）
  category_id: string               // 商品分类（store_categories.id，空=未分类）
}
const emptyForm = (): FormState => ({
  name: '', price: '', original_price: '', cost_price: '', discount_rate: '',
  stock: '', description: '', barcode: '',
  main_image: '', sub_images: [], detail_images: [], video_url: '',
  is_active: true,
  scene_tags: [],
  ingredients: [],
  attribute_keywords: '',
  overall_nature: '',
  health_tag: [],
  emotion_tag: [],
  match_goods: [],
  conflict_goods: [],
  aux_remind: '',
  allergens: [],
  nutrition: null,
  safety_grade: '',
  safety_summary: '',
  category_id: '',
})

function calcMargin(price: number, cost?: number): string {
  if (!cost || cost <= 0 || price <= 0) return '-'
  return ((price - cost) / price * 100).toFixed(1) + '%'
}

// 整体性味色阶（寒凉偏冷蓝、平性中性绿、温热偏暖红），编辑端复用，与卡片一致
const NATURE_COLOR: Record<string, string> = {
  '大寒': '#0EA5E9', '寒凉': '#0EA5E9',
  '平性': '#10B981',
  '微温': '#F97316', '温热': '#EA580C', '大热': '#DC2626',
}

function MerchantProductsPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [scanning, setScanning] = useState(false)
  const [generating, setGenerating] = useState(false) // 是否正在生成描述
  const [descriptionCandidates, setDescriptionCandidates] = useState<string[]>([]) // 候选描述列表
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientResults, setIngredientResults] = useState<string[]>([])
  const [revenue, setRevenue] = useState({ totalRevenue: 0, totalProfit: 0, totalSales: 0 })
  // —— 商品分类（store_categories：本店 + 平台全局）——
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [expiryMap, setExpiryMap] = useState<Record<string, string>>({})

  // 智能识别（食疗/安全系统）：菜名 + 图片 → 自动识别属性
  const [dishName, setDishName] = useState('')
  const [dishImageUrl, setDishImageUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  const loadCategories = useCallback(async () => {
    if (!store) return
    try {
      const list = await getCategories({ storeId: store.id, includeGlobal: true })
      setCategories(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('[商品管理] 加载分类失败', e)
    }
  }, [store])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getMerchantStore()
      setStore(s)
      if (s) {
        const prods = await getMerchantProducts(s.id)
        setProducts(Array.isArray(prods) ? prods : [])
        // 商品管理 ↔ 临期预警串联：拉本店临期视图，按 product_id 聚合最严重阶段
        try {
          const exp = await getNearExpiryProducts({ storeId: s.id, limit: 200 }).catch(() => [] as any[])
          const rank: Record<string, number> = { red: 3, orange: 2, amber: 1 }
          const m: Record<string, string> = {}
          ;(exp || []).forEach((r: any) => {
            const cur = m[r.product_id]
            if (!cur || (rank[r.discount_stage] ?? 0) > (rank[cur] ?? 0)) m[r.product_id] = r.discount_stage
          })
          setExpiryMap(m)
        } catch { /* 容错：临期视图不可读不影响商品管理 */ }
        // 商品收益：从订单明细聚合（order_items 无 store_id 列，复用已按门店过滤的 getMerchantOrders）
        try {
          const items = (await getMerchantOrders(s.id, 0, 10000) || [])
            .filter((it: any) => REVENUE_STATUSES.includes(it.orders?.status))
          const agg: Record<string, { sales: number; revenue: number }> = {}
          ;(items || []).forEach((it: any) => {
            const pid = it.product_id
            if (!pid) return
            if (!agg[pid]) agg[pid] = { sales: 0, revenue: 0 }
            const qty = Number(it.quantity || 0)
            const price = Number(it.price ?? it.unit_price ?? 0)
            agg[pid].sales += qty
            agg[pid].revenue += price * qty
          })
          const costMap: Record<string, number> = {}
          ;(prods || []).forEach((p: any) => { costMap[p.id] = Number(p.cost_price || 0) })
          let totalSales = 0, totalRevenue = 0, totalProfit = 0
          Object.keys(agg).forEach(pid => {
            totalSales += agg[pid].sales
            totalRevenue += agg[pid].revenue
            totalProfit += agg[pid].revenue - costMap[pid] * agg[pid].sales
          })
          setRevenue({ totalSales, totalRevenue, totalProfit })
        } catch (re) {
          console.error('[商品管理] 商品收益聚合失败', re)
        }
      }
    } catch (e) {
      console.error('[商品管理] load 失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCategories() }, [loadCategories])

  // ─── 打开新增表单 ───
  const handleNewProduct = () => {
    setForm(emptyForm())
    setEditId(null)
    setShowForm(true)
  }

  // 扫码
  const handleScan = () => {
    if (!store) return
    setScanning(true)
    Taro.scanCode({
      scanType: ['barCode'],
      onlyFromCamera: true,
      success: async (res) => {
        setScanning(false)
        try {
          const existing = await getProductByBarcode(res.result)
          if (existing) {
            Taro.showModal({
              title: '条形码已存在',
              content: `「${existing.name}」已使用此码，是否编辑？`,
              confirmText: '去编辑',
              success: (r) => { if (r.confirm) openEdit(existing) },
            })
          } else {
            setForm(f => ({ ...emptyForm(), barcode: res.result }))
            setEditId(null); setShowForm(true)
          }
        } catch (e) {
          Taro.showToast({ title: '查询失败', icon: 'none' })
        }
      },
      fail: () => { setScanning(false); Taro.showToast({ title: '扫码取消', icon: 'none' }) },
    })
  }

  const openEdit = (p: Product) => {
    setForm({
      name: p.name,
      price: String(p.price),
      original_price: p.original_price != null ? String(p.original_price) : '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      discount_rate: p.discount_rate != null ? String(p.discount_rate) : '',
      stock: String(p.stock),
      description: p.description ?? '',
      barcode: p.barcode ?? '',
      main_image: p.main_image ?? p.image_url ?? '',
      sub_images: p.sub_images ?? [],
      detail_images: p.detail_images ?? [],
      video_url: p.video_url ?? '',
      is_active: p.is_active,
      scene_tags: p.scene_tags ?? [],
      ingredients: p.ingredients ?? [],
      attribute_keywords: '',
      overall_nature: p.overall_nature ?? '',
      health_tag: p.health_tag ?? [],
      emotion_tag: p.emotion_tag ?? [],
      match_goods: p.match_goods ?? [],
      conflict_goods: p.conflict_goods ?? [],
      aux_remind: p.aux_remind ?? '',
      allergens: (p as any).allergens ?? [],
      nutrition: (p as any).nutrition ?? null,
      safety_grade: (p as any).safety_grade ?? '',
      safety_summary: (p as any).safety_summary ?? '',
      category_id: p.category_id ?? '',
    })
    setEditId(p.id); setShowForm(true)
  }

  const handleSave = async () => {
    if (!store) return
    if (!form.name.trim()) { Taro.showToast({ title: '请填写商品名称', icon: 'none' }); return }
    const price = parseFloat(form.price)
    const stock = parseInt(form.stock)
    if (isNaN(price) || price <= 0) { Taro.showToast({ title: '价格不正确', icon: 'none' }); return }
    if (isNaN(stock) || stock < 0) { Taro.showToast({ title: '库存不正确', icon: 'none' }); return }
    setSaving(true)
    try {
      // 诊断：保存前打印当前用户与 store 归属，便于定位 RLS 拒绝根因
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      const uid = authData.user?.id
      const ownerId = (store as any).owner_id
      const ownerMatch = !!uid && !!ownerId && uid === ownerId

      // 关键守卫：session 失效（refresh_token 过期/被吊销）时，auth.uid() 为 null，
      // RLS 必然拒绝写入。此时应明确提示重新登录，而不是让用户看到「安全策略拒绝」的困惑报错。
      if (!uid) {
        Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2500 })
        setSaving(false)
        setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 600)
        return
      }
      // 归属不匹配：store.owner_id 与当前登录用户不一致，RLS 同样会拒绝
      if (!ownerMatch) {
        console.error('[商品管理] 归属不匹配：当前登录用户不是该门店 owner，RLS 将拒绝写入')
      }
      const payload: any = {
        name: form.name, description: form.description, price,
        stock, barcode: form.barcode && form.barcode.trim() ? form.barcode.trim() : null,
        main_image: form.main_image || undefined,
        sub_images: form.sub_images.length > 0 ? form.sub_images : undefined,
        detail_images: form.detail_images.length > 0 ? form.detail_images : undefined,
        video_url: form.video_url || undefined,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
        original_price: form.original_price ? parseFloat(form.original_price) : undefined,
        discount_rate: form.discount_rate ? Math.min(30, Math.max(0, parseFloat(form.discount_rate))) : undefined,
        scene_tags: form.scene_tags.length > 0 ? form.scene_tags : undefined,
        ingredients: form.ingredients.length > 0 ? form.ingredients : undefined,
        overall_nature: form.overall_nature || undefined,
        health_tag: form.health_tag.length > 0 ? form.health_tag : undefined,
        emotion_tag: form.emotion_tag.length > 0 ? form.emotion_tag : undefined,
        match_goods: form.match_goods.length > 0 ? form.match_goods : undefined,
        conflict_goods: form.conflict_goods.length > 0 ? form.conflict_goods : undefined,
        aux_remind: form.aux_remind.trim() || undefined,
        allergens: form.allergens.length > 0 ? form.allergens : undefined,
        nutrition: form.nutrition || undefined,
        safety_grade: form.safety_grade || undefined,
        safety_summary: form.safety_summary || undefined,
        is_active: form.is_active,
        category_id: form.category_id || null,
      }
      if (editId) {
        await updateProduct(editId, payload)
        Taro.showToast({ title: '修改成功', icon: 'success' })
      } else {
        const created = await createProduct({ ...payload, store_id: store.id })
        if (!created) {
          Taro.showToast({ title: '保存失败，请检查后重试', icon: 'error' })
          return
        }
        Taro.showToast({ title: '上架成功', icon: 'success' })
      }
      setShowForm(false); load()
    } catch (e: any) {
      console.error('[商品管理] 保存失败', e)
      const msg: string = e?.message || '未知错误'
      const code: string = e?.code || ''
      console.error('[商品管理] 错误码(code):', code, '| details:', e?.details)
      if (/row-level security|policy/.test(msg)) {
        Taro.showToast({ title: '被安全策略拒绝(权限不足)', icon: 'none', duration: 4000 })
      } else {
        Taro.showToast({ title: `保存失败：${msg.slice(0, 60)}`, icon: 'none', duration: 4000 })
      }
    } finally {
      setSaving(false)
    }
  }

  // 关闭弹窗
  const handleCloseForm = () => {
    setShowForm(false)
  }

  // —— 商品分类管理（新建/改名/删除/排序）——
  const handleAddCategory = async () => {
    if (!store) return
    const name = newCatName.trim()
    if (!name) { Taro.showToast({ title: '请输入分类名称', icon: 'none' }); return }
    setSaving(true)
    const created = await createStoreCategory({ storeId: store.id, name })
    setSaving(false)
    if (!created) { Taro.showToast({ title: '创建失败，请重试', icon: 'none' }); return }
    setNewCatName('')
    Taro.showToast({ title: '已新建分类', icon: 'success' })
    await loadCategories()
  }

  const handleSaveRename = async (cat: StoreCategory) => {
    const name = editingCatName.trim()
    if (!name) { setEditingCatId(null); return }
    setSaving(true)
    const ok = await updateStoreCategory(cat.id, { name })
    setSaving(false)
    setEditingCatId(null)
    if (!ok) { Taro.showToast({ title: '重命名失败', icon: 'none' }); return }
    await loadCategories()
  }

  const handleDeleteCategory = (cat: StoreCategory) => {
    Taro.showModal({
      title: '删除分类',
      content: `确认删除「${cat.name}」？该分类下的商品将自动归为「未分类」。`,
      confirmText: '删除',
      confirmColor: '#EF4444',
      success: async (r) => {
        if (!r.confirm) return
        setSaving(true)
        const ok = await deleteStoreCategory(cat.id)
        setSaving(false)
        if (!ok) { Taro.showToast({ title: '删除失败', icon: 'none' }); return }
        if (form.category_id === cat.id) setForm(f => ({ ...f, category_id: '' }))
        Taro.showToast({ title: '已删除', icon: 'success' })
        await loadCategories()
      },
    })
  }

  const handleMoveCategory = async (cat: StoreCategory, dir: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(c => c.id === cat.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    setSaving(true)
    await updateStoreCategory(cat.id, { sort_order: other.sort_order })
    await updateStoreCategory(other.id, { sort_order: cat.sort_order })
    setSaving(false)
    await loadCategories()
  }

  const catNameOf = (id: string | null | undefined): string => {
    if (!id) return '未分类'
    const c = categories.find(x => x.id === id)
    return c ? c.name : '未分类'
  }

  // 图片选择 → 上传到 Supabase Storage → 返回公网 URL
  const handleChooseMain = async () => {
    Taro.showLoading({ title: '上传中...' })
    const url = await uploadImage()
    if (url) setForm(f => ({ ...f, main_image: url }))
    else Taro.showToast({ title: '上传失败', icon: 'none' })
    Taro.hideLoading()
  }
  const handleChooseSub = async () => {
    const rest = 9 - form.sub_images.length
    if (rest <= 0) { Taro.showToast({ title: '最多9张副图', icon: 'none' }); return }
    Taro.showLoading({ title: '上传中...' })
    const urls = await uploadImage({ count: rest }) as string[]
    if (urls.length && urls[0]) setForm(f => ({ ...f, sub_images: [...f.sub_images, ...urls] }))
    Taro.hideLoading()
  }
  const handleChooseDetail = async () => {
    const rest = 20 - form.detail_images.length
    if (rest <= 0) { Taro.showToast({ title: '最多20张详情图', icon: 'none' }); return }
    Taro.showLoading({ title: '上传中...' })
    const urls = await uploadImage({ count: rest }) as string[]
    if (urls.length && urls[0]) setForm(f => ({ ...f, detail_images: [...f.detail_images, ...urls] }))
    Taro.hideLoading()
  }

  // 视频上传
  const handleChooseVideo = async () => {
    Taro.showLoading({ title: '上传中...' })
    const url = await uploadVideo()
    if (url) setForm(f => ({ ...f, video_url: url }))
    else Taro.showToast({ title: '上传失败', icon: 'none' })
    Taro.hideLoading()
  }

  // 🤖 智能识别：上传菜品/配料图作为识别素材
  const pickDishImage = async () => {
    Taro.showLoading({ title: '上传中...' })
    const url = await uploadImage()
    if (url) setDishImageUrl(url)
    else Taro.showToast({ title: '上传失败', icon: 'none' })
    Taro.hideLoading()
  }

  // 把识别结果回填到表单（识别出的字段覆盖，未识别的保留手动值）
  const fillFromAnalysis = (a: ProductAnalysis) => {
    setForm(f => ({
      ...f,
      ingredients: a.ingredients?.length ? a.ingredients : f.ingredients,
      overall_nature: a.overall_nature || f.overall_nature,
      health_tag: a.health_tag?.length ? a.health_tag : f.health_tag,
      emotion_tag: a.emotion_tag?.length ? a.emotion_tag : f.emotion_tag,
      aux_remind: a.aux_remind || f.aux_remind,
      allergens: a.allergens ?? [],
      nutrition: a.nutrition ?? null,
      safety_grade: a.safety_grade ?? '',
      safety_summary: a.safety_summary ?? '',
    }))
  }

  // 一键智能识别：优先 Edge Function（LLM/视觉），失败/未配置自动回退本地规则
  const runSmartAnalyze = async () => {
    if (!dishName.trim() && !dishImageUrl) {
      Taro.showToast({ title: '请先输入菜名或上传图片', icon: 'none' })
      return
    }
    setAnalyzing(true)
    try {
      const { data, error } = await supabase.functions.invoke('product-analyze', {
        body: { name: dishName.trim(), imageUrl: dishImageUrl || undefined },
      })
      if (data?.success && data.analysis) {
        fillFromAnalysis(data.analysis as ProductAnalysis)
        Taro.showToast({ title: 'AI 识别完成', icon: 'success' })
      } else {
        const local = analyzeProductFromName(dishName.trim(), form.ingredients)
        fillFromAnalysis(local)
        Taro.showToast({ title: '已本地识别（未配置AI）', icon: 'none' })
      }
    } catch (e) {
      const local = analyzeProductFromName(dishName.trim(), form.ingredients)
      fillFromAnalysis(local)
      Taro.showToast({ title: '已本地识别', icon: 'none' })
    } finally {
      setAnalyzing(false)
    }
  }

  // 场景标签切换
  const toggleSceneTag = (tag: string) => {
    setForm(f => {
      const tags = f.scene_tags.includes(tag)
        ? f.scene_tags.filter(t => t !== tag)
        : [...f.scene_tags, tag]
      return { ...f, scene_tags: tags }
    })
  }

  // 原料成分勾选切换
  const toggleIngredient = (key: string) => {
    setForm(f => {
      const has = f.ingredients.includes(key)
      return { ...f, ingredients: has ? f.ingredients.filter(k => k !== key) : [...f.ingredients, key] }
    })
  }

  // 通用数组字段切换（食疗标签/情绪配对/宜搭/慎搭，带上限）
  const toggleArrayField = (field: 'health_tag' | 'emotion_tag' | 'match_goods' | 'conflict_goods', val: string, max = 99) => {
    setForm(f => {
      const arr = f[field]
      if (arr.includes(val)) return { ...f, [field]: arr.filter(v => v !== val) }
      if (arr.length >= max) { Taro.showToast({ title: `最多选 ${max} 个`, icon: 'none' }); return f }
      return { ...f, [field]: [...arr, val] }
    })
  }

  // 智能识别原料：按商品名称匹配食材字典
  const handleIdentifyIngredients = () => {
    const keys = matchIngredientKeys(form.name)
    if (!keys.length) { Taro.showToast({ title: '未从名称识别到食材', icon: 'none' }); return }
    setForm(f => ({ ...f, ingredients: Array.from(new Set([...f.ingredients, ...keys])) }))
    Taro.showToast({ title: `已识别 ${keys.length} 种食材`, icon: 'success' })
  }

  const filtered = filter === 'all' ? products : products.filter(p => filter === 'online' ? p.is_active : !p.is_active)

  if (loading) return (
    <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FFF8F4' }}>
      <Text style={{ fontSize: '16px', color: '#999' }}>加载中...</Text>
    </View>
  )

  return (
    <RouteGuard>
    <View style={{ minHeight: '100vh', background: '#FFF8F4', paddingBottom: '32px' }}>

      {store && (
        <View style={{ margin: '8px 14px 0', padding: '10px 14px', borderRadius: '14px', background: '#FFF', border: '1px solid #F1E9D9' }}>
          <Text style={{ fontSize: '14px', color: '#888' }}>{store.name}</Text>
        </View>
      )}

      {/* 商品收益（对齐网页版商家后台） */}
      <View style={{ margin: '10px 14px 0', padding: '14px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFF3EC, #FFE7D6)', border: '1px solid #F8D9C0' }}>
        <Text style={{ fontSize: '14px', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>商品收益</Text>
        <View style={{ display: 'flex', marginTop: '10px' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: '20px', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>¥{revenue.totalRevenue.toFixed(2)}</Text>
            <Text style={{ fontSize: '12px', color: '#A86A4A', marginTop: '2px' }}>总营收</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', borderLeftWidth: '1px', borderLeftColor: '#F0D3BC', borderLeftStyle: 'solid', borderRightWidth: '1px', borderRightColor: '#F0D3BC', borderRightStyle: 'solid' }}>
            <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#16A34A' }}>¥{revenue.totalProfit.toFixed(2)}</Text>
            <Text style={{ fontSize: '12px', color: '#A86A4A', marginTop: '2px' }}>总利润</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>{revenue.totalSales}</Text>
            <Text style={{ fontSize: '12px', color: '#A86A4A', marginTop: '2px' }}>总销量</Text>
          </View>
        </View>
      </View>

      {/* 搜索框 */}
      <View style={{ padding: '10px 14px 0' }}>
        <View style={{
          height: '40px', borderRadius: '12px',
          background: '#FAF6F1', border: '1px solid #E8DDD4',
          display: 'flex', alignItems: 'center', paddingHorizontal: '14px',
        }}>
          <Input
            style={{ width: '100%', fontSize: '14px', color: '#333' }}
            placeholder="搜索商品..."
            placeholderStyle="color:#BBB;font-size:14px" />
        </View>
      </View>

      {/* 筛选 Tab */}
      <View style={{
        display: 'flex', margin: '10px 14px', padding: '4px',
        background: '#F5F0EB', borderRadius: '14px',
      }}>
        {(['all', 'online', 'offline'] as const).map(key => (
          <View key={key}
            onClick={() => setFilter(key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 0', borderRadius: '12px',
              background: filter === key ? '#FFF' : 'transparent',
            }}>
            <Text style={{
              fontSize: '14px', fontWeight: 'bold',
              color: filter === key ? 'hsl(var(--primary))' : '#999',
            }}>{key === 'all' ? '全部' : key === 'online' ? '在售' : '下架'}</Text>
          </View>
        ))}
      </View>

      {/* 操作按钮 —— 关键修复区域 */}
      <View style={{ display: 'flex', gap: '10px', padding: '4px 14px 0' }}>
        {/* 新增商品按钮 */}
        <View
          onClick={handleNewProduct}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '13px 16px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #C77B47, hsl(var(--primary)))',
            boxShadow: '0 2px 8px rgba(255,87,34,0.25)',
          }}>
          <Text style={{ color: '#FFF', fontSize: '15px', fontWeight: 'bold' }}>+ 新增商品</Text>
        </View>
        {/* 扫码上架按钮 */}
        <View
          onClick={handleScan}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '13px 16px', borderRadius: '14px',
            background: '#FFF', border: '2px solid #FF8A65',
          }}>
          {scanning
            ? <Text style={{ fontSize: '15px', color: 'hsl(var(--primary))' }}>扫描中…</Text>
            : <Text style={{ color: 'hsl(var(--primary))', fontSize: '15px', fontWeight: 'bold' }}>📷 扫码上架</Text>}
        </View>
      </View>

      {/* 扫码规范说明 */}
      <View style={{ padding: '6px 18px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Text style={{ fontSize: '11px', color: '#BBB' }}>📷 仅支持摄像头扫描一维条形码，不支持相册图片识别，杜绝作弊</Text>
      </View>

      {/* 商品列表 */}
      {filtered.length === 0 ? (
        <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0 20px', gap: '12px' }}>
          <Icon name="box" size={48} className="text-muted-foreground" />
          <Text style={{ fontSize: '14px', color: '#999' }}>暂无商品，点击上方"新增商品"添加</Text>
        </View>
      ) : (
        filtered.map(p => {
          const margin = calcMargin(p.price, p.cost_price)
          return (
            <View key={p.id} style={{ margin: '10px 14px 0', borderRadius: '16px', background: '#FFF', border: '1px solid #F1E9D9', overflow: 'hidden' }}>
              <View style={{ display: 'flex', gap: '12px', padding: '12px' }}>
                <View style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#F5F0EB', flexShrink: 0, overflow: 'hidden' }}>
                  {(p.main_image ?? p.image_url)
                    ? <Image src={p.main_image ?? p.image_url!} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
                    : <View style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: '24px' }}>🖼️</Text>
                      </View>}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', flex: 1 }}>{p.name}</Text>
                    <View style={{
                      padding: '2px 8px', borderRadius: '10px',
                      background: p.is_active ? '#DCFCE7' : '#F5F5F5',
                    }}>
                      <Text style={{ fontSize: '11px', color: p.is_active ? '#16A34A' : '#999' }}>{p.is_active ? '在售' : '下架'}</Text>
                      {expiryMap[p.id] && (() => {
                        const s = expiryMap[p.id]
                        const m: Record<string, { c: string; t: string }> = { red: { c: '#DC2626', t: '紧急' }, orange: { c: '#EA580C', t: '紧迫' }, amber: { c: '#D97706', t: '临期' } }
                        const info = m[s] || m.amber
                        return (
                          <View onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-expiry/index' })}
                            style={{ padding: '2px 8px', borderRadius: 10, background: `${info.c}22`, borderWidth: 1, borderColor: info.c }}>
                            <Text style={{ fontSize: 11, color: info.c, fontWeight: 'bold' }}>⏰{info.t}</Text>
                          </View>
                        )
                      })()}
                    </View>
                  </View>
                  {p.category_id && (
                    <Text style={{ fontSize: '11px', color: 'hsl(var(--primary))', marginTop: '2px' }}>🏷️ {catNameOf(p.category_id)}</Text>
                  )}
                  <Text style={{ fontSize: '18px', fontWeight: 'bold', color: 'hsl(var(--primary))', marginTop: '4px' }}>¥{p.price}</Text>
                  {p.original_price && <Text style={{ fontSize: '12px', color: '#BBB', textDecorationLine: 'line-through', marginLeft: '4px' }}>¥{p.original_price}</Text>}
                  {p.cost_price != null && (
                    <Text style={{ fontSize: '12px', color: '#AAA', marginTop: '2px' }}>成本 ¥{p.cost_price} · 毛利 {margin}</Text>
                  )}
                  {p.discount_rate != null && (
                    <Text style={{ fontSize: '12px', color: 'hsl(var(--primary))', marginTop: '2px' }}>🏷️ 让利 {p.discount_rate}%</Text>
                  )}
                  <Text style={{ fontSize: '12px', color: '#AAA', marginTop: '2px' }}>库存：{p.stock}</Text>
                </View>
              </View>
              {/* 操作栏 */}
              <View style={{
                display: 'flex', borderTop: '1px solid #F1E9D9',
              }}>
                <View
                  onClick={() => openEdit(p)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: '500' }}>✏️ 编辑</Text>
                </View>
                <View style={{ width: '1px', background: '#F1E9D9' }} />
                <View
                  onClick={async () => {
                    try {
                      await updateProduct(p.id, { is_active: !p.is_active })
                      Taro.showToast({ title: p.is_active ? '已下架' : '已上架', icon: 'success' })
                      load()
                    } catch { Taro.showToast({ title: '操作失败', icon: 'error' }) }
                  }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '13px', color: '#666' }}>{p.is_active ? '👁 下架' : '👁 上架'}</Text>
                </View>
                <View style={{ width: '1px', background: '#F1E9D9' }} />
                <View
                  onClick={() => {
                    Taro.showModal({
                      title: '确认删除',
                      content: `确定删除「${p.name}」吗？`,
                      confirmColor: '#EF4444',
                      success: async (r) => {
                        if (r.confirm) {
                          try {
                            await deleteProduct(p.id)
                            Taro.showToast({ title: '已删除', icon: 'success' })
                            load()
                          } catch { Taro.showToast({ title: '删除失败', icon: 'error' }) }
                        }
                      },
                    })
                  }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '13px', color: '#EF4444' }}>🗑 删除</Text>
                </View>
                <View style={{ width: '1px', background: '#F1E9D9' }} />
                <View
                  onClick={() => Taro.navigateTo({ url: `/pages/merchant/merchant-batch/index?productId=${p.id}` })}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '13px', color: 'hsl(var(--primary))' }}>📦 入库</Text>
                </View>
              </View>
            </View>
          )
        })
      )}

      {/* ════════════════════════════════════
          编辑/新增弹窗 —— 完全重写
         ════════════════════════════════════ */}
      {showForm && (
        <View style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.55)',
        }}>
          {/* 弹窗内容区 —— 不在背景上加 onClick，避免误触关闭 */}
          <View style={{
            marginTop: 'auto',
            width: '100%',
            background: '#FFF',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            paddingHorizontal: '20px',
            paddingTop: '20px',
            paddingBottom: '40px',
            maxHeight: '90vh',
            overflowY: 'scroll',
          }}>
            {/* 标题栏 */}
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <Text style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
                {editId ? '✏️ 编辑商品' : '🆕 新增商品'}
              </Text>
              <View
                onClick={handleCloseForm}
                style={{
                  width: '32px', height: '32px', borderRadius: '16px',
                  background: '#F0F0F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Text style={{ fontSize: '18px', color: '#999' }}>✕</Text>
              </View>
            </View>

            {/* 商品名称 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>商品名称 *</Text>
              <Input
                style={{
                  width: '100%', height: '44px',
                  borderRadius: '10px',
                  background: '#FAFAFA',
                  border: '1.5px solid #EEE',
                  fontSize: '15px', color: '#333',
                  padding: '0 14px',
                  boxSizing: 'border-box',
                }}
                placeholder="请输入商品名称"
                placeholderStyle="color:#BBB;font-size:14px"
                value={form.name}
                onInput={(e: any) => setForm(f => ({ ...f, name: e.detail?.value ?? '' }))} />
            </View>

            {/* 商品分类（store_categories：本店 + 平台全局） */}
            <View style={{ marginBottom: '14px' }}>
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600' }}>商品分类</Text>
                <View onClick={() => setShowCatModal(true)} style={{ padding: '3px 12px', borderRadius: '9999px', background: '#F1E9D9' }}>
                  <Text style={{ fontSize: '12px', color: 'hsl(var(--primary))' }}>管理分类</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
                <View
                  onClick={() => setForm(f => ({ ...f, category_id: '' }))}
                  style={{
                    padding: '7px 14px', borderRadius: '9999px',
                    background: form.category_id === '' ? 'hsl(var(--primary))' : '#FFF',
                    border: form.category_id === '' ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
                  }}>
                  <Text style={{ fontSize: '13px', color: form.category_id === '' ? '#FFF' : '#666' }}>未分类</Text>
                </View>
                {categories.map((c: StoreCategory) => {
                  const sel = form.category_id === c.id
                  return (
                    <View
                      key={c.id}
                      onClick={() => setForm(f => ({ ...f, category_id: c.id }))}
                      style={{
                        padding: '7px 14px', borderRadius: '9999px', flexDirection: 'row', alignItems: 'center', gap: '4px',
                        background: sel ? 'hsl(var(--primary))' : '#FFF',
                        border: sel ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
                      }}>
                      <Text style={{ fontSize: '13px', color: sel ? '#FFF' : '#666' }}>{c.name}</Text>
                      {c.scope === 'global' && <Text style={{ fontSize: '10px', color: sel ? '#FFE0CC' : '#BBB' }}>🌐</Text>}
                    </View>
                  )
                })}
                {categories.length === 0 && (
                  <Text style={{ fontSize: '12px', color: '#BBB' }}>暂无分类，点「管理分类」新建</Text>
                )}
              </View>
            </View>

            {/* 价格行：售价 / 原价 / 成本 */}
            <View style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>售价 *</Text>
                <Input
                  style={{
                    width: '100%', height: '42px', borderRadius: '10px',
                    background: '#FAFAFA', border: '1.5px solid #EEE',
                    fontSize: '14px', color: '#333', padding: '0 10px', boxSizing: 'border-box',
                  }}
                  placeholder="0.00" type="digit"
                  value={form.price}
                  onInput={(e: any) => setForm(f => ({ ...f, price: e.detail?.value ?? '' }))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>原价</Text>
                <Input
                  style={{
                    width: '100%', height: '42px', borderRadius: '10px',
                    background: '#FAFAFA', border: '1.5px solid #EEE',
                    fontSize: '14px', color: '#333', padding: '0 10px', boxSizing: 'border-box',
                  }}
                  placeholder="划线价" type="digit"
                  value={form.original_price}
                  onInput={(e: any) => setForm(f => ({ ...f, original_price: e.detail?.value ?? '' }))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>成本</Text>
                <Input
                  style={{
                    width: '100%', height: '42px', borderRadius: '10px',
                    background: '#FAFAFA', border: '1.5px solid #EEE',
                    fontSize: '14px', color: '#333', padding: '0 10px', boxSizing: 'border-box',
                  }}
                  placeholder="成本" type="digit"
                  value={form.cost_price}
                  onInput={(e: any) => setForm(f => ({ ...f, cost_price: e.detail?.value ?? '' }))} />
              </View>
            </View>

            {/* 毛利率 / 让利提示 */}
            {(form.cost_price || form.discount_rate) && form.price && (
              <View style={{
                marginBottom: '14px', padding: '8px 12px', borderRadius: '10px',
                background: '#FFF8F0', border: '1px dashed #FFCC80',
              }}>
                <Text style={{ fontSize: '13px', color: '#E65100' }}>
                  {form.cost_price && `毛利率：${calcMargin(parseFloat(form.price) || 0, parseFloat(form.cost_price) || 0)}`}
                  {form.original_price && form.cost_price && ` · `}
                  {form.original_price && !form.cost_price && ''}
                  {form.original_price && `让利 ¥${(parseFloat(form.original_price) - parseFloat(form.price)).toFixed(2)}`}
                  {form.discount_rate && (form.cost_price || form.original_price ? ' · ' : '')}
                  {form.discount_rate && `让利 ${form.discount_rate}%`}
                </Text>
              </View>
            )}

            {/* 让利% — 与自营门店 API discount_rate 对齐 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>🏷️ 让利 %</Text>
              <Input
                style={{
                  width: '100%', height: '42px', borderRadius: '10px',
                  background: '#FFF9F0', border: '1.5px solid #FFCC80',
                  fontSize: '14px', color: '#E65100', padding: '0 10px', boxSizing: 'border-box',
                }}
                placeholder="如: 15 表示让利15%（最高30%）"
                placeholderStyle={{ color: '#999' }}
                type="digit"
                value={form.discount_rate}
                onInput={(e: any) => setForm(f => ({ ...f, discount_rate: e.detail?.value ?? '' }))}
                onBlur={() => {
                  const v = parseFloat(form.discount_rate)
                  if (!isNaN(v) && v > 30) {
                    setForm(f => ({ ...f, discount_rate: '30' }))
                    Taro.showToast({ title: '让利最高30%', icon: 'none' })
                  }
                }} />
              <Text style={{ fontSize: '11px', color: '#AAA', marginTop: '4px' }}>让利比例最高 30%，超出将自动校正为 30%</Text>
            </View>

            {/* 库存 + 条形码 */}
            <View style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>库存 *</Text>
                <Input
                  style={{
                    width: '100%', height: '42px', borderRadius: '10px',
                    background: '#FAFAFA', border: '1.5px solid #EEE',
                    fontSize: '14px', color: '#333', padding: '0 10px', boxSizing: 'border-box',
                  }}
                  placeholder="0" type="number"
                  value={form.stock}
                  onInput={(e: any) => setForm(f => ({ ...f, stock: e.detail?.value ?? '' }))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>条形码</Text>
                <Input
                  style={{
                    width: '100%', height: '42px', borderRadius: '10px',
                    background: '#FAFAFA', border: '1.5px solid #EEE',
                    fontSize: '14px', color: '#333', padding: '0 10px', boxSizing: 'border-box',
                  }}
                  placeholder="扫码或手动输入"
                  value={form.barcode}
                  onInput={(e: any) => setForm(f => ({ ...f, barcode: e.detail?.value ?? '' }))} />
              </View>
            </View>

            {/* 主图 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>主图</Text>
              <View style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <View
                  onClick={handleChooseMain}
                  style={{
                    width: '80px', height: '80px', borderRadius: '12px',
                    background: '#F5F0EB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '2px dashed #DDD',
                  }}>
                  {form.main_image
                    ? <Image src={form.main_image} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
                    : <Text style={{ fontSize: '28px' }}>📷</Text>}
                </View>
                <Text style={{ fontSize: '12px', color: '#AAA' }}>点击上传商品主图</Text>
              </View>
            </View>

            {/* 副图 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>
                副图（{form.sub_images.length}/9）
              </Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {form.sub_images.map((img, i) => (
                  <View key={i} style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #EEE', position: 'relative' }}>
                    <Image src={img} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
                    <View
                      onClick={() => setForm(f => ({ ...f, sub_images: f.sub_images.filter((_, j) => j !== i) }))}
                      style={{
                        position: 'absolute', top: 0, right: 0,
                        width: '18px', height: '18px',
                        background: '#EF4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderBottomLeftRadius: '8px',
                      }}>
                      <Text style={{ color: '#FFF', fontSize: '11px' }}>×</Text>
                    </View>
                  </View>
                ))}
                {form.sub_images.length < 9 && (
                  <View
                    onClick={handleChooseSub}
                    style={{
                      width: '64px', height: '64px', borderRadius: '8px',
                      background: '#F5F0EB',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px dashed #DDD',
                    }}>
                    <Text style={{ fontSize: '20px', color: '#BBB' }}>+</Text>
                  </View>
                )}
              </View>
            </View>

            {/* 详情图片 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>
                详情图（{form.detail_images.length}/20）
              </Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {form.detail_images.map((img, i) => (
                  <View key={i} style={{ width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #EEE', position: 'relative' }}>
                    <Image src={img} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
                    <View
                      onClick={() => setForm(f => ({ ...f, detail_images: f.detail_images.filter((_, j) => j !== i) }))}
                      style={{
                        position: 'absolute', top: 0, right: 0,
                        width: '16px', height: '16px',
                        background: '#EF4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderBottomLeftRadius: '6px',
                      }}>
                      <Text style={{ color: '#FFF', fontSize: '10px' }}>×</Text>
                    </View>
                  </View>
                ))}
                {form.detail_images.length < 20 && (
                  <View
                    onClick={handleChooseDetail}
                    style={{
                      width: '48px', height: '48px', borderRadius: '6px',
                      background: '#F5F0EB',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px dashed #DDD',
                    }}>
                    <Text style={{ fontSize: '16px', color: '#BBB' }}>+</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: '11px', color: '#AAA', marginTop: '4px' }}>详情图将在商品详情页依次展示</Text>
            </View>

            {/* 商品视频 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>🎬 商品视频（可选）</Text>
              <View style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <View
                  onClick={handleChooseVideo}
                  style={{
                    width: '120px', height: '80px', borderRadius: '12px',
                    background: '#F5F0EB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '2px dashed #DDD',
                  }}>
                  {form.video_url
                    ? <View style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                        <Text style={{ fontSize: '32px', color: '#FFF' }}>▶️</Text>
                      </View>
                    : <View style={{ textAlign: 'center' }}>
                        <Text style={{ fontSize: '28px' }}>🎬</Text>
                        <Text style={{ fontSize: '11px', color: '#999', display: 'block', marginTop: '4px' }}>上传视频</Text>
                      </View>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '12px', color: '#AAA', display: 'block', marginBottom: '4px' }}>点击上传商品展示视频</Text>
                  <Text style={{ fontSize: '11px', color: '#999', display: 'block' }}>支持 MP4/MOV 格式</Text>
                  <Text style={{ fontSize: '11px', color: '#999', display: 'block' }}>最长 60 秒，最大 200MB</Text>
                  {form.video_url && (
                    <View
                      onClick={() => setForm(f => ({ ...f, video_url: '' }))}
                      style={{
                        marginTop: '8px',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        background: '#FEE2E2',
                        display: 'inline-block',
                      }}>
                      <Text style={{ fontSize: '12px', color: '#DC2626' }}>删除视频</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            {/* 场景标签 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>🏷️ 场景标签（可选）</Text>
              <Text style={{ fontSize: '11px', color: '#AAA', marginBottom: '8px', display: 'block' }}>选择商品适用的场景，帮助用户快速找到所需</Text>
              
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {SCENE_TAGS.map((tag: MoodTag, idx: number) => (
                  <View
                    key={idx}
                    onClick={() => toggleSceneTag(tag.zh)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '16px',
                      background: form.scene_tags.includes(tag.zh) ? tag.color : '#F5F5F5',
                      border: `1px solid ${form.scene_tags.includes(tag.zh) ? tag.color : '#EEE'}`,
                    }}>
                    <Text style={{ fontSize: '12px', color: form.scene_tags.includes(tag.zh) ? '#FFF' : '#666' }}>
                      {tag.icon} {tag.zh}
                    </Text>
                  </View>
                ))}
              </View>

              {/* 已选中的场景标签（带 × 删除） */}
              {form.scene_tags.length > 0 && (
                <View style={{ marginTop: '8px', padding: '8px', borderRadius: '8px', background: '#F9F9F9' }}>
                  <Text style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>已选中（点 × 可删除）：</Text>
                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {form.scene_tags.map((tag: string, idx: number) => {
                      const tagInfo = SCENE_TAGS.find((t: MoodTag) => t.zh === tag)
                      return (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: '2px', padding: '4px 4px 4px 10px', borderRadius: '12px', background: tagInfo?.color || '#DDD' }}>
                          <Text style={{ fontSize: '11px', color: '#FFF' }}>{tag}</Text>
                          <View onClick={() => toggleSceneTag(tag)} style={{ padding: '0 3px' }}>
                            <Text style={{ fontSize: '13px', color: '#FFF', fontWeight: 'bold' }}>×</Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* 原料成分分析 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>🥗 原料成分分析（可选）</Text>
              <Text style={{ fontSize: '11px', color: '#AAA', marginBottom: '8px', display: 'block' }}>① 填商品名称点「智能识别原料」自动带出，或直接输入原料名搜索添加 → 功效/人群/场景展示在商品详情页</Text>
              <View
                onClick={handleIdentifyIngredients}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
                  borderRadius: '12px', background: '#FFF', border: '2px solid #34A853',
                }}>
                <Text style={{ color: '#34A853', fontSize: '13px', fontWeight: 'bold' }}>🤖 智能识别原料</Text>
              </View>

              {/* 输入原料名快速添加 */}
              <View style={{ marginTop: '10px' }}>
                <Input
                  value={ingredientQuery}
                  onInput={(e: any) => {
                    const v = e.detail.value
                    setIngredientQuery(v)
                    setIngredientResults(searchIngredients(v))
                  }}
                  placeholder='或直接输入原料名（如：姜、梨、番茄）快速添加'
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '13px', background: '#FFF' }} />
                {ingredientResults.length > 0 && (
                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {ingredientResults.map(key => {
                      const e = getIngredientEntries([key])[0]
                      if (!e) return null
                      const selected = form.ingredients.includes(key)
                      return (
                        <View
                          key={key}
                          onClick={() => { toggleIngredient(key); setIngredientQuery(''); setIngredientResults([]) }}
                          style={{ padding: '4px 10px', borderRadius: '14px', border: `1px solid ${selected ? '#34A853' : '#D1D5DB'}`, background: selected ? '#E8F7EC' : '#FFF' }}>
                          <Text style={{ fontSize: '13px', color: selected ? '#34A853' : '#374151' }}>{e.icon} {e.zh}</Text>
                        </View>
                      )
                    })}
                  </View>
                )}
              </View>

              {!form.name?.trim() && (
                <Text style={{ fontSize: '11px', color: '#E08A00', marginTop: '6px', display: 'block' }}>👆 提示：先填写商品名称，识别更准确</Text>
              )}

              {form.ingredients.length > 0 && (
                <View style={{ marginTop: '10px' }}>
                  {form.ingredients.map((key: string) => {
                    const e = getIngredientEntries([key])[0]
                    if (!e) return null
                    return (
                      <View key={key} style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '12px', background: '#F6FBF7', border: '1px solid #D6EFD8' }}>
                        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Text style={{ fontSize: '18px' }}>{e.icon}</Text>
                            <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#1F2937' }}>{e.zh}</Text>
                            <Text style={{ fontSize: '11px', color: '#fff', background: '#34A853', padding: '1px 8px', borderRadius: '10px' }}>{e.nature}</Text>
                          </View>
                          <View onClick={() => toggleIngredient(key)} style={{ padding: '2px 8px' }}>
                            <Text style={{ fontSize: '13px', color: '#EF4444' }}>✕ 移除</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: '12px', color: '#4B5563', marginTop: '6px', display: 'block' }}>功效：{e.benefits.join('、')}</Text>
                        <Text style={{ fontSize: '12px', color: '#4B5563', marginTop: '2px', display: 'block' }}>适合：{e.audiences.join('、')}</Text>
                        <Text style={{ fontSize: '12px', color: '#4B5563', marginTop: '2px', display: 'block' }}>场景：{e.scenarios.join('、')}</Text>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>

            {/* 商品属性关键词（选填，让情绪文案更贴合商品） */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', display: 'block', marginBottom: '6px' }}>🏷️ 商品属性关键词（选填）</Text>
              <Input
                value={form.attribute_keywords}
                onInput={(e: any) => setForm(f => ({ ...f, attribute_keywords: e.detail.value }))}
                placeholder='如：多汁、酸甜、产地直采、手工（逗号分隔）'
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '13px', background: '#FFF' }} />
              <Text style={{ fontSize: '11px', color: '#999', display: 'block', marginTop: '4px' }}>填写后，生成的情绪文案会自动融入这些真实卖点，更贴合商品。</Text>
            </View>

            {/* 智能生成情绪化描述 */}
            <View style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#F9F9FF', border: '1.5px solid #E8E8FF' }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600' }}>✨ 智能生成情绪化描述</Text>
                <View
                  onClick={async () => {
                    if (form.scene_tags.length === 0) {
                      Taro.showToast({ title: '请先选择场景标签', icon: 'none' })
                      return
                    }
                    setGenerating(true)
                    // 生成3个候选描述（传入门店类目 + 商品属性关键词，使文案贴合商品）
                    const attrKw = form.attribute_keywords
                      ? form.attribute_keywords.split(/[，,、\s]+/).map((s: string) => s.trim()).filter(Boolean)
                      : undefined
                    const candidates = generateEmotionDescriptions(
                      { name: form.name, description: form.description },
                      [],
                      form.scene_tags,
                      3,
                      store?.category,
                      attrKw
                    )
                    setDescriptionCandidates(candidates)
                    setGenerating(false)
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: form.scene_tags.length > 0 ? 'hsl(var(--primary))' : '#E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                  <Text style={{ fontSize: '12px', color: form.scene_tags.length > 0 ? '#FFF' : '#6B7280' }}>{generating ? '生成中...' : '生成描述'}</Text>
                </View>
              </View>

              {/* 候选描述列表 */}
              {descriptionCandidates.length > 0 && (
                <View style={{ marginTop: '8px' }}>
                  <Text style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'block' }}>选择以下描述，或手动修改：</Text>
                  {descriptionCandidates.map((desc, idx) => (
                    <View
                      key={idx}
                      onClick={() => {
                        setForm(f => ({ ...f, description: desc }))
                        setDescriptionCandidates([])
                        Taro.showToast({ title: '已采用描述', icon: 'success' })
                      }}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: '#FFF',
                        border: '1px solid #E8E8FF',
                        marginBottom: '6px',
                      }}>
                      <Text style={{ fontSize: '13px', color: '#333', lineHeight: '1.6' }}>{desc}</Text>
                      <View style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                        <Text style={{ fontSize: '11px', color: 'hsl(var(--primary))' }}>点击采用 →</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 商品描述 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>商品描述</Text>
              <Textarea
                style={{
                  width: '100%', minHeight: '80px',
                  borderRadius: '10px',
                  background: '#FAFAFA', border: '1.5px solid #EEE',
                  fontSize: '14px', color: '#333',
                  padding: '10px 14px', boxSizing: 'border-box',
                }}
                placeholder="简短描述商品特点..."
                placeholderStyle="color:#BBB;font-size:13px"
                value={form.description}
                onInput={(e: any) => setForm(f => ({ ...f, description: e.detail?.value ?? '' }))} />
            </View>

            {/* 🌿 智能食养 · 情绪配对（让商品更懂用户，科学化表达） */}
            <View style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: '#FCF8F2', border: '1px solid #F0E6D8' }}>
              <Text style={{ fontSize: '14px', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '8px', display: 'block' }}>🌿 智能食养 · 情绪配对</Text>

              {/* 🤖 智能识别：菜名/图片 → 自动识别属性（替代手动选择，仍可微调） */}
              <View style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#FFF', border: '1.5px solid hsl(var(--primary))' }}>
                <Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '8px', display: 'block' }}>🤖 智能识别（输菜名/传图，自动识别属性）</Text>
                <Input
                  style={{ width: '100%', height: '40px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '0 12px', boxSizing: 'border-box' }}
                  placeholder="输入商品/菜名，如：冰糖雪梨羹、姜枣茶"
                  placeholderStyle="color:#BBB;font-size:13px"
                  value={dishName}
                  onInput={(e: any) => setDishName(e.detail?.value ?? '')} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <View onClick={pickDishImage}
                    style={{ padding: '8px 12px', borderRadius: '10px', background: '#F0F4F8', border: '1px solid #DDD' }}>
                    <Text style={{ fontSize: '13px', color: '#333' }}>📷 上传图片</Text>
                  </View>
                  {dishImageUrl ? (
                    <Image src={dishImageUrl} mode="aspectFill" style={{ width: '40px', height: '40px', borderRadius: '8px' }} />
                  ) : null}
                  <View onClick={runSmartAnalyze}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px', borderRadius: '10px', background: analyzing ? '#F0C9A8' : 'hsl(var(--primary))' }}>
                    <Text style={{ fontSize: '13px', color: '#FFF', fontWeight: '700' }}>{analyzing ? '识别中…' : '✨ 一键识别'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: '11px', color: '#999', marginTop: '8px', display: 'block' }}>识别后自动填充下方食养字段，仍可手动微调。配置 AI 后支持"看图识菜"。</Text>
              </View>

              {/* 实时预览：顾客端卡片长什么样（边填边看，更赏心悦目） */}
              <Text style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'block' }}>实时预览（顾客视角）</Text>
              <View style={{ background: '#FFF', borderRadius: '12px', padding: '8px', marginBottom: '12px' }}>
                {(() => {
                  try {
                    const previewProduct: any = {
                      health_tag: form.health_tag,
                      emotion_tag: form.emotion_tag,
                      overall_nature: form.overall_nature,
                      match_goods: form.match_goods,
                      conflict_goods: form.conflict_goods,
                      ingredients: form.ingredients,
                      description: form.description,
                      aux_remind: form.aux_remind,
                    }
                    const care = getProductCareInfo(previewProduct, [])
                    return (
                      <ProductGridCard
                        id={'preview'}
                        name={form.name || '商品名称预览'}
                        price={Number(form.price) || 0}
                        imageUrl={form.main_image || undefined}
                        care={care}
                        width="100%"
                        onAddCart={() => {}}
                        disabled
                      />
                    )
                  } catch {
                    // 关怀引擎在 partial 商品上偶发异常时，降级为纯卡片，不拖垮编辑表单
                    return (
                      <ProductGridCard
                        id={'preview'}
                        name={form.name || '商品名称预览'}
                        price={Number(form.price) || 0}
                        imageUrl={form.main_image || undefined}
                        width="100%"
                        onAddCart={() => {}}
                        disabled
                      />
                    )
                  }
                })()}
              </View>

              {/* 整体性味色阶：寒热有色，一眼可读、更科学 */}
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>整体性味（寒热有色，一眼可读）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {NATURE_SCALE.map((n: string) => {
                  const sel = form.overall_nature === n
                  return (
                    <View key={n} onClick={() => setForm(f => ({ ...f, overall_nature: sel ? '' : n }))}
                      style={{
                        padding: '6px 12px', borderRadius: '9999px',
                        background: sel ? (NATURE_COLOR[n] || 'hsl(var(--primary))') : '#FFF',
                        border: `1px solid ${NATURE_COLOR[n] || '#DDD'}`,
                      }}>
                      <Text style={{ fontSize: '13px', color: sel ? '#FFF' : (NATURE_COLOR[n] || '#666'), fontWeight: sel ? '700' : '400' }}>{n}</Text>
                    </View>
                  )
                })}
              </View>

              {/* 食疗标签（赭红） */}
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>食疗标签（最多 3）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {HEALTH_TAGS.map((t: string) => {
                  const sel = form.health_tag.includes(t)
                  return (
                    <View key={t} onClick={() => toggleArrayField('health_tag', t, 3)}
                      style={{
                        padding: '6px 12px', borderRadius: '9999px',
                        background: sel ? 'hsl(var(--brand-ochre))' : '#FFF',
                        border: '1px solid rgba(194,65,12,0.25)',
                      }}>
                      <Text style={{ fontSize: '13px', color: sel ? '#FFF' : 'hsl(var(--primary))', fontWeight: sel ? '700' : '400' }}>{t}</Text>
                    </View>
                  )
                })}
              </View>

              {/* 情绪配对（玫红 ♡，食疗+情绪核心） */}
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>情绪配对（最多 3，食疗+情绪核心）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {EMOTION_TAGS.map((t: string) => {
                  const sel = form.emotion_tag.includes(t)
                  return (
                    <View key={t} onClick={() => toggleArrayField('emotion_tag', t, 3)}
                      style={{
                        padding: '6px 12px', borderRadius: '9999px',
                        background: sel ? '#DB2777' : '#FFF',
                        border: '1px solid rgba(219,39,119,0.25)',
                      }}>
                      <Text style={{ fontSize: '13px', color: sel ? '#FFF' : '#DB2777', fontWeight: sel ? '700' : '400' }}>♡ {t}</Text>
                    </View>
                  )
                })}
              </View>

              {/* 辅料提醒：过敏/禁忌，让商品更懂用户 */}
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>辅料提醒（过敏/禁忌，如"含坚果，过敏慎选"）</Text>
              <Textarea
                style={{ width: '100%', minHeight: '56px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
                placeholder="填写辅料/过敏提醒，让商品更懂用户…"
                placeholderStyle="color:#BBB;font-size:13px"
                value={form.aux_remind}
                onInput={(e: any) => setForm(f => ({ ...f, aux_remind: e.detail?.value ?? '' }))} />

              {/* 宜搭 / 慎搭：从本店商品选择，互斥 */}
              {products.length > 0 && (
                <View style={{ marginTop: '14px' }}>
                  <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>宜搭 / 慎搭商品（从本店选择，互斥）</Text>
                  <View style={{ maxHeight: '130px', overflowY: 'auto', marginBottom: '8px' }}>
                    {products.filter(p => p.id !== (form as any).id).map((p: any) => {
                      const isMatch = form.match_goods.includes(p.id)
                      const isConflict = form.conflict_goods.includes(p.id)
                      const tint = isMatch ? '#16A34A' : isConflict ? '#DC2626' : '#999'
                      return (
                        <View key={p.id} onClick={() => {
                          if (isMatch) { toggleArrayField('match_goods', p.id); return }
                          if (isConflict) { toggleArrayField('conflict_goods', p.id); return }
                          toggleArrayField('match_goods', p.id)
                        }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '8px', background: isMatch ? 'rgba(22,163,74,0.08)' : isConflict ? 'rgba(220,38,38,0.08)' : '#FAFAFA', border: `1px solid ${isMatch ? 'rgba(22,163,74,0.25)' : isConflict ? 'rgba(220,38,38,0.25)' : '#EEE'}`, marginBottom: '6px' }}>
                          <Text style={{ fontSize: '13px', color: '#333' }}>{p.name}</Text>
                          <Text style={{ fontSize: '12px', color: tint, fontWeight: '600' }}>{isMatch ? '宜搭' : isConflict ? '慎搭' : '—'}</Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* 上架开关 */}
            <View style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '20px',
              padding: '12px 14px', borderRadius: '12px', background: '#FAFAFA',
            }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '500' }}>立即上架</Text>
              <Switch
                checked={form.is_active}
                onChange={(v: any) => setForm(f => ({ ...f, is_active: v.detail.value }))}
                color="hsl(var(--primary))" />
            </View>

            {/* 保存按钮 */}
            <View
              onClick={handleSave}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '14px', borderRadius: '14px',
                background: saving ? '#F0C9A8' : 'linear-gradient(135deg, #C77B47, hsl(var(--primary)))',
                boxShadow: saving ? 'none' : '0 3px 12px rgba(255,87,34,0.3)',
              }}>
              <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFF' }}>
                {saving ? '保存中…' : '💾 保存'}
              </Text>
            </View>
          </View>
        </View>
      )}

    {/* 商品分类管理抽屉（新建 / 改名 / 排序 / 删除） */}
    {showCatModal && (
      <View
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.55)' }}
        onClick={() => setShowCatModal(false)}>
        <View
          style={{ marginTop: 'auto', width: '100%', background: '#FFF', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', paddingHorizontal: '20px', paddingTop: '20px', paddingBottom: '40px', maxHeight: '85vh', overflowY: 'scroll' }}
          onClick={(e: any) => e.stopPropagation()}>
          {/* 标题 */}
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <Text style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>管理商品分类</Text>
            <View onClick={() => setShowCatModal(false)} style={{ width: '32px', height: '32px', borderRadius: '16px', background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: '18px', color: '#999' }}>✕</Text>
            </View>
          </View>

          {/* 新建分类 */}
          <View style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <Input
              value={newCatName}
              onInput={(e: any) => setNewCatName(e.detail?.value ?? '')}
              placeholder="输入新分类名称"
              style={{ flex: 1, height: '42px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', padding: '0 12px', boxSizing: 'border-box' }} />
            <View onClick={handleAddCategory} style={{ padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'linear-gradient(135deg, #C77B47, hsl(var(--primary)))' }}>
              <Text style={{ fontSize: '14px', color: '#FFF', fontWeight: 'bold' }}>新建</Text>
            </View>
          </View>

          {/* 分类列表（按 sort_order 排序） */}
          {categories.length === 0 && <Text style={{ fontSize: '13px', color: '#BBB' }}>还没有分类，先在上方新建一个吧</Text>}
          {[...categories].sort((a: StoreCategory, b: StoreCategory) => a.sort_order - b.sort_order).map((c: StoreCategory) => {
            const isGlobal = c.scope === 'global'
            return (
              <View key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', borderBottomWidth: '1px', borderBottomColor: '#F2F2F2', borderBottomStyle: 'solid' }}>
                {editingCatId === c.id ? (
                  <Input
                    value={editingCatName}
                    focus
                    onInput={(e: any) => setEditingCatName(e.detail?.value ?? '')}
                    style={{ flex: 1, height: '38px', borderRadius: '8px', background: '#FAFAFA', border: '1px solid hsl(var(--primary))', fontSize: '14px', padding: '0 10px' }} />
                ) : (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: '6px' }} onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }}>
                    <Text style={{ fontSize: '15px', color: '#333' }}>{c.name}</Text>
                    {isGlobal && <Text style={{ fontSize: '11px', color: '#BBB' }}>🌐 平台</Text>}
                  </View>
                )}
                {!isGlobal && (
                  <View style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <View onClick={() => handleMoveCategory(c, -1)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '15px', color: '#888' }}>↑</Text></View>
                    <View onClick={() => handleMoveCategory(c, 1)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '15px', color: '#888' }}>↓</Text></View>
                    {editingCatId === c.id
                      ? <View onClick={() => handleSaveRename(c)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: 'bold' }}>✓</Text></View>
                      : <View onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '13px', color: '#3B82F6' }}>改名</Text></View>}
                    <View onClick={() => handleDeleteCategory(c)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '13px', color: '#EF4444' }}>删</Text></View>
                  </View>
                )}
              </View>
            )
          })}
          <Text style={{ fontSize: '11px', color: '#BBB', marginTop: '12px', display: 'block' }}>🌐 平台分类由总部统一维护，店内不可修改；店内分类仅对本店商品生效。</Text>
        </View>
      </View>
    )}

    </View>
    </RouteGuard>
  )
}

export default MerchantProductsPage
