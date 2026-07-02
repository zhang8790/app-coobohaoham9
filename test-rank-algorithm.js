// 测试六段位算法
const ts = require('typescript')
const fs = require('fs')

// 读取并编译TypeScript文件
const code = fs.readFileSync('src/utils/commission-calculator-v4.ts', 'utf8')
const result = ts.transpileModule(code, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017,
  }
})

// 执行编译后的代码
eval(result.outputText)

console.log('✅ 六段位算法测试\n')

// 测试1：不同动态分数的段位判定
console.log('===== 测试1：段位判定 =====')
const testScores = [0, 300, 800, 2500, 6000, 16000, 55000]
testScores.forEach(score => {
  const rank = getRankByDynamicScore(score)
  console.log(`动态分数 ${score} → 段位：${rank.rank}（L1:${rank.l1CommissionRate*100}%, L2:${rank.l2CommissionRate*100}%, 积分:${rank.pointsRate*100}%）`)
})

// 测试2：完整分佣计算
console.log('\n===== 测试2：分佣计算 =====')
const result = calculateCommissionV4({
  orderAmount: 100,
  discountRate: 0.09,
  referrer1TotalConsumption: 3000,
  referrer1TeamPerformance: 5000,
  referrer1MonthlyConsumption: 50,
  referrer1ConsecutiveZeroMonths: 0,
  referrer1TeamMonthlyGmv: 2000,
  referrer1HasNewRecruit: true,
  referrer1MonthsSinceLastRecruit: 0,
  referrer2TotalConsumption: 500,
  referrer2TeamPerformance: 1000,
  referrer2MonthlyConsumption: 20,
  referrer2ConsecutiveZeroMonths: 0,
  referrer2TeamMonthlyGmv: 500,
  referrer2HasNewRecruit: false,
  referrer2MonthsSinceLastRecruit: 2,
  buyerTotalConsumption: 1000,
  buyerTeamPerformance: 0,
})

console.log('订单金额：', result.orderAmount)
console.log('让利池：', result.discountPool, '（订单×9%）')
console.log('\nL1段位：', result.referrer1Rank, '（动态分数：', result.referrer1DynamicScore, '）')
console.log('L1佣金：', result.level1Commission.toFixed(2), '（', (result.l1Ratio * 100).toFixed(1), '%）')
console.log('\nL2段位：', result.referrer2Rank, '（动态分数：', result.referrer2DynamicScore, '）')
console.log('L2佣金：', result.level2Commission.toFixed(2), '（', (result.l2Ratio * 100).toFixed(1), '%）')
console.log('\n买家段位：', result.buyerRank, '（动态分数：', result.buyerDynamicScore, '）')
console.log('买家积分：', result.buyerPoints.toFixed(2), '（', (result.pointsRatio * 100).toFixed(1), '%）')
console.log('\n平台收入：', result.platformIncome.toFixed(2), '（', (result.platformRate * 100).toFixed(0), '%）')
console.log('\n合计：', (result.level1Commission + result.level2Commission + result.buyerPoints + result.platformIncome).toFixed(2))

// 测试3：验证平台盈利
console.log('\n===== 测试3：平台盈利验证 =====')
const testCases = [
  { name: '躺平不消费', referrer1MonthlyConsumption: 0, referrer1ConsecutiveZeroMonths: 2 },
  { name: '团队流水低', referrer1TeamMonthlyGmv: 500 },
  { name: '正常活跃', referrer1MonthlyConsumption: 50, referrer1HasNewRecruit: true },
]

testCases.forEach(tc => {
  const r = calculateCommissionV4({
    orderAmount: 100,
    discountRate: 0.09,
    referrer1TotalConsumption: 1000,
    referrer1TeamPerformance: 2000,
    referrer1MonthlyConsumption: tc.referrer1MonthlyConsumption || 50,
    referrer1ConsecutiveZeroMonths: tc.referrer1ConsecutiveZeroMonths || 0,
    referrer1TeamMonthlyGmv: tc.referrer1TeamMonthlyGmv || 2000,
    referrer1HasNewRecruit: tc.referrer1HasNewRecruit !== undefined ? tc.referrer1HasNewRecruit : true,
    referrer1MonthsSinceLastRecruit: 0,
    referrer2TotalConsumption: 0,
    referrer2TeamPerformance: 0,
    referrer2MonthlyConsumption: 0,
    referrer2ConsecutiveZeroMonths: 0,
    referrer2TeamMonthlyGmv: 0,
    referrer2HasNewRecruit: false,
    referrer2MonthsSinceLastRecruit: 0,
    buyerTotalConsumption: 100,
    buyerTeamPerformance: 0,
  })
  
  console.log(`\n场景：${tc.name}`)
  console.log(`平台收入：`, r.platformIncome.toFixed(2), '（', (r.platformRate * 100).toFixed(0), '%）')
  console.log(`验证：`, r.platformIncome >= 0 ? '✅ 平台盈利' : '❌ 平台亏损')
})
