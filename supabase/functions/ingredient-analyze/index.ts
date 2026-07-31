// ingredient-analyze Edge Function
// ------------------------------------------------------------
// 食品配料安全管理系统 · 规范分析引擎（模块 2/3/4/5 的权威后端）
//
// 输入：{ text?, ocr_task_id?, product_id?, user_id?, source? }
//   - text:        手动录入的配料文本（MVP 主力入口）
//   - ocr_task_id: 已存在的配料表 OCR 任务（ocr-ingredient 产出），复用其 parsed_ingredients
//   - product_id:  分析完成后绑定到商品详情页
//   - user_id:     可选，结合 user_health_profile 做个性化健康短板提示
//
// 流程：清洗 → 匹配三库(food_additives[含别名] / food_allergens / food_crowd_triggers)
//       → 计算 4 档安全评级 → 组装用户规格的标准 JSON → 持久化 food_analysis_reports
//
// 输出（完全对齐用户规格）：
//   { safe_level, main_conclusion, health_shortboard_tip, additive_list, crowd_tips, report_id }
//
// 风格对齐本仓库：jsr import、Deno.serve、corsHeaders、try/catch 兜底。
// 合规铁律：全程"食养/膳食调理"参考，绝不输出诊断/治疗/疗效承诺。

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

// 风险等级映射：DB 的 white/yellow/black → 标准 JSON 的 safe/limit/high_risk
function toLevel(risk: string | null): 'safe' | 'limit' | 'high_risk' {
  if (risk === 'black') return 'high_risk'
  if (risk === 'yellow') return 'limit'
  return 'safe'
}

// 清洗：按中英文标点/空白拆分，过滤纯数字与过短串（复用 ocr-ingredient 的解析逻辑）
function parseIngredients(raw: string): string[] {
  const delim = /[，,、；;。.\n\r\s（）()【】\[\]「」]+/
  const parts = (raw || '').split(delim).map((s: string) => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (p.length < 2) continue
    if (/^[\d.\s%]+$/.test(p)) continue
    out.push(p)
  }
  return [...new Set(out)]
}

type Additive = {
  id: string
  name: string
  category: string | null
  risk_level: string
  gb_std: string | null
  risk_desc: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const text: string | undefined = body.text || undefined
    const ocrTaskId: string | undefined = body.ocr_task_id || undefined
    const productId: string | undefined = body.product_id || undefined
    const userId: string | undefined = body.user_id || undefined
    const source: string = body.source || (ocrTaskId ? 'ocr' : 'manual')

    // ---------- 1. 取得候选配料名 ----------
    let candidates: string[] = []
    if (text) {
      candidates = parseIngredients(text)
    } else if (ocrTaskId) {
      const { data: task, error } = await supabase
        .from('ingredient_ocr_tasks')
        .select('parsed_ingredients, raw_text')
        .eq('id', ocrTaskId)
        .maybeSingle()
      if (error) throw new Error(`读取 OCR 任务失败: ${error.message}`)
      if (!task) return json({ success: false, error: 'OCR 任务不存在' }, 404)
      candidates = (task.parsed_ingredients && task.parsed_ingredients.length
        ? task.parsed_ingredients
        : parseIngredients(task.raw_text || '')) as string[]
    }
    if (!candidates.length) {
      return json({ success: false, error: '未解析到任何配料，请检查输入文本或 OCR 结果' }, 400)
    }

    // ---------- 2. 加载三库 ----------
    const [
      { data: adds },
      { data: aliases },
      { data: allergens },
      { data: triggers },
      { data: tips },
    ] = await Promise.all([
      supabase.from('food_additives').select('id,name,category,risk_level,gb_std,risk_desc').eq('status', 'active'),
      supabase.from('food_additive_aliases').select('alias,additive_id'),
      supabase.from('food_allergens').select('key,name,description,crowd_code'),
      supabase.from('food_crowd_triggers').select('trigger_keyword,crowd_code'),
      supabase.from('food_crowd_tips').select('crowd_code,label,general_tip,children_tip,fit_people,unfit_people'),
    ])

    const addList = (adds || []) as Additive[]
    const aliasToId = new Map<string, string>()
    for (const al of (aliases || []) as { alias: string; additive_id: string }[]) {
      aliasToId.set(al.alias, al.additive_id)
    }
    const addById = new Map<string, Additive>()
    for (const a of addList) addById.set(a.id, a)
    const addByName = new Map<string, Additive>()
    for (const a of addList) addByName.set(a.name, a)

    const allergenList = (allergens || []) as { key: string; name: string; description: string | null; crowd_code: string }[]
    const triggerList = (triggers || []) as { trigger_keyword: string; crowd_code: string }[]
    const tipByCode = new Map<string, any>()
    for (const t of (tips || []) as any[]) tipByCode.set(t.crowd_code, t)

    // ---------- 3. 匹配 ----------
    const additiveList: any[] = []
    const matchedAdditiveNames = new Set<string>()
    const crowdCodes = new Set<string>()
    let limitedCount = 0
    let hasHighRisk = false

    for (const c of candidates) {
      // 添加剂匹配（精确 → 包含双向 → 别名反查）
      let hit: Additive | undefined = addByName.get(c)
      if (!hit) {
        for (const a of addList) {
          if (c.includes(a.name) || a.name.includes(c)) { hit = a; break }
        }
      }
      if (!hit && aliasToId.has(c)) {
        const a2 = addById.get(aliasToId.get(c)!)
        if (a2) hit = a2
      }
      if (hit) {
        matchedAdditiveNames.add(hit.name)
        const level = toLevel(hit.risk_level)
        if (level === 'high_risk') hasHighRisk = true
        if (level === 'limit') limitedCount++
        additiveList.push({
          name: hit.name,
          level,
          type: `${hit.category || '添加剂'}·国标${hit.gb_std || 'GB2760'}`,
          desc: hit.risk_desc || '',
        })
      }
    }

    // 过敏原匹配（候选包含过敏原名）
    const allergenListOut: any[] = []
    for (const al of allergenList) {
      if (candidates.some((c) => c.includes(al.name))) {
        allergenListOut.push({ key: al.key, name: al.name, crowd_code: al.crowd_code })
        crowdCodes.add(al.crowd_code)
      }
    }

    // 人群触发词匹配（候选包含触发词）
    for (const tr of triggerList) {
      if (candidates.some((c) => c.includes(tr.trigger_keyword))) {
        crowdCodes.add(tr.crowd_code)
      }
    }

    // 儿童提示：只要有任何添加剂/过敏原/人群触发，即附带儿童食养建议
    if (additiveList.length || allergenListOut.length || crowdCodes.size) {
      crowdCodes.add('children')
    }

    // ---------- 4. 4 档安全评级 ----------
    let safeLevelCode: 'A_preferred' | 'A_limit' | 'B_caution' | 'C_avoid' = 'A_preferred'
    let safeLevelLabel = 'A优选'
    if (hasHighRisk) {
      safeLevelCode = 'C_avoid'
      safeLevelLabel = 'C不推荐'
    } else if (limitedCount >= 3) {
      safeLevelCode = 'B_caution'
      safeLevelLabel = 'B适度慎选'
    } else if (limitedCount >= 1) {
      safeLevelCode = 'A_limit'
      safeLevelLabel = 'A含限量成分'
    }

    // ---------- 5. main_conclusion ----------
    const generalByLevel: Record<string, string> = {
      A_preferred: '可适量食用',
      A_limit: '可适量食用（含限量添加剂，注意控制）',
      B_caution: '适度慎选，建议控制食用量',
      C_avoid: '不建议食用（检出高风险成分）',
    }
    const childrenTip = tipByCode.get('children')?.children_tip || '儿童可食用（仍建议适量、家长酌情）'
    const fitPieces: string[] = []
    const unfitPieces: string[] = []
    for (const code of crowdCodes) {
      const t = tipByCode.get(code)
      if (t?.fit_people) fitPieces.push(t.fit_people)
      if (t?.unfit_people) unfitPieces.push(t.unfit_people)
    }
    const mainConclusion = {
      general: generalByLevel[safeLevelCode],
      children: childrenTip,
      fit_people: fitPieces.length ? Array.from(new Set(fitPieces)).join('；') : '无相关过敏/禁忌的一般人群',
      unfit_people: unfitPieces.length ? Array.from(new Set(unfitPieces)).join('；') : '暂无明确禁忌人群',
    }

    // ---------- 6. health_shortboard_tip（个性化，结合 user_health_profile） ----------
    let healthShortboardTip = '未登录健康画像，无法个性化比对；如有过敏或慢病请留意上方提示。'
    if (userId) {
      const { data: prof } = await supabase
        .from('user_health_profile')
        .select('allergies,chronic_conditions')
        .eq('user_id', userId)
        .maybeSingle()
      if (prof) {
        const allergies: string[] = prof.allergies || []
        const chronic: string[] = prof.chronic_conditions || []
        const conflicts: string[] = []
        for (const al of allergenListOut) {
          if (allergies.includes(al.key) || allergies.includes(al.name)) conflicts.push(`过敏原「${al.name}」`)
        }
        for (const code of crowdCodes) {
          if (chronic.includes(code)) {
            const t = tipByCode.get(code)
            if (t) conflicts.push(t.label)
          }
        }
        healthShortboardTip = conflicts.length
          ? `检测到您的健康画像与本品存在冲突：${conflicts.join('、')}，建议避开或咨询医生。`
          : '当前配料与您的健康画像无明显冲突，可放心看其他维度。'
      }
    }

    // ---------- 7. 持久化报告 ----------
    const insertRow = {
      product_id: productId || null,
      source,
      input_text: text || (ocrTaskId ? `[ocr_task:${ocrTaskId}]` : null),
      parsed_ingredients: candidates,
      additive_list: additiveList,
      allergen_list: allergenListOut,
      crowd_tips: Array.from(crowdCodes),
      safe_level: safeLevelLabel,
      safe_level_code: safeLevelCode,
      main_conclusion: mainConclusion,
      health_shortboard_tip: healthShortboardTip,
      created_by: userId || null,
    }
    const { data: rep, error: repErr } = await supabase
      .from('food_analysis_reports')
      .insert(insertRow)
      .select('id')
      .maybeSingle()
    if (repErr) throw new Error(`报告持久化失败: ${repErr.message}`)

    return json({
      success: true,
      report_id: rep?.id,
      safe_level: safeLevelLabel,
      safe_level_code: safeLevelCode,
      main_conclusion: mainConclusion,
      health_shortboard_tip: healthShortboardTip,
      additive_list: additiveList,
      crowd_tips: Array.from(crowdCodes),
      parsed_ingredients: candidates,
      matched_additives: Array.from(matchedAdditiveNames),
    })
  } catch (e: any) {
    console.error('[ingredient-analyze] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
