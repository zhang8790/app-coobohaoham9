import { View, Button, Text } from '@tarojs/components'
// @title 退款管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import { withTimeout } from '@/utils/withTimeout'
import { maskPhone } from '@/utils/mask'
import Icon from '@/components/Icon'

type RefundRow = {
  id: string
  refund_no: string | null
  order_no: string | null
  refund_amount: number
  reason: string | null
  status: string
  reject_reason: string | null
  created_at: string
  profiles?: { nickname: string | null; phone: string | null }
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: '待审核', processing: '处理中', completed: '已完成', closed: '已关闭', abnormal: '异常',
}
const STATUS_COLORS: Record<string, string> = {
  pending_review: 'text-orange-500', processing: 'text-blue-500',
  completed: 'text-green-600', closed: 'text-gray-500', abnormal: 'text-red-500',
}
const TABS: { value: string; label: string }[] = [
  { value: 'pending_review', label: '待审核' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'closed', label: '已关闭' },
  { value: 'all', label: '全部' },
]

function AdminRefundsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('pending_review')
  const [list, setList] = useState<RefundRow[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    try {
      let q = supabase
        .from('refunds')
        .select('id,refund_no,order_no,refund_amount,reason,status,reject_reason,created_at,profiles(nickname,phone)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (tab !== 'all') q = q.eq('status', tab)
      const { data, error } = await withTimeout(q, 8000, '[admin-refunds] load timeout')
      if (error) throw error
      setList((data as RefundRow[]) || [])
    } catch (err) {
      console.error('[admin-refunds] load failed:', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [profile, authLoading, tab])

  useEffect(() => { load() }, [load])

  const handleApprove = async (r: RefundRow) => {
    Taro.showModal({
      title: '确认通过退款',
      content: `将通过 ¥${Number(r.refund_amount).toFixed(2)} 退款，请在微信商户平台完成实际退款操作`,
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(r.id)
        const { error } = await supabase.from('refunds').update({ status: 'completed' }).eq('id', r.id)
        setProcessing(null)
        if (error) { Taro.showToast({ title: '操作失败', icon: 'none' }); return }
        Taro.showToast({ title: '已通过', icon: 'success' }); load()
      }
    })
  }

  const handleReject = async (r: RefundRow) => {
    Taro.showModal({
      title: '确认驳回退款',
      content: '驳回后该退款申请将关闭，如已退款请谨慎操作',
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(r.id)
        const { error } = await supabase.from('refunds').update({ status: 'closed', reject_reason: '平台审核未通过' }).eq('id', r.id)
        setProcessing(null)
        if (error) { Taro.showToast({ title: '操作失败', icon: 'none' }); return }
        Taro.showToast({ title: '已驳回', icon: 'success' }); load()
      }
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 py-4">
        <Text className="text-3xl font-bold text-foreground">退款管理</Text>
      </View>

      {/* Tabs */}
      <View className="flex mx-4 bg-muted rounded-2xl p-1 gap-1 overflow-x-auto">
        {TABS.map(t => (
          <View key={t.value}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl text-base font-bold transition whitespace-nowrap ${tab === t.value ? 'bg-card text-primary' : 'text-muted-foreground'}`}
            onClick={() => setTab(t.value)}>
            {t.label}
          </View>
        ))}
      </View>

      {loading ? (
        <View className="flex items-center justify-center py-20">
          <Icon name="loading" size={48} className="text-primary animate-spin" />
        </View>
      ) : list.length === 0 ? (
        <View className="flex flex-col items-center justify-center py-20 gap-3">
          <Icon name="cash-refund" size={60} className="text-muted-foreground/40" />
          <Text className="text-2xl text-muted-foreground">暂无退款记录</Text>
        </View>
      ) : (
        <View className="flex flex-col gap-3 px-4 mt-4">
          {list.map(r => (
            <View key={r.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
              <View className="flex items-start justify-between">
                <View className="flex flex-col gap-1">
                  <Text className="text-2xl font-bold text-foreground">{r.profiles?.nickname || '侠客'}</Text>
                  <Text className="text-xl text-muted-foreground">{maskPhone(r.profiles?.phone) || '未知手机'}</Text>
                </View>
                <Text className="text-3xl font-black text-destructive">¥{Number(r.refund_amount).toFixed(2)}</Text>
              </View>

              <View className="bg-muted rounded-xl p-3 flex flex-col gap-2">
                <View className="flex items-center justify-between">
                  <Text className="text-xl text-muted-foreground">退款单号</Text>
                  <Text className="text-xl text-foreground font-mono">{r.refund_no || r.id.slice(0, 8)}</Text>
                </View>
                <View className="flex items-center justify-between">
                  <Text className="text-xl text-muted-foreground">关联订单</Text>
                  <Text className="text-xl text-foreground font-mono">{r.order_no || '-'}</Text>
                </View>
                {r.reason && (
                  <View className="flex items-start justify-between">
                    <Text className="text-xl text-muted-foreground">原因</Text>
                    <Text className="text-xl text-foreground flex-1 text-right ml-2">{r.reason}</Text>
                  </View>
                )}
                <View className="flex items-center justify-between">
                  <Text className="text-xl text-muted-foreground">状态</Text>
                  <Text className={`text-xl font-bold ${STATUS_COLORS[r.status] || 'text-foreground'}`}>{STATUS_LABELS[r.status] || r.status}</Text>
                </View>
                <Text className="text-base text-muted-foreground">{new Date(r.created_at).toLocaleString('zh-CN')}</Text>
              </View>

              {r.status === 'pending_review' && (
                <View className="flex flex-row gap-3">
                  <Button type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl ${processing === r.id ? 'bg-primary/50' : 'bg-primary'}`}
                    onClick={() => handleApprove(r)}>
                    <View className="py-3 text-xl font-bold text-white">通过退款</View>
                  </Button>
                  <Button type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                    onClick={() => handleReject(r)}>
                    <View className="py-3 text-xl font-bold text-destructive">驳回</View>
                  </Button>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  </RouteGuard>)
}

export default AdminRefundsPage
