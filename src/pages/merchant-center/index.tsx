// @title 商家管理中心
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import {
  getMerchantStore, getMerchantProducts, getMerchantOrders,
  createProduct, updateProduct, deleteProduct, getProductByBarcode,
} from '@/db/api'
import type { Product, Store } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'

type Tab = 'products' | 'orders'
type ProductForm = {
  name: string; price: string; stock: string; description: string
  barcode: string; image_url: string; is_active: boolean
}
const emptyForm = (): ProductForm => ({ name: '', price: '', stock: '', description: '', barcode: '', image_url: '', is_active: true })

function MerchantCenterPage() {
  const [tab, setTab] = useState<Tab>('products')
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const s = await getMerchantStore()
    setStore(s)
    if (s) {
      const [prods, ords] = await Promise.all([
        getMerchantProducts(s.id),
        getMerchantOrders(s.id),
      ])
      setProducts(prods)
      setOrders(ords)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 扫条形码上架
  const handleScanBarcode = () => {
    if (!store) return
    setScanning(true)
    Taro.scanCode({
      scanType: ['barCode'],
      success: async (res) => {
        setScanning(false)
        const code = res.result
        // 检查是否已有该条形码商品
        const existing = await getProductByBarcode(code)
        if (existing) {
          Taro.showModal({
            title: '条形码已存在',
            content: `商品「${existing.name}」已使用此条形码，是否编辑该商品？`,
            confirmText: '去编辑',
            success: (r) => { if (r.confirm) openEdit(existing) },
          })
        } else {
          setForm({ ...emptyForm(), barcode: code })
          setEditId(null)
          setShowForm(true)
        }
      },
      fail: () => { setScanning(false); Taro.showToast({ title: '扫码取消', icon: 'none' }) },
    })
  }

  const openEdit = (p: Product) => {
    setForm({
      name: p.name, price: String(p.price), stock: String(p.stock),
      description: p.description ?? '', barcode: p.barcode ?? '',
      image_url: p.image_url ?? '', is_active: p.is_active,
    })
    setEditId(p.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!store) return
    if (!form.name.trim()) { Taro.showToast({ title: '请填写商品名称', icon: 'none' }); return }
    const price = parseFloat(form.price)
    const stock = parseInt(form.stock)
    if (isNaN(price) || price <= 0) { Taro.showToast({ title: '请填写正确的价格', icon: 'none' }); return }
    if (isNaN(stock) || stock < 0) { Taro.showToast({ title: '请填写正确的库存', icon: 'none' }); return }
    setSaving(true)
    if (editId) {
      await updateProduct(editId, {
        name: form.name, description: form.description, price,
        stock, barcode: form.barcode || undefined,
        image_url: form.image_url || undefined, is_active: form.is_active,
      })
      Taro.showToast({ title: '修改成功', icon: 'success' })
    } else {
      await createProduct({
        store_id: store.id, name: form.name, description: form.description,
        price, stock, barcode: form.barcode || undefined,
        image_url: form.image_url || undefined,
      })
      Taro.showToast({ title: '上架成功', icon: 'success' })
    }
    setSaving(false)
    setShowForm(false)
    load()
  }

  const handleDelete = (id: string, name: string) => {
    Taro.showModal({
      title: '确认删除',
      content: `确认删除商品「${name}」？删除后无法恢复`,
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (r) => {
        if (r.confirm) {
          await deleteProduct(id)
          setProducts(prev => prev.filter(p => p.id !== id))
          Taro.showToast({ title: '已删除', icon: 'success' })
        }
      },
    })
  }

  const statusLabel: Record<string, string> = {
    pending_pay: '待支付', pending_ship: '待发货', pending_receive: '待收货',
    pending_review: '待评价', completed: '已完成', after_sale: '售后', cancelled: '已取消',
  }
  const statusColor: Record<string, string> = {
    pending_pay: 'text-orange-500', pending_ship: 'text-primary', pending_receive: 'text-blue-500',
    completed: 'text-green-600', cancelled: 'text-muted-foreground', after_sale: 'text-red-500', pending_review: 'text-primary',
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  if (!store) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
      <div className="i-mdi-store-off text-6xl text-muted-foreground" />
      <p className="text-xl text-muted-foreground text-center">您尚未开通门店，请先申请成为商家</p>
      <button type="button"
        className="flex items-center justify-center leading-none rounded-2xl bg-primary"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-apply/index' })}>
        <div className="py-3 px-8 text-xl font-bold text-white">申请开店</div>
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* 返回 + 标题 */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">商家管理中心</span>
      </div>

      {/* 门店信息卡 */}
      <div className="mx-4 mt-3 p-4 rounded-2xl bg-card border border-border flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <div className="i-mdi-store text-2xl text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xl font-bold text-foreground">{store.name}</p>
          <p className="text-base text-muted-foreground">{store.address || '暂无地址'}</p>
        </div>
        <button type="button"
          className="flex items-center justify-center leading-none rounded-xl bg-primary/10"
          onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${store.id}` })}>
          <div className="py-2 px-3 text-base text-primary font-bold">查看门店</div>
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
        {([['products', '商品管理'], ['orders', '订单管理']] as const).map(([key, label]) => (
          <div key={key}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}>
            {label}
          </div>
        ))}
      </div>

      {/* 商品管理 Tab */}
      {tab === 'products' && (
        <div className="px-4 mt-4">
          {/* 操作按钮 */}
          <div className="flex gap-3 mb-4">
            <button type="button"
              className="flex-1 flex items-center justify-center leading-none rounded-2xl bg-primary"
              onClick={() => { setForm(emptyForm()); setEditId(null); setShowForm(true) }}>
              <div className="py-3 flex items-center gap-2">
                <div className="i-mdi-plus text-white text-2xl" />
                <span className="text-xl font-bold text-white">手动添加</span>
              </div>
            </button>
            <button type="button"
              className="flex-1 flex items-center justify-center leading-none rounded-2xl border-2 border-primary bg-card"
              onClick={handleScanBarcode}>
              <div className="py-3 flex items-center gap-2">
                {scanning
                  ? <div className="i-mdi-loading text-primary text-2xl animate-spin" />
                  : <div className="i-mdi-barcode-scan text-primary text-2xl" />}
                <span className="text-xl font-bold text-primary">扫码上架</span>
              </div>
            </button>
          </div>

          {/* 商品列表 */}
          {products.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="i-mdi-package-variant text-6xl text-muted-foreground/40" />
              <p className="text-xl text-muted-foreground">暂无商品，快去上架第一件吧</p>
            </div>
          ) : (
            products.map(p => (
              <div key={p.id} className="bg-card rounded-2xl border border-border mb-3 overflow-hidden">
                <div className="flex gap-3 p-4">
                  <div className="w-20 h-20 rounded-xl bg-muted flex-shrink-0 overflow-hidden">
                    {p.image_url
                      ? <Image src={p.image_url} mode="aspectFill" style={{ width: '80px', height: '80px' }} />
                      : <div className="w-full h-full flex items-center justify-center"><div className="i-mdi-image text-3xl text-muted-foreground/40" /></div>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold text-foreground flex-1 line-clamp-1">{p.name}</p>
                      <span className={`text-base px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                        {p.is_active ? '在售' : '下架'}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-primary mt-1">¥{p.price}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-base text-muted-foreground">库存：{p.stock}</span>
                      {p.barcode && <span className="text-base text-muted-foreground">条码：{p.barcode}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex border-t border-border">
                  <button type="button"
                    className="flex-1 flex items-center justify-center py-3 gap-1"
                    onClick={() => openEdit(p)}>
                    <div className="i-mdi-pencil text-xl text-primary" />
                    <span className="text-xl text-primary">编辑</span>
                  </button>
                  <div className="w-px bg-border" />
                  <button type="button"
                    className="flex-1 flex items-center justify-center py-3 gap-1"
                    onClick={() => updateProduct(p.id, { is_active: !p.is_active }).then(load)}>
                    <div className={`${p.is_active ? 'i-mdi-eye-off' : 'i-mdi-eye'} text-xl text-muted-foreground`} />
                    <span className="text-xl text-muted-foreground">{p.is_active ? '下架' : '上架'}</span>
                  </button>
                  <div className="w-px bg-border" />
                  <button type="button"
                    className="flex-1 flex items-center justify-center py-3 gap-1"
                    onClick={() => handleDelete(p.id, p.name)}>
                    <div className="i-mdi-delete-outline text-xl text-red-400" />
                    <span className="text-xl text-red-400">删除</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 订单管理 Tab */}
      {tab === 'orders' && (
        <div className="px-4 mt-4">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="i-mdi-receipt-text-outline text-6xl text-muted-foreground/40" />
              <p className="text-xl text-muted-foreground">暂无订单</p>
            </div>
          ) : (
            orders.map((item, i) => (
              <div key={item.id ?? i} className="bg-card rounded-2xl border border-border mb-3 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base text-muted-foreground">订单号：{item.orders?.order_no || '-'}</span>
                  <span className={`text-xl font-bold ${statusColor[item.orders?.status] || 'text-foreground'}`}>
                    {statusLabel[item.orders?.status] || item.orders?.status || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {item.product_image && (
                    <Image src={item.product_image} mode="aspectFill"
                      style={{ width: '56px', height: '56px', borderRadius: '8px', flexShrink: 0 }} />
                  )}
                  <div className="flex-1">
                    <p className="text-xl text-foreground font-bold line-clamp-1">{item.product_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xl text-muted-foreground">x{item.quantity}</span>
                      <span className="text-xl font-bold text-primary">¥{item.price}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-base text-muted-foreground">
                    {item.orders?.created_at ? new Date(item.orders.created_at).toLocaleDateString('zh-CN') : ''}
                  </span>
                  <span className="text-xl font-bold text-foreground">
                    合计 ¥{item.orders?.total_amount?.toFixed(2) || '-'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 商品编辑/新建弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowForm(false)}>
          <div className="w-full bg-card rounded-t-3xl px-4 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl font-bold text-foreground">{editId ? '编辑商品' : '新增商品'}</span>
              <button type="button" onClick={() => setShowForm(false)}>
                <div className="i-mdi-close text-2xl text-muted-foreground" />
              </button>
            </div>

            {[
              { label: '商品名称*', key: 'name', placeholder: '请输入商品名称' },
              { label: '价格（元）*', key: 'price', placeholder: '如：9.90' },
              { label: '库存数量*', key: 'stock', placeholder: '如：100' },
              { label: '条形码', key: 'barcode', placeholder: '扫码或手动输入条形码' },
              { label: '图片链接', key: 'image_url', placeholder: '商品图片 URL' },
              { label: '商品描述', key: 'description', placeholder: '简短描述（可选）' },
            ].map(f => (
              <div key={f.key} className="mb-3">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xl text-foreground">{f.label}</span>
                </div>
                <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                  <input
                    className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onInput={e => { const ev = e as any; setForm(prev => ({ ...prev, [f.key]: ev.detail?.value ?? ev.target?.value ?? '' })) }}
                  />
                </div>
              </div>
            ))}

            {/* 是否上架（仅编辑时显示） */}
            {editId && (
              <div className="flex items-center justify-between mb-4">
                <span className="text-xl text-foreground">立即上架</span>
                <div
                  className={`w-12 h-7 rounded-full flex items-center transition ${form.is_active ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}
                  style={{ padding: '2px' }}
                  onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}>
                  <div className="w-6 h-6 rounded-full bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            )}

            <button type="button"
              className={`w-full flex items-center justify-center leading-none rounded-2xl ${saving ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handleSave}>
              <div className="py-4 text-xl font-bold text-white">{saving ? '保存中…' : '保存上架'}</div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(MerchantCenterPage)
