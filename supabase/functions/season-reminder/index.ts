/**
 * season-reminder Edge Function —— 智能换季提醒
 * ------------------------------------------------------------
 * 业务：节气切换前 3 天，给小程序用户推一条「换季了，饮食该调整了」的站内通知，
 *       一键跳「今日食养推荐」(pages/food/today-food-therapy/index)。
 *
 * 设计（照抄 expiry-engine / auto-complete-orders / send-notification 范式）：
 *   - Deno Edge Function，service_role 直写库，无额外 Secrets
 *   - 内嵌 2026 年 24 节气起算表（与前端 src/utils/seasonal-box.ts 同源节气体）
 *   - 命中「距下一节气 1~3 天」窗口才推；按 (user_id, term_key) 7 天内去重，每节气每人至多 1 条
 *   - 广播给全部 profiles（与 send-notification 广播同语义）；消息中心/红点零改动
 *   - 可 ?dryRun=1 预览不落库；?termKey=xxx 强制指定节气（便于联调）
 *
 * 调度（沿用项目惯例，与 expiry-engine / auto-complete-orders 一致）：
 *   Supabase Dashboard → Database → Scheduled Functions → 新建「每日 08:00」调用本函数
 *   （底层 pg_cron）。本迁移 00217 末尾附可选的 cron.schedule SQL，按需执行。
 *
 * 合规：食养提醒，非医疗诊断；文案仅做「饮食调整建议」，不承诺疗效。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ 2026 节气起算表（与前端 seasonal-box.ts 同源；2027 需更新）============
interface TermSeed {
  key: string
  name: string
  start: string // YYYY-MM-DD
  nature: string // 食养主方向
  principle: string // 一句话食养原则
}
const TERMS_2026: TermSeed[] = [
  { key: 'xiaohan', name: '小寒', start: '2026-01-05', nature: '温补', principle: '寒气正盛，宜温补驱寒，忌生冷寒凉伤阳气。' },
  { key: 'dahan', name: '大寒', start: '2026-01-20', nature: '温补', principle: '一年最冷，温肾壮阳、温中健脾的最后时机。' },
  { key: 'lichun', name: '立春', start: '2026-02-04', nature: '平润', principle: '阳气始发，宜清淡升发，不宜大温大补。' },
  { key: 'yushui', name: '雨水', start: '2026-02-19', nature: '健脾', principle: '春雨绵绵，宜健脾祛湿，少食油腻生冷。' },
  { key: 'jingzhe', name: '惊蛰', start: '2026-03-06', nature: '清热', principle: '春雷惊醒，宜清肝润肺，忌辛辣刺激。' },
  { key: 'chunfen', name: '春分', start: '2026-03-21', nature: '平润', principle: '昼夜平分，饮食宜平和，以平为期。' },
  { key: 'qingming', name: '清明', start: '2026-04-05', nature: '平润', principle: '天清气明，宜疏肝清心，忌动怒伤肝。' },
  { key: 'guyu', name: '谷雨', start: '2026-04-20', nature: '健脾', principle: '雨生百谷，湿气最重，宜健脾祛湿。' },
  { key: 'xiaoman', name: '小满', start: '2026-05-21', nature: '清热', principle: '天气渐热，宜清热利湿、健脾和胃。' },
  { key: 'mangzhong', name: '芒种', start: '2026-06-06', nature: '清热', principle: '仲夏开始，宜清热解暑、生津止渴。' },
  { key: 'xiazhi', name: '夏至', start: '2026-06-21', nature: '清热', principle: '阳极阴生，宜清补养心、健脾祛湿。' },
  { key: 'xiaoshu', name: '小暑', start: '2026-07-07', nature: '清热', principle: '暑气初起，宜清热解暑、健脾利湿。' },
  { key: 'dashu', name: '大暑', start: '2026-07-23', nature: '清热', principle: '一年最热，宜清热养阴、生津止渴。' },
  { key: 'liqiu', name: '立秋', start: '2026-08-08', nature: '平润', principle: '秋意初起，宜润燥养肺、清补平补。' },
  { key: 'chushu', name: '处暑', start: '2026-08-23', nature: '润燥', principle: '暑气消退，宜养阴润燥、少辛多酸。' },
  { key: 'bailu', name: '白露', start: '2026-09-08', nature: '平润', principle: '露凝而白，宜滋阴润肺、忌寒凉伤脾。' },
  { key: 'qiufen', name: '秋分', start: '2026-09-23', nature: '平润', principle: '昼夜平分，宜平补养肺、健脾和胃。' },
  { key: 'hanlu', name: '寒露', start: '2026-10-08', nature: '润燥', principle: '露气寒冷，宜养阴润燥、健脾益气。' },
  { key: 'shuangjiang', name: '霜降', start: '2026-10-24', nature: '温补', principle: '秋末冬近，宜补益气血、健脾和胃。' },
  { key: 'lidong', name: '立冬', start: '2026-11-08', nature: '温补', principle: '冬季开始，宜温补肾阳、健脾养胃。' },
  { key: 'xiaoxue', name: '小雪', start: '2026-11-22', nature: '温补', principle: '雪意初显，宜温补脾肾、驱寒暖身。' },
  { key: 'daxue', name: '大雪', start: '2026-12-07', nature: '温补', principle: '大雪封地，宜大补温阳、驱寒暖肾。' },
]

const JUMP_PAGE = 'pages/food/today-food-therapy/index'
// 触发窗口：距下一节气 1~3 天时推（"前3天"语义，含当天前1天缓冲）
const REMIND_BEFORE_DAYS = 3

function daysUntil(dateStr: string, now: Date): number {
  const start = new Date(dateStr + 'T00:00:00')
  const diff = start.getTime() - now.getTime()
  return Math.ceil(diff / 86400000)
}

function findNextTerm(now: Date, forceKey?: string | null): TermSeed | null {
  if (forceKey) return TERMS_2026.find((t) => t.key === forceKey) ?? null
  for (const t of TERMS_2026) {
    if (daysUntil(t.start, now) >= 0) return t
  }
  return TERMS_2026[0] ?? null
}

// ============ 主流程 ============
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const forceKey = url.searchParams.get('termKey')
  const now = new Date()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const term = findNextTerm(now, forceKey)
    if (!term) {
      return Response.json({ success: true, sent: 0, message: '无可用节气数据' }, { headers: corsHeaders })
    }

    const dLeft = daysUntil(term.start, now)
    const inWindow = dLeft >= 1 && dLeft <= REMIND_BEFORE_DAYS
    if (!inWindow && !forceKey) {
      return Response.json(
        {
          success: true,
          sent: 0,
          term: term.key,
          days_left: dLeft,
          message: `距【${term.name}】还有 ${dLeft} 天，未进入前${REMIND_BEFORE_DAYS}天提醒窗口`,
        },
        { headers: corsHeaders },
      )
    }

    // 该节气 7 天内已收到通知的用户（去重，每节气每人至多 1 条）
    const { data: already, error: dupErr } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'season_reminder')
      .eq('payload->>term_key', term.key)
      .gt('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
    if (dupErr) throw new Error(`查重失败: ${dupErr.message}`)
    const dupSet = new Set(((already as Array<{ user_id: string }>) ?? []).map((r) => r.user_id))

    // 全量用户（与 send-notification 广播同语义）
    const { data: users, error: usrErr } = await supabase
      .from('profiles')
      .select('id, openid')
      .limit(20000)
    if (usrErr) throw new Error(`查用户失败: ${usrErr.message}`)

    const title = `3天后迎来【${term.name}】，饮食该调整了`
    const body = `${term.name}（${term.nature}）将至：${term.principle} 点此查看今日食养推荐 →`
    const payload = {
      term_key: term.key,
      term_name: term.name,
      nature: term.nature,
      days_to_term: dLeft,
      jump_page: JUMP_PAGE,
    }

    const stats = { total: (users as any[])?.length ?? 0, sent: 0, skipped_dup: 0, skipped_no_id: 0 }
    const inserted: any[] = []

    for (const u of (users as any[]) ?? []) {
      if (!u.id) {
        stats.skipped_no_id++
        continue
      }
      if (dupSet.has(u.id)) {
        stats.skipped_dup++
        continue
      }
      if (dryRun) {
        inserted.push({ user_id: u.id, title, body, payload })
        stats.sent++
        continue
      }
      const { data: notif, error: insErr } = await supabase
        .from('notifications')
        .insert({
          user_id: u.id,
          type: 'season_reminder',
          title,
          body,
          payload,
        })
        .select('id')
        .maybeSingle()
      if (insErr) {
        console.warn('[season-reminder] 写通知失败', u.id, insErr.message)
        continue
      }
      inserted.push(notif)
      stats.sent++
    }

    return Response.json(
      {
        success: true,
        dry_run: dryRun,
        term: term.key,
        days_left: dLeft,
        stats,
        sample: inserted.slice(0, 3),
      },
      { headers: corsHeaders },
    )
  } catch (err) {
    const msg = (err as Error).message
    console.error('[season-reminder] error:', msg)
    return Response.json({ success: false, error: msg }, { status: 500, headers: corsHeaders })
  }
})
