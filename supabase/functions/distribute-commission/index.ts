/**
 * distribute-commission Edge Function
 * V5 动态分佣系统（防躺平版 + 六段位 + 近6月滚动段位）
 *
 * 2026-07-18 优化（解决「段位逻辑不对 / 躺平收益高」）：
 * - 段位口径改为【近 6 个月滚动消费】决定（原终身累计消费只增不减 → 躺平者永久高段位）。
 * - 删除原写死返回 eligible:true 的 checkCommissionEligibility 与恒返回 1 的 calculateRecruitmentWeight。
 * - 真实落地两层门槛：活跃系数(activeMult) + 拓新衰减(recruitMult)，前后端算法统一。
 * - 上级链统一用 profiles.referrer_id（uuid 上级），修复原 L2 段位记录用 calculateDynamicScore(0) 写死"凡心"的 bug。
 *
 * 段位判定：动态分数 = 近6月滚动消费（含情绪豆，1:1；被 6 月窗口锁死不会变永久杠杆）。
 * 分佣基数：自 2026-07-19 起统一为订单全额 total_amount（含情绪豆抵扣），情绪豆全额参与分佣；推广佣金以「情绪豆」(tb_balance) 发放，可直接消费支付、回流。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ V5算法配置 ============

/** V5 段位配置（与前端 commission-calculator-v5.ts 完全一致，保证前后端分佣比例统一；已收敛上限） */
const RANK_TABLE = [
  { rank: '无心境',     minScore: 20000, l1: 0.50, l2: 0.18, points: 0.15 },
  { rank: '悟心',       minScore: 6000,  l1: 0.48, l2: 0.18, points: 0.15 },
  { rank: '静心',       minScore: 2000,  l1: 0.46, l2: 0.18, points: 0.14 },
  { rank: '明心',       minScore: 800,   l1: 0.44, l2: 0.17, points: 0.13 },
  { rank: '初心',       minScore: 200,   l1: 0.42, l2: 0.16, points: 0.12 },
  { rank: '凡心',       minScore: 0,     l1: 0.40, l2: 0.15, points: 0.10 },
]

/** V5 平台最低抽成（与前端 PLATFORM_CONFIG.MIN_PLATFORM_RATE 一致） */
const MIN_PLATFORM_RATE_V5 = 0.10

/** 支付通道费率（微信收单成本，默认0.6%；可由环境变量 CHANNEL_FEE_RATE 覆盖） */
const CHANNEL_FEE_RATE = Number(Deno.env.get('CHANNEL_FEE_RATE') ?? '0.006')

/** 代扣个税（劳务报酬/佣金所得）：税率与免征额，由用户承担，从佣金扣除；可由环境变量覆盖 */
const TAX_RATE = Number(Deno.env.get('COMMISSION_TAX_RATE') ?? '0.20')
const TAX_THRESHOLD = Number(Deno.env.get('COMMISSION_TAX_THRESHOLD') ?? '800')

/** 视为「有效成交」的订单状态
 *  ⚠️ 必须与 public.order_status 枚举的真实值一致（00001 定义：
 *  pending_pay, pending_ship, pending_receive, pending_review, completed, after_sale, cancelled；
 *  00061 追加 pending_pickup）。原写法含 'paid'/'used' 会触发 22P02 枚举越界，
 *  导致整个分佣函数失败、所有订单不分佣。已修正为仅保留真实存在且代表「已成交」的状态。 */
const ACTIVE_ORDER_STATUSES = ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup']

// ============ V5算法核心函数 ============

/** 计算动态分数（近6月滚动消费，1:1） */
function calculateDynamicScore(rollingConsumption: number): number {
  return Math.round((rollingConsumption || 0) * 100) / 100
}

/** 根据动态分数判定段位（RANK_TABLE 高→低，返回首个满足门槛的最高段位） */
function getRankByScore(score: number): typeof RANK_TABLE[0] {
  for (const rank of RANK_TABLE) {
    if (score >= rank.minScore) return rank
  }
  return RANK_TABLE[RANK_TABLE.length - 1]  // 默认凡心
}

/** 活跃系数：近 30 天有推荐成交=1.0；30~60 天有=0.5（宽限）；连续 60 天无=0（暂停） */
function getActiveMultiplier(recent30dReferredOrders: number, prev30dReferredOrders: number): number {
  if (recent30dReferredOrders > 0) return 1.0
  if (prev30dReferredOrders > 0) return 0.5
  return 0
}

/** 拓新衰减：距上次拓新 ≤90 天=1.0；>90 天=0.4；从未拓新(NULL)=1.0（不惩罚新推广员） */
function getRecruitMultiplier(daysSinceLastRecruit: number | null): number {
  if (daysSinceLastRecruit == null) return 1.0
  if (daysSinceLastRecruit > 90) return 0.4
  return 1.0
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

/** ISO 时间字符串：当前往前 N 天 */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

/**
 * 无状态计算某受益人的近6月滚动指标（与前端 fetchCommissionMetrics 完全一致）：
 * - rollingConsumption：本人近 6 月有效成交订单的现金基数（统一取 total_amount，含情绪豆抵扣，1:1 锚定）之和
 * - activeMult：基于「本人作为 referrer_id 的推荐成交」近 30/30~60 天分布
 * - recruitMult：基于「下级 profiles.referrer_id = 本人」距上次注册天数
 * 失败降级：读 profiles.total_consumption（终身）作为滚动近似、系数不设衰减（保证不出错、不崩付）。
 */
async function fetchBeneficiaryMetrics(
  supabase: any,
  userId: string,
): Promise<{ rollingConsumption: number; activeMult: number; recruitMult: number }> {
  try {
    // 1) 近6月滚动消费（本人付款订单；orders 表付款人列是 user_id，非 payer_id）
    const { data: cons } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('user_id', userId)
      .gte('created_at', isoDaysAgo(180))
      .in('status', ACTIVE_ORDER_STATUSES)

    let rolling = 0
    for (const o of (cons as any[]) ?? []) {
      // 滚动消费统一按订单全额 total_amount 计入（含情绪豆抵扣，1:1 锚定人民币），与分佣基数口径一致
      const tot = Number(o.total_amount) || 0
      rolling += tot
    }
    rolling = Math.round(rolling * 100) / 100

    // 2) 推荐成交分布（本人作为 referrer_id 的订单，近 60 天，含当前订单→新推广员首单即活跃）
    const { data: ref } = await supabase
      .from('orders')
      .select('created_at')
      .eq('referrer_id', userId)
      .gte('created_at', isoDaysAgo(60))
      .in('status', ACTIVE_ORDER_STATUSES)

    let r30 = 0
    let r3060 = 0
    const now = Date.now()
    for (const o of (ref as any[]) ?? []) {
      const days = (now - new Date(o.created_at).getTime()) / 86400000
      if (days <= 30) r30++
      else if (days <= 60) r3060++
    }
    const activeMult = getActiveMultiplier(r30, r3060)

    // 3) 距上次拓新（下级 profiles.referrer_id = 本人 的最大 created_at）
    const { data: rec } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    let daysSince: number | null = null
    if (rec && (rec as any[]).length > 0) {
      daysSince = (now - new Date((rec as any[])[0].created_at).getTime()) / 86400000
    }
    const recruitMult = getRecruitMultiplier(daysSince)

    return { rollingConsumption: rolling, activeMult, recruitMult }
  } catch (e) {
    console.warn('[V5 metrics] 计算失败，降级为终身消费/无衰减:', (e as any)?.message)
    const { data: p } = await supabase
      .from('profiles')
      .select('total_consumption')
      .eq('id', userId)
      .maybeSingle()
    return { rollingConsumption: (p as any)?.total_consumption ?? 0, activeMult: 1, recruitMult: 1 }
  }
}

// ============ 主函数 ============

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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
      console.log('[V5] 订单已分佣，跳过:', order_no)
      return Response.json({ success: true, skipped: true }, { headers: corsHeaders })
    }

    // 分佣基数 = 订单全额（含情绪豆抵扣）。情绪豆与人民币 1:1 锚定，全额参与分佣（含推广员可提现佣金）。
    // 业务决策（2026-07-19）：混合支付与纯豆订单统一以 total_amount 作分佣基数，确保情绪豆消费也产生佣金与平台让利。
    let cashBase = toFixed4(total_amount ?? 0)
    // 支付通道费（微信约0.6%）：仅对微信实付部分(net_amount)计提——微信收单成本只对真钱发生；
    // 纯情绪豆订单 net_amount=0 → 通道费=0。通道费由用户(受益人)承担，从佣金扣除。
    let channelFee = toFixed4((net_amount ?? 0) * CHANNEL_FEE_RATE)
    // isGoldOrder 仅用于日志标记（纯情绪豆订单无微信现金交易）
    let isGoldOrder = toFixed4(net_amount ?? 0) <= 0 && cashBase > 0
    if (isGoldOrder) {
      console.log('[V5] 纯情绪豆/无现金订单，以 total_amount 为分佣基数:', order_no, cashBase, '通道费=0')
    }
    // 真·零金额订单（total_amount 也为 0）直接标记已处理并跳过
    if (cashBase <= 0) {
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)
      return Response.json({ success: true, skipped: true, reason: 'zero_amount' }, { headers: corsHeaders })
    }

    // 让利池 = 现金基数 × 让利率
    const discountRate = discount_rate ?? 0.09  // 默认9%，与前端一致
    const discountPool = toFixed4(cashBase * discountRate)

    console.log('[V5] 开始分佣计算:', {
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
    let userGrossCommission = 0
    let platformIncome = 0

    if (l1UserId) {
      // 1) L1 近6月滚动指标（决定段位 + 活跃/拓新系数）
      const l1Metrics = await fetchBeneficiaryMetrics(supabase, l1UserId)
      const l1DynamicScore = calculateDynamicScore(l1Metrics.rollingConsumption)
      const l1Rank = getRankByScore(l1DynamicScore)

      // 2) L2 = L1 的上级（统一用 profiles.referrer_id，uuid 上级链）
      const { data: l1Profile } = await supabase
        .from('profiles')
        .select('referrer_id')
        .eq('id', l1UserId)
        .maybeSingle()
      l2UserId = (l1Profile as any)?.referrer_id || null

      let l2Commission = 0
      let l2Rank = getRankByScore(0)
      if (l2UserId && l2UserId !== payer_id) {
        const l2Metrics = await fetchBeneficiaryMetrics(supabase, l2UserId)
        const l2DynamicScore = calculateDynamicScore(l2Metrics.rollingConsumption)
        l2Rank = getRankByScore(l2DynamicScore)
        // 修复：L2 段位必须用真实 l2Rank（原代码写死 calculateDynamicScore(0)→"凡心"）
        const l2Active = l2Metrics.activeMult
        const l2Recruit = l2Metrics.recruitMult
        if (l2Active > 0) {
          l2Commission = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5) * l2Rank.l2 * l2Active * l2Recruit)
        }
      }

      // 3) L1 佣金（剩余池 × 段位比例 × 活跃 × 拓新）
      const commissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))  // V5：平台最低抽成10%，剩余池再分配
      const l1Active = l1Metrics.activeMult
      const l1Recruit = l1Metrics.recruitMult
      let l1Commission = 0
      if (l1Active > 0) {
        l1Commission = toFixed4(commissionPool * l1Rank.l1 * l1Active * l1Recruit)
      }

      // 4) 买家积分（基于买家近6月滚动段位）
      const buyerMetrics = await fetchBeneficiaryMetrics(supabase, payer_id)
      const buyerDynamicScore = calculateDynamicScore(buyerMetrics.rollingConsumption)
      const buyerRank = getRankByScore(buyerDynamicScore)
      const buyerPoints = toFixed4(commissionPool * buyerRank.points)

      // 平台收入（让利池内抽成，平台对通道费/税费保持中性）
      platformIncome = toFixed4(discountPool - l1Commission - l2Commission - buyerPoints)

      // 用户侧：支付通道费 + 代扣个税均从佣金扣除（**由用户承担**，商家/平台不承担）
      userGrossCommission = toFixed4(l1Commission + l2Commission)
      const afterChannel = Math.max(0, userGrossCommission - channelFee)
      taxWithheld = toFixed4(calcWithholdingTax(afterChannel))
      userNetCommission = toFixed4(afterChannel - taxWithheld)

      console.log('[V5] 分佣结果:', {
        l1Rank: l1Rank.rank,
        l1Rolling: l1Metrics.rollingConsumption,
        l1Active: l1Active,
        l1Recruit: l1Recruit,
        l1Commission,
        l2Rank: l2UserId ? l2Rank.rank : null,
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

      // 写入积分记录（买家获赠情绪豆）
      if (buyerPoints > 0) {
        const { data: payerProfile } = await supabase
          .from('profiles')
          .select('points')
          .eq('id', payer_id)
          .maybeSingle()

        const currentPoints = payerProfile?.points ?? 0
        const newPoints = Math.round(buyerPoints)
        const balanceAfter = currentPoints + newPoints

        await supabase.from('profiles').update({ points: balanceAfter }).eq('id', payer_id)

        pointsRows.push({
          user_id: payer_id,
          order_id,
          type: 'purchase_earn',
          delta: newPoints,
          balance_after: balanceAfter,
          remark: `订单${order_no}购物返积分（V5滚动段位算法）`,
        })
      }

      // 更新买家累计消费（终身，仅作滚动指标降级回退用；段位已改用近6月滚动）
      const { data: buyerProfile } = await supabase
        .from('profiles')
        .select('total_consumption')
        .eq('id', payer_id)
        .maybeSingle()
      if (buyerProfile) {
        await supabase.from('profiles').update({
          total_consumption: toFixed4((buyerProfile.total_consumption ?? 0) + cashBase),
          monthly_consumption: toFixed4((buyerProfile.monthly_consumption ?? 0) + cashBase),
        }).eq('id', payer_id)
      }
    }

    // 批量写入数据库
    if (commissionRows.length > 0) {
      await supabase.from('commissions').insert(commissionRows)
    }
    if (pointsRows.length > 0) {
      await supabase.from('points_logs').insert(pointsRows)
    }

    // 2026-07-19 业务决策（覆盖原资产隔离铁律）：推广佣金改发「情绪豆」(tb_balance)，
    // 直接进入用户内部货币钱包，可在平台内消费支付，形成「分佣→情绪豆→支付→再分佣」回流飞轮。
    // 不再进可提现 commission_balance（情绪豆按平台规则不可提现/兑现金）。
    const balanceDelta = new Map<string, number>()
    for (const c of commissionRows) {
      const amt = Number(c.net_amount || 0)  // 累加净额（已扣通道费+代扣税），用户实际到手情绪豆
      if (amt <= 0 || !c.beneficiary_id) continue
      balanceDelta.set(c.beneficiary_id, Math.round(((balanceDelta.get(c.beneficiary_id) || 0) + amt) * 100) / 100)
    }
    for (const [uid, amt] of balanceDelta.entries()) {
      const { data: bal } = await supabase.from('profiles').select('tb_balance').eq('id', uid).maybeSingle()
      if (bal) {
        const newTb = Math.round((Number(bal.tb_balance || 0) + amt) * 100) / 100
        await supabase.from('profiles').update({
          tb_balance: newTb,
        }).eq('id', uid)

        // 情绪豆流水（合规要求：tb_balance 变动必须留账，便于对账与防资损）
        supabase.from('tongbao_logs').insert({
          user_id: uid,
          order_id: order_id,
          type: 'commission_earn',
          delta: amt,
          balance_after: newTb,
          remark: `订单${order_no}推广佣金（情绪豆）`,
        }).then(() => {}).catch((e: any) => {
          if ((e as any)?.code === '42P01' || (e as any)?.status === 404) {
            console.warn('[tongbao_logs] 表不存在(00096未执行)，佣金流水暂不记录')
          }
        })

        // 推送「分佣到账」通知（每个受益人 1 条，async 不阻塞分佣）
        supabase.functions.invoke('send-notification', {
          body: {
            user_id: uid,
            type: 'commission_arrived',
            title: '佣金到账（情绪豆）',
            body: `订单 ${order_no} 的佣金 ${amt.toFixed(2)} 情绪豆已到账，可在平台内直接消费支付`,
            order_id: order_id,
            payload: {
              order_no: order_no,
              net_amount: amt.toFixed(2),
              arrived_at: new Date().toLocaleString('zh-CN'),
              remark: '佣金到账(情绪豆)',
              page: 'pages/my-promotion/index',
            },
          }
        }).catch(e => console.warn('[distribute-commission] send-notification error:', e))
      }
    }

    // 标记已分佣
    await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)

    // 持久化支付通道费 + 代扣税（便于财务对账）；列由迁移 00082/00083 添加，缺失时静默跳过
    try {
      await supabase.from('orders').update({
        channel_fee: channelFee,
        channel_fee_rate: CHANNEL_FEE_RATE,
        tax_withheld: taxWithheld,
      }).eq('id', order_id)
    } catch (e: any) {
      console.warn('[V5] 写入 channel_fee/tax_withheld 失败（可能未跑迁移00082/00083）:', e?.message)
    }

    return Response.json({
      success: true,
      v5: true,
      rolling_rank: true,
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
    console.error('[V5] 分佣失败:', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
