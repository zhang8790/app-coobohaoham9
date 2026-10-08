// 商品表单逻辑钩子（从 merchant-products 页面抽出，零逻辑改动）
// 持有全部表单态 + 处理函数 + 食疗引擎派生 memo；通过单一 controller 对象下传给 ProductFormModal。
import type React from 'react'
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { scanRaw } from '@/utils/scan'
import {
  getProductByBarcode, generateProductBarcode, callPrintBarcode,
  createProduct, updateProduct,
} from '@/db/api'
import { supabase } from '@/client/supabase'
import { uploadImage, uploadVideo } from '@/utils/upload'
import { analyzeProductFromName } from '@/utils/food-therapy/dishAnalyzer'
import {
  buildTherapyReport, deriveFitConstitution, FIT_CROWD_OPTIONS,
  type ProductIngredientInput, sanitizeTherapyCopy,
} from '@/utils/food-therapy/product-therapy'
import { HEALTH_TAGS, NATURE_SCALE } from '@/utils/food-therapy/types'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import type { Product, Store } from '@/db/types'

export type FormState = {
  name: string; price: string; original_price: string; cost_price: string
  discount_rate: string
  stock: string; description: string; barcode: string
  main_image: string; sub_images: string[]; detail_images: string[]; video_url: string
  media: string[]
  is_active: boolean
  ingredients: string[]
  // —— 智能食养 · 食疗配对（让商品更懂用户）——
  overall_nature: string
  health_tag: string[]
  match_goods: string[]
  conflict_goods: string[]
  aux_remind: string
  allergens: string[]
  nutrition: { energy_kj?: number; protein_g?: number; fat_g?: number; carb_g?: number; sugar_g?: number; sodium_mg?: number } | null
  safety_grade: string
  safety_summary: string
  // —— 辨证适配（迁移 00237）——
  fit_people_override: string
  fit_crowd_tags: string[]
  // 导购文案 / 商家寄语（本地规则引擎生成，可手改；与 description 区分：description 仅用于分享文案）
  guide_sentence: string
  category_id: string
  // 二级分类（场景内细分，仅筛选维度；一级归类仍为 category_id）
  sub_category_id: string
  // —— 商品类型化（迁移 20260803）：礼品/手作与食养食品分开 ——
  product_kind: string
  materials: string[]
  gift_meaning: string
  gift_craft: string
  gift_scene: string
  gift_care: string
}
export const emptyForm = (): FormState => ({
  name: '', price: '', original_price: '', cost_price: '', discount_rate: '',
  stock: '', description: '', barcode: '',
  main_image: '', sub_images: [], detail_images: [], video_url: '',
  media: [],
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
  fit_people_override: '',
  fit_crowd_tags: [],
  guide_sentence: '',
  category_id: '',
  sub_category_id: '',
  product_kind: 'food',
  materials: [],
  gift_meaning: '',
  gift_craft: '',
  gift_scene: '',
  gift_care: '',
})

// 整体性味色阶（寒凉偏冷蓝、平性中性绿、温热偏暖红），编辑端复用，与卡片一致
export const NATURE_COLOR: Record<string, string> = {
  '大寒': '#0369A1', '寒凉': '#0369A1',
  '平性': '#15803D',
  '微温': '#B45309', '温热': '#B45309', '大热': '#DC2626',
}

// 结构化食材项（食疗商品系统化：从食材库选择 + 占比 + 烹饪 + 辅料）
export type IngredientItem = {
  id: string
  name: string
  nature: string
  base_effect?: string | null
  caution_crowds?: string | null
  allergens: string[]
  chronic_tags: string[]
  neutralize?: string | null
  is_homology?: boolean | null
  ratio: number
  cooking: string
  aux: string[]
}
export const COOKING_METHODS = ['清炒', '少油', '重油', '红烧', '水煮', '凉拌']
export const AUX_OPTIONS = ['盐', '糖', '食用油', '酱油', '味精']

export type ProductFormController = {
  showForm: boolean
  setShowForm: (v: boolean) => void
  editId: string | null
  setEditId: (v: string | null) => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  ingredientItems: IngredientItem[]
  setIngredientItems: React.Dispatch<React.SetStateAction<IngredientItem[]>>
  ingredientDict: FoodIngredientRow[]
  ingredientQuery: string
  setIngredientQuery: (v: string) => void
  ingredientResults: string[]
  setIngredientResults: (v: string[]) => void
  freeIngredient: string
  setFreeIngredient: (v: string) => void
  addFreeIngredient: () => void
  handleRegenerateCopy: () => void
  dishName: string
  setDishName: (v: string) => void
  dishImageUrl: string
  setDishImageUrl: (v: string) => void
  analyzing: boolean
  saving: boolean
  generatingBarcode: boolean
  printingBarcode: boolean
  scanning: boolean
  therapyReport: any
  liveSafety: any
  safetyTone: any
  handleNewProduct: () => void
  handleScan: () => Promise<void>
  handleCloseForm: () => void
  openEdit: (p: Product) => void
  handleSave: () => Promise<void>
  handleChooseMedia: () => Promise<void>
  handleRemoveMedia: (i: number) => void
  handleSetMain: (i: number) => void
  handleChooseVideo: () => Promise<void>
  pickDishImage: () => Promise<void>
  runSmartAnalyze: () => Promise<void>
  handleIdentifyIngredients: () => void
  onGenerateBarcode: () => Promise<void>
  onPrintBarcode: () => Promise<void>
  toggleIngredient: (key: string) => void
  toggleArrayField: (field: 'health_tag' | 'match_goods' | 'conflict_goods' | 'fit_crowd_tags', val: string, max?: number) => void
  dictRowToItem: (row: FoodIngredientRow) => IngredientItem
}

export function useProductForm(store: Store | null, opts: { onSaved: () => void }): ProductFormController {
  const [form, setForm] = useState<FormState>(emptyForm())
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  // 批量配料安全分析：对缺失安全评级的商品跑本地确定性引擎并回写
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientResults, setIngredientResults] = useState<string[]>([])
  // 自由原料：食材库里没有的自定义原料（free: 前缀标记，不参与食养派生，仅作原料清单记录）
  const [freeIngredient, setFreeIngredient] = useState('')
  // 重新生成文案：强制触发一次商家寄语重算（食养系统本就边填边算，此按钮给商家一个显式「重算」入口）
  const [regenNonce, setRegenNonce] = useState(0)
  // 食疗商品系统化：食材库（DB 可维护）+ 结构化食材项
  const [ingredientDict, setIngredientDict] = useState<FoodIngredientRow[]>([])
  const [ingredientItems, setIngredientItems] = useState<IngredientItem[]>([])
  // 智能识别（食疗/安全系统）：菜名 + 图片 → 自动识别属性
  const [dishName, setDishName] = useState('')
  const [dishImageUrl, setDishImageUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingBarcode, setGeneratingBarcode] = useState(false)
  const [printingBarcode, setPrintingBarcode] = useState(false)
  const [scanning, setScanning] = useState(false)

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
    is_homology: row.is_homology ?? null,
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
    // 传入食疗标签(health_tag)，让「适合人群」按中医体质/证型辨证生成
    return buildTherapyReport(form.name || '本菜品', inputs, form.health_tag)
  }, [ingredientItems, form.name, form.health_tag, ingredientDict, regenNonce])

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

  // 辨证适配标签：随「食疗标签」变化自动推导；商家可再手动增删。
  // 仅在 health_tag 变化时重算，避免覆盖商家已手动调整过的标签（迁移 00237）
  const healthTagKey = form.health_tag.join(',')
  useEffect(() => {
    const { crowdTags } = deriveFitConstitution(form.health_tag)
    setForm(f => ({ ...f, fit_crowd_tags: crowdTags }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthTagKey])

  // ─── 打开新增表单 ───
  const handleNewProduct = () => {
    setForm(emptyForm())
    setEditId(null)
    setIngredientItems([])
    setShowForm(true)
  }

  // 扫码（统一走 scanRaw，避免各页复制 Taro.scanCode 样板）
  const handleScan = async () => {
    if (!store) return
    setScanning(true)
    const raw = await scanRaw({ scanType: ['barCode'], onlyFromCamera: true })
    setScanning(false)
    if (raw == null) { Taro.showToast({ title: '扫码取消', icon: 'none' }); return }
    try {
      const existing = await getProductByBarcode(raw)
      if (existing) {
        Taro.showModal({
          title: '条形码已存在',
          content: `「${existing.name}」已使用此码，是否编辑？`,
          confirmText: '去编辑',
          success: (r) => { if (r.confirm) openEdit(existing) },
        })
      } else {
        setForm(f => ({ ...emptyForm(), barcode: raw }))
        setEditId(null); setShowForm(true)
      }
    } catch (e) {
      Taro.showToast({ title: '查询失败', icon: 'none' })
    }
  }

  const openEdit = (p: Product) => {
    // 把已有的 主图/副图/详情图 合并回单一有序图库（去重、保序、截断 20）
    const media = Array.from(new Set(
      [p.main_image ?? p.image_url ?? '', ...(p.sub_images ?? []), ...(p.detail_images ?? [])].filter(Boolean),
    )).slice(0, 20)
    setForm({
      name: p.name,
      price: String(p.price),
      original_price: p.original_price != null ? String(p.original_price) : '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      discount_rate: p.discount_rate != null ? String(p.discount_rate) : '',
      stock: String(p.stock),
      description: p.description ?? '',
      barcode: p.barcode ?? '',
      media,
      main_image: media[0] || '',
      sub_images: media.slice(1, 10),
      detail_images: media,
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
      fit_people_override: (p as any).fit_people_override ?? '',
      fit_crowd_tags: (p as any).fit_crowd_tags ?? [],
      guide_sentence: (p as any).guide_sentence ?? '',
      category_id: p.category_id ?? '',
      sub_category_id: (p as any).sub_category_id ?? '',
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
      // 食材库查不到 → 标记为自由原料（free: 前缀），保持与录入时一致
      return { id: `free:${nm}`, name: nm, nature: '平性', base_effect: null, caution_crowds: null, allergens: [], chronic_tags: [], neutralize: null, ratio: 50, cooking: '清炒', aux: [] }
    })
    setIngredientItems(items)
  }

  // 一键生成店内码：
  // - 编辑态（已有 editId）：即时补码/重生成并回写。
  // - 新建态（无 editId）：先保存商品（handleSave 会停留编辑态并自动分配店内码），再提示。
  const onGenerateBarcode = async () => {
    setGeneratingBarcode(true)
    try {
      let pid = editId
      if (!pid) {
        // 新建未保存：先上架，后端自动分配店内码，弹窗停留编辑态
        await handleSave()
        Taro.showToast({ title: '已保存并自动分配店内码', icon: 'success' })
        return
      }
      const res = await generateProductBarcode(pid)
      if (res.ok && res.product?.barcode) {
        setForm(f => ({ ...f, barcode: res.product!.barcode! }))
        Taro.showToast({ title: '已生成店内码', icon: 'success' })
      } else {
        // 出真因：权限不足 / 门店缺前缀 / 网络异常，别再让用户对着「请重试」干瞪眼
        const msg = res.error || '未知错误'
        Taro.showModal({
          title: '生成店内码失败',
          content: /owner|权限|403|not allowed|policy/i.test(msg)
            ? '当前账号不是该门店负责人，无法写入商品条码。请用门店负责人账号登录，或到网页管理后台操作。'
            : msg,
          showCancel: false,
        })
      }
    } finally {
      setGeneratingBarcode(false)
    }
  }

  // 打印条码标签（需该门店已配置易联云打印机）
  const onPrintBarcode = async () => {
    // 原实现在这两个前置不满足时直接 return，点击「打印标签」毫无反应 —— 静默失败，
    // 用户只会以为按钮坏了。改为明确告知原因 + 给出下一步。
    if (!editId) {
      Taro.showModal({ title: '暂不能打印', content: '请先保存商品，保存后即可打印条码标签。', showCancel: false })
      return
    }
    if (!form.barcode) {
      Taro.showModal({ title: '暂不能打印', content: '该商品还没有店内码，请先点「一键生成店内码」。', showCancel: false })
      return
    }
    setPrintingBarcode(true)
    try {
      const r = await callPrintBarcode({ productId: editId, storeId: store?.id })
      if (r.success) {
        Taro.showToast({ title: '已推送打印', icon: 'success' })
      } else if (r.need_config) {
        Taro.showModal({ title: '未配置打印机', content: '该门店尚未配置已启用的云打印机，请先到「设置—小票打印」配置。', showCancel: false })
      } else {
        // 最常见真因：码只在前端 state 里、没落库 → 服务端读到空条码。给出可判断的提示。
        const err = r.error || '未知错误'
        Taro.showModal({
          title: '打印失败',
          content: /无条码/.test(err)
            ? '该商品的店内码没能写入数据库（通常是权限不足被安全策略拒绝）。请用门店负责人账号重试，或到网页管理后台生成。'
            : err,
          showCancel: false,
        })
      }
    } finally {
      setPrintingBarcode(false)
    }
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
      const isGiftKind = form.product_kind && form.product_kind !== 'food'
      // 药食同源合规：非礼品类且存在未收录国家《药食同源目录》的食材 → 保存成功后非阻塞提示（不阻止保存）
      const nonHomologyNames = isGiftKind
        ? []
        : ingredientItems.filter((it) => it.is_homology === false).map((it) => it.name)
      const payload: any = {
        name: form.name, description: form.description, price,
        stock, barcode: form.barcode && form.barcode.trim() ? form.barcode.trim() : null,
        // 新建商品且无码时自动分配店内码（保证每个商品都可被扫码体系识别）
        auto_barcode: !editId && !(form.barcode && form.barcode.trim()),
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
        // 辨证增强（迁移 00237）：商家手填覆盖文案 + 适配体质标签
        fit_people_override: isGiftKind ? undefined : (form.fit_people_override.trim() ? sanitizeTherapyCopy(form.fit_people_override.trim()) : undefined),
        fit_crowd_tags: isGiftKind ? undefined : (form.fit_crowd_tags.length > 0 ? form.fit_crowd_tags : undefined),
        guide_sentence: isGiftKind ? undefined : (form.guide_sentence.trim() || undefined),
        therapy_pending: isGiftKind ? false : !therapyReport,
        is_active: form.is_active,
        category_id: form.category_id || null,
        sub_category_id: form.sub_category_id || null,
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
        setShowForm(false)
      } else {
        const autoBarcode = !(form.barcode && form.barcode.trim())
        const created = await createProduct({ ...payload, store_id: store.id, auto_barcode: autoBarcode })
        if (!created) {
          Taro.showToast({ title: '保存失败，请检查后重试', icon: 'error' })
          return
        }
        // 新建成功后停留编辑态：回写 id 与自动分配的店内码，让用户立即打印标签
        setEditId(created.id)
        setForm(f => ({ ...f, barcode: created.barcode || f.barcode }))
        Taro.showToast({
          title: created.barcode
            ? '已上架，已自动分配店内码，可立即打印标签'
            : '已上架（门店未配置条码前缀，可稍后在编辑页生成条码）',
          icon: 'success',
        })
        if (nonHomologyNames.length) {
          Taro.showModal({
            title: '药食同源合规提示',
            content: `以下食材未收录于国家《药食同源目录》，请勿对其作药食同源功效宣称：${nonHomologyNames.join('、')}`,
            showCancel: false,
          })
        }
        opts.onSaved()
      }
    } catch (e: any) {
      console.error('[商品管理] 保存失败', e)
      const msg: string = e?.bizMessage || e?.message || '未知错误'
      const code: string = e?.code || ''
      console.error('[商品管理] 错误码(code):', code, '| details:', e?.details)
      // 归属/权限类错误给出明确中文提示，便于真机定位（而不是笼统的"被安全策略拒绝"）
      if (['STORE_OWNER_MISMATCH', 'PRODUCT_OWNER_MISMATCH', 'STORE_MISSING', 'PRODUCT_STORE_MISSING'].includes(code)) {
        Taro.showToast({ title: '当前账号无权操作该门店', icon: 'none', duration: 4000 })
      } else if (/row-level security|policy/.test(msg)) {
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

  // 统一媒体上传：单一有序图库驱动 主图/副图/详情图，避免分三块各自点击上传。
  // 规则：media[0] = 主图；media[1..9] = 副图（最多 9）；media 全量 = 详情图（详情页依次展示，最多 20）。
  const setMedia = (list: string[]) => {
    const m = list.filter(Boolean).slice(0, 20)
    setForm(f => ({ ...f, media: m, main_image: m[0] || '', sub_images: m.slice(1, 10), detail_images: m }))
  }
  // 简单化：循环选图突破微信 chooseMedia 单次最多 9 张的限制，让用户一次想选多少选多少（上限 20）；
  // 失败图不再被 setMedia 的 filter(Boolean) 静默丢弃，累计提示失败张数，已成功图照常入册。
  const handleChooseMedia = async () => {
    const rest0 = 20 - form.media.length
    if (rest0 <= 0) { Taro.showToast({ title: '最多20张图片', icon: 'none' }); return }
    Taro.showLoading({ title: '上传中...' })
    try {
      const accumulated: string[] = []
      let failed = 0
      while (form.media.length + accumulated.length < 20) {
        const rest = 20 - (form.media.length + accumulated.length)
        const batch = Math.min(9, rest)
        const urls = (await uploadImage({ count: batch })) as string[]
        if (!urls || urls.length === 0) break                          // 用户取消或系统异常 → 结束
        const ok = urls.filter(Boolean)                                // 剔除上传失败的空串
        failed += urls.length - ok.length
        accumulated.push(...ok)
        if (urls.length < batch) break                                 // 用户主动少选 = 结束补选
      }
      if (accumulated.length) setMedia([...form.media, ...accumulated])
      if (failed > 0) Taro.showToast({ title: `${failed} 张上传失败，可重新添加`, icon: 'none' })
    } catch (e) {
      Taro.showToast({ title: '上传失败，请重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }
  const handleRemoveMedia = (i: number) => setMedia(form.media.filter((_, j) => j !== i))
  const handleSetMain = (i: number) => {
    if (i === 0) return
    setMedia([form.media[i], ...form.media.filter((_, j) => j !== i)])
  }

  // 视频上传
  const handleChooseVideo = async () => {
    Taro.showLoading({ title: '上传中...' })
    try {
      const url = await uploadVideo()
      if (url) setForm(f => ({ ...f, video_url: url }))
      else Taro.showToast({ title: '上传失败', icon: 'none' })
    } catch (e) {
      Taro.showToast({ title: '操作失败' })
    } finally {
      Taro.hideLoading()
    }
  }

  // 智能识别：上传菜品/配料图作为识别素材
  const pickDishImage = async () => {
    Taro.showLoading({ title: '上传中...' })
    try {
      const url = await uploadImage()
      if (url) setDishImageUrl(url)
      else Taro.showToast({ title: '上传失败', icon: 'none' })
    } catch (e) {
      Taro.showToast({ title: '操作失败' })
    } finally {
      Taro.hideLoading()
    }
  }

  // 把识别结果回填到表单（识别出的字段覆盖，未识别的保留手动值）
  const fillFromAnalysis = (a: any) => {
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
        fillFromAnalysis(data.analysis as any)
        Taro.showToast({ title: '识图完成', icon: 'success' })
      } else {
        const local = analyzeProductFromName(dishName.trim(), form.ingredients)
        fillFromAnalysis(local)
        const source = data?.source as string | undefined
        const message = data?.message as string | undefined
        if (source === 'none') {
          Taro.showToast({ title: '已本地识别（未配置识图）', icon: 'none' })
        } else if (source === 'llm_error') {
          Taro.showToast({ title: `识图失败：${message || '服务异常'}`, icon: 'none' })
        } else {
          Taro.showToast({ title: `识图失败：${message || '请重试'}`, icon: 'none' })
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
  const toggleArrayField = (field: 'health_tag' | 'match_goods' | 'conflict_goods' | 'fit_crowd_tags', val: string, max = 99) => {
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
      ? { label: ' 需关注', bg: '#FDECEC', border: '#F5C2C2', fg: '#C0392B' }
      : { label: ' 平稳', bg: '#EAF6EC', border: '#BFE3C4', fg: '#2E7D32' }
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

  // 自由原料：手动输入食材库里没有的原料（多个用空格 / 顿号分隔），free: 前缀标记，不参与食养派生
  const addFreeIngredient = () => {
    const names = (freeIngredient || '').split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean)
    if (!names.length) { Taro.showToast({ title: '请输入原料名', icon: 'none' }); return }
    setIngredientItems(prev => {
      const exist = new Set(prev.map(it => it.name))
      const add: IngredientItem[] = names
        .filter(n => !exist.has(n))
        .map(n => ({
          id: `free:${n}`, name: n, nature: '平性', base_effect: null, caution_crowds: null,
          allergens: [], chronic_tags: [], neutralize: null, ratio: 50, cooking: '清炒', aux: [],
        }))
      if (!add.length) return prev
      Taro.showToast({ title: `已添加 ${add.length} 种自由原料`, icon: 'success' })
      return [...prev, ...add]
    })
    setFreeIngredient('')
  }

  // 本地规则引擎生成导购文案（与网页后台 buildRuleCopy 同源，零 LLM 依赖，合规内置医疗宣称闸门）
  const buildRuleCopy = (f: FormState): { guide_sentence: string } => {
    const name = f.name || '这款好物'
    const nature = f.overall_nature || (ingredientItems.length ? '平和' : '')
    const rec = f.fit_crowd_tags.length ? f.fit_crowd_tags.join('、') : '注重食养的人'
    const guide = `${name}${nature ? `性${nature}` : ''}，适合${rec}，温润好入口，食疗日常小确幸。`
    return { guide_sentence: guide }
  }

  // 重新生成文案：显式触发一次导购文案（guide_sentence）重算，结果可手改
  const handleRegenerateCopy = () => {
    setForm(f => ({ ...f, ...buildRuleCopy(f) }))
    Taro.showToast({ title: '已重新生成导购文案', icon: 'success' })
  }

  return {
    showForm, setShowForm,
    editId, setEditId,
    form, setForm,
    ingredientItems, setIngredientItems,
    ingredientDict,
    ingredientQuery, setIngredientQuery,
    ingredientResults, setIngredientResults,
    freeIngredient, setFreeIngredient,
    addFreeIngredient, handleRegenerateCopy,
    dishName, setDishName,
    dishImageUrl, setDishImageUrl,
    analyzing, saving, generatingBarcode, printingBarcode, scanning,
    therapyReport, liveSafety, safetyTone,
    handleNewProduct, handleScan, handleCloseForm, openEdit, handleSave,
    handleChooseMedia, handleRemoveMedia, handleSetMain, handleChooseVideo,
    pickDishImage, runSmartAnalyze, handleIdentifyIngredients,
    onGenerateBarcode, onPrintBarcode,
    toggleIngredient, toggleArrayField, dictRowToItem,
  }
}
