// @title 侠客
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image, Input } from '@tarojs/components'
import { getMyProfile, getMyMerchantApplication, getOrderCounts, updateProfile, getEquitySummary } from '@/db/api'
import type { EquitySummary } from '@/db/api'
import type { Profile, MerchantApplication } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import { supabase } from '@/client/supabase'

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
      { name: '消息中心', icon: 'i-mdi-bell-outline', page: '/pages/messages/index', badge: 'unread' },
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
  const [profileLoading, setProfileLoading] = useState(true)
  const [equity, setEquity] = useState<EquitySummary | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadData = useCallback(async () => {
    if (!user) { setProfileLoading(false); return }
    setProfileLoading(true)
    try {
      // 使用 Promise.race 防止请求挂起导致永远显示"加载中"
      const [p, app, counts] = await Promise.race([
        Promise.all([
          getMyProfile().catch(err => { console.error('[User] getMyProfile failed:', err); return null }),
          getMyMerchantApplication().catch(err => { console.error('[User] getMyMerchantApplication failed:', err); return null }),
          getOrderCounts().catch(err => { console.error('[User] getOrderCounts failed:', err); return {} as Record<string, number> }),
        ]),
        new Promise<[(Profile | null), (MerchantApplication | null), Record<string, number>]>(
          (_, reject) => setTimeout(() => reject(new Error('loadData timeout')), 5000)
        )
      ])
      if (p) setProfile(p)
      if (app) setApplication(app)
      if (counts) setOrderCounts(counts)
    } catch (err) {
      console.error('[User] loadData error or timeout:', err)
    } finally {
      setProfileLoading(false)
    }
  }, [user])

  // 拉取未读消息数
  const loadUnread = useCallback(async () => {
    if (!user?.id) { setUnreadCount(0); return }
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)
      setUnreadCount(count ?? 0)
    } catch (e) {
      console.warn('[User] loadUnread fail', e)
    }
  }, [user?.id])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadUnread() }, [loadUnread])
  useDidShow(() => { loadData(); loadUnread() })

  useEffect(() => {
    if (!user) return
    getEquitySummary().catch(() => null).then(eq => { if (eq) setEquity(eq) })
  }, [user])

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

  // 商家状态入口：优先用 profile.merchant_status，其次用 application.status
  // 注意：profile 未加载完成时显示 loading，避免闪烁
  const merchantStatusNode = (() => {
    if (profileLoading) return (
      <View className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
        <View className="i-mdi-loading text-2xl text-muted-foreground animate-spin" />
        <Text className="text-xl text-muted-foreground">加载中...</Text>
      </View>
    )
    const status = profile?.merchant_status || application?.status || 'none'
    if (status === 'none') return (
      <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-apply/index' })}>
        <View className="flex items-center gap-2">
          <View className="i-mdi-store-plus text-2xl text-primary" />
          <Text className="text-xl text-foreground font-bold">申请成为商家</Text>
        </View>
        <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
      </View>
    )
    if (status === 'pending') return (
      <View className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
        <View className="i-mdi-clock-outline text-2xl text-muted-foreground" />
        <Text className="text-xl text-muted-foreground">入驻申请审核中...</Text>
      </View>
    )
    return (
      <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-primary"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-center/index' })}>
        <View className="flex items-center gap-2">
          <View className="i-mdi-store-check text-2xl text-primary" />
          <Text className="text-xl text-primary font-bold">进入商家管理中心</Text>
        </View>
        <View className="i-mdi-chevron-right text-xl text-primary" />
      </View>
    )
  })()

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      {/* 顶部用户卡 */}
      <View className="px-4 pt-6 pb-4" style={{ background: 'linear-gradient(160deg,#FFF0E8 0%,#FFFBF7 80%)' }}>
        {!user ? (
          <View className="flex items-center gap-4 py-4"
            onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
            <View className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <View className="i-mdi-account text-4xl text-muted-foreground" />
            </View>
            <View>
              <Text className="text-2xl font-bold text-foreground">点击登录</Text>
              <Text className="text-xl text-muted-foreground">登录后享受完整功能</Text>
            </View>
          </View>
        ) : (
          <View className="flex items-start gap-4 py-2">
            <View className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-muted">
              {profile?.avatar_url
                ? <Image src={profile.avatar_url} mode="aspectFill" style={{ width: '64px', height: '64px' }} />
                : <View className="w-full h-full flex items-center justify-center"><View className="i-mdi-account text-4xl text-muted-foreground" /></View>}
            </View>
            <View className="flex-1">
              {editingNick ? (
                <View className="flex items-center gap-2">
                  <View className="flex-1 border-2 border-input rounded-lg px-3 py-1 bg-white">
                    <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                      value={nickInput}
                      onInput={(e: any) => { setNickInput(e.detail?.value ?? '') }} />
                  </View>
                  <View className="px-3 py-1 rounded-lg bg-primary flex items-center justify-center leading-none"
                    onClick={handleSaveNick}>
                    <View className="py-1 text-white text-xl">保存</View>
                  </View>
                </View>
              ) : (
                <View className="flex items-center gap-2">
                  <Text className="text-2xl font-bold text-foreground">{profile?.nickname || '江湖散修'}</Text>
                  <View className="w-7 h-7 flex items-center justify-center" onClick={handleRandomNick}>
                    <View className="i-mdi-shuffle text-xl text-muted-foreground" />
                  </View>
                  <View className="w-7 h-7 flex items-center justify-center"
                    onClick={() => { setNickInput(profile?.nickname || ''); setEditingNick(true) }}>
                    <View className="i-mdi-pencil text-xl text-muted-foreground" />
                  </View>
                </View>
              )}
              <View className="flex items-center gap-2 mt-1">
                <Text className="px-2 py-0.5 rounded-full text-base font-bold text-white" style={{ background: rankColor }}>
                  {profile?.member_rank || '江湖散修'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 资产行 */}
        {user && profile && (
          <View className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: '金豆', value: profile.balance || 0, icon: 'i-mdi-wallet' },
              { label: '情绪豆', value: profile.tb_balance || 0, icon: 'i-mdi-emoticon-happy' },
              { label: '优惠券', value: `${profile.coupons_count || 0}张`, icon: 'i-mdi-ticket' },
            ].map(item => (
              <View key={item.label} className="bg-card rounded-2xl flex flex-col items-center py-4 border border-border">
                <Text className="text-xl font-bold text-foreground">{item.value}</Text>
                <Text className="text-base text-muted-foreground mt-1">{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 会员权益区块 */}
      {user && profile && (
        <View className="mx-4 mt-3 rounded-2xl border border-primary/30 px-4 py-4" style={{ background: 'linear-gradient(120deg,#FFF7ED 0%,#FFEDD5 100%)' }}>
          <View className="flex items-center justify-between">
            <Text className="text-xl font-bold text-foreground">我的会员权益</Text>
            <Text className="text-base text-primary font-bold"
              onClick={() => Taro.navigateTo({ url: '/pages/emotion-bill/index' })}>确权记录 ›</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: '12px' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#C2410C' }}>
                {equity ? (equity.shareRatio * 100 < 0.01 ? (equity.shareRatio * 100).toFixed(4) : (equity.shareRatio * 100).toFixed(2)) + '%' : '0%'}
              </Text>
              <Text style={{ fontSize: '12px', color: '#9A8070', display: 'block' }}>我的消费贡献占比</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#C2410C' }}>
                {equity ? (equity.dividendEstimate || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '0'}
              </Text>
              <Text style={{ fontSize: '12px', color: '#9A8070', display: 'block' }}>年度消费回馈（非现金分红）</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>{profile.cv_total || 0}</Text>
              <Text style={{ fontSize: '12px', color: '#9A8070', display: 'block' }}>我的贡献值</Text>
            </View>
          </View>
        </View>
      )}

      {/* 订单统计 */}
      {user && (
        <View className="mx-4 mt-4 bg-card rounded-2xl border border-border">
          <View className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Text className="text-xl font-bold text-foreground">我的订单</Text>
            <View className="flex items-center gap-1 text-primary text-xl"
              onClick={() => Taro.navigateTo({ url: '/pages/order-center/index' })}>
              <Text>全部</Text>
              <View className="i-mdi-chevron-right text-xl" />
            </View>
          </View>
          <View className="grid grid-cols-5 py-3">
            {ORDER_STATUS_TABS.map(tab => (
              <View key={tab.key} className="flex flex-col items-center gap-1 py-2 relative"
                onClick={() => Taro.navigateTo({ url: `/pages/order-center/index?tab=${tab.key}` })}>
                <View className={`${tab.icon} text-3xl text-foreground`} />
                {orderCounts[tab.key] > 0 && (
                  <View className="absolute top-1 right-4 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Text className="text-white text-xs">{orderCounts[tab.key]}</Text>
                  </View>
                )}
                <Text className="text-base text-muted-foreground">{tab.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 侠客中心 */}
      {user && (
        <View className="mx-4 mt-4 bg-card rounded-2xl border border-border">
          <View className="flex items-center px-4 py-3 border-b border-border gap-2">
            <View className="i-mdi-sword text-2xl text-primary" />
            <Text className="text-xl font-bold text-foreground">侠客中心</Text>
          </View>
          <View className="grid grid-cols-4 py-3">
            {[
              { name: '我的段位', icon: '🏅', page: '/pages/my-promotion/index', desc: '查看推广码' },
              { name: '我的佣金', icon: '💰', page: '/pages/withdraw/index', desc: '提现管理' },
              { name: '我的好友', icon: '👥', page: '/pages/my-referrals/index', desc: '查看推荐' },
              { name: '情绪账单', icon: '🎭', page: '/pages/emotion-bill/index', desc: '确权集' },
            ].map(item => (
              <View key={item.name}
                hoverClass="none"
                onClick={() => {
                  console.log('[User] 点击:', item.name, '→', item.page)
                  Taro.navigateTo({ url: item.page })
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px 0',
                  gap: '8px'}}>
                <Text style={{ fontSize: '32px' }}>{item.icon}</Text>
                <Text style={{ fontSize: '14px', color: '#333', fontWeight: 'bold' }}>{item.name}</Text>
                <Text style={{ fontSize: '12px', color: '#999' }}>{item.desc}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 商家申请入口 */}
      {user && (
        <View className="mx-4 mt-4">
          {merchantStatusNode}
        </View>
      )}

      {/* 功能菜单组 */}
      {MENU_GROUPS.map(group => (
        <View key={group.title} className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <View className={`${group.icon} text-2xl text-primary`} />
            <Text className="text-xl font-bold text-foreground">{group.title}</Text>
          </View>
          {group.items.map(item => (
            <View key={item.name} className="flex items-center gap-3 px-4 py-4 border-b border-border last:border-0"
              onClick={() => item.page ? Taro.navigateTo({ url: item.page }) : Taro.showToast({ title: '功能开发中', icon: 'none' })}>
              <View className={`${item.icon} text-2xl text-foreground`} />
              <Text className="flex-1 text-xl text-foreground">{item.name}</Text>
              {item.badge === 'unread' && unreadCount > 0 && (
                <View style={{
                  minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
                  background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{ color: 'white', fontSize: 11, fontWeight: 600, lineHeight: '20px' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
              <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
            </View>
          ))}
        </View>
      ))}

      {/* 退出登录 */}
      {user && (
        <View className="mx-4 mt-4">
          <View
            className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
            onClick={handleSignOut}>
            <View className="py-4 text-xl text-muted-foreground">退出登录</View>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default UserPage
