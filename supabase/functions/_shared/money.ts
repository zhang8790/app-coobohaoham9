/**
 * money.ts — 资金流纯计算函数（无副作用、无 Deno/supabase 依赖）
 *
 * 所有资金关键路径的「金额口径」单一事实源，供：
 *   - create-order / refund-order / wechat-payment-callback / wechat-refund-callback（Edge Function）
 *   - *_test.ts（Deno 单测 / 集成测试）
 * 共用，杜绝「前端一份算法、后端一份算法、改一处漏一处」导致的资损。
 *
 * ⚠️ 这些函数被设计成纯函数（同输入同输出），便于单元/集成测试。
 *    改动任何公式必须先同步更新对应 *.test.ts 的期望值并跑 `deno test`。
 */

/** 万分位精度取整（与全部 EF 一致） */
export function toFixed4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * 可退款订单状态白名单。
 * 必须与前端入口（order-center「申请退款」按钮，见 src/pages/trade/refund-apply）保持一致，
 * 否则会出现「前端能点、后端 400」或反之。
 * pending_review = 已付款且已收货/到店消费待评价（纯健康豆堂食单建单即此态），必须可退。
 * 排除：pending_pay(未付款)、cancelled(已取消)、after_sale(退款流程中)、paid(幻状态)。
 */
export const REFUNDABLE_STATUSES = [
  'pending_ship',
  'pending_receive',
  'pending_review',
  'completed',
  'pending_pickup',
] as const

export type RefundableStatus = (typeof REFUNDABLE_STATUSES)[number]

export function isRefundableStatus(status: string | null | undefined): boolean {
  return status != null && (REFUNDABLE_STATUSES as readonly string[]).includes(status)
}

/**
 * payment_method 合法枚举（对齐 public 表 CHECK：('wxpay','emotion_beans')）。
 * 旧 'gold_beans' 已作废（写它触发 23514）。
 */
export const PAYMENT_METHOD_WHITELIST = ['wxpay', 'emotion_beans'] as const

export type PayMode = 'pure_gold' | 'hybrid' | 'wxpay'

/**
 * 支付模式 → orders.payment_method 落库值。
 *   pure_gold → 'emotion_beans'（纯健康豆）
 *   hybrid     → 'wxpay'      （混合支付，微信侧记一笔，健康豆抵扣部分走账户）
 *   wxpay      → 'wxpay'      （纯微信）
 */
export function mapPayModeToPaymentMethod(payMode: PayMode): 'wxpay' | 'emotion_beans' {
  if (payMode === 'pure_gold') return 'emotion_beans'
  return 'wxpay'
}

/**
 * 可退金额（元，2 位）= 订单全额 − 已退累计，下限 0。
 * 原 get_refundable_amount RPC 移除后由 refund-order 内联，此处收口为单一事实源。
 */
export function computeRefundableAmount(totalAmount: number, alreadyRefunded: number): number {
  return Math.max(0, Math.round((Number(totalAmount ?? 0) - Number(alreadyRefunded ?? 0)) * 100) / 100)
}

/**
 * 🔴 微信退款交易额（分）= (订单全额 − 健康豆抵扣) × 100。
 *
 * 这是混合支付退款的「头号资损不变量」：微信只认「原微信实付额」，
 * 误传 total_amount*100（含健康豆部分）会被微信以「订单金额不一致」拒绝，
 * 导致所有混合支付订单退款必然失败。create-wechat-payment 下单时正是按此口径报 wxAmount。
 */
export function computeWechatRefundTotalCents(totalAmount: number, tbUsed: number): number {
  return Math.round((Number(totalAmount ?? 0) - Number(tbUsed ?? 0)) * 100)
}

/**
 * 本次退款的微信退款金额（分）= (本次退款额 − 健康豆抵扣占比部分) × 100，下限 0。
 * 健康豆抵扣部分（tb_used * 退款占比）不走微信，由账户侧返还。
 */
export function computeWxRefundAmount(refundAmount: number, tbUsed: number, totalAmount: number): number {
  const total = Number(totalAmount ?? 0)
  const portion = Number(tbUsed ?? 0) * (total > 0 ? refundAmount / total : 0)
  return Math.max(0, Math.round((Number(refundAmount ?? 0) - portion) * 100))
}

/**
 * 本次退款应返还的健康豆（元，2 位）= 健康豆抵扣 × 退款占比，下限 0。
 * 00096 后 tb_used 为「元」口径（1 健康豆 = 1 元），切勿 ×0.01。
 */
export function computeBeanPortion(tbUsed: number, refundAmount: number, totalAmount: number): number {
  const total = Number(totalAmount ?? 0)
  const ratio = total > 0 ? Number(refundAmount ?? 0) / total : 1
  return Math.max(0, Math.round(Number(tbUsed ?? 0) * ratio * 100) / 100)
}

/**
 * 商品金额加权混合让利率（小数口径，如 0.09 = 9%）。
 * 每商品用自身 discount_rate（整数%÷100），未设则回退门店率；
 * 按商品金额(price×quantity)加权得到整单混合率。与 wechat-payment-callback / create-order 算法一致。
 *
 * @param items    订单商品行（price/quantity/product_id）
 * @param rateMap  商品ID → discount_rate（整数% 或 小数均可；>0 视为整数% 自动 ÷100；<=0 回退门店率）
 * @param storeFallback 门店回退率（小数口径）
 */
export function computeWeightedRate(
  items: Array<{ price?: number | string; quantity?: number | string; product_id?: string | null }>,
  rateMap: Record<string, number>,
  storeFallback: number,
): number {
  let totalAmt = 0
  let weightedSum = 0
  for (const it of items) {
    const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
    const pid = String(it.product_id ?? '')
    const rawRate = rateMap[pid]
    const pRate =
      typeof rawRate === 'number' && rawRate > 0
        ? rawRate / 100 // discount_rate 为整数%（如 9 表示 9%）
        : storeFallback
    totalAmt += amt
    weightedSum += amt * pRate
  }
  return totalAmt > 0 ? weightedSum / totalAmt : 0
}

/** 跨门店拆单时，健康豆只记在第一个子单（其余为 0） */
export function beanUsedForSubOrder(isFirstSubOrder: boolean, totalBeanUsed: number): number {
  return isFirstSubOrder ? Number(totalBeanUsed ?? 0) : 0
}
