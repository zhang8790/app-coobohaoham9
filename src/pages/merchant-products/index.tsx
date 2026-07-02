// @title 商品管理（商家端）
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image, View, Text, Input, Textarea, Switch } from '@tarojs/components'
import {
  getMerchantStore, getMerchantProducts,
  createProduct, updateProduct, deleteProduct, getProductByBarcode,
} from '@/db/api'
import type { Product, Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

type FormState = {
  name: string; price: string; original_price: string; cost_price: string
  discount_rate: string
  stock: string; description: string; barcode: string
  main_image: string; sub_images: string[]; detail_images: string[]; video_url: string
  is_active: boolean
}
const emptyForm = (): FormState => ({
  name: '', price: '', original_price: '', cost_price: '', discount_rate: '',
  stock: '', description: '', barcode: '',
  main_image: '', sub_images: [], detail_images: [], video_url: '',
  is_active: true,
})

function calcMargin(price: number, cost?: number): string {
  if (!cost || cost <= 0 || price <= 0) return '-'
  return ((price - cost) / price * 100).toFixed(1) + '%'
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getMerchantStore()
      setStore(s)
      if (s) {
        const prods = await getMerchantProducts(s.id)
        setProducts(Array.isArray(prods) ? prods : [])
      }
    } catch (e) {
      console.error('[商品管理] load 失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── 打开新增表单 ───
  const handleNewProduct = () => {
    console.log('[商品管理] 点击新增商品')
    setForm(emptyForm())
    setEditId(null)
    setShowForm(true)
    console.log('[商品管理] showForm 已设为 true')
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
      const payload: any = {
        name: form.name, description: form.description, price,
        stock, barcode: form.barcode && form.barcode.trim() ? form.barcode.trim() : null,
        main_image: form.main_image || undefined,
        sub_images: form.sub_images.length > 0 ? form.sub_images : undefined,
        detail_images: form.detail_images.length > 0 ? form.detail_images : undefined,
        video_url: form.video_url || undefined,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
        original_price: form.original_price ? parseFloat(form.original_price) : undefined,
        discount_rate: form.discount_rate ? parseFloat(form.discount_rate) : undefined,
      }
      if (editId) {
        await updateProduct(editId, payload)
        Taro.showToast({ title: '修改成功', icon: 'success' })
      } else {
        await createProduct({ ...payload, store_id: store.id })
        Taro.showToast({ title: '上架成功', icon: 'success' })
      }
      setShowForm(false); load()
    } catch (e) {
      console.error('[商品管理] 保存失败', e)
      Taro.showToast({ title: '保存失败', icon: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // 关闭弹窗
  const handleCloseForm = () => {
    setShowForm(false)
  }

  // 图片选择
  const chooseImage = async (multiple = false, max = 1): Promise<string[]> => {
    const res = await Taro.chooseMedia({
      mediaType: ['image'],
      count: multiple ? max : 1,
      sizeType: ['compressed'],
    })
    return res.tempFiles.map(f => f.tempFilePath)
  }

  const handleChooseMain = async () => {
    try {
      const imgs = await chooseImage(false)
      if (imgs[0]) setForm(f => ({ ...f, main_image: imgs[0] }))
    } catch {}
  }
  const handleChooseSub = async () => {
    const rest = 9 - form.sub_images.length
    if (rest <= 0) { Taro.showToast({ title: '最多9张副图', icon: 'none' }); return }
    try {
      const imgs = await chooseImage(true, rest)
      setForm(f => ({ ...f, sub_images: [...f.sub_images, ...imgs] }))
    } catch {}
  }
  const handleChooseDetail = async () => {
    const rest = 20 - form.detail_images.length
    if (rest <= 0) { Taro.showToast({ title: '最多20张详情图', icon: 'none' }); return }
    try {
      const imgs = await chooseImage(true, rest)
      setForm(f => ({ ...f, detail_images: [...f.detail_images, ...imgs] }))
    } catch {}
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

      {/* ═══ 顶部导航 ═══ */}
      <View style={{
        display: 'flex', alignItems: 'center',
        padding: '12px 14px 8px',
      }}>
        <View
          onClick={() => Taro.navigateBack()}
          style={{
            width: '40px', height: '40px', borderRadius: '20px',
            background: '#F0E6D8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ fontSize: '18px' }}>←</Text>
        </View>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: 'bold', color: '#333', paddingRight: '40px' }}>商品管理</Text>
      </View>

      {store && (
        <View style={{ margin: '8px 14px 0', padding: '10px 14px', borderRadius: '14px', background: '#FFF', border: '1px solid #F0E6D8' }}>
          <Text style={{ fontSize: '14px', color: '#888' }}>{store.name}</Text>
        </View>
      )}

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
            placeholderStyle="color:#BBB;font-size:14px"
          />
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
              color: filter === key ? '#C2410C' : '#999',
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
            background: 'linear-gradient(135deg, #FF8A65, #FF5722)',
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
            ? <Text style={{ fontSize: '15px', color: '#C2410C' }}>扫描中…</Text>
            : <Text style={{ color: '#C2410C', fontSize: '15px', fontWeight: 'bold' }}>📷 扫码上架</Text>}
        </View>
      </View>

      {/* 扫码规范说明 */}
      <View style={{ padding: '6px 18px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Text style={{ fontSize: '11px', color: '#BBB' }}>📷 仅支持摄像头扫描一维条形码，不支持相册图片识别，杜绝作弊</Text>
      </View>

      {/* 商品列表 */}
      {filtered.length === 0 ? (
        <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0 20px', gap: '12px' }}>
          <Text style={{ fontSize: '48px' }}>📦</Text>
          <Text style={{ fontSize: '14px', color: '#999' }}>暂无商品，点击上方"新增商品"添加</Text>
        </View>
      ) : (
        filtered.map(p => {
          const margin = calcMargin(p.price, p.cost_price)
          return (
            <View key={p.id} style={{ margin: '10px 14px 0', borderRadius: '16px', background: '#FFF', border: '1px solid #F0E6D8', overflow: 'hidden' }}>
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
                    </View>
                  </View>
                  <Text style={{ fontSize: '18px', fontWeight: 'bold', color: '#C2410C', marginTop: '4px' }}>¥{p.price}</Text>
                  {p.original_price && <Text style={{ fontSize: '12px', color: '#BBB', textDecorationLine: 'line-through', marginLeft: '4px' }}>¥{p.original_price}</Text>}
                  {p.cost_price != null && (
                    <Text style={{ fontSize: '12px', color: '#AAA', marginTop: '2px' }}>成本 ¥{p.cost_price} · 毛利 {margin}</Text>
                  )}
                  {p.discount_rate != null && (
                    <Text style={{ fontSize: '12px', color: '#C2410C', marginTop: '2px' }}>🏷️ 让利 {p.discount_rate}%</Text>
                  )}
                  <Text style={{ fontSize: '12px', color: '#AAA', marginTop: '2px' }}>库存：{p.stock}</Text>
                </View>
              </View>
              {/* 操作栏 */}
              <View style={{
                display: 'flex', borderTop: '1px solid #F0E6D8',
              }}>
                <View
                  onClick={() => openEdit(p)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '13px', color: '#C2410C', fontWeight: '500' }}>✏️ 编辑</Text>
                </View>
                <View style={{ width: '1px', background: '#F0E6D8' }} />
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
                <View style={{ width: '1px', background: '#F0E6D8' }} />
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
                onInput={(e: any) => setForm(f => ({ ...f, name: e.detail?.value ?? '' }))}
              />
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
                  onInput={(e: any) => setForm(f => ({ ...f, price: e.detail?.value ?? '' }))}
                />
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
                  onInput={(e: any) => setForm(f => ({ ...f, original_price: e.detail?.value ?? '' }))}
                />
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
                  onInput={(e: any) => setForm(f => ({ ...f, cost_price: e.detail?.value ?? '' }))}
                />
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

            {/* 让利% — 与犒赏铺 API discount_rate 对齐 */}
            <View style={{ marginBottom: '14px' }}>
              <Text style={{ fontSize: '13px', color: '#333', fontWeight: '600', marginBottom: '6px' }}>🏷️ 让利 %</Text>
              <Input
                style={{
                  width: '100%', height: '42px', borderRadius: '10px',
                  background: '#FFF9F0', border: '1.5px solid #FFCC80',
                  fontSize: '14px', color: '#E65100', padding: '0 10px', boxSizing: 'border-box',
                }}
                placeholder="如: 15 表示让利15%（0~100）"
                placeholderStyle={{ color: '#CCC' }}
                type="digit"
                value={form.discount_rate}
                onInput={(e: any) => setForm(f => ({ ...f, discount_rate: e.detail?.value ?? '' }))}
              />
              <Text style={{ fontSize: '11px', color: '#AAA', marginTop: '4px' }}>设定后前端展示折扣标签，与犒赏铺 API 的 discount_rate 字段对齐</Text>
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
                  onInput={(e: any) => setForm(f => ({ ...f, stock: e.detail?.value ?? '' }))}
                />
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
                  onInput={(e: any) => setForm(f => ({ ...f, barcode: e.detail?.value ?? '' }))}
                />
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
                onInput={(e: any) => setForm(f => ({ ...f, description: e.detail?.value ?? '' }))}
              />
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
                color="#C2410C"
              />
            </View>

            {/* 保存按钮 */}
            <View
              onClick={handleSave}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '14px', borderRadius: '14px',
                background: saving ? '#FFB899' : 'linear-gradient(135deg, #FF8A65, #FF5722)',
                boxShadow: saving ? 'none' : '0 3px 12px rgba(255,87,34,0.3)',
              }}>
              <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFF' }}>
                {saving ? '保存中…' : '💾 保存'}
              </Text>
            </View>
          </View>
        </View>
      )}

    </View>
    </RouteGuard>
  )
}

export default MerchantProductsPage
