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
  { rank: '无心境',     minScore: 20000, l1: 0.50, l2: 0.18, points: 0.40 },
  { rank: '悟心',       minScore: 6000,  l1: 0.48, l2: 0.18, points: 0.40 },
  { rank: '静心',       minScore: 2000,  l1: 0.46, l2: 0.18, points: 0.37 },
  { rank: '明心',       minScore: 800,   l1: 0.44, l2: 0.17, points: 0.34 },
  { rank: '初心',       minScore: 200,   l1: 0.42, l2: 0.16, points: 0.32 },
  { rank: '凡心',       minScore: 0,     l1: 0.40, l2: 0.15, points: 0.30 },
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

    const discountRate = discount_rate ?? 0.09  // 默认9%，与前端一致

    // ===== 商品级明细：逐商品用自身 discount_rate 算让利池（追溯/展示用，绕开 order_items→products 缺外键）=====
    let itemDetails: Array<{
      order_item_id: string; product_id: string | null; product_name: string | null;
      price: number; quantity: number; item_total: number;
      product_discount_rate: number; discount_pool: number; commission_pool: number;
      l1_gross: number; l2_gross: number;
    }> = []
    try {
      const { data: oiRows } = await supabase
        .from('order_items').select('id, product_id, product_name, price, quantity').eq('order_id', order_id)
      const oiList = (oiRows || []) as Array<{ id?: string; product_id?: string | null; product_name?: string | null; price?: any; quantity?: any }>
      const pIds = Array.from(new Set((oiList || []).map((it: any) => it?.product_id).filter(Boolean))) as string[]
      let pRate: Record<string, number> = {}
      if (pIds.length) {
        const { data: pRows } = await supabase
          .from('products').select('id, discount_rate').in('id', pIds)
        for (const p of (pRows || []) as Array<{ id?: string; discount_rate?: any }>) {
          if (p?.id) pRate[p.id] = Number(p.discount_rate ?? 0)
        }
      }
      for (const it of oiList) {
        const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
        const pid = String(it?.product_id ?? '')
        const rate = (pRate[pid] !== undefined && pRate[pid] > 0) ? pRate[pid] / 100 : discountRate
        const dp = toFixed4(amt * rate)
        itemDetails.push({
          order_item_id: String(it.id ?? ''),
          product_id: it?.product_id ?? null,
          product_name: it?.product_name ?? null,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 0,
          item_total: amt,
          product_discount_rate: rate,
          discount_pool: dp,
          commission_pool: toFixed4(dp * (1 - MIN_PLATFORM_RATE_V5)),
          l1_gross: 0,
          l2_gross: 0,
        })
      }
    } catch (e) { console.warn('[V5] 读取商品明细失败，降级为整单率:', (e as any)?.message) }

    // 让利池：优先按商品级明细汇总（每个商品用自身 discount_rate），与整单加权口径一致；无明细时回退整单率
    const discountPoolFromItems = itemDetails.reduce((s, it) => s + it.discount_pool, 0)
    const discountPool = toFixed4(discountPoolFromItems > 0 ? discountPoolFromItems : cashBase * discountRate)

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
    // 买家确权积分（函数级作用域，供下方 orders 回写使用；下限 0.01 避免全舍入为 0；
    // 上限 commissionPool 保证 platform_income 恒 ≥ 0）。任何购买（含无上线直购）均发放，故在 l1UserId 判断之外计算。
    let bfFinal = 0
    // 段位/系数变量提升至函数级，使无上线分支也能在商品级明细行中正确引用
    let l1Rank = getRankByScore(0)
    let l2Rank = getRankByScore(0)
    let l1Active = 0
    let l1Recruit = 1
    let l2ActiveMult = 1
    let l2RecruitMult = 1

    // ===== 买家确权积分：基于买家自身近6月滚动段位，独立于上线关系，任何购买都发 =====
    {
      const buyerMetrics = await fetchBeneficiaryMetrics(supabase, payer_id)
      const buyerDynamicScore = calculateDynamicScore(buyerMetrics.rollingConsumption)
      const buyerRank = getRankByScore(buyerDynamicScore)
      const buyerCommissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))
      const rawBuyerPoints = toFixed4(buyerCommissionPool * buyerRank.points)
      bfFinal = rawBuyerPoints > 0 ? Math.min(buyerCommissionPool, Math.max(0.01, rawBuyerPoints)) : 0
    }

    if (l1UserId) {
      let l2Commission = 0
      // 1) L1 近6月滚动指标（决定段位 + 活跃/拓新系数）
      const l1Metrics = await fetchBeneficiaryMetrics(supabase, l1UserId)
      const l1DynamicScore = calculateDynamicScore(l1Metrics.rollingConsumption)
      l1Rank = getRankByScore(l1DynamicScore)

      // 2) L2 = L1 的上级（统一用 profiles.referrer_id，uuid 上级链）
      const { data: l1Profile } = await supabase
        .from('profiles')
        .select('referrer_id')
        .eq('id', l1UserId)
        .maybeSingle()
      l2UserId = (l1Profile as any)?.referrer_id || null

      if (l2UserId && l2UserId !== payer_id) {
        const l2Metrics = await fetchBeneficiaryMetrics(supabase, l2UserId)
        const l2DynamicScore = calculateDynamicScore(l2Metrics.rollingConsumption)
        l2Rank = getRankByScore(l2DynamicScore)
        // 修复：L2 段位必须用真实 l2Rank（原代码写死 calculateDynamicScore(0)→"凡心"）
        l2ActiveMult = l2Metrics.activeMult
        l2RecruitMult = l2Metrics.recruitMult
        if (l2ActiveMult > 0) {
          l2Commission = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5) * l2Rank.l2 * l2ActiveMult * l2RecruitMult)
        }
      }

      // 商品级 L1/L2 gross：用整单人级系数 × 各商品 commission_pool；Σ = 整单 gross（金额口径不变）
      for (const it of itemDetails) {
        it.l1_gross = l1Metrics.activeMult > 0 ? toFixed4(it.commission_pool * l1Rank.l1 * l1Metrics.activeMult * l1Metrics.recruitMult) : 0
        it.l2_gross = (l2UserId && l2UserId !== payer_id && l2ActiveMult > 0)
          ? toFixed4(it.commission_pool * l2Rank.l2 * l2ActiveMult * l2RecruitMult) : 0
      }

      // 3) L1 佣金（剩余池 × 段位比例 × 活跃 × 拓新）
      const commissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))  // V5：平台最低抽成10%，剩余池再分配
      l1Active = l1Metrics.activeMult
      l1Recruit = l1Metrics.recruitMult
      let l1Commission = 0
      if (l1Active > 0) {
        l1Commission = toFixed4(commissionPool * l1Rank.l1 * l1Active * l1Recruit)
      }

      // 平台收入（让利池内保底抽成）+ 防资损封顶缩放（与买家积分共享 commissionPool）
      // 用户需求口径（2026-07-19）：平台从「让利池」保底抽 10%（MIN_PLATFORM_RATE_V5），
      // 剩余 90%（commissionPool = 让利×0.90）再分给 L1/L2 佣金 + 买家确权积分。
      // 封顶：段位系数×活跃×拓新可能使佣金总额超过 commissionPool → 平台留成被挤到 <10%；
      // 故将 一级+二级佣金 上限封顶为 (commissionPool − 买家确权积分)，超出按比例缩放，
      // 平台留成 = 让利池 − L1 − L2 − 买家积分，恒 ≥ 让利×10%（保底=下限，非恰好）。
      const commTotalRaw = l1Commission + l2Commission
      const capForComm = Math.max(0, toFixed4(commissionPool - bfFinal))
      let commissionScale = 1
      if (commTotalRaw > capForComm && commTotalRaw > 0) {
        commissionScale = capForComm / commTotalRaw
        l1Commission = toFixed4(l1Commission * commissionScale)
        l2Commission = toFixed4(l2Commission * commissionScale)
      }
      platformIncome = Math.max(0, toFixed4(discountPool - l1Commission - l2Commission - bfFinal))
      // 同一缩放因子应用到商品行，保证 Σ 商品行佣金 = 订单汇总（自洽）
      for (const it of itemDetails) {
        it.l1_gross = toFixed4(it.l1_gross * commissionScale)
        it.l2_gross = toFixed4(it.l2_gross * commissionScale)
      }

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
        bfFinal,
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
    } else {
      // 无上线直购：买家确权积分照发（上方已算），平台收全部未分配让利（= 让利池 − 买家积分）
      const commissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))
      platformIncome = Math.max(0, toFixed4(discountPool - bfFinal))
      console.log('[V5] 无上线直购：买家积分 + 平台管理费', { bfFinal, platformIncome, discountPool })
    }

    // ===== 买家确权积分落库（任何购买都写，含无上线）=====
    if (bfFinal > 0) {
      const { data: payerProfile } = await supabase
        .from('profiles')
        .select('points')
        .eq('id', payer_id)
        .maybeSingle()

      const currentPoints = payerProfile?.points ?? 0
      const newPoints = bfFinal
      const balanceAfter = toFixed4(currentPoints + newPoints)

      await supabase.from('profiles').update({ points: balanceAfter }).eq('id', payer_id)

      pointsRows.push({
        user_id: payer_id,
        related_order_id: order_id,
        type: 'purchase_earn',
        amount: newPoints,
        source: 'order_commission',
      })
    }

    // 更新买家累计消费（终身，仅作滚动指标降级回退用；段位已改用近6月滚动）——任何购买都更新
    {
      const { data: buyerProfile } = await supabase
        .from('profiles')
        .select('total_consumption, monthly_consumption')
        .eq('id', payer_id)
        .maybeSingle()
      if (buyerProfile) {
        await supabase.from('profiles').update({
          total_consumption: toFixed4((buyerProfile.total_consumption ?? 0) + cashBase),
          monthly_consumption: toFixed4((buyerProfile.monthly_consumption ?? 0) + cashBase),
        }).eq('id', payer_id)
      }
    }

    // 写商品级结算行（追溯/展示；Σ 商品行 = 订单汇总，金额自洽）。幂等：冲突跳过（UNIQUE(order_item_id)）。
    // 任何购买都写：无上线时 L1/L2 为 0，买家积分与平台管理费照常记录，保证财务对账完整。
    if (itemDetails.length > 0) {
      try {
        const cpTotal = itemDetails.reduce((s, it) => s + it.commission_pool, 0) || 1
        let buyerAssigned = 0
        const oicRows = itemDetails.map((it, idx) => {
          let bp = 0
          if (bfFinal > 0 && cpTotal > 0) {
            bp = idx === itemDetails.length - 1
              ? Math.max(0, toFixed4(bfFinal - buyerAssigned))
              : Math.round((bfFinal * it.commission_pool) / cpTotal)
            buyerAssigned += bp
          }
          const platI = toFixed4(it.discount_pool - it.l1_gross - it.l2_gross - bp)
          return {
            order_id,
            order_item_id: it.order_item_id,
            order_no,
            product_id: it.product_id,
            product_name: it.product_name,
            price: it.price,
            quantity: it.quantity,
            item_total: it.item_total,
            product_discount_rate: it.product_discount_rate,
            effective_rate: it.product_discount_rate,
            discount_amount: it.discount_pool,
            discount_pool: it.discount_pool,
            commission_pool: it.commission_pool,
            l1_user_id: l1UserId,
            l1_rank: l1UserId ? l1Rank.rank : null,
            l1_ratio: l1UserId ? l1Rank.l1 : null,
            l1_active_mult: l1Active,
            l1_recruit_mult: l1Recruit,
            l1_gross: it.l1_gross,
            l1_commission: it.l1_gross,
            l2_user_id: l2UserId,
            l2_rank: (l2UserId && l2UserId !== payer_id) ? l2Rank.rank : null,
            l2_ratio: (l2UserId && l2UserId !== payer_id) ? l2Rank.l2 : null,
            l2_active_mult: l2ActiveMult,
            l2_recruit_mult: l2RecruitMult,
            l2_gross: it.l2_gross,
            l2_commission: it.l2_gross,
            buyer_points: bp,
            platform_income: platI,
            commission_distributed: true,
            distributed_at: new Date().toISOString(),
          }
        })
        const { error: oicErr } = await supabase
          .from('order_item_commissions')
          .upsert(oicRows, { onConflict: 'order_item_id' })
        if (oicErr) console.warn('[V5] 写入 order_item_commissions 失败:', oicErr?.message)
      } catch (e: any) { console.warn('[V5] 写入 order_item_commissions 异常:', e?.message) }
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

        // 情绪豆流水（tb_balance 变动必须留账，便于对账与防资损）
        supabase.from('tongbao_logs').insert({
          user_id: uid,
          order_id: order_id,
          type: 'commission_earn',
          delta: amt,
          balance_after: newTb,
          remark: `订单${order_no}推广佣金（金豆）`,
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
    title: '佣金到账（金豆）',
    body: `订单 ${order_no} 的佣金 ${amt.toFixed(2)} 金豆已到账，可在平台内直接消费支付`,
    order_id: order_id,
    payload: {
      order_no: order_no,
      net_amount: amt.toFixed(2),
      arrived_at: new Date().toLocaleString('zh-CN'),
      remark: '佣金到账(金豆)',
              page: 'pages/my-promotion/index',
            },
          }
        }).catch(e => console.warn('[distribute-commission] send-notification error:', e))
      }
    }

    // 标记已分佣
    await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)

    // 持久化支付通道费 + 代扣税 + 买家确权积分 + 平台保底收益（便于财务对账与前端展示）；
    // 列由迁移 00082/00083/001XX 添加。曾因 buyerFinal 声明在 if(l1UserId) 块内、此处块外引用越界，
    // 导致 update 静默失败（平台收益/买家积分未落库，靠迁移手动补）。已将 bfFinal 提升为函数级变量修复。
    try {
      await supabase.from('orders').update({
        channel_fee: channelFee,
        channel_fee_rate: CHANNEL_FEE_RATE,
        tax_withheld: taxWithheld,
        // 真实一/二级佣金回写订单展示列（与 commissions 流水同源；覆盖前端 createOrderV2 的预算值，避免管理端看到陈旧错数）
        l1_commission: commissionRows.find((c: any) => c.level === 1)?.commission_amount ?? 0,
        l2_commission: commissionRows.find((c: any) => c.level === 2)?.commission_amount ?? 0,
        // 买家确权积分写回订单（前端成交订单页直接读取 orders.buyer_points；下限 1  point避免大额定单错位为 0）
        buyer_points: bfFinal,
        // 平台收益落库：让利池 - L1 - L2 - 买家积分（封顶保底使其恒 ≥ 让利×10%，实际拿剩余；D0 决策 2026-07-20 读法B）
        platform_income: platformIncome,
      }).eq('id', order_id)
    } catch (e: any) {
      console.warn('[V5] 写入 orders 分成结果失败（platform_income/buyer_points 等）:', e?.message)
    }

    return Response.json({
      success: true,
      v5: true,
      rolling_rank: true,
      discount_pool: discountPool,
      l1_commission: commissionRows.find((c: any) => c.level === 1)?.commission_amount ?? 0,
      l2_commission: commissionRows.find((c: any) => c.level === 2)?.commission_amount ?? 0,
      buyer_points: pointsRows[0]?.amount ?? 0,
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
