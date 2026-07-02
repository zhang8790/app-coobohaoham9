// @title 门派大典
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getAdminMerchantApplications, adminApproveApplication, adminRejectApplication } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'

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
    const data = await getAdminMerchantApplications()
    setList(data)
    setLoading(false)
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
    <div className="min-h-screen bg-background pb-10">
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="i-mdi-loading text-5xl text-primary animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="i-mdi-check-circle text-6xl text-emerald-500" />
            <span className="text-2xl text-muted-foreground">暂无待审商家申请</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map(app => (
              <div key={app.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-2xl font-bold text-foreground">{app.store_name}</span>
                    <span className="text-xl text-muted-foreground">{app.business_type}</span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-base bg-amber-100 text-amber-700 font-bold">待审</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="i-mdi-account text-xl text-muted-foreground" />
                    <span className="text-xl text-foreground">{app.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="i-mdi-phone text-xl text-muted-foreground" />
                    <span className="text-xl text-foreground">{app.contact_phone}</span>
                  </div>
                  {app.description && (
                    <div className="flex items-start gap-2">
                      <div className="i-mdi-text text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span className="text-xl text-muted-foreground">{app.description}</span>
                    </div>
                  )}
                  <span className="text-base text-muted-foreground">{new Date(app.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
                <div className="flex flex-row gap-3 pt-1">
                  <button type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === app.id ? 'bg-primary/50' : 'bg-primary'}`}
                    onClick={() => handleApprove(app.id)}>
                    <div className="py-3 px-4 text-xl font-bold text-white flex items-center gap-1">
                      <div className="i-mdi-check-circle text-xl" />
                      <span>准许开山立派</span>
                    </div>
                  </button>
                  <button type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                    onClick={() => { setRejectId(app.id); setRejectReason('') }}>
                    <div className="py-3 px-4 text-xl font-bold text-destructive flex items-center gap-1">
                      <div className="i-mdi-close-circle text-xl" />
                      <span>逐出山门</span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 驳回理由弹窗 */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full bg-card rounded-t-3xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-foreground">填写驳回理由</span>
              <button type="button" onClick={() => setRejectId(null)}>
                <div className="i-mdi-close text-3xl text-muted-foreground" />
              </button>
            </div>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-background">
              <textarea className="w-full text-xl text-foreground bg-transparent outline-none"
                style={{ height: '20vw', minHeight: '80px' }}
                placeholder="请填写驳回理由，将告知申请商家..."
                value={rejectReason}
                onInput={(e) => { const ev = e as any; setRejectReason(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </div>
            <button type="button"
              className="flex items-center justify-center leading-none rounded-xl bg-destructive w-full"
              onClick={handleReject}>
              <div className="py-4 text-xl font-bold text-white">确认驳回</div>
            </button>
          </div>
        </div>
      )}
    </div>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default AdminMerchantsPage
