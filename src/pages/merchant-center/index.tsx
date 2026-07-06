// @title 商家管理中心（仪表盘）
import { useState, useEffect } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, Button, Image } from '@tarojs/components'
import { getMerchantStore, getMerchantProducts, getMerchantOrders, getMyMerchantApplication, generateQrcode } from '@/db/api'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

// 仪表盘导航项
const NAV_ITEMS = [
  { to: '/pages/merchant-products/index', icon: 'i-mdi-package-variant', label: '商品管理', color: 'bg-orange-500', key: 'products' },
  { to: '/pages/merchant-orders/index', icon: 'i-mdi-receipt-text-outline', label: '订单管理', color: 'bg-blue-500', key: 'orders' },
  { to: '/pages/merchant-members/index', icon: 'i-mdi-account-group', label: '会员管理', color: 'bg-purple-500', key: 'members' },
  { to: '/pages/merchant-coupons/index', icon: 'i-mdi-ticket-percent', label: '优惠券', color: 'bg-pink-500', key: 'coupons' },
  { to: '/pages/merchant-analytics/index', icon: 'i-mdi-chart-line', label: '数据分析', color: 'bg-green-500', key: 'analytics' },
  { to: '/pages/merchant-settings/index', icon: 'i-mdi-store-cog', label: '店铺设置', color: 'bg-gray-500', key: 'settings' },
  { to: '/pages/withdraw/index', icon: 'i-mdi-cash-multiple', label: '佣金提现', color: 'bg-yellow-500', key: 'withdraw' },
  { to: '/pages/merchant-products/index?tab=ads', icon: 'i-mdi-bullhorn', label: '广告管理', color: 'bg-red-500', key: 'ads' },
]

function MerchantCenterPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [stats, setStats] = useState({ products: 0, online: 0, orders: 0, todayOrders: 0, members: 5, crossStore: 2 })
  const [merchantAppStatus, setMerchantAppStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 门店二维码相关状态
  const [showQrModal, setShowQrModal] = useState(false)
  const [storeQrUrl, setStoreQrUrl] = useState('')
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      getMerchantStore(),
      getMyMerchantApplication(),
    ]).then(async ([s, app]) => {
      setStore(s)
      setMerchantAppStatus(app?.status || null)
      
      if (s) {
        try {
          const [prods, ords] = await Promise.all([
            getMerchantProducts(s.id),
            getMerchantOrders(s.id),
          ])
          const online = prods.filter(p => p.is_active).length
          const today = new Date().toISOString().slice(0, 10)
          const todayOrders = ords.filter(o => (o.orders?.created_at || '').startsWith(today)).length
          setStats({ products: prods.length, online, orders: ords.length, todayOrders, members: 5, crossStore: 2 })
        } catch (error) {
          console.error('[MerchantCenter] 加载统计数据失败:', error)
          // 即使统计失败，也设置默认值
          setStats({ products: 0, online: 0, orders: 0, todayOrders: 0, members: 0, crossStore: 0 })
        }
      }
      
      // 无论成功失败，都要设置loading为false
      setLoading(false)
    }).catch(error => {
      console.error('[MerchantCenter] 加载商家信息失败:', error)
      setLoading(false)
    })
  }, [])

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

  // 分享配置：携带门店链接（用于锁客）
  useShareAppMessage(() => ({
    title: `${store?.name || '来店有喜'} · 扫码进店购物`,
    path: store ? `/pages/store-home/index?id=${store.id}` : '/pages/reward-shop/index',
    imageUrl: store?.image_url || '',
  }))
  useShareTimeline(() => ({
    title: `${store?.name || '来店有喜'} · 好店推荐，扫码进店`,
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
            <Text className="text-xl font-bold text-foreground">{store.name}</Text>
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
            <Text className={`text-2xl font-bold ${s.color}`}>{s.value}</Text>
            <Text className="text-xs text-muted-foreground">{s.label}</Text>
            <Text className="text-xs text-muted-foreground">{s.sub}</Text>
          </View>
        ))}
      </View>

      {/* 功能导航网格 */}
      <View className="grid grid-cols-4 gap-3 px-4 mt-4">
        {NAV_ITEMS.map(item => (
          <View key={item.key} className="flex flex-col items-center gap-2 py-4 px-2 bg-card rounded-2xl border border-border"
            onClick={() => Taro.navigateTo({ url: item.to })}>
            <View className={`w-10 h-10 rounded-2xl ${item.color} flex items-center justify-center`}>
              <View className={`${item.icon} text-white text-xl`} />
            </View>
            <Text className="text-xs text-foreground text-center font-bold">{item.label}</Text>
          </View>
        ))}
      </View>

      {/* 快捷操作 */}
      <View className="px-4 mt-4">
        <Text className="text-base font-bold text-foreground mb-2">快捷操作</Text>
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
            onClick={() => Taro.navigateTo({ url: '/pages/merchant-campaigns/index?action=create' })}>
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
          <Text className="text-base font-bold text-foreground">最近订单</Text>
          <Button className="!p-0 !bg-transparent !border-none" onClick={() => Taro.navigateTo({ url: '/pages/merchant-orders/index' })}>
            <Text className="text-sm text-primary">查看全部 →</Text>
          </Button>
        </View>
        <View className="bg-card rounded-2xl border border-border p-4 flex items-center justify-center">
          <Text className="text-base text-muted-foreground">加载中…</Text>
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
                扫码自动进入「{store?.name}」，新用户注册即成为您的下线，享受消费佣金
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
