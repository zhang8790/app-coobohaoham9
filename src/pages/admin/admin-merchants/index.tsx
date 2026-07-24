import { View, Button, Textarea, Text } from '@tarojs/components'
// @title 门派大典
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getAdminMerchantApplications, adminApproveApplication, adminRejectApplication } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import { withTimeout } from '@/utils/withTimeout'
import { maskPhone } from '@/utils/mask'
import Icon from '@/components/Icon'

type App = {
  id: string; user_id: string; store_name: string; contact_name: string
  contact_phone: string; business_type: string; description: string | null
  status: string; created_at: string
}

function AdminMerchantsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [list, setList] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    try {
      const data = await withTimeout(getAdminMerchantApplications())
      setList(data)
    } catch (err) {
      console.error('[AdminMerchants] load failed:', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    setProcessing(id)
    const ok = await adminApproveApplication(id)
    setProcessing(null)
    if (ok) { Taro.showToast({ title: '已通过', icon: 'success' }); load() }
    else Taro.showToast({ title: '操作失败', icon: 'none' })
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) { Taro.showToast({ title: '请填写驳回理由', icon: 'none' }); return }
    setProcessing(rejectId)
    const ok = await adminRejectApplication(rejectId, rejectReason.trim())
    setProcessing(null)
    setRejectId(null)
    setRejectReason('')
    if (ok) { Taro.showToast({ title: '已驳回', icon: 'success' }); load() }
    else Taro.showToast({ title: '操作失败', icon: 'none' })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 py-4">
        {loading ? (
          <View className="flex items-center justify-center py-20">
            <Icon name="loading" size={48} className="text-primary animate-spin" />
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center justify-center py-20 gap-3">
            <Icon name="check-circle" size={60} className="text-emerald-500" />
            <Text className="text-2xl text-muted-foreground">暂无待审自营门店申请</Text>
          </View>
        ) : (
          <View className="flex flex-col gap-4">
            {list.map(app => (
              <View key={app.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
                <View className="flex items-start justify-between">
                  <View className="flex flex-col gap-1">
                    <Text className="text-2xl font-bold text-foreground">{app.store_name}</Text>
                    <Text className="text-xl text-muted-foreground">{app.business_type}</Text>
                  </View>
                  <Text className="px-3 py-1 rounded-full text-base bg-amber-100 text-amber-700 font-bold">待审</Text>
                </View>
                <View className="flex flex-col gap-1">
                  <View className="flex items-center gap-2">
                    <Icon name="account" size={20} className="text-muted-foreground" />
                    <Text className="text-xl text-foreground">{app.contact_name}</Text>
                  </View>
                  <View className="flex items-center gap-2">
                    <Icon name="phone" size={20} className="text-muted-foreground" />
                    <Text className="text-xl text-foreground">{maskPhone(app.contact_phone)}</Text>
                  </View>
                  {app.description && (
                    <View className="flex items-start gap-2">
                      <Icon name="text" size={20} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                      <Text className="text-xl text-muted-foreground">{app.description}</Text>
                    </View>
                  )}
                  <Text className="text-base text-muted-foreground">{new Date(app.created_at).toLocaleDateString('zh-CN')}</Text>
                </View>
                <View className="flex flex-row gap-3 pt-1">
                  <Button type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === app.id ? 'bg-primary/50' : 'bg-primary'}`}
                    onClick={() => handleApprove(app.id)}>
                    <View className="py-3 px-4 text-xl font-bold text-white flex items-center gap-1">
                      <Icon name="check-circle" size={20} />
                      <Text>准许开山立派</Text>
                    </View>
                  </Button>
                  <Button type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                    onClick={() => { setRejectId(app.id); setRejectReason('') }}>
                    <View className="py-3 px-4 text-xl font-bold text-destructive flex items-center gap-1">
                      <Icon name="close-circle" size={20} />
                      <Text>逐出山门</Text>
                    </View>
                  </Button>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 驳回理由弹窗 */}
      {rejectId && (
        <View className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <View className="w-full bg-card rounded-t-3xl p-6 flex flex-col gap-4">
            <View className="flex items-center justify-between">
              <Text className="text-2xl font-bold text-foreground">填写驳回理由</Text>
              <Button type="button" onClick={() => setRejectId(null)}>
                <Icon name="close" size={30} className="text-muted-foreground" />
              </Button>
            </View>
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-background">
              <Textarea className="w-full text-xl text-foreground bg-transparent outline-none"
                style={{ height: '20vw', minHeight: '80px' }}
                placeholder="请填写驳回理由，将告知申请自营门店..."
                value={rejectReason}
                onInput={(e) => { const ev = e as any; setRejectReason(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </View>
            <Button type="button"
              className="flex items-center justify-center leading-none rounded-xl bg-destructive w-full"
              onClick={handleReject}>
              <View className="py-4 text-xl font-bold text-white">确认驳回</View>
            </Button>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default AdminMerchantsPage
