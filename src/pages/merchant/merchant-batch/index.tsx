// @title 批次入库（商家端）· 填写保质期
import { useState, useEffect, useCallback } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, Input, Picker } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { getMerchantStore, getMerchantProducts } from '@/db/api'
import { addStockBatch } from '@/db/food-api'
import { supabase } from '@/client/supabase'
import type { Product, Store } from '@/db/types'

// 日期 → 北京当天结束/开始，避免 timestamptz 时区偏移导致 days_left 差一天
const toExpiryISO = (d: string) => `${d}T23:59:59+08:00`
const toProducedISO = (d: string) => `${d}T00:00:00+08:00`

function MerchantBatchPage() {
  const router = useRouter()
  const presetProductId = (router.params as any)?.productId || ''

  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [selIdx, setSelIdx] = useState(-1)
  const [batchNo, setBatchNo] = useState('')
  const [producedAt, setProducedAt] = useState('') // 'YYYY-MM-DD'
  const [expireAt, setExpireAt] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getMerchantStore()
      setStore(s)
      if (s) {
        const prods = await getMerchantProducts(s.id)
        const list = Array.isArray(prods) ? prods : []
        setProducts(list)
        if (presetProductId) {
          const i = list.findIndex((p) => p.id === presetProductId)
          if (i >= 0) setSelIdx(i)
        }
      }
    } catch (e) {
      console.error('[批次入库] load 失败', e)
    } finally {
      setLoading(false)
    }
  }, [presetProductId])

  useEffect(() => { load() }, [load])

  const productNames = products.map((p) => p.name)

  const handleSave = async () => {
    if (!store) return
    if (selIdx < 0) { Taro.showToast({ title: '请选择商品', icon: 'none' }); return }
    if (!expireAt) { Taro.showToast({ title: '请选择过期日期', icon: 'none' }); return }
    const n = parseInt(qty, 10)
    if (isNaN(n) || n <= 0) { Taro.showToast({ title: '数量不正确', icon: 'none' }); return }

    // 登录态守卫（与商品管理一致）
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user?.id) {
      Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2500 })
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 600)
      return
    }

    setSaving(true)
    try {
      const payload: any = {
        product_id: products[selIdx].id,
        store_id: store.id,
        qty: n,
        expire_at: toExpiryISO(expireAt),
      }
      if (batchNo.trim()) payload.batch_no = batchNo.trim()
      if (producedAt) payload.produced_at = toProducedISO(producedAt)
      const created = await addStockBatch(payload)
      if (!created) {
        Taro.showToast({ title: '保存失败，请重试', icon: 'error' })
        return
      }
      Taro.showToast({ title: '入库成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (e: any) {
      console.error('[批次入库] 保存失败', e)
      const msg = e?.message || ''
      if (/row-level security|policy/.test(msg)) {
        Taro.showToast({ title: '被安全策略拒绝(权限不足)', icon: 'none', duration: 4000 })
      } else {
        Taro.showToast({ title: `保存失败：${msg.slice(0, 60)}`, icon: 'none', duration: 4000 })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FFF8F4' }}>
        <Text style={{ fontSize: '16px', color: '#999' }}>加载中...</Text>
      </View>
    )
  }

  return (
    <RouteGuard>
      <View style={{ minHeight: '100vh', background: '#FFF8F4', paddingBottom: '32px' }}>
        {/* 头部 */}
        <View style={{ margin: '14px 14px 0', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFF3EC, #FFE7D6)', border: '1px solid #F8D9C0' }}>
          <Text style={{ fontSize: '18px', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>📦 批次入库</Text>
          <Text style={{ fontSize: '12px', color: '#A86A4A', marginTop: '6px', display: 'block' }}>
            登记生产 / 过期日期，系统将自动临期预警与智能降价
          </Text>
        </View>

        <View style={{ padding: '14px' }}>
          {/* 商品选择 */}
          <View style={{ marginBottom: '14px' }}>
            <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>商品 *</Text>
            {products.length === 0 ? (
              <Text style={{ fontSize: '13px', color: '#999' }}>本店暂无商品，请先在商品管理新增</Text>
            ) : (
              <Picker mode="selector" range={productNames} value={selIdx < 0 ? 0 : selIdx}
                onChange={(e: any) => setSelIdx(e.detail.value)}>
                <View style={{ height: '44px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', display: 'flex', alignItems: 'center', paddingHorizontal: '14px' }}>
                  <Text style={{ fontSize: '15px', color: selIdx >= 0 ? '#333' : '#BBB' }}>
                    {selIdx >= 0 ? products[selIdx].name : '请选择商品'}
                  </Text>
                </View>
              </Picker>
            )}
          </View>

          {/* 批次号 */}
          <View style={{ marginBottom: '14px' }}>
            <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>批次号（选填）</Text>
            <Input style={{ width: '100%', height: '44px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '0 14px', boxSizing: 'border-box' }}
              placeholder="如 20260728-01" value={batchNo} onInput={(e: any) => setBatchNo(e.detail?.value ?? '')} />
          </View>

          {/* 生产日期 */}
          <View style={{ marginBottom: '14px' }}>
            <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>生产日期（选填）</Text>
            <Picker mode="date" value={producedAt} onChange={(e: any) => setProducedAt(e.detail.value)}>
              <View style={{ height: '44px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', display: 'flex', alignItems: 'center', paddingHorizontal: '14px' }}>
                <Text style={{ fontSize: '15px', color: producedAt ? '#333' : '#BBB' }}>{producedAt || '请选择生产日期'}</Text>
              </View>
            </Picker>
          </View>

          {/* 过期日期 */}
          <View style={{ marginBottom: '14px' }}>
            <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>过期日期 *（保质期）</Text>
            <Picker mode="date" value={expireAt} onChange={(e: any) => setExpireAt(e.detail.value)}>
              <View style={{ height: '44px', borderRadius: '10px', background: '#FFF9F0', border: '1.5px solid #FFCC80', display: 'flex', alignItems: 'center', paddingHorizontal: '14px' }}>
                <Text style={{ fontSize: '15px', color: expireAt ? '#E65100' : '#BBB' }}>{expireAt || '请选择过期日期'}</Text>
              </View>
            </Picker>
            <Text style={{ fontSize: '11px', color: '#AAA', marginTop: '4px', display: 'block' }}>保质期核心字段，越临近越自动加深折扣</Text>
          </View>

          {/* 数量 */}
          <View style={{ marginBottom: '14px' }}>
            <Text style={{ fontSize: '14px', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' }}>数量 *</Text>
            <Input style={{ width: '100%', height: '44px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', color: '#333', padding: '0 14px', boxSizing: 'border-box' }}
              placeholder="0" type="number" value={qty} onInput={(e: any) => setQty(e.detail?.value ?? '')} />
          </View>

          {/* 保存 */}
          <View onClick={handleSave}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', borderRadius: '14px', background: saving ? '#F0C9A8' : 'linear-gradient(135deg, #C77B47, hsl(var(--primary)))', boxShadow: saving ? 'none' : '0 3px 12px rgba(255,87,34,0.3)' }}>
            <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFF' }}>{saving ? '保存中…' : '💾 保存入库'}</Text>
          </View>
        </View>
      </View>
    </RouteGuard>
  )
}

export default MerchantBatchPage
