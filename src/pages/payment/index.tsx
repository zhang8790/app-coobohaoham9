// @title 支付
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { getCartItems, getMyBalance, createOrderV2, getWechatPayParams, getWechatOpenid, getMyProfile, getMyAddresses, grantEmotionClaim, trackFoodTherapyEvent, removeCartItem } from '@/db/api'
import { supabase } from '@/client/supabase'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { toFoodTherapyInput, checkCartConflicts, type CartConflict } from '@/utils/food-therapy'
import { RouteGuard } from '@/components/RouteGuard'
import { getPendingCheckout, clearPendingCheckout } from '@/utils/checkoutCache'
import type { PayMode } from '@/db/types'
import { calculateCommissionV5 } from '@/utils/commission-calculator-v5'

// 万分位精度
function toFixed4(n: number) { return Math.round(n * 10000) / 10000 }

// 统一 V5 分佣计算并落库（与后端 distributeCommissionDirect 完全一致：展示=实发）
async function runV5Commission(orderId: string, storeId: string, totalAmount: number) {
  try {
    if (!orderId) return
    const profile = await getMyProfile()
    if (!profile) return
    // storeId 为空时不发 stores 查询（避免 id=eq. 空参数导致 400），直接用默认费率
    // 门店回退率：开关开 + 有值 → 门店率；开关开 + 无值 → 全局默认 0.09；开关关 → 0（仅商品让利生效）
    let discountRate = 0.09
    if (storeId) {
      const { data: storeData } = await supabase
        .from('stores').select('referral_rate, referral_rate_enabled').eq('id', storeId).maybeSingle()
      const sd = storeData as any
      const enabled = sd?.referral_rate_enabled !== false
      discountRate = enabled ? (sd?.referral_rate ?? 0.09) : 0
    }
    // 让利点合并规则（按商品自身，金额加权）：每商品用自身 discount_rate（整数%÷100），未设则回退门店率（受开关控制）；
    // 按商品金额(price×qty)加权得到整单混合率，高利润品主导让利池、低利润品少分，绝不二次叠加。与云端真发款一致（展示=实发）。
    try {
      const { data: itemRows } = await supabase
        .from('order_items').select('price, quantity, products(discount_rate)').eq('order_id', orderId)
      const items = (itemRows || []) as Array<{ price?: any; quantity?: any; products?: { discount_rate?: any } | null }>
      let totalAmt = 0, weightedSum = 0
      for (const it of items) {
        const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
        const pct = it?.products?.discount_rate
        const pRate = (typeof pct === 'number' && pct > 0) ? pct / 100 : discountRate
        totalAmt += amt
        weightedSum += amt * pRate
      }
      if (totalAmt > 0) discountRate = weightedSum / totalAmt
    } catch (e) { console.warn('[V5] 读取商品让利点失败，回退店铺让利率', e) }

    // 推荐链：直接推荐人（拿一级大头 l1）+ 其上级（二级 l2）
    const directReferrerId = profile.referrer_id || null
    let staffId: string | undefined, staffConsumption = 0
    let referrerId2: string | undefined, ref2Consumption = 0
    if (directReferrerId) {
      const { data: refP } = await supabase.from('profiles')
        .select('total_consumption, referrer_id')
        .eq('id', directReferrerId).maybeSingle()
      staffId = directReferrerId
      staffConsumption = refP?.total_consumption || 0
      if (refP?.referrer_id) {
        const { data: ref2P } = await supabase.from('profiles')
          .select('total_consumption')
          .eq('id', refP.referrer_id).maybeSingle()
        referrerId2 = refP.referrer_id
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
      buyerTotalConsumption: profile.total_consumption || 0})
    await supabase.from('orders').update({
      l1_commission: commissionResult.l1Commission,
      l2_commission: commissionResult.l2Commission,
      buyer_points: Math.round(commissionResult.buyerPoints),
      platform_income: commissionResult.platformTotalIncome,
      commission_calculated: true}).eq('id', orderId)
    console.log('[V5] 佣金计算完成', commissionResult)
  } catch (err) {
    console.error('[V5] 佣金计算失败', err)
  }
}
// 支付成功后自动确权（用户侧：下单即默认确权，无需跳转）。best-effort，不阻断支付主流程。
async function grantOneClaim(orderNo: string, item: any) {
  if (!orderNo || !item) return
  try {
    const res = await grantEmotionClaim({
      orderNo,
      productId: item.product_id || '',
      storeId: item.store_id || '',
      selectedEmotion: [],
      badgeText: '情绪确权'})
    if (res.ok) console.log('[确权] 支付后自动确权成功', orderNo)
    else console.warn('[确权] 支付后自动确权跳过', orderNo, res?.already ? '已确权' : '未过闸')
  } catch (e) {
    console.warn('[确权] 支付后自动确权异常(不影响订单)', e)
  }
}
// 单店直接确权；跨门店按子订单号(C+parent+storeId前4位)逐店确权
async function autoClaimAfterPay(ctx: {
  orderNo: string
  isMultiStore: boolean
  parentOrderNo?: string | null
  items: any[]
}) {
  try {
    const { orderNo, isMultiStore, parentOrderNo, items } = ctx
    if (!items?.length) return
    if (isMultiStore && parentOrderNo) {
      const stores = [...new Set(items.map((i: any) => i.store_id).filter(Boolean))] as string[]
      for (const sid of stores) {
        const subNo = `C${parentOrderNo}${String(sid).slice(0, 4)}`
        const it = items.find((i: any) => i.store_id === sid)
        await grantOneClaim(subNo, it)
      }
    } else if (orderNo) {
      await grantOneClaim(orderNo, items[0])
    }
  } catch (e) {
    console.warn('[确权] 自动确权批量异常(不影响订单)', e)
  }
}
// 情绪豆抵扣比例：1 情绪豆 = 1 元（情绪豆与人民币 1:1 锚定，余额即抵扣额，与数据库 profiles.tb_balance 单位一致）
const GOLD_BEAN_RATE = 1

// 支付成功后的订单状态：配送走「待发货」；到店消费（堂食）当场使用，支付即「待评价+已使用」，跳过待核销
function paidOrderUpdate(serviceType?: 'dine_in' | 'delivery'): {
  status: 'pending_ship' | 'pending_review'
  paid_at: string
  verified_at?: string
} {
  const now = new Date().toISOString()
  if (serviceType === 'delivery') {
    return { status: 'pending_ship', paid_at: now }
  }
  // 堂食到店消费，无需核销，支付成功即视为已使用（用 verified_at 标记）
  return { status: 'pending_review', verified_at: now, paid_at: now }
}

// 结算风险校验：购物车冲突（温补叠加/寒热对冲/同属性过量/相克）+ 当前体质禁忌（avoid 档）
function computeCheckoutRisks(items: any[], classifyProduct: (p: any) => any): {
  conflicts: CartConflict[]
  avoidNames: string[]
} {
  const inputs = items.map((i) => i.products).filter(Boolean).map((p) => toFoodTherapyInput(p))
  const conflicts = checkCartConflicts(inputs)
  const avoidNames: string[] = []
  for (const i of items) {
    const p = i.products
    if (!p) continue
    const tier = classifyProduct(p)
    if (tier === 'avoid') avoidNames.push(p.name)
  }
  return { conflicts, avoidNames }
}

// 支付成功落地页：标准确认点，用户主动选择下一步（查看订单 / 继续逛），
// 评价改为可选项而非被强制推送。堂食订单支付即 pending_review，故 reviewable。
function buildResultUrl(orderNo: string, total: number, serviceType: 'dine_in' | 'delivery'): string {
  const reviewable = serviceType === 'dine_in' ? '1' : '0'
  return `/pages/payment-result/index?orderNo=${encodeURIComponent(orderNo)}&total=${total}&serviceType=${serviceType}&reviewable=${reviewable}`
}

function PaymentPage() {
  // 修复：用 useRouter() 取响应式 params。原 useMemo(() => getCurrentInstance().router?.params || {}, [])
  // 会把 params 冻结在首屏空快照（Taro 首渲染时 router 尚未就绪），导致 cartIds/productId 永远为空、
  // loadData 两个分支都不进、items 恒为空，兜底假 item 触发 INVALID_PRODUCT。
  const router = useRouter()
  const params = router.params || {}
  const totalParam = useMemo(() => parseFloat((params as any).total || '0'), [params])
  const cartIds = useMemo(() => {
    const raw = (params as any).cartIds
    if (raw) return decodeURIComponent(raw).split(',').filter(Boolean)
    // 冷启动/热重载后 router.params 为空时，回退到待结算缓存（购物车去结算写入）
    const cache = getPendingCheckout()
    return cache?.cartIds || []
  }, [params])
  const quantityParam = useMemo(() => {
    const raw = (params as any).quantity
    const n = raw ? parseInt(decodeURIComponent(raw), 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 1
  }, [params])
  const productIdParam = useMemo(() => {
    const raw = (params as any).productId
    if (raw) return decodeURIComponent(raw)
    // 同上，回退到待结算缓存（商品详情立即购买写入）
    const cache = getPendingCheckout()
    return cache?.productId || ''
  }, [params])

  const [payMode, setPayMode] = useState<PayMode>('wxpay')
  const [goldBeansToUse, setGoldBeansToUse] = useState(0)
  const [balance, setBalance] = useState(0)
  const [countdown, setCountdown] = useState(30 * 60)
  const [paying, setPaying] = useState(false)
  const [orderNo, setOrderNo] = useState('')
  // 结算风险弹窗（购物车冲突 + 当前体质禁忌）
  const [riskModal, setRiskModal] = useState<{ conflicts: CartConflict[]; avoidNames: string[] } | null>(null)
  const _riskAck = useRef(false)
  const { classifyProduct } = useFoodTherapy()
  const [items, setItems] = useState<any[]>([])
  const [totalAmount, setTotalAmount] = useState(totalParam)
  // 下单前预校验：加载商品后回查 products 真实状态，拦截失效商品（已下架/无价/售罄）
  const [productCheck, setProductCheck] = useState<{
    loading: boolean
    invalid: Array<{ product_id: string; name: string; reason: string }>
  }>({ loading: true, invalid: [] })
  const [isMultiStore, setIsMultiStore] = useState(false)
  const [parentOrderNo, setParentOrderNo] = useState<string | null>(null)
  const [userTotalConsumption, setUserTotalConsumption] = useState(0) // 用户个人累计消费
  const [addresses, setAddresses] = useState<any[]>([])  // 收货地址列表
  const [selectedAddress, setSelectedAddress] = useState<any>(null)  // 选中的地址

  // 防重复支付双重锁
  const _payLock = useRef(false)
  const _pendingOrderNo = useRef('')
  // 用户推荐人（上级）ID：loadData 时缓存，下单时透传给订单，
  // 供服务端 distribute-commission 真正发放佣金（修复之前 orders.referrer_id 恒为 NULL 的发佣断点）
  const referrerIdRef = useRef<string | null>(null)

  // 下单前预校验：回查 products 真实状态，拦截失效商品（已下架 / 无价）
  // 与 createOrderV2 的价格防伪完全同源（同样受 products RLS `is_active=true` 约束），
  // 查询列必须与 createOrderV2 一致（只查 id, price, is_active），避免列差异导致结果不一致
  const verifyProducts = async (loadedItems: any[]) => {
    if (!loadedItems || loadedItems.length === 0) {
      setProductCheck({ loading: false, invalid: [] })
      return
    }
    const ids = [...new Set(loadedItems.map((i: any) => i.product_id).filter(Boolean))]
    if (ids.length === 0) {
      setProductCheck({ loading: false, invalid: [] })
      return
    }
    console.log('[预校验] 开始回查商品状态, ids=', ids)
    try {
      const { data: dbProds, error } = await supabase
        .from('products').select('id, price, is_active').in('id', ids)
      if (error) {
        console.warn('[预校验] 商品状态查询失败，跳过', error)
        setProductCheck({ loading: false, invalid: [] })
        return
      }
      console.log('[预校验] 回查结果:', dbProds)
      const map = new Map((dbProds || []).map((p: any) => [p.id, p]))
      const invalid: Array<{ product_id: string; name: string; reason: string }> = []
      for (const item of loadedItems) {
        const p: any = map.get(item.product_id)
        if (!p) invalid.push({ product_id: item.product_id, name: item.product_name || '商品', reason: '商品已下架或不存在' })
        else if (!p.price || Number(p.price) <= 0) invalid.push({ product_id: item.product_id, name: item.product_name || '商品', reason: '商品价格未设置' })
      }
      setProductCheck({ loading: false, invalid })
      if (invalid.length > 0) console.warn('[预校验] 发现失效商品:', invalid)
      else console.log('[预校验] 全部商品有效')
    } catch (e) {
      console.warn('[预校验] 异常，跳过', e)
      setProductCheck({ loading: false, invalid: [] })
    }
  }

  // 加载购物车商品 + 情绪豆余额 + 用户消费数据 + 收货地址
  const loadData = useCallback(async () => {
    const [bal, profile, addrList] = await Promise.all([
      getMyBalance(),
      getMyProfile().catch(() => null), // 获取用户资料（含累计消费）
      getMyAddresses().catch(() => []),  // 获取收货地址列表
    ])

    // 余额优先取已验证正确的 getMyProfile.tb_balance（情绪豆），getMyBalance 作兜底（双保险防 RLS 偏差导致读成 0）
    const finalBalance = profile?.tb_balance ?? bal.tb_balance ?? 0
    console.log('[Payment] 情绪豆余额加载结果:', { profileTb: profile?.tb_balance, apiTb: bal.tb_balance, final: finalBalance, version: '2026-07-18-v1' })
    setBalance(finalBalance)
    // 调试用：开发模式下弹出当前余额+版本号，确认真机代码是否已更新（生产环境不显示）
    if (process.env.NODE_ENV !== 'production') {
      Taro.showToast({ title: `余额${finalBalance}·v4`, icon: 'none', duration: 2000 })
    }
    setAddresses(addrList)

    // 自动选中默认地址
    const defaultAddr = addrList.find((a: any) => a.is_default)
    if (defaultAddr) setSelectedAddress(defaultAddr)
    else if (addrList.length > 0) setSelectedAddress(addrList[0])

    // 个人累计消费
    const totalConsumption = profile?.total_consumption || 0
    setUserTotalConsumption(totalConsumption)
    // 缓存推荐人（上级）ID，下单时透传订单
    referrerIdRef.current = profile?.referrer_id || null

    let loadedItems: any[] = []
    if (cartIds.length > 0) {
      const cartItems = await getCartItems()
      const selected = cartItems.filter(i => cartIds.includes(i.id))
      const mapped = selected.map(i => ({
        product_id: i.product_id, store_id: i.store_id,
        store_name: i.stores?.name || '', product_name: i.products?.name || '',
        product_image: i.products?.image_url || null,
        price: i.products?.price || 0, quantity: i.quantity}))
      loadedItems = mapped
      setItems(mapped)
      setTotalAmount(toFixed4(mapped.reduce((s, i) => s + toFixed4(i.price * i.quantity), 0)))
    } else if (productIdParam) {
      const { getProductById } = await import('@/db/api')
      const prod = await getProductById(productIdParam)
      if (prod) {
        // 优先从 URL 参数/缓存读取购买数量，默认 1
        const qty = quantityParam > 0 ? quantityParam : 1
        const mapped = [{
          product_id: prod.id, store_id: prod.store_id,
          store_name: '', product_name: prod.name,
          product_image: prod.image_url || null,
          price: prod.price, quantity: qty }]
        loadedItems = mapped
        setItems(mapped)
        setTotalAmount(toFixed4(prod.price * qty))
      }
    }
    // 下单前预校验商品状态（拦截已下架 / 无价 / 售罄），避免点到 createOrderV2 才报 INVALID_PRODUCT
    await verifyProducts(loadedItems)
  }, [cartIds, productIdParam, quantityParam])

  // 挂载即拉一次（余额/地址等首屏数据）
  useEffect(() => { loadData() }, [loadData])

  // 页面每次显示都重拉商品：覆盖「首渲染 router.params 尚未就绪、后续才填充」的时序，
  // 以及「冷启动/热重载后停留在支付页、params 恢复」等场景。loadData 内 setState 不触发 useDidShow，无死循环。
  useDidShow(() => { loadData() })

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
              .eq('status', 'pending_pay')  // ⬅ 守卫：已支付/已情绪豆支付/已取消的订单不被覆盖
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

  const [serviceType, setServiceType] = useState<'dine_in' | 'delivery'>('dine_in')

  // 实时计算：情绪豆最大可用 & 实付金额
  // 按「正常价格」精确扣豆：情绪豆余额支持小数(numeric(12,2))，1 豆=1 元，0.1 元订单即扣 0.1 豆，绝不上取整到 1 豆；
  // 纯情绪豆用精确额度(totalAmount/RATE，含小数)覆盖订单——不足则禁用纯豆，零头不强行多扣；
  // 混合/微信仍按「向下取整」——零头留给微信支付，避免微信端出现 <0.01 元的不可支付金额。
  const maxGoldBeans = useMemo(() => {
    if (payMode === 'pure_gold') return Math.min(balance, totalAmount / GOLD_BEAN_RATE)
    return Math.min(balance, Math.floor(totalAmount / GOLD_BEAN_RATE))
  }, [balance, totalAmount, payMode])
  const deductYuan = useMemo(() => toFixed4(Math.min(goldBeansToUse, maxGoldBeans) * GOLD_BEAN_RATE), [goldBeansToUse, maxGoldBeans])
  const wxpayAmount = useMemo(() => toFixed4(Math.max(0, totalAmount - deductYuan)), [totalAmount, deductYuan])
  const actualGoldBeansUsed = useMemo(() => Math.min(goldBeansToUse, maxGoldBeans), [goldBeansToUse, maxGoldBeans])
  const fullGoldNeeded = useMemo(() => totalAmount / GOLD_BEAN_RATE, [totalAmount])
  const pureGoldShort = useMemo(() => Math.max(0, fullGoldNeeded - balance), [fullGoldNeeded, balance])

  // 切换支付方式时同步情绪豆使用量
  const handleModeChange = (mode: PayMode) => {
    setPayMode(mode)
    // 纯情绪豆：默认用满「精确覆盖所需豆数」(fullGoldNeeded=订单金额/RATE，含小数)，按正常价格足额付清不留缺口
    if (mode === 'pure_gold') setGoldBeansToUse(Math.min(balance, fullGoldNeeded))
    // 混合：默认用满可用情绪豆（向下取整，零头走微信）
    else if (mode === 'hybrid') setGoldBeansToUse(maxGoldBeans)
    else if (mode === 'wxpay') setGoldBeansToUse(0)
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

  // 跨门店订单：支付成功后确认所有子订单（按履约方式分流状态）
  const confirmMultiStoreOrders = async (parentOrderNo: string, serviceType: 'dine_in' | 'delivery') => {
    try {
      const { error } = await supabase
        .from('orders')
        .update(paidOrderUpdate(serviceType))
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

  // 支付成功后从购物车清掉已结算的条目（best-effort，失败不阻塞主流程）
  const clearPaidCartItems = async (ids: string[]) => {
    if (!ids || ids.length === 0) return
    try {
      await Promise.all(ids.map(id => removeCartItem(id).catch(() => null)))
      console.log('[payment] 已清理购物车条目', ids)
    } catch (e) {
      console.warn('[payment] 清理购物车失败(不影响)', e)
    }
  }

  const handlePay = async () => {
    if (_payLock.current) { Taro.showToast({ title: '支付处理中，请稍候', icon: 'none' }); return }

    // 预校验尚未完成，禁止点击（避免抢先点到 createOrderV2）
    if (productCheck.loading) {
      Taro.showToast({ title: '商品校验中，请稍候', icon: 'none' })
      return
    }

    // 失效商品拦截（下单前预校验未通过，避免点到 createOrderV2 才报 INVALID_PRODUCT）
    if (productCheck.invalid.length > 0) {
      Taro.showToast({ title: '含失效商品，无法支付', icon: 'none' })
      return
    }

    // 配送必须选地址
    if (serviceType === 'delivery' && !selectedAddress) {
      Taro.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }

    // 商品数据缺失拦截（items 为空说明结算参数未正确传入，禁止伪造订单触发 INVALID_PRODUCT）
    if (!items || items.length === 0) {
      Taro.showToast({ title: '商品信息缺失，请重新进入结算', icon: 'none' })
      console.error('[payment] items 为空，结算参数未正确传入（cartIds/productId 缺失）')
      _payLock.current = false
      setPaying(false)
      return
    }

    // 结算风险校验（购物车冲突 + 当前体质禁忌），有风险弹窗提醒；danger 需二次确认
    if (!_riskAck.current) {
      const risks = computeCheckoutRisks(items, classifyProduct)
      if (risks.conflicts.length > 0 || risks.avoidNames.length > 0) {
        setRiskModal(risks)
        _payLock.current = false
        setPaying(false)
        return
      }
    } else {
      _riskAck.current = false // 用户已确认风险，本次跳过校验
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
        items,
        total_amount: totalAmount,
        pay_mode: payMode,
        tb_used: actualGoldBeansUsed,
        idempotency_key: `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        service_type: serviceType,
        address: serviceType === 'delivery' ? addressStr : undefined,
        // 透传推荐人（上级）：服务端 distribute-commission 据此向 profiles.referrer_id 实际发佣
        referrer_id: referrerIdRef.current || undefined})

      if (!orderResult) {
        // P0 修复：createOrderV2 内部已 toast 详细错误（含 code+message+hint），
        // 不要再 throw 覆盖真实错误（之前抛"创建订单失败，请重试"会让用户看不到 RLS/字段错误）
        console.error('[payment] createOrderV2 returned null')
        return
      }
      setOrderNo(orderResult.order.order_no)
      _pendingOrderNo.current = orderResult.order.order_no
      clearPendingCheckout() // 订单已创建，清除待结算缓存，避免下次热重载误用旧数据

      // 导购反馈回流：购买事件（每个商品记一次，个性化权重学习）
      for (const it of items) {
        const p = it.products
        if (p) trackFoodTherapyEvent({ productId: it.product_id, eventType: 'purchase', healthTag: (p as any).health_tag ?? [], emotionTag: (p as any).emotion_tag ?? [] }).catch(() => {})
      }

      // 跨门店结算：记录父订单号
      if (orderResult.is_multi_store) {
        setIsMultiStore(true)
        setParentOrderNo(orderResult.order.parent_order_no)
      }

      // 2. 纯情绪豆：已在服务端完成，直接跳转
      if (payMode === 'pure_gold') {
      Taro.showToast({ title: '情绪豆支付成功！', icon: 'success' })

      // 清理购物车里已结算的条目（避免下次进入仍看到「未支付」的已购商品）
      clearPaidCartItems(cartIds)

      // 跨门店结算：确认所有子订单（纯情绪豆已在服务端完成，这里只是保险）
      if (isMultiStore && parentOrderNo) {
        await confirmMultiStoreOrders(parentOrderNo, serviceType)
      } else if (orderResult?.order?.order_no) {
        // 单店情绪豆：补写订单支付后状态（配送=待发货，到店=待评价+已使用）
        try {
          await supabase
            .from('orders')
            .update(paidOrderUpdate(serviceType))
            .eq('order_no', orderResult.order.order_no)
        } catch (e) {
          console.warn('[情绪豆支付] 单店状态更新失败', e)
        }
      }
      
      // V5算法：情绪豆支付成功后计算佣金并写入订单（含真实推荐人段位）
      try {
        await runV5Commission(orderResult?.order?.id || '', items[0]?.store_id || '', totalAmount)
      } catch (err) {
        console.error('[V5] 情绪豆支付佣金计算失败', err)
      }

      // 支付成功即自动确权（下单默认确权，无需跳转）
      autoClaimAfterPay({
        orderNo: orderResult?.order?.order_no || '',
        isMultiStore,
        parentOrderNo,
        items})

      // 支付成功 → 进入「支付成功结果页」（标准确认点；评价改为用户主动，不再被推）
      setTimeout(() => {
        Taro.navigateTo({ url: buildResultUrl(orderResult?.order?.order_no || '', totalAmount, serviceType) })
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
        paySign: payParams.paySign})

      Taro.showToast({ title: '支付成功！', icon: 'success' })

      // 清理购物车里已结算的条目
      clearPaidCartItems(cartIds)
      
      // 支付成功 → 按履约方式流转状态：
      // 配送: pending_ship → pending_receive → pending_review(verified_at)
      // 到店消费(堂食): 支付即 pending_review(verified_at)
      // 注：确权已改为「支付成功自动发放」，下方 autoClaimAfterPay 在状态流转后 best-effort 触发，无需用户手动跳转。
      try {
        if (isMultiStore && parentOrderNo) {
          await supabase.from('orders').update(paidOrderUpdate(serviceType)).eq('parent_order_no', parentOrderNo)
        } else if (orderResult?.order?.order_no) {
          await supabase.from('orders').update(paidOrderUpdate(serviceType)).eq('order_no', orderResult.order.order_no)
        }
      } catch (e) { console.warn('[支付成功] 更新状态失败(不影响)', e) }

      // 混合支付：微信支付成功后再扣情绪豆（订单已记录 tb_used，此处执行实际扣减）
      if (payMode === 'hybrid' && actualGoldBeansUsed > 0) {
        try {
          const prof = await getMyProfile()
          if (prof?.id) {
            const { data: p2 } = await supabase.from('profiles').select('tb_balance').eq('id', prof.id).single()
            if (p2 && p2.tb_balance >= actualGoldBeansUsed) {
              const { error: derr } = await supabase.from('profiles').update({ tb_balance: p2.tb_balance - actualGoldBeansUsed }).eq('id', prof.id)
              if (derr) console.warn('[混合支付] 情绪豆扣减失败(不影响订单)', derr)
              else {
                console.log('[混合支付] 情绪豆扣减成功', actualGoldBeansUsed)
                // 非阻塞写情绪豆流水（混合支付消费抵扣）；表缺失(404)也不影响订单
                supabase.from('tongbao_logs').insert({
                  user_id: prof.id,
                  order_id: null,
                  type: 'purchase_spend',
                  delta: -actualGoldBeansUsed,
                  balance_after: (p2.tb_balance ?? 0) - actualGoldBeansUsed,
                  remark: '混合支付消费抵扣情绪豆'}).then(() => {}).catch((e: any) => {
                  if ((e as any)?.code === '42P01' || (e as any)?.status === 404) {
                    console.warn('[tongbao_logs] 表不存在(00096未执行)，流水暂不记录')
                  }
                })
              }
            } else {
              console.warn('[混合支付] 情绪豆余额不足，跳过扣减')
            }
          }
        } catch (e) { console.warn('[混合支付] 情绪豆扣减异常(不影响订单)', e) }
      }

      // 跨门店结算：确认所有子订单
      if (isMultiStore && parentOrderNo) {
        await confirmMultiStoreOrders(parentOrderNo, serviceType)
      }
      
      // V5算法：支付成功后计算佣金并写入订单（含真实推荐人段位）
      try {
        await runV5Commission(orderResult?.order?.id || '', items[0]?.store_id || '', totalAmount)
      } catch (err) {
        console.error('[V5] 佣金计算失败', err)
      }

      // 支付成功即自动确权（下单默认确权，无需跳转）
      autoClaimAfterPay({
        orderNo: orderResult?.order?.order_no || '',
        isMultiStore,
        parentOrderNo,
        items})

      // 支付成功 → 进入「支付成功结果页」（标准确认点；评价改为用户主动，不再被推）
      setTimeout(() => {
        Taro.navigateTo({ url: buildResultUrl(orderResult?.order?.order_no || '', totalAmount, serviceType) })
      }, 1500)} catch (err: any) {
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
    if (productCheck.loading) return '商品校验中...'
    if (paying) return '支付中...'
    if (productCheck.invalid.length > 0) return '含失效商品，无法支付'
    if (payMode === 'pure_gold') return `确认支付 ${actualGoldBeansUsed} 情绪豆`
    if (payMode === 'hybrid') return `确认支付 ¥${wxpayAmount.toFixed(2)} + ${actualGoldBeansUsed}情绪豆`
    return `确认支付 ¥${totalAmount.toFixed(2)}`
  }, [paying, payMode, actualGoldBeansUsed, wxpayAmount, totalAmount, productCheck.loading, productCheck.invalid.length])

  const payModes: Array<{ key: PayMode; icon: string; label: string; color: string; desc: string; disabled?: boolean }> = [
    { key: 'wxpay', icon: 'i-mdi-wechat', label: '微信支付', color: '#07C160', desc: `¥${totalAmount.toFixed(2)}` },
    { key: 'hybrid', icon: 'i-mdi-lightning-bolt', label: '情绪豆+微信混合', color: 'hsl(var(--primary))', desc: `情绪豆抵 ¥${deductYuan.toFixed(2)}，余付 ¥${wxpayAmount.toFixed(2)}`, disabled: balance <= 0 },
    { key: 'pure_gold', icon: 'i-mdi-star-circle', label: '纯情绪豆支付', color: '#D97706', desc: balance >= fullGoldNeeded ? `情绪豆 ${balance}` : `情绪豆不足，还需 ${pureGoldShort} 豆`, disabled: balance < fullGoldNeeded },
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
            <Text className="text-xl text-muted-foreground">情绪豆抵扣（{actualGoldBeansUsed}豆）</Text>
            <Text className="text-xl font-bold text-primary">-¥{deductYuan.toFixed(2)}</Text>
          </View>
        )}
        <View className="h-px bg-border mt-3 mb-3" />
        <View className="flex items-center justify-between">
          <Text className="text-xl font-bold text-foreground">实付金额</Text>
          <Text className="text-3xl font-bold text-primary">
            {payMode === 'pure_gold' ? `${actualGoldBeansUsed} 情绪豆` : `¥${wxpayAmount.toFixed(2)}`}
          </Text>
        </View>
        {balance > 0 && (
          <View className="flex items-center gap-2 mt-2">
            <View className="i-mdi-star-circle text-xl" style={{ color: '#D97706' }} />
            <Text className="text-xl text-muted-foreground">情绪豆余额：<Text className="font-bold text-foreground">{balance} 豆</Text></Text>
          </View>
        )}
      </View>

      {/* 失效商品警示（下单前预校验拦截，避免点到 createOrderV2 才报 INVALID_PRODUCT） */}
      {productCheck.invalid.length > 0 && (
        <View className="mx-4 mt-4 p-4 rounded-2xl border-2 border-red-500/40 bg-red-500/5">
          <View className="flex items-center gap-2 mb-2">
            <View className="i-mdi-alert-circle text-2xl text-red-500" />
            <Text className="text-xl font-bold text-red-500">部分商品无法购买</Text>
          </View>
          {productCheck.invalid.map((it, idx) => (
            <View key={idx} className="flex items-center gap-2 py-1">
              <Text className="text-base text-red-500/70">•</Text>
              <Text className="text-base text-foreground flex-shrink-0">{it.name}</Text>
              <Text className="text-base text-red-500 flex-1 text-right">{it.reason}</Text>
            </View>
          ))}
          <Text className="text-base text-muted-foreground mt-2">请移除失效商品或联系商家处理后再支付</Text>
        </View>
      )}

      {/* 服务方式选择 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="px-4 py-3 border-b border-border">
          <Text className="text-xl font-bold text-foreground">用餐方式</Text>
        </View>
        <View className="flex gap-0">
          {([
            { key: 'dine_in', label: '堂食', icon: 'i-mdi-silverware-fork-knife' },
            { key: 'delivery', label: '配送', icon: 'i-mdi-moped' },
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

      {/* 地址选择（配送时显示） */}
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
            onClick={() => {
              if (m.disabled) {
                if (m.key === 'pure_gold') Taro.showToast({ title: `情绪豆余额不足，还需 ${pureGoldShort} 豆`, icon: 'none' })
                return
              }
              handleModeChange(m.key)
            }}>
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

      {/* 混合支付：情绪豆抵扣输入 */}
      {payMode === 'hybrid' && balance > 0 && (
        <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
          <View className="flex items-center justify-between mb-3">
            <Text className="text-xl font-bold text-foreground">情绪豆抵扣数量</Text>
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
                onInput={(e) => { const ev = e as any; const v = parseFloat(ev.detail?.value ?? ev.target?.value ?? '0'); setGoldBeansToUse(Number.isFinite(v) ? Math.min(maxGoldBeans, Math.max(0, v)) : 0) }}
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

      {/* 操作按钮 */}
      <View className="mx-4 mt-4 flex flex-col gap-3">
        <View
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${productCheck.loading || productCheck.invalid.length > 0 ? 'bg-muted opacity-50' : (paying ? 'bg-primary/50' : 'bg-primary')}`}
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
        <Text className="text-base text-muted-foreground text-center">支付即视为同意<Text className="text-primary">《来电有喜交易规则》</Text></Text>
      </View>

      {/* 结算风险弹窗（食疗冲突 + 体质禁忌） */}
      {riskModal && (
        <View className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <View className="w-10/12 max-h-4/5 bg-card rounded-3xl p-6 overflow-y-auto">
            <Text className="text-2xl font-bold text-foreground text-center block mb-1">🍲 结算健康小贴士</Text>
            <Text className="text-base text-muted-foreground text-center block mb-4">为你做了食疗冲突与体质适配检测</Text>
            <View className="gap-3 mb-6">
              {riskModal.conflicts.map((c, idx) => (
                <View key={idx} className="p-3 rounded-2xl border" style={{ background: c.level === 'danger' ? '#FEE2E2' : '#FEF3C7', borderColor: c.level === 'danger' ? '#FCA5A5' : '#FDE68A' }}>
                  <View className="flex items-center gap-2 mb-1">
                    <Text className="text-xl">{c.level === 'danger' ? '⚠️' : '🟡'}</Text>
                    <Text className="text-base font-bold" style={{ color: c.level === 'danger' ? '#B91C1C' : '#92400E' }}>
                      {c.type === 'warm_overlap' ? '温补叠加' : c.type === 'cold_hot_clash' ? '寒热对冲' : c.type === 'same_attr_overload' ? '同属性过量' : '相克慎搭'}
                    </Text>
                  </View>
                  <Text className="text-base text-muted-foreground" style={{ display: 'block', lineHeight: '1.5' }}>{c.message}</Text>
                </View>
              ))}
              {riskModal.avoidNames.length > 0 && (
                <View className="p-3 rounded-2xl border" style={{ background: '#FEE2E2', borderColor: '#FCA5A5' }}>
                  <View className="flex items-center gap-2 mb-1">
                    <Text className="text-xl">⚠️</Text>
                    <Text className="text-base font-bold" style={{ color: '#B91C1C' }}>体质暂不适宜</Text>
                  </View>
                  <Text className="text-base text-muted-foreground" style={{ display: 'block', lineHeight: '1.5' }}>
                    根据当前所选状态，「{riskModal.avoidNames.join('、')}」属于不建议点范畴，建议替换或少量尝鲜。
                  </Text>
                </View>
              )}
            </View>
            <View className="flex gap-3">
              <View className="flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-center text-xl font-bold" onClick={() => setRiskModal(null)}>去调整</View>
              <View className="flex-1 py-3 rounded-2xl bg-primary text-white text-center text-xl font-bold"
                onClick={() => { setRiskModal(null); _riskAck.current = true; handlePay() }}>仍要支付</View>
            </View>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default PaymentPage
