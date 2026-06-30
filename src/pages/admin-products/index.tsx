// @title 宝贝审阅
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getAdminPendingProducts, adminApproveProduct, adminRejectProduct } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'
import type { Product } from '@/db/types'

function AdminProductsPage() {
  const { profile } = useAuth()
  const [list, setList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    const data = await getAdminPendingProducts()
    setList(data)
    setLoading(false)
  }, [profile])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    setProcessing(id)
    const ok = await adminApproveProduct(id)
    setProcessing(null)
    if (ok) { Taro.showToast({ title: '已批准上架', icon: 'success' }); load() }
    else Taro.showToast({ title: '操作失败', icon: 'none' })
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) { Taro.showToast({ title: '请填写驳回理由', icon: 'none' }); return }
    setProcessing(rejectId)
    const ok = await adminRejectProduct(rejectId, rejectReason.trim())
    setProcessing(null)
    setRejectId(null)
    setRejectReason('')
    if (ok) { Taro.showToast({ title: '已驳回', icon: 'success' }); load() }
    else Taro.showToast({ title: '操作失败', icon: 'none' })
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="i-mdi-loading text-5xl text-primary animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="i-mdi-check-all text-6xl text-emerald-500" />
            <span className="text-2xl text-muted-foreground">暂无待审宝贝</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map(p => (
              <div key={p.id} className="rounded-2xl bg-card border border-border overflow-hidden flex flex-col">
                <div className="flex items-stretch gap-0">
                  {p.image_url ? (
                    <Image src={p.image_url} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }} />
                  ) : (
                    <div className="w-24 h-24 bg-muted flex items-center justify-center flex-shrink-0">
                      <div className="i-mdi-image-off text-3xl text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <p className="text-2xl font-bold text-foreground leading-tight line-clamp-1">{p.name}</p>
                      <p className="text-xl text-muted-foreground mt-1 line-clamp-2">{p.description || '暂无简介'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black text-primary">¥{Number(p.price).toFixed(2)}</span>
                      <span className="text-base text-muted-foreground">库存 {p.stock}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row gap-3 p-3 border-t border-border">
                  <button type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === p.id ? 'bg-primary/50' : 'bg-primary'}`}
                    onClick={() => handleApprove(p.id)}>
                    <div className="py-3 text-xl font-bold text-white flex items-center gap-1">
                      <div className="i-mdi-check text-xl" />
                      <span>批准面世</span>
                    </div>
                  </button>
                  <button type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                    onClick={() => { setRejectId(p.id); setRejectReason('') }}>
                    <div className="py-3 text-xl font-bold text-destructive flex items-center gap-1">
                      <div className="i-mdi-close text-xl" />
                      <span>扣押不发</span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 驳回弹窗 */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full bg-card rounded-t-3xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-foreground">扣押理由</span>
              <button type="button" onClick={() => setRejectId(null)}>
                <div className="i-mdi-close text-3xl text-muted-foreground" />
              </button>
            </div>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-background">
              <textarea className="w-full text-xl text-foreground bg-transparent outline-none"
                style={{ height: '20vw', minHeight: '80px' }}
                placeholder="请说明驳回原因，将通知商家..."
                value={rejectReason}
                onInput={(e) => { const ev = e as any; setRejectReason(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </div>
            <button type="button"
              className="flex items-center justify-center leading-none rounded-xl bg-destructive w-full"
              onClick={handleReject}>
              <div className="py-4 text-xl font-bold text-white">确认扣押</div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(AdminProductsPage)
