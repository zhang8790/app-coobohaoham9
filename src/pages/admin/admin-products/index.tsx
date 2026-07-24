// @title 宝贝审阅
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image, View, Button, Textarea, Text } from '@tarojs/components'
import { getAdminPendingProducts, adminApproveProduct, adminRejectProduct } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import { withTimeout } from '@/utils/withTimeout'
import type { Product } from '@/db/types'
import Icon from '@/components/Icon'

function AdminProductsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [list, setList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    try {
      const data = await withTimeout(getAdminPendingProducts())
      setList(data)
    } catch (err) {
      console.error('[AdminProducts] load failed:', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [profile, authLoading])

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

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 py-4">
        {loading ? (
          <View className="flex items-center justify-center py-20">
            <Icon name="loading" size={48} className="text-primary animate-spin" />
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center justify-center py-20 gap-3">
            <Icon name="check-all" size={60} className="text-emerald-500" />
            <Text className="text-2xl text-muted-foreground">暂无待审宝贝</Text>
          </View>
        ) : (
          <View className="flex flex-col gap-4">
            {list.map(p => (
              <View key={p.id} className="rounded-2xl bg-card border border-border overflow-hidden flex flex-col">
                <View className="flex items-stretch gap-0">
                  {p.image_url ? (
                    <Image src={p.image_url} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }} />
                  ) : (
                    <View className="w-24 h-24 bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon name="image-off" size={30} className="text-muted-foreground" />
                    </View>
                  )}
                  <View className="flex-1 p-3 flex flex-col justify-between">
                    <View>
                      <Text className="text-2xl font-bold text-foreground leading-tight line-clamp-1">{p.name}</Text>
                      <Text className="text-xl text-muted-foreground mt-1 line-clamp-2">{p.description || '暂无简介'}</Text>
                    </View>
                    <View className="flex items-center gap-3">
                      <Text className="text-2xl font-black text-primary">¥{Number(p.price).toFixed(2)}</Text>
                      <Text className="text-base text-muted-foreground">库存 {p.stock}</Text>
                    </View>
                  </View>
                </View>
                <View className="flex flex-row gap-3 p-3 border-t border-border">
                  <Button type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === p.id ? 'bg-primary/50' : 'bg-primary'}`}
                    onClick={() => handleApprove(p.id)}>
                    <View className="py-3 text-xl font-bold text-white flex items-center gap-1">
                      <Icon name="check" size={20} />
                      <Text>批准面世</Text>
                    </View>
                  </Button>
                  <Button type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                    onClick={() => { setRejectId(p.id); setRejectReason('') }}>
                    <View className="py-3 text-xl font-bold text-destructive flex items-center gap-1">
                      <Icon name="close" size={20} />
                      <Text>扣押不发</Text>
                    </View>
                  </Button>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 驳回弹窗 */}
      {rejectId && (
        <View className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <View className="w-full bg-card rounded-t-3xl p-6 flex flex-col gap-4">
            <View className="flex items-center justify-between">
              <Text className="text-2xl font-bold text-foreground">扣押理由</Text>
              <Button type="button" onClick={() => setRejectId(null)}>
                <Icon name="close" size={30} className="text-muted-foreground" />
              </Button>
            </View>
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-background">
              <Textarea className="w-full text-xl text-foreground bg-transparent outline-none"
                style={{ height: '20vw', minHeight: '80px' }}
                placeholder="请说明驳回原因，将通知商家..."
                value={rejectReason}
                onInput={(e) => { const ev = e as any; setRejectReason(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </View>
            <Button type="button"
              className="flex items-center justify-center leading-none rounded-xl bg-destructive w-full"
              onClick={handleReject}>
              <View className="py-4 text-xl font-bold text-white">确认扣押</View>
            </Button>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default AdminProductsPage
