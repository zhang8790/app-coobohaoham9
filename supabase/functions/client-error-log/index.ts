/**
 * client-error-log Edge Function
 * 接收小程序端 / admin-web 上报的前端错误，集中写入 error_logs 表。
 * 前端不直接写表（避免暴露 service_role），统一经此 EF（service_role 落库）。
 *
 * 调用：supabase.functions.invoke('client-error-log', {
 *   body: { source: 'mini_app'|'admin', level?, message, stack?, ctx?, user_id? }
 * })
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
    const { source = 'mini_app', level = 'error', message, stack, ctx = {}, user_id } =
      await req.json() as {
        source?: string
        level?: string
        message?: string
        stack?: string
        ctx?: Record<string, unknown>
        user_id?: string
      }

    if (!message) {
      return Response.json({ error: 'message 必填' }, { status: 400, headers: corsHeaders })
    }

    const { data, error: insErr } = await supabase
      .from('error_logs')
      .insert({
        source,
        level,
        message: String(message).slice(0, 4000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        ctx,
        user_id: user_id ?? null,
      })
      .select('id')
      .maybeSingle()
    if (insErr) throw new Error(`写 error_logs 失败: ${insErr.message}`)

    return Response.json({ success: true, id: data?.id }, { headers: corsHeaders })
  } catch (err: any) {
    // 错误日志本身失败只记录，不向外抛（避免前端循环）
    console.error('[client-error-log] error:', err?.message)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
