/**
 * V5 流动性二级推广算法（防亏损 + 防躺平版）
 *
 * 2026-07-18 优化（针对「段位逻辑不对 / 躺平收益高」）：
 * 1. 段位口径改为【近 6 个月滚动消费】决定（原终身累计消费只增不减 → 躺平者永久高段位）。
 *    窗口外消费自动过期，停止消费即自动降级，从源头消除「躺平高收益」。
 * 2. 金豆(人民币 1:1 锚定)仍计入滚动消费口径（维持现状），但被 6 月窗口锁死，不会变成永久杠杆。
 * 3. 佣金比例收敛微调：L1 上限 0.60 → 0.50，L2 上限 0.25 → 0.18（保留梯度）。
 * 4. 叠加两层真实门槛（原 checkCommissionEligibility 写死 true 从未生效）：
 *    - 活跃系数 activeMult：近 30 天有推荐成交 = 1.0；30~60 天有 = 0.5（宽限）；连续 60 天无 = 0（暂停）。
 *    - 邀请新用户衰减 recruitMult：距上次邀请新用户 ≤ 90 天 = 1.0；> 90 天 = 0.4（最低不低于基准 40%）；从未邀请新用户不惩罚。
 * 5. 最终佣金 = 剩余池 × 段位比例 × activeMult × recruitMult。
 */

// ============ 段位配置（收敛后） ============
export interface RankConfigV5 {
  rank: MemberRankV5;
  minDynamicScore: number;
  l1CommissionRate: number;   // 流动一级比例（上限 0.50）
  l2CommissionRate: number;   // 静态二级比例（上限 0.18）
  pointsRate: number;         // 积分比例
  icon: string;
  color: string;
}

export type MemberRankV5 =
  | '凡心'
  | '初心'
  | '明心'
  | '静心'
  | '悟心'
  | '无心境'

// L1 上限收敛至 0.50，L2 上限收敛至 0.18，保留梯度（凡心最低，无心境最高）
export const RANK_CONFIG_TABLE_V5: RankConfigV5[] = [
  {
    rank: '凡心',
    minDynamicScore: 0,
    l1CommissionRate: 0.40,
    l2CommissionRate: 0.15,
    pointsRate: 0.30,
    icon: '🍃',
    color: '#90EE90'
  },
  {
    rank: '初心',
    minDynamicScore: 200,
    l1CommissionRate: 0.42,
    l2CommissionRate: 0.16,
    pointsRate: 0.32,
    icon: '🌿',
    color: '#50C878'
  },
  {
    rank: '明心',
    minDynamicScore: 800,
    l1CommissionRate: 0.44,
    l2CommissionRate: 0.17,
    pointsRate: 0.34,
    icon: '📚',
    color: '#4A90D9'
  },
  {
    rank: '静心',
    minDynamicScore: 2000,
    l1CommissionRate: 0.46,
    l2CommissionRate: 0.18,
    pointsRate: 0.37,
    icon: '⚔️',
    color: '#CD7F32'
  },
  {
    rank: '悟心',
    minDynamicScore: 6000,
    l1CommissionRate: 0.48,
    l2CommissionRate: 0.18,
    pointsRate: 0.40,
    icon: '🏯',
    color: '#C0C0C0'
  },
  {
    rank: '无心境',
    minDynamicScore: 20000,
    l1CommissionRate: 0.50,
    l2CommissionRate: 0.18,
    pointsRate: 0.40,
    icon: '👑',
    color: '#FFD700'
  },
]

// ============ 平台配置 ============
export const PLATFORM_CONFIG = {
  MIN_PLATFORM_RATE: 0.10,   // 平台最低抽成 10%
  BINDING_VALID_DAYS: 30,    // 流动一级绑定有效期 30 天
  MAX_ORDERS_PER_DAY: 10,    // 每日订单上限
  MIN_ORDER_FOR_COMMISSION: 5, // 最低计佣订单金额
  // 支付通道费率（微信收单成本，默认0.6%）：**由用户承担**，从佣金扣除，不由平台/商家承担
  CHANNEL_FEE_RATE: 0.006,
  // 代扣个税（劳务报酬/佣金所得）：税率与免征额，由用户承担，从佣金扣除
  TAX_RATE: 0.20,            // 劳务报酬所得税率 20%
  TAX_THRESHOLD: 800,        // 单次佣金≤800元免征（应纳税所得额≤0）
}

// ============ 输入参数 ============
export interface CommissionInputV5 {
  orderAmount: number;           // 订单金额
  discountRate?: number;         // 商家让利率

  // 流动一级（服务人员/推广员 = 直接推荐人）
  staffId?: string | null;
  staffTotalConsumption?: number;       // 兼容旧调用（缺省回退为滚动消费）
  staffRollingConsumption?: number;     // 近6月滚动消费（决定段位）
  staffActiveMult?: number;             // 活跃系数（默认 1）
  staffRecruitMult?: number;            // 邀请新用户衰减系数（默认 1）

  // 静态二级（推荐人的推荐人）
  referrerId?: string | null;
  referrerTotalConsumption?: number;
  referrerRollingConsumption?: number;
  referrerActiveMult?: number;
  referrerRecruitMult?: number;

  // 买家
  buyerId: string;
  buyerTotalConsumption?: number;
  buyerRollingConsumption?: number;
}

// ============ 计算结果 ============
export interface CommissionResultV5 {
  orderAmount: number;
  discountPool: number;          // 平台让利
  platformMinIncome: number;     // 平台最低抽成（10%）
  remainingPool: number;         // 剩余池（平台让利 - 平台最低抽成）

  l1Commission: number;          // 流动一级佣金
  l2Commission: number;          // 静态二级佣金
  buyerPoints: number;           // 买家积分
  platformExtraIncome: number;   // 平台额外收入
  platformTotalIncome: number;   // 平台总收入（仅平台让利内抽成，不承受通道费/税费）

  // 用户侧（承担支付通道费 + 代扣个税）
  userGrossCommission: number;   // 用户名义现金佣金（L1+L2，未扣费税前）
  channelFee: number;            // 支付通道费 = 现金基数 × 费率（**用户承担**，从佣金扣除）
  taxWithheld: number;           // 代扣个税（**用户承担**，从佣金扣除）
  userNetCommission: number;     // 用户净到手 = 名义佣金 − 通道费 − 代扣税

  // 比例（基于剩余池）
  l1Rate: number;
  l2Rate: number;
  pointsRate: number;
  platformExtraRate: number;

  // 段位信息
  staffRank: string;
  referrerRank: string;
  buyerRank: string;
}

// ============ 活跃 / 邀请新用户 系数（纯函数，前后端复用，保证一致） ============

/**
 * 活跃系数：依据「推荐成交」活跃度（近 30 天 / 30~60 天的被推荐人下单数）。
 * - 近 30 天有推荐成交 → 1.0（全额）
 * - 仅 30~60 天有 → 0.5（宽限期减半）
 * - 连续 60 天无推荐成交 → 0（暂停资格，杜绝零活跃躺赚）
 */
export function getActiveMultiplier(recent30dReferredOrders: number, prev30dReferredOrders: number): number {
  if (recent30dReferredOrders > 0) return 1.0
  if (prev30dReferredOrders > 0) return 0.5
  return 0
}

/**
 * 邀请新用户衰减系数：依据「距上次邀请新用户（下级注册）天数」。
 * - ≤ 90 天 → 1.0（持续邀请新用户）
 * - > 90 天 → 0.4（连续 3 月未邀请新用户，逐级衰减至基准 40%，最低不低于 40%）
 * - 从未邀请新用户(NULL) → 1.0（给新推广员缓冲，不惩罚）
 */
export function getRecruitMultiplier(daysSinceLastRecruit: number | null): number {
  if (daysSinceLastRecruit == null) return 1.0
  if (daysSinceLastRecruit > 90) return 0.4
  return 1.0
}

// ============ 核心计算函数 ============
export function calculateCommissionV5(input: CommissionInputV5): CommissionResultV5 {
  const {
    orderAmount,
    discountRate = 0.09,
    // 滚动消费优先；旧调用只传 total_consumption 时回退为滚动近似（预览位兼容）
    staffRollingConsumption = input.staffTotalConsumption ?? 0,
    referrerRollingConsumption = input.referrerTotalConsumption ?? 0,
    buyerRollingConsumption = input.buyerTotalConsumption ?? 0,
  } = input

  // 1. 计算平台让利
  const discountPool = toPrecision(orderAmount * discountRate)

  // 2. 平台最低抽成（10%）
  const platformMinIncome = toPrecision(discountPool * PLATFORM_CONFIG.MIN_PLATFORM_RATE)
  const remainingPool = toPrecision(discountPool - platformMinIncome)

  // 3. 计算段位（按 低→高 排序后遍历；段位由【近6月滚动消费】决定）
  const sortedRanks = [...RANK_CONFIG_TABLE_V5].sort((a, b) => a.minDynamicScore - b.minDynamicScore)

  const staffDynamicScore = calculateDynamicScore(staffRollingConsumption)
  const staffRank = getRankByScore(staffDynamicScore, sortedRanks)

  const referrerDynamicScore = calculateDynamicScore(referrerRollingConsumption)
  const referrerRank = getRankByScore(referrerDynamicScore, sortedRanks)

  const buyerDynamicScore = calculateDynamicScore(buyerRollingConsumption)
  const buyerRank = getRankByScore(buyerDynamicScore, sortedRanks)

  // 4. 计算佣金（剩余池 × 段位比例 × 活跃系数 × 邀请新用户衰减）
  let l1Commission = 0
  let l2Commission = 0

  if (input.staffId) {
    const active = input.staffActiveMult ?? 1
    const recruit = input.staffRecruitMult ?? 1
    l1Commission = toPrecision(remainingPool * staffRank.l1CommissionRate * active * recruit)
  }

  if (input.referrerId) {
    const active = input.referrerActiveMult ?? 1
    const recruit = input.referrerRecruitMult ?? 1
    l2Commission = toPrecision(remainingPool * referrerRank.l2CommissionRate * active * recruit)
  }

  // 5. 计算积分
  const rawBuyerPoints = toPrecision(remainingPool * buyerRank.pointsRate)
  // 确权积分下限：只要有让利分配，至少确权 1 点（与 EF 一致；避免小额定单舍入为 0，"购买者确权积分"列失效）
  const buyerPoints = rawBuyerPoints > 0 ? Math.max(1, Math.round(rawBuyerPoints)) : 0

  // 6. 平台保底封顶：段位系数×活跃×拓新可能使 一级+二级佣金 超过 剩余池(让利×90%)，
  //    挤出平台保底。故将 L1+L2 上限封顶为 (剩余池 − 买家确权积分)，超出按比例缩放，
  //    保证平台留成恒等于让利×10%（与 distribute-commission EF 完全一致）。
  const commTotalRaw = l1Commission + l2Commission
  const capForComm = Math.max(0, toPrecision(remainingPool - buyerPoints))
  if (commTotalRaw > capForComm && commTotalRaw > 0) {
    const scale = capForComm / commTotalRaw
    l1Commission = toPrecision(l1Commission * scale)
    l2Commission = toPrecision(l2Commission * scale)
  }

  // 7. 平台额外收入
  const platformExtraIncome = toPrecision(
    remainingPool - l1Commission - l2Commission - buyerPoints
  )

  // 8. 平台总收入
  const platformTotalIncome = toPrecision(platformMinIncome + platformExtraIncome)

  // 7.1 用户名义现金佣金（L1+L2，可提现部分；买家积分是虚拟币，不在此列）
  const userGrossCommission = toPrecision(l1Commission + l2Commission)

  // 7.2 支付通道费（微信约0.6%）：**由用户承担**，从佣金扣除（商家/平台不承担）
  const channelFee = toPrecision(orderAmount * PLATFORM_CONFIG.CHANNEL_FEE_RATE)

  // 7.3 通道费后佣金
  const afterChannel = Math.max(0, userGrossCommission - channelFee)

  // 7.4 代扣个税（劳务报酬/佣金所得）
  const taxWithheld = toPrecision(calcWithholdingTax(afterChannel))

  // 7.5 用户净到手 = 名义佣金 − 通道费 − 代扣税
  const userNetCommission = toPrecision(afterChannel - taxWithheld)

  return {
    orderAmount,
    discountPool,
    platformMinIncome,
    remainingPool,
    l1Commission,
    l2Commission,
    buyerPoints,
    platformExtraIncome,
    platformTotalIncome,
    userGrossCommission,
    channelFee,
    taxWithheld,
    userNetCommission,
    l1Rate: remainingPool > 0 ? l1Commission / remainingPool : 0,
    l2Rate: remainingPool > 0 ? l2Commission / remainingPool : 0,
    pointsRate: remainingPool > 0 ? buyerPoints / remainingPool : 0,
    platformExtraRate: remainingPool > 0 ? platformExtraIncome / remainingPool : 0,
    staffRank: staffRank.rank,
    referrerRank: referrerRank.rank,
    buyerRank: buyerRank.rank,
  }
}

// ============ 工具函数 ============
/**
 * 计算段位动态分数（V5：基于消费额，1:1；此处消费额已为「近6月滚动消费」口径）
 */
export function calculateDynamicScore(
  personalTotalConsumption: number
): number {
  return Math.round((personalTotalConsumption || 0) * 100) / 100
}

/** 根据动态分数判定段位（导出给页面复用，保证前后端一致） */
export function getRankByDynamicScoreV5(dynamicScore: number): RankConfigV5 {
  const score = Math.max(0, dynamicScore || 0)
  const sortedRanks = [...RANK_CONFIG_TABLE_V5].sort((a, b) => a.minDynamicScore - b.minDynamicScore)
  let matched = sortedRanks[0]
  for (const config of sortedRanks) {
    if (score >= config.minDynamicScore) matched = config
  }
  return matched
}

/**
 * 段位-徽章关联（#74）：会员「身份段位」= 个人累计消费决定基础段位，
 * 高段位（悟心 / 无心境）叠加「徽章收集度」软门槛——消费达标但徽章不足则向下封顶，
 * 不硬卡升级（体验优先）。佣金比例仍由消费段位决定（见 calculateCommissionV5），
 * 身份段位与佣金段位解耦，确保「等级不靠拉人」。
 */
export const RANK_BADGE_SOFT_GATE: Partial<Record<MemberRankV5, { minBadges: number; minRare: number }>> = {
  '悟心': { minBadges: 4, minRare: 0 },
  '无心境': { minBadges: 8, minRare: 1 },
}

export interface MemberRankInput {
  totalConsumption: number
  badgeCount?: number
  rareBadgeCount?: number // epic + legend 数量
}

export function computeMemberRank(input: MemberRankInput): MemberRankV5 {
  const base = getRankByDynamicScoreV5(calculateDynamicScore(input.totalConsumption)).rank
  const badgeCount = input.badgeCount ?? 0
  const rareBadgeCount = input.rareBadgeCount ?? 0

  // 无心境：需徽章收集度 ≥ 8 且含 ≥ 1 史诗/传说；不足则退守悟心（悟心也不满足则静心）
  if (base === '无心境') {
    const g = RANK_BADGE_SOFT_GATE['无心境']!
    if (badgeCount < g.minBadges || rareBadgeCount < g.minRare) {
      const lg = RANK_BADGE_SOFT_GATE['悟心']!
      if (badgeCount >= lg.minBadges) return '悟心'
      return '静心'
    }
  }
  // 悟心：需徽章收集度 ≥ 4；不足则封顶静心
  if (base === '悟心') {
    const g = RANK_BADGE_SOFT_GATE['悟心']!
    if (badgeCount < g.minBadges) return '静心'
  }
  return base
}

function getRankByScore(score: number, sortedRanks: RankConfigV5[]): RankConfigV5 {
  const s = Math.max(0, score || 0)
  let matched = sortedRanks[0]
  for (const config of sortedRanks) {
    if (s >= config.minDynamicScore) {
      matched = config
    }
  }
  return matched
}

function toPrecision(n: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.round(n * 10000) / 10000
}

/**
 * 代扣个税（劳务报酬/佣金所得）——由用户承担，从佣金扣除。
 * 依据个人所得税法「劳务报酬所得」计税：
 * - 单次收入 ≤ 免征额(TAX_THRESHOLD)：免征
 * - 单次收入 ≤ 4000：应纳税所得额 = 收入 − 800，税率 20%
 * - 单次收入 > 4000：应纳税所得额 = 收入 × (1 − 20%)，税率 20%
 */
export function calcWithholdingTax(income: number): number {
  const base = Math.max(0, income)
  if (base <= PLATFORM_CONFIG.TAX_THRESHOLD) return 0
  if (base <= 4000) return toPrecision((base - 800) * PLATFORM_CONFIG.TAX_RATE)
  return toPrecision(base * 0.8 * PLATFORM_CONFIG.TAX_RATE)  // = base * 0.16
}

// ============ 测试函数 ============
export function testV5Algorithm(): void {
  console.log('===== V5 算法测试（2026-07-18 滚动段位 + 收敛比例）=====')

  // 测试1：全无心境（滚动消费=终身，最高段位，活跃+邀请新用户）
  const result1 = calculateCommissionV5({
    orderAmount: 100,
    discountRate: 0.10,
    staffId: 'staff-1',
    staffRollingConsumption: 50000,
    staffActiveMult: 1,
    staffRecruitMult: 1,
    referrerId: 'ref-1',
    referrerRollingConsumption: 50000,
    referrerActiveMult: 1,
    referrerRecruitMult: 1,
    buyerId: 'buyer-1',
    buyerRollingConsumption: 50000,
  })

  console.log('【全无心境】订单100元，让利率10%')
  console.log('平台让利：', result1.discountPool)
  console.log('平台最低抽成（10%）：', result1.platformMinIncome)
  console.log('剩余池：', result1.remainingPool)
  console.log('流动一级佣金：', result1.l1Commission, `(${(result1.l1Rate * 100).toFixed(1)}%)`)
  console.log('静态二级佣金：', result1.l2Commission, `(${(result1.l2Rate * 100).toFixed(1)}%)`)
  console.log('买家积分：', result1.buyerPoints, `(${(result1.pointsRate * 100).toFixed(1)}%)`)
  console.log('平台额外收入：', result1.platformExtraIncome)
  console.log('平台总收入：', result1.platformTotalIncome, `(${(result1.platformTotalIncome / result1.discountPool * 100).toFixed(1)}%)`)
  console.log('用户名义佣金(L1+L2)：', result1.userGrossCommission)
  console.log('支付通道费(用户承担)：', result1.channelFee)
  console.log('代扣个税(用户承担)：', result1.taxWithheld)
  console.log('用户净到手：', result1.userNetCommission)

  // 测试2：全散修（最低段位，无活跃/无邀请新用户 → 系数归零）
  const result2 = calculateCommissionV5({
    orderAmount: 100,
    discountRate: 0.10,
    staffId: 'staff-2',
    staffRollingConsumption: 0,
    staffActiveMult: 0,
    staffRecruitMult: 1,
    buyerId: 'buyer-2',
  })

  console.log('\n【全散修·躺平】订单100元，让利率10%（近6月0消费+60天无推荐成交）')
  console.log('流动一级佣金：', result2.l1Commission, '(活跃系数=0 → 归零，杜绝躺赚)')
  console.log('平台总收入：', result2.platformTotalIncome, `(${(result2.platformTotalIncome / result2.discountPool * 100).toFixed(1)}%)`)
}

if (typeof window !== 'undefined') {
  (window as any).testV5Algorithm = testV5Algorithm
}
