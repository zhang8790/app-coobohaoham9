import { View, Text } from '@tarojs/components'
// @title 武林盟
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getAdminStats } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

type Stats = { merchants: number; products: number; withdrawals: number; ugc: number }

function AdminPage() {
  const { profile, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<Stats>({ merchants: 0, products: 0, withdrawals: 0, ugc: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (authLoading) return
    // 关键修复:AuthContext 先 setLoading(false) 再异步 setProfile,存在竞态窗口。
    // profile 为 null 时不能用 profile?.role 误判"无权限"并 reLaunch,否则真实 admin 也会被踢回首页。
    // 必须等 profile 就绪后再判断权限。
    if (!profile) return
    if (profile.role !== 'admin') {
      Taro.showToast({ title: '无权限', icon: 'none' })
      Taro.reLaunch({ url: '/pages/index/index' })
      return
    }
    setLoading(true)
    try {
      const s = await Promise.race([
        getAdminStats(),
        new Promise<Stats>((_, reject) => 
          setTimeout(() => reject(new Error('getAdminStats timeout')), 5000)
        )
      ])
      setStats(s)
    } catch (err) {
      console.error('[Admin] getAdminStats failed:', err)
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: '门派大典', sub: '自营门店审核', count: stats.merchants, icon: '🏪', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', url: '/pages/admin/admin/admin-merchants/index' },
    { label: '宝贝审阅', sub: '商品上架审核', count: stats.products, icon: '📦', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', url: '/pages/admin/admin/admin-products/index' },
    { label: '佣金兑付', sub: '提现申请审核', count: stats.withdrawals, icon: '💰', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', url: '/pages/admin/admin/admin-withdrawals/index' },
    { label: '武林贴管理', sub: 'UGC内容管理', count: stats.ugc, icon: '📰', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', url: '/pages/admin/admin/admin-ugc/index' },
  ]

  const platformCards = [
    { label: '用户管理', sub: '用户/管理员权限', icon: '👤', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', url: '/pages/admin/admin/admin-users/index' },
    { label: '退款管理', sub: '处理退款申请', icon: '💰', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', url: '/pages/admin/admin/admin-refunds/index' },
    { label: '公告管理', sub: '发布/管理公告', icon: '📢', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', url: '/pages/admin/admin/admin-announcements/index' },
  ]

  return (<RouteGuard>
    <View className="min-h-screen bg-background">
      {/* 导航 */}
      <View className="flex items-center px-4 pt-4 pb-2">
        <View className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
          <Icon name="arrow-left" size={24} className="text-foreground" />
        </View>
        <View className="flex-1 text-center text-xl font-bold text-foreground pr-10">武林盟</View>
      </View>

      {/* 头部 */}
      <View className="px-4 pt-4 pb-5" style={{ background: 'linear-gradient(135deg,#7C2D12 0%,#A8552E 100%)' }}>
        <View className="flex items-center gap-3">
          <Icon name="shield-crown" size={36} className="text-white" />
          <View>
            <Text className="text-3xl font-black text-white">武林盟</Text>
            <Text className="text-xl text-orange-200">超级管理后台</Text>
          </View>
        </View>
      </View>

      <View className="px-4 pt-5 pb-10">
        {loading ? (
          <View className="flex flex-col items-center justify-center py-20 gap-3">
            <Icon name="loading" size={48} className="text-primary animate-spin" />
            <Text className="text-xl text-muted-foreground">聚气中...</Text>
          </View>
        ) : (
          <>
            <Text className="text-2xl font-bold text-foreground mb-4">待处理事项</Text>
            <View className="grid grid-cols-2 gap-3">
              {cards.map(c => (
                <View key={c.label}
                  className={`rounded-2xl border-2 ${c.border} ${c.bg} p-4 flex flex-col gap-2`}
                  onClick={() => Taro.navigateTo({ url: c.url })}>
                  <View className="flex items-center justify-between">
                    <View className={`${c.icon} text-3xl ${c.color}`} />
                    <View className={`text-4xl font-black ${c.color}`}>{c.count}</View>
                  </View>
                  <Text className="text-2xl font-bold text-foreground">{c.label}</Text>
                  <Text className="text-xl text-muted-foreground">{c.sub}</Text>
                </View>
              ))}
            </View>

            {/* 平台管理 */}
            <Text className="text-2xl font-bold text-foreground mt-6 mb-4">平台管理</Text>
            <View className="grid grid-cols-2 gap-3">
              {platformCards.map(c => (
                <View key={c.label}
                  className={`rounded-2xl border-2 ${c.border} ${c.bg} p-4 flex flex-col gap-2`}
                  onClick={() => Taro.navigateTo({ url: c.url })}>
                  <View className={`${c.icon} text-3xl ${c.color}`} />
                  <Text className="text-2xl font-bold text-foreground">{c.label}</Text>
                  <Text className="text-xl text-muted-foreground">{c.sub}</Text>
                </View>
              ))}
            </View>

            {/* 快捷指引 */}
            <View className="mt-6 rounded-2xl bg-card border border-border p-4">
              <View className="flex items-center gap-2 mb-3">
                <Icon name="lightning-bolt" size={24} className="text-primary" />
                <Text className="text-2xl font-bold text-foreground">武林盟令牌</Text>
              </View>
              {[
                { name: '全部数字均为待处理数量', icon: 'ⓘ', color: 'text-primary' },
                { name: '点击卡片进入对应审核列表', icon: '➤', color: 'text-foreground' },
                { name: '驳回操作需填写驳回理由', icon: '⚠', color: 'text-destructive' },
              ].map(tip => (
                <View key={tip.name} className="flex items-center gap-2 py-2 border-b border-border last:border-b-0">
                  <View className={`${tip.icon} text-xl ${tip.color} flex-shrink-0`} />
                  <Text className="text-xl text-muted-foreground">{tip.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default AdminPage
