/**
 * commission.test.ts — 分佣 V5 纯函数单测（deno test）
 *
 * 运行：deno test supabase/functions/_shared/commission.test.ts
 */
import { assertEquals, assert } from 'jsr:@std/assert@1'
import {
  RANK_TABLE,
  MIN_PLATFORM_RATE_V5,
  ACTIVE_ORDER_STATUSES,
  toFixed4,
  calculateDynamicScore,
  getRankByScore,
  getActiveMultiplier,
  getRecruitMultiplier,
  calcWithholdingTax,
  allocCommission,
  normalizeDistribution,
} from './commission.ts'

// ---- 段位判定 ----
Deno.test('getRankByScore 高→低取首个满足门槛', () => {
  assertEquals(getRankByScore(25000).rank, '无心境') // ≥20000
  assertEquals(getRankByScore(6000).rank, '悟心') // ≥6000
  assertEquals(getRankByScore(2000).rank, '静心')
  assertEquals(getRankByScore(800).rank, '明心')
  assertEquals(getRankByScore(200).rank, '初心')
  assertEquals(getRankByScore(0).rank, '凡心') // 兜底
  assertEquals(getRankByScore(-100).rank, '凡心') // 负分兜底到最低段位
})

// ---- 动态分数 ----
Deno.test('calculateDynamicScore 近6月滚动 1:1', () => {
  assertEquals(calculateDynamicScore(19999.999), 20000)
  assertEquals(calculateDynamicScore(0), 0)
  assertEquals(calculateDynamicScore(undefined as any), 0)
})

// ---- 活跃系数 ----
Deno.test('getActiveMultiplier 30天/60天/暂停', () => {
  assertEquals(getActiveMultiplier(1, 0), 1.0) // 近30天有成交
  assertEquals(getActiveMultiplier(0, 1), 0.5) // 30~60天有（宽限）
  assertEquals(getActiveMultiplier(0, 0), 0) // 连续60天无 → 暂停
})

// ---- 拓新衰减 ----
Deno.test('getRecruitMultiplier 衰减', () => {
  assertEquals(getRecruitMultiplier(null), 1.0) // 从未拓新不惩罚
  assertEquals(getRecruitMultiplier(30), 1.0) // ≤90天
  assertEquals(getRecruitMultiplier(120), 0.4) // >90天衰减
})

// ---- 代扣个税（劳务报酬）----
Deno.test('calcWithholdingTax 免征额 + 两档', () => {
  assertEquals(calcWithholdingTax(500), 0) // ≤800 不征
  assertEquals(calcWithholdingTax(800), 0) // 边界不征
  assertEquals(calcWithholdingTax(1000), (1000 - 800) * 0.2) // =40，≤4000 档
  assertEquals(calcWithholdingTax(5000), 5000 * 0.8 * 0.2) // =800，>4000 档
})

// ---- 通道费/个税按金额分摊 ----
Deno.test('allocCommission 按比例分摊', () => {
  // 该行 50，现金总额 100，通道费 10，税 0 → 该行摊 5 通道费、净额 45
  const r = allocCommission(50, 100, 10, 0)
  assertEquals(r.channelFee, 5)
  assertEquals(r.taxWithheld, 0)
  assertEquals(r.net, 45)
  // 现金总额 0 或行额 0 → 不摊
  assertEquals(allocCommission(50, 0, 10, 0).net, 50)
})

// ---- 归一化分配：平台恒抽 10% ----
Deno.test('normalizeDistribution 平台恒抽 10%、三方比例归一', () => {
  // 无心境 raw: buyer 0.30, l1 0.50, l2 0.20 → 和 1.0 → 比例 0.3/0.5/0.2
  const d = normalizeDistribution(1000, 0.30, 0.50, 0.20)
  assertEquals(d.platformIncome, 100) // 1000 * 10%
  assertEquals(d.commissionPool, 900)
  assert(Math.abs(d.fracBuyer - 0.3) < 1e-9)
  assert(Math.abs(d.fracL1 - 0.5) < 1e-9)
  assert(Math.abs(d.fracL2 - 0.2) < 1e-9)
  // 比例之和 = 1
  assert(Math.abs(d.fracBuyer + d.fracL1 + d.fracL2 - 1) < 1e-9)

  // raw 之和 ≠ 1（如凡心 0.85）也必须归一、平台仍 10%
  const d2 = normalizeDistribution(1000, 0.30, 0.40, 0.15)
  assertEquals(d2.platformIncome, 100)
  assert(Math.abs(d2.fracBuyer + d2.fracL1 + d2.fracL2 - 1) < 1e-9)
})

// ---- 有效成交状态枚举（防 22P02 越界）----
Deno.test('ACTIVE_ORDER_STATUSES 不含非法枚举', () => {
  for (const bad of ['paid', 'used', 'pending_pay', 'cancelled', 'after_sale']) {
    assert(!(ACTIVE_ORDER_STATUSES as readonly string[]).includes(bad), `不应含 ${bad}`)
  }
  for (const ok of ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup']) {
    assert((ACTIVE_ORDER_STATUSES as readonly string[]).includes(ok), `应含 ${ok}`)
  }
})

// ---- 常量 ----
Deno.test('MIN_PLATFORM_RATE_V5 = 0.10 且段位表 6 档', () => {
  assertEquals(MIN_PLATFORM_RATE_V5, 0.1)
  assertEquals(RANK_TABLE.length, 6)
  assertEquals(toFixed4(0.12345), 0.1235)
})
