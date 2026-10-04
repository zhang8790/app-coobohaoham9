// @title 自营门店管理中心（仪表盘）
import { useState, useEffect, useRef } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, Button, Image, Input } from '@tarojs/components'
import { getMerchantStore, getMerchantProducts, getMerchantOrders, getMerchantOrderStats, getMyMerchantApplication, generateQrcode, getMerchantSettlement, getNearExpiryProducts, getMerchantVehicles, createMerchantVehicle, setMerchantVehicleStatus, getMerchantStores, setCurrentMerchantStore, selfOpenStore } from '@/db/api'
import { supabase } from '@/client/supabase'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { clearRequestCache } from '@/db/requestCache'
import Icon from '@/components/Icon'
import { useAuth } from '@/contexts/AuthContext'
import StatCards from './StatCards'
import NavGrid from './NavGrid'
import QuickActions from './QuickActions'
import ExpiryCard from './ExpiryCard'
import CrossSummaryCard from './CrossSummaryCard'
import RecentOrders from './RecentOrders'
import StoreInfoCard from './StoreInfoCard'
import SettlementCard from './SettlementCard'
import VehiclesCard from './VehiclesCard'
import StoreQrModal from './StoreQrModal'
import VehicleManageModal from './VehicleManageModal'
import StoreSwitchSheet from './StoreSwitchSheet'

function MerchantCenterPage() {
  const [store, setStore] = useState<Store | null>(null)
  // Phase 4 商家多店：可管理门店列表 + 当前店切换 + 跨店总览
  const [stores, setStores] = useState<Store[]>([])
  const [showStoreSwitch, setShowStoreSwitch] = useState(false)
  const [crossSummary, setCrossSummary] = useState<{ products: number; orders: number; balance: number } | null>(null)
  const [stats, setStats] = useState({ products: 0, online: 0, orders: 0, todayOrders: 0, members: 0, crossStore: 0 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [merchantAppStatus, setMerchantAppStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // 手动重载触发器：门店刚建好/刚绑定后，清缓存并重跑加载，避免停留在空态
  const [reloadTick, setReloadTick] = useState(0)
  // 「已通过但无门店」孤儿态的自助开通（fn_self_open_store，幂等）
  const [opening, setOpening] = useState(false)

  const handleSelfOpenStore = async () => {
    if (opening) return
    setOpening(true)
    try {
      const r = await selfOpenStore()
      if (!r.ok) {
        Taro.showToast({ title: r.message || '开通失败，请稍后重试', icon: 'none' })
        return
      }
      Taro.showToast({ title: `已开通「${r.storeName || '门店'}」`, icon: 'success' })
      setReloadTick(t => t + 1)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '开通失败', icon: 'none' })
    } finally {
      setOpening(false)
    }
  }

  // 临期预警摘要（按本店 store.id 过滤）
  const [expiryStats, setExpiryStats] = useState<{ total: number; red: number; orange: number; amber: number } | null>(null)

  // 商家货款结算概览（迁移 00120）
  const [settlement, setSettlement] = useState<{
    merchant_balance: number; settlement_frozen: number; total_settled: number; settlement_count: number; wx_sub_mch_id: string | null
  } | null>(null)

  // 门店二维码相关状态
  const [showQrModal, setShowQrModal] = useState(false)
  const [storeQrUrl, setStoreQrUrl] = useState('')
  const [storeScanContent, setStoreScanContent] = useState('')
  const [qrLoading, setQrLoading] = useState(false)

  // P3 门店联动：本店流动车（轻量随身管理）
  const [vehicles, setVehicles] = useState<{ id: string; name: string; status: 'active' | 'offline' }[]>([])
  const [showVehicleModal, setShowVehicleModal] = useState(false)
  const [vehicleName, setVehicleName] = useState('')
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false)

  // 复用全局登录态（RouteGuard 已确保已登录），避免商家中心再走一次 auth 网络请求
  const { user: authUser } = useAuth()
  // 跟踪加载态（供超时提示判断是否仍在加载，避免加载完成后还弹"较慢"提示）
  const loadingRef = useRef(true)

  // 跳转商品管理（新增/扫码自动开表单），统一的可靠入口
  const goProducts = (action?: 'add' | 'scan') => {
    const url = action
      ? `/pages/merchant/merchant-products/index?action=${action}`
      : '/pages/merchant/merchant-products/index'
    Taro.navigateTo({ url })
  }

  // 打开本页流动车管理弹窗（NavGrid「流动车」入口）
  const goVehicles = () => setShowVehicleModal(true)

  // 第一步：加载商家信息（快速）
  useEffect(() => {
    let cancelled = false

    // 超时保护：15秒后若仍在加载，给一个温和提示（Supabase 从微信访问偶发较慢，
    // 不再用"网络错误/重新登录"这种告警式文案，避免误报）
    const timeoutId = setTimeout(() => {
      if (!cancelled && loadingRef.current) {
        Taro.showToast({ title: '加载较慢，请稍候…', icon: 'none', duration: 2000 })
      }
    }, 15000)

    // 分别加载，避免一个失败影响另一个
    const loadData = async () => {
    try {
      // RouteGuard 已确保已登录，直接复用上下文 user，省去一次 auth 网络往返
      // （微信访问 Supabase auth 接口偶发慢，正是此前 5 秒超时误报"网络错误"的根因）
      const user = authUser
      if (!user) {
        if (!cancelled) {
          loadingRef.current = false
          setLoading(false)
          Taro.showToast({ title: '请先登录', icon: 'none' })
        }
        return
      }


        // 并行加载，但分别处理错误
        const [storeResult, appResult, storesResult] = await Promise.allSettled([
          getMerchantStore(),
          getMyMerchantApplication(),
          getMerchantStores(),
        ])

        if (cancelled) return

        // 处理商家信息
        if (storeResult.status === 'fulfilled') {
          setStore(storeResult.value)
        } else {
          console.error('[MerchantCenter] 加载商家信息失败:', storeResult.reason)
        }

        // 处理审核状态
        if (appResult.status === 'fulfilled') {
          setMerchantAppStatus(appResult.value?.status || null)
        } else {
          console.error('[MerchantCenter] 加载审核状态失败:', appResult.reason)
        }

        // 处理可管理门店列表（Phase 4 多店）
        if (storesResult.status === 'fulfilled') {
          setStores(storesResult.value ?? [])
        }

        // 无论成功失败，都退出加载状态
        loadingRef.current = false
        setLoading(false)

      } catch (error) {
        console.error('[MerchantCenter] 加载过程异常:', error)
        if (!cancelled) {
          loadingRef.current = false
          setLoading(false)
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    loadData()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [authUser, reloadTick])

  // 第二步：异步加载统计数据（慢，但不阻塞UI）
  useEffect(() => {
    if (!store) { setStatsLoaded(true); return } // 未关联门店：直接空态，避免「加载中…」卡死
    let cancelled = false

    Promise.all([
      getMerchantProducts(store.id),
      getMerchantOrders(store.id),            // 仍用于「最近订单」列表渲染（仅 20 行，快）
      getMerchantOrderStats(store.id),        // 准确的订单总数/今日订单（count 查询，不被截断）
      getMerchantSettlement(store.id).catch(() => null),
      supabase.rpc('get_store_locked_members', { p_store_id: store.id })
        .then((r: { data?: any[] }) => (r.data ?? []) as any[]).catch(() => [] as any[]),
      getNearExpiryProducts({ storeId: store.id, limit: 200 }).catch(() => [] as any[]),
      getMerchantVehicles(store.id).catch(() => [] as any[]),
    ]).then(([prods, ords, stats, sett, members, expiry, veh]) => {
      if (cancelled) return
      if (sett) setSettlement(sett)
      const online = prods.filter(p => p.is_active).length
      const memberList = Array.isArray(members) ? members : []
      const crossStore = memberList.filter((m: any) => m.referrer_store_id && m.referrer_store_id !== store.id).length
      setStats({ products: prods.length, online, orders: stats.totalOrders, todayOrders: stats.todayOrders, members: memberList.length, crossStore })
      // 临期摘要：按 discount_stage 分组计数
      const expiryList = Array.isArray(expiry) ? expiry : []
      const red = expiryList.filter((e: any) => e.discount_stage === 'red').length
      const orange = expiryList.filter((e: any) => e.discount_stage === 'orange').length
      const amber = expiryList.filter((e: any) => e.discount_stage === 'amber').length
      setExpiryStats({ total: expiryList.length, red, orange, amber })
      // P3：本店流动车
      const vehList = Array.isArray(veh) ? veh.map((v: any) => ({ id: v.id, name: v.name, status: v.status })) : []
      setVehicles(vehList)
      // 取最近 5 笔去重订单（order_items 一行一商品，按 order_no 聚合）
      const seen = new Set<string>()
      const recent: any[] = []
      for (const it of ords) {
        const no = it.orders?.order_no
        if (no && !seen.has(no)) { seen.add(no); recent.push(it) }
        if (recent.length >= 5) break
      }
      setRecentOrders(recent)
      setStatsLoaded(true)
    }).catch(error => {
      console.error('[MerchantCenter] 加载统计数据失败:', error)
      if (!cancelled) setStatsLoaded(true)
    })

    return () => { cancelled = true }
  }, [store])

  // Phase 4 跨店总览：遍历门店列表聚合（仅多店时有意义）
  useEffect(() => {
    if (stores.length <= 1) { setCrossSummary(null); return }
    let cancelled = false
    Promise.all(stores.map(async s => {
      const [prods, stats, sett] = await Promise.all([
        getMerchantProducts(s.id).catch(() => [] as any[]),
        getMerchantOrderStats(s.id).catch(() => ({ totalOrders: 0 } as any)),
        getMerchantSettlement(s.id).catch(() => null),
      ])
      return { products: prods.length, orders: stats.totalOrders ?? 0, balance: sett?.merchant_balance ?? 0 }
    })).then(arr => {
      if (cancelled) return
      setCrossSummary(arr.reduce(
        (a, b) => ({ products: a.products + b.products, orders: a.orders + b.orders, balance: a.balance + b.balance }),
        { products: 0, orders: 0, balance: 0 },
      ))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [stores])

  // 打开门店二维码弹窗
  const handleShowStoreQr = async () => {
    if (!store) return
    // 取门店主推广码，写入门店码 r= 参数：用户扫码进店即显式锁定门店主（二维码锁客，佣金回流门店）
    let referralCode: string | undefined
    if (store.owner_id) {
      const { data: owner } = await supabase
        .from('profiles')
        .select('referral_code, invite_code')
        .eq('id', store.owner_id)
        .maybeSingle()
      referralCode = (owner as any)?.referral_code || (owner as any)?.invite_code || undefined
    }
    // 构造「应用内扫码购物」用的普通二维码内容（标准 scene 串，命中 s= 即进店）
    const sc = (store.short_code || store.id).toUpperCase().slice(0, 8)
    const scanContent = referralCode ? `s=${sc}&r=${referralCode}` : `s=${sc}`
    setStoreScanContent(scanContent)

    // 已有太阳码直接显示
    if (storeQrUrl) { setShowQrModal(true); return }
    setQrLoading(true)
    setShowQrModal(true)
    try {
      const url = await generateQrcode({
        type: 'store',
        short_code: store.short_code || store.id,
        referral_code: referralCode,
      })
      if (url) setStoreQrUrl(url)
      else Taro.showToast({ title: '二维码生成失败', icon: 'none' })
    } catch (e) {
      console.error('[MerchantCenter] generateQrcode error:', e)
      Taro.showToast({ title: '二维码生成失败', icon: 'none' })
    } finally {
      setQrLoading(false)
    }
  }

  // 保存门店二维码到相册
  const handleSaveStoreQr = () => {
    if (!storeQrUrl) return
    Taro.downloadFile({
      url: storeQrUrl,
      success: (res) => {
        Taro.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => Taro.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => Taro.showToast({ title: '请授权相册权限', icon: 'none' }),
        })
      },
      fail: () => Taro.showToast({ title: '下载失败', icon: 'none' }),
    })
  }

  // 分享配置：携带门店链接（用于归属）
  useShareAppMessage(() => ({
    title: `${store?.name || '来店有喜'} · 扫码进店购物`,
    path: store ? `/pages/store-home/index?id=${store.id}` : '/pages/goods/index',
    imageUrl: store?.image_url || '',
  }))
  useShareTimeline(() => ({
    title: `${store?.name || '来店有喜'} · 好店推荐，扫码进店`,
    query: store ? `id=${store.id}` : '',
  }))

  // P3 门店联动：新增流动车
  const handleAddVehicle = async () => {
    if (!store) return
    if (!vehicleName.trim()) { Taro.showToast({ title: '请输入流动车名称', icon: 'none' }); return }
    setVehicleSubmitting(true)
    try {
      await createMerchantVehicle(store.id, vehicleName)
      const list = await getMerchantVehicles(store.id).catch(() => [])
      setVehicles(Array.isArray(list) ? list.map((v: any) => ({ id: v.id, name: v.name, status: v.status })) : [])
      setShowVehicleModal(false)
      setVehicleName('')
      Taro.showToast({ title: '已添加流动车', icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: '添加失败：' + (e?.message || e), icon: 'none' })
    } finally {
      setVehicleSubmitting(false)
    }
  }

  // P3 门店联动：启停流动车
  const handleToggleVehicle = async (v: { id: string; name: string; status: 'active' | 'offline' }) => {
    const next = v.status === 'active' ? 'offline' : 'active'
    try {
      await setMerchantVehicleStatus(v.id, next)
      setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, status: next } : x))
    } catch (e: any) {
      Taro.showToast({ title: '操作失败：' + (e?.message || e), icon: 'none' })
    }
  }

  if (loading) return (
    <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
      <Text className="text-base text-muted-foreground">正在加载门店数据…</Text>
      <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
        onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
        <Text className="text-base text-muted-foreground">返回个人</Text>
      </Button>
    </View>
  )

  // 业务流程闸门：用户申请 → 总后台审核通过 → 开通店铺 → 进入管理后台。
  // 无门店时按申请状态给出正确引导，不再直接透出空壳仪表盘（既避免"流程错误"，也避免误显示他人数据）。
  if (!store) {
    // ① 审核中：等待总部核验（正确流程的中段）
    if (merchantAppStatus === 'pending') {
      return (
        <RouteGuard>
          <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
            <Icon name="clock-outline" size={64} className="text-muted-foreground" />
            <Text className="text-2xl font-bold text-foreground text-center">自营门店申请审核中</Text>
            <Text className="text-base text-muted-foreground text-center">您的开店申请已提交，总部核验通过后会自动为您开通店铺，届时即可进入管理后台。</Text>
            <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
              onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
              <Text className="text-base text-muted-foreground">返回个人中心</Text>
            </Button>
          </View>
        </RouteGuard>
      )
    }

    // ② 已通过但无门店：正确流程的末段断在这里（历史审核实现建店失败留下的孤儿态）。
    //    给「立即开通我的店铺」自助物化（fn_self_open_store：按本人已通过申请建店/认领同名无主店
    //    + 写 store_staff(owner)，幂等），免跑 SQL、免等总部；仍保留「重新加载」兜底。
    if (merchantAppStatus === 'approved') {
      return (
        <RouteGuard>
          <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="store-plus" size={40} className="text-primary" />
            </View>
            <Text className="text-2xl font-bold text-foreground text-center">店铺待开通</Text>
            <Text className="text-base text-muted-foreground text-center">您的开店申请已通过。点击下方按钮即可立即开通店铺，随后进入管理后台。</Text>
            <Button className="!bg-primary !border-none !rounded-2xl !px-8 !py-3"
              onClick={handleSelfOpenStore}>
              <Text className="text-base font-bold text-white">{opening ? '开通中…' : '立即开通我的店铺'}</Text>
            </Button>
            <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
              onClick={() => { clearRequestCache(); setReloadTick(t => t + 1) }}>
              <Text className="text-base text-muted-foreground">重新加载</Text>
            </Button>
            <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
              onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
              <Text className="text-base text-muted-foreground">返回个人中心</Text>
            </Button>
          </View>
        </RouteGuard>
      )
    }

    // ③ 未申请：主通道——申请开通门店（启动正确流程）
    return (
      <RouteGuard>
        <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
          <View className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="store-plus" size={40} className="text-primary" />
          </View>
          <Text className="text-2xl font-bold text-foreground text-center">申请开通自营门店</Text>
          <Text className="text-base text-muted-foreground text-center">提交开店申请后由总部核验，审核通过后自动开通店铺，您即可进入管理后台。</Text>
          <Button className="!bg-primary !border-none !rounded-2xl !px-8 !py-3"
            onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-apply/index' })}>
            <Text className="text-base font-bold text-white">申请开通门店</Text>
          </Button>
          <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
            onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
            <Text className="text-base text-muted-foreground">返回个人中心</Text>
          </Button>
        </View>
      </RouteGuard>
    )
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      {/* 品牌头（渐变） */}
      <StoreInfoCard
        store={store}
        storeCount={stores.length}
        onViewStore={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${store.id}` })}
        onShowQr={handleShowStoreQr}
        onSwitch={() => setShowStoreSwitch(true)}
      />

      {/* 经营概览 KPI（上浮叠在品牌头上） */}
      <StatCards stats={stats} />

      {/* 核心操作：新增商品为主 CTA */}
      <QuickActions
        onAdd={() => goProducts('add')}
        onScan={() => goProducts('scan')}
        onBatchAnalyze={() => goProducts()}
      />

      {/* 多店总览（仅多店时显示） */}
      <CrossSummaryCard storeCount={stores.length} crossSummary={crossSummary} />

      {/* 功能模块网格：分组与条目对齐网页版自营后台，功能一一对应 */}
      <NavGrid storeId={store.id} onOpenVehicles={goVehicles} />

      {/* 货款结算 */}
      <SettlementCard
        settlement={settlement}
        onWithdraw={() => Taro.navigateTo({ url: `/pages/trade/withdraw/index?kind=settlement&storeId=${store.id}` })}
      />

      {/* 临期预警 */}
      <ExpiryCard expiryStats={expiryStats} />

      {/* 流动车 */}
      <VehiclesCard
        vehicles={vehicles}
        onOpenModal={() => setShowVehicleModal(true)}
        onToggle={handleToggleVehicle}
      />

      {/* 最近订单 */}
      <RecentOrders statsLoaded={statsLoaded} recentOrders={recentOrders} />

      <StoreQrModal
        visible={showQrModal}
        storeName={store.name}
        storeQrUrl={storeQrUrl}
        scanContent={storeScanContent}
        qrLoading={qrLoading}
        onClose={() => setShowQrModal(false)}
        onSave={handleSaveStoreQr}
      />

      <VehicleManageModal
        visible={showVehicleModal}
        vehicles={vehicles}
        vehicleName={vehicleName}
        vehicleSubmitting={vehicleSubmitting}
        onVehicleNameChange={setVehicleName}
        onAdd={handleAddVehicle}
        onToggle={handleToggleVehicle}
        onClose={() => setShowVehicleModal(false)}
      />

      <StoreSwitchSheet
        visible={showStoreSwitch}
        stores={stores}
        currentStore={store}
        onSwitch={(s) => { setCurrentMerchantStore(authUser.id, s.id, s); setStore(s); setShowStoreSwitch(false) }}
        onClose={() => setShowStoreSwitch(false)}
      />

     </View>
   </RouteGuard>
  )
}

/* wrapped by RouteGuard - see render */
export default MerchantCenterPage
