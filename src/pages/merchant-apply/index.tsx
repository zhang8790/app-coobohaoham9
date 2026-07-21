// @title 商家入驻
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Input, Textarea, Button } from '@tarojs/components'
import { getMyMerchantApplication, submitMerchantApplication } from '@/db/api'
import type { MerchantApplication } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'
import { withTimeout } from '@/utils/withTimeout'
import Icon from '@/components/Icon'

interface InputFieldProps {
  label: string
  required?: boolean
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
}

const BUSINESS_TYPES = ['餐饮', '购物', '娱乐', '美容', '家政', '教育', '医疗', '其他']

function MerchantApplyPage() {
  const { user } = useAuth()
  const [existing, setExisting] = useState<MerchantApplication | null>(null)
  const [storeName, setStoreName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [businessType, setBusinessType] = useState('餐饮')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [agreed, setAgreed] = useState(false)

  const loadApp = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const app = await withTimeout(
        getMyMerchantApplication(),
        5000,
        '[merchant-apply] getMyMerchantApplication 超时'
      )
      setExisting(app ?? null)
    } catch (err) {
      console.error('[merchant-apply] loadApp error:', err)
      setExisting(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { loadApp() }, [loadApp])

  // 页面每次显示时重新加载（处理从其他页面返回的场景）
  useDidShow(() => {
    if (user) loadApp()
  })

  const handleSubmit = async () => {
    if (!storeName.trim()) { Taro.showToast({ title: '请输入门店名称', icon: 'none' }); return }
    if (!contactName.trim()) { Taro.showToast({ title: '请输入联系人', icon: 'none' }); return }
    if (!/^1[3-9]\d{9}$/.test(contactPhone)) { Taro.showToast({ title: '请输入正确手机号', icon: 'none' }); return }
    if (!agreed) { Taro.showToast({ title: '请先阅读并同意入驻协议', icon: 'none' }); return }
    setSubmitting(true)
    try {
      await submitMerchantApplication({
        store_name: storeName.trim(),
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        business_type: businessType,
        description: description.trim() || undefined
      })
      Taro.showToast({ title: '申请已提交！', icon: 'success' })
      // 提交成功后，立即重新加载申请状态，显示"审核中"页面
      await loadApp()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  // 已有申请
  if (existing) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex flex-col items-center justify-center px-8 gap-6">
        {existing.status === 'pending' && (
          <>
            <Icon name="clock-outline" size={28} className="text-8xl text-muted-foreground" />
          <Text className="text-2xl font-bold text-foreground">审核中</Text>
          <Text className="text-xl text-muted-foreground text-center">您的申请正在审核中，预计1-3个工作日完成审核。</Text>
        </>
      )}
      {existing.status === 'approved' && (
        <>
          <Icon name="check-circle" size={28} className="text-8xl text-primary" />
          <Text className="text-2xl font-bold text-primary">已通过</Text>
          <Text className="text-xl text-muted-foreground text-center">恭喜！您的商家入驻申请已通过，可以开始管理门店了。</Text>
        </>
      )}
      {existing.status === 'rejected' && (
        <>
          <Icon name="close-circle" size={28} className="text-8xl text-destructive" />
          <Text className="text-2xl font-bold text-destructive">审核未通过</Text>
          <Text className="text-xl text-muted-foreground text-center">原因：{existing.reject_reason || '申请信息不符合要求'}</Text>
          <Button type="button"
            className="flex items-center justify-center leading-none rounded-2xl bg-primary"
            onClick={() => setExisting(null)}>
            <View className="py-3 px-8 text-xl text-white font-bold">重新申请</View>
          </Button>
        </>
      )}
      <Button type="button"
        className="flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
        onClick={() => Taro.navigateBack()}>
        <View className="py-3 px-8 text-xl text-foreground">返回</View>
      </Button>
    </View>
  </RouteGuard>
  )

  return (
    <View className="min-h-screen bg-background pb-24">
      {/* 说明 */}
      <View className="mx-4 mt-6 p-4 rounded-2xl" style={{ background: '#F1E9D9' }}>
        <View className="flex items-center gap-2 mb-2">
          <Icon name="store" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">商家入驻申请</Text>
        </View>
        <Text className="text-xl text-secondary leading-relaxed">
          加入来电有喜商家联盟，覆盖百万本地用户，坐享流量红利。填写信息后1-3个工作日完成审核。
        </Text>
      </View>

      <View className="px-4 mt-6 flex flex-col gap-4">
        {/* 门店名称 */}
        <InputField label="门店名称" required placeholder="请输入门店名称" value={storeName}
          onChange={setStoreName} />
        {/* 联系人 */}
        <InputField label="联系人姓名" required placeholder="请输入联系人姓名" value={contactName}
          onChange={setContactName} />
        {/* 联系电话 */}
        <InputField label="联系电话" required placeholder="请输入手机号" value={contactPhone}
          onChange={setContactPhone} type="tel" />

        {/* 经营类型 */}
        <View>
          <View className="flex items-center gap-1 mb-2">
            <Text className="text-xl font-bold text-foreground">经营类型</Text>
            <Text className="text-primary text-xl">*</Text>
          </View>
          <View className="flex flex-wrap gap-2">
            {BUSINESS_TYPES.map(t => (
              <View key={t}
                className={`px-4 py-2 rounded-full border-2 text-xl transition ${businessType === t ? 'bg-primary border-primary text-white' : 'bg-card border-border text-foreground'}`}
                onClick={() => setBusinessType(t)}>
                {t}
              </View>
            ))}
          </View>
        </View>

        {/* 简介 */}
        <View>
          <Text className="text-xl font-bold text-foreground mb-2">门店简介（选填）</Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card overflow-hidden">
            <Textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="介绍一下您的门店特色..."
              value={description}
              maxLength={200}
              style={{ height: '100px' }}
              onInput={(e) => { const ev = e as any; setDescription(ev.detail?.value ?? ev.target?.value ?? '') }} />
          </View>
        </View>
      </View>

      {/* 提交按钮 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {/* 入驻协议勾选 */}
        <View className="flex items-center gap-2 mb-3"
          onClick={() => setAgreed(v => !v)}>
          <View className={`w-5 h-5 rounded border-2 flex items-center justify-center ${agreed ? 'bg-primary border-primary' : 'border-border'}`}>
            {agreed && <Icon name="check" size={14} className="text-white" />}
          </View>
          <View className="flex-1 flex items-center" onClick={(e) => { e.stopPropagation(); Taro.navigateTo({ url: '/pages/merchant-agreement/index' }) }}>
            <Text className="text-base text-muted-foreground">我已阅读并同意<Text className="text-primary">《商家入驻协议》</Text></Text>
          </View>
        </View>
        <Button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <View className="py-4 text-2xl font-bold text-white">
            {submitting ? '提交中...' : '提交申请'}
          </View>
        </Button>
      </View>
    </View>
  )
}


function InputField({ label, required, placeholder, value, onChange, type = 'text' }: InputFieldProps) {
  return (<RouteGuard>
    <View>
      <View className="flex items-center gap-1 mb-2">
        <Text className="text-xl font-bold text-foreground">{label}</Text>
        {required && <Text className="text-primary text-xl">*</Text>}
      </View>
      <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
        <Input
          className="w-full text-xl text-foreground bg-transparent outline-none"
          placeholder={placeholder}
          value={value}
          type={type}
          onInput={(e) => { const ev = e as any; onChange(ev.detail?.value ?? ev.target?.value ?? '') }} />
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantApplyPage
