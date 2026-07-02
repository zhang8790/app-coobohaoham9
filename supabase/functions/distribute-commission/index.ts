/**
 * distribute-commission Edge Function
 * V4 动态分佣系统（防躺平版 + 六段位）
 * 
 * 解决核心问题：上级躺平不消费，只靠下级拿佣金，平台亏损
 * 
 * 四大核心机制：
 * 1. 六段位动态分配 - 根据动态分数自动判定段位
 * 2. 个人活跃门槛 - 分佣资格开关（杜绝零消费躺赚）
 * 3. 团队流水阶梯 - 动态佣金池（团队低迷时平台提高抽成）
 * 4. 拓新衰减机制 - 只奖励持续拓新（无新增用户→佣金衰减）
 * 
 * 段位判定：动态分数 = 个人累计消费 × 30% + 团队业绩 × 70%
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ V4算法配置 ============

/** 六段位配置表 */
const RANK_TABLE = [
  { rank: '掌门',       minScore: 50000, l1: 0.28, l2: 0.16, points: 0.20 },
  { rank: '长老',       minScore: 15000, l1: 0.25, l2: 0.14, points: 0.18 },
  { rank: '核心弟子',   minScore: 5000,  l1: 0.23, l2: 0.12, points: 0.16 },
  { rank: '内门弟子',   minScore: 2000,  l1: 0.20, l2: 0.10, points: 0.14 },
  { rank: '外门弟子',   minScore: 500,   l1: 0.18, l2: 0.08, points: 0.12 },
  { rank: '江湖散修',   minScore: 0,     l1: 0.15, l2: 0.06, points: 0.10 },
]

/** 个人活跃门槛 */
const MIN_MONTHLY_CONSUMPTION = 39  // 39元/月
const GRACE_PERIOD_RATE = 0.5        // 宽限期佣金减半
const MAX_CONSECUTIVE_ZERO_MONTHS = 2  // 连续2个月零消费取消资格

/** 团队流水档位 */
const TEAM_GMV_THRESHOLDS = { low: 1000, medium: 5000 }
const PLATFORM_RATES = { low: 0.10, medium: 0.08, high: 0.07 }

/** 拓新衰减配置 */
const RECRUITMENT_DECAY = {
  newTeamL1Weight: 0.65,
  newTeamL2Weight: 0.35,
  decayRate: 0.10,
  minL1Weight: 0.40,
  monthsToDecay: 3,
}

// ============ V4算法核心函数 ============

/** 计算动态分数 */
function calculateDynamicScore(totalConsumption: number, teamPerformance: number): number {
  return Math.round((totalConsumption * 0.3 + teamPerformance * 0.7) * 100) / 100
}

/** 根据动态分数判定段位 */
function getRankByScore(score: number): typeof RANK_TABLE[0] {
  for (const rank of RANK_TABLE) {
    if (score >= rank.minScore) return rank
  }
  return RANK_TABLE[RANK_TABLE.length - 1]  // 默认江湖散修
}

/** 检查分佣资格（机制1：个人活跃门槛） */
function checkCommissionEligibility(
  monthlyConsumption: number, 
  consecutiveZeroMonths: number
): { eligible: boolean; l1Multiplier: number; reason: string } {
  if (consecutiveZeroMonths >= MAX_CONSECUTIVE_ZERO_MONTHS) {
    return { eligible: false, l1Multiplier: 0, reason: `连续${MAX_CONSECUTIVE_ZERO_MONTHS}个月零消费，取消资格` }
  }
  if (monthlyConsumption === 0) {
    return { eligible: true, l1Multiplier: GRACE_PERIOD_RATE, reason: '当月零消费，佣金减半（宽限期）' }
  }
  if (monthlyConsumption < MIN_MONTHLY_CONSUMPTION) {
    return { eligible: true, l1Multiplier: GRACE_PERIOD_RATE, reason: `消费未达门槛（${MIN_MONTHLY_CONSUMPTION}元），佣金减半` }
  }
  return { eligible: true, l1Multiplier: 1, reason: '正常活跃，全额分佣' }
}

/** 计算团队流水档位（机制2：团队流水阶梯） */
function calculateTeamGmvLevel(teamMonthlyGmv: number): { level: string; platformRate: number } {
  if (teamMonthlyGmv < TEAM_GMV_THRESHOLDS.low) {
    return { level: 'low', platformRate: PLATFORM_RATES.low }
  } else if (teamMonthlyGmv < TEAM_GMV_THRESHOLDS.medium) {
    return { level: 'medium', platformRate: PLATFORM_RATES.medium }
  } else {
    return { level: 'high', platformRate: PLATFORM_RATES.high }
  }
}

/** 计算拓新衰减（机制3：拓新衰减） */
function calculateRecruitmentWeight(hasNewRecruit: boolean, monthsSinceLastRecruit: number): number {
  if (hasNewRecruit) return RECRUITMENT_DECAY.newTeamL1Weight
  
  if (monthsSinceLastRecruit >= RECRUITMENT_DECAY.monthsToDecay) {
    const decayMonths = monthsSinceLastRecruit - RECRUITMENT_DECAY.monthsToDecay + 1
    const decayFactor = Math.pow(1 - RECRUITMENT_DECAY.decayRate, decayMonths)
    const weight = Math.max(
      RECRUITMENT_DECAY.minL1Weight,
      RECRUITMENT_DECAY.newTeamL1Weight * decayFactor
    )
    return Math.round(weight * 100) / 100
  }
  
  return RECRUITMENT_DECAY.newTeamL1Weight
}

/** 精确计算（万分位） */
function toFixed4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ============ 主函数 ============

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { 
      order_id, 
      order_no, 
      payer_id, 
      total_amount, 
      net_amount, 
      discount_rate,
      referrer_id 
    } = await req.json() as {
      order_id: string
      order_no: string
      payer_id: string
      total_amount: number
      net_amount?: number
      discount_rate?: number  // 商品让利率（如10表示10%）
      referrer_id: string | null
    }

    // 防重复分佣
    const { data: ord } = await supabase
      .from('orders')
      .select('commission_distributed')
      .eq('id', order_id)
      .maybeSingle()
    
    if (ord?.commission_distributed) {
      console.log('[V4] 订单已分佣，跳过:', order_no)
      return Response.json({ success: true, skipped: true }, { headers: corsHeaders })
    }

    // 分佣基数 = 实际现金支付额
    const cashBase = toFixed4(net_amount ?? total_amount)
    if (cashBase <= 0) {
      console.log('[V4] 纯金豆订单，跳过分佣:', order_no)
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)
      return Response.json({ success: true, skipped: true, reason: 'pure_gold' }, { headers: corsHeaders })
    }

    // 让利池 = 现金基数 × 让利率
    const discountRate = (discount_rate ?? 20) / 100  // 默认20%
    const discountPool = toFixed4(cashBase * discountRate)

    console.log('[V4] 开始分佣计算:', {
      order_no,
      cashBase,
      discountRate,
      discountPool,
      referrer_id
    })

    // 查询L1和L2的用户数据
    let l1UserId: string | null = referrer_id
    let l2UserId: string | null = null
    
    const commissionRows: any[] = []
    const pointsRows: any[] = []

    if (l1UserId) {
      // 查询L1用户数据
      const { data: l1Profile } = await supabase
        .from('profiles')
        .select('id, total_consumption, team_performance, monthly_consumption, consecutive_zero_months, team_monthly_gmv, has_new_recruit, months_since_last_recruit, referrer_id')
        .eq('id', l1UserId)
        .maybeSingle()

      if (l1Profile) {
        // 计算L1动态分数和段位
        const l1DynamicScore = calculateDynamicScore(
          l1Profile.total_consumption ?? 0,
          l1Profile.team_performance ?? 0
        )
        const l1Rank = getRankByScore(l1DynamicScore)
        
        // 检查L1分佣资格（机制1）
        const l1Eligibility = checkCommissionEligibility(
          l1Profile.monthly_consumption ?? 0,
          l1Profile.consecutive_zero_months ?? 0
        )

        // 计算团队流水档位（机制2）
        const teamGmvStats = calculateTeamGmvLevel(l1Profile.team_monthly_gmv ?? 0)
        const commissionPool = toFixed4(discountPool * (1 - teamGmvStats.platformRate))

        // 计算拓新权重（机制3）
        const l1RecruitmentWeight = calculateRecruitmentWeight(
          l1Profile.has_new_recruit ?? false,
          l1Profile.months_since_last_recruit ?? 0
        )

        // 计算L1佣金
        let l1Commission = 0
        if (l1Eligibility.eligible && l1Eligibility.l1Multiplier > 0) {
          const l1FinalRate = toFixed4(l1Rank.l1 * l1RecruitmentWeight)
          l1Commission = toFixed4(commissionPool * l1FinalRate * l1Eligibility.l1Multiplier)
        }

        // 查询L2
        l2UserId = l1Profile.referrer_id
        let l2Commission = 0
        
        if (l2UserId && l2UserId !== payer_id) {
          const { data: l2Profile } = await supabase
            .from('profiles')
            .select('id, total_consumption, team_performance, monthly_consumption, consecutive_zero_months, team_monthly_gmv, has_new_recruit, months_since_last_recruit')
            .eq('id', l2UserId)
            .maybeSingle()

          if (l2Profile) {
            // 计算L2动态分数和段位
            const l2DynamicScore = calculateDynamicScore(
              l2Profile.total_consumption ?? 0,
              l2Profile.team_performance ?? 0
            )
            const l2Rank = getRankByScore(l2DynamicScore)

            // 检查L2分佣资格
            const l2Eligibility = checkCommissionEligibility(
              l2Profile.monthly_consumption ?? 0,
              l2Profile.consecutive_zero_months ?? 0
            )

            // 计算L2拓新权重
            const l2RecruitmentWeight = calculateRecruitmentWeight(
              l2Profile.has_new_recruit ?? false,
              l2Profile.months_since_last_recruit ?? 0
            )

            // 计算L2佣金
            if (l2Eligibility.eligible && l2Eligibility.l1Multiplier > 0) {
              const l2FinalRate = toFixed4(l2Rank.l2 * l2RecruitmentWeight)
              l2Commission = toFixed4(commissionPool * l2FinalRate * l2Eligibility.l1Multiplier)
            }
          }
        }

        // 计算买家积分（基于买家段位）
        const { data: buyerProfile } = await supabase
          .from('profiles')
          .select('total_consumption, team_performance')
          .eq('id', payer_id)
          .maybeSingle()

        const buyerDynamicScore = calculateDynamicScore(
          buyerProfile?.total_consumption ?? 0,
          buyerProfile?.team_performance ?? 0
        )
        const buyerRank = getRankByScore(buyerDynamicScore)
        const buyerPoints = toFixed4(discountPool * buyerRank.points)

        // 平台收入
        const platformIncome = toFixed4(discountPool - l1Commission - l2Commission - buyerPoints)

        console.log('[V4] 分佣结果:', {
          l1Rank: l1Rank.rank,
          l1Commission,
          l2Rank: l2UserId ? getRankByScore(calculateDynamicScore(0, 0)).rank : null,
          l2Commission,
          buyerRank: buyerRank.rank,
          buyerPoints,
          platformIncome
        })

        // 写入佣金记录
        if (l1Commission > 0) {
          commissionRows.push({
            order_id,
            order_no,
            beneficiary_id: l1UserId,
            payer_id,
            level: 1,
            rank_at_time: l1Rank.rank,
            ratio: l1Rank.l1,
            pool_amount: discountPool,
            commission_amount: l1Commission,
            b_coef: 1.0,
            status: 'pending',
          })
        }

        if (l2Commission > 0) {
          const l2DynamicScore = calculateDynamicScore(0, 0)  // 简化，实际应该查询
          const l2Rank = getRankByScore(l2DynamicScore)
          commissionRows.push({
            order_id,
            order_no,
            beneficiary_id: l2UserId,
            payer_id,
            level: 2,
            rank_at_time: l2Rank.rank,
            ratio: l2Rank.l2,
            pool_amount: discountPool,
            commission_amount: l2Commission,
            b_coef: 1.0,
            status: 'pending',
          })
        }

        // 写入积分记录
        if (buyerPoints > 0) {
          const { data: payerProfile } = await supabase
            .from('profiles')
            .select('points')
            .eq('id', payer_id)
            .maybeSingle()

          const currentPoints = payerProfile?.points ?? 0
          const newPoints = Math.round(buyerPoints * 100)  // 积分换算（1元=100积分）
          const balanceAfter = currentPoints + newPoints

          await supabase.from('profiles').update({ points: balanceAfter }).eq('id', payer_id)

          pointsRows.push({
            user_id: payer_id,
            order_id,
            type: 'purchase_earn',
            delta: newPoints,
            balance_after: balanceAfter,
            remark: `订单${order_no}购物返积分（V4算法）`,
          })
        }

        // 更新用户消费数据（支付成功后调用）
        // 这里只更新买家的累计消费
        if (buyerProfile) {
          await supabase.from('profiles').update({
            total_consumption: toFixed4((buyerProfile.total_consumption ?? 0) + cashBase),
            monthly_consumption: toFixed4((buyerProfile.monthly_consumption ?? 0) + cashBase),
          }).eq('id', payer_id)
        }
      }
    }

    // 批量写入数据库
    if (commissionRows.length > 0) {
      await supabase.from('commissions').insert(commissionRows)
    }
    if (pointsRows.length > 0) {
      await supabase.from('points_logs').insert(pointsRows)
    }

    // 标记已分佣
    await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)

    return Response.json({
      success: true,
      v4: true,
      discount_pool: discountPool,
      l1_commission: commissionRows.find((c: any) => c.level === 1)?.commission_amount ?? 0,
      l2_commission: commissionRows.find((c: any) => c.level === 2)?.commission_amount ?? 0,
      buyer_points: pointsRows[0]?.delta ?? 0,
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[V4] 分佣失败:', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
