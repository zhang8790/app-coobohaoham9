// 支付页模块级工具：佣金/确权/订单状态/结算风险/结果页/精度
// 从 index.tsx 抽出，零逻辑改动（便于独立审查 V5 佣金等高危财务逻辑）
import { supabase } from '@/client/supabase'
import { getMyProfile, grantEmotionClaim } from '@/db/api'
import { calculateCommissionV5 } from '@/utils/commission-calculator-v5'
import { toFoodTherapyInput, checkCartConflicts, type CartConflict } from '@/utils/food-therapy'

// 万分位精度
export function toFixed4(n: number) { return Math.round(n * 10000) / 10000 }

// 统一 V5 佣金计算并落库（与后端 distributeCommissionDirect 完全一致：展示=实发）
export async function runV5Commission(orderId: string, storeId: string, totalAmount: number) {
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
 // 按商品金额(price×qty)加权得到整单混合率，高利润品主导平台让利、低利润品少分，绝不二次叠加。与云端真发款一致（展示=实发）。
 try {
 // 修复：order_items.product_id 为 text 且无外键指向 products.id，
 // 嵌入 products(discount_rate) 会触发 PGRST200 (HTTP 400)。
 // 改为先取 order_items，再按 product_id 批量查 products.discount_rate 在 JS 内关联
 // （与 src/db/api.ts 中 createOrder 的修正口径一致）。
 const { data: itemRows } = await supabase
 .from('order_items').select('price, quantity, product_id').eq('order_id', orderId)
 const items = (itemRows || []) as Array<{ price?: any; quantity?: any; product_id?: string | null }>
 const productIds = Array.from(new Set((items || []).map(it => it?.product_id).filter(Boolean))) as string[]
 let rateMap: Record<string, number> = {}
 if (productIds.length) {
 const { data: prods } = await supabase
 .from('products').select('id, discount_rate').in('id', productIds)
 for (const p of (prods || []) as Array<{ id?: string; discount_rate?: any }>) {
 if (p?.id) rateMap[p.id] = Number(p.discount_rate ?? 0)
 }
 }
 let totalAmt = 0, weightedSum = 0
 for (const it of items) {
 const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
 const pid = String(it?.product_id)
 const pct = rateMap[pid]
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
 buyer_points: commissionResult.buyerGoldBeans,
 platform_income: commissionResult.platformTotalIncome,
 commission_calculated: true}).eq('id', orderId)
 } catch (err) {
 console.error('[V5] 佣金计算失败', err)
 }
}
// 支付成功后自动确权（用户侧：下单即默认确权，无需跳转）。best-effort，不阻断支付主流程。
export async function grantOneClaim(orderNo: string, item: any) {
 if (!orderNo || !item) return
 try {
 const res = await grantEmotionClaim({
 orderNo,
 productId: item.product_id || '',
 storeId: item.store_id || '',
 selectedEmotion: [],
 badgeText: '食养确权'})
 if (res.ok) {
 // 支付后自动确权成功
 }
 else console.warn('[确权] 支付后自动确权跳过', orderNo, res?.already ? '已确权' : '未过闸')
 } catch (e) {
 console.warn('[确权] 支付后自动确权异常(不影响订单)', e)
 }
}
// 单店直接确权；跨门店按子订单号(C+parent+storeId前4位)逐店确权
export async function autoClaimAfterPay(ctx: {
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
// 健康豆抵扣比例：1 健康豆 = 1 元（健康豆与人民币 1:1 锚定，余额即抵扣额，与数据库 profiles.tb_balance 单位一致）
export const GOLD_BEAN_RATE = 1

// 门店履约配置（结算页按子单门店分流堂食/配送 + 起送价/配送费校验）
export interface StoreFulfillment {
 id: string
 delivery_enabled: boolean
 min_order_amount: number | null
 delivery_fee: number | null
 free_delivery_threshold: number | null
 delivery_radius: number | null
 lat?: number | null
 lng?: number | null
}

// 履约方式展示元信息（自提已下线，仅保留堂食 / 配送）
export const SERVICE_META: Record<'dine_in' | 'delivery', { label: string; icon: string }> = {
 dine_in: { label: '堂食', icon: '' },
 delivery: { label: '配送', icon: '' },
}

// 支付成功后的订单状态：配送走「待发货」；到店消费（堂食）当场使用，支付即「待评价+已使用」，跳过待核销
export function paidOrderUpdate(serviceType?: 'dine_in' | 'delivery'): {
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

// 结算风险校验：购物车冲突（温性叠加/寒热对冲/同属性过量/相克）+ 当前体质禁忌（avoid 档）
export function computeCheckoutRisks(items: any[], classifyProduct: (p: any) => any): {
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
export function buildResultUrl(orderNo: string, total: number, serviceType: 'dine_in' | 'delivery'): string {
 const reviewable = serviceType === 'dine_in' ? '1' : '0'
 return `/pages/payment-result/index?orderNo=${encodeURIComponent(orderNo)}&total=${total}&serviceType=${serviceType}&reviewable=${reviewable}`
}
