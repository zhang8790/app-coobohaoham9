/**
 * 规则引擎白盒验证（非 AI · 纯本地）
 * 用真实 calculateTongueResult / calculateResult 跑典型场景，验证体质输出合理。
 * 运行：node_modules/.bin/tsx src/utils/food-therapy/__test_engines.ts
 */
import {
  TONGUE_QUESTIONS,
  calculateTongueResult,
} from '@/utils/food-therapy/tongue-rules'
import {
  TEST_QUESTIONS,
  calculateResult,
  CONSTITUTION_TYPES,
} from '@/utils/constitution-test'

let pass = 0
let fail = 0
const failMsgs: string[] = []

function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++
  } else {
    fail++
    failMsgs.push(msg)
  }
}

function labelsOf(qs: { options: { label: string }[] }[], answers: number[]): string[] {
  return answers.map((a, i) => qs[i].options[a]?.label ?? '(未答)')
}

// ── 舌象自检：5 题顺序 = color, coat_color, coat_texture, teeth, moist ──
const tongueScenarios: { name: string; answers: number[]; expectPrimary?: string }[] = [
  { name: '全部中性（健康基线）', answers: [0, 0, 0, 0, 0], expectPrimary: 'pinghe' },
  { name: '阳虚+气虚（淡白舌/水滑/胖大齿痕）', answers: [1, 0, 4, 2, 2], expectPrimary: 'yangxu' },
  { name: '阴虚（红舌/少苔/干）', answers: [2, 4, 3, 0, 1], expectPrimary: 'yinxu' },
  { name: '湿热+痰湿（暗红/黄厚腻/厚腻/齿痕）', answers: [3, 3, 1, 2, 2], expectPrimary: 'tanshi' },
  { name: '痰湿（白厚苔/厚腻/齿痕/滑腻）', answers: [0, 1, 1, 2, 2], expectPrimary: 'tanshi' },
  { name: '血瘀（青紫舌，其余中性）', answers: [4, 0, 0, 0, 0] },
  { name: '气虚（齿痕为主）', answers: [0, 0, 0, 2, 0], expectPrimary: 'qixu' },
]

console.log('\n================ 舌象自检引擎 (calculateTongueResult) ================')
for (const s of tongueScenarios) {
  const r = calculateTongueResult(s.answers)
  const top = Object.entries(r.scores)
    .filter(([k]) => k !== 'pinghe')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${CONSTITUTION_TYPES[k]?.name ?? k}:${v}`)
    .join('  ')
  console.log(`\n【${s.name}】`)
  console.log('  勾选: ' + labelsOf(TONGUE_QUESTIONS, s.answers).join(' | '))
  console.log(`  主体质: ${r.primary.name}${r.secondary ? '  次体质: ' + r.secondary.name : ''}`)
  console.log('  计分Top3: ' + (top || '(均0→平和兜底)'))

  assert(r.primary && 'key' in r.primary, `${s.name}: 主体质无效`)
  assert(
    Object.values(r.scores).every((v) => v >= 0),
    `${s.name}: 出现负分`,
  )
  if (s.expectPrimary) {
    assert(
      r.primary.key === s.expectPrimary,
      `${s.name}: 期望 ${s.expectPrimary} 实得 ${r.primary.key}`,
    )
  }
  // 次体质规则：第2名≥4 且分差≤5
  if (r.secondary) {
    const biased = Object.entries(r.scores)
      .filter(([k]) => k !== 'pinghe')
      .sort((a, b) => b[1] - a[1])
    const second = biased[1]
    assert(second && second[1] >= 4 && biased[0][1] - second[1] <= 5, `${s.name}: 次体质规则被违反`)
  }
}

// ── 体质问卷：5 题顺序 = 怕冷/上火/消化/面色/情绪 ──
const testScenarios: { name: string; answers: number[]; expectPrimary?: string }[] = [
  { name: '全部中性（健康基线）', answers: [0, 0, 0, 0, 0], expectPrimary: 'pinghe' },
  { name: '阳虚（常年怕冷）', answers: [3, 0, 0, 0, 0], expectPrimary: 'yangxu' },
  { name: '阴虚（口干咽干）', answers: [0, 2, 0, 0, 0], expectPrimary: 'yinxu' },
  { name: '气虚+痰湿（腹胀便黏）', answers: [0, 0, 3, 0, 0], expectPrimary: 'tanshi' },
  { name: '血瘀（唇暗瘀青）', answers: [0, 0, 0, 3, 0], expectPrimary: 'xueyu' },
  { name: '气郁（情绪大）', answers: [0, 0, 0, 0, 3], expectPrimary: 'qiyu' },
  { name: '阳虚+血瘀混合', answers: [3, 0, 0, 3, 0], expectPrimary: 'xueyu' },
]

console.log('\n================ 体质问卷引擎 (calculateResult) ================')
for (const s of testScenarios) {
  const r = calculateResult(s.answers)
  const top = Object.entries(r.scores)
    .filter(([k]) => k !== 'pinghe')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${CONSTITUTION_TYPES[k]?.name ?? k}:${v}`)
    .join('  ')
  console.log(`\n【${s.name}】`)
  console.log('  勾选: ' + labelsOf(TEST_QUESTIONS, s.answers).join(' | '))
  console.log(`  主体质: ${r.primary.name}${r.secondary ? '  次体质: ' + r.secondary.name : ''}`)
  console.log('  计分Top3: ' + (top || '(均0→平和兜底)'))

  assert(r.primary && 'key' in r.primary, `${s.name}: 主体质无效`)
  assert(Object.values(r.scores).every((v) => v >= 0), `${s.name}: 出现负分`)
  if (s.expectPrimary) {
    assert(r.primary.key === s.expectPrimary, `${s.name}: 期望 ${s.expectPrimary} 实得 ${r.primary.key}`)
  }
}

console.log('\n================ 结果 ================')
console.log(`PASS: ${pass}   FAIL: ${fail}`)
if (fail > 0) {
  console.log('失败项:')
  failMsgs.forEach((m) => console.log('  ✗ ' + m))
  process.exit(1)
} else {
  console.log('✓ 全部断言通过')
}
