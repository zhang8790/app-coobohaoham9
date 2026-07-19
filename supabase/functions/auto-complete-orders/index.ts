/**
 * auto-complete-orders Edge Function —— 超时自动完成订单（货款结算兜底）
 *
 * 业务背景：
 *  - 订单进入 pending_review（用户已确认收货 / 商家已核销）后，本应等待「买家评价」或
 *    「商家确认完成」才会置 completed，进而由 trg_orders_settle 触发器自动结算货款。
 *  - 但买家常不写评价、商家也常忘记点「确认完成」，订单永久卡在 pending_review，
 *    导致商家货款无法结算、资金长期挂账（货款是商家命根子）。
 *  - 本函数作为兜底：将 pending_review 且停留超过 N 天（默认 2天）的订单自动置 completed，
 *    由 trg_orders_settle 触发器统一结算货款，无需人工干预。
 *
 * 与「商家确认即完成」的关系（两者并存，互不冲突）：
 *  - 商家在后台/小程序点「确认完成」→ 立即 completed（实时，体验最快）；
 *  - 商家不确认 → 本定时任务在 N 天后兜底 completed（防止挂账）。
 *  已 completed 的订单不会被本函数再次匹配（status 不再等于 pending_review）。
 *
 * 超时起算点：orders.verified_at
 *  - 进入 pending_review 时（confirmReceipt / merchantVerifyPickup）都会写入 verified_at，
 *    用它而非 updated_at，可避免「发货」动作刷新 updated_at 导致计时被重置。
 *
 * 触发方式（用户本机配置，沙箱无 CLI）：
 *  - Supabase Dashboard → Database → Scheduled Functions → 创建「每日 02:00」调用本函数；
 *  - 或本地 cron 定时 curl https://<project>.supabase.co/functions/v1/auto-complete-orders
 *    （需带 Authorization: Bearer <service_role | anon key>）。
 *
 * 接入前提：部署本函数即可，无需额外 Secrets（仅用 service_role key 直接改库）。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 超时天数：pending_review 停留超过该天数则自动完成。可用环境变量 AUTO_COMPLETE_DAYS 覆盖。
const AUTO_COMPLETE_DAYS = Number(Deno.env.get('AUTO_COMPLETE_DAYS') ?? '7')
// 单批处理上限，避免单次 update 过大触发超时
const BATCH_SIZE = 500

Deno.serve(async (_req: Request) => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const threshold = new Date(Date.now() - AUTO_COMPLETE_DAYS * 86400 * 1000).toISOString()

    // 仅处理「待评价」且 verified_at 早于阈值的订单（verified_at 为进入 pending_review 的时间戳）
    const { data: due, error: selErr } = await supabase
      .from('orders')
      .select('id, order_no, verified_at')
      .eq('status', 'pending_review')
      .not('verified_at', 'is', null)
      .lt('verified_at', threshold)
      .limit(BATCH_SIZE)

    if (selErr) throw selErr
    if (!due || due.length === 0) {
      return Response.json(
        { ok: true, completed: 0, threshold_days: AUTO_COMPLETE_DAYS, message: '无超时待完成订单' },
        { headers: corsHeaders },
      )
    }

    const ids = (due as Array<{ id: string }>).map((o) => o.id)
    const { error: updErr } = await supabase
      .from('orders')
      .update({ status: 'completed', paid_at: new Date().toISOString() })
      .in('id', ids)

    if (updErr) throw updErr

    // 触发器 trg_orders_settle 会在每行 update 时自动结算货款到 stores.merchant_balance
    return Response.json(
      {
        ok: true,
        completed: ids.length,
        threshold_days: AUTO_COMPLETE_DAYS,
        orders: (due as Array<{ order_no: string | null }>).map((o) => o.order_no),
        message: `已将 ${ids.length} 笔超时订单自动置为已完成，货款由触发器自动结算`,
      },
      { headers: corsHeaders },
    )
  } catch (e: any) {
    console.error('[auto-complete-orders]', e?.message ?? e)
    return Response.json({ ok: false, error: e?.message ?? '处理失败' }, { status: 500, headers: corsHeaders })
  }
})
