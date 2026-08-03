// subject-backfill Edge Function
// ------------------------------------------------------------
// 批量回算工具：把商品已有的食养信号（health_tag / overall_nature /
// food_stage / 名称·食材关键词 / 营养）映射为「科目 key」并写回
// products.subject_keys（gin 索引，支撑 .overlaps 快速过滤）。
//
// 派生规则与 src/utils/subject-derive.ts 的 deriveSubjectKeys 保持一致。
// EF 运行在服务端，不能 import src，故此处为确定性的 TS 重实现。
//
// 设计要点：
//   - 使用 SUPABASE_SERVICE_ROLE_KEY，不受 RLS 限制（内部运维工具）。
//   - 幂等且可断点续跑：subject_keys 已非空且未强制重算则跳过；
//     失败项不影响其余，下次运行自动补算。
//   - dry_run 模式只统计不写库，便于先验证影响面。
//
// 触发：
//   curl -X POST .../functions/v1/subject-backfill -d '{"limit":100,"dry_run":true}'
//   curl -X POST .../functions/v1/subject-backfill -d '{"store_id":"<id>","force":true}'

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

// ---- 派生规则（与 src/utils/subject-derive.ts 一致）----
const ALL_SUBJECT_KEYS = [
  'spleen', 'sleep', 'heat', 'damp', 'women', 'kids', 'season', 'sugar',
] as const
type SubjectKey = typeof ALL_SUBJECT_KEYS[number]

const HEALTH_TAG_TO_SUBJECT: Record<string, SubjectKey[]> = {
  '健脾养胃': ['spleen'],
  '消食化积': ['spleen'],
  '温中散寒': ['spleen'],
  '舒缓安适': ['sleep'],
  '清热降火': ['heat'],
  '滋阴润燥': ['heat'],
  '润养舒喉': ['heat'],
  '利水消肿': ['damp'],
  '补气养血': ['women'],
}

const COLD_NATURES = ['大寒', '寒凉', '凉', '微凉']
const WARM_NATURES = ['微温', '温', '温热', '大热']

const KEYWORD_SUBJECT: { kw: string[]; sub: SubjectKey }[] = [
  { kw: ['儿童', '宝宝', '小孩', '成长', '益智', '牛磺酸', 'dha', '学生', '钙'], sub: 'kids' },
  { kw: ['女性', '经期', '月经', '气血', '养颜', '美容', '孕', '哺乳', '宝妈'], sub: 'women' },
  { kw: ['控糖', '低糖', '无糖', '轻食', '代餐', '粗粮', '膳食纤维', '减脂', '健身餐'], sub: 'sugar' },
  { kw: ['节气', '时令', '当季', '应季', '春', '夏', '秋', '冬'], sub: 'season' },
  { kw: ['安神', '助眠', '安睡', '失眠', '百合', '酸枣仁', '桂圆', '莲子'], sub: 'sleep' },
  { kw: ['祛湿', '利湿', '消肿', '红豆', '薏米', '芡实'], sub: 'damp' },
]

interface RawProduct {
  id: string
  name: string | null
  description: string | null
  ingredients: string[] | null
  health_tag: string[] | null
  overall_nature: string | null
  food_stage: string | null
  nutrition: any
  therapy_json: any
  subject_keys: string[] | null
}

function deriveSubjectKeys(p: RawProduct): SubjectKey[] {
  const set = new Set<SubjectKey>()
  const tags = (p.health_tag || []).filter(Boolean)
  for (const t of tags) {
    const subs = HEALTH_TAG_TO_SUBJECT[t]
    if (subs) subs.forEach((s) => set.add(s))
  }

  const nature = (p.overall_nature || p.therapy_json?.overall_nature_code || '') as string
  if (COLD_NATURES.includes(nature)) set.add('heat')
  if (WARM_NATURES.includes(nature)) set.add('spleen')

  const stage = (p.food_stage || '') as string
  if (stage.includes('调')) set.add('spleen')
  if (stage.includes('清')) set.add('heat')
  if (stage.includes('补')) { set.add('women'); set.add('kids') }

  const text = (
    (p.name || '') + ' ' + (p.description || '') + ' ' +
    ((p.ingredients as string[] | undefined)?.join(' ') || '')
  ).toLowerCase()
  for (const { kw, sub } of KEYWORD_SUBJECT) {
    if (kw.some((k) => text.includes(k.toLowerCase()))) set.add(sub)
  }

  const sugar = p.nutrition?.sugar_g
  if (typeof sugar === 'number' && sugar <= 5) set.add('sugar')

  return ALL_SUBJECT_KEYS.filter((k) => set.has(k))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const storeId: string | undefined = body.store_id || undefined
    const limit: number = Math.min(Math.max(Number(body.limit) || 500, 1), 1000)
    const dryRun: boolean = body.dry_run === true
    const force: boolean = body.force === true

    let query = supabase
      .from('products')
      .select('id, name, description, ingredients, health_tag, overall_nature, food_stage, nutrition, therapy_json, subject_keys')
      .limit(limit)
    if (storeId) query = query.eq('store_id', storeId)

    const { data: products, error: pErr } = await query
    if (pErr) throw new Error(`读取 products 失败: ${pErr.message}`)

    const all = (products || []) as RawProduct[]
    // 幂等：已非空且非强制重算则跳过（断点续跑友好）
    const todo = force
      ? all
      : all.filter((p) => !(p.subject_keys && p.subject_keys.length > 0))

    let updated = 0
    let skipped = 0
    let empty = 0
    const errors: string[] = []
    const sample: any[] = []

    for (const p of todo) {
      const keys = deriveSubjectKeys(p)
      if (sample.length < 12) {
        sample.push({ id: p.id, name: p.name, subject_keys: keys })
      }
      if (dryRun) {
        if (keys.length === 0) empty++
        else updated++ // 预览将写入数
        continue
      }
      const { error: uErr } = await supabase
        .from('products')
        .update({ subject_keys: keys })
        .eq('id', p.id)
      if (uErr) {
        errors.push(`写回失败[${p.id}]: ${uErr.message}`)
        continue
      }
      if (keys.length === 0) empty++
      else updated++
      // 限速，避免触发服务并发配额
      await new Promise((res) => setTimeout(res, 200))
    }

    // dry_run 时 skipped 表示「已算过的无需重算」
    const skippedCount = force ? 0 : all.length - todo.length

    return json({
      success: true,
      dry_run: dryRun,
      force,
      store_id: storeId || null,
      scanned: all.length,
      to_process: todo.length,
      already_done: skippedCount,
      updated,
      empty_subjects: empty,
      error_count: errors.length,
      errors: errors.slice(0, 10),
      sample,
    })
  } catch (e: any) {
    console.error('[subject-backfill] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
