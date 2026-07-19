// @title 商家管理中心（仪表盘）
import { useState, useEffect } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, Button, Image } from '@tarojs/components'
import { getMerchantStore, getMerchantProducts, getMerchantOrders, getMyMerchantApplication, generateQrcode, getMerchantSettlement } from '@/db/api'
import { supabase } from '@/client/supabase'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

// 仪表盘导航项
const NAV_ITEMS = [
  { to: '/pages/merchant-products/index', icon: 'i-mdi-package-variant', label: '商品管理', color: 'bg-orange-500', key: 'products' },
  { to: '/pages/merchant-orders/index', icon: 'i-mdi-receipt-text-outline', label: '订单管理', color: 'bg-blue-500', key: 'orders' },
  { to: '/pages/merchant-members/index', icon: 'i-mdi-account-group', label: '会员管理', color: 'bg-purple-500', key: 'members' },
  { to: '/pages/merchant-coupons/index', icon: 'i-mdi-ticket-percent', label: '优惠券', color: 'bg-pink-500', key: 'coupons' },
  { to: '/pages/merchant-analytics/index', icon: 'i-mdi-chart-line', label: '数据分析', color: 'bg-green-500', key: 'analytics' },
  { to: '/pages/merchant-emotion-funnel/index', icon: 'i-mdi-emoticon-happy-outline', label: '情绪漏斗', color: 'bg-pink-500', key: 'emofunnel' },
  { to: '/pages/merchant-settings/index', icon: 'i-mdi-store-cog', label: '店铺设置', color: 'bg-gray-500', key: 'settings' },
  { to: '/pages/withdraw/index', icon: 'i-mdi-cash-multiple', label: '佣金提现', color: 'bg-yellow-500', key: 'withdraw' },
]

function MerchantCenterPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [stats, setStats] = useState({ products: 0, online: 0, orders: 0, todayOrders: 0, members: 5, crossStore: 2 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [merchantAppStatus, setMerchantAppStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 商家货款结算概览（迁移 00120）
  const [settlement, setSettlement] = useState<{
    merchant_balance: number; settlement_frozen: number; total_settled: number; settlement_count: number; wx_sub_mch_id: string | null
  } | null>(null)

  // 门店二维码相关状态
  const [showQrModal, setShowQrModal] = useState(false)
  const [storeQrUrl, setStoreQrUrl] = useState('')
  const [qrLoading, setQrLoading] = useState(false)

  // 第一步：加载商家信息（快速）
  useEffect(() => {
    let cancelled = false

    // 超时保护：5秒后强制退出加载状态
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        console.warn('[MerchantCenter] 加载超时，强制退出加载状态')
        setLoading(false)
        Taro.showToast({
          title: '加载超时，请检查网络或重新登录',
          icon: 'none',
          duration: 3000
        })
      }
    }, 5000)

    // 分别加载，避免一个失败影响另一个
    const loadData = async () => {
      try {
        // 先检查登录状态
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          console.error('[MerchantCenter] 用户未登录')
          if (!cancelled) {
            setLoading(false)
            Taro.showToast({ title: '请先登录', icon: 'none' })
          }
          return
        }

        console.log('[MerchantCenter] 开始加载，用户ID:', user.id)

        // 并行加载，但分别处理错误
        const [storeResult, appResult] = await Promise.allSettled([
          getMerchantStore(),
          getMyMerchantApplication(),
        ])

        if (cancelled) return

        // 处理商家信息
        if (storeResult.status === 'fulfilled') {
          console.log('[MerchantCenter] 商家信息:', storeResult.value)
          setStore(storeResult.value)
        } else {
          console.error('[MerchantCenter] 加载商家信息失败:', storeResult.reason)
        }

        // 处理审核状态
        if (appResult.status === 'fulfilled') {
          console.log('[MerchantCenter] 审核状态:', appResult.value)
          setMerchantAppStatus(appResult.value?.status || null)
        } else {
          console.error('[MerchantCenter] 加载审核状态失败:', appResult.reason)
        }

        // 无论成功失败，都退出加载状态
        setLoading(false)
        console.log('[MerchantCenter] 加载完成，loading设为false')

      } catch (error) {
        console.error('[MerchantCenter] 加载过程异常:', error)
        if (!cancelled) {
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
  }, [])

  // 第二步：异步加载统计数据（慢，但不阻塞UI）
  useEffect(() => {
    if (!store) return
    let cancelled = false

    Promise.all([
      getMerchantProducts(store.id),
      getMerchantOrders(store.id),
      getMerchantSettlement(store.id).catch(() => null),
    ]).then(([prods, ords, sett]) => {
      if (cancelled) return
      if (sett) setSettlement(sett)
      const online = prods.filter(p => p.is_active).length
      const today = new Date().toISOString().slice(0, 10)
      const todayOrders = ords.filter(o => (o.orders?.created_at || '').startsWith(today)).length
      setStats({ products: prods.length, online, orders: ords.length, todayOrders, members: 5, crossStore: 2 })
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

  // 打开门店二维码弹窗
  const handleShowStoreQr = async () => {
    if (!store) return
    // 已有二维码直接显示
    if (storeQrUrl) { setShowQrModal(true); return }
    setQrLoading(true)
    setShowQrModal(true)
    try {
      const url = await generateQrcode({
        type: 'store',
        short_code: store.short_code || store.id,
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
    title: `${store?.name || '来电有喜'} · 扫码进店购物`,
    path: store ? `/pages/store-home/index?id=${store.id}` : '/pages/reward-shop/index',
    imageUrl: store?.image_url || '',
  }))
  useShareTimeline(() => ({
    title: `${store?.name || '来电有喜'} · 好店推荐，扫码进店`,
    query: store ? `id=${store.id}` : '',
  }))

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  // 已通过商家入驻但还没有门店（门店尚未创建或 owner_id 不匹配）
  if (!store && merchantAppStatus === 'approved') return (
    <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
      <View className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <View className="i-mdi-check text-4xl text-primary" />
      </View>
      <Text className="text-xl font-bold text-foreground text-center">入驻已通过</Text>
      <Text className="text-base text-muted-foreground text-center">恭喜！您的商家入驻已审核通过，正在为您准备门店数据。</Text>
      <Button className="!bg-primary !border-none !rounded-2xl !px-8 !py-3"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-apply/index' })}>
        <Text className="text-base font-bold text-white">完善门店信息</Text>
      </Button>
      <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
        onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
        <Text className="text-base text-muted-foreground">返回</Text>
      </Button>
    </View>
  )

  // 审核中
  if (!store && merchantAppStatus === 'pending') return (
    <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
      <View className="i-mdi-clock-outline text-6xl text-yellow-500" />
      <Text className="text-xl font-bold text-foreground text-center">入驻申请审核中</Text>
      <Text className="text-base text-muted-foreground text-center">您的商家入驻申请已提交，请耐心等待管理员审核。</Text>
      <Button className="!bg-transparent !border-none !rounded-2xl !px-8 !py-2"
        onClick={() => Taro.switchTab({ url: '/pages/user/index' })}>
        <Text className="text-base text-muted-foreground">返回</Text>
      </Button>
    </View>
  )

  // 非商家 / 被拒绝
  if (!store) return (
    <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
      <View className="i-mdi-store-off text-6xl text-muted-foreground" />
      <Text className="text-xl text-muted-foreground text-center">您尚未开通门店，请先申请成为商家</Text>
      <Button className="!bg-primary !border-none !rounded-2xl !px-8 !py-3"
        onClick={() => Taro.navigateTo({ url: '/pages/merchant-apply/index' })}>
        <Text className="text-base font-bold text-white">申请开店</Text>
      </Button>
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">
      {/* 门店信息卡 */}
      <View className="mx-4 mt-2 p-4 rounded-2xl bg-card border border-border">
        <View className="flex items-center gap-3">
          <View className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <View className="i-mdi-store text-2xl text-primary" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-foreground">{store.name}</Text>
            <Text className="text-base text-muted-foreground">{store.address || '暂无地址'}</Text>
          </View>
        </View>
        {/* 操作按钮行：查看 + 二维码 */}
        <View className="flex gap-2 mt-3">
          <Button className="!flex-1 !m-0 !p-0 !bg-primary !border-none !rounded-xl"
            onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${store.id}` })}>
            <View className="py-2 flex items-center justify-center gap-1">
              <View className="i-mdi-eye text-white" />
              <Text className="text-base font-bold text-white">查看门店</Text>
            </View>
          </Button>
          <Button className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-primary !rounded-xl"
            onClick={handleShowStoreQr}>
            <View className="py-2 flex items-center justify-center gap-1">
              <View className="i-mdi-qrcode text-primary" />
              <Text className="text-base font-bold text-primary">门店二维码</Text>
            </View>
          </Button>
        </View>
      </View>

      {/* 统计卡片 */}
      <View className="flex gap-3 px-4 mt-3">
        {[
          { label: '商品', value: stats.products, sub: `${stats.online}在售`, color: 'text-orange-500' },
          { label: '订单', value: stats.orders, sub: `今日${stats.todayOrders}`, color: 'text-blue-500' },
          { label: '会员', value: stats.members, sub: `${stats.crossStore}跨店`, color: 'text-purple-500' },
        ].map(s => (
          <View key={s.label} className="flex-1 bg-card rounded-2xl border border-border p-3 text-center">
            <Text className={`text-3xl font-bold ${s.color}`}>{s.value}</Text>
            <Text className="text-base text-muted-foreground">{s.label}</Text>
            <Text className="text-base text-muted-foreground">{s.sub}</Text>
          </View>
        ))}
      </View>

      {/* ============ 商家货款结算卡（迁移 00120） ============ */}
      <View className="mx-4 mt-3 p-4 rounded-2xl border border-emerald-500/30"
        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(5,150,105,0.04))' }}>
        <View className="flex items-center justify-between">
          <View className="flex items-center gap-2">
            <View className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <View className="i-mdi-cash-multiple text-emerald-500 text-xl" />
            </View>
            <Text className="text-lg font-bold text-foreground">可结算货款</Text>
          </View>
          <Text className="text-base text-muted-foreground">已结算 {settlement?.settlement_count ?? 0} 笔</Text>
        </View>
        <View className="flex items-end justify-between mt-3">
          <View>
            <Text className="text-base text-muted-foreground">当前可提现</Text>
            <Text className="text-4xl font-bold text-emerald-600">¥{((settlement?.merchant_balance ?? 0)).toFixed(2)}</Text>
          </View>
          <Button
            className="!m-0 !p-0 !bg-emerald-500 !border-none !rounded-2xl !leading-none"
            onClick={() => Taro.navigateTo({ url: `/pages/withdraw/index?kind=settlement&storeId=${store.id}` })}>
            <View className="px-5 py-2.5 flex items-center gap-1">
              <Text className="text-base font-bold text-white">货款提现</Text>
            </View>
          </Button>
        </View>
        <Text className="text-sm text-muted-foreground mt-2">
          货款以人民币结算（含情绪豆支付等值部分，由平台垫付），通过微信服务商分账直达您的子商户号，可提现。
        </Text>
      </View>

      {/* 功能导航网格 */}
      <View className="grid grid-cols-4 gap-3 px-4 mt-4">
        {NAV_ITEMS.map(item => (
          <View key={item.key} className="flex flex-col items-center gap-2 py-4 px-1 bg-card rounded-2xl border border-border"
            onClick={() => Taro.navigateTo({ url: item.to })}>
            <View className={`w-11 h-11 rounded-2xl ${item.color} flex items-center justify-center`}>
              <View className={`${item.icon} text-white text-2xl`} />
            </View>
            <Text className="text-base text-foreground text-center font-bold whitespace-nowrap">{item.label}</Text>
          </View>
        ))}
      </View>

      {/* 快捷操作 */}
      <View className="px-4 mt-4">
        <Text className="text-lg font-bold text-foreground mb-2">快捷操作</Text>
        <View className="flex gap-3">
          <Button className="!flex-1 !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none"
            onClick={() => Taro.navigateTo({ url: '/pages/merchant-products/index?action=add' })}>
            <View className="py-3 flex items-center gap-1">
              <View className="i-mdi-plus text-white text-xl" />
              <Text className="text-base font-bold text-white">新增商品</Text>
            </View>
          </Button>
          <Button className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-primary !rounded-2xl !leading-none"
            onClick={() => Taro.navigateTo({ url: '/pages/merchant-products/index?action=scan' })}>
            <View className="py-3 flex items-center gap-1">
              <View className="i-mdi-barcode-scan text-primary text-xl" />
              <Text className="text-base font-bold text-primary">扫码上架</Text>
            </View>
          </Button>
        </View>
        {/* 红包发放入口 */}
        <View className="flex gap-3 mt-3">
          <Button className="!flex-1 !m-0 !p-0 !bg-red-500 !border-none !rounded-2xl !leading-none"
            onClick={() => Taro.navigateTo({ url: '/pages/merchant-campaigns/create/index' })}>
            <View className="py-3 flex items-center gap-1">
              <View className="i-mdi-gift text-white text-xl" />
              <Text className="text-base font-bold text-white">发放红包</Text>
            </View>
          </Button>
          <Button className="!flex-1 !m-0 !p-0 !bg-orange-500 !border-none !rounded-2xl !leading-none"
            onClick={() => Taro.navigateTo({ url: '/pages/merchant-campaigns/index' })}>
            <View className="py-3 flex items-center gap-1">
              <View className="i-mdi-gift-outline text-white text-xl" />
              <Text className="text-base font-bold text-white">管理活动</Text>
            </View>
          </Button>
        </View>
      </View>

      {/* 最近订单预览 */}
      <View className="px-4 mt-4">
        <View className="flex items-center justify-between mb-2">
          <Text className="text-lg font-bold text-foreground">最近订单</Text>
          <Button className="!p-0 !bg-transparent !border-none" onClick={() => Taro.navigateTo({ url: '/pages/merchant-orders/index' })}>
            <Text className="text-base text-primary">查看全部 →</Text>
          </Button>
        </View>
        <View className="bg-card rounded-2xl border border-border p-4">
          {!statsLoaded ? (
            <Text className="text-base text-muted-foreground">加载中…</Text>
          ) : recentOrders.length === 0 ? (
            <Text className="text-base text-muted-foreground">暂无订单</Text>
          ) : (
            recentOrders.map((it, idx) => {
              const o = it.orders || {}
              const statusMap: Record<string, string> = {
                pending_pay: '待付款', paid: '已付款', pending: '待发货',
                pending_receive: '待收货', pending_review: '待评价', done: '已完成', completed: '已完成', cancelled: '已取消',
              }
              const statusText = statusMap[o.status] || o.status || '未知'
              const amt = o.total_amount ?? 0
              const time = (o.created_at || '').replace('T', ' ').slice(0, 16)
              return (
                <View
                  key={o.order_no || idx}
                  className="flex items-center justify-between py-2.5"
                  style={idx > 0 ? { borderTop: '1px solid rgba(148,163,184,0.15)' } : undefined}>
                  <View className="flex-1 mr-3">
                    <Text className="text-base text-foreground">订单 {String(o.order_no || '').slice(-6)}</Text>
                    <Text className="text-base text-muted-foreground mt-0.5">{time || '—'}</Text>
                  </View>
                  <View className="flex items-center gap-2">
                    <Text className="text-base text-muted-foreground">{statusText}</Text>
                    <Text className="text-base font-bold text-foreground">¥{amt}</Text>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </View>

      {/* ========== 门店二维码弹窗 ========== */}
      {showQrModal && (
        <View
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => setShowQrModal(false)}>
          <View
            className="w-full rounded-t-3xl bg-card px-6 pt-6 pb-10"
            style={{ maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}>

            {/* 标题栏 */}
            <View className="flex items-center justify-between mb-5">
              <Text className="text-xl font-bold text-foreground">门店二维码</Text>
              <View
                onClick={() => setShowQrModal(false)}
                style={{
                  width: '32px', height: '32px', borderRadius: '16px',
                  backgroundColor: '#F5F5F5', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                <Text style={{ fontSize: '18px', color: '#999' }}>✕</Text>
              </View>
            </View>

            {/* 二维码主体 */}
            <View className="flex flex-col items-center py-3">
              {/* 门店名称 */}
              <Text className="text-lg font-bold text-foreground">{store?.name}</Text>
              <Text className="text-sm text-muted-foreground mt-1">用户扫码即可进店购物</Text>

              {/* 二维码图片 */}
              <View
                style={{
                  width: '240px', height: '240px', borderRadius: '16px',
                  border: '2px solid rgba(194,65,12,0.15)',
                  backgroundColor: '#FFF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: '20px', overflow: 'hidden',
                }}>
                {qrLoading ? (
                  <View className="flex flex-col items-center gap-3">
                    <View className="i-mdi-loading text-5xl text-primary animate-spin" />
                    <Text className="text-base text-muted-foreground">生成中...</Text>
                  </View>
                ) : storeQrUrl ? (
                  <Image src={storeQrUrl} mode="aspectFit" style={{ width: '224px', height: '224px' }} />
                ) : (
                  <View className="flex flex-col items-center gap-2">
                    <View className="i-mdi-qrcode-scan text-5xl text-muted-foreground/30" />
                    <Text className="text-base text-muted-foreground/50">加载失败</Text>
                  </View>
                )}
              </View>

              {/* 提示文字 */}
              <Text className="text-sm text-muted-foreground text-center mt-5 leading-relaxed"
                style={{ maxWidth: '280px' }}>
                扫码自动进入「{store?.name}」，新用户注册即成为您的推荐关系，享受推广奖励
              </Text>
            </View>

            {/* 操作按钮 */}
            <View className="flex gap-3 mt-4">
              {storeQrUrl && (
                <Button
                  className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-border !rounded-2xl"
                  onClick={handleSaveStoreQr}>
                  <View className="py-3 flex items-center justify-center gap-2">
                    <View className="i-mdi-download text-xl text-muted-foreground" />
                    <Text className="text-lg font-bold text-muted-foreground">保存图片</Text>
                  </View>
                </Button>
              )}
              <Button
                openType="share"
                className="!flex-1 !m-0 !p-0 !rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #C2410C, #EA580C)', border: 'none' }}>
                <View className="py-3 flex items-center justify-center gap-2">
                  <View className="i-mdi-share-variant text-white text-xl" />
                  <Text className="text-lg font-bold text-white">分享二维码</Text>
                </View>
              </Button>
            </View>
          </View>
        </View>
      )}
     </View>
   </RouteGuard>
  )
}

/* wrapped by RouteGuard - see render */
export default MerchantCenterPage
