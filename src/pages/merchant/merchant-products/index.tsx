// @title 商品管理（商家端）
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { Image, View, Text, Input, Textarea, Switch } from '@tarojs/components'
import Icon from '@/components/Icon'
import ProductGridCard from '@/components/ProductGridCard'
import { getProductCareInfo } from '@/utils/product-care'
import { HEALTH_TAGS, NATURE_SCALE } from '@/utils/food-therapy/types'
import {
  getMerchantStore, getMerchantProducts, getMerchantProductSales,
  createProduct, updateProduct, deleteProduct, getProductByBarcode,
  getCategories, createStoreCategory, updateStoreCategory, deleteStoreCategory,
  getNearExpiryProducts, generateProductBarcode, callPrintBarcode,
} from '@/db/api'
import { supabase } from '@/client/supabase'
import { uploadImage, uploadVideo } from '@/utils/upload'
import { analyzeProductFromName, type ProductAnalysis } from '@/utils/food-therapy/dishAnalyzer'
import { buildTherapyReport, type ProductIngredientInput } from '@/utils/food-therapy/product-therapy'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import type { Product, Store, StoreCategory } from '@/db/types'
import { encodeEAN13 } from '@/utils/barcode'
import { RouteGuard } from '@/components/RouteGuard'
import CategoryManager from './CategoryManager'

type FormState = {
  name: string; price: string; original_price: string; cost_price: string
  discount_rate: string
  stock: string; description: string; barcode: string
  main_image: string; sub_images: string[]; detail_images: string[]; video_url: string
  is_active: boolean
  ingredients: string[]
  // —— 智能食养 · 食疗配对（让商品更懂用户）——
  overall_nature: string            // 整体性味：大寒/寒凉/平性/微温/温热/大热
  health_tag: string[]              // 食疗标签（最多3）
  match_goods: string[]             // 宜搭商品 id
  conflict_goods: string[]          // 慎搭商品 id
  aux_remind: string                // 辅料提醒文案
  allergens: string[]               // 预测过敏原（智能识别填充）
  nutrition: { energy_kj?: number; protein_g?: number; fat_g?: number; carb_g?: number; sugar_g?: number; sodium_mg?: number } | null
  safety_grade: string              // 安全评级 S/A/C/D（智能识别填充）
  safety_summary: string            // 安全摘要（智能识别填充）
  category_id: string               // 商品分类（store_categories.id，空=未分类）
  // —— 商品类型化（迁移 20260803）：礼品/手作与食养食品分开 ——
  product_kind: string              // 'food' | 'gift' | 'craft' | 'care'
  materials: string[]               // 礼品/手作的材质或草本成分清单（绝不写入 ingredients）
  gift_meaning: string              // 寓意文化
  gift_craft: string                // 材质工艺
  gift_scene: string                // 送礼场景
  gift_care: string                 // 保养与使用注意
}
const emptyForm = (): FormState => ({
  name: '', price: '', original_price: '', cost_price: '', discount_rate: '',
  stock: '', description: '', barcode: '',
  main_image: '', sub_images: [], detail_images: [], video_url: '',
  is_active: true,
  ingredients: [],
  overall_nature: '',
  health_tag: [],
  match_goods: [],
  conflict_goods: [],
  aux_remind: '',
  allergens: [],
  nutrition: null,
  safety_grade: '',
  safety_summary: '',
  category_id: '',
  product_kind: 'food',
  materials: [],
  gift_meaning: '',
  gift_craft: '',
  gift_scene: '',
  gift_care: '',
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

// 结构化食材项（食疗商品系统化：从食材库选择 + 占比 + 烹饪 + 辅料）
type IngredientItem = {
  id: string
  name: string
  nature: string
  base_effect?: string | null
  caution_crowds?: string | null
  allergens: string[]
  chronic_tags: string[]
  neutralize?: string | null
  ratio: number
  cooking: string
  aux: string[]
}
const COOKING_METHODS = ['清炒', '少油', '重油', '红烧', '水煮', '凉拌']
const AUX_OPTIONS = ['盐', '糖', '食用油', '酱油', '味精']

// 屏幕预览 EAN-13 条码（纯 CSS 条，人眼可辨 + 数字可读；真实扫码靠打印纸）
function EAN13Preview({ code }: { code: string }) {
  const enc = encodeEAN13(code)
  if (!enc) {
    return <Text style={{ fontSize: '12px', color: '#DC2626' }}>条码格式无效（须为 13 位 EAN-13）</Text>
  }
  return (
    <View style={{ background: '#fff', border: '1px solid #EEE', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '2px' }}>
      <View style={{ display: 'flex', flexDirection: 'row', height: '54px', width: '100%', justifyContent: 'center' }}>
        {enc.modules.split('').map((m, i) => (
          <View key={i} style={{ width: '2px', height: '100%', backgroundColor: m === '1' ? '#000' : '#fff' }} />
        ))}
      </View>
      <Text style={{ fontSize: '13px', letterSpacing: '2px', marginTop: '6px', color: '#333' }}>{code}</Text>
    </View>
  )
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
  // 批量配料安全分析：对缺失安全评级的商品跑本地确定性引擎并回写
  const [batchAnalyzing, setBatchAnalyzing] = useState(false)
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientResults, setIngredientResults] = useState<string[]>([])
  // 食疗商品系统化：食材库（DB 可维护）+ 结构化食材项
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  const [ingredientItems, setIngredientItems] = useState<IngredientItem[]>([])
  const [revenue, setRevenue] = useState({ totalRevenue: 0, totalProfit: 0, totalSales: 0 })
  // —— 商品分类（store_categories：本店 + 平台全局）——
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [expiryMap, setExpiryMap] = useState<Record<string, string>>({})
  // 条码：生成中 / 打印中
  const [generatingBarcode, setGeneratingBarcode] = useState(false)
  const [printingBarcode, setPrintingBarcode] = useState(false)

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
        // 商品收益：服务端 RPC 聚合（每款商品销量+营收），彻底消除「拉 1 万条 order_items 到客户端聚合」的卡顿
        try {
          const salesMap = await getMerchantProductSales(s.id)
          const costMap: Record<string, number> = {}
          ;(prods || []).forEach((p: any) => { costMap[p.id] = Number(p.cost_price || 0) })
          let totalSales = 0, totalRevenue = 0, totalProfit = 0
          Object.keys(salesMap).forEach(pid => {
            const sm = salesMap[pid]
            totalSales += sm.sales
            totalRevenue += sm.revenue
            totalProfit += sm.revenue - (costMap[pid] || 0) * sm.sales
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

  // 加载全局食材库（食疗商品系统化内核）
  useEffect(() => {
    getFoodIngredients().then(setIngredientDict).catch(() => {})
  }, [])

  // 把食材库行转为结构化编辑项
  const dictRowToItem = (row: FoodIngredientRow): IngredientItem => ({
    id: row.id, name: row.name, nature: row.nature,
    base_effect: row.base_effect, caution_crowds: row.caution_crowds,
    allergens: row.allergens || [], chronic_tags: row.chronic_tags || [],
    neutralize: row.neutralize, ratio: 50, cooking: '清炒', aux: [],
  })

  // 食养系统化：未手填食材时，按商品名匹配食材字典推导（如「西瓜」→西瓜、「椰子」→椰子），
  // 做到"上传商品自动就用食养"；匹配不到则 therapyReport 为 null（标记 therapy_pending 待补）。
  const deriveIngredientsFromName = (name: string, dict: FoodIngredientRow[]): ProductIngredientInput[] => {
    const nm = (name || '').trim()
    if (!nm) return []
    const inputs: ProductIngredientInput[] = []
    for (const row of dict) {
      if (!row.name || row.name.length < 2) continue
      if (nm.includes(row.name)) {
        inputs.push({
          ingredient: {
            name: row.name, nature: row.nature, base_effect: row.base_effect,
            caution_crowds: row.caution_crowds, allergens: row.allergens || [],
            chronic_tags: row.chronic_tags || [], neutralize: row.neutralize,
          },
          ratio: 50, cooking: '清炒', aux: [],
        })
      }
    }
    return inputs
  }

  // 实时食疗分析（引擎：性味合并 / 过敏原 / 三色预警 / 商家寄语）
  const therapyReport = useMemo(() => {
    let inputs: ProductIngredientInput[] = []
    if (ingredientItems.length) {
      inputs = ingredientItems.map(it => ({
        ingredient: {
          name: it.name, nature: it.nature, base_effect: it.base_effect,
          caution_crowds: it.caution_crowds, allergens: it.allergens, chronic_tags: it.chronic_tags, neutralize: it.neutralize,
        },
        ratio: it.ratio, cooking: it.cooking, aux: it.aux,
      }))
    } else {
      // 兜底：按商品名匹配食材字典推导
      inputs = deriveIngredientsFromName(form.name, ingredientDict)
    }
    if (!inputs.length) return null
    return buildTherapyReport(form.name || '本菜品', inputs)
  }, [ingredientItems, form.name, ingredientDict])

  // 引擎结果自动回填商品食养字段（系统算，商家可微调）
  useEffect(() => {
    if (!therapyReport) return
    setForm(f => ({
      ...f,
      overall_nature: therapyReport.overall_nature_code,
      allergens: ingredientItems.flatMap((it) => (it.allergens as string[] | undefined) || []).filter(Boolean),
      safety_summary: [therapyReport.caution_people, ...therapyReport.chronic_tags].filter(Boolean).join('；'),
      aux_remind: therapyReport.caution_people,
    }))
  }, [therapyReport])

  // ─── 打开新增表单 ───
  const handleNewProduct = () => {
    setForm(emptyForm())
    setEditId(null)
    setIngredientItems([])
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

  // 批量配料安全分析：对缺失安全评级的商品跑本地确定性引擎（菜名→食材→食养/安全字段），
  // 派生初评级(A/C)后回写 products，运营只需复核标红项，无需逐个手填。纯前端、零网络、可重复跑。
  const handleBatchAnalyze = async () => {
    if (!store || batchAnalyzing) return
    const pending = products.filter((p) => !(p as any).safety_grade)
    if (pending.length === 0) {
      Taro.showToast({ title: '全部商品已分析', icon: 'none' })
      return
    }
    Taro.showModal({
      title: '批量配料安全分析',
      content: `将对 ${pending.length} 款未评级商品跑本地食养引擎并回写安全评级，预计数秒。是否继续？`,
      confirmText: '开始分析',
      success: async (r) => {
        if (!r.confirm) return
        setBatchAnalyzing(true)
        Taro.showLoading({ title: `分析中 0/${pending.length}` })
        let done = 0
        const updated: Product[] = []
        for (const p of pending) {
          try {
            const a = analyzeProductFromName(p.name, (p as any).ingredients || [])
            // 初评级：有风险文案或过敏原 → C，否则 A（供运营复核，非最终判定）
            const grade = a.risk_warning || (a.allergens && a.allergens.length) ? 'C' : 'A'
            const payload = {
              overall_nature: a.overall_nature || '',
              health_tag: a.health_tag || [],
              allergens: a.allergens || [],
              safety_grade: grade,
              safety_summary: a.safety_summary || '',
              aux_remind: a.aux_remind || '',
            }
            await updateProduct(p.id, payload as any)
            updated.push({ ...p, ...payload } as unknown as Product)
          } catch (e) {
            console.error('[批量分析] 单品失败', p.id, e)
          }
          done += 1
          if (done % 5 === 0 || done === pending.length) {
            Taro.showLoading({ title: `分析中 ${done}/${pending.length}` })
          }
        }
        // 本地状态合并回写结果
        setProducts((prev) => {
          const map = new Map(updated.map((u) => [u.id, u]))
          return prev.map((p) => map.get(p.id) || p)
        })
        Taro.hideLoading()
        setBatchAnalyzing(false)
        Taro.showToast({ title: `已分析 ${done} 款`, icon: 'success' })
      },
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
      ingredients: p.ingredients ?? [],
      overall_nature: p.overall_nature ?? '',
      health_tag: p.health_tag ?? [],
      match_goods: p.match_goods ?? [],
      conflict_goods: p.conflict_goods ?? [],
      aux_remind: p.aux_remind ?? '',
      allergens: (p as any).allergens ?? [],
      nutrition: (p as any).nutrition ?? null,
      safety_grade: (p as any).safety_grade ?? '',
      safety_summary: (p as any).safety_summary ?? '',
      category_id: p.category_id ?? '',
      product_kind: (p as any).product_kind ?? 'food',
      materials: (p as any).materials ?? [],
      gift_meaning: (p as any).gift_meaning ?? '',
      gift_craft: (p as any).gift_craft ?? '',
      gift_scene: (p as any).gift_scene ?? '',
      gift_care: (p as any).gift_care ?? '',
    })
    setEditId(p.id); setShowForm(true)
    const items: IngredientItem[] = (p.ingredients ?? []).map((nm: string) => {
      const row = ingredientDict.find(r => r.name === nm)
      if (row) return dictRowToItem(row)
      return { id: nm, name: nm, nature: '平性', base_effect: null, caution_crowds: null, allergens: [], chronic_tags: [], neutralize: null, ratio: 50, cooking: '清炒', aux: [] }
    })
    setIngredientItems(items)
  }

  // 一键生成店内码：编辑已有商品→即时分配并回写；新建商品→保存时自动分配并保持在编辑态
  const onGenerateBarcode = async () => {
    setGeneratingBarcode(true)
    try {
      if (editId) {
        const prod = await generateProductBarcode(editId)
        if (prod && prod.barcode) {
          setForm(f => ({ ...f, barcode: prod.barcode! }))
          Taro.showToast({ title: '已生成店内码', icon: 'success' })
        } else {
          Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
        }
      } else {
        // 新建商品：保存即自动分配店内码，并保持编辑态便于立即打印
        await handleSave({ keepOpen: true })
      }
    } finally {
      setGeneratingBarcode(false)
    }
  }

  // 打印条码标签（需该门店已配置易联云打印机）
  const onPrintBarcode = async () => {
    if (!form.barcode || !editId) return
    setPrintingBarcode(true)
    try {
      const r = await callPrintBarcode({ productId: editId, storeId: store?.id })
      if (r.success) {
        Taro.showToast({ title: '已推送打印', icon: 'success' })
      } else if (r.need_config) {
        Taro.showModal({ title: '未配置打印机', content: '该门店尚未配置易联云打印机，请先到「设置」配置打印机后再打印标签。', showCancel: false })
      } else {
        Taro.showToast({ title: r.error || '打印失败', icon: 'none' })
      }
    } finally {
      setPrintingBarcode(false)
    }
  }

  const handleSave = async (opts?: { keepOpen?: boolean }) => {
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
      const isGiftKind = form.product_kind && form.product_kind !== 'food'
      const payload: any = {
        name: form.name, description: form.description, price,
        stock, barcode: form.barcode && form.barcode.trim() ? form.barcode.trim() : null,
        // 新建商品且无码时自动分配店内码；生成流程（keepOpen）强制分配
        auto_barcode: !!opts?.keepOpen || (!editId && !(form.barcode && form.barcode.trim())),
        main_image: form.main_image || undefined,
        sub_images: form.sub_images.length > 0 ? form.sub_images : undefined,
        detail_images: form.detail_images.length > 0 ? form.detail_images : undefined,
        video_url: form.video_url || undefined,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
        original_price: form.original_price ? parseFloat(form.original_price) : undefined,
        discount_rate: form.discount_rate ? Math.min(30, Math.max(0, parseFloat(form.discount_rate))) : undefined,
        // 礼品/手作：绝不写入 ingredients（避免误触食疗引擎），也不落 therapy_json
        ingredients: isGiftKind ? undefined : (ingredientItems.map(i => i.name).length > 0 ? ingredientItems.map(i => i.name) : undefined),
        overall_nature: isGiftKind ? undefined : (form.overall_nature || undefined),
        health_tag: isGiftKind ? undefined : (form.health_tag.length > 0 ? form.health_tag : undefined),
        match_goods: isGiftKind ? undefined : (form.match_goods.length > 0 ? form.match_goods : undefined),
        conflict_goods: isGiftKind ? undefined : (form.conflict_goods.length > 0 ? form.conflict_goods : undefined),
        aux_remind: isGiftKind ? undefined : (form.aux_remind.trim() || undefined),
        allergens: isGiftKind ? undefined : (form.allergens.length > 0 ? form.allergens : undefined),
        nutrition: isGiftKind ? undefined : (form.nutrition || undefined),
        safety_grade: isGiftKind ? undefined : (form.safety_grade || undefined),
        safety_summary: isGiftKind ? undefined : (form.safety_summary || undefined),
        // 食养系统化：上传即落 therapy_json 单一数据源；无食养则标记 therapy_pending 待补
        therapy_json: isGiftKind ? undefined : (therapyReport || undefined),
        fit_people: isGiftKind ? undefined : (therapyReport?.fit_people || undefined),
        therapy_pending: isGiftKind ? false : !therapyReport,
        is_active: form.is_active,
        category_id: form.category_id || null,
        // 商品类型化
        product_kind: form.product_kind || 'food',
        materials: isGiftKind && form.materials.length > 0 ? form.materials : undefined,
        gift_meaning: isGiftKind && form.gift_meaning.trim() ? form.gift_meaning.trim() : undefined,
        gift_craft: isGiftKind && form.gift_craft.trim() ? form.gift_craft.trim() : undefined,
        gift_scene: isGiftKind && form.gift_scene.trim() ? form.gift_scene.trim() : undefined,
        gift_care: isGiftKind && form.gift_care.trim() ? form.gift_care.trim() : undefined,
      }
      if (editId) {
        await updateProduct(editId, payload)
        Taro.showToast({ title: '修改成功', icon: 'success' })
      } else {
        const autoBarcode = !!opts?.keepOpen || !(form.barcode && form.barcode.trim())
        const created = await createProduct({ ...payload, store_id: store.id, auto_barcode: autoBarcode })
        if (!created) {
          Taro.showToast({ title: '保存失败，请检查后重试', icon: 'error' })
          return
        }
        // 生成流程（keepOpen）：新建后拿到店内码并保持在编辑态，便于立即打印标签
        if (opts?.keepOpen && created.barcode) {
          setEditId(created.id)
          setForm(f => ({ ...f, barcode: created.barcode! }))
          Taro.showToast({ title: '已生成店内码并上架', icon: 'success' })
          load()
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
    setIngredientItems([])
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
        Taro.showToast({ title: '智能识图完成', icon: 'success' })
      } else {
        const local = analyzeProductFromName(dishName.trim(), form.ingredients)
        fillFromAnalysis(local)
        // 区分真实原因：未配置 / LLM 服务异常 / 其他
        const source = data?.source as string | undefined
        const message = data?.message as string | undefined
        if (source === 'none') {
          Taro.showToast({ title: '已本地识别（未配置智能识图）', icon: 'none' })
        } else if (source === 'llm_error') {
          Taro.showToast({ title: `智能识图失败：${message || '服务异常'}`, icon: 'none' })
        } else {
          Taro.showToast({ title: `智能识图失败：${message || '请重试'}`, icon: 'none' })
        }
      }
    } catch (e) {
      const local = analyzeProductFromName(dishName.trim(), form.ingredients)
      fillFromAnalysis(local)
      Taro.showToast({ title: '已本地识别（网络异常）', icon: 'none' })
    } finally {
      setAnalyzing(false)
    }
  }

  // 原料成分勾选切换
  const toggleIngredient = (key: string) => {
    setForm(f => {
      const has = f.ingredients.includes(key)
      return { ...f, ingredients: has ? f.ingredients.filter(k => k !== key) : [...f.ingredients, key] }
    })
  }

  // 通用数组字段切换（食疗标签/宜搭/慎搭，带上限）
  const toggleArrayField = (field: 'health_tag' | 'match_goods' | 'conflict_goods', val: string, max = 99) => {
    setForm(f => {
      const arr = f[field]
      if (arr.includes(val)) return { ...f, [field]: arr.filter(v => v !== val) }
      if (arr.length >= max) { Taro.showToast({ title: `最多选 ${max} 个`, icon: 'none' }); return f }
      return { ...f, [field]: [...arr, val] }
    })
  }

  // 实时配料安全分析预览：随商品名称/配料变化即时算出（供商家编辑时直观看到系统判定）
  const liveSafety = useMemo(() => {
    if (!form.name.trim() && form.ingredients.length === 0) return null
    return analyzeProductFromName(form.name, form.ingredients)
  }, [form.name, form.ingredients])

  const safetyTone = useMemo(() => {
    if (!liveSafety) return null
    const hasRisk = (liveSafety.allergens?.length || 0) > 0 || !!liveSafety.risk_warning
    return hasRisk
      ? { label: '⚠️ 需关注', bg: '#FDECEC', border: '#F5C2C2', fg: '#C0392B' }
      : { label: '✅ 平稳', bg: '#EAF6EC', border: '#BFE3C4', fg: '#2E7D32' }
  }, [liveSafety])

  // 智能识别食材：按商品名称匹配食材库（食疗系统化）
  const handleIdentifyIngredients = () => {
    if (!form.name.trim()) { Taro.showToast({ title: '请先填写商品名称', icon: 'none' }); return }
    const hits = ingredientDict.filter(r => form.name.includes(r.name))
    if (!hits.length) { Taro.showToast({ title: '未从名称识别到食材', icon: 'none' }); return }
    let added = 0
    setIngredientItems(prev => {
      const next = [...prev]
      for (const r of hits) if (!next.some(i => i.id === r.id)) { next.push(dictRowToItem(r)); added++ }
      return next
    })
    Taro.showToast({ title: `已识别 ${hits.length} 种食材`, icon: 'success' })
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

      {/* 批量配料安全分析按钮 */}
      <View style={{ display: 'flex', gap: '10px', padding: '10px 14px 0' }}>
        <View
          onClick={handleBatchAnalyze}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '13px 16px', borderRadius: '14px',
            background: batchAnalyzing ? '#F0E6DA' : '#FFF',
            border: '2px dashed #C77B47',
          }}>
          {batchAnalyzing
            ? <Text style={{ color: 'hsl(var(--primary))', fontSize: '15px', fontWeight: 'bold' }}>分析中…</Text>
            : <Text style={{ color: 'hsl(var(--primary))', fontSize: '15px', fontWeight: 'bold' }}>🧪 批量分析配料安全</Text>}
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
                  {(p as any).sales_count != null && (
                    <Text style={{ fontSize: '12px', color: '#AAA', marginTop: '2px' }}>已售：{(p as any).sales_count}</Text>
                  )}
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

            {/* 商品类型（迁移 20260803）：食养食品 / 药膳手串礼品 / 手作 / 护理 —— 决定详情页渲染哪套模块 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>商品类型</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { k: 'food', label: '食养食品' },
                  { k: 'gift', label: '药膳手串礼品' },
                  { k: 'craft', label: '手作' },
                  { k: 'care', label: '护理' },
                ].map((opt) => {
                  const sel = (form.product_kind || 'food') === opt.k
                  return (
                    <View
                      key={opt.k}
                      onClick={() => setForm(f => ({ ...f, product_kind: opt.k }))}
                      style={{
                        padding: '7px 14px', borderRadius: '9999px',
                        background: sel ? '#B45309' : '#FFF',
                        border: sel ? '1px solid #B45309' : '1px solid #EEE',
                      }}>
                      <Text style={{ fontSize: '13px', color: sel ? '#FFF' : '#666' }}>{opt.label}</Text>
                    </View>
                  )
                })}
              </View>
              <Text style={{ fontSize: '11px', color: '#AAA', marginTop: '4px' }}>
                {form.product_kind === 'gift'
                  ? '礼品详情页走「寓意 / 材质 / 场景 / 保养」专属模块，不与食养共用描述'
                  : form.product_kind && form.product_kind !== 'food'
                  ? '该类型走礼品化详情模块，不展示食疗 / 配料安全'
                  : '食养食品走食疗 / 配料安全模块'}
              </Text>
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
              {/* 条码操作：生成 / 预览 / 打印（超市同款 EAN-13 店内码）*/}
              <View style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {!form.barcode ? (
                    <View
                      onClick={onGenerateBarcode}
                      style={{ padding: '8px 14px', borderRadius: '10px', background: generatingBarcode ? '#9CA3AF' : '#10B981', opacity: generatingBarcode ? 0.7 : 1 }}>
                      <Text style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{generatingBarcode ? '生成中…' : (editId ? '⚡ 一键生成店内码' : '⚡ 保存并生成店内码')}</Text>
                    </View>
                  ) : null}
                  {form.barcode ? (
                    <View
                      onClick={onPrintBarcode}
                      style={{ padding: '8px 14px', borderRadius: '10px', background: printingBarcode ? '#9CA3AF' : '#FF8C42', opacity: printingBarcode ? 0.7 : 1 }}>
                      <Text style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{printingBarcode ? '打印中…' : '🖨 打印标签'}</Text>
                    </View>
                  ) : null}
                </View>
                {form.barcode ? (
                  <EAN13Preview code={form.barcode} />
                ) : (
                  <Text style={{ fontSize: '12px', color: '#999' }}>无条码：可「一键生成店内码」（EAN-13 超市同款），再打印标签贴商品。</Text>
                )}
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
                    setIngredientResults(ingredientDict.filter(r => r.name.includes(v.trim())).map(r => r.name))
                  }}
                  placeholder='或直接输入原料名（如：姜、梨、番茄）快速添加'
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '13px', background: '#FFF' }} />
                {ingredientResults.length > 0 && (
                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {ingredientResults.map(name => {
                      const row = ingredientDict.find(r => r.name === name)
                      if (!row) return null
                      const selected = ingredientItems.some(i => i.id === row.id)
                      return (
                        <View
                          key={row.id}
                          onClick={() => { if (!selected) setIngredientItems(prev => [...prev, dictRowToItem(row)]); setIngredientQuery(''); setIngredientResults([]) }}
                          style={{ padding: '4px 10px', borderRadius: '14px', border: `1px solid ${selected ? '#34A853' : '#D1D5DB'}`, background: selected ? '#E8F7EC' : '#FFF' }}>
                          <Text style={{ fontSize: '13px', color: selected ? '#34A853' : '#374151' }}>{name}</Text>
                        </View>
                      )
                    })}
                  </View>
                )}
              </View>

              {!form.name?.trim() && (
                <Text style={{ fontSize: '11px', color: '#E08A00', marginTop: '6px', display: 'block' }}>👆 提示：先填写商品名称，识别更准确</Text>
              )}

              {ingredientItems.length > 0 && (
                <View style={{ marginTop: '10px' }}>
                  {ingredientItems.map((it) => (
                    <View key={it.id} style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '12px', background: '#F6FBF7', border: '1px solid #D6EFD8' }}>
                      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#1F2937' }}>{it.name}</Text>
                          <Text style={{ fontSize: '11px', color: '#fff', background: '#34A853', padding: '1px 8px', borderRadius: '10px' }}>{it.nature}</Text>
                        </View>
                        <View onClick={() => setIngredientItems(prev => prev.filter(x => x.id !== it.id))} style={{ padding: '2px 8px' }}>
                          <Text style={{ fontSize: '13px', color: '#EF4444' }}>✕ 移除</Text>
                        </View>
                      </View>
                      {/* 占比 */}
                      <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <Text style={{ fontSize: '12px', color: '#4B5563' }}>占比</Text>
                        <Input
                          value={String(it.ratio)}
                          type="number"
                          onInput={(e: any) => { const v = Math.max(0, Math.min(100, Number(e.detail.value) || 0)); setIngredientItems(prev => prev.map(x => x.id === it.id ? { ...x, ratio: v } : x)) }}
                          style={{ width: '64px', height: '30px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '13px', padding: '0 8px', background: '#FFF' }} />
                        <Text style={{ fontSize: '11px', color: '#9CA3AF' }}>%（越高过敏提醒越强）</Text>
                      </View>
                      {/* 烹饪方式 */}
                      <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {COOKING_METHODS.map(m => {
                          const sel = it.cooking === m
                          return (
                            <View key={m} onClick={() => setIngredientItems(prev => prev.map(x => x.id === it.id ? { ...x, cooking: m } : x))}
                              style={{ padding: '3px 10px', borderRadius: '9999px', background: sel ? '#34A853' : '#FFF', border: `1px solid ${sel ? '#34A853' : '#D1D5DB'}` }}>
                              <Text style={{ fontSize: '12px', color: sel ? '#FFF' : '#374151' }}>{m}</Text>
                            </View>
                          )
                        })}
                      </View>
                      {/* 辅料 */}
                      <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {AUX_OPTIONS.map(a => {
                          const sel = it.aux.includes(a)
                          return (
                            <View key={a} onClick={() => setIngredientItems(prev => prev.map(x => x.id === it.id ? { ...x, aux: sel ? x.aux.filter(y => y !== a) : [...x.aux, a] } : x))}
                              style={{ padding: '3px 10px', borderRadius: '9999px', background: sel ? '#FDE68A' : '#FFF', border: '1px solid #E5C07B' }}>
                              <Text style={{ fontSize: '12px', color: sel ? '#92400E' : '#374151' }}>{a}</Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 📣 商家寄语（写给买家看的一段话，简短醒目，详情页会做成专属卡片） */}
            <View style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#FFFAF5', border: '1px solid #F0D9C0', borderLeftWidth: '4px', borderLeftColor: 'hsl(var(--primary))' }}>
              <Text style={{ fontSize: '14px', color: '#333', fontWeight: '700', marginBottom: '6px' }}>📣 商家寄语 / 商品描述（80 字以内）</Text>
              <Textarea
                style={{
                  width: '100%', minHeight: '80px',
                  borderRadius: '10px',
                  background: '#FFF', border: '1.5px solid #EEE',
                  fontSize: '14px', color: '#333',
                  padding: '10px 14px', boxSizing: 'border-box',
                }}
                placeholder="例：手工羊肉烩面——羊骨高汤慢熬，宽面筋道，配海带、豆腐丝、青菜、粉条，暖身养胃。"
                placeholderStyle="color:#BBB;font-size:13px"
                maxlength={80}
                value={form.description}
                onInput={(e: any) => setForm(f => ({ ...f, description: e.detail?.value ?? '' }))} />
              <Text style={{ fontSize: '11px', color: '#999', marginTop: '4px', display: 'block' }}>这段话会以「商家寄语」卡片醒目展示在商品详情页，建议写出商品最大卖点和风味，{form.description?.length ?? 0}/80</Text>
            </View>

            {/* 礼品专属字段（药膳手串 / 手作 / 护理）：与食养模块互斥，仅当类型≠食养食品时展示 */}
            {form.product_kind !== 'food' && (
              <View style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: '#FFF9F0', border: '1px solid #F0D9A8' }}>
                <Text style={{ fontSize: '14px', color: '#B45309', fontWeight: '700', marginBottom: '8px', display: 'block' }}>🎁 礼品详情（与食养模块互斥）</Text>

                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>寓意文化（灵魂文案）</Text>
                <Textarea
                  style={{ width: '100%', minHeight: '58px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
                  placeholder="如：合欢解郁、艾草驱秽——串起一腕清欢"
                  placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
                  value={form.gift_meaning}
                  onInput={(e: any) => setForm(f => ({ ...f, gift_meaning: e.detail?.value ?? '' }))} />

                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginTop: '12px', marginBottom: '6px', display: 'block' }}>材质 / 草本成分（逗号分隔，绝不填食用食材）</Text>
                <Textarea
                  style={{ width: '100%', minHeight: '50px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
                  placeholder="如：檀香、艾草、合欢皮、925银饰"
                  placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
                  value={(form.materials || []).join('、')}
                  onInput={(e: any) => setForm(f => ({ ...f, materials: (e.detail?.value ?? '').split(/[、，,\s]+/).filter(Boolean) }))} />

                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginTop: '12px', marginBottom: '6px', display: 'block' }}>材质工艺说明</Text>
                <Textarea
                  style={{ width: '100%', minHeight: '50px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
                  placeholder="如：天然草木+925银饰，古法编绳，单串手作约40分钟"
                  placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
                  value={form.gift_craft}
                  onInput={(e: any) => setForm(f => ({ ...f, gift_craft: e.detail?.value ?? '' }))} />

                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginTop: '12px', marginBottom: '6px', display: 'block' }}>送礼场景（每行一个）</Text>
                <Textarea
                  style={{ width: '100%', minHeight: '50px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
                  placeholder={'如：送给总熬夜的她\n乔迁新居\n长辈安康'}
                  placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
                  value={form.gift_scene}
                  onInput={(e: any) => setForm(f => ({ ...f, gift_scene: e.detail?.value ?? '' }))} />

                <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginTop: '12px', marginBottom: '6px', display: 'block' }}>保养与使用注意</Text>
                <Textarea
                  style={{ width: '100%', minHeight: '50px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
                  placeholder="如：天然草木，佩戴前后以软布轻拭；孕妇及敏感体质请遵医嘱使用"
                  placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
                  value={form.gift_care}
                  onInput={(e: any) => setForm(f => ({ ...f, gift_care: e.detail?.value ?? '' }))} />
                <Text style={{ fontSize: '11px', color: '#999', marginTop: '6px', display: 'block' }}>详情页将强制展示"本品为工艺礼品，非药品"免责；请勿填写疗效 / 辟邪等违规词</Text>
              </View>
            )}

            {/* 🌿 智能食养 · 食疗配对（仅食养食品） */}
            {form.product_kind === 'food' && (
            <View style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: '#FCF8F2', border: '1px solid #F0E6D8' }}>
              <Text style={{ fontSize: '14px', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '8px', display: 'block' }}>🌿 智能食养 · 食疗配对</Text>

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
                <Text style={{ fontSize: '11px', color: '#999', marginTop: '8px', display: 'block' }}>识别后自动填充下方食养字段，仍可手动微调。配置智能识图后支持"看图识菜"。</Text>
              </View>

              {/* 🔍 实时食疗安全分析（引擎边填边算） */}
              <View style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#FBF7F2', border: '1.5px solid #E8D9C8' }}>
                <Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '8px', display: 'block' }}>🔍 实时食疗安全分析（引擎边填边算）</Text>
                {therapyReport ? (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <View style={{ padding: '4px 10px', borderRadius: '9999px', background: '#EAF6EC', border: '1px solid #BFE3C4' }}>
                        <Text style={{ fontSize: '12px', color: '#2E7D32', fontWeight: '700' }}>整体性味 · {therapyReport.overall_nature}</Text>
                      </View>
                    </View>
                    {/* 三色预警：红=过敏 / 橙=慎食 / 蓝=慢病适配 */}
                    {therapyReport.warnings.length > 0 && (
                      <View style={{ marginBottom: '8px' }}>
                        {therapyReport.warnings.map((w, i) => {
                          const tone = w.level === 'red'
                            ? { bg: '#FDECEC', border: '#F5C2C2', fg: '#C0392B' }
                            : w.level === 'orange'
                              ? { bg: '#FFF4E5', border: '#F7D9A8', fg: '#B45309' }
                              : { bg: '#E8F0FE', border: '#BFD3F5', fg: '#1D4ED8' }
                          return (
                            <View key={i} style={{ padding: '6px 8px', borderRadius: '8px', background: tone.bg, borderLeftWidth: '3px', borderLeftColor: tone.fg, borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderTopColor: tone.border, borderRightColor: tone.border, borderBottomColor: tone.border, marginBottom: '6px' }}>
                              <Text style={{ fontSize: '11px', fontWeight: '700', color: tone.fg }}>{w.level === 'red' ? '🔴' : w.level === 'orange' ? '🟠' : '🔵'} {w.label}</Text>
                              <Text style={{ fontSize: '12px', color: '#444', lineHeight: '17px', display: 'block', marginTop: '2px' }}>{w.text}</Text>
                            </View>
                          )
                        })}
                      </View>
                    )}
                    {/* 商家寄语模板 + 一键套用 */}
                    <View style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '8px', background: '#FFFAF5', border: '1px dashed #F0D9C0' }}>
                      <Text style={{ fontSize: '11px', color: '#999' }}>系统生成商家寄语（80字内，可一键套用到下方描述）</Text>
                      <Text style={{ fontSize: '12px', color: '#333', lineHeight: '18px', display: 'block', marginTop: '4px' }}>{therapyReport.merchant_note}</Text>
                      <View onClick={() => setForm(f => ({ ...f, description: therapyReport.merchant_note }))}
                        style={{ marginTop: '6px', alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '9999px', background: 'hsl(var(--primary))' }}>
                        <Text style={{ fontSize: '12px', color: '#FFF' }}>一键套用寄语</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: '10px', color: '#AAA', marginTop: '6px', display: 'block' }}>{therapyReport.disclaimer}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: '12px', color: '#999', display: 'block' }}>从食材库添加食材或点「智能识别食材」后，这里实时显示整体性味 / 三色预警 / 商家寄语。</Text>
                )}
              </View>

              {/* 实时预览：顾客端卡片长什么样（边填边看，更赏心悦目） */}
              <Text style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'block' }}>实时预览（顾客视角）</Text>
              <View style={{ background: '#FFF', borderRadius: '12px', padding: '8px', marginBottom: '12px' }}>
                {(() => {
                  try {
                    const previewProduct: any = {
                      health_tag: form.health_tag,
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

              {/* 整体性味（引擎自动计算，可手动覆盖） */}
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>整体性味（引擎自动算，可手动覆盖）</Text>
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
            )}

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

    <CategoryManager
      visible={showCatModal}
      categories={categories}
      newCatName={newCatName}
      setNewCatName={setNewCatName}
      editingCatId={editingCatId}
      setEditingCatId={setEditingCatId}
      editingCatName={editingCatName}
      setEditingCatName={setEditingCatName}
      onClose={() => setShowCatModal(false)}
      onAddCategory={handleAddCategory}
      onMoveCategory={handleMoveCategory}
      onSaveRename={handleSaveRename}
      onDeleteCategory={handleDeleteCategory}
    />

    </View>
    </RouteGuard>
  )
}

export default MerchantProductsPage
