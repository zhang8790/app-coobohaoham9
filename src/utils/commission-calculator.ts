/**
 * V3动态分佣计算器（团队业绩版 - 终极优化）
 * 核心规则：分佣比例基于团队业绩，激励上线积极发展下线
 *
 * 分配比例（让利池100%）：
 * - 平台收入：50%（固定）✅ 保底盈利
 * - 买家积分：10%-16%（连续动态，基于买家团队业绩）
 * - 一级分佣：15%-24%（连续动态，基于L1团队业绩）
 * - 二级分佣：6%-10%（连续动态，基于L2团队业绩）
 * ─────────────────────────────
 * 合计：31%-50%（未分配部分归平台，平台实际拿50%-69%）
 *
 * 核心改进：
 * - 动态分数 = 个人消费 × 30% + 团队业绩 × 70%
 * - 团队业绩高 → 段位高 → 提成多
 * - 即使自己不消费，下线消费多也能拿高提成
 */

// ============ 类型定义 ============

export interface CommissionInput {
  orderAmount: number
  discountRate: number
  // 买家数据
  buyerPersonalConsumption: number    // 买家个人累计消费
  buyerTeamPerformance: number        // 买家团队业绩
  // 一级推荐人数据
  referrer1PersonalConsumption: number  // L1个人累计消费
  referrer1TeamPerformance: number      // L1团队业绩
  // 二级推荐人数据
  referrer2PersonalConsumption: number  // L2个人累计消费
  referrer2TeamPerformance: number      // L2团队业绩
}

export interface CommissionResult {
  orderAmount: number
  discountPool: number
  platformIncome: number
  level1Commission: number
  level2Commission: number
  buyerPoints: number
  platformRatio: number
  l1Ratio: number
  l2Ratio: number
  pointsRatio: number
  // 段位信息
  buyerRank: string
  referrer1Rank: string
  referrer2Rank: string
  // 动态分数（用于调试）
  buyerDynamicScore: number
  referrer1DynamicScore: number
  referrer2DynamicScore: number
}

// ============ 常量 ============

export const PLATFORM_RATIO = 0.50  // 平台固定拿50%

// ============ 核心算法 ============

/**
 * 计算动态分数（团队业绩版）
 * 
 * 公式：动态分数 = 个人消费 × 30% + 团队业绩 × 70%
 * 
 * 设计理念：
 * - 个人消费占30%（激励自己消费）
 * - 团队业绩占70%（激励发展下线）
 * - 即使自己不消费，下线消费多也能拿高提成
 * 
 * @param personalConsumption 个人累计消费
 * @param teamPerformance 团队业绩（直接下线消费 + 间接下线消费 × 0.5）
 * @returns 动态分数
 */
export function calculateDynamicScore(
  personalConsumption: number,
  teamPerformance: number
): number {
  const personal = Math.max(0, personalConsumption || 0)
  const team = Math.max(0, teamPerformance || 0)
  
  // 团队业绩权重70%，个人消费权重30%
  return personal * 0.3 + team * 0.7
}

/**
 * 计算团队业绩（用于更新用户数据）
 * 
 * 公式：团队业绩 = 直接下线消费总额 + 间接下线消费总额 × 0.5
 * 
 * @param directReferralsConsumption 直接下线（L1）消费总额
 * @param indirectReferralsConsumption 间接下线（L2）消费总额
 * @returns 团队业绩
 */
export function calculateTeamPerformance(
  directReferralsConsumption: number,
  indirectReferralsConsumption: number = 0
): number {
  const direct = Math.max(0, directReferralsConsumption || 0)
  const indirect = Math.max(0, indirectReferralsConsumption || 0)
  
  // 间接下线消费打5折（因为已经被L1计算过一次）
  return direct + indirect * 0.5
}

/**
 * 连续敏感曲线：积分比例
 * 范围：10%-16%
 * 
 * 设计理念：
 * - 最低10%（激励新用户）
 * - 最高16%（防止过高）
 * - 曲线增长（前期快，后期慢）
 */
export function calculatePointsRatio(dynamicScore: number): number {
  const minRatio = 0.10
  const maxRatio = 0.16
  const steepness = 0.00008  // 曲线陡峭度
  
  // sigmoid函数：平滑增长曲线
  const sigmoid = 1 / (1 + Math.exp(-steepness * dynamicScore))
  const ratio = minRatio + (maxRatio - minRatio) * sigmoid
  
  return toPrecision(ratio)
}

/**
 * 连续敏感曲线：L1分佣比例
 * 范围：15%-24%
 */
export function calculateL1Ratio(dynamicScore: number): number {
  const minRatio = 0.15
  const maxRatio = 0.24
  const steepness = 0.00008
  
  const sigmoid = 1 / (1 + Math.exp(-steepness * dynamicScore))
  const ratio = minRatio + (maxRatio - minRatio) * sigmoid
  
  return toPrecision(ratio)
}

/**
 * 连续敏感曲线：L2分佣比例
 * 范围：6%-10%
 */
export function calculateL2Ratio(dynamicScore: number): number {
  const minRatio = 0.06
  const maxRatio = 0.10
  const steepness = 0.00008
  
  const sigmoid = 1 / (1 + Math.exp(-steepness * dynamicScore))
  const ratio = minRatio + (maxRatio - minRatio) * sigmoid
  
  return toPrecision(ratio)
}

/**
 * V3动态分佣计算（核心函数 - 团队业绩版）
 * 
 * 计算流程：
 * 1. 计算让利池 = 订单金额 × 让利率
 * 2. 计算各角色动态分数（个人消费30% + 团队业绩70%）
 * 3. 根据动态分数计算积分和分佣比例
 * 4. 计算各角色分配
 * 5. 未分配部分归平台（保证平台收入≥50%）
 */
export function calculateCommissionV3(input: CommissionInput): CommissionResult {
  const {
    orderAmount,
    discountRate = 0.09,
    buyerPersonalConsumption,
    buyerTeamPerformance,
    referrer1PersonalConsumption,
    referrer1TeamPerformance,
    referrer2PersonalConsumption = 0,
    referrer2TeamPerformance = 0,
  } = input
  
  // 1. 计算让利池
  const discountPool = toPrecision(orderAmount * discountRate)
  
  // 2. 计算各角色动态分数
  const buyerDynamicScore = calculateDynamicScore(buyerPersonalConsumption, buyerTeamPerformance)
  const referrer1DynamicScore = calculateDynamicScore(referrer1PersonalConsumption, referrer1TeamPerformance)
  const referrer2DynamicScore = calculateDynamicScore(referrer2PersonalConsumption, referrer2TeamPerformance)
  
  // 3. 根据动态分数计算比例
  const pointsRatio = calculatePointsRatio(buyerDynamicScore)
  const l1Ratio = calculateL1Ratio(referrer1DynamicScore)
  const l2Ratio = calculateL2Ratio(referrer2DynamicScore)
  
  // 4. 平台固定拿50%
  const platformIncome = toPrecision(discountPool * PLATFORM_RATIO)
  
  // 5. 计算各角色分配
  const buyerPoints = toPrecision(discountPool * pointsRatio)
  const level1Commission = toPrecision(discountPool * l1Ratio)
  const level2Commission = toPrecision(discountPool * l2Ratio)
  
  // 6. 未分配部分归平台（保证平台收入≥50%）
  const distributed = toPrecision(buyerPoints + level1Commission + level2Commission)
  const unallocated = toPrecision(discountPool * PLATFORM_RATIO - distributed)
  const actualPlatformIncome = toPrecision(platformIncome + Math.max(0, unallocated))
  
  return {
    orderAmount,
    discountPool,
    platformIncome: actualPlatformIncome,
    level1Commission,
    level2Commission,
    buyerPoints,
    platformRatio: PLATFORM_RATIO,
    l1Ratio,
    l2Ratio,
    pointsRatio,
    buyerRank: getRankNameByScore(buyerDynamicScore),
    referrer1Rank: getRankNameByScore(referrer1DynamicScore),
    referrer2Rank: getRankNameByScore(referrer2DynamicScore),
    buyerDynamicScore,
    referrer1DynamicScore,
    referrer2DynamicScore,
  }
}

/**
 * 简化计算：积分预览（用于支付页面）
 * 
 * @param orderAmount 订单金额
 * @param buyerPersonalConsumption 买家个人消费
 * @param buyerTeamPerformance 买家团队业绩
 * @param discountRate 让利率（默认9%）
 * @returns 预计获得积分
 */
export function calculatePointsPreview(
  orderAmount: number,
  buyerPersonalConsumption: number,
  buyerTeamPerformance: number = 0,
  discountRate: number = 0.09
): number {
  const discountPool = toPrecision(orderAmount * discountRate)
  const dynamicScore = calculateDynamicScore(buyerPersonalConsumption, buyerTeamPerformance)
  const pointsRatio = calculatePointsRatio(dynamicScore)
  return toPrecision(discountPool * pointsRatio)
}

/**
 * 简化计算：分佣预览（用于分销员页面）
 */
export function calculateCommissionPreview(
  orderAmount: number,
  personalConsumption: number,
  teamPerformance: number,
  level: 1 | 2 = 1,
  discountRate: number = 0.09
): number {
  const discountPool = toPrecision(orderAmount * discountRate)
  const dynamicScore = calculateDynamicScore(personalConsumption, teamPerformance)
  
  if (level === 1) {
    const l1Ratio = calculateL1Ratio(dynamicScore)
    return toPrecision(discountPool * l1Ratio)
  } else {
    const l2Ratio = calculateL2Ratio(dynamicScore)
    return toPrecision(discountPool * l2Ratio)
  }
}

/**
 * 根据动态分数获取段位名称
 */
export function getRankNameByScore(dynamicScore: number): string {
  if (dynamicScore >= 50000) return '掌门'
  if (dynamicScore >= 15000) return '长老'
  if (dynamicScore >= 5000) return '核心弟子'
  if (dynamicScore >= 2000) return '内门弟子'
  if (dynamicScore >= 500) return '外门弟子'
  return '江湖散修'
}

/**
 * 计算分佣详情（用于订单详情页展示）
 */
export function calculateOrderCommissionDetails(
  orderAmount: number,
  buyerPersonalConsumption: number,
  buyerTeamPerformance: number,
  referrer1PersonalConsumption: number,
  referrer1TeamPerformance: number,
  referrer2PersonalConsumption: number = 0,
  referrer2TeamPerformance: number = 0
): string {
  const result = calculateCommissionV3({
    orderAmount,
    discountRate: 0.09,
    buyerPersonalConsumption,
    buyerTeamPerformance,
    referrer1PersonalConsumption,
    referrer1TeamPerformance,
    referrer2PersonalConsumption,
    referrer2TeamPerformance,
  })
  
  return `
📊 分佣计算详情（团队业绩版）

订单金额：¥${orderAmount.toFixed(2)}
让利池：¥${result.discountPool.toFixed(2)}（9%）

👤 买家信息：
  个人消费：¥${buyerPersonalConsumption.toFixed(2)}
  团队业绩：¥${buyerTeamPerformance.toFixed(2)}
  动态分数：${result.buyerDynamicScore.toFixed(0)}
  段位：${result.buyerRank}
  积分返还：${result.buyerPoints.toFixed(2)}积分（${result.pointsRatio * 100}%.toFixed(1)}%）

💰 一级推荐人：
  个人消费：¥${referrer1PersonalConsumption.toFixed(2)}
  团队业绩：¥${referrer1TeamPerformance.toFixed(2)}
  动态分数：${result.referrer1DynamicScore.toFixed(0)}
  段位：${result.referrer1Rank}
  佣金：${result.level1Commission.toFixed(2)}元（${result.l1Ratio * 100}%.toFixed(1)}%）

💰 二级推荐人：
  个人消费：¥${referrer2PersonalConsumption.toFixed(2)}
  团队业绩：¥${referrer2TeamPerformance.toFixed(2)}
  动态分数：${result.referrer2DynamicScore.toFixed(0)}
  段位：${result.referrer2Rank}
  佣金：${result.level2Commission.toFixed(2)}元（${result.l2Ratio * 100}%.toFixed(1)}%）

🏢 平台收入：¥${result.platformIncome.toFixed(2)}（50%）
  `.trim()
}

// ============ 工具函数 ============

/**
 * 获取用户段位信息（用于UI展示）
 * 
 * @param totalConsumption 累计消费（个人+团队）
 * @returns 段位信息
 */
export function getRankInfo(totalConsumption: number): {
  rankName: string
  icon: string
  color: string
  nextRank?: string
  nextRankMin?: number
  progress: number
} {
  const rankNames = ['江湖散修', '外门弟子', '内门弟子', '核心弟子', '长老', '掌门']
  const rankIcons = ['🍃', '🌟', '📚', '⚔️', '🏯', '👑']
  const rankColors = ['#90EE90', '#50C878', '#4A90D9', '#CD7F32', '#C0C0C0', '#FFD700']
  const rankThresholds = [0, 500, 2000, 5000, 15000, 50000]
  
  let currentIndex = 0
  for (let i = rankThresholds.length - 1; i >= 0; i--) {
    if (totalConsumption >= rankThresholds[i]) {
      currentIndex = i
      break
    }
  }
  
  const currentMin = rankThresholds[currentIndex]
  const nextMin = currentIndex > 0 ? rankThresholds[currentIndex - 1] : rankThresholds[currentIndex]
  const progress = nextMin > currentMin 
    ? Math.min(100, ((totalConsumption - currentMin) / (nextMin - currentMin)) * 100)
    : 100
  
  return {
    rankName: rankNames[currentIndex],
    icon: rankIcons[currentIndex],
    color: rankColors[currentIndex],
    nextRank: currentIndex > 0 ? rankNames[currentIndex - 1] : undefined,
    nextRankMin: currentIndex > 0 ? nextMin : undefined,
    progress,
  }
}

function toPrecision(n: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.round(n * 10000) / 10000
}

export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

export function formatPoints(points: number): string {
  return `${Math.round(points)}积分`
}

/**
 * 调试函数：打印分佣计算详情
 */
export function debugCommissionCalculation(input: CommissionInput): void {
  const result = calculateCommissionV3(input)
  
  console.log('🔍 分佣计算详情（团队业绩版）')
  console.log('订单金额：', result.orderAmount)
  console.log('让利池：', result.discountPool)
  console.log('平台收入：', result.platformIncome, `(${result.platformRatio * 100}%)`)
  console.log('买家积分：', result.buyerPoints, `(${result.pointsRatio * 100}%)`)
  console.log('L1佣金：', result.level1Commission, `(${result.l1Ratio * 100}%)`)
  console.log('L2佣金：', result.level2Commission, `(${result.l2Ratio * 100}%)`)
  console.log('买家段位：', result.buyerRank, `(分数: ${result.buyerDynamicScore.toFixed(0)})`)
  console.log('L1段位：', result.referrer1Rank, `(分数: ${result.referrer1DynamicScore.toFixed(0)})`)
  console.log('L2段位：', result.referrer2Rank, `(分数: ${result.referrer2DynamicScore.toFixed(0)})`)
  console.log('合计分配：', result.buyerPoints + result.level1Commission + result.level2Commission + result.platformIncome)
}
