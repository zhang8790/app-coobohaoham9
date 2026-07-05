/**
 * 防刷单/作弊风控系统
 * 检测类型：
 * 1. 自己买自己的店（员工=买家）
 * 2. 闭环刷单（A→B→C→A）
 * 3. 高频小额订单
 * 4. 积分套利（下单拿积分→退款）
 */

// ============ 风控配置 ============
export const RISK_CONFIG = {
  // 同一买家每日订单上限
  MAX_ORDERS_PER_DAY: 10,
  
  // 最低计佣订单金额（元）
  MIN_ORDER_FOR_COMMISSION: 5,
  
  // 退款追回佣金天数
  REFUND_RECOVERY_DAYS: 60,
  
  // 闭环检测深度（推荐关系链检测深度）
  LOOP_DETECTION_DEPTH: 5,
  
  // 高风险订单自动冻结佣金
  AUTO_FREEZE_RISK_LEVELS: ['high'],
};

// ============ 风险类型 ============
export type RiskType = 
  | 'self_dealing'        // 自己买自己的店
  | 'loop_referral'       // 闭环推荐
  | 'high_frequency'      // 高频订单
  | 'points_arbitrage'    // 积分套利
  | 'fake_order'          // 虚假订单
  | 'multi_account';      // 多账号

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskCheckResult {
  passed: boolean;           // 是否通过风控
  riskType?: RiskType;       // 风险类型
  riskLevel?: RiskLevel;     // 风险等级
  description?: string;      // 风险描述
  shouldFreeze: boolean;     // 是否冻结佣金
  freezeReason?: string;     // 冻结原因
}

// ============ 风控检测函数 ============

/**
 * 检测1：自己买自己的店（员工=买家）
 * 规则：如果订单的 buyer_id = staff_id，则是自买自卖
 */
export async function checkSelfDealing(
  buyerId: string,
  staffId: string | null,
  storeId: string
): Promise<RiskCheckResult> {
  if (!staffId) {
    return { passed: true, shouldFreeze: false };
  }
  
  // 检查 staff 是否是该店铺的员工
  // TODO: 从 store_staff 表查询
  
  if (buyerId === staffId) {
    return {
      passed: false,
      riskType: 'self_dealing',
      riskLevel: 'high',
      description: '买家与服务人员为同一人，疑似自买自卖',
      shouldFreeze: true,
      freezeReason: '自买自卖检测：买家与服务人员ID相同',
    };
  }
  
  return { passed: true, shouldFreeze: false };
}

/**
 * 检测2：闭环推荐检测（A→B→C→A）
 * 规则：检查推荐关系链是否形成闭环
 */
export async function checkReferralLoop(
  supabase: any,
  userId: string,
  referrerId: string,
  depth: number = 0
): Promise<RiskCheckResult> {
  if (depth > RISK_CONFIG.LOOP_DETECTION_DEPTH) {
    return {
      passed: false,
      riskType: 'loop_referral',
      riskLevel: 'high',
      description: `推荐关系链深度超过 ${RISK_CONFIG.LOOP_DETECTION_DEPTH}，疑似闭环刷单`,
      shouldFreeze: true,
      freezeReason: '推荐关系链闭环检测：超过最大深度',
    };
  }
  
  // 获取 referrer 的推荐人
  const { data: referrer } = await supabase
    .from('profiles')
    .select('referrer_id')
    .eq('id', referrerId)
    .single();
  
  if (!referrer || !referrer.referrer_id) {
    return { passed: true, shouldFreeze: false };
  }
  
  // 发现闭环：referrer 的推荐人链中包含了 userId
  if (referrer.referrer_id === userId) {
    return {
      passed: false,
      riskType: 'loop_referral',
      riskLevel: 'high',
      description: '推荐关系链形成闭环（A→...→A），疑似刷单',
      shouldFreeze: true,
      freezeReason: '推荐关系链闭环检测：发现闭环',
    };
  }
  
  // 递归检测
  return checkReferralLoop(supabase, userId, referrer.referrer_id, depth + 1);
}

/**
 * 检测3：高频订单检测
 * 规则：同一买家每日订单超过上限
 */
export async function checkHighFrequency(
  supabase: any,
  buyerId: string,
  orderDate: string = new Date().toISOString().split('T')[0]
): Promise<RiskCheckResult> {
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('user_id', buyerId)
    .eq('created_at::date', orderDate);
  
  if (count && count >= RISK_CONFIG.MAX_ORDERS_PER_DAY) {
    return {
      passed: false,
      riskType: 'high_frequency',
      riskLevel: 'medium',
      description: `同一买家每日订单超过 ${RISK_CONFIG.MAX_ORDERS_PER_DAY} 笔，疑似刷量`,
      shouldFreeze: false,  // 不冻结，但标记风险
      freezeReason: '高频订单检测：超过每日上限',
    };
  }
  
  return { passed: true, shouldFreeze: false };
}

/**
 * 检测4：最低订单金额检测
 */
export function checkMinOrderAmount(orderAmount: number): RiskCheckResult {
  if (orderAmount < RISK_CONFIG.MIN_ORDER_FOR_COMMISSION) {
    return {
      passed: false,
      riskType: 'fake_order',
      riskLevel: 'low',
      description: `订单金额 ${orderAmount} 元低于最低计佣金额 ${RISK_CONFIG.MIN_ORDER_FOR_COMMISSION} 元，不计佣金`,
      shouldFreeze: false,
    };
  }
  
  return { passed: true, shouldFreeze: false };
}

/**
 * 检测5：积分套利检测
 * 规则：下单后短时间内退款，且已使用积分
 */
export async function checkPointsArbitrage(
  supabase: any,
  orderId: string,
  userId: string
): Promise<RiskCheckResult> {
  // 获取订单信息
  const { data: order } = await supabase
    .from('orders')
    .select('buyer_points, status, created_at')
    .eq('id', orderId)
    .single();
  
  if (!order) {
    return { passed: true, shouldFreeze: false };
  }
  
  // 检查是否已退款
  if (order.status === 'refunded' && order.buyer_points > 0) {
    // 检查退款时间是否在60天内
    const orderTime = new Date(order.created_at).getTime();
    const now = Date.now();
    const daysDiff = (now - orderTime) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= RISK_CONFIG.REFUND_RECOVERY_DAYS) {
      return {
        passed: false,
        riskType: 'points_arbitrage',
        riskLevel: 'medium',
        description: '订单退款且已获得积分，疑似积分套利',
        shouldFreeze: false,  // 不冻结，但需追回积分
        freezeReason: '积分套利检测：退款订单获得积分',
      };
    }
  }
  
  return { passed: true, shouldFreeze: false };
}

// ============ 综合风控检测 ============

/**
 * 订单创建时的综合风控检测
 */
export async function runOrderRiskCheck(
  supabase: any,
  orderData: {
    userId: string;
    staffId: string | null;
    storeId: string;
    referrerId: string | null;
    orderAmount: number;
    orderId: string;
  }
): Promise<{
  passed: boolean;
  risks: RiskCheckResult[];
  shouldFreeze: boolean;
}> {
  const risks: RiskCheckResult[] = [];
  
  // 检测1：自买自卖
  const selfDealingResult = await checkSelfDealing(
    orderData.userId,
    orderData.staffId,
    orderData.storeId
  );
  if (!selfDealingResult.passed) {
    risks.push(selfDealingResult);
  }
  
  // 检测2：闭环推荐
  if (orderData.referrerId) {
    const loopResult = await checkReferralLoop(
      supabase,
      orderData.userId,
      orderData.referrerId
    );
    if (!loopResult.passed) {
      risks.push(loopResult);
    }
  }
  
  // 检测3：高频订单
  const highFreqResult = await checkHighFrequency(
    supabase,
    orderData.userId
  );
  if (!highFreqResult.passed) {
    risks.push(highFreqResult);
  }
  
  // 检测4：最低订单金额
  const minAmountResult = checkMinOrderAmount(orderData.orderAmount);
  if (!minAmountResult.passed) {
    risks.push(minAmountResult);
  }
  
  // 判断是否需要冻结
  const shouldFreeze = risks.some(r => 
    RISK_CONFIG.AUTO_FREEZE_RISK_LEVELS.includes(r.riskLevel!) && r.shouldFreeze
  );
  
  // 记录风险日志
  if (risks.length > 0) {
    await logRisk(supabase, orderData.orderId, risks);
  }
  
  return {
    passed: risks.length === 0,
    risks,
    shouldFreeze,
  };
}

// ============ 工具函数 ============

/**
 * 记录风险日志
 */
async function logRisk(
  supabase: any,
  orderId: string,
  risks: RiskCheckResult[]
) {
  for (const risk of risks) {
    await supabase
      .from('order_risk_logs')
      .insert({
        order_id: orderId,
        risk_type: risk.riskType,
        risk_level: risk.riskLevel,
        description: risk.description,
      });
  }
}

/**
 * 追回佣金（退款时）
 */
export async function recoverCommission(
  supabase: any,
  orderId: string
): Promise<void> {
  // 获取该订单的佣金记录
  const { data: commissions } = await supabase
    .from('commissions')
    .select('*')
    .eq('order_id', orderId)
    .eq('status', 'settled');
  
  if (!commissions) return;
  
  // 追回已发放的佣金
  for (const commission of commissions) {
    await supabase
      .from('commissions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: '订单退款，追回佣金',
      })
      .eq('id', commission.id);
    
    // 从用户已结算佣金中扣除
    await supabase
      .from('profiles')
      .update({
        settled_commission: supabase.rpc('decrement', { amount: commission.amount }),
      })
      .eq('id', commission.user_id);
  }
}

/**
 * 追回积分（退款时）
 */
export async function recoverPoints(
  supabase: any,
  orderId: string
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('buyer_points, user_id')
    .eq('id', orderId)
    .single();
  
  if (!order || !order.buyer_points || order.buyer_points <= 0) return;
  
  // 扣除积分
  await supabase
    .from('profiles')
    .update({
      points: supabase.rpc('decrement', { amount: order.buyer_points }),
    })
    .eq('id', order.user_id);
}
