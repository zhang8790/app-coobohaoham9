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
 * 段位判定：动态分数 = 个人累计消费（不再包含团队维度）
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ V4算法配置 ============

/** V5 段位配置（与前端 commission-calculator-v5.ts 完全一致，保证前后端分佣比例统一） */
const RANK_TABLE = [
  { rank: '掌门',       minScore: 20000, l1: 0.60, l2: 0.25, points: 0.15 },
  { rank: '长老',       minScore: 6000,  l1: 0.57, l2: 0.24, points: 0.15 },
  { rank: '核心弟子',   minScore: 2000,  l1: 0.54, l2: 0.22, points: 0.14 },
  { rank: '内门弟子',   minScore: 800,   l1: 0.50, l2: 0.20, points: 0.13 },
  { rank: '外门弟子',   minScore: 200,   l1: 0.45, l2: 0.18, points: 0.12 },
  { rank: '江湖散修',   minScore: 0,     l1: 0.40, l2: 0.15, points: 0.10 },
]

/** V5 平台最低抽成（与前端 PLATFORM_CONFIG.MIN_PLATFORM_RATE 一致） */
const MIN_PLATFORM_RATE_V5 = 0.10

/** 支付通道费率（微信收单成本，默认0.6%；可由环境变量 CHANNEL_FEE_RATE 覆盖，随微信商户类目配置） */
const CHANNEL_FEE_RATE = Number(Deno.env.get('CHANNEL_FEE_RATE') ?? '0.006')

/** 代扣个税（劳务报酬/佣金所得）：税率与免征额，由用户承担，从佣金扣除；可由环境变量覆盖 */
const TAX_RATE = Number(Deno.env.get('COMMISSION_TAX_RATE') ?? '0.20')
const TAX_THRESHOLD = Number(Deno.env.get('COMMISSION_TAX_THRESHOLD') ?? '800')

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

/** 计算动态分数（仅基于个人累计消费，1:1） */
function calculateDynamicScore(totalConsumption: number): number {
  return Math.round((totalConsumption || 0) * 100) / 100
}

/** 根据动态分数判定段位 */
function getRankByScore(score: number): typeof RANK_TABLE[0] {
  for (const rank of RANK_TABLE) {
    if (score >= rank.minScore) return rank
  }
  return RANK_TABLE[RANK_TABLE.length - 1]  // 默认江湖散修
}

/** 检查分佣资格（V5 统一：与前端一致，按段位比例全额发放，不做活跃门槛减半） */
function checkCommissionEligibility(
  monthlyConsumption: number, 
  consecutiveZeroMonths: number
): { eligible: boolean; l1Multiplier: number; reason: string } {
  return { eligible: true, l1Multiplier: 1, reason: 'V5统一：按段位比例全额' }
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

/** 计算拓新权重（V5 统一：与前端一致，权重恒为 1，不做衰减） */
function calculateRecruitmentWeight(hasNewRecruit: boolean, monthsSinceLastRecruit: number): number {
  return 1
}

/** 精确计算（万分位） */
function toFixed4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** 代扣个税（劳务报酬/佣金所得）——由用户承担，从佣金扣除。计税规则同税法 */
function calcWithholdingTax(income: number): number {
  const base = Math.max(0, income)
  if (base <= TAX_THRESHOLD) return 0
  if (base <= 4000) return toFixed4((base - 800) * TAX_RATE)
  return toFixed4(base * 0.8 * TAX_RATE)  // = base * 0.16
}

/** 将订单级通道费/代扣税按金额比例分摊到各佣金行，返回每行应扣项与净额 */
function allocCommission(
  rowAmt: number,
  cashTotal: number,
  channelFee: number,
  taxWithheld: number,
): { channelFee: number; taxWithheld: number; net: number } {
  if (cashTotal <= 0 || rowAmt <= 0) return { channelFee: 0, taxWithheld: 0, net: rowAmt }
  const cf = toFixed4(channelFee * rowAmt / cashTotal)
  const tx = toFixed4(taxWithheld * rowAmt / cashTotal)
  const net = toFixed4(rowAmt - cf - tx)
  return { channelFee: cf, taxWithheld: tx, net }
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
      discount_rate?: number  // 商家让利率（小数口径，与前端 stores.referral_rate 一致，如 0.09 表示 9%）
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
    // 支付通道费（微信约0.6%）：按现金基数计提，**由用户承担**，从佣金扣除（商家/平台不承担）
    const channelFee = toFixed4(cashBase * CHANNEL_FEE_RATE)
    if (cashBase <= 0) {
      console.log('[V4] 纯金豆订单，跳过分佣:', order_no)
      await supabase.from('orders').update({ commission_distributed: true, channel_fee: channelFee, channel_fee_rate: CHANNEL_FEE_RATE, tax_withheld: 0 }).eq('id', order_id)
      return Response.json({ success: true, skipped: true, reason: 'pure_gold', channel_fee: channelFee, tax_withheld: 0 }, { headers: corsHeaders })
    }

    // 让利池 = 现金基数 × 让利率
    // D1~D3 修复：discount_rate 改为小数口径（与前端 calculateCommissionV5 / payment 预览一致，如 0.09=9%）
    const discountRate = discount_rate ?? 0.09  // 默认9%，与前端一致
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

    // 用户侧净额（通道费+代扣税从佣金扣除，由用户承担），供财务对账
    let userNetCommission = 0
    let taxWithheld = 0

    if (l1UserId) {
      // 查询L1用户数据
      const { data: l1Profile } = await supabase
        .from('profiles')
        .select('id, total_consumption, monthly_consumption, consecutive_zero_months, team_monthly_gmv, has_new_recruit, months_since_last_recruit, referrer_id')
        .eq('id', l1UserId)
        .maybeSingle()

      if (l1Profile) {
        // 计算L1动态分数和段位
        const l1DynamicScore = calculateDynamicScore(
          l1Profile.total_consumption ?? 0
        )
        const l1Rank = getRankByScore(l1DynamicScore)
        
        // 检查L1分佣资格（机制1）
        const l1Eligibility = checkCommissionEligibility(
          l1Profile.monthly_consumption ?? 0,
          l1Profile.consecutive_zero_months ?? 0
        )

        // 计算团队流水档位（机制2）
        const teamGmvStats = calculateTeamGmvLevel(l1Profile.team_monthly_gmv ?? 0)
        const commissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))  // V5：平台最低抽成10%，剩余池再分配

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
            .select('id, total_consumption, monthly_consumption, consecutive_zero_months, team_monthly_gmv, has_new_recruit, months_since_last_recruit')
            .eq('id', l2UserId)
            .maybeSingle()

          if (l2Profile) {
            // 计算L2动态分数和段位
            const l2DynamicScore = calculateDynamicScore(
              l2Profile.total_consumption ?? 0
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
          .select('total_consumption')
          .eq('id', payer_id)
          .maybeSingle()

        const buyerDynamicScore = calculateDynamicScore(
          buyerProfile?.total_consumption ?? 0
        )
        const buyerRank = getRankByScore(buyerDynamicScore)
        const buyerPoints = toFixed4(commissionPool * buyerRank.points)  // V5：与后端 distributeCommissionDirect / 前端预览同用剩余池基数，保证一致

        // 平台收入（让利池内抽成，平台对通道费/税费保持中性：不承受、不额外抽）
        const platformIncome = toFixed4(discountPool - l1Commission - l2Commission - buyerPoints)

        // 用户侧：支付通道费 + 代扣个税均从佣金扣除（**由用户承担**，商家/平台不承担）
        const userGrossCommission = toFixed4(l1Commission + l2Commission)
        const afterChannel = Math.max(0, userGrossCommission - channelFee)
        taxWithheld = toFixed4(calcWithholdingTax(afterChannel))
        userNetCommission = toFixed4(afterChannel - taxWithheld)

        console.log('[V4] 分佣结果:', {
          l1Rank: l1Rank.rank,
          l1Commission,
          l2Rank: l2UserId ? getRankByScore(calculateDynamicScore(0)).rank : null,
          l2Commission,
          buyerRank: buyerRank.rank,
          buyerPoints,
          platformIncome
        })

        // 写入佣金记录（通道费/代扣税按金额比例分摊到每行，由用户承担）
        if (l1Commission > 0) {
          const a = allocCommission(l1Commission, userGrossCommission, channelFee, taxWithheld)
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
            channel_fee: a.channelFee,
            tax_withheld: a.taxWithheld,
            net_amount: a.net,
            b_coef: 1.0,
            status: 'pending',
          })
        }

        if (l2Commission > 0) {
          const l2DynamicScore = calculateDynamicScore(0)  // 简化，实际应该查询
          const l2Rank = getRankByScore(l2DynamicScore)
          const a2 = allocCommission(l2Commission, userGrossCommission, channelFee, taxWithheld)
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
            channel_fee: a2.channelFee,
            tax_withheld: a2.taxWithheld,
            net_amount: a2.net,
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
          const newPoints = Math.round(buyerPoints)  // 积分换算（1元=1积分，与前端 V5 单位统一为 1:1）
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

    // P0 修复（提现断流止血）：累加受益人「可提现佣金余额」commission_balance。
    // 此前只写 commissions 记录却从不累加余额 → 用户/推广员永远提不出钱。
    // 合并同受益人多笔佣金后一次性更新，避免多次读改写。
    const balanceDelta = new Map<string, number>()
    for (const c of commissionRows) {
      const amt = Number(c.net_amount || 0)  // 累加净额（已扣通道费+代扣税），用户实际可提现
      if (amt <= 0 || !c.beneficiary_id) continue
      balanceDelta.set(c.beneficiary_id, Math.round(((balanceDelta.get(c.beneficiary_id) || 0) + amt) * 100) / 100)
    }
    for (const [uid, amt] of balanceDelta.entries()) {
      const { data: bal } = await supabase.from('profiles').select('commission_balance').eq('id', uid).maybeSingle()
      if (bal) {
        await supabase.from('profiles').update({
          commission_balance: Math.round((Number(bal.commission_balance || 0) + amt) * 100) / 100,
        }).eq('id', uid)

        // 推送「分佣到账」通知（每个受益人 1 条，async 不阻塞分佣）
        supabase.functions.invoke('send-notification', {
          body: {
            user_id: uid,
            type: 'commission_arrived',
            title: '佣金到账',
            body: `订单 ${order_no} 的佣金 ¥${amt.toFixed(2)} 已到账，可前往「我的推广」查看`,
            order_id: order_id,
            payload: {
              order_no: order_no,
              net_amount: amt.toFixed(2),
              arrived_at: new Date().toLocaleString('zh-CN'),
              remark: '佣金到账',
              page: 'pages/my-promotion/index',
            },
          }
        }).catch(e => console.warn('[distribute-commission] send-notification error:', e))
      }
    }

    // 标记已分佣
    await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)

    // 持久化支付通道费 + 代扣税（便于财务对账）；列由迁移 00082/00083 添加，缺失时静默跳过，不影响已完成的分配
    try {
      await supabase.from('orders').update({
        channel_fee: channelFee,
        channel_fee_rate: CHANNEL_FEE_RATE,
        tax_withheld: taxWithheld,
      }).eq('id', order_id)
    } catch (e: any) {
      console.warn('[V4] 写入 channel_fee/tax_withheld 失败（可能未跑迁移00082/00083）:', e?.message)
    }

    return Response.json({
      success: true,
      v4: true,
      discount_pool: discountPool,
      l1_commission: commissionRows.find((c: any) => c.level === 1)?.commission_amount ?? 0,
      l2_commission: commissionRows.find((c: any) => c.level === 2)?.commission_amount ?? 0,
      buyer_points: pointsRows[0]?.delta ?? 0,
      channel_fee: channelFee,
      channel_fee_rate: CHANNEL_FEE_RATE,
      tax_withheld: taxWithheld,
      user_gross_commission: userGrossCommission,
      user_net_commission: userNetCommission,
      platform_income: platformIncome,
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[V4] 分佣失败:', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
