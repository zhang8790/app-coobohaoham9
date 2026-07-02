// @title 商家入驻
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getMyMerchantApplication, submitMerchantApplication } from '@/db/api'
import type { MerchantApplication } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'

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

  const loadApp = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const app = await getMyMerchantApplication()
    setExisting(app)
    setLoading(false)
  }, [user])

  useEffect(() => { loadApp() }, [loadApp])

  const handleSubmit = async () => {
    if (!storeName.trim()) { Taro.showToast({ title: '请输入门店名称', icon: 'none' }); return }
    if (!contactName.trim()) { Taro.showToast({ title: '请输入联系人', icon: 'none' }); return }
    if (!/^1[3-9]\d{9}$/.test(contactPhone)) { Taro.showToast({ title: '请输入正确手机号', icon: 'none' }); return }
    setSubmitting(true)
    await submitMerchantApplication({
      store_name: storeName.trim(),
      contact_name: contactName.trim(),
      contact_phone: contactPhone.trim(),
      business_type: businessType,
      description: description.trim() || undefined
    })
    setSubmitting(false)
    Taro.showToast({ title: '申请已提交！', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 1500)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  // 已有申请
  if (existing) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 gap-6">
      {existing.status === 'pending' && (
        <>
          <div className="i-mdi-clock-outline text-8xl text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground">审核中</p>
          <p className="text-xl text-muted-foreground text-center">您的申请正在审核中，预计1-3个工作日完成审核。</p>
        </>
      )}
      {existing.status === 'approved' && (
        <>
          <div className="i-mdi-check-circle text-8xl text-primary" />
          <p className="text-2xl font-bold text-primary">已通过</p>
          <p className="text-xl text-muted-foreground text-center">恭喜！您的商家入驻申请已通过，可以开始管理门店了。</p>
        </>
      )}
      {existing.status === 'rejected' && (
        <>
          <div className="i-mdi-close-circle text-8xl text-destructive" />
          <p className="text-2xl font-bold text-destructive">审核未通过</p>
          <p className="text-xl text-muted-foreground text-center">原因：{existing.reject_reason || '申请信息不符合要求'}</p>
          <button type="button"
            className="flex items-center justify-center leading-none rounded-2xl bg-primary"
            onClick={() => setExisting(null)}>
            <div className="py-3 px-8 text-xl text-white font-bold">重新申请</div>
          </button>
        </>
      )}
      <button type="button"
        className="flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
        onClick={() => Taro.navigateBack()}>
        <div className="py-3 px-8 text-xl text-foreground">返回</div>
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* 说明 */}
      <div className="mx-4 mt-6 p-4 rounded-2xl" style={{ background: '#FFF0E8' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="i-mdi-store text-2xl text-primary" />
          <span className="text-xl font-bold text-foreground">商家入驻申请</span>
        </div>
        <p className="text-xl text-secondary leading-relaxed">
          加入来店有喜商家联盟，覆盖百万本地用户，坐享流量红利。填写信息后1-3个工作日完成审核。
        </p>
      </div>

      <div className="px-4 mt-6 flex flex-col gap-4">
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
        <div>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xl font-bold text-foreground">经营类型</span>
            <span className="text-primary text-xl">*</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {BUSINESS_TYPES.map(t => (
              <div key={t}
                className={`px-4 py-2 rounded-full border-2 text-xl transition ${businessType === t ? 'bg-primary border-primary text-white' : 'bg-card border-border text-foreground'}`}
                onClick={() => setBusinessType(t)}>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* 简介 */}
        <div>
          <p className="text-xl font-bold text-foreground mb-2">门店简介（选填）</p>
          <div className="border-2 border-input rounded-xl px-4 py-3 bg-card overflow-hidden">
            <textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="介绍一下您的门店特色..."
              value={description}
              maxLength={200}
              style={{ height: '100px' }}
              onInput={(e) => { const ev = e as any; setDescription(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </div>
        </div>
      </div>

      {/* 提交按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <div className="py-4 text-2xl font-bold text-white">
            {submitting ? '提交中...' : '提交申请'}
          </div>
        </button>
      </div>
    </div>
  )
}

function InputField({ label, required, placeholder, value, onChange, type = 'text' }: {
  label: string; required?: boolean; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string
}) {
  return (<RouteGuard>
    <div>
      <div className="flex items-center gap-1 mb-2">
        <span className="text-xl font-bold text-foreground">{label}</span>
        {required && <span className="text-primary text-xl">*</span>}
      </div>
      <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
        <input
          className="w-full text-xl text-foreground bg-transparent outline-none"
          placeholder={placeholder}
          value={value}
          type={type}
          onInput={(e) => { const ev = e as any; onChange(ev.detail?.value ?? ev.target?.value ?? '') }}
        />
      </div>
    </div>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantApplyPage
