import {
  toFixed4, REFUNDABLE_STATUSES, isRefundableStatus, computeRefundableAmount,
  computeWechatRefundTotalCents, computeWxRefundAmount, computeBeanPortion,
  mapPayModeToPaymentMethod, computeWeightedRate,
} from './money.ts'
import {
  RANK_TABLE, MIN_PLATFORM_RATE_V5, getRankByScore, getActiveMultiplier,
  getRecruitMultiplier, calcWithholdingTax, allocCommission, normalizeDistribution,
} from './commission.ts'

let fails = 0
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.error(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
  else console.log(`ok   ${label} = ${JSON.stringify(got)}`)
}

// ---- money invariants ----
eq('wechatRefundTotalCents(100,30)', computeWechatRefundTotalCents(100, 30), 7000)
eq('wechatRefundTotalCents(100,0)', computeWechatRefundTotalCents(100, 0), 10000)
eq('wechatRefundTotalCents(0,0)', computeWechatRefundTotalCents(0, 0), 0)
eq('beanPortion(30,50,100)', computeBeanPortion(30, 50, 100), 15)
eq('beanPortion(30,100,100)', computeBeanPortion(30, 100, 100), 30)
eq('wxRefundAmount(50,30,100)', computeWxRefundAmount(50, 30, 100), 3500)
eq('wxRefundAmount(100,0,100)', computeWxRefundAmount(100, 0, 100), 10000)
eq('refundableAmount(100,30)', computeRefundableAmount(100, 30), 70)
eq('refundableAmount(30,100)', computeRefundableAmount(30, 100), 0)
eq('isRefundable(pending_review)', isRefundableStatus('pending_review'), true)
eq('isRefundable(pending_pay)', isRefundableStatus('pending_pay'), false)
eq('isRefundable(after_sale)', isRefundableStatus('after_sale'), false)
eq('isRefundable(pending_pickup)', isRefundableStatus('pending_pickup'), true)
eq('whitelist len', REFUNDABLE_STATUSES.length, 5)
eq('payMode pure_gold', mapPayModeToPaymentMethod('pure_gold'), 'emotion_beans')
eq('payMode hybrid', mapPayModeToPaymentMethod('hybrid'), 'wxpay')
eq('payMode wxpay', mapPayModeToPaymentMethod('wxpay'), 'wxpay')
eq('weightedRate mixed', computeWeightedRate(
  [{ price: 10, quantity: 1, product_id: 'a' }, { price: 10, quantity: 1, product_id: 'b' }],
  { a: 9, b: 0 }, 0.09), 0.09)
eq('weightedRate storeFallback', computeWeightedRate(
  [{ price: 10, quantity: 1, product_id: 'a' }], {}, 0.09), 0.09)
eq('toFixed4', toFixed4(0.123456), 0.1235)

// ---- commission invariants ----
eq('rank 25000 => 无心境', getRankByScore(25000).rank, '无心境')
eq('rank 0 => 凡心', getRankByScore(0).rank, '凡心')
eq('rank 6000 => 悟心', getRankByScore(6000).rank, '悟心')
eq('activeMult 30d', getActiveMultiplier(1, 0), 1.0)
eq('activeMult 30-60', getActiveMultiplier(0, 1), 0.5)
eq('activeMult idle', getActiveMultiplier(0, 0), 0)
eq('recruitMult null', getRecruitMultiplier(null), 1.0)
eq('recruitMult >90', getRecruitMultiplier(120), 0.4)
eq('recruitMult <=90', getRecruitMultiplier(30), 1.0)
eq('tax <=800', calcWithholdingTax(800), 0)
eq('tax 1000', calcWithholdingTax(1000), 40)
eq('tax 5000', calcWithholdingTax(5000), 800) // 5000*0.8*0.2
eq('allocCommission', allocCommission(50, 100, 6, 20), { channelFee: 3, taxWithheld: 10, net: 37 })
const nd = normalizeDistribution(100, 30, 40, 20)
eq('normalized platform', nd.platformIncome, 10)
eq('normalized commissionPool', nd.commissionPool, 90)
eq('normalized frac sum', toFixed4(nd.fracBuyer + nd.fracL1 + nd.fracL2), 1)
eq('MIN_PLATFORM_RATE_V5', MIN_PLATFORM_RATE_V5, 0.10)
eq('RANK_TABLE len', RANK_TABLE.length, 6)

console.log(fails === 0 ? '\nALL MONEY/COMMISSION INVARIANTS PASS' : `\n${fails} FAILURES`)
if (fails > 0) (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1
