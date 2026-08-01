// product-therapy-sync Edge Function
// ------------------------------------------------------------
// 食养系统化内核：把"食疗统一引擎(buildTherapyReport)"的计算结果持久化为
// products.therapy_json（单一数据源），并回填 ingredients / overall_nature /
// fit_people / allergens / aux_remind / therapy_pending。
//
// 模式：
//   - backfill：扫描 therapy_json 为空 或 therapy_pending=true 的商品，批量回算。
//              可由脚本用 service_role 调用（verify_jwt=false）。
//   - single  ：对指定 product_id 重新计算（支持无食材时按名称匹配食材字典推导）。
//
// 算法与小程序端 src/utils/food-therapy/product-therapy.ts 严格对齐（同一套性味合并/
// 综合功效/慎食人群/慢病标签/三色预警/合规医疗词硬替换），保证两端一致。
//
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

// ===================== 食疗统一引擎（Deno 版，对齐 product-therapy.ts） =====================

const NATURE_VALUE: Record<string, number> = {
  大寒: -3, 寒凉: -2, 凉: -2, 微凉: -1,
  平性: 0, 平: 0, 微温: 1, 温: 2, 温热: 2, 大热: 3, 热: 3,
}
const NATURE_LEVELS = Object.keys(NATURE_VALUE)
const NATURE_LABEL: Record<string, string> = {
  大寒: '大寒', 寒凉: '寒凉', 凉: '凉', 微凉: '微凉',
  平性: '平性', 平: '平性', 微温: '微温', 温: '温', 温热: '温热', 大热: '大热', 热: '大热',
}

const MEDICAL_TERM_MAP: Record<string, string> = {
  降压: '关注血压', 降血压: '关注血压', 降血脂: '关注血脂', 治疗: '食养辅助',
  治愈: '食养辅助', 治病: '食养辅助', 抗炎: '食养舒缓', 消炎: '食养舒缓',
  抗癌: '日常食养', 减肥: '日常膳食管理', 减脂治病: '日常膳食管理',
  疗效: '食养参考', 药用: '食养', 药疗: '食养',
}
function sanitizeTherapyCopy(text: string): string {
  let out = text || ''
  for (const [bad, good] of Object.entries(MEDICAL_TERM_MAP)) {
    out = out.split(bad).join(good)
  }
  return out
}

const THERAPY_DISCLAIMER =
  '本内容仅为食养参考，不属于医疗建议，不能替代药物治疗；过敏体质、慢性病患者请结合自身医嘱食用。'

const NATURE_FEELING: Record<string, string> = {
  大寒: '寒凉清润', 寒凉: '清爽凉润', 凉: '清爽偏凉', 微凉: '清润爽口',
  平性: '平和养胃', 平: '平和适口', 微温: '温润舒服', 温: '温润暖胃',
  温热: '温热养身', 大热: '辛温偏燥', 热: '温通偏燥',
}

function natureToValue(n?: string | null): number {
  if (!n) return 0
  const v = NATURE_VALUE[n.trim()]
  return v === undefined ? 0 : v
}
function valueToNatureCode(v: number): string {
  let best = '平性'
  let bestDiff = Infinity
  for (const lvl of NATURE_LEVELS) {
    const d = Math.abs(NATURE_VALUE[lvl] - v)
    if (d < bestDiff) { bestDiff = d; best = lvl }
  }
  return best
}

interface IngInput {
  name: string
  nature: string
  base_effect?: string | null
  fit_scenes?: string | null
  caution_crowds?: string | null
  allergens?: string[] | null
  chronic_tags?: string[] | null
  neutralize?: string | null
  ratio?: number
  cooking?: string
  aux?: string[]
}

function splitCrowds(s?: string | null): string[] {
  return (s || '').split(/[、，,]/).map((x) => x.trim()).filter(Boolean)
}

const CARE_CATEGORY: { key: string; kw: string[] }[] = [
  { key: '体寒', kw: ['体寒', '脾胃虚寒', '怕冷', '虚寒', '宫寒'] },
  { key: '经期', kw: ['经期'] },
  { key: '上火', kw: ['上火', '咽喉肿痛', '炎症', '热性'] },
]

function mergeNature(items: IngInput[]): { code: string; desc: string } {
  const valid = items.filter((it) => it.nature)
  if (valid.length === 0) return { code: '', desc: '' }
  const totalRatio = valid.reduce((s, it) => s + (it.ratio || 0), 0)
  const useRatio = totalRatio > 0
  let sum = 0, weight = 0
  for (const it of valid) {
    const w = useRatio ? (it.ratio || 0) : 1
    sum += natureToValue(it.nature) * w
    weight += w
  }
  const avg = weight > 0 ? sum / weight : 0
  const code = NATURE_LABEL[valueToNatureCode(avg)] || '平性'
  const distinct = Array.from(new Set(valid.map((it) => NATURE_LABEL[it.nature] || it.nature)))
  const desc = distinct.length === 1 ? distinct[0] : distinct.join('') + '组合'
  return { code, desc }
}

function mergeEffect(items: IngInput[]): string {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const it of items) {
    for (const seg of (it.base_effect || '').split(/[、，,]/)) {
      const s = seg.trim()
      if (s && !seen.has(s)) { seen.add(s); merged.push(s) }
    }
  }
  return sanitizeTherapyCopy(merged.join('、'))
}

function mergeCrowds(items: IngInput[]): { caution: string[]; chronic: string[]; careCategories: string[] } {
  const caution = new Set<string>()
  const chronic = new Set<string>()
  const careCategories = new Set<string>()
  for (const it of items) {
    splitCrowds(it.caution_crowds).forEach((c) => caution.add(c))
    ;(it.chronic_tags || []).forEach((c) => chronic.add(c))
    const lower = (it.caution_crowds || '').toLowerCase()
    for (const cat of CARE_CATEGORY) {
      if (cat.kw.some((k) => lower.includes(k.toLowerCase()))) careCategories.add(cat.key)
    }
  }
  const hasHeavyOil = items.some((it) => /重油|红烧|油炸|油焖/.test(it.cooking || ''))
  const hasSaltOrSugar = items.some((it) => (it.aux || []).some((a) => /盐|糖|酱油|酱/.test(a)))
  if (hasHeavyOil || hasSaltOrSugar) {
    caution.add('高血压人群注意控盐控油，建议少油少盐版本')
  }
  return { caution: Array.from(caution), chronic: Array.from(chronic), careCategories: Array.from(careCategories) }
}

interface TherapyWarning { level: 'red' | 'orange' | 'blue'; code: string; label: string; text: string }

function buildTherapyReport(productName: string, items: IngInput[]): any {
  const nature = mergeNature(items)
  const combined_effect = mergeEffect(items)
  const { caution, chronic, careCategories } = mergeCrowds(items)

  const warnings: TherapyWarning[] = []

  for (const cat of careCategories) {
    const tipMap: Record<string, string> = {
      体寒: '体寒怕冷、脾胃虚寒、女生生理期人群：偏凉食材建议搭配生姜、红枣等同食，更温和适口。',
      经期: '生理期女性：偏凉食材建议搭配温性辅料，不宜过量生冷。',
      上火: '容易上火、咽喉肿痛人群：温补食材建议单次少量食用。',
    }
    warnings.push({ level: 'orange', code: `care_${cat}`, label: '体质慎食', text: tipMap[cat] || '' })
  }
  for (const c of caution) {
    if (warnings.some((w) => w.text.includes(c))) continue
    warnings.push({ level: 'orange', code: `caution_${c}`, label: '食用注意', text: `${c}。` })
  }

  for (const t of chronic) {
    const advice = /高血压/.test(t)
      ? '建议选择少油少盐款，单次食用适量。'
      : /减脂|减肥/.test(t)
        ? '作为日常轻盈膳食搭配适量食用。'
        : /儿童/.test(t)
          ? '适合作为日常营养补给。'
          : '结合个人体质适量食用。'
    warnings.push({ level: 'blue', code: `chronic_${t}`, label: '慢病适配', text: `${t}：${advice}` })
  }

  const fitScenes = Array.from(new Set(items.flatMap((it) => splitCrowds(it.fit_scenes)).map((s) => s.trim()).filter(Boolean)))
  const chronicFit = chronic.filter((t) => /友好|适宜|营养|补充/.test(t))
  const fitParts = [...fitScenes, ...chronicFit]
  const fallback = ['日常佐餐', '上班族', '青少年营养补给'].filter((x) => !fitParts.includes(x))
  const fit_people = sanitizeTherapyCopy([...fitParts, ...fallback].join('、'))

  const merchant_note = sanitizeTherapyCopy(
    `${productName}为${nature.desc}食养，${combined_effect}；日常温和适口。` +
      (chronic.some((t) => /高血压/.test(t)) ? '高血压食客建议清淡做法食用。' : ''),
  ).slice(0, 80)

  return {
    overall_nature_code: nature.code,
    overall_nature: nature.desc,
    combined_effect,
    fit_people,
    caution_people: caution.join('；'),
    chronic_tags: chronic,
    warnings,
    merchant_note,
    disclaimer: THERAPY_DISCLAIMER,
  }
}

function buildTherapyHeadline(r: any): { main: string; sub: string } {
  const feeling = NATURE_FEELING[r.overall_nature_code] || ''
  const main = feeling ? `${feeling} · 多数人都能安心吃` : '食养参考 · 适量为宜'
  const sub = r.fit_people ? `适合${r.fit_people.split('、')[0].replace(/等$/, '')}等` : '基于真实配料实时计算'
  return { main, sub }
}

// ===================== 食材字典 + 名称匹配推导 =====================

interface DictRow {
  name: string
  nature: string
  base_effect: string | null
  fit_scenes: string | null
  caution_crowds: string | null
  allergens: string[] | null
  chronic_tags: string[] | null
  neutralize: string | null
}

// 从商品名推导食材：商品名包含字典食材名（长度>=2）即视为该食材。
// 例：「西瓜」→ 西瓜；「椰子」→ 椰子；「巫山烤鱼」→ 若字典有「鱼」则匹配（软匹配，可接受）。
function deriveFromName(productName: string, dict: DictRow[]): IngInput[] {
  const name = (productName || '').trim()
  if (!name) return []
  const inputs: IngInput[] = []
  for (const row of dict) {
    if (!row.name || row.name.length < 2) continue
    if (name.includes(row.name)) {
      inputs.push({
        name: row.name, nature: row.nature, base_effect: row.base_effect,
        fit_scenes: row.fit_scenes, caution_crowds: row.caution_crowds,
        allergens: row.allergens || [], chronic_tags: row.chronic_tags || [], neutralize: row.neutralize,
        ratio: 50, cooking: '清炒', aux: [],
      })
    }
  }
  return inputs
}

function resolveInputs(ingredientNames: string[] | null | undefined, dictMap: Map<string, DictRow>): IngInput[] {
  if (!ingredientNames || !ingredientNames.length) return []
  const inputs: IngInput[] = []
  for (const nm of ingredientNames) {
    const row = dictMap.get(nm)
    if (!row) continue
    inputs.push({
      name: row.name, nature: row.nature, base_effect: row.base_effect,
      fit_scenes: row.fit_scenes, caution_crowds: row.caution_crowds,
      allergens: row.allergens || [], chronic_tags: row.chronic_tags || [], neutralize: row.neutralize,
      ratio: 50, cooking: '清炒', aux: [],
    })
  }
  return inputs
}

// 计算并组装回写 payload（含 therapy_json 单一数据源）
function computePayload(productName: string, inputs: IngInput[]) {
  if (!inputs.length) {
    return { therapy_pending: true, therapy_json: null, ingredients: null, overall_nature: null, fit_people: null, allergens: null, aux_remind: null }
  }
  const report = buildTherapyReport(productName, inputs)
  const headline = buildTherapyHeadline(report)
  const therapy_json = { ...report, headline }
  const allergens = Array.from(new Set(inputs.flatMap((it) => (it.allergens as string[] | undefined) || []).filter(Boolean)))
  const resolvedNames = inputs.map((it) => it.name)
  return {
    therapy_pending: false,
    therapy_json,
    ingredients: resolvedNames,
    overall_nature: report.overall_nature_code || null,
    fit_people: report.fit_people || null,
    allergens: allergens.length ? allergens : null,
    aux_remind: report.caution_people || null,
  }
}

// ===================== 主流程 =====================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const mode: string = body.mode || 'backfill'

    // 加载食材字典
    const { data: dictRows, error: dictErr } = await supabase
      .from('food_ingredients').select('name,nature,base_effect,fit_scenes,caution_crowds,allergens,chronic_tags,neutralize').eq('is_active', true)
    if (dictErr) throw new Error(`读取食材字典失败: ${dictErr.message}`)
    const dict = (dictRows || []) as DictRow[]
    const dictMap = new Map<string, DictRow>(dict.map((d) => [d.name, d]))

    if (mode === 'single') {
      const productId: string | undefined = body.product_id || undefined
      if (!productId) return json({ success: false, error: '缺少 product_id' }, 400)
      const { data: p, error: pe } = await supabase
        .from('products').select('id,name,ingredients').eq('id', productId).maybeSingle()
      if (pe) throw new Error(`读取商品失败: ${pe.message}`)
      if (!p) return json({ success: false, error: '商品不存在' }, 404)
      let inputs = resolveInputs((p as any).ingredients, dictMap)
      if (!inputs.length) inputs = deriveFromName((p as any).name || '', dict)
      const payload = computePayload((p as any).name || '', inputs)
      const { error: ue } = await supabase.from('products').update(payload).eq('id', productId)
      if (ue) throw new Error(`回写失败: ${ue.message}`)
      return json({ success: true, product_id: productId, computed: !payload.therapy_pending, payload })
    }

    // backfill 模式
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200)
    const { data: products, error: pe } = await supabase
      .from('products')
      .select('id,name,ingredients,therapy_json,therapy_pending')
      .or('therapy_json.is.null,therapy_pending.eq.true')
      .order('created_at', { ascending: true })
      .limit(limit)
    if (pe) throw new Error(`读取商品失败: ${pe.message}`)

    let computed = 0, pending = 0, failed = 0
    for (const p of (products || []) as any[]) {
      try {
        let inputs = resolveInputs(p.ingredients, dictMap)
        if (!inputs.length) inputs = deriveFromName(p.name || '', dict)
        const payload = computePayload(p.name || '', inputs)
        const { error: ue } = await supabase.from('products').update(payload).eq('id', p.id)
        if (ue) { failed++; console.error('[backfill] 回写失败', p.id, ue.message); continue }
        if (payload.therapy_pending) pending++; else computed++
      } catch (e: any) {
        failed++
        console.error('[backfill] 单品异常', p.id, e?.message)
      }
    }

    return json({
      success: true,
      mode: 'backfill',
      scanned: (products || []).length,
      computed,
      pending,
      failed,
    })
  } catch (e: any) {
    console.error('[product-therapy-sync] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
