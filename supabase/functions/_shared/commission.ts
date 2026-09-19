/**
 * commission.ts — 分佣 V5 纯计算函数（无副作用、无 Deno/supabase 依赖）
 *
 * 与 distribute-commission Edge Function 的算法一一对应，供 EF 与 *_test.ts 共用。
 * 段位配置 / 系数口径必须与前端 commission-calculator-v5.ts 完全一致，否则前后端分佣比例分裂。
 *
 * ⚠️ 纯函数：不读 env、不碰 DB。涉及环境变量（个税阈值/通道费率）通过参数传入，便于测试固定。
 */

/** V5 段位配置（与前端 commission-calculator-v5.ts 完全一致；已收敛上限防止亏损） */
export const RANK_TABLE = [
  { rank: '无心境', minScore: 20000, l1: 0.50, l2: 0.20, points: 0.30 },
  { rank: '悟心', minScore: 6000, l1: 0.48, l2: 0.19, points: 0.32 },
  { rank: '静心', minScore: 2000, l1: 0.46, l2: 0.18, points: 0.34 },
  { rank: '明心', minScore: 800, l1: 0.44, l2: 0.17, points: 0.34 },
  { rank: '初心', minScore: 200, l1: 0.42, l2: 0.16, points: 0.32 },
  { rank: '凡心', minScore: 0, l1: 0.40, l2: 0.15, points: 0.30 },
] as const

export type RankRow = (typeof RANK_TABLE)[number]

/** V5 平台最低抽成（让利池 × 10% 恒定进入平台） */
export const MIN_PLATFORM_RATE_V5 = 0.10

/**
 * 视为「有效成交」的订单状态。
 * ⚠️ 必须与 public.order_status 枚举真实值一致（00001 + 00061 追加 pending_pickup）。
 * 原写法含 'paid'/'used' 会触发 22P02 枚举越界 → 整个分佣函数失败、所有订单不分佣。
 */
export const ACTIVE_ORDER_STATUSES = [
  'completed',
  'pending_ship',
  'pending_receive',
  'pending_review',
  'pending_pickup',
] as const

/** 精确计算（万分位） */
export function toFixed4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** 计算动态分数（近6月滚动消费，1:1） */
export function calculateDynamicScore(rollingConsumption: number): number {
  return Math.round((rollingConsumption || 0) * 100) / 100
}

/** 根据动态分数判定段位（RANK_TABLE 高→低，返回首个满足门槛的最高段位；兜底凡心） */
export function getRankByScore(score: number): RankRow {
  for (const rank of RANK_TABLE) {
    if (score >= rank.minScore) return rank
  }
  return RANK_TABLE[RANK_TABLE.length - 1]
}

/** 活跃系数：近30天有推荐成交=1.0；30~60天有=0.5（宽限）；连续60天无=0（暂停，防躺平） */
export function getActiveMultiplier(recent30dReferredOrders: number, prev30dReferredOrders: number): number {
  if (recent30dReferredOrders > 0) return 1.0
  if (prev30dReferredOrders > 0) return 0.5
  return 0
}

/** 拓新衰减：距上次拓新 ≤90天=1.0；>90天=0.4；从未拓新(NULL)=1.0（不惩罚新推广员） */
export function getRecruitMultiplier(daysSinceLastRecruit: number | null): number {
  if (daysSinceLastRecruit == null) return 1.0
  if (daysSinceLastRecruit > 90) return 0.4
  return 1.0
}

/**
 * 代扣个税（劳务报酬/佣金所得），由用户承担，从佣金扣除。
 * @param income 佣金净额（通道费已扣）
 * @param taxRate 默认 0.20
 * @param threshold 免征额，默认 800（≤threshold 不征）
 */
export function calcWithholdingTax(income: number, taxRate = 0.20, threshold = 800): number {
  const base = Math.max(0, income)
  if (base <= threshold) return 0
  if (base <= 4000) return toFixed4((base - threshold) * taxRate)
  return toFixed4(base * 0.8 * taxRate) // = base * 0.16
}

/**
 * 将订单级通道费/代扣税按金额比例分摊到各佣金行。
 * @returns 每行应扣通道费、代扣税与净额
 */
export function allocCommission(
  rowAmt: number,
  cashTotal: number,
  channelFee: number,
  taxWithheld: number,
): { channelFee: number; taxWithheld: number; net: number } {
  if (cashTotal <= 0 || rowAmt <= 0) return { channelFee: 0, taxWithheld: 0, net: rowAmt }
  const cf = toFixed4((channelFee * rowAmt) / cashTotal)
  const tx = toFixed4((taxWithheld * rowAmt) / cashTotal)
  const net = toFixed4(rowAmt - cf - tx)
  return { channelFee: cf, taxWithheld: tx, net }
}

/**
 * 归一化分配（平台恰好抽 10%，剩余 90% 由 买家/L1/L2 按段位比例全额分配，无亏损）：
 * 三项 raw 比例之和可能 ≠ 1（如 无心境 1.08 / 凡心 0.85），按各自 raw 占比归一化，
 * 保证 平台留成恒 = 让利×10%、三方拿满 90%、任何段位都不可能亏损。
 *
 * @returns 各自的归一化份额（买家/L1/L2）+ 平台留成（= 让利池 − 佣金池）
 */
export function normalizeDistribution(
  discountPool: number,
  rawBuyer: number,
  rawL1: number,
  rawL2: number,
): { fracBuyer: number; fracL1: number; fracL2: number; commissionPool: number; platformIncome: number } {
  const commissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))
  const sumRaw = toFixed4(rawBuyer + rawL1 + rawL2)
  const fracBuyer = sumRaw > 0 ? rawBuyer / sumRaw : 0
  const fracL1 = sumRaw > 0 ? rawL1 / sumRaw : 0
  const fracL2 = sumRaw > 0 ? rawL2 / sumRaw : 0
  const platformIncome = toFixed4(discountPool - commissionPool) // 恒 = 让利 × 10%
  return { fracBuyer, fracL1, fracL2, commissionPool, platformIncome }
}
