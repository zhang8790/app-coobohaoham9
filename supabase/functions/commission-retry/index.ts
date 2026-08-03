/**
 * commission-retry Edge Function
 * 扫描「待补跑」订单（commission_distributed=false 且 commission_error 非空 且 重试次数<3），
 * 重跑 distribute-commission；成功后清除 commission_error，失败递增 commission_retry_count。
 *
 * 复用 distribute-commission 自身逻辑（server-to-server invoke），天然幂等。
 * 每日由 pg_cron 触发（见迁移 00222）；亦可手动 curl 补跑。
 *
 * 调用：curl -X POST .../functions/v1/commission-retry -H "Authorization: Bearer <anon>" \
 *        -H "Content-Type: application/json" -d '{"limit":50}'
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { limit = 50 } = await req.json().catch(() => ({ limit: 50 })) as { limit?: number }

    const { data: pending, error: pErr } = await supabase
      .from('orders')
      .select('id, order_no, commission_retry_count')
      .eq('commission_distributed', false)
      .not('commission_error', 'is', null)
      .lt('commission_retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(Math.min(limit, 200))

    if (pErr) throw new Error(`扫描待补跑订单失败: ${pErr.message}`)

    let retried = 0
    let ok = 0
    let failed = 0

    for (const o of pending ?? []) {
      retried++
      let success = false
      let errMsg = ''

      try {
        const r = await supabase.functions.invoke('distribute-commission', {
          body: { order_id: o.id },
        })
        if (r.error) {
          errMsg = (r.error as any)?.message ?? 'invoke 返回 error'
        } else {
          // 确认是否已分佣
          const { data: after } = await supabase
            .from('orders')
            .select('commission_distributed')
            .eq('id', o.id)
            .maybeSingle()
          success = after?.commission_distributed === true
          if (!success) errMsg = 'invoke 成功返回，但 commission_distributed 仍为 false'
        }
      } catch (e: any) {
        errMsg = e?.message ?? 'invoke 异常'
      }

      await supabase
        .from('orders')
        .update({
          commission_retry_count: (o.commission_retry_count ?? 0) + 1,
          commission_error: success ? null : (errMsg || o.commission_error),
        })
        .eq('id', o.id)

      if (success) ok++
      else failed++
    }

    if (failed > 0) {
      await supabase.functions.invoke('biz-alert', {
        body: {
          level: 'error',
          title: `分佣自动补跑仍有 ${failed} 单失败`,
          content:
            `本次扫描 ${pending?.length ?? 0} 单，已重试 ${retried} 单，成功 ${ok}，仍失败 ${failed}。` +
            `失败单已达重试上限或持续异常，请排查 distribute-commission。`,
          source: 'commission-retry',
          tags: { retried, ok, failed },
        },
      }).then(() => {}, (e: any) => console.warn('[commission-retry] 告警失败', e?.message))
    }

    return Response.json({ success: true, scanned: pending?.length ?? 0, retried, ok, failed }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[commission-retry] error:', err?.message)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
