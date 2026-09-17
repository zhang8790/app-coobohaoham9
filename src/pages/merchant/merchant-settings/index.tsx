// @title 店铺设置（商家端）— 与管理后台保持一致
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Textarea, Button, Image, Picker } from '@tarojs/components'
import {
  getMerchantStore, updateStore, getPrinterConfig, savePrinterConfig, callPrintReceipt,
  claimStoreOwnership,
} from '@/db/api'
import type { PrinterConfig } from '@/db/types'
import { uploadToStorage } from '@/utils/upload'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { clearRequestCache } from '@/db/requestCache'
import Icon from '@/components/Icon'

// 场景标签选项
const SCENE_OPTIONS = ['堂食', '配送']
// 类目选项
const CATEGORY_OPTIONS = ['餐饮', '零售', '水果', '服务', '娱乐', '其他']
// 建店时写入的地址占位符：商家不填真地址就一直在，禁止原样保存回去
const ADDRESS_PLACEHOLDER = '待补充'

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
  delivery_radius: number
  delivery_fee: number
  free_delivery_threshold: number
  min_order_amount: number
  announcement: string
  scene_tags: string[]
  referral_rate: number  // 让利率（0.03 = 3%）
  referral_rate_enabled: boolean  // 店铺整体让利开关
  /** 门店坐标（经纬度），用于「离我最近的门店」按距离排序；留空表示未标注 */
  lat: string
  lng: string
}

function MerchantSettingsPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [form, setForm] = useState<StoreForm>({
    name: '', description: '', address: '', phone: '',
    contact: '', category: '水果',
    image_url: null, banner_url: null,
    is_open: true, open_time: '08:00', close_time: '20:00',
    delivery_enabled: true,
    delivery_radius: 3, delivery_fee: 2,
    free_delivery_threshold: 30, min_order_amount: 20,
    announcement: '', scene_tags: [],
    referral_rate: 0.09, referral_rate_enabled: true,
    lat: '', lng: ''})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // 让利率的原始输入（避免受控 Input 边输边被 clamp 导致「10」永远输不进去）
  const [rateInput, setRateInput] = useState('9')
  // 保存被拒（无门店编辑权限）时的自救面板
  const [permissionBlocked, setPermissionBlocked] = useState(false)
  const [claiming, setClaiming] = useState(false)

  // ===== 小票打印机（一店一台，店里自服务配置）=====
  const [printer, setPrinter] = useState<PrinterConfig | null>(null)
  const [printerForm, setPrinterForm] = useState({
    provider: 'yilianyun' as 'feie' | 'yilianyun' | '365',
    device_sn: '', api_user: '', api_key: '', printer_key: '',
    enabled: true, auto_print_on_paid: false,
  })
  const [printerSaving, setPrinterSaving] = useState(false)
  const [printerTesting, setPrinterTesting] = useState(false)
  const [printerMsg, setPrinterMsg] = useState('')

  // 图片预览路径（本地 tempFilePath，选图后立即可见）
  // 微信小程序 <Image> 支持：本地路径 / 网络URL；不支持：base64 data URI
  const [previewPath, setPreviewPath] = useState<string>('')

  const applyStoreToForm = (s: Store) => {
    setForm(prev => ({
      ...prev,
      name: s.name || '',
      description: s.description ?? '',
      // 建店占位符「待补充」不该回填进输入框，否则商家会把它当内容原样保存
      address: (s.address && s.address !== ADDRESS_PLACEHOLDER) ? s.address : '',
      phone: s.phone ?? '',
      contact: (s as any).contact ?? '',
      category: s.category || '水果',
      image_url: s.image_url ?? null,
      banner_url: s.banner_url ?? null,
      is_open: (s as any).is_open !== false,
      open_time: (s as any).open_time || '08:00',
      close_time: (s as any).close_time || '20:00',
      delivery_enabled: (s as any).delivery_enabled !== false,
      delivery_radius: (s as any).delivery_radius ?? 3,
      delivery_fee: (s as any).delivery_fee ?? 2,
      free_delivery_threshold: (s as any).free_delivery_threshold ?? 30,
      min_order_amount: (s as any).min_order_amount ?? 20,
      announcement: (s as any).announcement ?? '',
      scene_tags: (s as any).scene_tags ?? [],
      referral_rate: (s as any).referral_rate ?? 0.09,
      referral_rate_enabled: (s as any).referral_rate_enabled ?? true,
      lat: (s as any).lat != null ? String((s as any).lat) : '',
      lng: (s as any).lng != null ? String((s as any).lng) : '',
    }))
    setRateInput(String(Math.round(((s as any).referral_rate ?? 0.09) * 100)))

    // 初始化预览路径（DB 中存储的公网 URL 或空）
    const dbUrl = s.banner_url ?? ''
    // 过滤掉无效的 base64 和本地临时路径
    if (dbUrl && !dbUrl.startsWith('data:') && !dbUrl.startsWith('wxfile://') && !dbUrl.startsWith('http://tmp')) {
      setPreviewPath(dbUrl)
    } else {
      setPreviewPath('')
    }
  }

  useEffect(() => {
    getMerchantStore().then((s) => {
      setStore(s)
      if (!s) return
      applyStoreToForm(s)

      // 读取本店打印机配置（一店一台，存在则回填表单）
      getPrinterConfig(s.id).then((p) => {
        if (p) {
          setPrinter(p)
          setPrinterForm({
            provider: p.provider,
            device_sn: p.device_sn || '',
            api_user: p.api_user ?? '',
            api_key: p.api_key ?? '',
            printer_key: p.printer_key ?? '',
            enabled: p.enabled,
            auto_print_on_paid: p.auto_print_on_paid,
          })
        }
      })
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

      // ① 立即预览（本地路径，无需网络，立即可见）
      setPreviewPath(tempPath)

      // ② 异步上传到 Storage（获取公网 URL 用于持久化）
      Taro.showLoading({ title: '上传中...' })
      try {
        const publicUrl = await uploadToStorage(tempPath)

        if (publicUrl) {
          // 同时更新 banner_url 和 image_url，确保所有页面都能看到新图
          setForm(f => ({ ...f, banner_url: publicUrl, image_url: publicUrl }))
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
    if (!form.name.trim()) { Taro.showToast({ title: '请填写店铺名称', icon: 'none' }); return }

    const addr = form.address.trim()
    if (addr === ADDRESS_PLACEHOLDER) {
      Taro.showToast({ title: '请填写真实店铺地址，不要保留占位文字', icon: 'none', duration: 2500 })
      return
    }
    // 坐标校验：只在两项都有效时才提交，避免半填导致门店定位错乱
    const latNum = form.lat.trim() === '' ? undefined : Number(form.lat)
    const lngNum = form.lng.trim() === '' ? undefined : Number(form.lng)
    if ((latNum !== undefined && !Number.isFinite(latNum)) || (lngNum !== undefined && !Number.isFinite(lngNum))) {
      Taro.showToast({ title: '经纬度请填写数字，或留空', icon: 'none' }); return
    }
    if (latNum !== undefined && (latNum < -90 || latNum > 90)) {
      Taro.showToast({ title: '纬度范围应为 -90 ~ 90', icon: 'none' }); return
    }
    if (lngNum !== undefined && (lngNum < -180 || lngNum > 180)) {
      Taro.showToast({ title: '经度范围应为 -180 ~ 180', icon: 'none' }); return
    }

    setSaving(true)
    setPermissionBlocked(false)

    // 显式构造 payload：不把 form 整体透传，避免写入没有 UI 可控的字段
    // （如 pickup_enabled —— 自提已从全站下线，写它只会让门店状态与界面不一致）
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      address: addr,
      phone: form.phone.trim(),
      contact: form.contact.trim(),
      category: form.category,
      image_url: form.image_url,
      banner_url: form.banner_url,
      is_open: form.is_open,
      open_time: form.open_time,
      close_time: form.close_time,
      delivery_enabled: form.delivery_enabled,
      delivery_radius: form.delivery_radius,
      delivery_fee: form.delivery_fee,
      free_delivery_threshold: form.free_delivery_threshold,
      min_order_amount: form.min_order_amount,
      announcement: form.announcement,
      scene_tags: form.scene_tags,
      referral_rate: form.referral_rate,
      referral_rate_enabled: form.referral_rate_enabled,
      lat: latNum,
      lng: lngNum,
    }

    const res = await updateStore(store.id, payload)
    setSaving(false)

    if (res.ok) {
      // 关键：清空 30s 内存缓存，否则「我的/管理中心」等页面回退时仍读到旧值，
      // 表现为「明明保存成功，退出去还是空地址」。
      clearRequestCache()
      // 本地即时合并，当前页面无需重新请求也能保持一致
      setStore(prev => (prev ? ({ ...prev, ...payload } as unknown as Store) : prev))
      Taro.showToast({ title: '保存成功', icon: 'success' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      return
    }

    if (res.reason === 'no_permission') {
      setPermissionBlocked(true)
      Taro.showModal({
        title: '保存失败：无门店编辑权限',
        content: res.message || '当前账号不是该门店的店主/店长。',
        showCancel: false,
        confirmText: '知道了',
      })
    } else {
      Taro.showModal({
        title: '保存失败',
        content: res.message || '数据库拒绝了本次写入，请稍后重试或联系总部运营。',
        showCancel: false,
        confirmText: '知道了',
      })
    }
  }

  // 自助认领门店所有权（迁移 00141 RPC）：门店由总部建好、owner_id 为空时一键修复身份
  const handleClaimOwnership = async () => {
    setClaiming(true)
    const r = await claimStoreOwnership()
    setClaiming(false)
    if (!r.ok) {
      Taro.showModal({
        title: '认领失败',
        content: r.message || '请确认已用邀请码绑定本店身份，或联系总部运营。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (r.claimed > 0) {
      Taro.showToast({ title: '已认领 ' + r.claimed + ' 家门店', icon: 'success' })
    } else {
      Taro.showToast({ title: '暂无可认领门店（可能已认领）', icon: 'none', duration: 2500 })
    }
    setPermissionBlocked(false)
    // 重新拉取门店（缓存已清）
    const fresh = await getMerchantStore()
    if (fresh) { setStore(fresh); applyStoreToForm(fresh) }
  }

  // ===== 小票打印机：保存 / 保存并测试 =====
  const updatePrinterField = <K extends keyof typeof printerForm>(field: K, value: typeof printerForm[K]) => {
    setPrinterForm(f => ({ ...f, [field]: value }))
  }

  const handleSavePrinter = async (andTest = false) => {
    if (!store) return
    if (!printerForm.device_sn.trim()) {
      Taro.showToast({ title: '请填写设备编号', icon: 'none' })
      return
    }
    setPrinterSaving(true)
    setPrinterMsg('')
    const ok = await savePrinterConfig({
      ...(printer ? { id: printer.id } : {}),
      store_id: store.id,
      device_sn: printerForm.device_sn.trim(),
      api_user: printerForm.api_user.trim() || null,
      api_key: printerForm.api_key.trim() || null,
      printer_key: printerForm.printer_key.trim() || null,
      provider: printerForm.provider,
      enabled: printerForm.enabled,
      auto_print_on_paid: printerForm.auto_print_on_paid,
    })
    if (!ok) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
      setPrinterSaving(false)
      return
    }
    // 回读最新配置，刷新表单与状态
    const fresh = await getPrinterConfig(store.id)
    if (fresh) {
      setPrinter(fresh)
      setPrinterForm({
        provider: fresh.provider,
        device_sn: fresh.device_sn || '',
        api_user: fresh.api_user ?? '',
        api_key: fresh.api_key ?? '',
        printer_key: fresh.printer_key ?? '',
        enabled: fresh.enabled,
        auto_print_on_paid: fresh.auto_print_on_paid,
      })
    }
    Taro.showToast({ title: andTest ? '已保存' : '保存成功', icon: 'success' })

    if (andTest) {
      setPrinterTesting(true)
      const r = await callPrintReceipt({ storeId: store.id, test: true })
      setPrinterTesting(false)
      if (r.success) {
        setPrinterMsg('测试小票已推送，请查看打印机是否出纸。')
      } else {
        setPrinterMsg('测试失败：' + (r.error || '未知错误') + (r.need_config ? '（本店未找到启用中的打印机）' : ''))
      }
    }
    setPrinterSaving(false)
  }

  if (!store) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-40">

      {/* ===== 0. 权限异常自救（仅在保存被 RLS 拒绝后出现）===== */}
      {permissionBlocked && (
        <View className="mx-4 mt-3 p-4 rounded-2xl bg-orange-50 border border-orange-200">
          <Text className="text-base font-bold text-orange-700 block mb-1">该账号还不是本店店主/店长</Text>
          <Text className="text-xs text-orange-600 block mb-3">
            门店信息写入被权限策略拦截。若本店确由你运营，可点下方「认领门店所有权」一键修复；
            否则请先在「我的 → 自营门店」用邀请码绑定门店身份。
          </Text>
          <Button
            className="!w-full !m-0 !p-0 !rounded-xl !border-none !bg-orange-500"
            onClick={handleClaimOwnership} disabled={claiming}>
            <View className="py-3 text-sm font-bold text-white">{claiming ? '认领中...' : '认领门店所有权'}</View>
          </Button>
        </View>
      )}

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
              onLoad={() => {}}
              onError={(e: any) => {
                console.error('[banner] 预览图加载失败:', previewPath.slice(0, 80), e)
                // 加载失败时清除预览，显示占位符（避免空白区域）
                setPreviewPath('')
                Taro.showToast({ title: '图片加载失败', icon: 'none' })
              }} />
          ) : (
            <View className="flex flex-col items-center gap-2">
              <Icon name="image-plus" size={48} className="text-muted-foreground/40" />
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
                  ? '!bg-primary !border-primary'
                  : '!bg-white !border-gray-300'}`}
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
            onInput={e => updateField('name', (e.detail?.value as string) ?? '')} />
        </View>

        {/* 店铺简介 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">店铺简介</Text>
          <Textarea
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base min-h-[80px]"
            placeholder="简述店铺特色..."
            value={form.description}
            onInput={e => updateField('description', (e.detail?.value as string) ?? '')} />
        </View>

        {/* 主营类目 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">主营类目 *</Text>
          <View className="flex gap-2 flex-wrap">
            {CATEGORY_OPTIONS.map(cat => (
              <View key={cat}
                className={`px-3 py-1.5 rounded-lg text-sm ${form.category === cat
                  ? 'bg-primary' : 'bg-muted'}`}
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
            onInput={e => updateField('phone', (e.detail?.value as string) ?? '')} />
        </View>

        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">联系人</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={form.contact}
            placeholder="联系人姓名"
            onInput={e => updateField('contact', (e.detail?.value as string) ?? '')} />
        </View>

        <View>
          <Text className="text-sm text-gray-500 mb-1 block">店铺地址</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={form.address}
            placeholder="详细地址，如：杭州市西湖区文三路 100 号"
            onInput={e => updateField('address', (e.detail?.value as string) ?? '')} />
          <Text className="text-xs text-gray-400 mt-1 block">顾客端「门店详情」会展示此地址；留空则不展示。</Text>
        </View>
      </View>

      {/* ===== 4.5 门店定位（坐标）===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-1 block">门店定位</Text>
        <Text className="text-xs text-gray-400 mb-3 block">
          填写经纬度后，顾客在「附近门店」里才能按距离正确排序并看到距离。留空的门店会排在列表末尾。
        </Text>
        <View className="flex items-center gap-3">
          <View className="flex-1">
            <Text className="text-xs text-gray-500 mb-1 block">纬度 (lat)</Text>
            <Input
              className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm"
              type="digit"
              value={form.lat}
              placeholder="如 30.2930"
              onInput={e => updateField('lat', (e.detail?.value as string) ?? '')} />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-gray-500 mb-1 block">经度 (lng)</Text>
            <Input
              className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm"
              type="digit"
              value={form.lng}
              placeholder="如 120.1300"
              onInput={e => updateField('lng', (e.detail?.value as string) ?? '')} />
          </View>
        </View>
        <Text className="text-xs text-gray-400 mt-2 block">
          小提示：在高德/腾讯地图上长按门店位置即可看到「纬度, 经度」，按上表顺序填入。
        </Text>
      </View>

      {/* ===== 5. 营业设置 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">营业设置</Text>

        {/* 营业状态开关 */}
        <View className="flex items-center justify-between py-2 border-b border-gray-100">
          <Text className="text-base text-foreground">营业状态</Text>
          <View
            className={`w-12 h-7 rounded-full relative ${form.is_open ? 'bg-success' : 'bg-muted'}`}
            onClick={() => updateField('is_open', !form.is_open)}
          >
            <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${form.is_open ? 'right-0.5' : 'left-0.5'}`} />
          </View>
        </View>

        {/* 营业时间（时间选择器，避免手输非法格式）*/}
        <View className="flex items-center gap-3 mt-3">
          <View className="flex-1">
            <Text className="text-xs text-gray-500 mb-1 block">开始时间</Text>
            <Picker mode="time" value={form.open_time} onChange={e => updateField('open_time', e.detail.value)}>
              <View className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm text-foreground">
                {form.open_time || '08:00'}
              </View>
            </Picker>
          </View>
          <Text className="pt-5 text-gray-400">至</Text>
          <View className="flex-1">
            <Text className="text-xs text-gray-500 mb-1 block">结束时间</Text>
            <Picker mode="time" value={form.close_time} onChange={e => updateField('close_time', e.detail.value)}>
              <View className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm text-foreground">
                {form.close_time || '20:00'}
              </View>
            </Picker>
          </View>
        </View>
      </View>

      {/* ===== 5.5 让利（推广）配置 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-1 block">让利（推荐）配置</Text>
        <Text className="text-xs text-gray-400 mb-3 block">设置订单金额中让利的比例，用于消费者推荐奖励和健康豆返还</Text>

        <View className="flex items-center justify-between">
          <Text className="text-sm text-gray-600">让利率</Text>
          <Text className="text-xl font-bold text-primary">{Math.round(form.referral_rate * 100)}%</Text>
        </View>
        <View className="mt-2">
          <Input
            type="number"
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base text-center"
            value={rateInput}
            onInput={e => {
              // 输入过程不做 clamp：否则输入「10」时第一下「1」会被抬到 3，
              // 光标内容被改写，用户永远打不出 10/30（历史 bug）。
              const raw = (e.detail?.value as string) ?? ''
              setRateInput(raw.replace(/[^\d]/g, '').slice(0, 2))
            }}
            onBlur={() => {
              const v = Number(rateInput)
              const safe = !Number.isFinite(v) || v <= 0 ? 9 : Math.min(30, Math.max(3, v))
              setRateInput(String(safe))
              updateField('referral_rate', safe / 100)
            }}
            placeholder="3~30" />
          <Text className="text-xs text-gray-400 mt-1 block text-center">输入 3~30 之间的整数（表示 3%~30%）</Text>
        </View>
        <View className="mt-2 p-2 rounded-lg bg-primary/10">
          <Text className="text-xs text-primary">
            示例：让利率 10%，订单 100 元 → 品牌让利 10 元，用于消费者推荐奖励 + 健康豆返还 + 品牌收入
          </Text>
        </View>
        {/* 店铺整体让利开关 */}
        <View className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <View className="flex-1 pr-3">
            <Text className="text-sm text-gray-700 font-medium">店铺整体让利</Text>
            <Text className="text-xs text-gray-400 mt-0.5 block">
              {form.referral_rate_enabled
                ? '开启：商品未单独设让利时，按此门店率参与推荐奖励'
                : '关闭：仅商品级让利生效，整店不被统一让利吃掉利润'}
            </Text>
          </View>
          <View
            className={`w-12 h-7 rounded-full relative ${form.referral_rate_enabled ? 'bg-success' : 'bg-muted'}`}
            onClick={() => updateField('referral_rate_enabled', !form.referral_rate_enabled)}
          >
            <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${form.referral_rate_enabled ? 'right-0.5' : 'left-0.5'}`} />
          </View>
        </View>
      </View>

      {/* ===== 6. 配送配置 ===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-3 block">配送配置</Text>

        <View className="p-3 rounded-xl bg-gray-50">
          <View className="flex items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base font-semibold text-foreground">配送</Text>
              <Text className="text-xs text-gray-400 mt-0.5 block">支持送到客户地址</Text>
            </View>
            <View
              className={`w-12 h-7 rounded-full relative ${form.delivery_enabled ? 'bg-success' : 'bg-muted'}`}
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
                  placeholder="3"
                  onInput={e => updateField('delivery_radius', Number(e.detail?.value) || 0)} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">配送费(元)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.delivery_fee)}
                  placeholder="2"
                  onInput={e => updateField('delivery_fee', Number(e.detail?.value) || 0)} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">满额免运费(元)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.free_delivery_threshold)}
                  placeholder="30"
                  onInput={e => updateField('free_delivery_threshold', Number(e.detail?.value) || 0)} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1 block">起送价(元)</Text>
                <Input className="w-full px-2 py-1.5 rounded-lg bg-white text-sm"
                  type="digit" value={String(form.min_order_amount)}
                  placeholder="20"
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
          onInput={e => updateField('announcement', (e.detail?.value as string) ?? '')} />
      </View>

      {/* ===== 8. 小票打印机（一店一台，店里自服务配置）===== */}
      <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
        <Text className="text-base font-bold text-foreground mb-1 block">小票打印机</Text>
        <Text className="text-xs text-gray-400 mb-3 block">每店一台，订单小票可自动出纸。云打印机需在「飞鹅 / 易联云」后台把本店打印机添加到账号后，填入下方四项。</Text>

        {/* 服务商选择 */}
        <View className="flex gap-2 mb-3">
          {(['yilianyun', 'feie'] as const).map(p => (
            <View key={p}
              className={`px-3 py-1.5 rounded-lg text-sm ${printerForm.provider === p
                ? 'bg-primary' : 'bg-muted'}`}
              onClick={() => updatePrinterField('provider', p)}>
              <Text className={printerForm.provider === p ? 'text-white' : 'text-gray-600'}>{p === 'yilianyun' ? '易联云' : '飞鹅'}</Text>
            </View>
          ))}
        </View>

        {/* 设备编号 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">设备编号 *</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={printerForm.device_sn}
            placeholder="打印机机器码 / 设备号"
            onInput={e => updatePrinterField('device_sn', (e.detail?.value as string) ?? '')} />
          <Text className="text-xs text-gray-400 mt-1 block">
            易联云填「终端号」(machine_code，见自检小票或云后台)，不是用户 ID；飞鹅填打印机底部 SN。
          </Text>
        </View>

        {/* 应用ID */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">{printerForm.provider === 'feie' ? '飞鹅 USER' : '易联云 Client ID'}</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            value={printerForm.api_user}
            placeholder={printerForm.provider === 'feie' ? '飞鹅后台 USER' : '易联云应用 ID'}
            onInput={e => updatePrinterField('api_user', (e.detail?.value as string) ?? '')} />
        </View>

        {/* 应用密钥 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">{printerForm.provider === 'feie' ? '飞鹅 UKEY' : '易联云 Client Secret'}</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            password
            value={printerForm.api_key}
            placeholder={printerForm.provider === 'feie' ? '飞鹅后台 UKEY' : '易联云应用密钥'}
            onInput={e => updatePrinterField('api_key', (e.detail?.value as string) ?? '')} />
        </View>

        {/* 打印机密钥 */}
        <View className="mb-3">
          <Text className="text-sm text-gray-500 mb-1 block">打印机密钥</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-base"
            password
            value={printerForm.printer_key}
            placeholder="打印机专属密钥"
            onInput={e => updatePrinterField('printer_key', (e.detail?.value as string) ?? '')} />
        </View>

        {/* 启用开关 */}
        <View className="flex items-center justify-between py-2 border-b border-gray-100">
          <Text className="text-base text-foreground">启用打印机</Text>
          <View
            className={`w-12 h-7 rounded-full relative ${printerForm.enabled ? 'bg-success' : 'bg-muted'}`}
            onClick={() => updatePrinterField('enabled', !printerForm.enabled)}
          >
            <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${printerForm.enabled ? 'right-0.5' : 'left-0.5'}`} />
          </View>
        </View>

        {/* 支付后自动打印 */}
        <View className="flex items-center justify-between py-2">
          <View className="flex-1 pr-3">
            <Text className="text-base text-foreground">支付后自动打印</Text>
            <Text className="text-xs text-gray-400 mt-0.5 block">开启后，订单完成即自动推送小票</Text>
          </View>
          <View
            className={`w-12 h-7 rounded-full relative ${printerForm.auto_print_on_paid ? 'bg-success' : 'bg-muted'}`}
            onClick={() => updatePrinterField('auto_print_on_paid', !printerForm.auto_print_on_paid)}
          >
            <View className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${printerForm.auto_print_on_paid ? 'right-0.5' : 'left-0.5'}`} />
          </View>
        </View>

        {/* 已知偏差提示：触发器目前不读此开关 */}
        <View className="mt-1 p-2 rounded-lg bg-orange-50">
          <Text className="text-xs text-orange-600">
            注意：自动打印由数据库触发器驱动，当前版本不判断上面的开关。只要「启用打印机」为开，
            该店已支付订单都会出单；若不想出纸，请把「启用打印机」关闭。
          </Text>
        </View>

        {/* 已配置状态 */}
        {printer && (
          <View className="mt-3 p-2 rounded-lg bg-gray-50">
            <Text className="text-xs text-gray-500">
              已配置：已打印 {printer.print_count || 0} 次
              {printer.last_print_at ? '，最近 ' + new Date(printer.last_print_at).toLocaleString('zh-CN', { hour12: false }) : ''}
            </Text>
          </View>
        )}

        {/* 测试结果/提示 */}
        {printerMsg && (
          <View className="mt-2 p-2 rounded-lg bg-blue-50">
            <Text className="text-xs text-blue-600">{printerMsg}</Text>
          </View>
        )}

        {/* 操作按钮 */}
        <View className="flex gap-2 mt-4">
          <Button
            className="!flex-1 !m-0 !p-0 !rounded-xl !border-none !bg-primary"
            onClick={() => handleSavePrinter(false)} disabled={printerSaving || printerTesting}>
            <View className="py-3 text-sm font-bold text-white">{printerSaving ? '保存中...' : '保存配置'}</View>
          </Button>
          <Button
            className="!flex-1 !m-0 !p-0 !rounded-xl !border-none !bg-success"
            onClick={() => handleSavePrinter(true)} disabled={printerSaving || printerTesting}>
            <View className="py-3 text-sm font-bold text-white">{printerTesting ? '测试中...' : '保存并测试打印'}</View>
          </Button>
        </View>
      </View>

      {/* ===== 底部固定保存栏 =====
          打印机区块很长，原来「保存设置」在文档流最末尾，商家常常滚不到就以为没保存功能。
          固定到底部（含 iPhone 安全区）后任何位置都能一键保存。 */}
      <View
        className="fixed left-0 right-0 bottom-0 px-4 pt-3 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <Button
          className={`!w-full !m-0 !p-0 !rounded-2xl !leading-none !border-none ${saving ? '!bg-primary/60' : saved ? '!bg-success' : '!bg-primary'}`}
          onClick={handleSave} disabled={saving}
        >
          <View className="py-4 text-base font-bold text-white">
            {saving ? '保存中...' : saved ? '已保存' : '保存设置'}
          </View>
        </Button>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantSettingsPage
