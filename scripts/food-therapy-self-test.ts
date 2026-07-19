// 食材食疗智能导购引擎 —— 逻辑自测（纯函数，无需网络）
// 运行：node_modules/.bin/tsx scripts/food-therapy-self-test.ts
import {
  normalizeNature,
  aggregateNatureFromIngredients,
  resolveNature,
  resolveSymptomRule,
  scoreFoodTherapy,
  scoreEmotion,
  buildProductFit,
  groupByTier,
  checkCartConflicts,
  buildAuxRemind,
  generateMarketingCopy,
  toFoodTherapyInput,
  classifyProduct,
  classifyProducts,
  HEALTH_TAGS,
  EMOTION_TAGS,
} from '../src/utils/food-therapy'

let pass = 0
let fail = 0
function assert(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.error(`  ✗ ${label}`, extra ?? '')
  }
}

console.log('\n=== 1. 性味归一化与聚合 ===')
assert('字典「寒」→ 寒凉', normalizeNature('寒') === '寒凉')
assert('字典「凉」→ 寒凉', normalizeNature('凉') === '寒凉')
assert('字典「温」→ 温热', normalizeNature('温') === '温热')
assert('方案「平性」直接识别', normalizeNature('平性') === '平性')
assert('空值返回 null', normalizeNature(null) === null)

// 一碗姜汤（生姜温 + 红枣温）→ 应当偏温热
const warmAgg = aggregateNatureFromIngredients(['jiang', 'hongzao'])
assert('姜+红枣 聚合为温热', warmAgg === '温热', warmAgg)
// 绿豆汤（绿豆寒 + 梨凉）→ 偏寒凉
const coolAgg = aggregateNatureFromIngredients(['lvdou', 'li'])
assert('绿豆+梨 聚合为寒凉', coolAgg === '寒凉', coolAgg)

console.log('\n=== 2. 人群症状规则解析 ===')
assert('「经期」→ menstruation', resolveSymptomRule('我现在经期肚子疼')?.id === 'menstruation')
assert('「熬夜」→ scene-stayup', resolveSymptomRule('昨晚又熬夜了')?.id === 'scene-stayup')
assert('「咽喉干痒」→ throat-sore', resolveSymptomRule('咽喉干痒想清嗓子')?.id === 'throat-sore')
assert('「火锅吃撑了」→ scene-greasy', resolveSymptomRule('火锅吃撑了解腻')?.id === 'scene-greasy')
assert('空文本 → null', resolveSymptomRule('') === null)

console.log('\n=== 3. 单品适配打分（双维度）===')
const menstrualRule = resolveSymptomRule('经期')!
// 红糖姜茶：温中散寒 + 补气养血，温热性味 → 应高适配
const gingerTea = toFoodTherapyInput({
  id: 'p1', name: '红糖姜茶',
  ingredients: ['jiang', 'hongzao'],
  overall_nature: '温热',
  health_tag: ['温中散寒', '补气养血'],
  emotion_tag: ['温暖陪伴', '治愈放松', '小确幸'],
} as any)
const fitTea = buildProductFit(gingerTea, menstrualRule)
assert('红糖姜茶 经期适配分>=85（优先推荐）', fitTea.foodTherapy.score >= 85, fitTea.foodTherapy)
assert('红糖姜茶 分档=recommend', fitTea.foodTherapy.tier === 'recommend', fitTea.foodTherapy.tier)
assert('情绪维度有分', fitTea.emotion.score > 0, fitTea.emotion)
assert('summary 含「食疗适配」', fitTea.summary.includes('食疗适配'))

// 冰镇绿豆沙：寒凉 + 清热降火 → 经期应为不建议
const greenBean = toFoodTherapyInput({
  id: 'p2', name: '冰镇绿豆沙',
  ingredients: ['lvdou'],
  overall_nature: '寒凉',
  health_tag: ['清热降火'],
  emotion_tag: ['清爽解压'],
} as any)
const fitBean = buildProductFit(greenBean, menstrualRule)
assert('冰镇绿豆沙 经期适配分<30（不建议）', fitBean.foodTherapy.score < 30, fitBean.foodTherapy)
assert('冰镇绿豆沙 分档=avoid', fitBean.foodTherapy.tier === 'avoid', fitBean.foodTherapy.tier)
assert('命中禁忌标签减分记录', fitBean.foodTherapy.minus.some((m) => m.includes('禁忌')), fitBean.foodTherapy.minus)

console.log('\n=== 4. 购物车冲突校验 ===')
const cart = [
  toFoodTherapyInput({ id: 'a', name: '羊肉汤', overall_nature: '温热', health_tag: ['温中散寒'] } as any),
  toFoodTherapyInput({ id: 'b', name: '姜母鸭', overall_nature: '大热', health_tag: ['温中散寒'] } as any),
  toFoodTherapyInput({ id: 'c', name: '冰镇绿豆沙', overall_nature: '寒凉', health_tag: ['清热降火'] } as any),
  toFoodTherapyInput({ id: 'd', name: '红糖姜茶', overall_nature: '温热', health_tag: ['温中散寒', '补气养血'] } as any),
]
const conflicts = checkCartConflicts(cart)
const types = conflicts.map((c) => c.type)
assert('检出 温补叠加', types.includes('warm_overlap'), types)
assert('检出 寒热对冲', types.includes('cold_hot_clash'), types)
// 同属性过量（3+ 份温中散寒）
const overload = checkCartConflicts([
  toFoodTherapyInput({ id: 'x', name: 'A', health_tag: ['温中散寒'] } as any),
  toFoodTherapyInput({ id: 'y', name: 'B', health_tag: ['温中散寒'] } as any),
  toFoodTherapyInput({ id: 'z', name: 'C', health_tag: ['温中散寒'] } as any),
])
assert('检出 同属性过量', overload.some((c) => c.type === 'same_attr_overload'), overload)
// 显式相克
const explicit = checkCartConflicts([
  toFoodTherapyInput({ id: 'm', name: '甲', conflict_goods: ['n'] } as any),
  toFoodTherapyInput({ id: 'n', name: '乙' } as any),
])
assert('检出 显式相克', explicit.some((c) => c.type === 'explicit_conflict'), explicit)

console.log('\n=== 5. 辅料自适应 + 营销素材 ===')
const aux = buildAuxRemind(greenBean, menstrualRule)
assert('经期寒凉品 给温中加料建议', aux.includes('姜') || aux.includes('红枣'), aux)
const mk = generateMarketingCopy(gingerTea, menstrualRule)
assert('销售话术非空', mk.short_sales_word.length > 0, mk.short_sales_word)
assert('风险提醒含合规声明', mk.risk_tip.includes('不替代医嘱'), mk.risk_tip)
assert('海报模板含主标题', mk.poster_template.includes('主标题'), mk.poster_template)

console.log('\n=== 6. 分组与标签库完整性 ===')
const grouped = groupByTier([fitTea, fitBean])
assert('分组 recommend 含姜茶', grouped.recommend.some((f) => f.productId === 'p1'))
assert('分组 avoid 含绿豆沙', grouped.avoid.some((f) => f.productId === 'p2'))
assert('食疗标签库 9 项', HEALTH_TAGS.length === 9, HEALTH_TAGS.length)
assert('情绪标签库 8 项', EMOTION_TAGS.length === 8, EMOTION_TAGS.length)

console.log('\n=== 7. 纯函数分类器（人群+场景 → 三栏）===')
const chickenSoup = toFoodTherapyInput({
  id: 'ck', name: '黄芪红参鸡汤',
  rec_crowds: ['宫寒量少', '体虚怕冷'],
  forbidden_crowds: ['经期量大', '痛风'],
  cautious_crowds: [],
  scenes: ['经期调理', '秋冬降温', '术后恢复', '熬夜工作'],
} as any)
const greenBean2 = toFoodTherapyInput({
  id: 'gb', name: '冰镇绿豆沙',
  rec_crowds: [], cautious_crowds: [],
  forbidden_crowds: ['宫寒量少', '脾胃虚寒'],
  scenes: ['饭后解腻', '单人简餐'],
} as any)
const hotpot = toFoodTherapyInput({
  id: 'hp', name: '麻辣火锅',
  rec_crowds: [], cautious_crowds: ['易上火', '喉咙肿痛'],
  forbidden_crowds: [], scenes: ['单人简餐'],
} as any)

// 宫寒量少 + 经期调理场景 → 鸡汤三星推荐，绿豆沙不建议
assert('宫寒量少+经期调理：鸡汤=recommend',
  classifyProduct(chickenSoup, ['宫寒量少'], '经期调理') === 'recommend')
assert('宫寒量少+经期调理：绿豆沙=avoid',
  classifyProduct(greenBean2, ['宫寒量少'], '经期调理') === 'avoid')
// 易上火 → 火锅=caution
assert('易上火：火锅=caution', classifyProduct(hotpot, ['易上火'], null) === 'caution')
// 未勾选人群 → null（不进任何栏）
assert('未勾选人群 → null', classifyProduct(chickenSoup, [], null) === null)
// 优先级：同一人既在 rec 又在 forbidden → avoid 覆盖
assert('rec+forbidden 同选 → avoid 优先',
  classifyProduct(chickenSoup, ['宫寒量少', '经期量大'], '经期调理') === 'avoid')
// 批量分组
const grouped2 = classifyProducts([chickenSoup, greenBean2, hotpot], ['宫寒量少'], '经期调理')
assert('分组 recommend 含鸡汤', grouped2.recommend.some(p => p.id === 'ck'))
assert('分组 avoid 含绿豆沙', grouped2.avoid.some(p => p.id === 'gb'))
assert('分组 caution 为空（本组无人命中）', grouped2.caution.length === 0)

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`)
if (fail > 0) process.exit(1)
