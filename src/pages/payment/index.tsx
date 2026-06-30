// @title 支付
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Taro from '@tarojs/taro'
import { getCartItems, getMyBalance, createOrderV2, getWechatPayParams, getWechatOpenid } from '@/db/api'
import { withRouteGuard } from '@/components/RouteGuard'
import type { PayMode } from '@/db/types'

// 万分位精度
function toFixed4(n: number) { return Math.round(n * 10000) / 10000 }
// 金豆换算比例：1金豆 = 0.01元
const GOLD_BEAN_RATE = 0.01

function PaymentPage() {
  const params = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])
  const totalParam = useMemo(() => parseFloat((params as any).total || '0'), [params])
  const cartIds = useMemo(() => {
    const raw = (params as any).cartIds
    return raw ? decodeURIComponent(raw).split(',').filter(Boolean) : []
  }, [params])
  const productIdParam = useMemo(() => (params as any).productId ? decodeURIComponent((params as any).productId) : '', [params])

  const [payMode, setPayMode] = useState<PayMode>('wxpay')
  const [goldBeansToUse, setGoldBeansToUse] = useState(0)   // 用户选择使用的金豆
  const [balance, setBalance] = useState(0)                  // 金豆余额
  const [countdown, setCountdown] = useState(30 * 60)
  const [paying, setPaying] = useState(false)
  const [orderNo, setOrderNo] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [totalAmount, setTotalAmount] = useState(totalParam)

  // 防重复支付双重锁
  const _payLock = useRef(false)
  const _pendingOrderNo = useRef('')

  // 加载购物车商品 + 金豆余额
  const loadData = useCallback(async () => {
    const [bal] = await Promise.all([getMyBalance()])
    setBalance(bal.balance)

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
      // 从商品详情页"立即购买"跳转：用 productId 加载单个商品
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

  // 倒计时
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(t)
          Taro.showModal({ title: '订单超时', content: '支付超时，订单已取消', showCancel: false, success: () => Taro.navigateBack() })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

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

  const handlePay = async () => {
    if (_payLock.current) { Taro.showToast({ title: '支付处理中，请稍候', icon: 'none' }); return }
    _payLock.current = true
    setPaying(true)

    try {
      // 1. 创建订单
      const orderResult = await createOrderV2({
        items: items.length > 0 ? items : [{ product_id: (params as any).productId || '', store_id: '', store_name: '', product_name: '商品', product_image: null, price: totalAmount, quantity: 1 }],
        total_amount: totalAmount,
        pay_mode: payMode,
        gold_beans_to_use: actualGoldBeansUsed,
        idempotency_key: `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        service_type: serviceType,
      })

      if (!orderResult) throw new Error('创建订单失败，请重试')
      setOrderNo(orderResult.order.order_no)
      _pendingOrderNo.current = orderResult.order.order_no

      // 2. 纯金豆：已在服务端完成，直接跳转
      if (payMode === 'pure_gold') {
        Taro.showToast({ title: '金豆支付成功！', icon: 'success' })
        setTimeout(() => Taro.redirectTo({ url: '/pages/order-center/index?tab=pending_receive' }), 1500)
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
      setTimeout(() => Taro.redirectTo({ url: '/pages/order-center/index?tab=pending_receive' }), 1500)

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
    { key: 'pure_gold', icon: 'i-mdi-star-circle', label: '纯金豆支付', color: '#D97706', desc: `余额 ${balance} 金豆`, disabled: balance < Math.ceil(totalAmount / GOLD_BEAN_RATE) },
  ]

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* 顶部返回键 */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={handleCancel}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">确认支付</span>
      </div>
      {/* 倒计时 */}
      <div className="mx-4 mt-6 p-5 rounded-2xl bg-card border border-border flex flex-col items-center">
        <div className="i-mdi-clock-outline text-4xl text-primary mb-2" />
        <p className="text-xl text-muted-foreground">请在以下时间内完成支付</p>
        <p className="text-4xl font-bold text-primary mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{countdownDisplay}</p>
        {orderNo && <p className="text-base text-muted-foreground mt-2">订单号：{orderNo}</p>}
      </div>

      {/* 金额汇总卡 */}
      <div className="mx-4 mt-4 p-4 rounded-2xl bg-card border-2 border-primary/30">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-foreground">订单金额</span>
          <span className="text-2xl font-bold text-foreground">¥{totalAmount.toFixed(2)}</span>
        </div>
        {deductYuan > 0 && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-xl text-muted-foreground">金豆抵扣（{actualGoldBeansUsed}豆）</span>
            <span className="text-xl font-bold text-primary">-¥{deductYuan.toFixed(2)}</span>
          </div>
        )}
        <div className="h-px bg-border mt-3 mb-3" />
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-foreground">实付金额</span>
          <span className="text-3xl font-bold text-primary">
            {payMode === 'pure_gold' ? `${actualGoldBeansUsed} 金豆` : `¥${wxpayAmount.toFixed(2)}`}
          </span>
        </div>
        {balance > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="i-mdi-star-circle text-xl" style={{ color: '#D97706' }} />
            <span className="text-xl text-muted-foreground">金豆余额：<span className="font-bold text-foreground">{balance} 豆</span></span>
          </div>
        )}
      </div>

      {/* 服务方式选择 */}
      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xl font-bold text-foreground">用餐方式</span>
        </div>
        <div className="flex gap-0">
          {([
            { key: 'dine_in', label: '堂食', icon: 'i-mdi-silverware-fork-knife' },
            { key: 'self_pickup', label: '自取', icon: 'i-mdi-walk' },
            { key: 'delivery', label: '外卖配送', icon: 'i-mdi-moped' },
          ] as const).map((m, i, arr) => (
            <div key={m.key}
              className={`flex-1 flex flex-col items-center gap-1 py-4 ${i < arr.length - 1 ? 'border-r border-border' : ''} ${serviceType === m.key ? 'bg-primary/5' : ''}`}
              onClick={() => setServiceType(m.key)}>
              <div className={`${m.icon} text-3xl ${serviceType === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xl font-bold ${serviceType === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</span>
              {serviceType === m.key && <div className="w-5 h-1 rounded-full bg-primary" />}
            </div>
          ))}
        </div>
      </div>

      {/* 支付方式选择 */}
      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xl font-bold text-foreground">选择支付方式</span>
        </div>
        {payModes.map(m => (
          <div key={m.key}
            className={`flex items-center gap-4 px-4 py-4 border-b border-border last:border-0 ${m.disabled ? 'opacity-40' : ''} ${payMode === m.key ? 'bg-primary/5' : ''}`}
            onClick={() => !m.disabled && handleModeChange(m.key)}>
            <div className={`${m.icon} text-3xl flex-shrink-0`} style={{ color: m.color }} />
            <div className="flex-1">
              <p className="text-xl font-bold text-foreground">{m.label}</p>
              <p className="text-base text-muted-foreground">{m.desc}</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payMode === m.key ? 'border-primary bg-primary' : 'border-border'}`}>
              {payMode === m.key && <div className="i-mdi-check text-white text-xs" />}
            </div>
          </div>
        ))}
      </div>

      {/* 混合支付：金豆抵扣输入 */}
      {payMode === 'hybrid' && balance > 0 && (
        <div className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xl font-bold text-foreground">金豆抵扣数量</span>
            <span className="text-xl text-muted-foreground">可用 {maxGoldBeans} 豆</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button"
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              onClick={() => setGoldBeansToUse(Math.max(0, goldBeansToUse - 10))}>
              <div className="i-mdi-minus text-xl text-foreground" />
            </button>
            <div className="flex-1 border-2 border-input rounded-xl px-4 py-2 bg-background overflow-hidden">
              <input
                type="number"
                className="w-full text-2xl font-bold text-center text-foreground bg-transparent outline-none"
                value={goldBeansToUse}
                onInput={(e) => { const ev = e as any; const v = parseInt(ev.detail?.value ?? ev.target?.value ?? '0') || 0; setGoldBeansToUse(Math.min(maxGoldBeans, Math.max(0, v))) }}
              />
            </div>
            <button type="button"
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              onClick={() => setGoldBeansToUse(Math.min(maxGoldBeans, goldBeansToUse + 10))}>
              <div className="i-mdi-plus text-xl text-foreground" />
            </button>
            <button type="button"
              className="flex items-center justify-center leading-none rounded-xl bg-primary/10"
              onClick={() => setGoldBeansToUse(maxGoldBeans)}>
              <div className="py-2 px-3 text-xl text-primary font-bold">全用</div>
            </button>
          </div>
        </div>
      )}

      {/* 分润提示 */}
      <div className="mx-4 mt-4 p-3 rounded-xl bg-muted flex items-center gap-2">
        <div className="i-mdi-gift-outline text-2xl text-primary flex-shrink-0" />
        <p className="text-base text-muted-foreground">支付成功后，将为您获得 <span className="font-bold text-primary">约{Math.floor(totalAmount * 0.0225)}积分</span> 奖励</p>
      </div>

      {/* 操作按钮 */}
      <div className="mx-4 mt-4 flex flex-col gap-3">
        <button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${paying ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handlePay}>
          <div className="py-4 text-2xl font-bold text-white">{payBtnText}</div>
        </button>
        <button type="button"
          className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
          onClick={handleCancel}>
          <div className="py-4 text-xl text-muted-foreground">取消支付</div>
        </button>
      </div>

      <div className="mx-4 mt-4 pb-6">
        <p className="text-base text-muted-foreground text-center">支付即视为同意《来店有喜交易规则》</p>
      </div>
    </div>
  )
}

export default withRouteGuard(PaymentPage)
