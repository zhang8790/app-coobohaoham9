/**
 * 舌象案例库 · 本地内置包生成器（小程序端运行时，不走云系统）
 * ----------------------------------------------------------------------------
 * 复用 gen_tongue_cases_seed 的 CASES + deriveCase（真实引擎），把 20 条去标识案例
 * 生成为本地 TS 包 src/utils/food-therapy/tongue-cases-local.ts。
 * 小程序「数据库参考 / 食养画像」直接读本地包，完全离线、零跨境请求。
 * 与云端 tongue_cases 表同源、与 App 展示同源，避免算法漂移。
 *
 * 运行：node node_modules/tsx/dist/cli.mjs src/scripts/gen_tongue_cases_local.ts
 */
import { writeFileSync } from 'fs'
import { CASES, deriveCase } from './gen_tongue_cases_seed'

const CREATED_AT = '2026-10-03'

const rows = CASES.map((c) => {
  const d = deriveCase(c)
  return {
    case_no: d.no,
    source: d.source,
    features: d.features,
    answers: d.answers,
    constitution_primary: d.primaryKey,
    constitution_secondary: d.secondaryKey,
    health_index: d.healthIndex,
    band: d.band,
    confidence: d.confidence,
    tags: d.tags,
    expert_note: d.note,
    created_at: CREATED_AT,
  }
})

const body = rows
  .map(
    (r) => `  {
    case_no: '${r.case_no}',
    source: '${r.source}',
    features: ${JSON.stringify(r.features)},
    answers: [${r.answers.join(', ')}],
    constitution_primary: '${r.constitution_primary}',
    constitution_secondary: ${r.constitution_secondary ? `'${r.constitution_secondary}'` : 'null'},
    health_index: ${r.health_index.toFixed(1)},
    band: '${r.band}',
    confidence: ${r.confidence.toFixed(2)},
    tags: [${r.tags.map((t) => `'${t}'`).join(', ')}],
    expert_note: ${r.expert_note ? `'${r.expert_note.replace(/'/g, "\\'")}'` : 'null'},
    created_at: '${r.created_at}',
  },`,
  )
  .join('\n')

const file =
  `// ============================================================\n` +
  `// 舌象案例库 · 本地内置包（小程序端运行时使用，不走云系统）\n` +
  `// ------------------------------------------------------------\n` +
  `// 本文件由 src/scripts/gen_tongue_cases_local.ts 生成，请勿手改。\n` +
  `// 20 条去标识案例，全部由真实引擎（tongue-engine-v2 + tongue-report）派生，\n` +
  `// 与云端 tongue_cases 表同源、与 App 展示同源，避免算法漂移。\n` +
  `// 小程序「数据库参考 / 食养画像」直接读此处，完全离线、零跨境请求。\n` +
  `// ============================================================\n` +
  `import type { TongueCaseRow } from '@/db/tongue-cases'\n\n` +
  `export const LOCAL_TONGUE_CASES: TongueCaseRow[] = [\n${body}\n]\n`

writeFileSync('src/utils/food-therapy/tongue-cases-local.ts', file, 'utf8')
console.log(`已生成 src/utils/food-therapy/tongue-cases-local.ts（${rows.length} 条）`)
