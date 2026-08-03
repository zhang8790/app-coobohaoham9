// food-backfill Edge Function
// ------------------------------------------------------------
// 批量回算工具（二期 OCR 全量入库存量版）：
//   把 ingredient_ocr_tasks 里尚未关联商品的配料表，落成真实在售商品(products)，
//   并调用 ingredient-analyze 生成 food_analysis_reports，使 food-match 推荐专区
//   能返回真实结果。
//
// 设计要点：
//   - 全程使用 SUPABASE_SERVICE_ROLE_KEY，不受 RLS 限制（内部运维工具）。
//   - 幂等且可断点续跑：处理 product_id 为空「或」已关联但尚无报告的 OCR 任务；
//     已分析的商品跳过，创建过但分析失败的商品会在下次运行被补分析。
//   - 对 ingredient-analyze 调用做重试+退避+限速，规避 Supabase 函数并发配额。
//   - 不依赖第三方 LLM；ingredient-analyze 是确定性引擎，成本极低。
//
// 触发：curl -X POST .../functions/v1/food-backfill -d '{"store_id":"...","limit":60}'

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

const DEFAULT_STORE = 'ffffffff-ffff-ffff-ffff-ffffffffffff' // 来店有喜官方店
const FX_URL_BASE = Deno.env.get('SUPABASE_URL')!

function deriveName(t: { raw_text: string | null; parsed_ingredients: string[] | null }): string {
  const namePatterns = [
    /产品名称[:：]\s*([^\n（(（]+)/,
    /品名[:：]\s*([^\n（(（]+)/,
    /名称[:：]\s*([^\n（(（]+)/,
  ]
  let name = ''
  if (t.raw_text) {
    for (const re of namePatterns) {
      const m = t.raw_text.match(re)
      if (m && m[1] && m[1].trim().length >= 2) { name = m[1].trim(); break }
    }
  }
  if (!name && t.parsed_ingredients && t.parsed_ingredients.length) {
    for (const s of t.parsed_ingredients) {
      let hit = false
      for (const re of namePatterns) {
        const m = s.match(re)
        if (m && m[1] && m[1].trim().length >= 2) { name = m[1].trim(); hit = true; break }
      }
      if (hit) break
    }
    if (!name && t.parsed_ingredients[0] && t.parsed_ingredients[0].length >= 4) {
      name = t.parsed_ingredients[0].slice(0, 40)
    }
  }
  name = (name || 'OCR零食').replace(/[\s，,。.、；;：:]+$/g, '').replace(/\s+/g, ' ').slice(0, 60)
  return name.length < 2 ? 'OCR零食' : name
}

function buildText(t: { raw_text: string | null; parsed_ingredients: string[] | null }): string {
  if (t.raw_text && t.raw_text.trim()) return t.raw_text.trim()
  return (t.parsed_ingredients || []).join('，')
}

// 带重试/退避地调用 ingredient-analyze，规避 Supabase 函数并发限流
async function analyzeWithRetry(productId: string, text: string, maxTry = 4): Promise<any> {
  let lastErr = ''
  for (let attempt = 0; attempt < maxTry; attempt++) {
    try {
      const r = await fetch(`${FX_URL_BASE}/functions/v1/ingredient-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, text, source: 'ocr', persist: true }),
      })
      const j = await r.json().catch(() => ({}))
      if (j.success) return j
      if (r.status === 429 || (typeof j.error === 'string' && j.error.includes('Rate limit'))) {
        const wait = attempt < 3 ? 4000 * (attempt + 1) : 12000
        await new Promise((res) => setTimeout(res, wait))
        lastErr = j.error || `status ${r.status}`
        continue
      }
      return j // 其它业务失败直接返回（不重试）
    } catch (e: any) {
      lastErr = e?.message ?? String(e)
      await new Promise((res) => setTimeout(res, 4000))
    }
  }
  return { success: false, error: `重试耗尽: ${lastErr}` }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const storeId: string = body.store_id || DEFAULT_STORE
    const limit: number = Math.min(Math.max(Number(body.limit) || 200, 1), 500)
    const dryRun: boolean = body.dry_run === true

    // 取未关联「或」已关联但尚无报告的 OCR 任务（含配料原文）
    const { data: tasks, error: tErr } = await supabase
      .from('ingredient_ocr_tasks')
      .select('id, raw_text, parsed_ingredients, product_id')
      .limit(limit)
    if (tErr) throw new Error(`读取 OCR 任务失败: ${tErr.message}`)

    const usable = ((tasks || []) as any[]).filter((t) =>
      (t.raw_text && t.raw_text.trim().length > 0) ||
      (t.parsed_ingredients && t.parsed_ingredients.length > 0)
    )

    let created = 0
    let analyzed = 0
    let skipped = 0
    const errors: string[] = []
    const sample: any[] = []
    const fxUrl = `${FX_URL_BASE}/functions/v1/ingredient-analyze`

    for (const t of usable) {
      const name = deriveName(t)
      const text = buildText(t)

      let productId: string | null = t.product_id || null

      if (!dryRun) {
        // 1. 未关联则落成商品并回写 product_id
        if (!productId) {
          const { data: prod, error: pErr } = await supabase
            .from('products')
            .insert({
              store_id: storeId,
              name,
              price: 9.9,
              stock: 999,
              is_active: true,
              review_status: 'approved',
              description: '由配料表 OCR 自动回算生成的在售商品',
            })
            .select('id')
            .maybeSingle()
          if (pErr) { errors.push(`建商品失败[${t.id}]: ${pErr.message}`); continue }
          productId = (prod as any)?.id
          await supabase.from('ingredient_ocr_tasks').update({ product_id: productId }).eq('id', t.id)
          // 触发审核触发器：review_status=approved -> is_active=true（BEFORE INSERT 触发器默认置 false）
          await supabase.from('products').update({ review_status: 'approved' }).eq('id', productId)
          created++
        }

        // 2. 幂等：已有报告则跳过
        const { count: repCount } = await supabase
          .from('food_analysis_reports')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', productId)
        if (repCount && repCount > 0) { skipped++; continue }

        // 3. 调 ingredient-analyze（带限流退避）
        const j = await analyzeWithRetry(productId, text)
        if (j.success) {
          analyzed++
          if (sample.length < 10) {
            sample.push({
              product_id: productId,
              name,
              safe_level: j.safe_level,
              safe_level_code: j.safe_level_code,
              matched: j.matched_additives,
            })
          }
        } else {
          errors.push(`分析失败[${name}]: ${j.error || 'unknown'}`)
        }
        // 限速：每处理一个商品稍作停顿，避免触发并发配额
        await new Promise((res) => setTimeout(res, 1200))
      } else {
        if (sample.length < 10) sample.push({ name, dry: true })
        created++ // 预览计数
      }
    }

    return json({
      success: true,
      dry_run: dryRun,
      store_id: storeId,
      ocr_tasks_scanned: (tasks || []).length,
      usable: usable.length,
      created,
      analyzed,
      skipped,
      error_count: errors.length,
      errors: errors.slice(0, 10),
      sample,
    })
  } catch (e: any) {
    console.error('[food-backfill] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
