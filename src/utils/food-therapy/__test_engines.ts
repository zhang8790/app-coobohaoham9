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
import {
  computeHealthIndex,
  getMechanism,
  TONGUE_MECHANISM,
} from '@/utils/food-therapy/tongue-report'
import { hasForbidden } from '@/utils/compliance/shield'

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

// ── 舌象自检：8 维顺序 = area, color, coat_color, coat_texture, teeth, crack, moist, sublingual ──
const tongueScenarios: { name: string; answers: number[]; expectPrimary?: string }[] = [
  { name: '全部中性（健康基线）', answers: [0, 0, 0, 0, 0, 0, 0, 0], expectPrimary: 'pinghe' },
  { name: '阳虚+气虚（淡白舌/水滑/胖大齿痕）', answers: [1, 1, 0, 4, 2, 0, 2, 0], expectPrimary: 'yangxu' },
  { name: '阴虚（红舌/少苔/干）', answers: [0, 2, 4, 3, 0, 0, 1, 0], expectPrimary: 'yinxu' },
  { name: '湿热+痰湿（暗红/黄厚腻/厚腻/齿痕）', answers: [0, 3, 3, 1, 2, 0, 2, 0], expectPrimary: 'tanshi' },
  { name: '痰湿（白厚苔/厚腻/齿痕/滑腻）', answers: [0, 0, 1, 1, 2, 0, 2, 0], expectPrimary: 'tanshi' },
  { name: '血瘀（青紫舌，其余中性）', answers: [0, 4, 0, 0, 0, 0, 0, 0] },
  { name: '气虚（齿痕为主）', answers: [0, 0, 0, 0, 2, 0, 0, 0], expectPrimary: 'qixu' },
  { name: '血瘀（青紫舌 + 舌下青紫略粗）', answers: [0, 4, 0, 0, 0, 0, 0, 1], expectPrimary: 'xueyu' },
  { name: '血瘀（舌下青筋明显曲张）', answers: [0, 0, 0, 0, 0, 0, 0, 2], expectPrimary: 'xueyu' },
  // 新增：覆盖 area（舌体形态）/ crack（裂纹）两个新维度
  { name: '阴虚裂纹（红舌/少苔/有裂纹/干）', answers: [0, 2, 4, 0, 0, 1, 1, 0], expectPrimary: 'yinxu' },
  { name: '气虚胖大（胖大舌 + 明显齿痕）', answers: [1, 0, 0, 0, 2, 0, 0, 0], expectPrimary: 'qixu' },
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

// ── 舌象「全面分析报告」：健康指数算法 ──
console.log('\n================ 舌象健康指数 (computeHealthIndex) ================')

/** 构造最小 TongueResult（主 + 可选兼有 + 计分） */
function mkResult(pKey: string, P: number, secKey?: string, Q = 0): any {
  const scores: Record<string, number> = { [pKey]: P }
  if (secKey) scores[secKey] = Q
  return {
    primary: CONSTITUTION_TYPES[pKey],
    secondary: secKey ? CONSTITUTION_TYPES[secKey] : undefined,
    scores,
    picked: [],
  }
}

const idxCases: { name: string; r: any; band: 'low' | 'mid' | 'high' }[] = [
  { name: '平和（无偏颇）', r: mkResult('pinghe', 0), band: 'low' },
  { name: '单项 5 分', r: mkResult('shire', 5), band: 'mid' },
  { name: '主 6 分 + 兼 3 分', r: mkResult('shire', 6, 'xueyu', 3), band: 'mid' },
  { name: '主 8 分 + 兼 6 分', r: mkResult('shire', 8, 'xueyu', 6), band: 'high' },
]

for (const c of idxCases) {
  const idx = computeHealthIndex(c.r)
  console.log(`【${c.name}】指数 ${idx.score} → ${idx.bandLabel}（复测 ${idx.retestDays} 天）`)
  assert(idx.score >= 35 && idx.score <= 97, `${c.name}: 指数越界 ${idx.score}`)
  assert(idx.band === c.band, `${c.name}: 期望分级 ${c.band} 实得 ${idx.band}`)
  assert(idx.advice.includes('再次检测'), `${c.name}: 建议句缺少复测提示`)
  assert(idx.retestDays > 0, `${c.name}: 复测天数应 > 0`)
}

// 单调性：主分越高，指数越低
const s3 = computeHealthIndex(mkResult('shire', 3)).score
const s6 = computeHealthIndex(mkResult('shire', 6)).score
const s9 = computeHealthIndex(mkResult('shire', 9)).score
assert(s3 > s6 && s6 > s9, `单调性被破坏: ${s3} / ${s6} / ${s9}`)
console.log(`\n单调性: 3分=${s3} > 6分=${s6} > 9分=${s9} ✓`)

// 夹逼：极端高分被压到下限 35
assert(computeHealthIndex(mkResult('shire', 50)).score === 35, '下限夹逼失败（应=35）')
console.log('下限夹逼: 50 分输入 → 35 分 ✓')

// ── 舌象「发生机制」文案：覆盖 + 合规 ──
console.log('\n================ 舌象发生机制文案 (getMechanism) ================')
for (const key of Object.keys(CONSTITUTION_TYPES)) {
  const m = getMechanism(key)
  const all = [m.general, ...m.items]
  console.log(`【${key}】${m.general}`)
  assert(!!m.general && m.general.length > 4, `${key}: general 缺失`)
  assert(m.items.length >= 3, `${key}: 机制条目不足 3 条`)
  assert(all.every((s) => !hasForbidden(s)), `${key}: 文案命中违禁词 → 会污染界面`)
  assert(all.every((s) => !s.includes('**')), `${key}: 文案含脱敏标记 **`)
}

// 未收录 key 回退平和文案
assert(getMechanism('__unknown__') === TONGUE_MECHANISM.pinghe, '未知体质应回退平和文案')
console.log('未知体质回退平和文案 ✓')

console.log('\n================ 结果 ================')
console.log(`PASS: ${pass}   FAIL: ${fail}`)
if (fail > 0) {
  console.log('失败项:')
  failMsgs.forEach((m) => console.log('  ✗ ' + m))
  process.exit(1)
} else {
  console.log('✓ 全部断言通过')
}
