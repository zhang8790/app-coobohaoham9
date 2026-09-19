/**
 * money.test.ts — 资金流纯函数单测（deno test）
 *
 * 与 `_sanity.ts`（node 可跑）互为补充：这里用 Deno 标准测试框架覆盖
 * 全部金额口径不变量 + 边界，作为 CI 的硬门禁。
 *
 * 运行：deno test supabase/functions/_shared/money.test.ts
 */
import { assertEquals, assert } from 'jsr:@std/assert@1'
import {
  toFixed4,
  REFUNDABLE_STATUSES,
  isRefundableStatus,
  mapPayModeToPaymentMethod,
  computeRefundableAmount,
  computeWechatRefundTotalCents,
  computeWxRefundAmount,
  computeBeanPortion,
  computeWeightedRate,
  beanUsedForSubOrder,
} from './money.ts'

// ---- toFixed4 精度 ----
Deno.test('toFixed4 万分位四舍五入', () => {
  assertEquals(toFixed4(10.12345), 10.1235)
  assertEquals(toFixed4(10.12344), 10.1234)
  assertEquals(toFixed4(0), 0)
})

// ---- 可退款状态白名单 ----
Deno.test('isRefundableStatus 白名单', () => {
  for (const s of REFUNDABLE_STATUSES) {
    assert(isRefundableStatus(s), `状态 ${s} 应可退`)
  }
  // 排除项
  for (const bad of ['pending_pay', 'cancelled', 'after_sale', 'paid', null, undefined, '']) {
    assert(!isRefundableStatus(bad as any), `状态 ${bad} 不应可退`)
  }
})

// ---- payment_method 映射 ----
Deno.test('mapPayModeToPaymentMethod 映射', () => {
  assertEquals(mapPayModeToPaymentMethod('pure_gold'), 'emotion_beans')
  assertEquals(mapPayModeToPaymentMethod('hybrid'), 'wxpay')
  assertEquals(mapPayModeToPaymentMethod('wxpay'), 'wxpay')
})

// ---- 可退金额 ----
Deno.test('computeRefundableAmount 全额减已退，下限 0', () => {
  assertEquals(computeRefundableAmount(100, 30), 70)
  assertEquals(computeRefundableAmount(100, 0), 100)
  // 已退超过全额 → 0（不返负）
  assertEquals(computeRefundableAmount(100, 120), 0)
  // 空值兜底
  assertEquals(computeRefundableAmount(null as any, undefined as any), 0)
})

// 🔴 微信退款交易额（分）—— 头号资损不变量
Deno.test('computeWechatRefundTotalCents 头号不变量 (total - tb_used)*100', () => {
  // 混合支付：订单 100 元、健康豆抵扣 30 → 微信实付 70 → 7000 分
  assertEquals(computeWechatRefundTotalCents(100, 30), 7000)
  // 纯微信：100 元、无抵扣 → 10000 分
  assertEquals(computeWechatRefundTotalCents(100, 0), 10000)
  // 关键反例：误传 total*100（含健康豆）会得 10000，被微信拒付 → 必须得 7000
  assert(computeWechatRefundTotalCents(100, 30) !== 100 * 100)
  // 空值兜底
  assertEquals(computeWechatRefundTotalCents(null as any, undefined as any), 0)
})

// ---- 本次微信退款金额（分）----
Deno.test('computeWxRefundAmount 本次微信退款 = (退款额 - 健康豆占比)*100', () => {
  // 退款 70，其中健康豆占比 30/100=30% → 健康豆部分 21，微信部分 49 → 4900 分
  assertEquals(computeWxRefundAmount(70, 30, 100), 4900)
  // 纯健康豆单全额退：退款 100、tb 100 → 微信部分 0
  assertEquals(computeWxRefundAmount(100, 100, 100), 0)
  // 下限 0
  assertEquals(computeWxRefundAmount(-5, 30, 100), 0)
})

// ---- 应返还健康豆（元）----
Deno.test('computeBeanPortion 应返还健康豆 = tb_used * 退款占比', () => {
  assertEquals(computeBeanPortion(30, 70, 100), 21)
  assertEquals(computeBeanPortion(100, 100, 100), 100)
  assertEquals(computeBeanPortion(30, 0, 100), 0)
  // 总额 0 时按整笔返还（兜底）
  assertEquals(computeBeanPortion(30, 70, 0), 30)
})

// ---- 加权混合让利率 ----
Deno.test('computeWeightedRate 金额加权平均', () => {
  // p1 单价 10 数量 2 = 20 元，discount_rate=10(10%)；p2 单价 20 数量 1=20 元，rate=0 → 加权 (20*0.1+20*0)/40 = 0.05
  const items = [
    { price: 10, quantity: 2, product_id: 'p1' },
    { price: 20, quantity: 1, product_id: 'p2' },
  ]
  const rateMap = { p1: 10, p2: 0 }
  assertEquals(computeWeightedRate(items, rateMap, 0.09), 0.05)
  // 无 rateMap → 全部回退门店率 0.09
  assertEquals(computeWeightedRate(items, {}, 0.09), 0.09)
  // 空商品 → 0
  assertEquals(computeWeightedRate([], {}, 0.09), 0)
})

// ---- 跨门店拆单健康豆只记首单 ----
Deno.test('beanUsedForSubOrder 仅首单记健康豆', () => {
  assertEquals(beanUsedForSubOrder(true, 50), 50)
  assertEquals(beanUsedForSubOrder(false, 50), 0)
})
