// @title 店铺设置（商家端）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Textarea, Button } from '@tarojs/components'
import { getMerchantStore, updateProduct } from '@/db/api'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

function MerchantSettingsPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [form, setForm] = useState({ name: '', description: '', address: '', phone: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getMerchantStore().then((s) => {
      setStore(s)
      if (s) {
        setForm({
          name: s.name,
          description: s.description ?? '',
          address: s.address ?? '',
          phone: s.phone ?? '',
        })
      }
    })
  }, [])

  const handleSave = async () => {
    if (!store) return
    setSaving(true)
    // 注意：需要用 updateStore API，这里先模拟
    Taro.showToast({ title: '保存成功（演示模式）', icon: 'success' })
    setSaving(false)
  }

  if (!store) return (
    <View className="flex items-center justify-center min-h-screen">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">
      <View className="flex items-center px-4 pt-4 pb-2">
        <View className="!w-10 !h-10 !flex !items-center !justify-center !rounded-full !bg-muted" onClick={() => Taro.navigateBack()}>
          <View className="i-mdi-arrow-left text-2xl text-foreground" />
        </View>
        <Text className="flex-1 text-center text-xl font-bold text-foreground pr-10">店铺设置</Text>
      </View>

      <View className="px-4 mt-3">
        <View className="mb-3">
          <Text className="text-base text-foreground mb-1">店铺名称</Text>
          <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full"
            value={form.name} onInput={e => setForm(f => ({ ...f, name: (e.target as any)?.value ?? '' }))} />
        </View>

        <View className="mb-3">
          <Text className="text-base text-foreground mb-1">店铺描述</Text>
          <Textarea className="border-2 border-input rounded-xl px-3 py-2 text-base w-full min-h-[80px]"
            placeholder="简述店铺特色" value={form.description}
            onInput={e => setForm(f => ({ ...f, description: (e.target as any)?.value ?? '' }))} />
        </View>

        <View className="mb-3">
          <Text className="text-base text-foreground mb-1">店铺地址</Text>
          <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full"
            placeholder="详细地址" value={form.address}
            onInput={e => setForm(f => ({ ...f, address: (e.target as any)?.value ?? '' }))} />
        </View>

        <View className="mb-3">
          <Text className="text-base text-foreground mb-1">联系电话</Text>
          <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full"
            placeholder="客服电话" value={form.phone}
            onInput={e => setForm(f => ({ ...f, phone: (e.target as any)?.value ?? '' }))} />
        </View>

        {/* 双通道配置提示 */}
        <View className="mt-4 p-4 rounded-2xl bg-blue-50 border border-blue-200">
          <Text className="text-base font-bold text-blue-600 mb-2">支付通道配置</Text>
          <Text className="text-sm text-blue-500 leading-relaxed">
            1. 微信支付：在微信商户平台配置{"\n"}
            2. 金豆支付：在来店有喜后台配置{"\n"}
            3. 双通道同时开启，用户可自由选择
          </Text>
        </View>

        <Button className={`!w-full !m-0 !p-0 !rounded-2xl !leading-none mt-6 ${saving ? '!bg-primary/50' : '!bg-primary'} !border-none`}
          onClick={handleSave} disabled={saving}>
          <View className="py-4 text-base font-bold text-white">{saving ? '保存中…' : '保存设置'}</View>
        </Button>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantSettingsPage
