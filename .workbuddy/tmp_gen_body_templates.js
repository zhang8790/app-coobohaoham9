// 临时脚本：从 src/utils/category-emotion.ts 精确提取 11 业态 bodyTemplates，
// 生成 supabase/migrations/00074_add_body_templates.sql（ADD COLUMN + 种子 UPDATE）。
const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '../src/utils/category-emotion.ts')
const OUT = path.resolve(__dirname, '../supabase/migrations/00074_add_body_templates.sql')
const text = fs.readFileSync(SRC, 'utf-8')

// 匹配每个 `const KEY: CategoryEmotionProfile = { ... bodyTemplates: [ ... ],`
const re = /const (\S+?): CategoryEmotionProfile = \{[\s\S]*?bodyTemplates:\s*\[([\s\S]*?)\],/g
const rows = []
let m
while ((m = re.exec(text)) !== null) {
  const key = m[1]
  const arrContent = m[2]
  const tmplRe = /`([^`]*)`/g
  const templates = []
  let t
  while ((t = tmplRe.exec(arrContent)) !== null) {
    templates.push(t[1])
  }
  if (templates.length) rows.push({ key, templates })
}

if (rows.length !== 11) {
  console.error('期望提取到 11 个业态，实际：', rows.length, rows.map(r => r.key))
  process.exit(1)
}

let sql = `-- ============================================\n`
sql += `-- 00074 给 category_emotion_profiles 增加 body_templates 列并种入真实模板\n`
sql += `-- ============================================\n`
sql += `-- 背景：\n`
sql += `--   前端 src/utils/category-emotion.ts 的 11 业态策略各含 bodyTemplates（类目专属产品描述模板，\n`
sql += `--   含 {name}/{metaphor}/{realm}/{attr}/{angle} 占位符），编译引擎 emotion-description.ts 优先消费它。\n`
sql += `--   但 00040 / 00071 建表与种子都漏建 body_templates 列，前端 SELECT 它时返回 400\n`
sql += `--   （code 42703 "column body_templates does not exist"），随后降级为内置策略（功能不崩，但云端改词失效）。\n`
sql += `--   本迁移补列 + 种入与前端内置完全一致的模板，使云端策略与内置策略对齐，400 消除。\n`
sql += `-- 幂等：ADD COLUMN IF NOT EXISTS + UPDATE（无冲突风险）。\n`
sql += `-- ============================================\n\n`

sql += `-- 1) 补列（已存在则跳过）\n`
sql += `ALTER TABLE public.category_emotion_profiles\n`
sql += `  ADD COLUMN IF NOT EXISTS body_templates JSONB DEFAULT '[]'::jsonb;\n\n`

sql += `-- 2) 种入 11 业态 bodyTemplates（与前端 CATEGORY_EMOTION_MAP 完全一致）\n`
for (const r of rows) {
  const json = JSON.stringify(r.templates) // 自动处理转义
  sql += `UPDATE public.category_emotion_profiles\n`
  sql += `  SET body_templates = '${json}'::jsonb\n`
  sql += `  WHERE category_key = '${r.key}';\n`
}
sql += `\n`

sql += `-- ========== 自校验（执行后各业态 body_templates 应为非空 JSON 数组） ==========\n`
sql += `-- SELECT category_key, jsonb_array_length(body_templates) AS tpl_cnt\n`
sql += `--   FROM public.category_emotion_profiles ORDER BY category_key;   -- 各业态应为 10~12\n\n`

sql += `COMMENT ON COLUMN public.category_emotion_profiles.body_templates IS\n`
sql += `  '类目专属产品描述模板（含占位符 {name}/{metaphor}/{realm}/{attr}/{angle}），编译引擎优先消费；运营可在 Dashboard 直接改，免发版生效';\n`

fs.writeFileSync(OUT, sql, 'utf-8')
console.log('已生成', OUT, '业态数', rows.length)
rows.forEach(r => console.log('  ', r.key, '→', r.templates.length, '条模板'))
