/**
 * distribute-commission Edge Function
 * V3 动态分佣系统（防亏损安全版）
 *
 * 分佣基数（net_amount）= 实际现金支付额（扣除金豆抵扣后）
 * 让利池 = net_amount × 25%
 * L1+L2 佣金总计封顶 = 让利池 × 60%（防高段位穿仓）
 * 消费者积分 = 让利池 × 25%（按0.01元/积分换算，每日上限200分）
 * 抽奖池 = 让利池 × 5%（暂记，未来接彩池）
 * 平台保底留存 ≥ 让利池 × 10%（理论），因为佣金封顶后 = 40% - 积分25% - 彩池5% = 10%
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// V3 段位分佣比例表
const RANK_COMMISSION: Record<string, { l1: number; l2: number }> = {
  '江湖散修': { l1: 0.30, l2: 0.12 },
  '外门弟子': { l1: 0.36, l2: 0.15 },
  '内门弟子': { l1: 0.42, l2: 0.18 },
  '核心弟子': { l1: 0.48, l2: 0.21 },
  '长老':     { l1: 0.54, l2: 0.24 },
  '掌门':     { l1: 0.60, l2: 0.27 },
}

const PROFIT_POOL_RATIO = 0.25      // 让利池占净现金额
const COMMISSION_CAP_RATIO = 0.60   // L1+L2 佣金总额上限（占让利池），防高段位穿仓
const CONSUMER_POINTS_RATIO = 0.25  // 消费者积分返现占让利池
const LOTTERY_RATIO = 0.05          // 抽奖池占让利池
const GOLD_BEAN_RATE = 0.01         // 1积分 = 0.01元
const DAILY_POINTS_CAP = 200        // 单用户每日消费返积分上限（分）

function toFixed4(n: number) { return Math.round(n * 10000) / 10000 }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { order_id, order_no, payer_id, total_amount, net_amount, referrer_id } = await req.json() as {
      order_id: string; order_no: string; payer_id: string
      total_amount: number
      net_amount?: number   // 实际现金支付额（扣金豆后），未传则回退到 total_amount
      referrer_id: string | null
    }

    // 防重复：已分润的订单跳过
    const { data: ord } = await supabase.from('orders').select('commission_distributed').eq('id', order_id).maybeSingle()
    if (ord?.commission_distributed) {
      console.log('[distribute-commission] already distributed for', order_no)
      return Response.json({ success: true, skipped: true }, { headers: corsHeaders })
    }

    // 分佣基数 = 实际现金支付额（净额）；纯金豆订单 net_amount=0，直接跳过分佣
    const cashBase = toFixed4(net_amount ?? total_amount)
    if (cashBase <= 0) {
      console.log('[distribute-commission] net_amount=0 (pure gold bean order), skip commission for', order_no)
      await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)
      return Response.json({ success: true, skipped: true, reason: 'pure_gold_no_commission' }, { headers: corsHeaders })
    }

    // 让利池（基于净现金额）
    const profitPool = toFixed4(cashBase * PROFIT_POOL_RATIO)

    // 查推荐链（L1 = referrer_id, L2 = referrer的推荐人）
    const commissionRows: any[] = []
    const pointsRows: any[] = []

    let l1UserId: string | null = referrer_id
    let l2UserId: string | null = null

    if (l1UserId) {
      const { data: l1Profile } = await supabase.from('profiles')
        .select('id, member_rank, referrer_id')
        .eq('id', l1UserId).maybeSingle()

      if (l1Profile) {
        const rankKey = l1Profile.member_rank ?? '江湖散修'
        const ratio = RANK_COMMISSION[rankKey] ?? RANK_COMMISSION['江湖散修']
        const l1RawAmount = toFixed4(profitPool * ratio.l1)

        // 暂存 L1 行（待封顶调整后再 push）
        let l1Amount = l1RawAmount
        let l2Amount = 0
        let rankKey2 = ''
        let ratio2l2 = 0

        // L2
        l2UserId = (l1Profile as any).referrer_id ?? null
        if (l2UserId && l2UserId !== payer_id) {
          const { data: l2Profile } = await supabase.from('profiles')
            .select('id, member_rank').eq('id', l2UserId).maybeSingle()
          if (l2Profile) {
            rankKey2 = l2Profile.member_rank ?? '江湖散修'
            const ratio2 = RANK_COMMISSION[rankKey2] ?? RANK_COMMISSION['江湖散修']
            ratio2l2 = ratio2.l2
            l2Amount = toFixed4(profitPool * ratio2.l2)
          }
        }

        // ── 佣金封顶：L1+L2 总计不超过让利池 × 60% ──
        const commissionCap = toFixed4(profitPool * COMMISSION_CAP_RATIO)
        const rawTotal = toFixed4(l1Amount + l2Amount)
        if (rawTotal > commissionCap) {
          // 按比例压缩，保持 L1:L2 原始比值
          const scale = commissionCap / rawTotal
          l1Amount = toFixed4(l1Amount * scale)
          l2Amount = toFixed4(l2Amount * scale)
          console.log(`[distribute-commission] commission capped: raw=${rawTotal} → cap=${commissionCap} (scale=${scale.toFixed(4)})`)
        }

        commissionRows.push({
          order_id, order_no,
          beneficiary_id: l1UserId,
          payer_id,
          level: 1,
          rank_at_time: rankKey,
          ratio: ratio.l1,
          pool_amount: profitPool,
          commission_amount: l1Amount,
          b_coef: 1.0,
          status: 'pending',
        })

        if (l2UserId && l2UserId !== payer_id && l2Amount > 0) {
          commissionRows.push({
            order_id, order_no,
            beneficiary_id: l2UserId,
            payer_id,
            level: 2,
            rank_at_time: rankKey2,
            ratio: ratio2l2,
            pool_amount: profitPool,
            commission_amount: l2Amount,
            b_coef: 1.0,
            status: 'pending',
          })
        }
      }
    }

    // 消费者积分（购物返利）
    const consumerPointsYuan = toFixed4(profitPool * CONSUMER_POINTS_RATIO)
    const rawConsumerPoints = Math.floor(consumerPointsYuan / GOLD_BEAN_RATE) // 积分数量（整数）

    if (rawConsumerPoints > 0) {
      // 查当前积分余额 & 今日已获积分（防每日超限）
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const [{ data: payerProfile }, { data: todayLogs }] = await Promise.all([
        supabase.from('profiles').select('points').eq('id', payer_id).maybeSingle(),
        supabase.from('points_logs')
          .select('delta')
          .eq('user_id', payer_id)
          .eq('type', 'purchase_earn')
          .gte('created_at', todayStart.toISOString()),
      ])
      const currentPoints = payerProfile?.points ?? 0
      const todayEarned = (todayLogs ?? []).reduce((s: number, r: any) => s + (r.delta > 0 ? r.delta : 0), 0)
      const remaining = Math.max(0, DAILY_POINTS_CAP - todayEarned)
      const consumerPoints = Math.min(rawConsumerPoints, remaining)

      if (consumerPoints > 0) {
        const balanceAfter = currentPoints + consumerPoints
        await supabase.from('profiles').update({ points: balanceAfter }).eq('id', payer_id)

        pointsRows.push({
          user_id: payer_id,
          order_id,
          type: 'purchase_earn',
          delta: consumerPoints,
          balance_after: balanceAfter,
          remark: `订单${order_no}购物返积分${rawConsumerPoints > consumerPoints ? `（当日上限，实发${consumerPoints}）` : ''}`,
        })
      }
    }

    // 写佣金记录
    if (commissionRows.length > 0) {
      await supabase.from('commissions').insert(commissionRows)
    }
    // 写积分流水
    if (pointsRows.length > 0) {
      await supabase.from('points_logs').insert(pointsRows)
    }

    // 标记已分润
    await supabase.from('orders').update({ commission_distributed: true }).eq('id', order_id)

    return Response.json({
      success: true,
      profit_pool: profitPool,
      cash_base: cashBase,
      l1_commission: commissionRows.find((c: any) => c.level === 1)?.commission_amount ?? 0,
      l2_commission: commissionRows.find((c: any) => c.level === 2)?.commission_amount ?? 0,
      consumer_points: pointsRows[0]?.delta ?? 0,
    }, { headers: corsHeaders })

  } catch (err: any) {
    console.error('[distribute-commission]', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
