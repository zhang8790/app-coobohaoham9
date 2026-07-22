/**
 * 防刷单/作弊风控系统
 * 检测类型：
 * 1. 自己买自己的店（员工=买家）
 * 2. 闭环刷单（A→B→C→A）
 * 3. 高频小额订单
 * 4. 金豆套利（下单拿金豆→退款）
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
  | 'gold_bean_arbitrage'    // 金豆套利
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
 * 规则：若下单买家是该店铺的「在职员工」，则属于员工刷单 / 自买自卖。
 *   通过 store_staff 表主动核验买家与店铺的雇佣关系，而非信任调用方传入的 staffId，
 *   避免绕过。store_staff 结构：id, store_id, user_id, role, is_active。
 */
export async function checkSelfDealing(
  supabase: any,
  buyerId: string,
  storeId: string
): Promise<RiskCheckResult> {
  const { data: staffRow } = await supabase
    .from('store_staff')
    .select('id')
    .eq('user_id', buyerId)
    .eq('store_id', storeId)
    .eq('is_active', true)
    .maybeSingle()

  // 买家是该店铺在职员工 → 自买自卖
  if (staffRow) {
    return {
      passed: false,
      riskType: 'self_dealing',
      riskLevel: 'high',
      description: '买家为该店铺在职员工，疑似自买自卖（员工刷单）',
      shouldFreeze: true,
      freezeReason: '自买自卖检测：买家为店铺在职员工',
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
 * 检测5：金豆套利检测
 * 规则：下单后短时间内退款，且已使用金豆
 */
export async function checkGoldBeanArbitrage(
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
        riskType: 'gold_bean_arbitrage',
        riskLevel: 'medium',
        description: '订单退款且已获赠金豆，疑似金豆套利',
        shouldFreeze: false,  // 不冻结，但需追回金豆
        freezeReason: '金豆套利检测：退款订单获赠金豆',
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
  
  // 检测1：自买自卖（买家是否为该店铺在职员工）
  const selfDealingResult = await checkSelfDealing(
    supabase,
    orderData.userId,
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
    
    // 从用户已结算佣金中扣除（改用读-改-写，避免依赖未定义的 decrement RPC）
    const { data: prof } = await supabase
      .from('profiles')
      .select('settled_commission')
      .eq('id', commission.user_id)
      .maybeSingle();
    const cur = Number((prof as any)?.settled_commission || 0);
    const next = Math.max(0, cur - Number(commission.amount || 0));
    await supabase
      .from('profiles')
      .update({ settled_commission: next })
      .eq('id', commission.user_id);
  }
}

/**
 * 追回金豆（退款时）
 */
export async function recoverGoldBeans(
  supabase: any,
  orderId: string
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('buyer_points, user_id')
    .eq('id', orderId)
    .single();
  
  if (!order || !order.buyer_points || order.buyer_points <= 0) return;
  
  // 扣回买家获赠金豆（buyer_points 已并入 tb_balance 统一钱包）
  const { data: prof } = await supabase
    .from('profiles')
    .select('tb_balance')
    .eq('id', order.user_id)
    .maybeSingle();
  const cur = Number((prof as any)?.tb_balance || 0);
  const next = Math.max(0, cur - Number(order.buyer_points || 0));
  await supabase
    .from('profiles')
    .update({ tb_balance: next })
    .eq('id', order.user_id);
}
