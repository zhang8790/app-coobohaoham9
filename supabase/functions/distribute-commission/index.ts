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
 * 段位判定：动态分数 = 近6月滚动消费（含健康豆，1:1；被 6 月窗口锁死不会变永久杠杆）。
 * 分佣基数：自 2026-07-19 起统一为订单全额 total_amount（含健康豆抵扣），健康豆全额参与分佣；
 * 推广收益自 2026-07-29 起按「一半可提现佣金(commission_balance) + 一半健康豆(tb_balance)」发放。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ V5算法配置 ============

/** V5 段位配置（与前端 commission-calculator-v5.ts 完全一致，保证前后端分佣比例统一；已收敛上限） */
const RANK_TABLE = [
  { rank: '无心境',     minScore: 20000, l1: 0.50, l2: 0.20, points: 0.30 },
  { rank: '悟心',       minScore: 6000,  l1: 0.48, l2: 0.19, points: 0.32 },
  { rank: '静心',       minScore: 2000,  l1: 0.46, l2: 0.18, points: 0.34 },
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

/** 推广收益净额拆分比例：50% 进可提现佣金账户(commission_balance)，50% 进健康豆账户(tb_balance)。可由环境变量 COMMISSION_CASH_RATIO 覆盖。 */
const COMMISSION_CASH_RATIO = Number(Deno.env.get('COMMISSION_CASH_RATIO') ?? '0.5')

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
 * - rollingConsumption：本人近 6 月有效成交订单的现金基数（统一取 total_amount，含健康豆抵扣，1:1 锚定）之和
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
      // 滚动消费统一按订单全额 total_amount 计入（含健康豆抵扣，1:1 锚定人民币），与分佣基数口径一致
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
      store_id,
      referrer_id
    } = await req.json() as {
      order_id: string
      order_no: string
      payer_id: string
      total_amount: number
      net_amount?: number
      discount_rate?: number  // 商家让利率（小数口径，与前端 stores.referral_rate 一致，如 0.09 表示 9%）
      store_id?: string | null
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

    // 分佣基数 = 订单全额（含健康豆抵扣）。健康豆与人民币 1:1 锚定，全额参与分佣（含推广员可提现佣金）。
    // 业务决策（2026-07-19）：混合支付与纯健康豆订单统一以 total_amount 作分佣基数，确保健康豆消费也产生佣金与平台让利。
    let cashBase = toFixed4(total_amount ?? 0)
    // 支付通道费（微信约0.6%）：仅对微信实付部分(net_amount)计提——微信收单成本只对真钱发生；
    // 纯健康豆订单 net_amount=0 → 通道费=0。通道费由用户(受益人)承担，从佣金扣除。
    let channelFee = toFixed4((net_amount ?? 0) * CHANNEL_FEE_RATE)
    // isGoldOrder 仅用于日志标记（纯健康豆订单无微信现金交易）
    let isGoldOrder = toFixed4(net_amount ?? 0) <= 0 && cashBase > 0
    if (isGoldOrder) {
      console.log('[V5] 纯健康豆/无现金订单，以 total_amount 为分佣基数:', order_no, cashBase, '通道费=0')
    }
    // 真·零金额订单（total_amount 也为 0）直接标记已处理并跳过
    if (cashBase <= 0) {
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)
      return Response.json({ success: true, skipped: true, reason: 'zero_amount' }, { headers: corsHeaders })
    }

    // 让利率：优先用调用方显式传入（create-order / wechat-payment-callback 已按门店+商品金额加权算好）；
    // 未传时（触发器路径只传了 store_id）从门店 referral_rate 自取，避免回落到硬编码 0.09 默认，
    // 否则低让利率门店（如 3%）的订单会被按 9% 多发 3 倍佣金，平台真赔钱。
    let discountRate: number
    if (typeof discount_rate === 'number' && discount_rate > 0) {
      discountRate = discount_rate
    } else {
      try {
        const { data: sd } = await supabase
          .from('stores')
          .select('referral_rate, referral_rate_enabled')
          .eq('id', store_id as string)
          .maybeSingle()
        const enabled = (sd as any)?.referral_rate_enabled !== false
        const sr = Number((sd as any)?.referral_rate ?? 0)
        discountRate = enabled ? (sr > 0 ? sr : 0.09) : 0
      } catch {
        discountRate = 0.09
      }
    }

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
    let commissionPool = toFixed4(discountPool * (1 - MIN_PLATFORM_RATE_V5))  // 剩余池 = 让利 × 0.90（函数级，平台恰好抽 10%）
    let buyerRankPoints = 0.30  // 买家段位 points 比例（函数级）
    // 买家确权积分（函数级作用域，供下方 orders 回写使用）。任何购买（含无上线直购）均发放，故在 l1UserId 判断之外计算。
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
      buyerRankPoints = buyerRank.points  // 记录买家段位比例，供末尾归一化分配
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

      // ===== 风控：自推自 / 小号链检测 =====
      const isDirectSelfRef = l1UserId === payer_id
      const isSmallAccountChain = !!l2UserId && l2UserId === payer_id
      let riskFlag: string | null = null
      if (isDirectSelfRef) {
        // 直接自推：L1 即买家本人 → 整条 L1/L2 链不发放，买家积分照发、平台收全
        console.warn('[V5 Risk] 直接自推自(L1=买家本人)，跳过 L1 佣金:', order_no)
      } else if (isSmallAccountChain) {
        // 小号链：L1 是买家下级（L2 回指买家本人）→ 标记自推自嫌疑，冻结待审
        riskFlag = 'self_referral'
        console.warn('[V5 Risk] 小号链自推自嫌疑(L2=买家本人)，冻结待审:', order_no, l1UserId)
      }
      // 新注册账号嫌疑：L1 注册 < 7 天即产生推荐成交，疑似养号
      if (!isDirectSelfRef && l1UserId) {
        try {
          const { data: l1prof } = await supabase
            .from('profiles').select('created_at').eq('id', l1UserId).maybeSingle()
          const regDays = l1prof?.created_at
            ? (Date.now() - new Date((l1prof as any).created_at).getTime()) / 86400000 : 999
          if (regDays < 7) {
            riskFlag = riskFlag ? `${riskFlag},new_account_referral` : 'new_account_referral'
            console.warn('[V5 Risk] L1 为新注册账号(<7天)，疑似养号:', order_no, l1UserId, regDays.toFixed(1))
          }
        } catch (e) { console.warn('[V5 Risk] 读取 L1 注册时间失败:', (e as any)?.message) }
      }

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
      // 剩余池已在函数级 commissionPool 计算（= 让利 × 0.90，平台恰好抽 10%）
      l1Active = l1Metrics.activeMult
      l1Recruit = l1Metrics.recruitMult
      let l1Commission = 0
      // 直接自推（L1=买家本人）→ 不发 L1 佣金；小号链仍计算但标记冻结待审
      if (l1Active > 0 && !isDirectSelfRef) {
        l1Commission = toFixed4(commissionPool * l1Rank.l1 * l1Active * l1Recruit)
      }

      // 归一化分配（平台恰好抽 10%，剩余 90% 由 购买者/L1/L2 按段位比例全额分配，无亏损）：
      // 三项 raw 比例之和可能 ≠ 1（如 无心境 1.08 / 凡心 0.85），按各自 raw 占比归一化，
      // 保证 平台留成恒 = 让利×10%、三方拿满 90%、任何段位都不可能亏损。
      const rawBuyer = toFixed4(commissionPool * buyerRankPoints)
      const rawL1 = l1Commission
      const rawL2 = l2Commission
      const sumRaw = toFixed4(rawBuyer + rawL1 + rawL2)
      const fracBuyer = sumRaw > 0 ? rawBuyer / sumRaw : 0
      const fracL1 = sumRaw > 0 ? rawL1 / sumRaw : 0
      const fracL2 = sumRaw > 0 ? rawL2 / sumRaw : 0
      bfFinal = toFixed4(fracBuyer * commissionPool)
      l1Commission = toFixed4(fracL1 * commissionPool)
      l2Commission = toFixed4(fracL2 * commissionPool)
      platformIncome = toFixed4(discountPool - commissionPool)  // 恒 = 让利 × 10%
      // 同一归一化比例应用到商品行，保证 Σ 商品行 = 订单汇总（自洽）
      for (const it of itemDetails) {
        it.l1_gross = toFixed4(fracL1 * it.commission_pool)
        it.l2_gross = toFixed4(fracL2 * it.commission_pool)
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
        const l1CashPortion = toFixed4(a.net * COMMISSION_CASH_RATIO)
        const l1BeanPortion = toFixed4(a.net - l1CashPortion)
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
          cash_portion: l1CashPortion,
          bean_portion: l1BeanPortion,
          b_coef: 1.0,
          // 风控：可疑佣金冻结待审(status=frozen)，正常为 pending
          risk_flag: riskFlag,
          status: riskFlag ? 'frozen' : 'pending',
        })
      }

      if (l2Commission > 0) {
        const a2 = allocCommission(l2Commission, userGrossCommission, channelFee, taxWithheld)
        const l2CashPortion = toFixed4(a2.net * COMMISSION_CASH_RATIO)
        const l2BeanPortion = toFixed4(a2.net - l2CashPortion)
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
          cash_portion: l2CashPortion,
          bean_portion: l2BeanPortion,
          b_coef: 1.0,
          status: 'pending',
        })
      }
      } else {
        // 无上线直购：买家拿全额 90%（归一化后 fracBuyer=1），平台恰好 10%
        bfFinal = toFixed4(commissionPool)  // 买家全额剩余池
        platformIncome = toFixed4(discountPool - commissionPool)  // 恒 = 让利 × 10%
        console.log('[V5] 无上线直购：买家拿全额90% + 平台10%', { bfFinal, platformIncome, discountPool })
      }

    // ===== 买家返健康豆落库（任何购买都写，含无上线）=====
    // 统一口径：买家返利 = 健康豆(tb_balance)，写入 tongbao_logs(purchase_earn)；
    // 不再写 profiles.points / points_logs（与「贡献值」解耦，健康豆明细页读 tongbao_logs）。
    if (bfFinal > 0) {
      const { data: payerProfile } = await supabase
        .from('profiles')
        .select('tb_balance')
        .eq('id', payer_id)
        .maybeSingle()

      const currentTb = Number(payerProfile?.tb_balance ?? 0)
      const newTb = toFixed4(currentTb + bfFinal)

      await supabase.from('profiles').update({ tb_balance: newTb }).eq('id', payer_id)
      supabase.from('tongbao_logs').insert({
        user_id: payer_id,
        order_id: order_id,
        type: 'purchase_earn',
        delta: bfFinal,
        balance_after: newTb,
        remark: `订单${order_no}购物返健康豆`,
      }).then(() => {}, (e: any) => {
        if ((e as any)?.code === '42P01' || (e as any)?.status === 404) console.warn('[tongbao_logs] 表不存在')
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

    // 2026-07-29 决策「一半佣金，一半健康豆」：推广收益净额 50% 发放至可提现佣金账户
    // (commission_balance，推广服务费，依法代扣个税)，50% 发放至健康豆账户(tb_balance，仅消费抵扣、不可提现)。
    // 两账户严格隔离、各自留账。冻结(frozen)佣金不结算、待人工审核。
    const beneficiaryTotals = new Map<string, { cash: number; bean: number }>()
    for (const c of commissionRows) {
      if (c.status === 'frozen') {
        console.warn('[V5 Risk] 冻结佣金跳过发放:', order_no, c.beneficiary_id, c.risk_flag)
        continue
      }
      const cash = Number(c.cash_portion || 0)
      const bean = Number(c.bean_portion || 0)
      if ((cash <= 0 && bean <= 0) || !c.beneficiary_id) continue
      const prev = beneficiaryTotals.get(c.beneficiary_id) || { cash: 0, bean: 0 }
      beneficiaryTotals.set(c.beneficiary_id, {
        cash: Math.round((prev.cash + cash) * 100) / 100,
        bean: Math.round((prev.bean + bean) * 100) / 100,
      })
    }

    for (const [uid, { cash, bean }] of beneficiaryTotals.entries()) {
      // 健康豆一半 → tb_balance（含流水）
      if (bean > 0) {
        const { data: bal } = await supabase.from('profiles').select('tb_balance').eq('id', uid).maybeSingle()
        if (bal) {
          const newTb = Math.round((Number(bal.tb_balance || 0) + bean) * 100) / 100
          await supabase.from('profiles').update({ tb_balance: newTb }).eq('id', uid)
          supabase.from('tongbao_logs').insert({
            user_id: uid, order_id: order_id, type: 'commission_earn',
            delta: bean, balance_after: newTb,
            remark: `订单${order_no}推广佣金（健康豆50%）`,
          }).then(() => {}, (e: any) => {
            if ((e as any)?.code === '42P01' || (e as any)?.status === 404) console.warn('[tongbao_logs] 表不存在')
          })
        }
      }
      // 可提现佣金一半 → commission_balance（含现金账户流水）
      if (cash > 0) {
        const { data: bal } = await supabase.from('profiles').select('commission_balance').eq('id', uid).maybeSingle()
        if (bal) {
          const newBal = Math.round((Number(bal.commission_balance || 0) + cash) * 100) / 100
          await supabase.from('profiles').update({ commission_balance: newBal }).eq('id', uid)
          supabase.from('commission_balance_logs').insert({
            user_id: uid, order_id: order_id, type: 'commission_earn',
            delta: cash, balance_after: newBal,
            remark: `订单${order_no}推广佣金（可提现50%）`,
          }).then(() => {}, (e: any) => console.warn('[commission_balance_logs] 写入失败:', (e as any)?.message))
        }
      }
      // 推送「分佣到账」通知（每个受益人 1 条，async 不阻塞分佣）
      const total = Math.round((cash + bean) * 100) / 100
      supabase.functions.invoke('send-notification', {
        body: {
          user_id: uid,
          type: 'commission_arrived',
          title: '佣金到账（一半可提现+一半健康豆）',
          body: `订单 ${order_no} 的佣金 ${total.toFixed(2)} 元已到账：可提现 ¥${cash.toFixed(2)} + 健康豆 ¥${bean.toFixed(2)}`,
          order_id: order_id,
          payload: {
            order_no: order_no,
            cash_amount: cash.toFixed(2),
            bean_amount: bean.toFixed(2),
            net_amount: total.toFixed(2),
            arrived_at: new Date().toLocaleString('zh-CN'),
            remark: '佣金到账(一半可提现+一半健康豆)',
            page: 'pages/my-promotion/index',
          },
        },
      }).catch(e => console.warn('[distribute-commission] send-notification error:', e))
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
      buyer_points: bfFinal,
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
