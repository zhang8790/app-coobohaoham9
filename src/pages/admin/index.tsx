// @title 武林盟
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getAdminStats } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'

type Stats = { merchants: number; products: number; withdrawals: number; ugc: number }

function AdminPage() {
  const { profile, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<Stats>({ merchants: 0, products: 0, withdrawals: 0, ugc: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') {
      Taro.showToast({ title: '无权限', icon: 'none' })
      Taro.reLaunch({ url: '/pages/index/index' })
      return
    }
    setLoading(true)
    const s = await getAdminStats()
    setStats(s)
    setLoading(false)
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: '门派大典', sub: '商家入驻审核', count: stats.merchants, icon: 'i-mdi-store-check', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', url: '/pages/admin-merchants/index' },
    { label: '宝贝审阅', sub: '商品上架审核', count: stats.products, icon: 'i-mdi-package-variant-closed', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', url: '/pages/admin-products/index' },
    { label: '银票兑付', sub: '提现申请审核', count: stats.withdrawals, icon: 'i-mdi-cash-fast', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', url: '/pages/admin-withdrawals/index' },
    { label: '武林贴管理', sub: 'UGC内容管理', count: stats.ugc, icon: 'i-mdi-newspaper-variant', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', url: '/pages/admin-ugc/index' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="px-4 pt-6 pb-5" style={{ background: 'linear-gradient(135deg,#7C2D12 0%,#C2410C 100%)' }}>
        <div className="flex items-center gap-3">
          <div className="i-mdi-shield-crown text-4xl text-white" />
          <div>
            <p className="text-3xl font-black text-white">武林盟</p>
            <p className="text-xl text-orange-200">超级管理后台</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 pb-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="i-mdi-loading text-5xl text-primary animate-spin" />
            <span className="text-xl text-muted-foreground">聚气中...</span>
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground mb-4">待处理事项</p>
            <div className="grid grid-cols-2 gap-3">
              {cards.map(c => (
                <div key={c.label}
                  className={`rounded-2xl border-2 ${c.border} ${c.bg} p-4 flex flex-col gap-2`}
                  onClick={() => Taro.navigateTo({ url: c.url })}>
                  <div className="flex items-center justify-between">
                    <div className={`${c.icon} text-3xl ${c.color}`} />
                    <div className={`text-4xl font-black ${c.color}`}>{c.count}</div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{c.label}</p>
                  <p className="text-xl text-muted-foreground">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* 快捷指引 */}
            <div className="mt-6 rounded-2xl bg-card border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="i-mdi-lightning-bolt text-2xl text-primary" />
                <span className="text-2xl font-bold text-foreground">武林盟令牌</span>
              </div>
              {[
                { name: '全部数字均为待处理数量', icon: 'i-mdi-information', color: 'text-primary' },
                { name: '点击卡片进入对应审核列表', icon: 'i-mdi-cursor-pointer', color: 'text-foreground' },
                { name: '驳回操作需填写驳回理由', icon: 'i-mdi-alert-circle', color: 'text-destructive' },
              ].map(tip => (
                <div key={tip.name} className="flex items-center gap-2 py-2 border-b border-border last:border-b-0">
                  <div className={`${tip.icon} text-xl ${tip.color} flex-shrink-0`} />
                  <span className="text-xl text-muted-foreground">{tip.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(AdminPage)
