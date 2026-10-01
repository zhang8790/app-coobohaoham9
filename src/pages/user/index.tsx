// @title 我的
import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image, Input } from '@tarojs/components'
import { getMyProfile, getMyMerchantApplication, getMerchantStore, getOrderCounts, updateProfile, getOrders, getProductsByIds } from '@/db/api'
import type { Profile, MerchantApplication } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import CustomTabBar from '@/components/custom-tabbar'
import FloatingActionBar from '@/components/FloatingActionBar'
import Icon from '@/components/Icon'
import BrandMark from '@/components/BrandMark'
import { RANK_COLOR_MAP } from '@/constants/ranks'
import { buildRadarProfile, type RadarDim } from '@/utils/food-therapy/radar-profile'
import { getCurrentTerm } from '@/utils/seasonal-box'
import RadarChart from '@/components/food/RadarChart'

const NEUTRAL_NICKNAMES = ['小确幸', '慢生活', '元气满满', '暖洋洋', '甜豆豆', '乐悠悠', '小欢喜', '轻飘飘', '棉花糖', '微醺猫']

type MenuItem = { name: string; iconName: string; page?: string }

// 我的服务（大厂式工具宫格：4 列，图标在上、文字在下）。
// 2026-10-01 按「大厂布局」重排：原「我的账户 / 珍宝库 / 服务中心」三层列表合并为单一宫格；
// 并按张林要求移除「绑定手机号」「输入邀请码绑定门店」两个入口——功能本身仍在
// 设置页（更换手机号）与商家申请页保留，不删链路，仅从「我的」页撤掉入口。
// ⚠️ 图标一律走白名单（components/Icon/iconBase64.ts），不存在即编译期可发现。
const SERVICE_GRID: MenuItem[] = [
 { name: '我的段位', iconName: 'medal', page: '/pages/mine/my-promotion/index' },
 { name: '食品管家', iconName: 'clipboard-list-outline', page: '/pages/food/tracker/index' },
 { name: '地址管理', iconName: 'location', page: '/pages/mine/address/index' },
 { name: '商品收藏', iconName: 'heart', page: '/pages/mine/favorites/index' },
 { name: '浏览足迹', iconName: 'history', page: '/pages/mine/footprint/index' },
 { name: '食养中心', iconName: 'leaf', page: '/pages/food/index' },
 { name: '帮助中心', iconName: 'headset', page: '/pages/agreement/help/index' },
 { name: '设置', iconName: 'tune', page: '/pages/mine/settings/index' },
]

// 订单 5 状态：图标同样必须走白名单（原 '★' / '⟳' / '' 当 class 用 → 前三个状态完全没有图标）
const ORDER_STATUS_TABS = [
 { key: 'pending_pay', label: '待付款', iconName: 'wallet' },
 { key: 'pending_ship', label: '待发货', iconName: 'package-variant-closed' },
 { key: 'pending_receive', label: '待收货', iconName: 'truck' },
 { key: 'pending_review', label: '待评价', iconName: 'star' },
 { key: 'after_sale', label: '售后', iconName: 'cash-refund' },
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
 // 沉浸式顶栏：按真实状态栏高度下压品牌区，避免被刘海/状态栏遮挡（默认 20 兜底）
 const [statusBarH, setStatusBarH] = useState(20)
 useEffect(() => {
 try {
 const info = (Taro as any).getWindowInfo?.() ?? (Taro as any).getSystemInfoSync?.()
 if (info?.statusBarHeight) setStatusBarH(info.statusBarHeight)
 } catch { /* 取不到则用默认值 20 */ }
 }, [])
 // 是否名下已有门店（owner_id 命中）。用于闸门兜底：门店归属是「能进后台」的最硬事实，
 // 比 merchant_status 更可靠——后台绑定/审核若漏写 merchant_status，这里仍能正确放行。
 const [hasStore, setHasStore] = useState(false)

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

 // 闸门兜底：并行探测名下门店。只要 owner_id 命中门店，就应进管理后台——
 // 不依赖 merchant_status/application，避免「后台已绑定归属但用户端仍显示申请开通」。
 getMerchantStore()
 .then(s => setHasStore(!!s))
 .catch(err => { console.error('[User] getMerchantStore failed:', err) })
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

 const rankColor = profile ? (RANK_COLOR_MAP[profile.member_rank] || '#8A6B22') : '#8A6B22'

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

 // 商家状态入口：优先用「名下已有门店」这一硬事实，其次 profile.merchant_status，最后 application.status
 // 注意：profile 未加载完成时显示 loading，避免闪烁
 const merchantStatusNode = (() => {
 if (profileLoading) return (
 <View className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
 <Icon name="loading" size={24} className="text-muted-foreground animate-spin" />
 <Text className="text-xl text-muted-foreground">加载中...</Text>
 </View>
 )
 // ① 名下已有门店（owner_id 命中）→ 直接放行进管理后台。
 // 这是最硬的判据：门店归属已成立，merchant_status 是否同步、有无申请记录都不应成为障碍。
 if (hasStore) return (
 <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-primary"
 onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-center/index' })}>
 <View className="flex items-center gap-2">
 <Icon name="store-check" size={24} className="text-primary" />
 <Text className="text-base text-primary font-bold">进入自营门店管理中心</Text>
 </View>
 <Icon name="chevron-right" size={20} className="text-primary" />
 </View>
 )
 const status = profile?.merchant_status || application?.status || 'none'
 if (status === 'none') return (
 <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border"
 onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-apply/index' })}>
 <View className="flex items-center gap-2">
 <Icon name="store-plus" size={24} className="text-primary" />
 <Text className="text-base text-foreground font-bold">申请开通自营门店</Text>
 </View>
 <Icon name="chevron-right" size={20} className="text-muted-foreground" />
 </View>
 )
 if (status === 'pending') return (
 <View className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted border border-border">
 <Icon name="clock-outline" size={24} className="text-muted-foreground" />
 <Text className="text-base text-muted-foreground">自营门店申请审核中...</Text>
 </View>
 )
 return (
 <View className="flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-primary"
 onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-center/index' })}>
 <View className="flex items-center gap-2">
 <Icon name="store-check" size={24} className="text-primary" />
 <Text className="text-base text-primary font-bold">进入自营门店管理中心</Text>
 </View>
 <Icon name="chevron-right" size={20} className="text-primary" />
 </View>
 )
 })()

 return (
    <>
    {/* 底部留白 = tabbar 预留(56px+安全区) + 额外 56px，把最底部菜单（设置/退出登录）顶到右侧悬浮栏之上，
       避免悬浮栏把手遮挡右下角导致「很难进入子菜单」。 */}
    <View className="min-h-screen bg-background" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 56px)' }}>
{/* 顶部用户卡（绿沉浸式：与首页 hero 拉齐品牌感） */}
{/* 顶部用户卡 */}
<View className="px-4 relative overflow-hidden" style={{ background: 'linear-gradient(160deg,hsl(var(--primary)) 0%,hsl(var(--primary-deep)) 100%)', paddingTop: statusBarH + 14, paddingBottom: 0 }}>
{/* 品牌符号水印：福袋 —— 品牌视觉锤，降低传播成本（白色水印叠绿底） */}
<BrandMark tone="white" size={170}
  style={{ position: 'absolute', right: -36, top: -28, opacity: 0.12, pointerEvents: 'none' }} />
{/* 品牌标题行：药食同源 · 食疗零食 / 来店有喜 · 懂身体的好物（与首页 hero 一致） */}
<View className="flex items-center justify-between relative mb-3" style={{ zIndex: 1 }}>
  <View className="flex flex-col">
    <Text className="text-xs font-bold tracking-wide" style={{ color: 'rgba(255,255,255,0.92)' }}>药食同源 · 食疗零食</Text>
    <Text className="text-xl font-bold leading-tight" style={{ color: '#fff' }}>来店有喜 · 懂身体的好物</Text>
  </View>
  {/* 设置入口（大厂惯例：右上角齿轮 + 文字标签，强化发现性）。账号/隐私等二级设置在设置页内。 */}
  <View
    className="flex items-center gap-1 flex-shrink-0"
    onClick={() => Taro.navigateTo({ url: '/pages/mine/settings/index' })}>
    <Text className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>设置</Text>
    <View
      className="flex items-center justify-center"
      style={{ width: 30, height: 30, borderRadius: 15, background: 'rgba(255,255,255,0.18)' }}>
      <Icon name="tune" size={20} className="text-white" />
    </View>
  </View>
</View>
 {!user ? (
 <View className="flex items-center gap-4 py-4"
 onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
 <View className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
 <Icon name="account" size={36} className="text-muted-foreground" />
 </View>
  <View>
    <Text className="text-2xl font-bold text-white">点击登录</Text>
    <Text className="text-xl" style={{ color: 'rgba(255,255,255,0.85)' }}>登录后享受完整功能</Text>
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
  <View className="px-3 py-1 rounded-lg bg-white flex items-center justify-center leading-none"
  onClick={handleSaveNick}>
  <View className="py-1 text-xl" style={{ color: 'hsl(var(--primary))' }}>保存</View>
  </View>
 </View>
 ) : (
 <View className="flex items-center gap-2">
 <Text className="text-2xl font-bold text-white">{profile?.nickname || '无名'}</Text>
 <View className="w-7 h-7 flex items-center justify-center" onClick={handleRandomNick}>
 <Icon name="shuffle" size={20} className="text-white" />
 </View>
 <View className="w-7 h-7 flex items-center justify-center"
 onClick={() => { setNickInput(profile?.nickname || ''); setEditingNick(true) }}>
 <Icon name="pencil" size={20} className="text-white" />
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

 {/* 资产行：仅保留「健康豆」（平台虚拟币，可作支付抵扣，非折扣促销）。
 消息中心流水已并入健康豆，未读角标挂于此（与价值主义「反折扣/反推荐奖励」铁律对齐，
 已移除「推荐奖励」「优惠券」两项 C 端分发入口）。 */}
 {user && profile && (
 <View className="mt-4">
 <View
 className="relative bg-card rounded-2xl flex items-center gap-3 px-4 py-4 border border-border"
 hoverClass="none"
 onClick={() => Taro.navigateTo({ url: '/pages/trade/goldbean-ledger/index' })}>
 {unreadCount > 0 && (
 <View style={{
 position: 'absolute', top: 10, right: 16, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
 background: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <Text style={{ color: 'white', fontSize: '22rpx', fontWeight: 600, lineHeight: '18px' }}>
 {unreadCount > 99 ? '99+' : unreadCount}
 </Text>
 </View>
 )}
 <View className="flex-1">
 <Text className="text-xl font-bold text-foreground block">{profile.tb_balance || 0}</Text>
 <Text className="text-base text-muted-foreground block">健康豆</Text>
 </View>
 <Icon name="chevron-right" size={20} className="text-muted-foreground" />
 </View>
 </View>
 )}
 </View>

 {/* 我的食养画像（消费偏好雷达图） */}
 {user && profile && (
 <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
 <View
 className="flex items-center gap-2 px-4 py-3 border-b border-border active:opacity-70 transition-opacity"
 hoverClass="none"
 onClick={() => Taro.navigateTo({ url: '/pages/food/index' })}
 >
 <Icon name="chart" size={24} className="text-primary" />
 <Text className="text-base font-bold text-foreground">我的食养画像</Text>
 <Text className="text-sm text-muted-foreground ml-auto">六维消费偏好</Text>
 <Text className="text-muted-foreground text-lg ml-1">›</Text>
 </View>

 {radarLoading ? (
 <View className="py-10 flex items-center justify-center">
 <Icon name="loading" size={28} className="text-muted-foreground animate-spin" />
 </View>
 ) : !radarHasData ? (
 <View className="px-4 py-6 flex flex-col items-center">
 <Text className="text-4xl mb-2"></Text>
 <Text className="text-base text-muted-foreground text-center mb-3">
 多买几单，你的食养画像就越圆满
 </Text>
 <View className="px-4 py-2 rounded-full bg-primary"
 onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
 <Text className="text-white text-base">去逛逛</Text>
 </View>
 </View>
        ) : (
        <View className="py-2">
        <RadarChart dims={radarDims} size={200} />
        <Text className="text-sm text-muted-foreground text-center px-4 mt-1 block">
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
 <Text className="text-base font-bold text-foreground">我的订单</Text>
 <View className="flex items-center gap-1 text-primary text-base"
 onClick={() => Taro.navigateTo({ url: '/pages/order-center/index' })}>
 <Text>全部</Text>
 <Icon name="chevron-right" size={20} />
 </View>
 </View>
 <View className="grid grid-cols-5 py-3">
 {ORDER_STATUS_TABS.map(tab => (
 <View key={tab.key} className="flex flex-col items-center gap-1 py-2 relative"
 onClick={() => Taro.navigateTo({ url: `/pages/order-center/index?tab=${tab.key}` })}>
 <Icon name={tab.iconName} size={26} className="text-foreground" />
 {orderCounts[tab.key] > 0 && (
 <View className="absolute top-1 right-4 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
 <Text className="text-white text-xs">{orderCounts[tab.key]}</Text>
 </View>
 )}
 <Text className="text-sm text-muted-foreground">{tab.label}</Text>
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

 {/* 我的服务：大厂式 4 列工具宫格（图标在上、文字在下），点击直达各功能页 */}
 <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
 <View className="flex items-center px-4 py-3 border-b border-border">
 <Text className="text-base font-bold text-foreground">我的服务</Text>
 </View>
 <View className="flex flex-wrap pt-2 pb-3">
 {SERVICE_GRID.map(item => (
 <View key={item.name} className="flex flex-col items-center py-3"
 style={{ width: '25%' }}
 hoverClass="none"
 onClick={() => item.page ? Taro.navigateTo({ url: item.page }) : Taro.showToast({ title: '功能开发中', icon: 'none' })}>
 <Icon name={item.iconName} size={30} className="text-foreground" />
 <Text className="text-sm text-muted-foreground mt-1">{item.name}</Text>
 </View>
 ))}
 </View>
 </View>

 {/* 退出登录 */}
 {user && (
 <View className="mx-4 mt-4">
 <View
 className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
 onClick={handleSignOut}>
 <View className="py-4 text-base text-muted-foreground">退出登录</View>
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
