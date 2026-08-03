/**
 * biz-alert Edge Function
 * 业务告警统一出口：写 alert_logs 表 + 可选推企微机器人（ALERT_WEBHOOK_URL 环境变量）。
 * 无 webhook 配置时仅落库，不报错（no-op 降级），保证调用方永远成功。
 *
 * 调用：supabase.functions.invoke('biz-alert', {
 *   body: { level: 'critical'|'error'|'warning'|'info', title, content, source?, tags? }
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
    const { level = 'warning', title, content, source = 'system', tags = {} } =
      await req.json() as {
        level?: string
        title?: string
        content?: string
        source?: string
        tags?: Record<string, unknown>
      }

    if (!title || !content) {
      return Response.json({ error: 'title / content 必填' }, { status: 400, headers: corsHeaders })
    }

    // 1) 落库
    const { data: row, error: insErr } = await supabase
      .from('alert_logs')
      .insert({ level, title, content, source, tags })
      .select('id')
      .maybeSingle()
    if (insErr) throw new Error(`写 alert_logs 失败: ${insErr.message}`)

    // 2) 推企微机器人（可选）
    const webhook = Deno.env.get('ALERT_WEBHOOK_URL') ?? ''
    let notified = false
    if (webhook) {
      try {
        const resp = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
              content:
                `## ⚠️ 运营告警：${title}\n` +
                `> **级别**：${level}\n> **来源**：${source}\n\n${content}`,
            },
          }),
        })
        notified = resp.ok
      } catch (e: any) {
        console.warn('[biz-alert] webhook 推送失败:', e?.message)
      }
    }

    if (row?.id) {
      await supabase.from('alert_logs').update({ notified }).eq('id', row.id)
    }

    return Response.json({ success: true, alert_id: row?.id, notified }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[biz-alert] error:', err?.message)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
