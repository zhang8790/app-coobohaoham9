/**
 * V4终极分佣算法（防躺平版 + 六段位动态分配）
 * 解决核心问题：上级躺平不消费，只靠下级拿佣金，平台亏损
 * 
 * 四大核心机制：
 * 1. 六段位动态分配 - 根据动态分数自动判定段位
 * 2. 个人活跃门槛 - 分佣资格开关（杜绝零消费躺赚）
 * 3. 团队流水阶梯 - 动态佣金池（团队低迷时平台提高抽成）
 * 4. 拓新衰减机制 - 只奖励持续拓新（存量复购佣金逐年衰减）
 * 
 * 段位判定：动态分数 = 个人累计消费 × 30% + 团队业绩 × 70%
 */

// ============ 类型定义 ===========

/** 个人活跃状态 */
export type ActiveStatus = 'inactive' | 'low_active' | 'active'

/** 团队流水档位 */
export type TeamGmvLevel = 'low' | 'medium' | 'high'

/** 六段位定义 */
export type MemberRankV4 = 
  | '江湖散修' 
  | '外门弟子' 
  | '内门弟子' 
  | '核心弟子' 
  | '长老' 
  | '掌门'

/** 段位配置 */
export interface RankConfig {
  rank: MemberRankV4
  minDynamicScore: number    // 最小动态分数
  l1CommissionRate: number   // L1分佣比例
  l2CommissionRate: number   // L2分佣比例
  pointsRate: number          // 积分返还比例
  icon: string
  color: string
}

/** 分佣资格状态 */
export interface CommissionEligibility {
  eligible: boolean           // 是否有分佣资格
  reason: string              // 原因
  l1Multiplier: number        // 一级佣金倍数（0=无资格，0.5=减半，1=全额）
  l2Multiplier: number        // 二级佣金倍数
}

/** 团队流水统计 */
export interface TeamGmvStats {
  monthlyGmv: number          // 团队月度GMV
  level: TeamGmvLevel         // 档位
  platformRate: number        // 平台抽成率
  commissionPoolRate: number  // 佣金池比例
}

/** 拓新状态 */
export interface RecruitmentStatus {
  hasNewRecruit: boolean      // 当月是否有新增下线
  monthsSinceLastRecruit: number  // 距离上次拓新月数
  l1Weight: number            // 一级佣金权重
  l2Weight: number            // 二级佣金权重
}

/** 分佣输入参数（V4 - 六段位版） */
export interface CommissionInputV4 {
  orderAmount: number           // 订单金额
  discountRate: number          // 让利率
  
  // 一级推荐人数据（用于判定段位）
  referrer1TotalConsumption: number    // L1个人累计消费
  referrer1TeamPerformance: number    // L1团队业绩
  referrer1MonthlyConsumption: number  // L1当月个人消费
  referrer1ConsecutiveZeroMonths: number  // L1连续零消费月数
  referrer1TeamMonthlyGmv: number       // L1团队月度GMV
  referrer1HasNewRecruit: boolean       // L1当月是否有新增下线
  referrer1MonthsSinceLastRecruit: number  // L1距离上次拓新月数
  
  // 二级推荐人数据（用于判定段位）
  referrer2TotalConsumption: number
  referrer2TeamPerformance: number
  referrer2MonthlyConsumption: number
  referrer2ConsecutiveZeroMonths: number
  referrer2TeamMonthlyGmv: number
  referrer2HasNewRecruit: boolean
  referrer2MonthsSinceLastRecruit: number
  
  // 买家数据（用于判定段位）
  buyerTotalConsumption: number
  buyerTeamPerformance: number
}

/** 分佣计算结果（V4） */
export interface CommissionResultV4 {
  orderAmount: number
  discountPool: number          // 让利池
  platformIncome: number        // 平台收入
  level1Commission: number      // 一级佣金
  level2Commission: number      // 二级佣金
  buyerPoints: number           // 买家积分
  
  // 详细比例
  platformRate: number          // 平台抽成率
  l1Ratio: number               // L1实际比例
  l2Ratio: number               // L2实际比例
  pointsRatio: number           // 积分比例
  
  // 段位信息
  referrer1Rank: MemberRankV4
  referrer1DynamicScore: number
  referrer1Eligible: boolean
  referrer1Reason: string
  
  referrer2Rank: MemberRankV4
  referrer2DynamicScore: number
  referrer2Eligible: boolean
  referrer2Reason: string
  
  buyerRank: MemberRankV4
  buyerDynamicScore: number
}

// ============ 常量配置 ===========

/** 个人活跃门槛（月度最低自消费） */
export const MIN_MONTHLY_CONSUMPTION = 39  // 39元/月

/** 宽限期：首次零消费，次月保留50%佣金 */
export const GRACE_PERIOD_COMMISSION_RATE = 0.5

/** 连续零消费月数阈值（超过则取消分佣资格） */
export const MAX_CONSECUTIVE_ZERO_MONTHS = 2

/** 团队流水档位配置 */
export const TEAM_GMV_THRESHOLDS = {
  low: 1000,     // 低档：<1000元
  medium: 5000,  // 中档：1000-5000元
  high: 5000,    // 高档：>=5000元
}

/** 平台抽成率（根据团队流水档位） */
export const PLATFORM_RATES = {
  low: 0.10,     // 低档：平台抽10%
  medium: 0.08,  // 中档：平台抽8%（标准）
  high: 0.07,    // 高档：平台抽7%（让利团队）
}

/** 拓新衰减配置 */
export const RECRUITMENT_DECAY = {
  newTeamL1Weight: 0.65,    // 新团队一级权重65%
  newTeamL2Weight: 0.35,    // 新团队二级权重35%
  decayRate: 0.10,           // 每月衰减10%
  minL1Weight: 0.40,        // 一级权重最低40%
  monthsToDecay: 3,          // 连续3个月无新增开始衰减
}

// ============ 六段位配置 ===========

/** 六段位配置表（根据动态分数判定） */
export const RANK_CONFIG_TABLE: RankConfig[] = [
  // [动态分数阈值, 段位名, L1分佣, L2分佣, 积分比例]
  { 
    rank: '掌门', 
    minDynamicScore: 50000, 
    l1CommissionRate: 0.28, 
    l2CommissionRate: 0.16, 
    pointsRate: 0.20,
    icon: '👑',
    color: '#FFD700'
  },
  { 
    rank: '长老', 
    minDynamicScore: 15000, 
    l1CommissionRate: 0.25, 
    l2CommissionRate: 0.14, 
    pointsRate: 0.18,
    icon: '🏯',
    color: '#C0C0C0'
  },
  { 
    rank: '核心弟子', 
    minDynamicScore: 5000, 
    l1CommissionRate: 0.23, 
    l2CommissionRate: 0.12, 
    pointsRate: 0.16,
    icon: '⚔️',
    color: '#CD7F32'
  },
  { 
    rank: '内门弟子', 
    minDynamicScore: 2000, 
    l1CommissionRate: 0.20, 
    l2CommissionRate: 0.10, 
    pointsRate: 0.14,
    icon: '📚',
    color: '#4A90D9'
  },
  { 
    rank: '外门弟子', 
    minDynamicScore: 500, 
    l1CommissionRate: 0.18, 
    l2CommissionRate: 0.08, 
    pointsRate: 0.12,
    icon: '🌟',
    color: '#50C878'
  },
  { 
    rank: '江湖散修', 
    minDynamicScore: 0, 
    l1CommissionRate: 0.15, 
    l2CommissionRate: 0.06, 
    pointsRate: 0.10,
    icon: '🍃',
    color: '#90EE90'
  },
]

/** 动态分数权重 */
export const DYNAMIC_SCORE_WEIGHTS = {
  personalConsumption: 0.3,   // 个人累计消费占30%
  teamPerformance: 0.7,        // 团队业绩占70%
}

// ============ 六段位核心计算函数 ===========

/**
 * 计算动态分数（用于判定段位）
 * 
 * 公式：动态分数 = 个人累计消费 × 30% + 团队业绩 × 70%
 * 
 * @param personalTotalConsumption 个人累计消费
 * @param teamPerformance 团队业绩（直接下线消费 + 间接下线消费×0.5）
 * @returns 动态分数
 */
export function calculateDynamicScore(
  personalTotalConsumption: number,
  teamPerformance: number
): number {
  const score = 
    (personalTotalConsumption || 0) * DYNAMIC_SCORE_WEIGHTS.personalConsumption +
    (teamPerformance || 0) * DYNAMIC_SCORE_WEIGHTS.teamPerformance
  
  return Math.round(score * 100) / 100  // 保留两位小数
}

/**
 * 根据动态分数判定段位
 * 
 * @param dynamicScore 动态分数
 * @returns 段位配置
 */
export function getRankByDynamicScore(dynamicScore: number): RankConfig {
  const score = Math.max(0, dynamicScore || 0)
  
  // 从高到低遍历，找到第一个满足条件的段位
  for (let i = 0; i < RANK_CONFIG_TABLE.length; i++) {
    if (score >= RANK_CONFIG_TABLE[i].minDynamicScore) {
      return RANK_CONFIG_TABLE[i]
    }
  }
  
  // 默认返回最低段位
  return RANK_CONFIG_TABLE[RANK_CONFIG_TABLE.length - 1]
}

/**
 * 根据段位名称获取段位配置
 */
export function getRankConfig(rank: MemberRankV4): RankConfig {
  const found = RANK_CONFIG_TABLE.find(r => r.rank === rank)
  return found || RANK_CONFIG_TABLE[RANK_CONFIG_TABLE.length - 1]
}

/**
 * 获取用户的段位信息（用于UI展示）
 * 
 * @param personalTotalConsumption 个人累计消费
 * @param teamPerformance 团队业绩
 * @returns 段位信息
 */
export function getUserRankInfo(
  personalTotalConsumption: number,
  teamPerformance: number
): {
  rank: MemberRankV4
  icon: string
  color: string
  l1CommissionRate: number
  l2CommissionRate: number
  pointsRate: number
  nextRank?: MemberRankV4
  nextRankScore?: number
  progress: number
} {
  const dynamicScore = calculateDynamicScore(personalTotalConsumption, teamPerformance)
  const currentRank = getRankByDynamicScore(dynamicScore)
  const currentIndex = RANK_CONFIG_TABLE.findIndex(r => r.rank === currentRank.rank)
  
  // 计算下一段位
  const nextRankConfig = currentIndex > 0 ? RANK_CONFIG_TABLE[currentIndex - 1] : undefined
  
  // 计算进度（当前分数到下一段位的距离）
  let progress = 100
  if (nextRankConfig) {
    const currentMin = currentRank.minDynamicScore
    const nextMin = nextRankConfig.minDynamicScore
    progress = Math.min(100, ((dynamicScore - currentMin) / (nextMin - currentMin)) * 100)
  }
  
  return {
    rank: currentRank.rank,
    icon: currentRank.icon,
    color: currentRank.color,
    l1CommissionRate: currentRank.l1CommissionRate,
    l2CommissionRate: currentRank.l2CommissionRate,
    pointsRate: currentRank.pointsRate,
    nextRank: nextRankConfig?.rank,
    nextRankScore: nextRankConfig?.minDynamicScore,
    progress: Math.round(progress * 100) / 100,
  }
}

// ============ 机制1：个人活跃门槛 ===========

/**
 * 检查分佣资格（核心函数）
 * 
 * 规则：
 * - 连续2个月零消费 → 取消分佣资格
 * - 当月零消费（首次）→ 一级佣金减半
 * - 当月消费>=门槛 → 全额分佣
 * 
 * @param monthlyConsumption 当月个人消费
 * @param consecutiveZeroMonths 连续零消费月数
 * @returns 分佣资格状态
 */
export function checkCommissionEligibility(
  monthlyConsumption: number,
  consecutiveZeroMonths: number
): CommissionEligibility {
  // 情况1：连续2个月零消费 → 取消资格
  if (consecutiveZeroMonths >= MAX_CONSECUTIVE_ZERO_MONTHS) {
    return {
      eligible: false,
      reason: `连续${MAX_CONSECUTIVE_ZERO_MONTHS}个月零消费，已取消分佣资格`,
      l1Multiplier: 0,
      l2Multiplier: 0,
    }
  }
  
  // 情况2：当月零消费（首次）→ 一级佣金减半
  if (monthlyConsumption === 0) {
    return {
      eligible: true,
      reason: '当月零消费，一级佣金减半（宽限期）',
      l1Multiplier: GRACE_PERIOD_COMMISSION_RATE,
      l2Multiplier: 1,  // 二级不受影响
    }
  }
  
  // 情况3：消费未达门槛 → 一级佣金减半
  if (monthlyConsumption < MIN_MONTHLY_CONSUMPTION) {
    return {
      eligible: true,
      reason: `当月消费未达门槛（${MIN_MONTHLY_CONSUMPTION}元），一级佣金减半`,
      l1Multiplier: GRACE_PERIOD_COMMISSION_RATE,
      l2Multiplier: 1,
    }
  }
  
  // 情况4：正常活跃 → 全额分佣
  return {
    eligible: true,
    reason: '正常活跃，全额分佣',
    l1Multiplier: 1,
    l2Multiplier: 1,
  }
}

// ============ 机制2：团队流水阶梯 ===========

/**
 * 根据团队月度GMV计算档位和平台抽成率
 * 
 * 规则：
 * - 低档（GMV<1000）：平台抽10%，压缩佣金支出
 * - 中档（1000<=GMV<5000）：平台抽8%（标准）
 * - 高档（GMV>=5000）：平台抽7%，让利团队
 * 
 * @param teamMonthlyGmv 团队月度GMV
 * @returns 团队流水统计
 */
export function calculateTeamGmvLevel(teamMonthlyGmv: number): TeamGmvStats {
  const gmv = Math.max(0, teamMonthlyGmv || 0)
  
  if (gmv < TEAM_GMV_THRESHOLDS.low) {
    // 低档：团队流水少，平台提高抽成
    return {
      monthlyGmv: gmv,
      level: 'low',
      platformRate: PLATFORM_RATES.low,
      commissionPoolRate: 1 - PLATFORM_RATES.low,
    }
  } else if (gmv < TEAM_GMV_THRESHOLDS.medium) {
    // 中档：标准
    return {
      monthlyGmv: gmv,
      level: 'medium',
      platformRate: PLATFORM_RATES.medium,
      commissionPoolRate: 1 - PLATFORM_RATES.medium,
    }
  } else {
    // 高档：团队流水高，平台让利
    return {
      monthlyGmv: gmv,
      level: 'high',
      platformRate: PLATFORM_RATES.high,
      commissionPoolRate: 1 - PLATFORM_RATES.high,
    }
  }
}

// ============ 机制3：拓新衰减 ===========

/**
 * 计算拓新衰减后的佣金权重
 * 
 * 规则：
 * - 当月有新增下线 → 恢复全额佣金
 * - 连续3个月无新增 → 一级佣金每月衰减10%
 * - 一级权重最低40%（封顶衰减）
 * 
 * @param hasNewRecruit 当月是否有新增下线
 * @param monthsSinceLastRecruit 距离上次拓新月数
 * @returns 拓新状态
 */
export function calculateRecruitmentWeight(
  hasNewRecruit: boolean,
  monthsSinceLastRecruit: number
): RecruitmentStatus {
  // 有新增下线 → 恢复全额
  if (hasNewRecruit) {
    return {
      hasNewRecruit: true,
      monthsSinceLastRecruit: 0,
      l1Weight: RECRUITMENT_DECAY.newTeamL1Weight,
      l2Weight: RECRUITMENT_DECAY.newTeamL2Weight,
    }
  }
  
  // 无新增下线 → 检查是否需要衰减
  if (monthsSinceLastRecruit >= RECRUITMENT_DECAY.monthsToDecay) {
    // 需要衰减
    const decayMonths = monthsSinceLastRecruit - RECRUITMENT_DECAY.monthsToDecay + 1
    const decayFactor = Math.pow(1 - RECRUITMENT_DECAY.decayRate, decayMonths)
    const l1Weight = Math.max(
      RECRUITMENT_DECAY.minL1Weight,
      RECRUITMENT_DECAY.newTeamL1Weight * decayFactor
    )
    
    return {
      hasNewRecruit: false,
      monthsSinceLastRecruit,
      l1Weight: Math.round(l1Weight * 100) / 100,
      l2Weight: RECRUITMENT_DECAY.newTeamL2Weight,  // L2不衰减
    }
  }
  
  // 不需要衰减
  return {
    hasNewRecruit: false,
    monthsSinceLastRecruit,
    l1Weight: RECRUITMENT_DECAY.newTeamL1Weight,
    l2Weight: RECRUITMENT_DECAY.newTeamL2Weight,
  }
}

// ============ 核心计算函数 ===========

/**
 * V4动态分佣计算（终极防躺平版 + 六段位）
 * 
 * 计算流程：
 * 1. 计算动态分数，判定段位（六段位系统）
 * 2. 检查分佣资格（机制1：活跃门槛）
 * 3. 计算团队流水档位（机制2：流水阶梯）
 * 4. 计算拓新衰减（机制3：拓新衰减）
 * 5. 计算最终佣金（基于段位比例 × 调整系数）
 * 6. 计算积分（基于买家段位）
 */
export function calculateCommissionV4(input: CommissionInputV4): CommissionResultV4 {
  const {
    orderAmount,
    discountRate = 0.09,
    // L1数据
    referrer1TotalConsumption,
    referrer1TeamPerformance,
    referrer1MonthlyConsumption,
    referrer1ConsecutiveZeroMonths,
    referrer1TeamMonthlyGmv,
    referrer1HasNewRecruit,
    referrer1MonthsSinceLastRecruit,
    // L2数据
    referrer2TotalConsumption = 0,
    referrer2TeamPerformance = 0,
    referrer2MonthlyConsumption = 0,
    referrer2ConsecutiveZeroMonths = 0,
    referrer2TeamMonthlyGmv = 0,
    referrer2HasNewRecruit = false,
    referrer2MonthsSinceLastRecruit = 0,
    // 买家数据
    buyerTotalConsumption,
    buyerTeamPerformance,
  } = input
  
  // 1. 计算让利池
  const discountPool = toPrecision(orderAmount * discountRate)
  
  // 2. 计算L1动态分数，判定段位
  const l1DynamicScore = calculateDynamicScore(referrer1TotalConsumption, referrer1TeamPerformance)
  const l1Rank = getRankByDynamicScore(l1DynamicScore)
  const l1BaseRate = l1Rank.l1CommissionRate  // 基础比例（基于段位）
  
  // 3. 检查L1分佣资格（机制1）
  const l1Eligibility = checkCommissionEligibility(
    referrer1MonthlyConsumption,
    referrer1ConsecutiveZeroMonths
  )
  
  // 4. 计算团队流水档位（机制2）
  const teamGmvStats = calculateTeamGmvLevel(
    Math.max(referrer1TeamMonthlyGmv, referrer2TeamMonthlyGmv)
  )
  const commissionPool = toPrecision(discountPool * teamGmvStats.commissionPoolRate)
  
  // 5. 计算拓新权重（机制3）
  const l1Recruitment = calculateRecruitmentWeight(
    referrer1HasNewRecruit,
    referrer1MonthsSinceLastRecruit
  )
  
  // 6. 计算L1最终佣金
  let level1Commission = 0
  if (l1Eligibility.eligible && l1Eligibility.l1Multiplier > 0) {
    // 最终比例 = 段位基础比例 × 拓新权重
    const l1FinalRate = toPrecision(l1BaseRate * l1Recruitment.l1Weight)
    level1Commission = toPrecision(commissionPool * l1FinalRate * l1Eligibility.l1Multiplier)
  }
  
  // 7. 计算L2（同理）
  const l2DynamicScore = calculateDynamicScore(referrer2TotalConsumption, referrer2TeamPerformance)
  const l2Rank = getRankByDynamicScore(l2DynamicScore)
  const l2BaseRate = l2Rank.l2CommissionRate
  
  const l2Eligibility = checkCommissionEligibility(
    referrer2MonthlyConsumption,
    referrer2ConsecutiveZeroMonths
  )
  
  const l2Recruitment = calculateRecruitmentWeight(
    referrer2HasNewRecruit,
    referrer2MonthsSinceLastRecruit
  )
  
  let level2Commission = 0
  if (l2Eligibility.eligible && l2Eligibility.l2Multiplier > 0) {
    const l2FinalRate = toPrecision(l2BaseRate * l2Recruitment.l2Weight)
    level2Commission = toPrecision(commissionPool * l2FinalRate * l2Eligibility.l2Multiplier)
  }
  
  // 8. 计算买家积分（基于买家段位）
  const buyerDynamicScore = calculateDynamicScore(buyerTotalConsumption, buyerTeamPerformance)
  const buyerRank = getRankByDynamicScore(buyerDynamicScore)
  const buyerPoints = toPrecision(discountPool * buyerRank.pointsRate)
  
  // 9. 平台收入 = 让利池 - 佣金 - 积分
  const platformIncome = toPrecision(discountPool - level1Commission - level2Commission - buyerPoints)
  
  // 10. 实际比例（用于展示）
  const l1Ratio = discountPool > 0 ? level1Commission / discountPool : 0
  const l2Ratio = discountPool > 0 ? level2Commission / discountPool : 0
  const pointsRatio = discountPool > 0 ? buyerPoints / discountPool : 0
  
  return {
    orderAmount,
    discountPool,
    platformIncome,
    level1Commission,
    level2Commission,
    buyerPoints,
    platformRate: teamGmvStats.platformRate,
    l1Ratio,
    l2Ratio,
    pointsRatio,
    // 段位信息
    referrer1Rank: l1Rank.rank,
    referrer1DynamicScore: l1DynamicScore,
    referrer1Eligible: l1Eligibility.eligible,
    referrer1Reason: l1Eligibility.reason,
    referrer2Rank: l2Rank.rank,
    referrer2DynamicScore: l2DynamicScore,
    referrer2Eligible: l2Eligibility.eligible,
    referrer2Reason: l2Eligibility.reason,
    buyerRank: buyerRank.rank,
    buyerDynamicScore: buyerDynamicScore,
  }
}

// ============ 工具函数 ===========

function toPrecision(n: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.round(n * 10000) / 10000
}

/**
 * 格式化金额（用于UI展示）
 */
export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

/**
 * 格式化积分（用于UI展示）
 */
export function formatPoints(points: number): string {
  return `${Math.round(points)}积分`
}

/**
 * 测试函数：验证六段位算法合理性
 */
export function testRankAlgorithm(): void {
  console.log('===== 六段位算法测试 =====')
  
  // 测试1：不同动态分数的段位判定
  const testScores = [0, 300, 800, 2500, 6000, 16000, 55000]
  testScores.forEach(score => {
    const rank = getRankByDynamicScore(score)
    console.log(`动态分数 ${score} → 段位：${rank.rank}（L1:${rank.l1CommissionRate*100}%, L2:${rank.l2CommissionRate*100}%, 积分:${rank.pointsRate*100}%）`)
  })
  
  // 测试2：完整分佣计算
  console.log('\n===== 分佣计算测试 =====')
  const result = calculateCommissionV4({
    orderAmount: 100,
    discountRate: 0.09,
    referrer1TotalConsumption: 3000,
    referrer1TeamPerformance: 5000,
    referrer1MonthlyConsumption: 50,
    referrer1ConsecutiveZeroMonths: 0,
    referrer1TeamMonthlyGmv: 2000,
    referrer1HasNewRecruit: true,
    referrer1MonthsSinceLastRecruit: 0,
    referrer2TotalConsumption: 500,
    referrer2TeamPerformance: 1000,
    referrer2MonthlyConsumption: 20,
    referrer2ConsecutiveZeroMonths: 0,
    referrer2TeamMonthlyGmv: 500,
    referrer2HasNewRecruit: false,
    referrer2MonthsSinceLastRecruit: 2,
    buyerTotalConsumption: 1000,
    buyerTeamPerformance: 0,
  })
  
  console.log('订单金额：', result.orderAmount)
  console.log('让利池：', result.discountPool)
  console.log('L1段位：', result.referrer1Rank, '（动态分数：', result.referrer1DynamicScore, '）')
  console.log('L1佣金：', result.level1Commission, '（', result.l1Ratio * 100, '%）')
  console.log('L2段位：', result.referrer2Rank, '（动态分数：', result.referrer2DynamicScore, '）')
  console.log('L2佣金：', result.level2Commission, '（', result.l2Ratio * 100, '%）')
  console.log('买家段位：', result.buyerRank, '（动态分数：', result.buyerDynamicScore, '）')
  console.log('买家积分：', result.buyerPoints, '（', result.pointsRatio * 100, '%）')
  console.log('平台收入：', result.platformIncome, '（', result.platformRate * 100, '%）')
  console.log('合计：', result.level1Commission + result.level2Commission + result.buyerPoints + result.platformIncome)
}
