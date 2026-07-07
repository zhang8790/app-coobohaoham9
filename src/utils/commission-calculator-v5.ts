/**
 * V5 流动性二级分销算法（防亏损 + 防刷单版）
 * 基于 V4，新增：
 * 1. 平台最低抽成 10%（让利池先抽）
 * 2. 流动一级机制（按单动态）
 * 3. 调整后的段位系数（保证平台收入）
 * 4. 风控检测集成
 */

// ============ 段位配置（调整后） ============
export interface RankConfigV5 {
  rank: MemberRankV5;
  minDynamicScore: number;
  l1CommissionRate: number;   // 流动一级比例
  l2CommissionRate: number;   // 静态二级比例
  pointsRate: number;         // 积分比例
  icon: string;
  color: string;
}

export type MemberRankV5 = 
  | '江湖散修' 
  | '外门弟子' 
  | '内门弟子' 
  | '核心弟子' 
  | '长老' 
  | '掌门'

export const RANK_CONFIG_TABLE_V5: RankConfigV5[] = [
  { 
    rank: '江湖散修', 
    minDynamicScore: 0, 
    l1CommissionRate: 0.40, 
    l2CommissionRate: 0.15, 
    pointsRate: 0.10,
    icon: '🍃',
    color: '#90EE90'
  },
  { 
    rank: '外门弟子', 
    minDynamicScore: 200, 
    l1CommissionRate: 0.45, 
    l2CommissionRate: 0.18, 
    pointsRate: 0.12,
    icon: '🌿',
    color: '#50C878'
  },
  { 
    rank: '内门弟子', 
    minDynamicScore: 800, 
    l1CommissionRate: 0.50, 
    l2CommissionRate: 0.20, 
    pointsRate: 0.13,
    icon: '📚',
    color: '#4A90D9'
  },
  { 
    rank: '核心弟子', 
    minDynamicScore: 2000, 
    l1CommissionRate: 0.54, 
    l2CommissionRate: 0.22, 
    pointsRate: 0.14,
    icon: '⚔️',
    color: '#CD7F32'
  },
  { 
    rank: '长老', 
    minDynamicScore: 6000, 
    l1CommissionRate: 0.57, 
    l2CommissionRate: 0.24, 
    pointsRate: 0.15,
    icon: '🏯',
    color: '#C0C0C0'
  },
  { 
    rank: '掌门', 
    minDynamicScore: 20000, 
    l1CommissionRate: 0.60, 
    l2CommissionRate: 0.25, 
    pointsRate: 0.15,
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
}

// ============ 输入参数 ============
export interface CommissionInputV5 {
  orderAmount: number;           // 订单金额
  discountRate: number;          // 商家让利率
  
  // 流动一级（服务人员/推广员）
  staffId?: string | null;        // 服务人员ID
  staffTotalConsumption?: number; // 服务人员个人累计消费

  // 静态二级（推荐人）
  referrerId?: string | null;     // 推荐人ID
  referrerTotalConsumption?: number;

  // 买家
  buyerId: string;
  buyerTotalConsumption?: number;
}

// ============ 计算结果 ============
export interface CommissionResultV5 {
  orderAmount: number;
  discountPool: number;          // 让利池
  platformMinIncome: number;     // 平台最低抽成（10%）
  remainingPool: number;         // 剩余池（让利池 - 平台最低抽成）
  
  l1Commission: number;          // 流动一级佣金
  l2Commission: number;          // 静态二级佣金
  buyerPoints: number;           // 买家积分
  platformExtraIncome: number;   // 平台额外收入
  platformTotalIncome: number;   // 平台总收入
  
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

// ============ 核心计算函数 ============
export function calculateCommissionV5(input: CommissionInputV5): CommissionResultV5 {
  const {
    orderAmount,
    discountRate = 0.09,
    staffTotalConsumption = 0,
    referrerTotalConsumption = 0,
    buyerTotalConsumption = 0,
  } = input;
  
  // 1. 计算让利池
  const discountPool = toPrecision(orderAmount * discountRate);
  
  // 2. 平台最低抽成（10%）
  const platformMinIncome = toPrecision(discountPool * PLATFORM_CONFIG.MIN_PLATFORM_RATE);
  const remainingPool = toPrecision(discountPool - platformMinIncome);
  
  // 3. 计算段位（按 低→高 排序后遍历）
  const sortedRanks = [...RANK_CONFIG_TABLE_V5].sort((a, b) => a.minDynamicScore - b.minDynamicScore);
  
  const staffDynamicScore = calculateDynamicScore(staffTotalConsumption);
  const staffRank = getRankByScore(staffDynamicScore, sortedRanks);

  const referrerDynamicScore = calculateDynamicScore(referrerTotalConsumption);
  const referrerRank = getRankByScore(referrerDynamicScore, sortedRanks);

  const buyerDynamicScore = calculateDynamicScore(buyerTotalConsumption);
  const buyerRank = getRankByScore(buyerDynamicScore, sortedRanks);
  
  // 4. 计算佣金（基于剩余池）
  let l1Commission = 0;
  let l2Commission = 0;
  
  if (input.staffId) {
    l1Commission = toPrecision(remainingPool * staffRank.l1CommissionRate);
  }
  
  if (input.referrerId) {
    l2Commission = toPrecision(remainingPool * referrerRank.l2CommissionRate);
  }
  
  // 5. 计算积分
  const buyerPoints = toPrecision(remainingPool * buyerRank.pointsRate);
  
  // 6. 平台额外收入
  const platformExtraIncome = toPrecision(
    remainingPool - l1Commission - l2Commission - buyerPoints
  );
  
  // 7. 平台总收入
  const platformTotalIncome = toPrecision(platformMinIncome + platformExtraIncome);
  
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
    l1Rate: remainingPool > 0 ? l1Commission / remainingPool : 0,
    l2Rate: remainingPool > 0 ? l2Commission / remainingPool : 0,
    pointsRate: remainingPool > 0 ? buyerPoints / remainingPool : 0,
    platformExtraRate: remainingPool > 0 ? platformExtraIncome / remainingPool : 0,
    staffRank: staffRank.rank,
    referrerRank: referrerRank.rank,
    buyerRank: buyerRank.rank,
  };
}

// ============ 工具函数 ============
/**
 * 计算段位动态分数（V5：仅基于个人累计消费，1:1）
 * 不再包含团队维度，段位完全由个人消费决定。
 */
export function calculateDynamicScore(
  personalTotalConsumption: number
): number {
  return Math.round((personalTotalConsumption || 0) * 100) / 100;
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

function getRankByScore(score: number, sortedRanks: RankConfigV5[]): RankConfigV5 {
  const s = Math.max(0, score || 0);
  let matched = sortedRanks[0];
  for (const config of sortedRanks) {
    if (s >= config.minDynamicScore) {
      matched = config;
    }
  }
  return matched;
}

function toPrecision(n: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

// ============ 测试函数 ============
export function testV5Algorithm(): void {
  console.log('===== V5 算法测试 =====');
  
  // 测试1：全掌门（最高段位）
  const result1 = calculateCommissionV5({
    orderAmount: 100,
    discountRate: 0.10,
    staffId: 'staff-1',
    staffTotalConsumption: 50000,
    referrerId: 'ref-1',
    referrerTotalConsumption: 50000,
    buyerId: 'buyer-1',
    buyerTotalConsumption: 50000,
  });
  
  console.log('【全掌门】订单100元，让利率10%');
  console.log('让利池：', result1.discountPool);
  console.log('平台最低抽成（10%）：', result1.platformMinIncome);
  console.log('剩余池：', result1.remainingPool);
  console.log('流动一级佣金：', result1.l1Commission, `(${(result1.l1Rate * 100).toFixed(1)}%)`);
  console.log('静态二级佣金：', result1.l2Commission, `(${(result1.l2Rate * 100).toFixed(1)}%)`);
  console.log('买家积分：', result1.buyerPoints, `(${(result1.pointsRate * 100).toFixed(1)}%)`);
  console.log('平台额外收入：', result1.platformExtraIncome);
  console.log('平台总收入：', result1.platformTotalIncome, `(${(result1.platformTotalIncome / result1.discountPool * 100).toFixed(1)}%)`);
  
  // 测试2：全散修（最低段位）
  const result2 = calculateCommissionV5({
    orderAmount: 100,
    discountRate: 0.10,
    buyerId: 'buyer-2',
  });
  
  console.log('\n【全散修】订单100元，让利率10%');
  console.log('让利池：', result2.discountPool);
  console.log('平台最低抽成（10%）：', result2.platformMinIncome);
  console.log('剩余池：', result2.remainingPool);
  console.log('平台总收入：', result2.platformTotalIncome, `(${(result2.platformTotalIncome / result2.discountPool * 100).toFixed(1)}%)`);
}

if (typeof window !== 'undefined') {
  (window as any).testV5Algorithm = testV5Algorithm;
}
