// @title 优惠券管理（商家端 - 真实数据）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button, Picker } from '@tarojs/components'
import { getMerchantStore, merchantRedeemCoupon } from '@/db/api'
import { supabase } from '@/client/supabase'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

interface MCoupon {
  id: string
  title: string
  discount_type: 'amount' | 'percent'
  discount_value: number
  min_amount: number
  total: number
  claimed_count: number
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
}

function MerchantCouponsPage() {
  const [store, setStore] = useState<any>(null)
  const [coupons, setCoupons] = useState<MCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', discount_type: 'amount', discount_value: '', min_amount: '', total: '', start_date: '', end_date: '' })
  const [redeemCode, setRedeemCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  // 只查本店「模板券」(user_id IS NULL)，用户领取的实例不混入管理列表
  const loadCoupons = async (sid: string) => {
    const { data } = await supabase.from('coupons').select('*').eq('store_id', sid).is('user_id', null).order('created_at', { ascending: false })
    setCoupons((data as MCoupon[]) || [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const st = await getMerchantStore()
      if (cancelled) return
      setStore(st)
      if (st) await loadCoupons(st.id)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const handleCreate = async () => {
    if (!store) return Taro.showToast({ title: '请先完善门店', icon: 'none' })
    if (!form.title.trim()) return Taro.showToast({ title: '请输入名称', icon: 'none' })
    if (!form.start_date || !form.end_date) return Taro.showToast({ title: '请选择日期', icon: 'none' })
    const code = 'CP' + Date.now().toString(36).toUpperCase().slice(-6)
    // user_id 不传 → NULL（模板券），由用户端认领生成实例
    const { error } = await supabase.from('coupons').insert({
      store_id: store.id,
      code,
      title: form.title,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value) || 0,
      min_amount: Number(form.min_amount) || 0,
      total: Number(form.total) || 0,
      claimed_count: 0,
      status: 'active',
      start_date: form.start_date,
      end_date: form.end_date,
    })
    if (error) return Taro.showToast({ title: '创建失败', icon: 'none' })
    await loadCoupons(store.id)
    setShowForm(false)
    setForm({ title: '', discount_type: 'amount', discount_value: '', min_amount: '', total: '', start_date: '', end_date: '' })
    Taro.showToast({ title: '创建成功', icon: 'success' })
  }

  const toggleStatus = async (c: MCoupon) => {
    const next = c.status === 'active' ? 'paused' : 'active'
    await supabase.from('coupons').update({ status: next }).eq('id', c.id)
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, status: next } : x))
  }

  const handleDelete = async (id: string) => {
    const { confirm } = await Taro.showModal({ title: '确认', content: '删除该优惠券？' })
    if (!confirm) return
    await supabase.from('coupons').delete().eq('id', id)
    setCoupons(prev => prev.filter(x => x.id !== id))
  }

  // 商家核销：用户输入顾客出示的券码（实例 code），仅本店券可核销
  const handleRedeem = async () => {
    if (!store) return
    const code = redeemCode.trim()
    if (!code) return Taro.showToast({ title: '请输入券码', icon: 'none' })
    setRedeeming(true)
    const res = await merchantRedeemCoupon(code, store.id)
    setRedeeming(false)
    if (res.ok) {
      Taro.showToast({ title: '核销成功', icon: 'success' })
      setRedeemCode('')
    } else {
      Taro.showToast({ title: res.error || '核销失败', icon: 'none' })
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">
      <View className="px-4 mt-3">
        <Button className="!w-full !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none" onClick={() => setShowForm(true)}>
          <View className="py-3 flex items-center gap-1 justify-center">
            <Icon name="plus" size={20} className="text-white" />
            <Text className="text-base font-bold text-white">创建优惠券</Text>
          </View>
        </Button>
      </View>

      {/* 核销入口 */}
      <View className="px-4 mt-3">
        <View className="bg-card rounded-2xl border border-border p-4">
          <Text className="text-base font-bold text-foreground">核销优惠券</Text>
          <Text className="text-sm text-muted-foreground mt-1">用户输入的券码（形如 VERIFY001-xxxx），到店出示后在此核销</Text>
          <View className="flex gap-2 mt-3">
            <Input
              className="flex-1 border-2 border-input rounded-xl px-3 py-2 text-base"
              value={redeemCode}
              onInput={e => setRedeemCode(e.detail.value)}
              placeholder="输入券码" />
            <Button className="!m-0 !p-0 !bg-primary !border-none !rounded-xl" onClick={handleRedeem} disabled={redeeming}>
              <Text className="text-sm text-white px-4 py-2">{redeeming ? '核销中...' : '核销'}</Text>
            </Button>
          </View>
        </View>
      </View>

      <View className="px-4 mt-3">
        {coupons.length === 0 ? (
          <View className="bg-card rounded-2xl border border-border p-8 flex items-center justify-center">
            <Text className="text-base text-muted-foreground">暂无优惠券，点击上方创建</Text>
          </View>
        ) : coupons.map(c => (
          <View key={c.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
            <View className="flex items-center justify-between">
              <View>
                <Text className="text-base font-bold text-foreground">{c.title}</Text>
                <Text className="text-sm text-muted-foreground ml-2">
                  {c.discount_type === 'amount' ? `减¥${c.discount_value}` : `${c.discount_value}折`}
                  {c.min_amount > 0 ? ` · 满¥${c.min_amount}` : ''}
                </Text>
              </View>
              <View className={`px-2 py-1 rounded-full text-xs ${c.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                {c.status === 'active' ? '生效中' : c.status === 'paused' ? '已暂停' : c.status}
              </View>
            </View>
            <View className="flex items-center gap-4 mt-2">
              <Text className="text-xs text-muted-foreground">已领 {c.claimed_count}/{c.total}</Text>
              <Text className="text-xs text-muted-foreground">到期 {c.end_date || '—'}</Text>
            </View>
            <View className="flex gap-2 mt-3">
              <Button className="!m-0 !p-0 !bg-transparent !border !border-primary !rounded-xl" onClick={() => toggleStatus(c)}>
                <Text className="text-sm text-primary px-4 py-1">{c.status === 'active' ? '下架' : '上架'}</Text>
              </Button>
              <Button className="!m-0 !p-0 !bg-transparent !border !border-red-500 !rounded-xl" onClick={() => handleDelete(c.id)}>
                <Text className="text-sm text-red-500 px-4 py-1">删除</Text>
              </Button>
            </View>
          </View>
        ))}
      </View>

      {showForm && (
        <View className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForm(false)}>
          <View className="w-full bg-card rounded-t-3xl px-4 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <View className="flex items-center justify-between mb-4">
              <Text className="text-xl font-bold text-foreground">创建优惠券</Text>
              <Button className="!p-0 !bg-transparent !border-none" onClick={() => setShowForm(false)}>
                <Icon name="close" size={24} className="text-muted-foreground" />
              </Button>
            </View>
            <View className="mb-3">
              <Text className="text-base text-foreground mb-1">优惠券名称</Text>
              <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" value={form.title} onInput={e => setForm({ ...form, title: e.detail.value })} placeholder="如：新客立减5元" />
            </View>
            <View className="flex gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">优惠类型</Text>
                <View className="flex gap-2">
                  <View className={`flex-1 py-2 rounded-xl text-center ${form.discount_type === 'amount' ? 'bg-primary' : 'bg-muted'}`} onClick={() => setForm({ ...form, discount_type: 'amount' })}>
                    <Text className={`text-sm ${form.discount_type === 'amount' ? 'text-white' : 'text-muted-foreground'}`}>满减</Text>
                  </View>
                  <View className={`flex-1 py-2 rounded-xl text-center ${form.discount_type === 'percent' ? 'bg-primary' : 'bg-muted'}`} onClick={() => setForm({ ...form, discount_type: 'percent' })}>
                    <Text className={`text-sm ${form.discount_type === 'percent' ? 'text-white' : 'text-muted-foreground'}`}>折扣</Text>
                  </View>
                </View>
              </View>
            </View>
            <View className="flex gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">优惠金额</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.discount_value} onInput={e => setForm({ ...form, discount_value: e.detail.value })} placeholder={form.discount_type === 'amount' ? '5' : '10(9折)'} />
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">最低消费</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.min_amount} onInput={e => setForm({ ...form, min_amount: e.detail.value })} placeholder="0" />
              </View>
            </View>
            <View className="flex gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">发放数量</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.total} onInput={e => setForm({ ...form, total: e.detail.value })} placeholder="100" />
              </View>
            </View>
            <View className="flex gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">开始日期</Text>
                <Picker mode="date" onChange={e => setForm({ ...form, start_date: e.detail.value })}>
                  <View className="border-2 border-input rounded-xl px-3 py-2 text-base">{form.start_date || <Text className="text-muted-foreground">选择日期</Text>}</View>
                </Picker>
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground mb-1">结束日期</Text>
                <Picker mode="date" onChange={e => setForm({ ...form, end_date: e.detail.value })}>
                  <View className="border-2 border-input rounded-xl px-3 py-2 text-base">{form.end_date || <Text className="text-muted-foreground">选择日期</Text>}</View>
                </Picker>
              </View>
            </View>
            <Button className="!w-full !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none" onClick={handleCreate}>
              <View className="py-4 text-base font-bold text-white">创建</View>
            </Button>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

export default MerchantCouponsPage
