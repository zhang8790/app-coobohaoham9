// @title 商品管理（商家端）
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import RevenueCard from './RevenueCard'
import BarcodeTools from './BarcodeTools'
import ProductList from './ProductList'
import ProductFormModal from './ProductFormModal'
import {
  getMerchantStore, getMerchantProducts, getMerchantProductSales,
  getNearExpiryProducts, getCategories,
  createStoreCategory, updateStoreCategory, deleteStoreCategory,
  deleteProduct, updateProduct,
} from '@/db/api'
import { analyzeProductFromName } from '@/utils/food-therapy/dishAnalyzer'
import type { Product, Store, StoreCategory } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import CategoryManager from './CategoryManager'
import { useProductForm } from './useProductForm'

function MerchantProductsPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [revenue, setRevenue] = useState({ totalRevenue: 0, totalProfit: 0, totalSales: 0 })
  // —— 商品分类（store_categories：本店 + 平台全局）——
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [expiryMap, setExpiryMap] = useState<Record<string, string>>({})
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  // 分类管理 / 批量分析 的提交态（表单保存态在 useProductForm 内，互不干扰）
  const [saving, setSaving] = useState(false)
  const [batchAnalyzing, setBatchAnalyzing] = useState(false)

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
        // 性能：商品列表/临期视图/收益聚合三请求互相独立 → 并行（原纯串行是「进子菜单慢」的直接命中点）
        const [prodsRes, expRes, salesRes] = await Promise.all([
          getMerchantProducts(s.id),
          getNearExpiryProducts({ storeId: s.id, limit: 200 }).catch(() => [] as any[]),
          getMerchantProductSales(s.id).catch(() => ({} as Record<string, { sales: number; revenue: number }>)),
        ])
        const prods = prodsRes
        setProducts(Array.isArray(prods) ? prods : [])
        // 商品管理 临期预警串联：拉本店临期视图，按 product_id 聚合最严重阶段
        try {
          const exp = expRes
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
          const salesMap = salesRes
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

  // 表单逻辑（态 + handler + 食疗引擎）全部下沉到 useProductForm，零逻辑改动；
  // 必须放在 load 之后，否则 load 处于暂时性死区（TDZ）会运行时报错。
  const productForm = useProductForm(store, { onSaved: load })

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCategories() }, [loadCategories])

  // 商家中心「快捷操作」以 ?action=add / ?action=scan 跳入本页（QuickActions.tsx）。
  // 此前本页未消费该参数 → 从商家中心点「新增商品/扫码上架」跳过来毫无反应。
  // 消费一次：add → 立即开新增表单（handleNewProduct 不依赖 store，故不等 loading，避免卡在登录态瞬间丢弃）；
  // scan → 等 store 就绪再拉起扫码；barcode → 自营中心「条形码制作」入口，滚动定位到条码工具区。
  const router = useRouter()
  const actionHandledRef = useRef(false)
  useEffect(() => {
    if (actionHandledRef.current) return
    const act = router?.params?.action
    if (act === 'add') {
      productForm.handleNewProduct()
      actionHandledRef.current = true
    } else if (act === 'scan') {
      if (loading || !store) return
      productForm.handleScan()
      actionHandledRef.current = true
    } else if (act === 'barcode') {
      if (loading || !store) return
      setTimeout(() => Taro.pageScrollTo({ selector: '#barcode-tools', duration: 300 }), 300)
      actionHandledRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, store])

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

  // 列表行操作：上/下架（提取自原内联箭头，逻辑不变）
  const handleToggleActive = async (p: Product) => {
    try {
      await updateProduct(p.id, { is_active: !p.is_active })
      Taro.showToast({ title: p.is_active ? '已下架' : '已上架', icon: 'success' })
      load()
    } catch { Taro.showToast({ title: '操作失败', icon: 'error' }) }
  }

  // 列表行操作：删除（提取自原内联箭头，逻辑不变）
  const handleDeleteProduct = (p: Product) => {
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
  }

  // —— 商品分类管理（新建/改名/删除/排序）——
  const handleAddCategory = async () => {
    if (!store) return
    const name = newCatName.trim()
    if (!name) { Taro.showToast({ title: '请输入分类名称', icon: 'none' }); return }
    setSaving(true)
    const created = await createStoreCategory({ storeId: store.id, name, parentId: newCatParent || null })
    setSaving(false)
    if (!created) { Taro.showToast({ title: newCatParent ? '创建二级分类失败：请确认总部已部署二级分类迁移' : '创建失败，请重试', icon: 'none' }); return }
    setNewCatName('')
    setNewCatParent('')
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
        if (productForm.form.category_id === cat.id) productForm.setForm(f => ({ ...f, category_id: '' }))
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

  const filtered = filter === 'all' ? products : products.filter(p => filter === 'online' ? p.is_active : !p.is_active)

  if (loading) return (
    <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FFF8F4' }}>
      <Text style={{ fontSize: '32rpx', color: 'var(--muted-foreground)' }}>加载中...</Text>
    </View>
  )

  return (
    <RouteGuard>
      <View style={{ minHeight: '100vh', background: '#FFF8F4', paddingBottom: '32px' }}>

        {store && (
          <View style={{ margin: '8px 14px 0', padding: '10px 14px', borderRadius: '14px', background: '#FFF', border: '1px solid #F2F2F2' }}>
            <Text style={{ fontSize: '28rpx', color: '#888' }}>{store.name}</Text>
          </View>
        )}

        <RevenueCard revenue={revenue} />

        <ProductList
          products={filtered}
          filter={filter}
          setFilter={setFilter}
          expiryMap={expiryMap}
          categories={categories}
          onEdit={productForm.openEdit}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteProduct}
          onBatchIn={(p) => Taro.navigateTo({ url: `/pages/merchant/merchant-batch/index?productId=${p.id}` })}
        >

          {/* 操作按钮 —— 关键修复区域 */}
          <View style={{ display: 'flex', gap: '10px', padding: '4px 14px 0' }}>
            {/* 新增商品按钮 */}
            <View
              onClick={productForm.handleNewProduct}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '13px 16px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #333333, hsl(var(--primary)))',
                boxShadow: '0 2px 8px hsl(var(--primary) / 0.25)',
              }}>
              <Text style={{ color: '#FFF', fontSize: '30rpx', fontWeight: 'bold' }}>+ 新增商品</Text>
            </View>
            {/* 扫码上架按钮 */}
            <View
              onClick={productForm.handleScan}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '13px 16px', borderRadius: '14px',
                background: '#FFF', border: '2px solid #FF8A65',
              }}>
              {productForm.scanning
                ? <Text style={{ fontSize: '30rpx', color: 'hsl(var(--primary))' }}>扫描中…</Text>
                : <View style={{ flexDirection: 'row', alignItems: 'center' }}><Icon name="barcode-scan" size={15} className="text-primary" /><Text style={{ color: 'hsl(var(--primary))', fontSize: '30rpx', fontWeight: 'bold' }}>扫码上架</Text></View>}
            </View>
          </View>

          {/* 条形码制作区（自营中心「条形码制作」入口深链定位锚点） */}
          <View id="barcode-tools">
            <BarcodeTools store={store} />
          </View>

          {/* 批量配料安全分析按钮 */}
          <View style={{ display: 'flex', gap: '10px', padding: '10px 14px 0' }}>
            <View
              onClick={handleBatchAnalyze}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '13px 16px', borderRadius: '14px',
                background: batchAnalyzing ? '#F0E6DA' : '#FFF',
                border: '2px dashed #333333',
              }}>
              {batchAnalyzing
                ? <Text style={{ color: 'hsl(var(--primary))', fontSize: '30rpx', fontWeight: 'bold' }}>分析中…</Text>
                : <Text style={{ color: 'hsl(var(--primary))', fontSize: '30rpx', fontWeight: 'bold' }}> 批量分析配料安全</Text>}
            </View>
          </View>

          {/* 扫码规范说明 */}
          <View style={{ padding: '6px 18px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Text style={{ fontSize: '22rpx', color: '#BBB' }}> 仅支持摄像头扫描一维条形码，不支持相册图片识别，杜绝作弊</Text>
          </View>

        </ProductList>

        {/* 编辑/新增弹窗（已抽到 ProductFormModal，逻辑由 useProductForm 提供） */}
        <ProductFormModal
          controller={productForm}
          categories={categories}
          products={products}
          onManageCategory={() => setShowCatModal(true)}
        />

        <CategoryManager
          visible={showCatModal}
          categories={categories}
          newCatName={newCatName}
          setNewCatName={setNewCatName}
          newCatParent={newCatParent}
          setNewCatParent={setNewCatParent}
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
