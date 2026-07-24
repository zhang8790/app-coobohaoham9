// @title 金豆明细
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'
import { getMyTongbaoLogs, getMyProfile } from '@/db/api'
import type { TongbaoLog } from '@/db/types'
import Icon from '@/components/Icon'
import { formatDateTime } from '@/utils/format'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'

const TYPE_LABEL: Record<string, string> = {
  purchase_spend: '消费支出',
  refund_return: '退款返还',
  recharge: '充值',
  admin_grant: '平台发放',
  admin_deduct: '平台扣除',
  purchase_earn: '购物返豆',
  refund_deduct: '退款扣回',
  commission_earn: '佣金收益',
}

const TYPE_COLOR: Record<string, string> = {
  purchase_spend: '#EF4444',
  refund_return: '#10B981',
  recharge: '#3B82F6',
  admin_grant: '#10B981',
  admin_deduct: '#EF4444',
  purchase_earn: '#F59E0B',
  refund_deduct: '#EF4444',
  commission_earn: '#10B981',
}


const PAGE_SIZE = 20

type Tab = 'all' | 'income' | 'expense'

function TongbaoLedgerPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<TongbaoLog[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  const load = useCallback(async (reset = false, activeTab: Tab = tab) => {
    if (!user) { setLoading(false); return }
    if (reset) { setPage(0); setHasMore(true) }
    const p = reset ? 0 : page
    setLoading(true)
    try {
      const [logs, profile] = await Promise.all([
        getMyTongbaoLogs(p, PAGE_SIZE),
        getMyProfile().catch(() => null),
      ])
      setBalance((profile as any)?.tb_balance ?? 0)
      if (reset) {
        setItems(logs)
      } else {
        setItems(prev => [...prev, ...logs])
      }
      setHasMore(logs.length === PAGE_SIZE)
      if (logs.length === PAGE_SIZE) setPage(p + 1)
    } catch (e) {
      console.error('[TongbaoLedger] load', e)
    } finally {
      setLoading(false)
    }
  }, [user, page, tab])

  useEffect(() => { load(true) }, [load])
  useDidShow(() => { load(true) })
  usePullDownRefresh(() => { load(true).then(() => Taro.stopPullDownRefresh()) })

  const filtered = useMemo(() => {
    if (tab === 'all') return items
    return items.filter(it => {
      if (tab === 'income') return it.delta > 0
      return it.delta < 0
    })
  }, [items, tab])

  const incomeTotal = useMemo(() => items.filter(it => it.delta > 0).reduce((s, it) => s + it.delta, 0), [items])
  const expenseTotal = useMemo(() => items.filter(it => it.delta < 0).reduce((s, it) => s + it.delta, 0), [items])

  const onScrollToLower = () => {
    if (!loading && hasMore) load(false)
  }

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background" onScrollToLower={onScrollToLower}>
        {/* 顶部汇总 */}
        <View className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #A8552E, #A8552E)' }}>
          <View className="px-4 pt-5 pb-3">
            <Text className="text-white/80 text-base">当前金豆余额</Text>
            <Text className="text-white text-4xl font-black mt-1">{balance.toFixed(2)}</Text>
          </View>
          <View className="grid grid-cols-2 py-4 border-t border-white/20">
            <View className="flex flex-col items-center gap-1 border-r border-white/20">
              <Text className="text-2xl font-black text-white">+{incomeTotal.toFixed(2)}</Text>
              <Text className="text-base text-white/80">累计收益</Text>
            </View>
            <View className="flex flex-col items-center gap-1">
              <Text className="text-2xl font-black text-white">{expenseTotal.toFixed(2)}</Text>
              <Text className="text-base text-white/80">累计支出</Text>
            </View>
          </View>
        </View>

        {/* Tab */}
        <View className="flex mx-4 mt-4 bg-muted rounded-2xl p-1">
          {([['all', '全部'], ['income', '收益'], ['expense', '支出']] as const).map(([key, label]) => (
            <View key={key}
              className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xl font-bold transition ${tab === key ? 'bg-card text-primary' : 'text-muted-foreground'}`}
              onClick={() => { setTab(key); load(true, key) }}>
              {label}
            </View>
          ))}
        </View>

        {/* 列表 */}
        <View className="px-4 mt-4 pb-8">
          {loading && items.length === 0 ? (
            <Skeleton count={4} height={56} rounded="rounded-xl" className="px-4 mt-4" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Icon name="cash-remove" size={60} className="text-muted-foreground/30" />}
              title="暂无金豆明细"
              description="佣金、充值、消费都会在这里记录"
            />
          ) : (
            <View className="flex flex-col gap-3">
              {filtered.map(it => {
                const isIncome = it.delta > 0
                const sign = isIncome ? '+' : ''
                return (
                  <View key={it.id} className="bg-card rounded-2xl p-4 border border-border">
                    <View className="flex items-center justify-between">
                      <View className="flex items-center gap-3">
                        <View className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: (TYPE_COLOR[it.type] || '#6B7280') + '20' }}>
                          <Icon name={isIncome ? 'arrow-down' : 'arrow-up'} size={20} className="text-xl" style={{ color: TYPE_COLOR[it.type] || '#6B7280' }} />
                        </View>
                        <View>
                          <Text className="text-lg font-bold text-foreground">{TYPE_LABEL[it.type] || it.type}</Text>
                          <Text className="text-sm text-muted-foreground mt-0.5">{formatDateTime(it.created_at)}</Text>
                        </View>
                      </View>
                      <View className="text-right">
                        <Text className="text-xl font-black" style={{ color: isIncome ? '#10B981' : '#EF4444' }}>{sign}{it.delta.toFixed(2)}</Text>
                        <Text className="text-xs text-muted-foreground mt-0.5">余额 {it.balance_after.toFixed(2)}</Text>
                      </View>
                    </View>
                    {it.remark && (
                      <Text className="text-sm text-muted-foreground mt-2 pt-2 border-t border-border">{it.remark}</Text>
                    )}
                    {it.order_id && (
                      <Text className="text-xs text-muted-foreground mt-1 font-mono">订单 {it.order_id.slice(0, 12)}</Text>
                    )}
                  </View>
                )
              })}
              {hasMore && (
                <View className="flex justify-center py-4">
                  <Button type="button" className="text-muted-foreground text-base" onClick={() => load(false)}>
                    {loading ? '加载中…' : '加载更多'}
                  </Button>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </RouteGuard>
  )
}

export default TongbaoLedgerPage
