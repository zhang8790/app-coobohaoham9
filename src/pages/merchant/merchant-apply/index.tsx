// @title 自营门店
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
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
  maxLength?: number
}

// P7：精简到 3 字段（门店名称 + 联系人手机号 + 门店地址）。
// 删除原「联系人姓名/经营类型/简介」三个跨类目敏感字段，避免触发微信「第三方入驻/异业招商」审核雷区。
function MerchantApplyPage() {
  const { user } = useAuth()
  const [existing, setExisting] = useState<MerchantApplication | null>(null)
  const [storeName, setStoreName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
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
    if (!/^1[3-9]\d{9}$/.test(contactPhone)) { Taro.showToast({ title: '请输入正确的手机号', icon: 'none' }); return }
    if (!address.trim()) { Taro.showToast({ title: '请输入门店地址', icon: 'none' }); return }
    if (!agreed) { Taro.showToast({ title: '请先阅读并同意自营门店运营规范', icon: 'none' }); return }
    setSubmitting(true)
    try {
      await submitMerchantApplication({
        store_name: storeName.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
      })
      Taro.showToast({ title: '申请已提交', icon: 'success' })
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

  // 已有申请：分别展示审核中/已通过/未通过
  if (existing) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex flex-col items-center justify-center px-8 gap-6">
        {existing.status === 'pending' && (
          <>
            <Icon name="clock-outline" size={80} className="text-muted-foreground" />
            <Text className="text-2xl font-bold text-foreground">审核中</Text>
            <Text className="text-xl text-muted-foreground text-center">您的自营门店申请已提交，请耐心等待总部核验。</Text>
            <Text className="text-base text-muted-foreground text-center">核验通过后，您将可以使用门店手机号绑定到本小程序或网页版管理后台。</Text>
          </>
        )}
        {existing.status === 'approved' && (
          <>
            <Icon name="check-circle" size={80} className="text-primary" />
            <Text className="text-2xl font-bold text-primary">已通过</Text>
            <Text className="text-xl text-muted-foreground text-center">您的自营门店申请已通过，可前往「我的—自营门店」进入管理后台。</Text>
            <Text className="text-base text-muted-foreground text-center">网页版管理后台请使用门店手机号+邀请码登录，邀请码请向总部运营索取。</Text>
            <Button type="button"
              className="!flex items-center justify-center leading-none rounded-2xl !bg-primary !border-none"
              onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
              <View className="py-3 px-8 text-xl text-white font-bold">前往管理后台</View>
            </Button>
          </>
        )}
        {existing.status === 'rejected' && (
          <>
            <Icon name="close-circle" size={80} className="text-destructive" />
            <Text className="text-2xl font-bold text-destructive">审核未通过</Text>
            <Text className="text-xl text-muted-foreground text-center">原因：{existing.reject_reason || '申请信息不符合要求'}</Text>
            <Button type="button"
              className="!flex items-center justify-center leading-none rounded-2xl !bg-primary !border-none"
              onClick={() => setExisting(null)}>
              <View className="py-3 px-8 text-xl text-white font-bold">重新申请</View>
            </Button>
          </>
        )}
        <Button type="button"
          className="!flex items-center justify-center leading-none rounded-2xl !bg-card !border-2 !border-border"
          onClick={() => Taro.navigateBack()}>
          <View className="py-3 px-8 text-xl text-foreground">返回</View>
        </Button>
      </View>
    </RouteGuard>
  )

  return (
    <View className="min-h-screen bg-background pb-24">
      {/* 说明：P7 重写为单品牌自营连锁话术，去掉「联盟/百万本地用户/流量红利」等高危词 */}
      <View className="mx-4 mt-6 p-4 rounded-2xl" style={{ background: '#F1E9D9' }}>
        <View className="flex items-center gap-2 mb-2">
          <Icon name="store" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">开通自营门店</Text>
        </View>
        <Text className="text-xl text-secondary leading-relaxed">
          开通后您将作为「来电有喜」品牌自营门店店主，享有本店商品/订单/会员独立管理权限。
        </Text>
        <Text className="text-base text-muted-foreground mt-2">
          提交后由总部核验，3 个工作日内反馈结果。门店开通后，您可使用门店手机号绑定到本小程序，或登录网页版管理后台。
        </Text>
        <Text className="text-sm text-muted-foreground mt-2" style={{ color: '#9A3324' }}>
          来电有喜为品牌直营连锁，本页仅限品牌内部门店经营者提交开店申请，不对外部商家开放入驻。
        </Text>
      </View>

      <View className="px-4 mt-6 flex flex-col gap-4">
        <InputField label="门店名称" required placeholder="请输入门店名称" value={storeName}
          onChange={setStoreName} maxLength={30} />
        <InputField label="联系人手机号" required placeholder="请输入手机号" value={contactPhone}
          onChange={setContactPhone} type="tel" maxLength={11} />
        <InputField label="门店地址" required placeholder="请输入门店所在地址" value={address}
          onChange={setAddress} maxLength={60} />
      </View>

      {/* 提交按钮 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {/* 自营门店运营规范勾选（与 P4 merchant-agreement 协议页统一） */}
        <View className="flex items-center gap-2 mb-3"
          onClick={() => setAgreed(v => !v)}>
          <View className={`w-5 h-5 rounded border-2 flex items-center justify-center ${agreed ? 'bg-primary border-primary' : 'border-border'}`}>
            {agreed && <Icon name="check" size={14} className="text-white" />}
          </View>
          <View className="flex-1 flex items-center" onClick={(e) => { e.stopPropagation(); Taro.navigateTo({ url: '/pages/agreement/merchant-agreement/index' }) }}>
            <Text className="text-base text-muted-foreground">我已阅读并同意<Text className="text-primary">《自营门店运营规范》</Text></Text>
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


function InputField({ label, required, placeholder, value, onChange, type = 'text', maxLength }: InputFieldProps) {
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
          maxLength={maxLength}
          onInput={(e) => { const ev = e as any; onChange(ev.detail?.value ?? ev.target?.value ?? '') }} />
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantApplyPage
