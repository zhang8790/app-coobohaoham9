// @title 支付
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { getCartItems, getMyBalance, createOrderV2, getWechatPayParams, getWechatOpenid, getMyProfile, getMyAddresses, trackFoodTherapyEvent, removeCartItem, getOrderById } from '@/db/api'

// 注：支付即打印已改为「数据库触发器 trg_print_receipt」在服务端统一触发（订单状态 → pending_ship 时异步调 print-receipt），
// 不再依赖客户端预览包版本，也不会与触发器重复出单。详见 supabase/migrations/20260803_print_receipt_trigger.sql
import Icon from '@/components/Icon'
import { supabase } from '@/client/supabase'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { type CartConflict } from '@/utils/food-therapy'
import { RouteGuard } from '@/components/RouteGuard'
import { getPendingCheckout, clearPendingCheckout } from '@/utils/checkoutCache'
import { refreshCartCount } from '@/utils/cartStore'
import type { PayMode } from '@/db/types'
import { haversineKm } from '@/utils/coord-convert'

import { toFixed4, runV5Commission, grantOneClaim, autoClaimAfterPay, GOLD_BEAN_RATE, SERVICE_META, paidOrderUpdate, computeCheckoutRisks, buildResultUrl, type StoreFulfillment } from './payment-utils'
import PaymentSummary from './PaymentSummary'
import PaymentOptions from './PaymentOptions'
import PaymentActionBar from './PaymentActionBar'
import CheckoutRiskModal from './CheckoutRiskModal'

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
 // 临期特惠：立即购买带入的折扣价/批次（URL 优先，缓存兜底；实际套用由 createOrderV2 按 batch_id 服务端完成）
 const effectivePriceParam = useMemo(() => {
 const raw = (params as any).ep ?? getPendingCheckout()?.effectivePrice
 const v = raw != null ? Number(raw) : NaN
 return Number.isFinite(v) && v > 0 ? v : 0
 }, [params])
 const batchIdParam = useMemo(() => {
 const raw = (params as any).batch ?? getPendingCheckout()?.batchId
 return raw ? String(raw) : ''
 }, [params])
 // 重付模式：订单中心「去付款」带入已存在订单 id，拉取订单项重发预支付（不重复建单）
 const orderIdParam = useMemo(() => {
 const raw = (params as any).orderId
 return raw ? String(raw) : ''
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
 const [addresses, setAddresses] = useState<any[]>([]) // 收货地址列表
 const [selectedAddress, setSelectedAddress] = useState<any>(null) // 选中的地址
 // Phase 2：购物车涉及门店的履约配置（自提/配送开关、起送价、配送费、配送半径）
 const [storeFulfillment, setStoreFulfillment] = useState<Record<string, StoreFulfillment>>({})

 // 防重复支付双重锁
 const _payLock = useRef(false)
 // loadData 防重入锁：mount 与 useDidShow 会同时触发，避免重复拉取（结算慢的根因之一）
 const loadLockRef = useRef(false)
 const _pendingOrderNo = useRef('')
 // 用户推荐人（上级）ID：loadData 时缓存，下单时透传给订单，
 // 供服务端 distribute-commission 真正发放佣金（修复之前 orders.referrer_id 恒为 NULL 的发佣断点）
 const referrerIdRef = useRef<string | null>(null)

 // 重付模式：订单中心「去付款」进入，订单已存在，仅重发预支付（不重复建单）
 const [repayMode, setRepayMode] = useState(false)
 const repayOrderIdRef = useRef<string | null>(null)
 const repayServiceTypeRef = useRef<'dine_in' | 'delivery'>('dine_in')
 const [repayIsMultiStore, setRepayIsMultiStore] = useState(false)
 const [repayParentOrderNo, setRepayParentOrderNo] = useState<string | null>(null)

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
 try {
 const { data: dbProds, error } = await supabase
 .from('products').select('id, price, is_active').in('id', ids)
 if (error) {
 console.warn('[预校验] 商品状态查询失败，跳过', error)
 setProductCheck({ loading: false, invalid: [] })
 return
 }
 const map = new Map((dbProds || []).map((p: any) => [p.id, p]))
 const invalid: Array<{ product_id: string; name: string; reason: string }> = []
 for (const item of loadedItems) {
 const p: any = map.get(item.product_id)
 if (!p) invalid.push({ product_id: item.product_id, name: item.product_name || '商品', reason: '商品已下架或不存在' })
 else if (!p.price || Number(p.price) <= 0) invalid.push({ product_id: item.product_id, name: item.product_name || '商品', reason: '商品价格未设置' })
 }
 setProductCheck({ loading: false, invalid })
 if (invalid.length > 0) console.warn('[预校验] 发现失效商品:', invalid)
 } catch (e) {
 console.warn('[预校验] 异常，跳过', e)
 setProductCheck({ loading: false, invalid: [] })
 }
 }

 // 加载购物车商品 + 健康豆余额 + 用户消费数据 + 收货地址
 const loadData = useCallback(async () => {
 if (loadLockRef.current) return
 loadLockRef.current = true
 try {
 const [bal, profile, addrList] = await Promise.all([
 getMyBalance(),
 getMyProfile().catch(() => null), // 获取用户资料（含累计消费）
 getMyAddresses().catch(() => []), // 获取收货地址列表
 ])

 // 余额优先取已验证正确的 getMyProfile.tb_balance（健康豆），getMyBalance 作兜底（双保险防 RLS 偏差导致读成 0）
 const finalBalance = profile?.tb_balance ?? bal.tb_balance ?? 0
 setBalance(finalBalance)
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

 // 重付模式：订单已存在，直接拉取订单项重发预支付（跳过购物车/立即购买查询与失效校验）
 if (orderIdParam) {
 const order = await getOrderById(orderIdParam)
 if (!order) {
 setProductCheck({ loading: false, invalid: [{ product_id: '', name: '订单', reason: '订单不存在或已失效' }] })
 return
 }
 if (order.status !== 'pending_pay') {
 setProductCheck({ loading: false, invalid: [{ product_id: '', name: '订单', reason: `订单状态为「${order.status}」，无需支付` }] })
 return
 }
 const mapped = (order.order_items || []).map((it: any) => ({
 product_id: it.product_id, store_id: it.store_id,
 store_name: it.store_name || '', product_name: it.product_name || '',
 product_image: it.product_image || null,
 price: Number(it.price) || 0, quantity: Number(it.quantity) || 1,
 batch_id: it.batch_id || undefined }))
 if (mapped.length === 0) {
 setProductCheck({ loading: false, invalid: [{ product_id: '', name: '订单', reason: '订单无商品明细' }] })
 return
 }
 // 锁定健康豆抵扣额 = 订单创建时记录的 tb_used（服务端重付金额 = total - tb_used，必须一致否则资损）
 const tbUsed = Number(order.tb_used) || 0
 setGoldBeansToUse(tbUsed)
 setPayMode(tbUsed > 0 ? 'hybrid' : 'wxpay')
 // 履约方式锁定为订单原始值（重付不可改）
 // 历史订单可能为 self_pickup（自提已下线），重付时统一按「配送」处理
 const svc = (order.service_type as any) || 'dine_in'
 repayServiceTypeRef.current = (svc === 'self_pickup' ? 'delivery' : svc) as 'dine_in' | 'delivery'
 setServiceType(repayServiceTypeRef.current)
 setRepayMode(true)
 repayOrderIdRef.current = order.id
 setOrderNo(order.order_no)
 _pendingOrderNo.current = order.order_no
 setRepayIsMultiStore(!!order.parent_order_no)
 setRepayParentOrderNo(order.parent_order_no || null)
 setItems(mapped)
 setTotalAmount(toFixed4(order.total_amount || 0))
 // 订单项已是创建时快照，无需再次失效校验（避免误拦「中途放弃支付」的待付单）
 setProductCheck({ loading: false, invalid: [] })
 return
 }

 let loadedItems: any[] = []
 if (cartIds.length > 0) {
 const cartItems = await getCartItems()
 const selected = cartItems.filter(i => cartIds.includes(i.id))
 // 临期特惠：按购物车项的 batch_id 查真实 effective_price，让展示价与实付价一致（防价格落差/客诉）
 const batchIds = selected.map(i => i.batch_id).filter(Boolean) as string[]
 let effMap: Record<string, number> = {}
 if (batchIds.length) {
 const { data: effRows } = await supabase
 .from('v_near_expiry_products')
 .select('batch_id, effective_price')
 .in('batch_id', batchIds)
 ;(effRows || []).forEach((r: any) => { if (r.batch_id != null) effMap[r.batch_id] = r.effective_price })
 }
 const mapped = selected.map(i => {
 const effPrice = i.batch_id && effMap[i.batch_id] != null ? effMap[i.batch_id] : (i.products?.price || 0)
 return {
 product_id: i.product_id, store_id: i.store_id,
 store_name: i.stores?.name || '', product_name: i.products?.name || '',
 product_image: i.products?.image_url || null,
 price: effPrice, quantity: i.quantity,
 batch_id: i.batch_id || undefined }
 })
 loadedItems = mapped
 setItems(mapped)
 setTotalAmount(toFixed4(mapped.reduce((s, i) => s + toFixed4(i.price * i.quantity), 0)))
 } else if (productIdParam) {
 const { getProductById } = await import('@/db/api')
 const prod = await getProductById(productIdParam)
 if (prod) {
 // 优先从 URL 参数/缓存读取购买数量，默认 1
 const qty = quantityParam > 0 ? quantityParam : 1
 // 临期特惠：客户端带入折扣价仅作展示/预估；服务端 createOrderV2 会按 batch_id 重新校验并套用 effective_price
 const finalPrice = effectivePriceParam > 0 && effectivePriceParam < Number(prod.price || 0) ? effectivePriceParam : Number(prod.price || 0)
 const mapped = [{
 product_id: prod.id, store_id: prod.store_id,
 store_name: '', product_name: prod.name,
 product_image: prod.image_url || null,
 price: finalPrice, quantity: qty,
 batch_id: batchIdParam || undefined }]
 loadedItems = mapped
 setItems(mapped)
 setTotalAmount(toFixed4(finalPrice * qty))
 }
 }
 // 下单前预校验商品状态（拦截已下架 / 无价 / 售罄），避免点到 createOrderV2 才报 INVALID_PRODUCT
 await verifyProducts(loadedItems)

 // Phase 2：拉取购物车/立即购买涉及门店的履约配置（配送开关、起送价、配送费、配送半径）。
 // 用于结算页按门店能力驱动的履约选择器、每店起送价校验、配送费计算。
 try {
 const sids = [...new Set((loadedItems || []).map((i: any) => i.store_id).filter(Boolean))] as string[]
 if (sids.length > 0) {
 const { data: sRows } = await supabase
 .from('stores')
 .select('id,delivery_enabled,min_order_amount,delivery_fee,free_delivery_threshold,delivery_radius,lat,lng')
 .in('id', sids)
 const map: Record<string, StoreFulfillment> = {}
 for (const s of (sRows || []) as StoreFulfillment[]) map[s.id] = s
 setStoreFulfillment(map)
 } else {
 setStoreFulfillment({})
 }
 } catch (e) {
 console.warn('[payment] 门店履约配置拉取失败(降级为无配置)', e)
 setStoreFulfillment({})
 }
 } finally {
 loadLockRef.current = false
 }
 }, [cartIds, productIdParam, quantityParam, effectivePriceParam, batchIdParam, orderIdParam])

 // 挂载即拉一次（余额/地址等首屏数据）。
 // 注意：依赖必须是 [] 而非 [loadData]——loadData 依赖 cartIds/productIdParam/quantityParam，
 // 而这三者又依赖 router.params（每次渲染引用不稳定），会导致 loadData 反复重建、
 // useEffect 无限重触发、整页 setState 死循环 → 界面一闪一闪。
 // 页面每次显示的数据刷新由下方 useDidShow 负责，这里只首屏跑一次即可。
 useEffect(() => { loadData() }, [])

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
 .eq('status', 'pending_pay') // 守卫：已支付/已健康豆支付/已取消的订单不被覆盖
 .then(({ data }: { data: any }) => {
 if (data && (data as any[]).length > 0) {
 } else {
 }
 })
 .catch((err: any) => console.error('[支付超时] 取消订单失败', err))
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

 // ===== Phase 2：门店履约能力计算 =====
 // 每店选中小计（按门店分组，用于起送价校验与配送费计算）
 const storeSubtotals = useMemo(() => {
 const m: Record<string, number> = {}
 for (const i of items) {
 const sid = i.store_id
 if (!sid) continue
 m[sid] = toFixed4((m[sid] || 0) + toFixed4((Number(i.price) || 0) * (Number(i.quantity) || 0)))
 }
 return m
 }, [items])

 // 可用履约方式 = 购物车所有门店都支持的履约方式（交集）；堂食恒可选，配送按门店开关（自提已下线）
 const availableServiceTypes = useMemo(() => {
 const arr = Object.values(storeFulfillment)
 const list: Array<'dine_in' | 'delivery'> = ['dine_in']
 if (arr.length > 0 && arr.every(s => s.delivery_enabled)) list.push('delivery')
 return list
 }, [storeFulfillment])

 // 默认履约方式：取能力交集里的首选（配送 > 堂食），仅在当前选择不在可用列表内时切换（重付模式不干预）
 useEffect(() => {
 if (repayMode) return
 const preferred: Array<'dine_in' | 'delivery'> = ['delivery', 'dine_in']
 const def = preferred.find(t => availableServiceTypes.includes(t)) || 'dine_in'
 if (!availableServiceTypes.includes(serviceType)) setServiceType(def)
 // 故意不把 serviceType 列入依赖：仅在可用集合变化时调整默认，避免无限循环
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [availableServiceTypes, repayMode])

 // 每店起送价校验：任一家门店小计 < 自家 min_order_amount 则记录缺口（独立校验，跨店互不影响）
 const minOrderErrors = useMemo(() => {
 const errs: Array<{ storeId: string; storeName: string; min: number; current: number; shortfall: number }> = []
 for (const [sid, sub] of Object.entries(storeSubtotals)) {
 const f = storeFulfillment[sid]
 if (f && f.min_order_amount && sub < f.min_order_amount) {
 const storeName = (items.find(i => i.store_id === sid)?.store_name) || '该门店'
 errs.push({ storeId: sid, storeName, min: toFixed4(f.min_order_amount), current: sub, shortfall: toFixed4(f.min_order_amount - sub) })
 }
 }
 return errs
 }, [storeSubtotals, storeFulfillment, items])

 // 配送半径硬校验：收货地址到各门店距离 > 该店 delivery_radius 则拦截（仅配送方式；重付跳过）
 // 收货地址需带 GCJ-02 坐标（地址页 chooseLocation 选点写入）；无坐标的老地址无法确认范围，提示重选
 const deliveryRadiusErrors = useMemo(() => {
 if (serviceType !== 'delivery' || !selectedAddress?.lat || !selectedAddress?.lng) return []
 const errs: Array<{ storeId: string; storeName: string; radius: number; distance: number }> = []
 for (const [sid, f] of Object.entries(storeFulfillment)) {
 if (!f.lat || !f.lng || !f.delivery_radius) continue
 const d = haversineKm(selectedAddress.lat, selectedAddress.lng, f.lat, f.lng)
 if (d > f.delivery_radius) {
 const storeName = (items.find(i => i.store_id === sid)?.store_name) || '该门店'
 errs.push({ storeId: sid, storeName, radius: f.delivery_radius, distance: d })
 }
 }
 return errs
 }, [serviceType, selectedAddress, storeFulfillment, items])

 // 配送费：仅配送方式计收，按店累加；达该店免配送门槛则免收
 const deliveryFee = useMemo(() => {
 if (serviceType !== 'delivery') return 0
 let fee = 0
 for (const [sid, sub] of Object.entries(storeSubtotals)) {
 const f = storeFulfillment[sid]
 if (!f || !f.delivery_fee) continue
 const free = f.free_delivery_threshold != null && sub >= f.free_delivery_threshold
 if (!free) fee = toFixed4(fee + f.delivery_fee)
 }
 return fee
 }, [serviceType, storeSubtotals, storeFulfillment])

 // 应付总额（含配送费）：商品小计 + 配送费；起送价校验不计入运费
 const orderTotal = useMemo(() => toFixed4(totalAmount + deliveryFee), [totalAmount, deliveryFee])

 // 实时计算：健康豆最大可用 & 实付金额（基于含运费的 orderTotal）
 // 按「正常价格」精确扣豆：健康豆余额支持小数(numeric(12,2))，1 健康豆=1 元，0.1 元订单即扣 0.1 健康豆，绝不上取整到 1 健康豆；
 // 纯健康豆用精确额度(orderTotal/RATE，含小数)覆盖订单——不足则禁用纯豆，零头不强行多扣；
 // 混合/微信仍按「向下取整」——零头留给微信支付，避免微信端出现 <0.01 元的不可支付金额。
 const maxGoldBeans = useMemo(() => {
 if (payMode === 'pure_gold') return Math.min(balance, orderTotal / GOLD_BEAN_RATE)
 return Math.min(balance, Math.floor(orderTotal / GOLD_BEAN_RATE))
 }, [balance, orderTotal, payMode])
 const deductYuan = useMemo(() => toFixed4(Math.min(goldBeansToUse, maxGoldBeans) * GOLD_BEAN_RATE), [goldBeansToUse, maxGoldBeans])
 const wxpayAmount = useMemo(() => toFixed4(Math.max(0, orderTotal - deductYuan)), [orderTotal, deductYuan])
 const actualGoldBeansUsed = useMemo(() => Math.min(goldBeansToUse, maxGoldBeans), [goldBeansToUse, maxGoldBeans])
 const fullGoldNeeded = useMemo(() => orderTotal / GOLD_BEAN_RATE, [orderTotal])
 const pureGoldShort = useMemo(() => Math.max(0, fullGoldNeeded - balance), [fullGoldNeeded, balance])

 // 切换支付方式时同步健康豆使用量
 const handleModeChange = (mode: PayMode) => {
 setPayMode(mode)
 // 纯健康豆：默认用满「精确覆盖所需健康豆数」(fullGoldNeeded=订单金额/RATE，含小数)，按正常价格足额付清不留缺口
 if (mode === 'pure_gold') setGoldBeansToUse(Math.min(balance, fullGoldNeeded))
 // 混合：默认用满可用健康豆（向下取整，零头走微信）
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
 // 同步购物车角标（removeCartItem 只删库、不刷新 TabBar/页面角标，会导致"付完款购物车数字不归零"）
 await refreshCartCount().catch(() => null)
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

 // 起送价校验（每店独立；重付模式跳过，原订单已校验过）
 if (!repayMode && minOrderErrors.length > 0) {
 const e = minOrderErrors[0]
 Taro.showToast({ title: `${e.storeName} 还差 ¥${e.shortfall.toFixed(2)}起送`, icon: 'none' })
 return
 }

 // 配送半径硬校验（收货地址超出门店配送范围则拦截；重付跳过）
 if (!repayMode && deliveryRadiusErrors.length > 0) {
 const e = deliveryRadiusErrors[0]
 Taro.showToast({ title: `${e.storeName} 超出配送范围(${e.radius}km)`, icon: 'none' })
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

 // ===== 重付支线：订单已存在（订单中心「去付款」进入），仅重发预支付、不重复建单 =====
 if (repayMode && repayOrderIdRef.current) {
 _payLock.current = true
 setPaying(true)
 try {
 const isWeapp = Taro.getEnv() === 'WEAPP'
 if (!isWeapp) {
 Taro.showToast({ title: '非微信小程序环境无法发起支付，请在正式版微信小程序中使用', icon: 'none' })
 return
 }
 const openid = await fetchOpenidWithRetry()
 if (!openid) throw new Error('获取用户信息失败，请确认在微信小程序中打开')

 // 直接对已有订单重发预支付（create-wechat-payment 以 order_no 为 out_trade_no 重生成 prepay_id）
 const payParams = await getWechatPayParams(repayOrderIdRef.current, openid)
 if (!payParams) throw new Error('微信支付参数获取失败，请检查商户配置')

 await Taro.requestPayment({
 timeStamp: payParams.timeStamp,
 nonceStr: payParams.nonceStr,
 package: payParams.package,
 signType: payParams.signType as 'RSA',
 paySign: payParams.paySign })

 Taro.showToast({ title: '支付成功！', icon: 'success' })
 clearPendingCheckout()

 // 状态流转（履约方式锁定为订单原始值）
 const st = repayServiceTypeRef.current
 try {
 if (repayIsMultiStore && repayParentOrderNo) {
 await supabase.from('orders').update(paidOrderUpdate(st)).eq('parent_order_no', repayParentOrderNo)
 } else if (orderNo) {
 await supabase.from('orders').update(paidOrderUpdate(st)).eq('order_no', orderNo)
 }
 } catch (e) { console.warn('[重付] 状态更新失败(不影响)', e) }

 // 混合支付：微信支付成功后再扣健康豆（健康豆抵扣额已锁定 = 订单 tb_used，与 EF 重付金额一致）
 if (payMode === 'hybrid' && actualGoldBeansUsed > 0) {
 try {
 const prof = await getMyProfile()
 if (prof?.id) {
 const { data: p2 } = await supabase.from('profiles').select('tb_balance').eq('id', prof.id).single()
 if (p2 && p2.tb_balance >= actualGoldBeansUsed) {
 const { error: derr } = await supabase.from('profiles').update({ tb_balance: p2.tb_balance - actualGoldBeansUsed }).eq('id', prof.id)
 if (derr) console.warn('[重付混合] 健康豆扣减失败(不影响订单)', derr)
 else {
 supabase.from('tongbao_logs').insert({
 user_id: prof.id, order_id: null, type: 'purchase_spend',
 delta: -actualGoldBeansUsed, balance_after: (p2.tb_balance ?? 0) - actualGoldBeansUsed,
 remark: '混合支付消费抵扣健康豆' }).then(() => {}).catch((e: any) => {
 if ((e as any)?.code === '42P01' || (e as any)?.status === 404) console.warn('[tongbao_logs] 表不存在(00096未执行)')
 })
 }
 } else console.warn('[重付混合] 健康豆余额不足，跳过扣减')
 }
 } catch (e) { console.warn('[重付混合] 健康豆扣减异常(不影响订单)', e) }
 }

 // 跨门店结算：确认所有子订单
 if (repayIsMultiStore && repayParentOrderNo) {
 await confirmMultiStoreOrders(repayParentOrderNo, st)
 }

 // V5 佣金计算 + 自动确权（仅在支付成功后执行，重付补齐首次放弃时未跑的部分）
 try { await runV5Commission(repayOrderIdRef.current, items[0]?.store_id || '', totalAmount) } catch (err) { console.error('[V5] 重付佣金计算失败', err) }
 autoClaimAfterPay({ orderNo: orderNo || '', isMultiStore: repayIsMultiStore, parentOrderNo: repayParentOrderNo, items })

 setTimeout(() => { Taro.navigateTo({ url: buildResultUrl(orderNo || '', orderTotal, st) }) }, 1500)
 return
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
 items,
 total_amount: orderTotal,
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

 // 2. 纯健康豆：已在服务端完成，直接跳转
 if (payMode === 'pure_gold') {
 Taro.showToast({ title: '健康豆支付成功！', icon: 'success' })

 // 清理购物车里已结算的条目（避免下次进入仍看到「未支付」的已购商品）
 clearPaidCartItems(cartIds)

 // 跨门店结算：确认所有子订单（纯健康豆已在服务端完成，这里只是保险）
 if (isMultiStore && parentOrderNo) {
 await confirmMultiStoreOrders(parentOrderNo, serviceType)
 } else if (orderResult?.order?.order_no) {
 // 单店健康豆：补写订单支付后状态（配送=待发货，到店=待评价+已使用）
 try {
 await supabase
 .from('orders')
 .update(paidOrderUpdate(serviceType))
 .eq('order_no', orderResult.order.order_no)
 } catch (e) {
 console.warn('[健康豆支付] 单店状态更新失败', e)
 }
 }

 // V5算法：健康豆支付成功后计算佣金并写入订单（含真实推荐人段位）
 try {
 await runV5Commission(orderResult?.order?.id || '', items[0]?.store_id || '', totalAmount)
 } catch (err) {
 console.error('[V5] 健康豆支付佣金计算失败', err)
 }

 // 支付成功即自动确权（下单默认确权，无需跳转）
 autoClaimAfterPay({
 orderNo: orderResult?.order?.order_no || '',
 isMultiStore,
 parentOrderNo,
 items})

 // 支付成功 → 进入「支付成功结果页」（标准确认点；评价改为用户主动，不再被推）
 setTimeout(() => {
 Taro.navigateTo({ url: buildResultUrl(orderResult?.order?.order_no || '', orderTotal, serviceType) })
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

 // 混合支付：微信支付成功后再扣健康豆（订单已记录 tb_used，此处执行实际扣减）
 if (payMode === 'hybrid' && actualGoldBeansUsed > 0) {
 try {
 const prof = await getMyProfile()
 if (prof?.id) {
 const { data: p2 } = await supabase.from('profiles').select('tb_balance').eq('id', prof.id).single()
 if (p2 && p2.tb_balance >= actualGoldBeansUsed) {
 const { error: derr } = await supabase.from('profiles').update({ tb_balance: p2.tb_balance - actualGoldBeansUsed }).eq('id', prof.id)
 if (derr) console.warn('[混合支付] 健康豆扣减失败(不影响订单)', derr)
 else {
 // 非阻塞写健康豆流水（混合支付消费抵扣）；表缺失(404)也不影响订单
 supabase.from('tongbao_logs').insert({
 user_id: prof.id,
 order_id: null,
 type: 'purchase_spend',
 delta: -actualGoldBeansUsed,
 balance_after: (p2.tb_balance ?? 0) - actualGoldBeansUsed,
 remark: '混合支付消费抵扣健康豆'}).then(() => {}).catch((e: any) => {
 if ((e as any)?.code === '42P01' || (e as any)?.status === 404) {
 console.warn('[tongbao_logs] 表不存在(00096未执行)，流水暂不记录')
 }
 })
 }
 } else {
 console.warn('[混合支付] 健康豆余额不足，跳过扣减')
 }
 }
 } catch (e) { console.warn('[混合支付] 健康豆扣减异常(不影响订单)', e) }
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
 Taro.navigateTo({ url: buildResultUrl(orderResult?.order?.order_no || '', orderTotal, serviceType) })
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
 if (!repayMode && minOrderErrors.length > 0) return '未达门店起送价'
 if (!repayMode && deliveryRadiusErrors.length > 0) return '超出配送范围'
 if (payMode === 'pure_gold') return `确认支付 ${actualGoldBeansUsed} 健康豆`
 if (payMode === 'hybrid') return `确认支付 ¥${wxpayAmount.toFixed(2)} + ${actualGoldBeansUsed}健康豆`
 return `确认支付 ¥${orderTotal.toFixed(2)}`
 }, [paying, payMode, actualGoldBeansUsed, wxpayAmount, orderTotal, productCheck.loading, productCheck.invalid.length, minOrderErrors, deliveryRadiusErrors, repayMode])

 const payModes: Array<{ key: PayMode; icon: string; label: string; color: string; desc: string; disabled?: boolean }> = [
 { key: 'wxpay', icon: '', label: '微信支付', color: '#07C160', desc: `¥${orderTotal.toFixed(2)}` },
 { key: 'hybrid', icon: '', label: '健康豆+微信混合', color: 'hsl(var(--primary))', desc: `健康豆抵 ¥${deductYuan.toFixed(2)}，余付 ¥${wxpayAmount.toFixed(2)}`, disabled: balance <= 0 },
 { key: 'pure_gold', icon: '★', label: '纯健康豆支付', color: '#333333', desc: balance >= fullGoldNeeded ? `健康豆 ${balance}` : `健康豆不足，还需 ${pureGoldShort} 健康豆`, disabled: balance < fullGoldNeeded },
 ]

 return (<RouteGuard>
 <View className="min-h-screen bg-background pb-8">

 {repayMode && (
 <View className="mx-4 mt-4 p-3 rounded-2xl bg-primary/10 border border-primary/30">
 <Text className="text-base text-primary font-bold">重新支付该订单</Text>
 <Text className="text-base text-muted-foreground">（商品与健康豆抵扣以原订单为准，不可更改）</Text>
 </View>
 )}

 {/* 订单摘要卡 */}
 <View className="mx-4 mt-4 p-4 bg-card rounded-2xl">
 <Text className="flex-1 text-center text-xl font-bold text-foreground pr-10">确认支付</Text>
 </View>

<PaymentSummary
 countdownDisplay={countdownDisplay}
 orderNo={orderNo}
 totalAmount={totalAmount}
 deliveryFee={deliveryFee}
 deductYuan={deductYuan}
 actualGoldBeansUsed={actualGoldBeansUsed}
 wxpayAmount={wxpayAmount}
 payMode={payMode}
 balance={balance}
 serviceType={serviceType}
 invalid={productCheck.invalid}
 minOrderErrors={minOrderErrors}
 repayMode={repayMode}
 deliveryRadiusErrors={deliveryRadiusErrors}
/>

<PaymentOptions
 availableServiceTypes={availableServiceTypes}
 serviceType={serviceType}
 setServiceType={setServiceType}
 storeFulfillment={storeFulfillment}
 selectedAddress={selectedAddress}
 repayMode={repayMode}
 payModes={payModes}
 payMode={payMode}
 pureGoldShort={pureGoldShort}
 handleModeChange={handleModeChange}
 maxGoldBeans={maxGoldBeans}
 goldBeansToUse={goldBeansToUse}
 setGoldBeansToUse={setGoldBeansToUse}
 balance={balance}
/>

<PaymentActionBar
 payBtnText={payBtnText}
 productCheck={productCheck}
 repayMode={repayMode}
 minOrderErrors={minOrderErrors}
 deliveryRadiusErrors={deliveryRadiusErrors}
 paying={paying}
 handlePay={handlePay}
 handleCancel={handleCancel}
/>

<CheckoutRiskModal
 riskModal={riskModal}
 setRiskModal={setRiskModal}
 _riskAck={_riskAck}
 handlePay={handlePay}
/>
 </View>
 </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default PaymentPage



