/**
 * 舌象案例库种子生成器
 * ----------------------------------------------------------------------------
 * 用真实引擎（tongue-engine-v2 + tongue-report）为每条案例派生
 * 主/兼体质、健康指数、分级、置信度，输出可直接粘贴进迁移的 INSERT 语句，
 * 保证「库内指标」与「App 展示」同源，避免两套算法漂移。
 *
 * 运行：node node_modules/tsx/dist/cli.mjs src/scripts/gen_tongue_cases_seed.ts
 */
import { TONGUE_QUESTIONS } from '@/utils/food-therapy/tongue-rules'
import { analyzeTongue } from '@/utils/food-therapy/tongue-engine-v2'
import { computeHealthIndex } from '@/utils/food-therapy/tongue-report'

interface SeedCase {
  no: string
  source: 'engine' | 'expert'
  answers: number[] // 8 维下标（area,color,coat_color,coat_texture,teeth,crack,moist,sublingual）
  note?: string // expert_note（专家订正/说明）
  tags: string[]
}

// 说明：qiyu（气郁）在当前 8 维望舌特征中无对应加分项，引擎不会输出 → 案例库不收录，
// 属已知边界（见 docs/舌象合规边界.md）。
export const CASES: SeedCase[] = [
  { no: 'TC-0001', source: 'engine', answers: [0, 0, 0, 0, 0, 0, 0, 0], tags: ['平和', '舌淡红', '苔薄白'] },
  { no: 'TC-0002', source: 'expert', answers: [1, 1, 0, 4, 2, 0, 2, 0], note: '典型阳虚舌：淡白胖大、苔水滑', tags: ['阳虚', '舌淡白', '胖大舌', '苔水滑'] },
  { no: 'TC-0003', source: 'engine', answers: [0, 1, 0, 0, 1, 0, 0, 0], tags: ['阳虚', '舌淡白'] },
  { no: 'TC-0004', source: 'expert', answers: [0, 2, 4, 3, 0, 1, 1, 0], note: '典型阴虚舌：舌红少苔、有裂纹', tags: ['阴虚', '舌红', '少苔', '裂纹'] },
  { no: 'TC-0005', source: 'engine', answers: [0, 2, 2, 2, 0, 1, 1, 0], tags: ['阴虚', '舌红', '苔干'] },
  { no: 'TC-0006', source: 'engine', answers: [1, 0, 0, 0, 1, 0, 0, 0], tags: ['气虚', '胖大舌', '齿痕'] },
  { no: 'TC-0007', source: 'engine', answers: [1, 1, 1, 1, 2, 0, 2, 0], tags: ['气虚', '痰湿', '胖大舌', '苔厚腻'] },
  { no: 'TC-0008', source: 'expert', answers: [0, 0, 1, 1, 2, 0, 2, 0], note: '典型痰湿舌：苔白厚腻、边有齿痕', tags: ['痰湿', '苔白厚腻', '齿痕', '苔滑'] },
  { no: 'TC-0009', source: 'engine', answers: [0, 2, 3, 1, 1, 0, 1, 0], tags: ['湿热', '舌红', '苔黄厚腻'] },
  { no: 'TC-0010', source: 'expert', answers: [0, 3, 3, 1, 1, 0, 1, 2], note: '湿热挟瘀：舌暗红、苔黄厚腻、舌下络脉曲张', tags: ['湿热', '血瘀', '舌暗红', '苔黄厚腻', '舌下络脉曲张'] },
  { no: 'TC-0011', source: 'expert', answers: [0, 4, 0, 0, 0, 0, 0, 2], note: '典型血瘀舌：舌青紫、舌下络脉青紫曲张', tags: ['血瘀', '舌青紫', '舌下络脉曲张'] },
  { no: 'TC-0012', source: 'engine', answers: [0, 3, 0, 0, 0, 0, 0, 1], tags: ['血瘀', '舌暗红', '舌下络脉偏粗'] },
  { no: 'TC-0013', source: 'engine', answers: [0, 2, 3, 1, 1, 0, 1, 1], tags: ['湿热', '苔黄厚腻'] },
  { no: 'TC-0014', source: 'engine', answers: [0, 3, 4, 3, 0, 1, 1, 1], tags: ['阴虚', '血瘀', '舌暗红', '少苔', '裂纹'] },
  { no: 'TC-0015', source: 'engine', answers: [0, 1, 0, 4, 0, 0, 2, 0], tags: ['阳虚', '舌淡白', '苔水滑'] },
  { no: 'TC-0016', source: 'engine', answers: [1, 0, 0, 0, 1, 0, 1, 0], tags: ['气虚', '胖大舌', '齿痕'] },
  { no: 'TC-0017', source: 'engine', answers: [1, 0, 1, 1, 2, 0, 2, 0], tags: ['痰湿', '胖大舌', '苔厚腻', '齿痕'] },
  { no: 'TC-0018', source: 'engine', answers: [0, 2, 2, 0, 0, 0, 0, 0], tags: ['湿热', '舌红', '苔淡黄'] },
  { no: 'TC-0019', source: 'engine', answers: [1, 3, 1, 1, 2, 0, 2, 2], tags: ['血瘀', '痰湿', '舌暗红', '苔厚腻', '舌下络脉曲张'] },
  { no: 'TC-0020', source: 'engine', answers: [0, 1, 0, 0, 0, 0, 1, 0], tags: ['阳虚', '舌淡白'] },
]

function labelOf(dimIndex: number, optIndex: number): string {
  return TONGUE_QUESTIONS[dimIndex]?.options[optIndex]?.label ?? ''
}

const esc = (s: string) => String(s).replace(/'/g, "''")

export interface DerivedCase {
  no: string
  source: 'engine' | 'expert'
  features: Record<string, string>
  answers: number[]
  primaryKey: string
  secondaryKey: string | null
  healthIndex: number
  band: 'low' | 'mid' | 'high'
  confidence: number
  tags: string[]
  note: string | null
}

/** 用真实引擎为一条案例派生全部指标（与 App 展示同源，避免漂移） */
export function deriveCase(c: SeedCase): DerivedCase {
  const a = analyzeTongue(c.answers, { source: c.source === 'expert' ? 'manual' : 'engine' })
  const idx = computeHealthIndex(a, a.confidence)
  const features: Record<string, string> = {}
  TONGUE_QUESTIONS.forEach((q, i) => {
    const label = labelOf(i, c.answers[i])
    if (label) features[q.id] = label
  })
  return {
    no: c.no,
    source: c.source,
    features,
    answers: c.answers,
    primaryKey: a.primary.key,
    secondaryKey: a.secondary?.key ?? null,
    healthIndex: idx.score,
    band: idx.band,
    confidence: a.confidence,
    tags: Array.from(new Set(c.tags)),
    note: c.note ?? null,
  }
}

/** 仅当以本脚本直接运行时才输出 SQL；被其它脚本 import 时不触发（避免副作用） */
if (process.argv.join(' ').includes('gen_tongue_cases_seed')) {
  const lines: string[] = []
  for (const c of CASES) {
    const d = deriveCase(c)
    const values = [
      `'${d.no}'`,
      `'${d.source}'`,
      `'${esc(JSON.stringify(d.features))}'::jsonb`,
      `ARRAY[${d.answers.join(',')}]`,
      `'${d.primaryKey}'`,
      d.secondaryKey ? `'${d.secondaryKey}'` : 'null',
      d.healthIndex.toFixed(1),
      `'${d.band}'`,
      d.confidence.toFixed(2),
      `ARRAY[${d.tags.map((t) => `'${esc(t)}'`).join(',')}]`,
      d.note ? `'${esc(d.note)}'` : 'null',
    ]
    lines.push(`  (${values.join(', ')})`)
  }
  console.log('-- === 以下由 src/scripts/gen_tongue_cases_seed.ts 生成，请勿手改 ===')
  console.log(
    'insert into public.tongue_cases\n' +
      '  (case_no, source, features, answers, constitution_primary, constitution_secondary,\n' +
      '   health_index, band, confidence, tags, expert_note)\nvalues',
  )
  console.log(lines.join(',\n') + '\non conflict (case_no) do nothing;')
}
