// ocr-ingredient Edge Function
// ------------------------------------------------------------
// 配料表 OCR 识别引擎（百度 OCR 高精度版）
//
// 输入：{ task_id }  —— 前端 createIngredientOcrTask 拿到 id 后传入
// 流程：读任务图片 → 百度 OCR 识别 → 解析配料名 → 匹配 food_additives 安全库
//       → 初算安全评级 S/A/C → 回填 ingredient_ocr_tasks → 返回结果
//
// 降级：未配置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 时返回明确错误，
//       前端据此提示改用文本输入，不静默失败。
//
// 风格对齐本仓库 food-therapy-ai：jsr import、Deno.serve、corsHeaders、
// try/catch 兜底（异常带错误体，便于排查）。C 端游客可触发，故不强制鉴权。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: any, status = 200, headers = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const BAIDU_OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic'

let baiduTokenCache: { token: string; exp: number } | null = null

async function getBaiduToken(): Promise<string> {
  const apiKey = Deno.env.get('BAIDU_OCR_API_KEY')
  const secretKey = Deno.env.get('BAIDU_OCR_SECRET_KEY')
  if (!apiKey || !secretKey) {
    throw new Error('百度OCR未配置(BAIDU_OCR_API_KEY/BAIDU_OCR_SECRET_KEY)')
  }
  if (baiduTokenCache && baiduTokenCache.exp > Date.now() + 60_000) return baiduTokenCache.token
  const resp = await fetch(
    `${BAIDU_TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (!resp.ok) throw new Error(`百度token获取失败 HTTP ${resp.status}`)
  const j = await resp.json()
  if (!j.access_token) throw new Error(`百度token异常: ${JSON.stringify(j)}`)
  baiduTokenCache = {
    token: j.access_token,
    exp: Date.now() + (Number(j.expires_in) || 2_592_000) * 1000,
  }
  return j.access_token
}

async function ocrImage(base64: string): Promise<string[]> {
  const token = await getBaiduToken()
  const resp = await fetch(`${BAIDU_OCR_URL}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image: base64, language_type: 'CHN_ENG' }).toString(),
  })
  if (!resp.ok) throw new Error(`百度OCR HTTP ${resp.status}`)
  const j = await resp.json()
  if (j.error_code) throw new Error(`百度OCR错误 ${j.error_code}: ${j.error_msg}`)
  return (j.words_result || []).map((w: any) => String(w.words || '')).filter(Boolean)
}

// 把 OCR 多行文本拆成候选配料词（按中英文标点/空白切分，过滤纯数字与过短串）
function parseIngredients(lines: string[]): string[] {
  const raw = lines.join('\n')
  const delim = /[，,、；;。.\n\r\s（）()【】\[\]「」]+/
  const parts = raw.split(delim).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (p.length < 2) continue
    if (/^[\d.\s%]+$/.test(p)) continue
    out.push(p)
  }
  return [...new Set(out)]
}

type Additive = { id: string; name: string; risk_level: string; category: string | null }

async function matchAdditives(
  supabase: any,
  candidates: string[],
): Promise<{ matched: string[]; grade: 'S' | 'A' | 'C'; riskFlags: string[] }> {
  const { data: adds } = await supabase
    .from('food_additives')
    .select('id,name,risk_level,category')
  const list = (adds || []) as Additive[]
  const byName = new Map<string, Additive>()
  const idMap = new Map<string, Additive>()
  for (const a of list) {
    byName.set(a.name, a)
    idMap.set(a.id, a)
  }

  const { data: aliases } = await supabase
    .from('food_additive_aliases')
    .select('alias,additive_id')
  const aliasToId = new Map<string, string>()
  for (const al of (aliases || []) as { alias: string; additive_id: string }[]) {
    aliasToId.set(al.alias, al.additive_id)
  }

  const matched = new Set<string>()
  const hitLevels: string[] = []
  const riskFlags: string[] = []

  for (const c of candidates) {
    let hit: Additive | undefined = byName.get(c)
    // 包含关系（如「山梨酸钾」命中「山梨酸钾防腐剂」或反之）
    if (!hit) {
      for (const a of list) {
        if (c.includes(a.name) || a.name.includes(c)) {
          hit = a
          break
        }
      }
    }
    // 别名命中 → 反查添加剂
    if (!hit && aliasToId.has(c)) {
      const a2 = idMap.get(aliasToId.get(c)!)
      if (a2) hit = a2
    }
    if (hit) {
      matched.add(hit.name)
      hitLevels.push(hit.risk_level)
      if (hit.risk_level === 'black') riskFlags.push(`${hit.name}(婴幼儿禁用/严控)`)
      else if (hit.risk_level === 'yellow') riskFlags.push(`${hit.name}(限量使用)`)
    }
  }

  let grade: 'S' | 'A' | 'C' = 'S'
  if (hitLevels.includes('black')) grade = 'C'
  else if (hitLevels.includes('yellow')) grade = 'A'

  return { matched: [...matched], grade, riskFlags }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const taskId: string | undefined = body.task_id
    if (!taskId) return json({ success: false, error: '缺少 task_id' }, 400)

    const { data: task, error: taskErr } = await supabase
      .from('ingredient_ocr_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle()
    if (taskErr) throw new Error(`读取任务失败: ${taskErr.message}`)
    if (!task) return json({ success: false, error: '任务不存在' }, 404)

    // 幂等：已处理过的任务直接返回既有结果，避免重复烧 OCR 额度
    if (task.status !== 'pending') {
      return json({
        success: true,
        already: true,
        status: task.status,
        raw_text: task.raw_text,
        parsed_ingredients: task.parsed_ingredients,
        matched_additives: task.matched_additives,
        safety_grade: task.safety_grade,
        risk_flags: task.risk_flags,
      })
    }

    // 下载配料表图片（带 service_role 授权头，兼容非公开 bucket；不依赖 bucket 公开设置）
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const imgResp = await fetch(task.image_url, {
      headers: { Authorization: `Bearer ${serviceRole}` },
    })
    if (!imgResp.ok) throw new Error(`图片下载失败 HTTP ${imgResp.status}`)
    const buf = new Uint8Array(await imgResp.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
    const base64 = btoa(binary)

    const words = await ocrImage(base64)
    const candidates = parseIngredients(words)
    const { matched, grade, riskFlags } = await matchAdditives(supabase, candidates)

    const { error: updErr } = await supabase
      .from('ingredient_ocr_tasks')
      .update({
        raw_text: words.join('\n'),
        parsed_ingredients: candidates,
        matched_additives: matched,
        safety_grade: grade,
        risk_flags: riskFlags,
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (updErr) throw new Error(`更新任务失败: ${updErr.message}`)

    return json({
      success: true,
      raw_text: words.join('\n'),
      parsed_ingredients: candidates,
      matched_additives: matched,
      safety_grade: grade,
      risk_flags: riskFlags,
    })
  } catch (e: any) {
    console.error('[ocr-ingredient] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
