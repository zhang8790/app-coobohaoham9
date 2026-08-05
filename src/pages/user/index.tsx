// @title 我的
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image, Input } from '@tarojs/components'
import { getMyProfile, getMyMerchantApplication, getOrderCounts, updateProfile, getOrders, getProductsByIds } from '@/db/api'
import type { Profile, MerchantApplication } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import Icon from '@/components/Icon'
import BrandSymbol from '@/components/BrandSymbol'
import RankProgress from '@/components/RankProgress'
import { RANK_COLOR_MAP } from '@/constants/ranks'
import { buildRadarProfile, type RadarDim } from '@/utils/food-therapy/radar-profile'
import { getCurrentTerm } from '@/utils/seasonal-box'
import RadarChart from '@/components/food/RadarChart'
import { NAV, USER_SERVICE_CENTER } from '@/config/nav-registry'

const NEUTRAL_NICKNAMES = ['小确幸', '慢生活', '元气满满', '暖洋洋', '甜豆豆', '乐悠悠', '小欢喜', '轻飘飘', '棉花糖', '微醺猫']

type MenuItem = { name: string; icon: string; iconName?: string; page?: string }

// 服务中心分组统一从导航登记册生成，杜绝与首页同名目的地出现不同标签
// （原「食养服务中心」与首页「食养中心」指向同一页面，现已统一为登记册中的规范 label）
const SERVICE_CENTER_ITEMS: MenuItem[] = USER_SERVICE_CENTER.map(id => {
  const e = NAV[id]
  return { name: e.label, icon: e.emoji, page: e.url }
})

const MENU_GROUPS: { title: string; icon: string; items: MenuItem[] }[] = [
  {
    title: '我的账户',
    icon: '👤',
    items: [
      { name: '我的段位', icon: 'medal', page: '/pages/mine/my-promotion/index' },
      { name: '我的好友', icon: 'account-group', page: '/pages/mine/my-referrals/index' },
      { name: '食品管家', icon: '⏰', page: '/pages/food/tracker/index' },
      { name: '地址管理', icon: '🗺', page: '/pages/mine/address/index' },
    ]
  },
  {
    title: '珍宝库',
    icon: '◆',
    items: [
      { name: '商品收藏', icon: '❤', page: '/pages/mine/favorites/index' },
      { name: '浏览足迹', icon: '⟲', page: '/pages/mine/footprint/index' },
      { name: '我的徽章', icon: '🏅', page: '/pages/mine/my-badges/index' },
    ]
  },
  {
    title: '服务中心',
    icon: '🛎',
    items: SERVICE_CENTER_ITEMS,
  },
  {
    title: '设置',
    icon: '⚙',
    items: [
      { name: '设置', icon: '⚙', page: '/pages/mine/settings/index' },
    ]
  },
]

const ORDER_STATUS_TABS = [
  { key: 'pending_pay', label: '待付款', icon: '🕐' },
  { key: 'pending_ship', label: '待发货', icon: '📦' },
  { key: 'pending_receive', label: '待收货', icon: '🚚' },
  { key: 'pending_review', label: '待评价', icon: '★' },
  { key: 'after_sale', label: '售后', icon: '⟳' },
]

function UserPage() {
  const { user, profile: ctxProfile, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [application, setApplication] = useState<MerchantApplication | null>(null)
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({})
  const [editingNick, setEditingNick] = useState(false)
  const [nickInput, setNickInput] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  // 消费偏好雷达图
  const [radarDims, setRadarDims] = useState<RadarDim[]>([])
  const [radarSummary, setRadarSummary] = useState('')
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarHasData, setRadarHasData] = useState(false)
  const [radarBought, setRadarBought] = useState(0)

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

  // 消费偏好雷达图：已购商品 → 六维；24h 缓存
  const loadRadar = useCallback(async () => {
    if (!user?.id) return
    const cacheKey = `radar_v1_${user.id}`
    try {
      const cached = Taro.getStorageSync(cacheKey)
      if (cached && cached.ts && Date.now() - cached.ts < 24 * 3600 * 1000) {
        setRadarDims(cached.dims)
        setRadarSummary(cached.summary)
        setRadarHasData(cached.hasData)
        setRadarBought(cached.bought)
        return
      }
    } catch { /* ignore cache read */ }

    setRadarLoading(true)
    try {
      const orders = await getOrders().catch(() => [])
      const ids: string[] = []
      for (const o of orders) {
        for (const it of (o as any).order_items || []) {
          if (it?.product_id) ids.push(it.product_id)
        }
      }
      const products = await getProductsByIds(ids).catch(() => [])
      const profile = buildRadarProfile(products, getCurrentTerm())
      setRadarDims(profile.dims)
      setRadarSummary(profile.summary)
      setRadarHasData(profile.hasData)
      setRadarBought(profile.boughtCount)
      try {
        Taro.setStorageSync(cacheKey, {
          ts: Date.now(),
          dims: profile.dims,
          summary: profile.summary,
          hasData: profile.hasData,
          bought: profile.boughtCount,
        })
      } catch { /* ignore cache write */ }
    } catch (e) {
      console.warn('[User] loadRadar fail', e)
    } finally {
      setRadarLoading(false)
    }
  }, [user?.id])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadUnread() }, [loadUnread])
  useEffect(() => { loadRadar() }, [loadRadar])
  useDidShow(() => { loadData(); loadUnread(); loadRadar() })

  const rankColor = profile ? (RANK_COLOR_MAP[profile.member_rank] || '#78350F') : '#78350F'

  const handleRandomNick = async () => {
    const nick = NEUTRAL_NICKNAMES[Math.floor(Math.random() * NEUTRAL_NICKNAMES.length)]
    await updateProfile({ nickname: nick })
    setProfile(prev => prev ? { ...prev, nickname: nick } : prev)
    Taro.showToast({ title: '喜号已更换', icon: 'success' })
  }

  const handleSaveNick = async () => {
    if (!nickInput.trim()) return
    await updateProfile({ nickname: nickInput.trim() })
    setProfile(prev => prev ? { ...prev, nickname: nickInput.trim() } : prev)
    setEditingNick(false)
    Taro.showToast({ title: '喜号已保存', icon: 'success' })
  }

  const handleSignOut = async () => {
    Taro.showModal({ title: '退出登录', content: '确认退出当前账号？', success: async (res) => {
      if (res.confirm) {
        await signOut()
        // 用 navigateTo 而非 reLaunch：保留上一页栈，微信胶囊才能显示返回箭头，避免"登录返回无效"
        Taro.navigateTo({ url: '/pages/login/index' })
      }
    }})
  }

  // 商家状态入口：优先用 profile.merchant_status，其次用 application.status
  // 注意：profile 未加载完成时显示 loading，避免闪烁
  const merchantStatusNode = (() => {
    if (profileLoading) return (
      <View className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
        <Icon name="loading" size={24} className="text-muted-foreground animate-spin" />
        <Text className="text-xl text-muted-foreground">加载中...</Text>
      </View>
    )
    const status = profile?.merchant_status || application?.status || 'none'
    if (status === 'none') return (
      <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-apply/index' })}>
        <View className="flex items-center gap-2">
          <Icon name="store-plus" size={24} className="text-primary" />
          <Text className="text-xl text-foreground font-bold">申请开通自营门店</Text>
        </View>
        <Icon name="chevron-right" size={20} className="text-muted-foreground" />
      </View>
    )
    if (status === 'pending') return (
      <View className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
        <Icon name="clock-outline" size={24} className="text-muted-foreground" />
        <Text className="text-xl text-muted-foreground">自营门店申请审核中...</Text>
      </View>
    )
    return (
      <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-primary"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-center/index' })}>
        <View className="flex items-center gap-2">
          <Icon name="store-check" size={24} className="text-primary" />
          <Text className="text-xl text-primary font-bold">进入自营门店管理中心</Text>
        </View>
        <Icon name="chevron-right" size={20} className="text-primary" />
      </View>
    )
  })()

  return (
    <>
    <View className="min-h-screen bg-background tabbar-pad">
      {/* 顶部用户卡 */}
      {/* 顶部用户卡 */}
      <View className="px-4 pt-6 pb-4 relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#F5EEDF 0%,#FFFBF7 80%)' }}>
        {/* 超级符号水印：放大镜查配料 —— 品牌视觉锤，降低传播成本 */}
        <Icon name="brand-detect" size={170} className="text-primary"
          style={{ position: 'absolute', right: -36, top: -28, opacity: 0.08, pointerEvents: 'none' }} />
        {/* 品牌 slogan 行 */}
        <BrandSymbol size={22} withSlogan className="mb-3" />
        {!user ? (
          <View className="flex items-center gap-4 py-4"
            onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
            <View className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Icon name="account" size={36} className="text-muted-foreground" />
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
                : <View className="w-full h-full flex items-center justify-center"><Icon name="account" size={36} className="text-muted-foreground" /></View>}
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
                  <Text className="text-2xl font-bold text-foreground">{profile?.nickname || '无名'}</Text>
                  <View className="w-7 h-7 flex items-center justify-center" onClick={handleRandomNick}>
                    <Icon name="shuffle" size={20} className="text-muted-foreground" />
                  </View>
                  <View className="w-7 h-7 flex items-center justify-center"
                    onClick={() => { setNickInput(profile?.nickname || ''); setEditingNick(true) }}>
                    <Icon name="pencil" size={20} className="text-muted-foreground" />
                  </View>
                </View>
              )}
              <View className="flex items-center gap-2 mt-1">
                <Text className="px-2 py-0.5 rounded-full text-base font-bold text-white" style={{ background: rankColor }}>
                  {profile?.member_rank || '凡心'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 资产行（统一入口：点击进入对应明细；消息中心流水已并入健康豆，未读角标移至此处） */}
        {user && profile && (
          <View className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: '健康豆', value: profile.tb_balance || 0, icon: '👛', page: '/pages/trade/goldbean-ledger/index', badge: unreadCount },
              { label: '推荐奖励', value: `¥${(profile.commission_balance || 0).toFixed(2)}`, icon: '💰', page: '/pages/trade/commission-detail/index' },
              { label: '优惠券', value: `${profile.coupons_count || 0}张`, icon: '🎫', page: '/pages/mine/coupon/index' },
            ].map(item => (
              <View key={item.label}
                className="relative bg-card rounded-2xl flex flex-col items-center py-4 border border-border"
                hoverClass="none"
                onClick={() => Taro.navigateTo({ url: item.page })}>
                {item.badge > 0 && (
                  <View style={{
                    position: 'absolute', top: 8, right: 14, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                    background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: 600, lineHeight: '18px' }}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </Text>
                  </View>
                )}
                <Text className="text-xl font-bold text-foreground">{item.value}</Text>
                <Text className="text-base text-muted-foreground mt-1">{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 段位成长（读取现有 member_rank / cv_total，纯展示，零新增功能） */}
      {user && profile && (
        <RankProgress cvTotal={profile.cv_total ?? 0} memberRank={profile.member_rank} />
      )}

      {/* 我的食养画像（消费偏好雷达图） */}
      {user && profile && (
        <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="chart" size={24} className="text-primary" />
            <Text className="text-xl font-bold text-foreground">我的食养画像</Text>
            <Text className="text-base text-muted-foreground ml-auto">六维消费偏好</Text>
          </View>

          {radarLoading ? (
            <View className="py-10 flex items-center justify-center">
              <Icon name="loading" size={28} className="text-muted-foreground animate-spin" />
            </View>
          ) : !radarHasData ? (
            <View className="px-4 py-6 flex flex-col items-center">
              <Text className="text-4xl mb-2">🥗</Text>
              <Text className="text-base text-muted-foreground text-center mb-3">
                多买几单，你的食养画像就越圆满
              </Text>
              <View className="px-4 py-2 rounded-full bg-primary"
                onClick={() => Taro.navigateTo({ url: '/pages/index/index' })}>
                <Text className="text-white text-base">去逛逛</Text>
              </View>
            </View>
          ) : (
            <View className="py-4">
              <RadarChart dims={radarDims} size={260} />
              <Text className="text-base text-muted-foreground text-center px-4 mt-2 block">
                {radarSummary}
              </Text>
            </View>
          )}
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
              <Icon name="chevron-right" size={20} />
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

      {/* 自营门店申请入口 */}
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
              {item.iconName
                ? <Icon name={item.iconName} size={22} className="text-foreground" />
                : <View className={`${item.icon} text-2xl text-foreground`} />}
              <Text className="flex-1 text-xl text-foreground">{item.name}</Text>
              <Icon name="chevron-right" size={20} className="text-muted-foreground" />
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
    <FloatingActionBar />
    <CustomTabBar />
    </>
  )
}

/* wrapped by RouteGuard - see render */
export default UserPage
