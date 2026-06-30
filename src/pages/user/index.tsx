// @title 侠客
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getMyProfile, getMyMerchantApplication, getOrderCounts, updateProfile } from '@/db/api'
import type { Profile, MerchantApplication } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'

const WUXIA_NAMES = ['剑影飘鸿', '凌云一笑', '碧落寒烟', '寒光碎月', '幽谷清风', '紫电青霜', '千机云鹤', '翠微长啸', '玉骨冰心', '逍遥散人']
const RANK_COLORS: Record<string, string> = { '江湖散修': '#78350F', '外门弟子': '#B45309', '内门弟子': '#92400E', '核心弟子': '#C2410C', '长老': '#9333EA', '掌门': '#DC2626' }

const MENU_GROUPS = [
  {
    title: '侠客令',
    icon: 'i-mdi-sword',
    items: [
      { name: '全部订单', icon: 'i-mdi-clipboard-list', page: '/pages/order-center/index' },
      { name: '地址管理', icon: 'i-mdi-map-marker', page: '/pages/address/index' },
      { name: '优惠券', icon: 'i-mdi-ticket-percent', page: '/pages/coupon/index' },
    ]
  },
  {
    title: '珍宝库',
    icon: 'i-mdi-treasure-chest',
    items: [
      { name: '我的收藏', icon: 'i-mdi-heart', page: '/pages/favorites/index' },
      { name: '浏览足迹', icon: 'i-mdi-history', page: '/pages/footprint/index' },
    ]
  },
  {
    title: '江湖事',
    icon: 'i-mdi-account-group',
    items: [
      { name: '邀请好友', icon: 'i-mdi-gift', page: '/pages/my-promotion/index' },
      { name: '帮助中心', icon: 'i-mdi-help-circle', page: '/pages/help/index' },
      { name: '设置', icon: 'i-mdi-cog', page: '/pages/settings/index' },
    ]
  }
]

const ORDER_STATUS_TABS = [
  { key: 'pending_pay', label: '待付款', icon: 'i-mdi-clock-outline' },
  { key: 'pending_ship', label: '待发货', icon: 'i-mdi-package-variant' },
  { key: 'pending_receive', label: '待收货', icon: 'i-mdi-truck-delivery' },
  { key: 'pending_review', label: '待评价', icon: 'i-mdi-star-outline' },
  { key: 'after_sale', label: '售后', icon: 'i-mdi-refresh' },
]

function UserPage() {
  const { user, profile: ctxProfile, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [application, setApplication] = useState<MerchantApplication | null>(null)
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({})
  const [editingNick, setEditingNick] = useState(false)
  const [nickInput, setNickInput] = useState('')

  const loadData = useCallback(async () => {
    if (!user) return
    const [p, app, counts] = await Promise.all([
      getMyProfile(), getMyMerchantApplication(), getOrderCounts()
    ])
    setProfile(p)
    setApplication(app)
    setOrderCounts(counts)
  }, [user])

  useEffect(() => { loadData() }, [loadData])
  useDidShow(() => { loadData() })

  const rankColor = profile ? (RANK_COLORS[profile.member_rank] || '#78350F') : '#78350F'

  const handleRandomNick = async () => {
    const nick = WUXIA_NAMES[Math.floor(Math.random() * WUXIA_NAMES.length)]
    await updateProfile({ nickname: nick })
    setProfile(prev => prev ? { ...prev, nickname: nick } : prev)
    Taro.showToast({ title: '侠号已更换', icon: 'success' })
  }

  const handleSaveNick = async () => {
    if (!nickInput.trim()) return
    await updateProfile({ nickname: nickInput.trim() })
    setProfile(prev => prev ? { ...prev, nickname: nickInput.trim() } : prev)
    setEditingNick(false)
    Taro.showToast({ title: '侠号已保存', icon: 'success' })
  }

  const handleSignOut = async () => {
    Taro.showModal({ title: '退出登录', content: '确认退出当前账号？', success: async (res) => {
      if (res.confirm) { await signOut(); Taro.reLaunch({ url: '/pages/login/index' }) }
    }})
  }

  const isAdmin = profile?.role === 'admin'

  const merchantStatusNode = useMemo(() => {
    const status = profile?.merchant_status || application?.status || 'none'
    if (status === 'none') return (
      <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-apply/index' })}>
        <div className="flex items-center gap-2">
          <div className="i-mdi-store-plus text-2xl text-primary" />
          <span className="text-xl text-foreground font-bold">申请成为商家</span>
        </div>
        <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
      </div>
    )
    if (status === 'pending') return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
        <div className="i-mdi-clock-outline text-2xl text-muted-foreground" />
        <span className="text-xl text-muted-foreground">入驻申请审核中...</span>
      </div>
    )
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-primary"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-center/index' })}>
        <div className="flex items-center gap-2">
          <div className="i-mdi-store-check text-2xl text-primary" />
          <span className="text-xl text-primary font-bold">进入商家管理中心</span>
        </div>
        <div className="i-mdi-chevron-right text-xl text-primary" />
      </div>
    )
  }, [profile?.merchant_status, application])

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* 顶部用户卡 */}
      <div className="px-4 pt-6 pb-4" style={{ background: 'linear-gradient(160deg,#FFF0E8 0%,#FFFBF7 80%)' }}>
        {!user ? (
          <div className="flex items-center gap-4 py-4"
            onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <div className="i-mdi-account text-4xl text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">点击登录</p>
              <p className="text-xl text-muted-foreground">登录后享受完整功能</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4 py-2">
            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-muted">
              {profile?.avatar_url
                ? <Image src={profile.avatar_url} mode="aspectFill" style={{ width: '64px', height: '64px' }} />
                : <div className="w-full h-full flex items-center justify-center"><div className="i-mdi-account text-4xl text-muted-foreground" /></div>}
            </div>
            <div className="flex-1">
              {editingNick ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-2 border-input rounded-lg px-3 py-1 bg-white">
                    <input className="w-full text-xl text-foreground bg-transparent outline-none"
                      value={nickInput}
                      onInput={(e) => { const ev = e as any; setNickInput(ev.detail?.value ?? ev.target?.value ?? '') }} />
                  </div>
                  <button type="button" className="px-3 py-1 rounded-lg bg-primary flex items-center justify-center leading-none"
                    onClick={handleSaveNick}>
                    <div className="py-1 text-white text-xl">保存</div>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-foreground">{profile?.nickname || '江湖散修'}</span>
                  <button type="button" className="w-7 h-7 flex items-center justify-center" onClick={handleRandomNick}>
                    <div className="i-mdi-shuffle text-xl text-muted-foreground" />
                  </button>
                  <button type="button" className="w-7 h-7 flex items-center justify-center"
                    onClick={() => { setNickInput(profile?.nickname || ''); setEditingNick(true) }}>
                    <div className="i-mdi-pencil text-xl text-muted-foreground" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded-full text-base font-bold text-white" style={{ background: rankColor }}>
                  {profile?.member_rank || '江湖散修'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 资产行 */}
        {user && profile && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: '积分', value: profile.points, icon: 'i-mdi-star-circle' },
              { label: '余额', value: `¥${profile.balance.toFixed(2)}`, icon: 'i-mdi-wallet' },
              { label: '优惠券', value: `${profile.coupons_count}张`, icon: 'i-mdi-ticket' },
            ].map(item => (
              <div key={item.label} className="bg-card rounded-2xl flex flex-col items-center py-4 border border-border">
                <span className="text-xl font-bold text-foreground">{item.value}</span>
                <span className="text-base text-muted-foreground mt-1">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 订单统计 */}
      {user && (
        <div className="mx-4 mt-4 bg-card rounded-2xl border border-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-xl font-bold text-foreground">我的订单</span>
            <div className="flex items-center gap-1 text-primary text-xl"
              onClick={() => Taro.navigateTo({ url: '/pages/order-center/index' })}>
              <span>全部</span>
              <div className="i-mdi-chevron-right text-xl" />
            </div>
          </div>
          <div className="grid grid-cols-5 py-3">
            {ORDER_STATUS_TABS.map(tab => (
              <div key={tab.key} className="flex flex-col items-center gap-1 py-2 relative"
                onClick={() => Taro.navigateTo({ url: `/pages/order-center/index?tab=${tab.key}` })}>
                <div className={`${tab.icon} text-3xl text-foreground`} />
                {orderCounts[tab.key] > 0 && (
                  <div className="absolute top-1 right-4 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-white text-xs">{orderCounts[tab.key]}</span>
                  </div>
                )}
                <span className="text-base text-muted-foreground">{tab.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 侠客中心 */}
      {user && (
        <div className="mx-4 mt-4 bg-card rounded-2xl border border-border">
          <div className="flex items-center px-4 py-3 border-b border-border gap-2">
            <div className="i-mdi-sword text-2xl text-primary" />
            <span className="text-xl font-bold text-foreground">侠客中心</span>
          </div>
          <div className="grid grid-cols-4 py-3">
            {[
              { name: '我的段位', icon: 'i-mdi-medal', page: '/pages/my-promotion/index' },
              { name: '我的佣金', icon: 'i-mdi-cash-multiple', page: '/pages/my-promotion/index' },
              { name: '分销团队', icon: 'i-mdi-account-group', page: '/pages/my-promotion/index' },
              { name: '邀请有礼', icon: 'i-mdi-gift', page: '/pages/my-promotion/index' },
            ].map(item => (
              <div key={item.name} className="flex flex-col items-center gap-2 py-2"
                onClick={() => Taro.navigateTo({ url: item.page })}>
                <div className={`${item.icon} text-3xl text-primary`} />
                <span className="text-base text-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 商家申请入口 */}
      {user && (
        <div className="mx-4 mt-4">
          {merchantStatusNode}
        </div>
      )}

      {/* 推广入口 */}
      {user && (
        <div className="mx-4 mt-4 px-4 py-4 rounded-2xl bg-card border border-primary/30 flex items-center justify-between"
          onClick={() => Taro.navigateTo({ url: '/pages/my-promotion/index' })}>
          <div className="flex items-center gap-2">
            <div className="i-mdi-bullhorn text-2xl text-primary" />
            <span className="text-xl font-bold text-foreground">侠客推广中心</span>
            <span className="text-xl text-muted-foreground">· 我的推广码</span>
          </div>
          <div className="i-mdi-chevron-right text-xl text-primary" />
        </div>
      )}

      {/* 提现管理入口 */}
      {user && (
        <div className="mx-4 mt-3 px-4 py-4 rounded-2xl bg-card border border-border flex items-center justify-between"
          onClick={() => Taro.navigateTo({ url: '/pages/withdraw/index' })}>
          <div className="flex items-center gap-2">
            <div className="i-mdi-cash-fast text-2xl text-primary" />
            <span className="text-xl font-bold text-foreground">提现管理</span>
            <span className="text-xl text-muted-foreground">· 佣金提现</span>
          </div>
          <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
        </div>
      )}

      {/* 功能菜单组 */}
      {MENU_GROUPS.map(group => (
        <div key={group.title} className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <div className={`${group.icon} text-2xl text-primary`} />
            <span className="text-xl font-bold text-foreground">{group.title}</span>
          </div>
          {group.items.map(item => (
            <div key={item.name} className="flex items-center gap-3 px-4 py-4 border-b border-border last:border-0"
              onClick={() => item.page ? Taro.navigateTo({ url: item.page }) : Taro.showToast({ title: '功能开发中', icon: 'none' })}>
              <div className={`${item.icon} text-2xl text-foreground`} />
              <span className="flex-1 text-xl text-foreground">{item.name}</span>
              <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
            </div>
          ))}
        </div>
      ))}

      {/* 武林盟管理后台入口（仅 admin 可见） */}
      {user && isAdmin && (
        <div className="mx-4 mt-4 px-4 py-4 rounded-2xl border-2 border-primary bg-primary/5 flex items-center justify-between"
          onClick={() => Taro.navigateTo({ url: '/pages/admin/index' })}>
          <div className="flex items-center gap-3">
            <div className="i-mdi-shield-crown text-3xl text-primary" />
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-primary">武林盟</span>
              <span className="text-xl text-muted-foreground">超级管理后台</span>
            </div>
          </div>
          <div className="i-mdi-chevron-right text-2xl text-primary" />
        </div>
      )}

      {/* 退出登录 */}
      {user && (
        <div className="mx-4 mt-4">
          <button type="button"
            className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
            onClick={handleSignOut}>
            <div className="py-4 text-xl text-muted-foreground">退出登录</div>
          </button>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(UserPage)
