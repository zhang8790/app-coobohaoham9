// @title 店铺设置（商家端）— 与管理后台保持一致
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Textarea, Button, Image } from '@tarojs/components'
import { getMerchantStore, updateStore } from '@/db/api'
import { uploadToStorage } from '@/utils/upload'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

// 场景标签选项
const SCENE_OPTIONS = ['堂食', '配送']
// 类目选项
const CATEGORY_OPTIONS = ['餐饮', '零售', '水果', '服务', '娱乐', '其他']

interface StoreForm {
  name: string
  description: string
  address: string
  phone: string
  contact: string
  category: string
  image_url: string | null
  banner_url: string | null
  is_open: boolean
  open_time: string
  close_time: string
  delivery_enabled: boolean
  pickup_enabled: boolean
  delivery_radius: number
  delivery_fee: number
  free_delivery_threshold: number
  min_order_amount: number
  announcement: string
  scene_tags: string[]
  referral_rate: number  // 让利率（0.03 = 3%）
  referral_rate_enabled: boolean  // 店铺整体让利开关
}

function MerchantSettingsPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [form, setForm] = useState<StoreForm>({
    name: '', description: '', address: '', phone: '',
    contact: '', category: '水果',
    image_url: null, banner_url: null,
    is_open: true, open_time: '08:00', close_time: '20:00',
    delivery_enabled: true, pickup_enabled: true,
    delivery_radius: 3, delivery_fee: 2,
    free_delivery_threshold: 30, min_order_amount: 20,
    announcement: '', scene_tags: [],
    referral_rate: 0.09, referral_rate_enabled: true})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 图片预览路径（本地 tempFilePath，选图后立即可见）
  // 微信小程序 <Image> 支持：本地路径 / 网络URL；不支持：base64 data URI
  const [previewPath, setPreviewPath] = useState<string>('')

  useEffect(() => {
    getMerchantStore().then((s) => {
      setStore(s)
      if (s) {
        setForm(prev => ({
          ...prev,
          name: s.name || '',
          description: s.description ?? '',
          address: s.address ?? '',
          phone: s.phone ?? '',
          contact: (s as any).contact ?? '',
          category: s.category || '水果',
          image_url: s.image_url ?? null,
          banner_url: s.banner_url ?? null,
          is_open: (s as any).is_open !== false,
          open_time: (s as any).open_time || '08:00',
          close_time: (s as any).close_time || '20:00',
          delivery_enabled: (s as any).delivery_enabled !== false,
          pickup_enabled: (s as any).pickup_enabled !== false,
          delivery_radius: (s as any).delivery_radius || 3,
          delivery_fee: (s as any).delivery_fee || 2,
          free_delivery_threshold: (s as any).free_delivery_threshold || 30,
          min_order_amount: (s as any).min_order_amount || 20,
          announcement: (s as any).announcement ?? '',
          scene_tags: (s as any).scene_tags ?? [],
          referral_rate: (s as any).referral_rate ?? 0.09,
          referral_rate_enabled: (s as any).referral_rate_enabled ?? true}))
        // 初始化预览路径（DB 中存储的公网 URL 或空）
        const dbUrl = s.banner_url ?? ''
        // 过滤掉无效的 base64 和本地临时路径
        if (dbUrl && !dbUrl.startsWith('data:') && !dbUrl.startsWith('wxfile://') && !dbUrl.startsWith('http://tmp')) {
          setPreviewPath(dbUrl)
        }
      }
    })
  }, [])

  // 选择顶部图片（banner）→ 双轨制
  // 1. 立即预览：用本地 tempFilePath（选图后 100% 可见）
  // 2. 异步上传：上传到 Supabase Storage → 获得 publicUrl → 存入 DB（持久化）
  const handleChooseBanner = async () => {
    try {
      const res = await Taro.chooseMedia({
        mediaType: ['image'],
        count: 1,
        sizeType: ['compressed']})
      if (!res.tempFiles?.length) return

      const tempPath = res.tempFiles[0].tempFilePath
      console.log('[banner] chooseMedia 返回路径:', tempPath)

      // ① 立即预览（本地路径，无需网络，立即可见）
      setPreviewPath(tempPath)
      console.log('[banner] 预览已设置:', tempPath.slice(0, 80))

      // ② 异步上传到 Storage（获取公网 URL 用于持久化）
      Taro.showLoading({ title: '上传中...' })
      try {
        const publicUrl = await uploadToStorage(tempPath)
        console.log('[banner] uploadToStorage 返回:', publicUrl ? publicUrl.slice(0, 80) : '(空)')

        if (publicUrl) {
          // 同时更新 banner_url 和 image_url，确保所有页面都能看到新图
          setForm(f => ({ ...f, banner_url: publicUrl, image_url: publicUrl }))
          console.log('[banner] banner_url + image_url 已更新:', publicUrl.slice(0, 80))
          Taro.showToast({ title: '上传成功', icon: 'success' })
        } else {
          // 上传失败：预览图仍保留（用户可先保存本地路径或重新尝试）
          console.warn('[banner] 上传返回空 URL，图片仅作临时预览')
          Taro.showToast({ title: '上传失败，图片仅临时显示', icon: 'none', duration: 2500 })
        }
      } catch (uploadErr: any) {
        console.error('[banner] 上传异常:', uploadErr?.message)
        Taro.showToast({ title: '上传异常: ' + (uploadErr?.message || '未知错误'), icon: 'none', duration: 2500 })
      }
    } catch (err: any) {
      if (err?.errMsg?.includes('cancel')) return  // 用户取消，不提示
      console.error('[banner] 选图异常:', err?.message || err)
      Taro.showToast({ title: '选图失败', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  // 切换场景标签
  const toggleSceneTag = (tag: string) => {
    setForm(f => ({
      ...f,
      scene_tags: f.scene_tags.includes(tag)
        ? f.scene_tags.filter(t => t !== tag)
        : [...f.scene_tags, tag]
    }))
  }

  // 更新字段
  const updateField = <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  // 保存
  const handleSave = async () => {
    if (!store) return
    setSaving(true)

    const ok = await updateStore(store.id, form)
    if (ok) {
      Taro.showToast({ title: '保存成功', icon: 'success' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    setSaving(false)
  }

  if (!store) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-16">

      {/* ===== 1. 店铺形象：顶部图片 ===== */}
      <View className="px-4 mt-3">
        <Text className="text-base font-bold text-foreground mb-2 block">店铺形象</Text>
        <View
          className="w-full rounded-2xl overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: '#F5F5F5', height: '176px' }}
          onClick={handleChooseBanner}
        >
          {previewPath ? (
            <Image
              src={previewPath}
              mode="aspectFill"
              style={{ width: '100%', height: '176px', display: 'block' }}
              onLoad={() => console.log('[banner] 预览图加载成功:', previewPath.slice(0, 60))}
              onError={(e: any) => {
                console.error('[banner] 预览图加载失败:', previewPath.slice(0, 80), e)
                // 加载失败时清除预览，显示占位符（避免空白区域）
                setPreviewPath('')
                Taro.showToast({ title: '图片加载失败', icon: 'none' })
              }}
            />
          ) : (
            <View className="flex flex-col items-center gap-2">
              <View className="i-mdi-image-plus text-5xl text-muted-foreground/40" />
              <Text className="text-sm text-muted-foreground">点击上传店铺顶部图片</Text>
            </View>
          )}
        </View>
        {previewPath && (
          <Button size="mini" className="!mt-2 !bg-transparent !text-red-500 !border-none !p-0"
            onClick={() => {
              setPreviewPath('')
              updateField('banner_url', null)
              updateField('image_url', null)
            }}>
            移除图片
          </Button>
        )}
      </View>

      {/* ===== 2. 场景配置（堂食/配送）===== */}
      <View className="px-4 mt-4">
        <Text className="text-base font-bold text-foreground mb-2 block">服务场景</Text>
        <View className="flex gap-2">
          {SCENE_OPTIONS.map(tag => {
            const active = form.scene_tags.includes(tag)
            return (
              <View
                key={tag}
                className={`px-4 py-2 rounded-full border text-sm font-bold ${active
                  ? '!bg-orange-500 !border-orange-500 text-white'
                  : '!bg-white !border-gray-300 text-gray-600'}`}
                onClick={() => toggleSceneTag(tag)}
              >
                <Text className={active ? 'text-white' : 'text-gray-600'}>{tag}</Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* ===== 3. 基本信息 ===== */}
      <View className="px-4 mt-4 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">基本信息</Text>

        {/* 店铺名称 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">店铺名称 *</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={form.name}
            placeholder="请输入店铺名称"
            onInput={e => updateField('name', (e.detail?.value as string) ?? '')}
          />
        </View>

        {/* 店铺简介 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">店铺简介</Text>
          <Textarea
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base min-h-[80px]"
            placeholder="简述店铺特色..."
            value={form.description}
            onInput={e => updateField('description', (e.detail?.value as string) ?? '')}
          />
        </View>

        {/* 主营类目 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">主营类目 *</Text>
          <View className="flex gap-2 flex-wrap">
            {CATEGORY_OPTIONS.map(cat => (
              <View key={cat}
                className={`px-3 py-1.5 rounded-lg text-sm ${form.category === cat
                  ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                onClick={() => updateField('category', cat)}
              >
                <Text className={form.category === cat ? 'text-white' : 'text-gray-600'}>{cat}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ===== 4. 联系信息 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">联系信息</Text>

        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">联系电话 *</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            type="number"
            maxlength={11}
            value={form.phone}
            placeholder="客服电话"
            onInput={e => updateField('phone', (e.detail?.value as string) ?? '')}
          />
        </View>

        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">联系人</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={form.contact}
            placeholder="联系人姓名"
            onInput={e => updateField('contact', (e.detail?.value as string) ?? '')}
          />
        </View>

        <View>
          <Text className="text-sm text-gray-500 mb-1 block">店铺地址</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={form.address}
            placeholder="详细地址"
            onInput={e => updateField('address', (e.detail?.value as string) ?? '')}
          />
        </View>
      </View>

      {/* ===== 5. 营业设置 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">营业设置</Text>

        {/* 营业状态开关 */}
        <View className="flex items-center justify-between py-2 border-b border-gray-100">
          <Text className="text-base text-foreground">营业状态</Text>
          <View
            className={`w-12 h-7 rounded-full relative ${form.is_open ? 'bg-green-500' : 'bg-gray-300'}`}
            onClick={() => updateField('is_open', !form.is_open)}
          >
            <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${form.is_open ? 'right-0.5' : 'left-0.5'}`} />
          </View>
        </View>

        {/* 营业时间 */}
        <View className="flex items-center gap-3 mt-3">
          <View className="flex-1">
            <Text className="text-xs text-gray-500 mb-1 block">开始时间</Text>
            <Input
              className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm"
              type="text"
              value={form.open_time}
              onInput={e => updateField('open_time', (e.detail?.value as string) ?? '')}
            />
          </View>
          <Text className="pt-5 text-gray-400">至</Text>
          <View className="flex-1">
            <Text className="text-xs text-gray-500 mb-1 block">结束时间</Text>
            <Input
              className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm"
              type="text"
              value={form.close_time}
              onInput={e => updateField('close_time', (e.detail?.value as string) ?? '')}
            />
          </View>
        </View>
      </View>

      {/* ===== 5.5 让利（推广）配置 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-1 block">让利（推广）配置</Text>
        <Text className="text-xs text-gray-400 mb-3 block">设置订单金额中让利给平台的比例，用于推广员佣金和金豆返还</Text>

        <View className="flex items-center justify-between">
          <Text className="text-sm text-gray-600">让利率</Text>
          <Text className="text-xl font-bold text-orange-500">{Math.round(form.referral_rate * 100)}%</Text>
        </View>
        <View className="mt-2">
          <Input
            type="digit"
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base text-center"
            value={String(Math.round(form.referral_rate * 100))}
            onInput={e => {
              const v = Number((e.detail?.value as string) ?? '9')
              const rate = Math.min(30, Math.max(3, v)) / 100
              updateField('referral_rate', rate)
            }}
            placeholder="3~30"
          />
          <Text className="text-xs text-gray-400 mt-1 block text-center">输入 3~30 之间的整数（表示 3%~30%）</Text>
        </View>
        <View className="mt-2 p-2 rounded-lg bg-orange-50">
          <Text className="text-xs text-orange-600">
            示例：让利率 10%，订单 100 元 → 平台让利 10 元，用于推广员佣金 + 积分返还 + 平台收入
          </Text>
        </View>
        {/* 店铺整体让利开关 */}
        <View className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <View>
            <Text className="text-sm text-gray-700 font-medium">店铺整体让利</Text>
            <Text className="text-xs text-gray-400 mt-0.5 block">
              {form.referral_rate_enabled
                ? '开启：商品未单独设让利时，按此门店率参与佣金'
                : '关闭：仅商品级让利生效，整店不被统一让利吃掉利润'}
            </Text>
          </View>
          <View
            className={`w-12 h-7 rounded-full relative ${form.referral_rate_enabled ? 'bg-green-500' : 'bg-gray-300'}`}
            onClick={() => updateField('referral_rate_enabled', !form.referral_rate_enabled)}
          >
            <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${form.referral_rate_enabled ? 'right-0.5' : 'left-0.5'}`} />
          </View>
        </View>
      </View>

      {/* ===== 6. 双通道配置 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">双通道配置</Text>

        {/* 配送 */}
        <View className="p-3 rounded-xl bg-gray-50 mb-3">
          <View className="flex items-center justify-between">
            <View>
              <Text className="text-base font-semibold text-foreground">配送</Text>
              <Text className="text-xs text-gray-400 mt-0.5 block">支持送到客户地址</Text>
            </View>
            <View
              className={`w-12 h-7 rounded-full relative ${form.delivery_enabled ? 'bg-green-500' : 'bg-gray-300'}`}
              onClick={() => updateField('delivery_enabled', !form.delivery_enabled)}
            >
              <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${form.delivery_enabled ? 'right-0.5' : 'left-0.5'}`} />
            </View>
          </View>

          {form.delivery_enabled && (
            <View className="grid grid-cols-2 gap-2 mt-3">
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">配送范围(km)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.delivery_radius)}
                  onInput={e => updateField('delivery_radius', Number(e.detail?.value) || 3)} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">配送费(元)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.delivery_fee)}
                  onInput={e => updateField('delivery_fee', Number(e.detail?.value) || 0)} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">满额免运费(元)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.free_delivery_threshold)}
                  onInput={e => updateField('free_delivery_threshold', Number(e.detail?.value) || 0)} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">起送价(元)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.min_order_amount)}
                  onInput={e => updateField('min_order_amount', Number(e.detail?.value) || 0)} />
              </View>
            </View>
          )}
        </View>

      </View>

      {/* ===== 7. 店铺公告 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">店铺公告</Text>
        <Textarea
          className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base min-h-[100px]"
          placeholder="输入店铺公告内容，顾客可在门店首页看到..."
          value={form.announcement}
          onInput={e => updateField('announcement', (e.detail?.value as string) ?? '')}
        />
      </View>

      {/* ===== 保存按钮 ===== */}
      <View className="px-4 mt-6">
        <Button
          className={`!w-full !m-0 !p-0 !rounded-2xl !leading-none !border-none ${saving ? '!bg-orange-300' : saved ? '!bg-green-500' : '!bg-orange-500'}`}
          onClick={handleSave} disabled={saving}
        >
          <View className="py-4 text-base font-bold text-white">
            {saving ? '保存中...' : saved ? '已保存 ✓' : '保存设置'}
          </View>
        </Button>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantSettingsPage
