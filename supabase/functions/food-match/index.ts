// food-match Edge Function
// ------------------------------------------------------------
// 模块三·食疗人群匹配算法引擎（核心变现壁垒）
// 输入：{ user_tags: string[], product_ids?: string[], store_id?: string, limit?: number }
//   - user_tags:   用户勾选的食疗标签（food_tag_rules.tag_key）
//   - product_ids: 指定商品集合（推荐专区/家庭档案推送用）
//   - store_id:    指定门店，自动取该门店在售且已分析过的商品
// 流程：加载 food_tag_rules + 各商品最新 food_analysis_reports → 复用适配分算法 →
//       按 0-100 适配分排序 → 返回推荐列表（含 tier / reasons / safe_level）
// 合规铁律：仅做「配料匹配筛选 / 饮食选购参考」，绝不输出诊断/治疗/疗效承诺。
// 复用 ingredient-analyze 的评分口径，保证两处一致。

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

// 适配分：用户标签 × 商品安全报告。返回 { score(0-100), tier, reasons[] }
function computeMatch(
  tagRules: any[],
  userTags: string[],
  report: { additive_list?: any[]; parsed_ingredients?: string[]; allergen_list?: any[]; crowd_tips?: string[] },
  userAllergies: string[] = [],
): { score: number; tier: string; reasons: string[] } {
  const rows = (tagRules || []).filter((r) => userTags.includes(r.tag_key))
  if (!rows.length) return { score: 50, tier: 'caution', reasons: [] }
  let score = 50
  const reasons: string[] = []
  const additiveList: any[] = report.additive_list || []
  const additiveNames = additiveList.map((a) => a.name)
  const allIng = new Set<string>([...(report.parsed_ingredients || []), ...additiveNames])

  for (const r of rows) {
    const pref = (r.prefer_ingredients || []) as string[]
    const avoid = (r.avoid_ingredients || []) as string[]
    const wp = Number(r.weight_prefer) || 15
    const wa = Number(r.weight_avoid) || 25
    for (const p of pref) {
      if ([...allIng].some((c) => c.includes(p) || p.includes(c))) {
        score += wp
        reasons.push(`含「${p}」契合${r.label}`)
      }
    }
    for (const a of avoid) {
      const hit = additiveList.find((x: any) => (x.name || '').includes(a) || a.includes(x.name || ''))
      const inParsed = [...allIng].some((c) => c.includes(a) || a.includes(c))
      if (!hit && !inParsed) continue // 未实际检出该规避项：不扣分、不提示（合规，不夸大）
      const penalty = hit
        ? hit.level === 'high_risk' ? 40 : hit.level === 'limit' ? wa : 12
        : 8
      score -= penalty
      reasons.push(`检出「${a}」与${r.label}相悖`)
    }
  }
  // 过敏原硬冲突（结合用户画像过敏史）
  const allergenList: any[] = report.allergen_list || []
  for (const al of allergenList) {
    if (userAllergies.includes(al.key) || userAllergies.includes(al.name)) {
      score -= 40
      reasons.push(`含过敏原「${al.name}」与您的过敏史冲突`)
    }
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  const tier = score >= 85 ? 'recommend' : score >= 30 ? 'caution' : 'avoid'
  return { score, tier, reasons: reasons.slice(0, 6) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const userTags: string[] = body.user_tags || []
    const productIds: string[] | undefined = body.product_ids || undefined
    const storeId: string | undefined = body.store_id || undefined
    const userId: string | undefined = body.user_id || undefined
    const limit: number = Math.min(Math.max(Number(body.limit) || 20, 1), 100)

    if (!userTags.length) return json({ success: false, error: '请至少勾选一个食疗标签' }, 400)
    if (!productIds && !storeId) {
      return json({ success: false, error: '需提供 product_ids 或 store_id 以确定推荐范围' }, 400)
    }

    // 标签规则
    const { data: tagRules } = await supabase
      .from('food_tag_rules').select('*').eq('status', 'active')

    // 用户过敏史（用于过敏原硬冲突）
    let userAllergies: string[] = []
    if (userId) {
      const { data: prof } = await supabase
        .from('user_health_profile').select('allergies').eq('user_id', userId).maybeSingle()
      userAllergies = (prof?.allergies as string[]) || []
    }

    // 确定商品集合
    let targetIds: string[] = []
    if (productIds && productIds.length) {
      targetIds = productIds
    } else if (storeId) {
      // 注：products 表无 status 列，在售态由 is_active 布尔表示
      const { data: prods } = await supabase
        .from('products').select('id').eq('store_id', storeId).eq('is_active', true)
      targetIds = (prods || []).map((p: any) => p.id)
    }
    if (!targetIds.length) return json({ success: true, items: [] })

    // 取每个商品最新一份报告
    const { data: reports } = await supabase
      .from('food_analysis_reports')
      .select('product_id, additive_list, parsed_ingredients, allergen_list, crowd_tips, safe_level, safe_level_code, main_conclusion')
      .in('product_id', targetIds)
      .order('created_at', { ascending: false })

    // 仅保留每个 product_id 的最新一条
    const latestByProduct = new Map<string, any>()
    for (const r of (reports || []) as any[]) {
      if (!latestByProduct.has(r.product_id)) latestByProduct.set(r.product_id, r)
    }

    const items: any[] = []
    for (const pid of targetIds) {
      const rep = latestByProduct.get(pid)
      if (!rep) continue
      const m = computeMatch(tagRules as any[], userTags, rep, userAllergies)
      items.push({
        product_id: pid,
        score: m.score,
        tier: m.tier,
        reasons: m.reasons,
        safe_level: rep.safe_level,
        safe_level_code: rep.safe_level_code,
      })
    }
    items.sort((a, b) => b.score - a.score)

    return json({
      success: true,
      count: items.length,
      items: items.slice(0, limit),
    })
  } catch (e: any) {
    console.error('[food-match] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
