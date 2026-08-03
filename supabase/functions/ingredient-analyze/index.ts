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

// 风险等级映射：DB 的 L1-L4 → 标准 JSON 的 safe/limit/high_risk
//   L1 纯天然无风险 / L2 常规合规   → safe
//   L3 敏感人群控量                → limit
//   L4 老幼弱尽量少吃（原 black）   → high_risk
function toLevel(risk: string | null): 'safe' | 'limit' | 'high_risk' {
  if (risk === 'L4' || risk === 'black') return 'high_risk'
  if (risk === 'L3' || risk === 'yellow') return 'limit'
  return 'safe' // L1 / L2 / white
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

// 用户年龄段 → 私有目录 age_caution 命中词（覆盖目录里更细的写法：
// 孕哺期↔孕妇、老年↔中老年、儿童↔婴幼儿），保证不同年龄看到不同年龄段提醒。
const AGE_TOKEN_MAP: Record<string, string[]> = {
  '儿童': ['儿童', '婴幼儿'],
  '青少年': ['青少年'],
  '成人': ['成人'],
  '孕哺期': ['孕哺期', '孕妇'],
  '老年': ['中老年', '老年'],
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
    const userTags: string[] | undefined = body.user_tags || undefined
    const ageGroup: string | undefined = body.age_group || undefined
    // persist=false 时跳过写 food_analysis_reports（商品页内联调用只为拿洞察，不刷报告表）
    const persist: boolean = body.persist !== false
    const source: string = body.source || (ocrTaskId ? 'ocr' : 'manual')
    let profileAgeGroup = ''

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
      { data: tagRules },
    ] = await Promise.all([
      supabase.from('food_additives').select('id,name,category,risk_level,gb_std,risk_desc').eq('status', 'active'),
      supabase.from('food_additive_aliases').select('alias,additive_id'),
      supabase.from('food_allergens').select('key,name,description,crowd_code'),
      supabase.from('food_crowd_triggers').select('trigger_keyword,crowd_code'),
      supabase.from('food_crowd_tips').select('crowd_code,label,general_tip,children_tip,fit_people,unfit_people'),
      supabase.from('food_tag_rules').select('tag_key,label,prefer_ingredients,avoid_ingredients,weight_prefer,weight_avoid').eq('status', 'active'),
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
          risk_tier: hit.risk_level,
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
        .select('allergies,chronic_conditions,age_group')
        .eq('user_id', userId)
        .maybeSingle()
      if (prof) {
        profileAgeGroup = prof.age_group || ''
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

    // ---------- 6.5 私有目录表药食同源洞察（核心壁垒） ----------
    // service_role 读取 medicinal_food_catalog（客户端 RLS 拒绝公开读），结合用户年龄段做
    // 差异化食养参考：同一款零食，孕哺期看到「孕妇慎用」、婴幼儿看到「禁用」、中老年看到
    // 日常饮食关注 —— 这是「竞品抄不到」的私有数据层。仅输出衍生洞察，绝不回传原始目录表。
    // 注意：此处只用 age_group（内联调用前端直传，不暴露过敏/慢病等敏感画像）做差异化。
    let catalogInsight: any = null
    {
      const { data: mfcRows, error: mfcErr } = await supabase
        .from('medicinal_food_catalog')
        .select('name,nature,flavor,age_suitable,age_caution,compatibility')
        .in('name', candidates)
      if (mfcErr) {
        console.error('[ingredient-analyze] 私有目录查询失败:', mfcErr.message)
      } else {
        const catalogByName = new Map<string, any>()
        for (const r of (mfcRows || []) as any[]) catalogByName.set(r.name, r)
        const matchedCatalog = candidates.filter((c) => catalogByName.has(c))
        if (matchedCatalog.length) {
          const effAgeGroup = ageGroup || profileAgeGroup
          const ageTokens: string[] = (AGE_TOKEN_MAP[effAgeGroup] || []).concat(effAgeGroup ? [effAgeGroup] : [])
          const natureCount: Record<string, number> = {}
          const compatibilityNotes: string[] = []
          const ageCautionHits: { ingredient: string; cautions: string[] }[] = []
          for (const c of matchedCatalog) {
            const r = catalogByName.get(c)
            if (r.nature) natureCount[r.nature] = (natureCount[r.nature] || 0) + 1
            if (r.compatibility) compatibilityNotes.push(`${r.name}：${r.compatibility}`)
            const acs: string[] = (r.age_caution || []).filter((ac: string) => ageTokens.some((t) => ac.includes(t)))
            if (acs.length) ageCautionHits.push({ ingredient: r.name, cautions: acs })
          }
          const natureEntries = Object.entries(natureCount).sort((a, b) => (b[1] as number) - (a[1] as number))
          const topNature = natureEntries[0]?.[0] || ''
          const natureSummary = natureEntries.length
            ? `本品含药食同源食材 ${matchedCatalog.length} 味，食性以「${topNature}」为主（${natureEntries
                .map(([k, v]) => `${k}${v}`)
                .join('、')}），日常膳食中属温和调理范畴，建议结合自身情况适量。`
            : ''
          catalogInsight = {
            matched_count: matchedCatalog.length,
            matched: matchedCatalog,
            nature_summary: natureSummary,
            nature_distribution: natureCount,
            age_caution_hits: ageCautionHits,
            compatibility_notes: compatibilityNotes.slice(0, 4),
          }
        }
      }
    }

    // ---------- 6.8 适配分 match_score（核心变现壁垒：用户标签 × 安全引擎） ----------
    let matchScore: any = null
    if (userTags && userTags.length) {
      const tagRows = ((tagRules as any[]) || []).filter((r) => userTags.includes(r.tag_key))
      if (tagRows.length) {
        let score = 50
        const reasons: string[] = []
        const additiveNames = additiveList.map((a: any) => a.name)
        const allIng = new Set<string>([...candidates, ...additiveNames])
        for (const r of tagRows) {
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
        if (userId) {
          const { data: prof } = await supabase
            .from('user_health_profile').select('allergies').eq('user_id', userId).maybeSingle()
          const ual = (prof?.allergies as string[]) || []
          for (const al of allergenListOut) {
            if (ual.includes(al.key) || ual.includes(al.name)) {
              score -= 40
              reasons.push(`含过敏原「${al.name}」与您的过敏史冲突`)
            }
          }
        }
        score = Math.max(0, Math.min(100, Math.round(score)))
        const tier = score >= 85 ? 'recommend' : score >= 30 ? 'caution' : 'avoid'
        matchScore = { score, tier, reasons: reasons.slice(0, 6), tags: userTags }
      }
    }

    // ---------- 7. 持久化报告（persist=false 时跳过，避免商品页内联调用刷表） ----------
    let rep: { id: string } | null = null
    if (persist) {
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
      const { data, error: repErr } = await supabase
        .from('food_analysis_reports')
        .insert(insertRow)
        .select('id')
        .maybeSingle()
      if (repErr) throw new Error(`报告持久化失败: ${repErr.message}`)
      rep = data
    }

    return json({
      success: true,
      report_id: rep?.id,
      safe_level: safeLevelLabel,
      safe_level_code: safeLevelCode,
      main_conclusion: mainConclusion,
      health_shortboard_tip: healthShortboardTip,
      catalog_insight: catalogInsight,
      match_score: matchScore,
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
