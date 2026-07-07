// @title 支付
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { getCartItems, getMyBalance, createOrderV2, getWechatPayParams, getWechatOpenid, getMyProfile, getMyAddresses } from '@/db/api'
import { supabase } from '@/client/supabase'
import { RouteGuard } from '@/components/RouteGuard'
import type { PayMode } from '@/db/types'
import { calculateCommissionV5, RANK_CONFIG_TABLE_V5 } from '@/utils/commission-calculator-v5'
import { updateUserConsumptionAfterPayment } from '@/utils/commission-helpers'

// 万分位精度
function toFixed4(n: number) { return Math.round(n * 10000) / 10000 }

// 统一 V5 分佣计算并落库（与后端 distributeCommissionDirect 完全一致：展示=实发）
async function runV5Commission(orderId: string, storeId: string, totalAmount: number) {
  try {
    if (!orderId) return
    const profile = await getMyProfile()
    if (!profile) return
    const { data: storeData } = await supabase
      .from('stores').select('referral_rate').eq('id', storeId || '').maybeSingle()
    const discountRate = (storeData as any)?.referral_rate ?? 0.09

    // 推荐链：直接推荐人（拿一级大头 l1）+ 其上级（二级 l2）
    const directReferrerId = profile.referrer_id || null
    let staffId: string | undefined, staffConsumption = 0
    let referrerId2: string | undefined, ref2Consumption = 0
    if (directReferrerId) {
      const { data: refP } = await supabase.from('profiles')
        .select('total_consumption, invited_by')
        .eq('id', directReferrerId).maybeSingle()
      staffId = directReferrerId
      staffConsumption = refP?.total_consumption || 0
      if (refP?.invited_by) {
        const { data: ref2P } = await supabase.from('profiles')
          .select('total_consumption')
          .eq('id', refP.invited_by).maybeSingle()
        referrerId2 = refP.invited_by
        ref2Consumption = ref2P?.total_consumption || 0
      }
    }

    const commissionResult = calculateCommissionV5({
      orderAmount: totalAmount,
      discountRate,
      staffId,
      staffTotalConsumption: staffConsumption,
      referrerId: referrerId2,
      referrerTotalConsumption: ref2Consumption,
      buyerId: profile.id,
      buyerTotalConsumption: profile.total_consumption || 0,
    })
    await supabase.from('orders').update({
      l1_commission: commissionResult.l1Commission,
      l2_commission: commissionResult.l2Commission,
      buyer_points: Math.round(commissionResult.buyerPoints),
      platform_income: commissionResult.platformTotalIncome,
      commission_calculated: true,
    }).eq('id', orderId)
    console.log('[V5] 佣金计算完成', commissionResult)
  } catch (err) {
    console.error('[V5] 佣金计算失败', err)
  }
}
// 金豆换算比例：1金豆 = 1元（金豆:积分:元 = 1:1:1）
const GOLD_BEAN_RATE = 1

function PaymentPage() {
  const params = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])
  const totalParam = useMemo(() => parseFloat((params as any).total || '0'), [params])
  const cartIds = useMemo(() => {
    const raw = (params as any).cartIds
    return raw ? decodeURIComponent(raw).split(',').filter(Boolean) : []
  }, [params])
  const productIdParam = useMemo(() => (params as any).productId ? decodeURIComponent((params as any).productId) : '', [params])

  const [payMode, setPayMode] = useState<PayMode>('wxpay')
  const [goldBeansToUse, setGoldBeansToUse] = useState(0)
  const [balance, setBalance] = useState(0)
  const [countdown, setCountdown] = useState(30 * 60)
  const [paying, setPaying] = useState(false)
  const [orderNo, setOrderNo] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [totalAmount, setTotalAmount] = useState(totalParam)
  const [isMultiStore, setIsMultiStore] = useState(false)
  const [parentOrderNo, setParentOrderNo] = useState<string | null>(null)
  const [userTotalConsumption, setUserTotalConsumption] = useState(0) // 用户个人累计消费
  const [addresses, setAddresses] = useState<any[]>([])  // 收货地址列表
  const [selectedAddress, setSelectedAddress] = useState<any>(null)  // 选中的地址

  // V5算法：根据用户消费数据计算段位（前端实时计算，仅基于个人累计消费）
  const v5RankInfo = useMemo(() => {
    const sortedRanks = [...RANK_CONFIG_TABLE_V5].sort((a, b) => a.minDynamicScore - b.minDynamicScore)
    const totalScore = userTotalConsumption
    // 找到最高满足的段位
    let matched = sortedRanks[0]
    for (const r of sortedRanks) {
      if (totalScore >= r.minDynamicScore) matched = r
    }
    return {
      rankName: matched.rank,
      l1Ratio: Math.round(matched.l1CommissionRate * 100),
      l2Ratio: Math.round(matched.l2CommissionRate * 100),
      pointsRatio: Math.round(matched.pointsRate * 100),
    }
  }, [userTotalConsumption])

  // 防重复支付双重锁
  const _payLock = useRef(false)
  const _pendingOrderNo = useRef('')

  // 加载购物车商品 + 金豆余额 + 用户消费数据 + 收货地址
  const loadData = useCallback(async () => {
    const [bal, profile, addrList] = await Promise.all([
      getMyBalance(),
      getMyProfile().catch(() => null), // 获取用户资料（含累计消费）
      getMyAddresses().catch(() => []),  // 获取收货地址列表
    ])

    setBalance(bal.gold_beans)  // 1 金豆 = 1 元；UI 展示与扣减列统一
    setAddresses(addrList)

    // 自动选中默认地址
    const defaultAddr = addrList.find((a: any) => a.is_default)
    if (defaultAddr) setSelectedAddress(defaultAddr)
    else if (addrList.length > 0) setSelectedAddress(addrList[0])

    // 个人累计消费
    const totalConsumption = profile?.total_consumption || 0
    setUserTotalConsumption(totalConsumption)

    if (cartIds.length > 0) {
      const cartItems = await getCartItems()
      const selected = cartItems.filter(i => cartIds.includes(i.id))
      const mapped = selected.map(i => ({
        product_id: i.product_id, store_id: i.store_id,
        store_name: i.stores?.name || '', product_name: i.products?.name || '',
        product_image: i.products?.image_url || null,
        price: i.products?.price || 0, quantity: i.quantity,
      }))
      setItems(mapped)
      setTotalAmount(toFixed4(mapped.reduce((s, i) => s + toFixed4(i.price * i.quantity), 0)))
    } else if (productIdParam) {
      const { getProductById } = await import('@/db/api')
      const prod = await getProductById(productIdParam)
      if (prod) {
        const mapped = [{
          product_id: prod.id, store_id: prod.store_id,
          store_name: '', product_name: prod.name,
          product_image: prod.image_url || null,
          price: prod.price, quantity: 1,
        }]
        setItems(mapped)
        setTotalAmount(toFixed4(prod.price))
      }
    }
  }, [cartIds])

  useEffect(() => { loadData() }, [loadData])

  // 从地址管理页返回后，重新加载地址列表
  useDidShow(() => {
    if (serviceType === 'delivery') {
      getMyAddresses().then(addrList => {
        setAddresses(addrList)
        const defaultAddr = addrList.find((a: any) => a.is_default)
        if (defaultAddr) setSelectedAddress(defaultAddr)
        else if (addrList.length > 0 && !selectedAddress) setSelectedAddress(addrList[0])
      }).catch(() => {})
    }
  })

  // 倒计时（P0 修复：超时取消加 status='pending_pay' 守卫，避免覆盖已支付订单）
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(t)
          // 超时取消订单（如果已创建，且仍未支付）
          if (orderNo) {
            supabase.from('orders')
              .update({ status: 'cancelled' })
              .eq('order_no', orderNo)
              .eq('status', 'pending_pay')  // ⬅ 守卫：已支付/已金豆支付/已取消的订单不被覆盖
              .then(({ data }) => {
                if (data && (data as any[]).length > 0) {
                  console.log('[支付超时] 订单已取消', orderNo)
                } else {
                  console.log('[支付超时] 订单状态已变更，跳过取消', orderNo)
                }
              })
              .catch(err => console.error('[支付超时] 取消订单失败', err))
          }
          Taro.showModal({ title: '订单超时', content: '支付超时，订单已取消', showCancel: false, success: () => Taro.navigateBack() })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [orderNo])

  const countdownDisplay = useMemo(() => {
    const m = Math.floor(countdown / 60); const s = countdown % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [countdown])

  const [serviceType, setServiceType] = useState<'dine_in' | 'self_pickup' | 'delivery'>('delivery')

  // 实时计算：金豆最大可用 & 实付金额
  const maxGoldBeans = useMemo(() => Math.min(balance, Math.floor(totalAmount / GOLD_BEAN_RATE)), [balance, totalAmount])
  const deductYuan = useMemo(() => toFixed4(Math.min(goldBeansToUse, maxGoldBeans) * GOLD_BEAN_RATE), [goldBeansToUse, maxGoldBeans])
  const wxpayAmount = useMemo(() => toFixed4(totalAmount - deductYuan), [totalAmount, deductYuan])
  const actualGoldBeansUsed = useMemo(() => Math.min(goldBeansToUse, maxGoldBeans), [goldBeansToUse, maxGoldBeans])

  // 切换支付方式时同步金豆使用量
  const handleModeChange = (mode: PayMode) => {
    setPayMode(mode)
    if (mode === 'pure_gold') setGoldBeansToUse(maxGoldBeans)
    else if (mode === 'wxpay') setGoldBeansToUse(0)
    // hybrid 保持当前输入
  }

  // 指数退避获取 openid（最多3次）
  const fetchOpenidWithRetry = async (): Promise<string | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { code } = await Taro.login()
        const openid = await getWechatOpenid(code)
        if (openid) return openid
      } catch { /* ignore */ }
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)))
    }
    return null
  }

  // 跨门店订单：支付成功后确认所有子订单
  const confirmMultiStoreOrders = async (parentOrderNo: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'pending_ship', paid_at: new Date().toISOString() })
        .eq('parent_order_no', parentOrderNo)
        .eq('status', 'pending_pay')
      
      if (error) {
        console.error('[跨门店支付] 确认子订单失败', error)
      } else {
        console.log('[跨门店支付] 所有子订单已确认')
      }
    } catch (err) {
      console.error('[跨门店支付] 确认子订单异常', err)
    }
  }

  const handlePay = async () => {
    if (_payLock.current) { Taro.showToast({ title: '支付处理中，请稍候', icon: 'none' }); return }
    
    // 外卖配送必须选地址
    if (serviceType === 'delivery' && !selectedAddress) {
      Taro.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }
    
    _payLock.current = true
    setPaying(true)

    try {
      // 拼接地址字符串
      const addressStr = selectedAddress
        ? `${selectedAddress.name} ${selectedAddress.phone} ${[selectedAddress.province, selectedAddress.city, selectedAddress.district, selectedAddress.detail].filter(Boolean).join(' ')}`
        : ''

      // 1. 创建订单
      const orderResult = await createOrderV2({
        items: items.length > 0 ? items : [{ product_id: (params as any).productId || '', store_id: '', store_name: '', product_name: '商品', product_image: null, price: totalAmount, quantity: 1 }],
        total_amount: totalAmount,
        pay_mode: payMode,
        gold_beans_to_use: actualGoldBeansUsed,
        idempotency_key: `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        service_type: serviceType,
        address: serviceType === 'delivery' ? addressStr : undefined,
      })

      if (!orderResult) throw new Error('创建订单失败，请重试')
      setOrderNo(orderResult.order.order_no)
      _pendingOrderNo.current = orderResult.order.order_no
      
      // 跨门店结算：记录父订单号
      if (orderResult.is_multi_store) {
        setIsMultiStore(true)
        setParentOrderNo(orderResult.order.parent_order_no)
      }

      // 2. 纯金豆：已在服务端完成，直接跳转
      if (payMode === 'pure_gold') {
      Taro.showToast({ title: '金豆支付成功！', icon: 'success' })
      
      // 跨门店结算：确认所有子订单（纯金豆已在服务端完成，这里只是保险）
      if (isMultiStore && parentOrderNo) {
        await confirmMultiStoreOrders(parentOrderNo)
      }
      
      // V5算法：金豆支付成功后计算佣金并写入订单（含真实推荐人段位）
      try {
        await runV5Commission(orderResult?.order?.id || '', items[0]?.store_id || '', totalAmount)
      } catch (err) {
        console.error('[V5] 金豆支付佣金计算失败', err)
      }
      
      // 支付成功 → 引导情绪确权（消费即确权路线），由确权页完成/跳过再进订单中心
      setTimeout(() => {
        Taro.navigateTo({
          url: `/pages/emotion-claim/index?orderNo=${encodeURIComponent(orderResult?.order?.order_no || '')}&productId=${encodeURIComponent(items[0]?.id || '')}&storeId=${encodeURIComponent(items[0]?.store_id || '')}`,
        })
      }, 1500)
        return
      }

      // 3. 微信支付（纯微信 or 混合）
      const isWeapp = Taro.getEnv() === 'WEAPP'
      if (!isWeapp) {
        Taro.showToast({ title: '非微信小程序环境无法发起支付，请在正式版微信小程序中使用', icon: 'none' })
        return
      }

      // 获取 openid（指数退避3次）
      const openid = await fetchOpenidWithRetry()
      if (!openid) throw new Error('获取用户信息失败，请确认在微信小程序中打开')

      // 获取预支付参数
      const payParams = await getWechatPayParams(orderResult.order.id, openid)
      if (!payParams) throw new Error('微信支付参数获取失败，请检查商户配置')

      // 调起微信支付
      await Taro.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType as 'RSA',
        paySign: payParams.paySign,
      })

      Taro.showToast({ title: '支付成功！', icon: 'success' })
      
      // 支付成功 → 更新订单状态为 paid
      try {
        if (isMultiStore && parentOrderNo) {
          await supabase.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('parent_order_no', parentOrderNo)
        } else if (orderResult?.order?.order_no) {
          await supabase.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('order_no', orderResult.order.order_no)
        }
      } catch (e) { console.warn('[支付成功] 更新状态失败(不影响)', e) }
      
      // 跨门店结算：确认所有子订单
      if (isMultiStore && parentOrderNo) {
        await confirmMultiStoreOrders(parentOrderNo)
      }
      
      // V5算法：支付成功后计算佣金并写入订单（含真实推荐人段位）
      try {
        await runV5Commission(orderResult?.order?.id || '', items[0]?.store_id || '', totalAmount)
      } catch (err) {
        console.error('[V5] 佣金计算失败', err)
      }
      
      // 支付成功 → 引导情绪确权（消费即确权路线），由确权页完成/跳过再进订单中心
      setTimeout(() => {
        Taro.navigateTo({
          url: `/pages/emotion-claim/index?orderNo=${encodeURIComponent(orderResult?.order?.order_no || '')}&productId=${encodeURIComponent(items[0]?.id || '')}&storeId=${encodeURIComponent(items[0]?.store_id || '')}`,
        })
      }, 1500)

    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('cancel') || msg.includes('用户取消')) {
        Taro.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        Taro.showToast({ title: msg || '支付失败，请重试', icon: 'none' })
      }
    } finally {
      setPaying(false)
      _payLock.current = false
    }
  }

  const handleCancel = () => {
    Taro.showModal({ title: '取消支付', content: '确认放弃本次支付？订单将保留30分钟', success: (res) => {
      if (res.confirm) Taro.navigateBack()
    }})
  }

  // 支付按钮文案
  const payBtnText = useMemo(() => {
    if (paying) return '支付中...'
    if (payMode === 'pure_gold') return `确认支付 ${actualGoldBeansUsed} 金豆`
    if (payMode === 'hybrid') return `确认支付 ¥${wxpayAmount.toFixed(2)} + ${actualGoldBeansUsed}金豆`
    return `确认支付 ¥${totalAmount.toFixed(2)}`
  }, [paying, payMode, actualGoldBeansUsed, wxpayAmount, totalAmount])

  const payModes: Array<{ key: PayMode; icon: string; label: string; color: string; desc: string; disabled?: boolean }> = [
    { key: 'wxpay', icon: 'i-mdi-wechat', label: '微信支付', color: '#07C160', desc: `¥${totalAmount.toFixed(2)}` },
    { key: 'hybrid', icon: 'i-mdi-lightning-bolt', label: '金豆+微信混合', color: '#C2410C', desc: `金豆抵 ¥${deductYuan.toFixed(2)}，余付 ¥${wxpayAmount.toFixed(2)}`, disabled: balance <= 0 },
    { key: 'pure_gold', icon: 'i-mdi-star-circle', label: '纯金豆支付', color: '#D97706', desc: `金豆 ${balance}`, disabled: balance < Math.ceil(totalAmount / GOLD_BEAN_RATE) },
  ]

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {/* 订单摘要卡 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl">
        <Text className="flex-1 text-center text-xl font-bold text-foreground pr-10">确认支付</Text>
      </View>

      {/* 倒计时 */}
      <View className="mx-4 mt-6 p-5 rounded-2xl bg-card border border-border flex flex-col items-center">
        <View className="i-mdi-clock-outline text-4xl text-primary mb-2" />
        <Text className="text-xl text-muted-foreground">请在以下时间内完成支付</Text>
        <Text className="text-4xl font-bold text-primary mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{countdownDisplay}</Text>
        {orderNo && <Text className="text-base text-muted-foreground mt-2">订单号：{orderNo}</Text>}
      </View>

      {/* 金额汇总卡 */}
      <View className="mx-4 mt-4 p-4 rounded-2xl bg-card border-2 border-primary/30">
        <View className="flex items-center justify-between">
          <Text className="text-xl font-bold text-foreground">订单金额</Text>
          <Text className="text-2xl font-bold text-foreground">¥{totalAmount.toFixed(2)}</Text>
        </View>
        {deductYuan > 0 && (
          <View className="flex items-center justify-between mt-2">
            <Text className="text-xl text-muted-foreground">金豆抵扣（{actualGoldBeansUsed}豆）</Text>
            <Text className="text-xl font-bold text-primary">-¥{deductYuan.toFixed(2)}</Text>
          </View>
        )}
        <View className="h-px bg-border mt-3 mb-3" />
        <View className="flex items-center justify-between">
          <Text className="text-xl font-bold text-foreground">实付金额</Text>
          <Text className="text-3xl font-bold text-primary">
            {payMode === 'pure_gold' ? `${actualGoldBeansUsed} 金豆` : `¥${wxpayAmount.toFixed(2)}`}
          </Text>
        </View>
        {balance > 0 && (
          <View className="flex items-center gap-2 mt-2">
            <View className="i-mdi-star-circle text-xl" style={{ color: '#D97706' }} />
            <Text className="text-xl text-muted-foreground">金豆余额：<Text className="font-bold text-foreground">{balance} 豆</Text></Text>
          </View>
        )}
      </View>

      {/* 服务方式选择 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="px-4 py-3 border-b border-border">
          <Text className="text-xl font-bold text-foreground">用餐方式</Text>
        </View>
        <View className="flex gap-0">
          {([
            { key: 'dine_in', label: '堂食', icon: 'i-mdi-silverware-fork-knife' },
            { key: 'self_pickup', label: '自取', icon: 'i-mdi-walk' },
            { key: 'delivery', label: '外卖配送', icon: 'i-mdi-moped' },
          ] as const).map((m, i, arr) => (
            <View key={m.key}
              className={`flex-1 flex flex-col items-center gap-1 py-4 ${i < arr.length - 1 ? 'border-r border-border' : ''} ${serviceType === m.key ? 'bg-primary/5' : ''}`}
              onClick={() => setServiceType(m.key)}>
              <View className={`${m.icon} text-3xl ${serviceType === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
              <Text className={`text-xl font-bold ${serviceType === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</Text>
              {serviceType === m.key && <View className="w-5 h-1 rounded-full bg-primary" />}
            </View>
          ))}
        </View>
      </View>

      {/* 地址选择（外卖配送时显示） */}
      {serviceType === 'delivery' && (
        <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <View className="px-4 py-3 border-b border-border flex items-center justify-between">
            <Text className="text-xl font-bold text-foreground">收货地址</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/address/index' })}>
              <Text className="text-xl text-primary">管理</Text>
            </View>
          </View>
          {selectedAddress ? (
            <View className="px-4 py-4" onClick={() => Taro.navigateTo({ url: '/pages/address/index' })}>
              <View className="flex items-center gap-2 mb-2">
                <Text className="text-xl font-bold text-foreground">{selectedAddress.name}</Text>
                <Text className="text-xl text-muted-foreground">{selectedAddress.phone}</Text>
                {selectedAddress.is_default && (
                  <Text className="text-base px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">默认</Text>
                )}
              </View>
              <Text className="text-xl text-foreground">
                {[selectedAddress.province, selectedAddress.city, selectedAddress.district, selectedAddress.detail].filter(Boolean).join(' ')}
              </Text>
            </View>
          ) : (
            <View className="px-4 py-8 flex flex-col items-center gap-2"
              onClick={() => Taro.navigateTo({ url: '/pages/address/index' })}>
              <View className="i-mdi-map-marker-plus text-4xl text-primary" />
              <Text className="text-xl text-primary font-bold">新增收货地址</Text>
            </View>
          )}
        </View>
      )}

      {/* 支付方式选择 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="px-4 py-3 border-b border-border">
          <Text className="text-xl font-bold text-foreground">选择支付方式</Text>
        </View>
        {payModes.map(m => (
          <View key={m.key}
            className={`flex items-center gap-4 px-4 py-4 border-b border-border last:border-0 ${m.disabled ? 'opacity-40' : ''} ${payMode === m.key ? 'bg-primary/5' : ''}`}
            onClick={() => !m.disabled && handleModeChange(m.key)}>
            <View className={`${m.icon} text-3xl flex-shrink-0`} style={{ color: m.color }} />
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{m.label}</Text>
              <Text className="text-base text-muted-foreground">{m.desc}</Text>
            </View>
            <View className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payMode === m.key ? 'border-primary bg-primary' : 'border-border'}`}>
              {payMode === m.key && <View className="i-mdi-check text-white text-xs" />}
            </View>
          </View>
        ))}
      </View>

      {/* 混合支付：金豆抵扣输入 */}
      {payMode === 'hybrid' && balance > 0 && (
        <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
          <View className="flex items-center justify-between mb-3">
            <Text className="text-xl font-bold text-foreground">金豆抵扣数量</Text>
            <Text className="text-xl text-muted-foreground">可用 {maxGoldBeans} 豆</Text>
          </View>
          <View className="flex items-center gap-3">
            <View
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              onClick={() => setGoldBeansToUse(Math.max(0, goldBeansToUse - 10))}>
              <View className="i-mdi-minus text-xl text-foreground" />
            </View>
            <View className="flex-1 border-2 border-input rounded-xl px-4 py-2 bg-background overflow-hidden">
              <Input
                type="number"
                className="w-full text-2xl font-bold text-center text-foreground bg-transparent outline-none"
                value={String(goldBeansToUse)}
                onInput={(e) => { const ev = e as any; const v = parseInt(ev.detail?.value ?? ev.target?.value ?? '0') || 0; setGoldBeansToUse(Math.min(maxGoldBeans, Math.max(0, v))) }}
              />
            </View>
            <View
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              onClick={() => setGoldBeansToUse(Math.min(maxGoldBeans, goldBeansToUse + 10))}>
              <View className="i-mdi-plus text-xl text-foreground" />
            </View>
            <View
              className="flex items-center justify-center leading-none rounded-xl bg-primary/10"
              onClick={() => setGoldBeansToUse(maxGoldBeans)}>
              <View className="py-2 px-3 text-xl text-primary font-bold">全用</View>
            </View>
          </View>
        </View>
      )}

      {/* 分润提示 - V4动态积分预览 */}
      <View className="mx-4 mt-4 p-3 rounded-xl bg-muted flex items-center gap-2">
        <View className="i-mdi-gift-outline text-2xl text-primary flex-shrink-0" />
        <View className="flex-1">
          <Text className="text-base text-muted-foreground">
            支付成功后将获得积分奖励
          </Text>
          {v5RankInfo && (
            <View className="flex items-center gap-1 mt-1">
              <Text className="text-xl text-primary font-bold">
                {v5RankInfo.rankName} · L1佣金{v5RankInfo.l1Ratio}% · 积分返还{v5RankInfo.pointsRatio}%
              </Text>
              <Text className="text-base text-primary font-bold">
                预计获得 {Math.round(totalAmount * v5RankInfo.pointsRatio / 100)} 积分
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 操作按钮 */}
      <View className="mx-4 mt-4 flex flex-col gap-3">
        <View
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${paying ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handlePay}>
          <View className="py-4 text-2xl font-bold text-white">{payBtnText}</View>
        </View>
        <View
          className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
          onClick={handleCancel}>
          <View className="py-4 text-xl text-muted-foreground">取消支付</View>
        </View>
      </View>

      <View className="mx-4 mt-4 pb-6"
        onClick={() => Taro.navigateTo({ url: '/pages/trade-rules/index' })}>
        <Text className="text-base text-muted-foreground text-center">支付即视为同意<Text className="text-primary">《来店有喜交易规则》</Text></Text>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default PaymentPage
